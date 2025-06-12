import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

// Constants for consistent styling and colors
const COLORS = {
  PRIMARY: "#ff8c00",
  SUCCESS: "#28a745",
  DANGER: "#ff4444",
  SECONDARY: "#666666",
  INFO: "#0066cc",
  WARNING: "#dc3545",
  WHITE: "white",
  LIGHT_GRAY: "#ccc",
  DARK_GRAY: "#888888",
  TRANSPARENT_BLACK_30: "rgba(0, 0, 0, 0.3)",
  TRANSPARENT_BLACK_70: "rgba(0, 0, 0, 0.7)",
  TRANSPARENT_BLACK_85: "rgba(0, 0, 0, 0.85)",
};

const STYLES = {
  BUTTON_BASE: `
    color: white;
    border-radius: 6px;
    padding: 12px 20px;
    font-size: 14px;
    border: none;
    transition: all 0.2s ease;
  `,
  DIALOG_BORDER: `2px solid ${COLORS.PRIMARY}`,
  DIALOG_PADDING: "30px",
  DIALOG_BORDER_RADIUS: "12px",
};

let button;

// Focus debugging utility function
function debugFocusState(context = "") {
  const prefix = context ? `🔍 ${context} FOCUS DEBUG` : "🔍 FOCUS DEBUG";

  try {
    let currentFocus = global.stage.get_key_focus();
    log(
      `${prefix} - Current stage focus: ${
        currentFocus ? currentFocus.toString() : "NULL"
      }`
    );

    // Try to get active window info using xdotool (X11)
    const [success, stdout] = GLib.spawn_command_line_sync(
      "xdotool getactivewindow"
    );

    if (success && stdout) {
      let windowId = new TextDecoder().decode(stdout).trim();
      log(`${prefix} - Active X11 window ID: ${windowId}`);

      // Get window name
      const [nameSuccess, nameStdout] = GLib.spawn_command_line_sync(
        `xdotool getwindowname ${windowId}`
      );
      if (nameSuccess && nameStdout) {
        let windowName = new TextDecoder().decode(nameStdout).trim();
        log(`${prefix} - Active window name: ${windowName}`);
      }

      return { hasActiveWindow: true, windowId, currentFocus };
    } else {
      // NO ACTIVE WINDOW - this is the problem!
      log(
        `${prefix} - No active X11 window found - this will cause focus issues!`
      );
      return { hasActiveWindow: false, windowId: null, currentFocus };
    }
  } catch (e) {
    log(`${prefix} - Error getting focus info: ${e}`);
    return {
      hasActiveWindow: false,
      windowId: null,
      currentFocus: null,
      error: e,
    };
  }
}

// Helper function to establish X11 focus context when no active window exists
function establishX11FocusContext(callback = null) {
  try {
    // Try to find and focus any available window to establish X11 context
    const [findSuccess, findStdout] = GLib.spawn_command_line_sync(
      "xdotool search --onlyvisible '.*' | head -1"
    );

    if (findSuccess && findStdout) {
      let anyWindowId = new TextDecoder().decode(findStdout).trim();
      if (anyWindowId) {
        log(
          `🔍 FOCUS DEBUG - Found window ${anyWindowId}, focusing it to establish X11 context`
        );
        GLib.spawn_command_line_sync(`xdotool windowfocus ${anyWindowId}`);
        GLib.spawn_command_line_sync(`xdotool windowactivate ${anyWindowId}`);

        if (callback) {
          // Wait a moment for focus to settle
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            callback();
            return false;
          });
          return true; // Indicates callback will be called asynchronously
        }
        return true;
      }
    }
  } catch (e) {
    log(`🔍 FOCUS DEBUG - Error establishing X11 context: ${e}`);
  }

  callback?.(); // Call immediately if we couldn't establish context
  return false;
}

// Helper function to create button styles
function createButtonStyle(baseColor, hoverColor) {
  return {
    normal: `
      background-color: ${baseColor};
      ${STYLES.BUTTON_BASE}
    `,
    hover: `
      background-color: ${hoverColor};
      ${STYLES.BUTTON_BASE}
      transform: scale(1.05);
    `,
  };
}

// Helper function to add hand cursor on button hover
function addHandCursorToButton(button) {
  button.connect("enter-event", () => {
    global.display.set_cursor(Meta.Cursor.POINTING_HAND);
  });

  button.connect("leave-event", () => {
    global.display.set_cursor(Meta.Cursor.DEFAULT);
  });
}

// Helper function to create a button with hover effects
function createHoverButton(label, baseColor, hoverColor) {
  let styles = createButtonStyle(baseColor, hoverColor);
  let button = new St.Button({
    label: label,
    style: styles.normal,
    reactive: true,
    can_focus: true,
    track_hover: true,
  });

  button.connect("enter-event", () => {
    button.set_style(styles.hover);
  });

  button.connect("leave-event", () => {
    button.set_style(styles.normal);
  });

  // Add hand cursor effect
  addHandCursorToButton(button);

  return button;
}

// UI Creation Utilities

// Create a simple text button with hover effects (no background style)
function createTextButton(label, normalColor, hoverColor, options = {}) {
  const baseStyle = `
    font-size: ${options.fontSize || "14px"};
    padding: ${options.padding || "8px"};
    border-radius: 4px;
    transition: all 0.2s ease;
  `;

  let button = new St.Button({
    label: label,
    style: `
      color: ${normalColor};
      ${baseStyle}
      ${options.extraStyle || ""}
    `,
    reactive: true,
    can_focus: true,
    track_hover: true,
    ...(options.buttonProps || {}),
  });

  // Add hover effects
  button.connect("enter-event", () => {
    button.set_style(`
      color: ${hoverColor};
      ${baseStyle}
      ${options.hoverExtraStyle || options.extraStyle || ""}
    `);
  });

  button.connect("leave-event", () => {
    button.set_style(`
      color: ${normalColor};
      ${baseStyle}
      ${options.extraStyle || ""}
    `);
  });

  // Add hand cursor effect
  addHandCursorToButton(button);

  return button;
}

// Create a label with predefined styles
function createStyledLabel(text, style = "normal", customStyle = "") {
  const styles = {
    title: `font-size: 20px; font-weight: bold; color: ${COLORS.WHITE};`,
    subtitle: `font-size: 18px; font-weight: bold; color: ${COLORS.WHITE}; margin-bottom: 10px;`,
    description: `font-size: 14px; color: ${COLORS.LIGHT_GRAY}; margin-bottom: 15px;`,
    normal: `font-size: 14px; color: ${COLORS.WHITE};`,
    small: `font-size: 12px; color: ${COLORS.DARK_GRAY};`,
    icon: `font-size: 28px; margin-right: 8px;`,
  };

  return new St.Label({
    text: text,
    style: `${styles[style] || styles.normal} ${customStyle}`,
  });
}

// Create a vertical box layout with standard spacing
function createVerticalBox(spacing = "15px", marginBottom = "20px") {
  return new St.BoxLayout({
    vertical: true,
    style: `spacing: ${spacing}; margin-bottom: ${marginBottom};`,
  });
}

// Create a horizontal box layout with standard spacing
function createHorizontalBox(spacing = "15px", marginBottom = "15px") {
  return new St.BoxLayout({
    vertical: false,
    style: `spacing: ${spacing}; margin-bottom: ${marginBottom};`,
  });
}

// Create a separator line
function createSeparator() {
  return new St.Widget({
    style: "background-color: #444; height: 1px; margin: 20px 0;",
  });
}

// Resource Management Utilities

// Helper to safely disconnect event handlers
function safeDisconnect(actor, handlerId, handlerName = "handler") {
  try {
    if (actor && handlerId) {
      actor.disconnect(handlerId);
      log(`Disconnected ${handlerName} (ID: ${handlerId})`);
      return true;
    }
  } catch (e) {
    log(`Error disconnecting ${handlerName}: ${e}`);
  }
  return false;
}

// Modal dialog cleanup utility
function cleanupModal(overlay, handlers = {}) {
  try {
    // Disconnect event handlers
    if (handlers.clickHandlerId) {
      safeDisconnect(overlay, handlers.clickHandlerId, "click handler");
    }
    if (handlers.keyPressHandlerId) {
      safeDisconnect(overlay, handlers.keyPressHandlerId, "key press handler");
    }

    // Remove from layout manager
    if (overlay && overlay.get_parent()) {
      Main.layoutManager.removeChrome(overlay);
      log("Modal overlay removed from chrome");
    }

    return true;
  } catch (e) {
    log(`Error cleaning up modal: ${e}`);
    return false;
  }
}

// Process cleanup utility with signal support
function cleanupProcess(pid, signal = "USR1", processName = "process") {
  if (!pid) return false;

  try {
    GLib.spawn_command_line_sync(`kill -${signal} ${pid}`);
    log(`Sent ${signal} signal to ${processName} (PID: ${pid})`);
    return true;
  } catch (e) {
    log(`Error sending ${signal} to ${processName} (PID: ${pid}): ${e}`);
    return false;
  }
}

// Recording state cleanup utility
function cleanupRecordingState(extension, iconResetStyle = "") {
  let cleanedDialog = false;
  let cleanedProcess = false;

  // Clean up dialog
  if (extension.recordingDialog) {
    try {
      extension.recordingDialog.close();
      extension.recordingDialog = null;
      cleanedDialog = true;
      log("Recording dialog cleaned up");
    } catch (e) {
      log(`Error cleaning up recording dialog: ${e}`);
      extension.recordingDialog = null; // Force cleanup even if close fails
    }
  }

  // Clean up process
  if (extension.recordingProcess) {
    cleanedProcess = cleanupProcess(
      extension.recordingProcess,
      "USR1",
      "recording process"
    );
    extension.recordingProcess = null;
  }

  // Reset icon style using optional chaining
  extension.icon?.set_style(iconResetStyle);
  if (extension.icon) {
    log("Icon style reset");
  }

  return { cleanedDialog, cleanedProcess };
}

// Simple recording dialog using custom modal barrier
class RecordingDialog {
  constructor(onStop, onCancel) {
    log("🎯 RecordingDialog constructor called");

    this.onStop = onStop;
    this.onCancel = onCancel;
    // Pulse animation properties removed - no longer needed

    // Create modal barrier that covers the entire screen
    this.modalBarrier = new St.Widget({
      style: `
        background-color: ${COLORS.TRANSPARENT_BLACK_30};
      `,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Set up keyboard event handling for the modal barrier
    this.modalBarrier.connect("key-press-event", (actor, event) => {
      try {
        // Get the key symbol safely
        let keyval = event.get_key_symbol ? event.get_key_symbol() : null;

        if (!keyval) {
          log(`🎯 KEYBOARD EVENT: Could not get key symbol`);
          return Clutter.EVENT_PROPAGATE;
        }

        // Try to get key name safely
        let keyname = "unknown";
        try {
          if (Clutter.get_key_name) {
            keyname = Clutter.get_key_name(keyval) || `keycode-${keyval}`;
          }
        } catch (nameError) {
          keyname = `keycode-${keyval}`;
        }

        log(`🎯 KEYBOARD EVENT RECEIVED: ${keyname} (${keyval})`);

        if (keyval === Clutter.KEY_Escape) {
          // Escape = Cancel (no transcription)
          log(`🎯 Canceling recording via keyboard: ${keyname}`);
          this.close();
          this.onCancel?.();
          return Clutter.EVENT_STOP;
        } else if (
          keyval === Clutter.KEY_space ||
          keyval === Clutter.KEY_Return ||
          keyval === Clutter.KEY_KP_Enter
        ) {
          // Enter/Space = Stop and process (with transcription)
          log(`🎯 Stopping recording via keyboard: ${keyname}`);
          this.close();
          this.onStop?.();
          return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
      } catch (e) {
        log(`🎯 KEYBOARD EVENT ERROR: ${e}`);
        return Clutter.EVENT_STOP;
      }
    });

    this._buildDialog();

    log("🎯 RecordingDialog constructor completed successfully");
  }

  _buildDialog() {
    // Create main dialog container
    this.container = new St.Widget({
      style_class: "recording-dialog",
      style: `
        background-color: ${COLORS.TRANSPARENT_BLACK_85};
        border-radius: ${STYLES.DIALOG_BORDER_RADIUS};
        padding: ${STYLES.DIALOG_PADDING};
        border: ${STYLES.DIALOG_BORDER};
        min-width: 300px;
      `,
      layout_manager: new Clutter.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        spacing: 20,
      }),
      reactive: true,
      can_focus: true,
    });

    // Recording header
    const headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px;",
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
      x_expand: false,
    });

    this.recordingIcon = new St.Label({
      text: "🎤",
      style: "font-size: 48px; text-align: center;",
      y_align: Clutter.ActorAlign.CENTER,
    });

    const recordingLabel = new St.Label({
      text: "Recording...",
      style: `font-size: 20px; font-weight: bold; color: ${COLORS.WHITE};`,
      y_align: Clutter.ActorAlign.CENTER,
    });

    headerBox.add_child(this.recordingIcon);
    headerBox.add_child(recordingLabel);

    // Instructions
    const instructionLabel = new St.Label({
      text: "Speak now\nPress Enter to process, Escape to cancel.",
      style: `font-size: 16px; color: ${COLORS.LIGHT_GRAY}; text-align: center;`,
    });

    // Buttons
    this.stopButton = createHoverButton(
      "Stop Recording",
      COLORS.DANGER,
      "#ff6666"
    );

    this.cancelButton = createHoverButton(
      "Cancel",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );

    // Connect button events
    this.stopButton.connect("clicked", () => {
      log("🎯 Stop button clicked!");
      this.close();
      this.onStop?.();
    });

    this.cancelButton.connect("clicked", () => {
      log("🎯 Cancel button clicked!");
      this.close();
      this.onCancel?.();
    });

    // Add to content box with proper alignment
    this.container.add_child(headerBox);
    headerBox.set_x_align(Clutter.ActorAlign.CENTER);

    this.container.add_child(instructionLabel);
    this.container.add_child(this.stopButton);
    this.container.add_child(this.cancelButton);

    // Add to modal barrier
    this.modalBarrier.add_child(this.container);
  }

  open() {
    log("🎯 Opening custom modal dialog");

    // Add to UI
    Main.layoutManager.addTopChrome(this.modalBarrier);

    // Set barrier to cover entire screen
    const monitor = Main.layoutManager.primaryMonitor;
    this.modalBarrier.set_position(monitor.x, monitor.y);
    this.modalBarrier.set_size(monitor.width, monitor.height);

    // Center the dialog container within the barrier
    this.container.set_position(
      (monitor.width - 300) / 2,
      (monitor.height - 200) / 2
    );

    this.modalBarrier.show();

    // X11 focus solution: Use xdotool to focus GNOME Shell window
    log("🎯 Attempting X11 focus solution");

    // Store reference to modalBarrier for the timeout callback
    const modalBarrierRef = this.modalBarrier;

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      try {
        // Get GNOME Shell's window ID and focus it
        const [success, stdout] = GLib.spawn_command_line_sync(
          'xdotool search --onlyvisible --class "gnome-shell" | head -1'
        );

        if (success && stdout) {
          const windowId = new TextDecoder().decode(stdout).trim();
          log(`🎯 Found GNOME Shell window ID: ${windowId}`);

          if (windowId) {
            // Focus the GNOME Shell window
            GLib.spawn_command_line_sync(`xdotool windowfocus ${windowId}`);
            log(`🎯 Focused GNOME Shell window ${windowId}`);

            // Also try to activate it
            GLib.spawn_command_line_sync(`xdotool windowactivate ${windowId}`);
            log(`🎯 Activated GNOME Shell window ${windowId}`);
          }
        }

        // Now try to focus our modal barrier - but only if it still exists
        if (modalBarrierRef?.get_parent()) {
          modalBarrierRef.grab_key_focus();
          global.stage.set_key_focus(modalBarrierRef);

          // Debug: Check if it worked
          const currentFocus = global.stage.get_key_focus();
          log(
            `🎯 Final focus check: ${
              currentFocus ? currentFocus.toString() : "NULL"
            }`
          );
          log(
            `🎯 Is modal barrier focused? ${currentFocus === modalBarrierRef}`
          );
        } else {
          log(
            `🎯 Modal barrier no longer exists or has no parent - skipping focus`
          );
        }
      } catch (e) {
        log(`⚠️ X11 focus error: ${e}`);
      }

      return false;
    });
  }

  close() {
    log("🎯 Closing custom modal dialog");
    // Animation removed - no more pulsating

    if (this.modalBarrier && this.modalBarrier.get_parent()) {
      Main.layoutManager.removeChrome(this.modalBarrier);

      // Add a small delay before nulling the barrier to ensure X11 focus code has time to run
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        this.modalBarrier = null;
        this.container = null;
        return false; // Don't repeat
      });
    } else {
      this.modalBarrier = null;
      this.container = null;
    }
  }

  // Pulse animation methods removed - no longer needed
}

function runSetupScript(extensionPath) {
  try {
    const setupScript = `${extensionPath}/scripts/setup_env.sh`;
    const file = Gio.File.new_for_path(setupScript);

    // Make sure the script is executable
    const info = file.query_info(
      "unix::mode",
      Gio.FileQueryInfoFlags.NONE,
      null
    );
    const mode = info.get_attribute_uint32("unix::mode");
    file.set_attribute_uint32(
      "unix::mode",
      mode | 0o111,
      Gio.FileQueryInfoFlags.NONE,
      null
    );

    // Run the setup script
    const [success, pid] = GLib.spawn_async(
      null, // working directory
      ["bash", setupScript], // command and args
      null, // envp
      GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
      null // child_setup
    );

    if (!success) {
      throw new Error("Failed to start setup script");
    }

    // Wait for the process to complete
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
      if (status !== 0) {
        log("Setup script failed with status: " + status);
      } else {
        log("Setup script completed successfully");
      }
      GLib.spawn_close_pid(pid);
    });

    return true;
  } catch (e) {
    log("Error running setup script: " + e.message);
    return false;
  }
}

function checkSetupStatus(extensionPath) {
  const venvPath = `${extensionPath}/venv`;
  const venvDir = Gio.File.new_for_path(venvPath);

  // Check if virtual environment exists
  if (!venvDir.query_exists(null)) {
    return {
      needsSetup: true,
      message: "Python environment not found. Running setup...",
    };
  }

  return { needsSetup: false };
}

export default class WhisperTypingExtension extends Extension {
  constructor(metadata) {
    super(metadata);
    this.recordingDialog = null;
    this.recordingProcess = null;
    this.settings = null;
    this.currentKeybinding = null;

    // Remove animation properties since we're not pulsating anymore
    this.recordingIcon = new St.Label({
      text: "🎤",
      style: "font-size: 48px; text-align: center;",
    });
  }

  _showSetupDialog(message) {
    // Use GNOME Shell's notification system instead of St.Modal
    Main.notify("Speech2Text Setup", message);
    log(`Speech2Text: ${message}`);
  }

  _runSetupInTerminal() {
    // Launch a terminal window to run the setup script so user can see progress
    const setupScript = `${this.path}/scripts/setup_env.sh`;

    // Try different terminal emulators in order of preference
    const terminals = [
      "gnome-terminal",
      "konsole",
      "xfce4-terminal",
      "mate-terminal",
      "xterm",
    ];

    let terminalCmd = null;

    // Find an available terminal
    for (let terminal of terminals) {
      try {
        let [success] = GLib.spawn_command_line_sync(`which ${terminal}`);
        if (success) {
          terminalCmd = terminal;
          break;
        }
      } catch (e) {
        // Continue to next terminal
      }
    }

    if (!terminalCmd) {
      Main.notify(
        "Speech2Text Error",
        "No terminal emulator found. Please install gnome-terminal or similar."
      );
      return false;
    }

    try {
      // Create a wrapper script that shows completion message
      const wrapperScript = `#!/bin/bash
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              GNOME Speech2Text Extension Setup            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "🎯 ATTENTION: This terminal opened because the Speech2Text extension"
echo "   needs to install its Python environment and dependencies."
echo ""
echo "📦 What will be installed:"
echo "   • Python virtual environment"
echo "   • OpenAI Whisper (speech recognition)"
echo "   • Required Python packages"
echo ""
echo "⏱️  This process will take 2-5 minutes depending on your internet speed."
echo "💾 Installation size: ~200-500MB"
echo ""
echo "Please read the prompts below and follow the instructions."
echo "════════════════════════════════════════════════════════════"
echo ""

cd "${this.path}"
bash "${setupScript}" --interactive
exit_code=$?

echo ""
echo "════════════════════════════════════════════════════════════"
if [ $exit_code -eq 0 ]; then
    echo "🎉 Setup completed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Close this terminal"
    echo "   2. Reload GNOME Shell: Press Alt+F2, type 'r', press Enter"
    echo "   3. The Speech2Text extension will now be ready to use!"
    echo ""
    echo "🎤 Usage:"
    echo "   • Click the microphone icon in the top panel"
    echo "   • Or use the keyboard shortcut Ctrl+Shift+Alt+C"
else
    echo "❌ Setup failed with exit code $exit_code"
    echo ""
    echo "Please check the error messages above and try again."
    echo "If the problem persists, please report it on GitHub."
fi
echo ""
echo "Press Enter to close this terminal..."
read
`;

      // Write wrapper script to temp file
      const tempScript = `${GLib.get_tmp_dir()}/speech2text-setup.sh`;
      const file = Gio.File.new_for_path(tempScript);
      const outputStream = file.replace(
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
      );
      outputStream.write(wrapperScript, null);
      outputStream.close(null);

      // Make script executable
      GLib.spawn_command_line_sync(`chmod +x "${tempScript}"`);

      // Launch terminal with the wrapper script
      let terminalArgs;
      if (terminalCmd === "gnome-terminal") {
        terminalArgs = [
          terminalCmd,
          "--title=Speech2Text Setup",
          "--",
          "bash",
          tempScript,
        ];
      } else if (terminalCmd === "konsole") {
        terminalArgs = [
          terminalCmd,
          "--title",
          "Speech2Text Setup",
          "-e",
          "bash",
          tempScript,
        ];
      } else if (terminalCmd === "xfce4-terminal") {
        terminalArgs = [
          terminalCmd,
          "--title=Speech2Text Setup",
          "-e",
          `bash ${tempScript}`,
        ];
      } else if (terminalCmd === "mate-terminal") {
        terminalArgs = [
          terminalCmd,
          "--title=Speech2Text Setup",
          "-e",
          `bash ${tempScript}`,
        ];
      } else {
        // xterm or fallback
        terminalArgs = [
          terminalCmd,
          "-title",
          "Speech2Text Setup",
          "-e",
          "bash",
          tempScript,
        ];
      }

      let [success, pid] = GLib.spawn_async(
        null, // working directory
        terminalArgs,
        null, // envp
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null // child_setup
      );

      if (success) {
        Main.notify(
          "Speech2Text",
          "Setup is running in the terminal window. Please check the terminal for prompts."
        );

        // Try to focus the terminal window after a short delay
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          try {
            // Find and focus the setup terminal window
            let [findSuccess, findStdout] = GLib.spawn_command_line_sync(
              'xdotool search --name "Speech2Text Setup" 2>/dev/null || true'
            );
            if (findSuccess && findStdout) {
              let windowId = new TextDecoder().decode(findStdout).trim();
              if (windowId) {
                GLib.spawn_command_line_sync(
                  `xdotool windowactivate ${windowId} 2>/dev/null || true`
                );
                GLib.spawn_command_line_sync(
                  `xdotool windowraise ${windowId} 2>/dev/null || true`
                );
                log(`Focused setup terminal window: ${windowId}`);
              }
            }
          } catch (e) {
            log(`Could not focus terminal window: ${e}`);
          }
          return false; // Don't repeat
        });

        // Clean up temp script when process completes
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
          try {
            GLib.unlink(tempScript);
          } catch (e) {
            // Ignore cleanup errors
          }
          GLib.spawn_close_pid(pid);
        });

        return true;
      } else {
        throw new Error("Failed to launch terminal");
      }
    } catch (e) {
      log(`Error launching terminal setup: ${e}`);
      Main.notify(
        "Speech2Text Error",
        `Failed to launch terminal setup: ${e.message}`
      );
      return false;
    }
  }

  enable() {
    const setup = checkSetupStatus(this.path);
    if (setup.needsSetup) {
      this._showSetupDialog(setup.message);
      if (this._runSetupInTerminal()) {
        // Setup is running in terminal, extension will need to be reloaded after completion
        return;
      } else {
        this._showSetupDialog(
          "Failed to launch terminal setup. Please try reinstalling the extension."
        );
        return;
      }
    }

    this.settings = this.getSettings();
    this.recordingProcess = null;
    this.recordingDialog = null;

    // Create button with microphone icon
    const button = new PanelMenu.Button(0.0, "Speech2Text");

    // Make button referenceable by this object
    this.button = button;

    this.icon = new St.Icon({
      gicon: Gio.icon_new_for_string(
        `${this.path}/icons/microphone-symbolic.svg`
      ),
      style_class: "system-status-icon",
    });
    button.add_child(this.icon);

    // Create popup menu
    this.createPopupMenu();

    // Override the default menu behavior to prevent left-click menu interference
    // Store the original vfunc_event method
    const originalEvent = button.vfunc_event;

    // Override the event handler to prevent menu on left click
    button.vfunc_event = function (event) {
      if (
        event.type() === Clutter.EventType.BUTTON_PRESS &&
        event.get_button() === 1
      ) {
        // For left clicks, don't call the original handler which opens menu
        // Our custom button-press-event handler will handle it
        return Clutter.EVENT_STOP;
      }
      // For all other events (including right-click), use original behavior
      return originalEvent.call(this, event);
    };

    // Handle button clicks
    button.connect("button-press-event", (actor, event) => {
      const buttonPressed = event.get_button();
      log(`🖱️ BUTTON CLICK TRIGGERED`);

      if (buttonPressed === 1) {
        // Left click - start recording immediately AND prevent menu from opening
        log("🖱️ Left click detected - starting recording synchronously");

        // CRITICAL: Prevent the menu from opening on left click
        // This was causing the focus issues!
        button.menu.close(true); // Force close menu if it's trying to open

        // Debug: Show current focus state before starting recording
        const focusInfo = debugFocusState();

        if (!focusInfo.hasActiveWindow) {
          // Try to establish X11 context before proceeding
          if (establishX11FocusContext(() => this.toggleRecording())) {
            return Clutter.EVENT_STOP; // Callback will handle the recording
          }
        }

        // Call toggleRecording immediately, synchronously with the user click
        this.toggleRecording();

        return Clutter.EVENT_STOP; // Prevent menu from opening
      } else if (buttonPressed === 3) {
        // Right click - show menu (let normal menu behavior happen)
        log("🖱️ Right click detected - allowing menu to open");
        return Clutter.EVENT_PROPAGATE; // Allow menu to open
      }

      return Clutter.EVENT_STOP;
    });

    // Disable the menu's default reactivity to clicks on the main button
    // This prevents the menu from opening on left clicks
    button.set_reactive(true);
    button.menu.actor.set_reactive(true);

    // Set up keyboard shortcut
    this.setupKeybinding();

    Main.panel.addToStatusArea("WhisperTyping", button);
  }

  createPopupMenu() {
    // Add menu item for settings
    let settingsItem = new PopupMenu.PopupMenuItem("Settings");
    settingsItem.connect("activate", () => {
      this.showSettingsWindow();
    });
    this.button.menu.addMenuItem(settingsItem);

    // Add separator
    this.button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    // Add current shortcut display
    this.shortcutLabel = new PopupMenu.PopupMenuItem("", { reactive: false });
    this.updateShortcutLabel();
    this.button.menu.addMenuItem(this.shortcutLabel);
  }

  updateShortcutLabel() {
    const shortcuts = this.settings.get_strv("toggle-recording");
    const shortcut = shortcuts.length > 0 ? shortcuts[0] : null;

    this.shortcutLabel.label.text = shortcut
      ? `Shortcut: ${shortcut}`
      : "Shortcut: None";
  }

  showSettingsWindow() {
    // Create settings window
    let settingsWindow = new St.BoxLayout({
      style_class: "settings-window",
      vertical: true,
      style: `
        background-color: rgba(20, 20, 20, 0.95);
        border-radius: 12px;
        padding: 30px;
        min-width: 450px;
        min-height: 300px;
        border: ${STYLES.DIALOG_BORDER};
      `,
    });

    // Header box for icon, title, and close button
    let headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 16px; margin-bottom: 18px; align-items: center;",
      x_align: Clutter.ActorAlign.FILL,
      y_align: Clutter.ActorAlign.CENTER,
    });

    // Icon
    let titleIcon = createStyledLabel("🎤", "icon", "");
    titleIcon.set_y_align(Clutter.ActorAlign.CENTER);

    // Title label
    let titleLabel = createStyledLabel("Gnome Speech2Text Settings", "title");
    titleLabel.set_x_expand(true);
    titleLabel.set_y_align(Clutter.ActorAlign.CENTER);

    // Close button (X)
    let closeButton = createTextButton("×", COLORS.SECONDARY, COLORS.DANGER, {
      fontSize: "24px",
      buttonProps: { y_align: Clutter.ActorAlign.CENTER },
    });

    headerBox.add_child(titleIcon);
    headerBox.add_child(titleLabel);
    headerBox.add_child(closeButton);

    // Keyboard shortcut section
    let shortcutSection = createVerticalBox();

    let shortcutLabel = createStyledLabel("Keyboard Shortcut", "subtitle");

    let shortcutDescription = createStyledLabel(
      "Set the keyboard combination to toggle recording on/off",
      "description"
    );

    // Current shortcut display and edit
    let currentShortcutBox = createHorizontalBox();

    let currentShortcutLabel = createStyledLabel(
      "Current:",
      "normal",
      "min-width: 80px;"
    );

    this.currentShortcutDisplay = new St.Label({
      text: (() => {
        let shortcuts = this.settings.get_strv("toggle-recording");
        if (shortcuts.length > 0) {
          return shortcuts[0];
        } else {
          return "No shortcut set";
        }
      })(),
      style: (() => {
        let shortcuts = this.settings.get_strv("toggle-recording");
        if (shortcuts.length > 0) {
          return `
            font-size: 14px; 
            color: ${COLORS.PRIMARY}; 
            background-color: rgba(255, 140, 0, 0.1);
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid ${COLORS.PRIMARY};
            min-width: 200px;
          `;
        } else {
          return `
            font-size: 14px; 
            color: ${COLORS.WARNING}; 
            background-color: rgba(220, 53, 69, 0.1);
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid ${COLORS.WARNING};
            min-width: 200px;
          `;
        }
      })(),
    });

    currentShortcutBox.add_child(currentShortcutLabel);
    currentShortcutBox.add_child(this.currentShortcutDisplay);

    // Button container for all shortcut-related buttons
    let shortcutButtonsBox = createHorizontalBox("10px");

    // Change shortcut button
    let changeShortcutButton = createHoverButton(
      "Change Shortcut",
      COLORS.INFO,
      "#0077ee"
    );

    // Reset to default button
    let resetToDefaultButton = createHoverButton(
      "Reset to Default",
      COLORS.PRIMARY,
      "#ff9d1a"
    );

    // Remove shortcut button
    let removeShortcutButton = createHoverButton(
      "Remove Shortcut",
      COLORS.WARNING,
      "#e74c3c"
    );

    // Add buttons to the container
    shortcutButtonsBox.add_child(changeShortcutButton);
    shortcutButtonsBox.add_child(resetToDefaultButton);
    shortcutButtonsBox.add_child(removeShortcutButton);

    // Instructions
    let instructionsLabel = createStyledLabel(
      "Click 'Change Shortcut' and then press the key combination you want to use.\nPress Escape to cancel the change.",
      "small",
      "margin-bottom: 20px;"
    );

    shortcutSection.add_child(shortcutLabel);
    shortcutSection.add_child(shortcutDescription);
    shortcutSection.add_child(currentShortcutBox);
    shortcutSection.add_child(shortcutButtonsBox);
    shortcutSection.add_child(instructionsLabel);

    // Separator line
    let separator = createSeparator();

    // Troubleshooting section
    let troubleshootingSection = createVerticalBox("10px");

    let troubleshootingLabel = createStyledLabel("Troubleshooting", "subtitle");

    let troubleshootingDescription = createStyledLabel(
      "If the extension is not working properly, try reinstalling the Python environment:",
      "description"
    );

    // Install/Reinstall Python Environment button
    let installPythonButton = createHoverButton(
      "Install/Reinstall Python Environment",
      COLORS.SUCCESS,
      "#34ce57"
    );

    installPythonButton.connect("clicked", () => {
      // Close settings window first
      closeSettings();

      // Show notification
      Main.notify(
        "Speech2Text",
        "Opening terminal to install Python environment..."
      );

      // Run setup in terminal
      if (!this._runSetupInTerminal()) {
        Main.notify(
          "Speech2Text Error",
          "Failed to launch terminal setup. Please check the logs."
        );
      }
    });

    troubleshootingSection.add_child(troubleshootingLabel);
    troubleshootingSection.add_child(troubleshootingDescription);
    troubleshootingSection.add_child(installPythonButton);

    // Another separator line
    let separator2 = createSeparator();

    // About section
    let aboutSection = createVerticalBox("10px", "0px");

    let aboutLabel = createStyledLabel("About", "subtitle");

    let aboutText = createStyledLabel(
      "Speech2Text extension for GNOME Shell\nUses OpenAI Whisper for speech-to-text transcription",
      "description",
      "margin-bottom: 0px;"
    );

    // GitHub link
    let githubLink = createTextButton(
      "GitHub Repository",
      COLORS.INFO,
      "#0077ee",
      {
        hoverExtraStyle: "text-decoration: underline;",
      }
    );

    // Open GitHub link when clicked
    githubLink.connect("clicked", () => {
      // Close the settings window first
      closeSettings();

      // Then open the GitHub link
      Gio.app_info_launch_default_for_uri(
        "https://github.com/kavehtehrani/gnome-speech2text/",
        global.create_app_launch_context(0, -1)
      );
    });

    aboutSection.add_child(aboutLabel);
    aboutSection.add_child(aboutText);
    aboutSection.add_child(githubLink);

    settingsWindow.add_child(headerBox);
    settingsWindow.add_child(shortcutSection);
    settingsWindow.add_child(separator);
    settingsWindow.add_child(troubleshootingSection);
    settingsWindow.add_child(separator2);
    settingsWindow.add_child(aboutSection);

    // Create modal overlay
    let overlay = new St.Widget({
      style: `background-color: ${COLORS.TRANSPARENT_BLACK_70};`,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    overlay.add_child(settingsWindow);

    // Get proper screen dimensions
    let monitor = Main.layoutManager.primaryMonitor;
    overlay.set_size(monitor.width, monitor.height);
    overlay.set_position(monitor.x, monitor.y);

    // Center the settings window
    settingsWindow.set_position(
      (monitor.width - 450) / 2,
      (monitor.height - 300) / 2
    );

    Main.layoutManager.addTopChrome(overlay);

    // Store handler IDs so we can disconnect them during shortcut capture
    let clickHandlerId = null;
    let keyPressHandlerId = null;

    // Function to close settings window
    const closeSettings = () => {
      cleanupModal(overlay, { clickHandlerId, keyPressHandlerId });
      // Reset handler IDs
      clickHandlerId = null;
      keyPressHandlerId = null;
    };

    // Close button handler
    closeButton.connect("clicked", closeSettings);

    // Click outside to close - but make sure to block all background clicks
    clickHandlerId = overlay.connect("button-press-event", (actor, event) => {
      // Block all background clicks but don't close the window
      return Clutter.EVENT_STOP;
    });

    // Escape key to close and block all other keyboard events from going to background
    keyPressHandlerId = overlay.connect("key-press-event", (actor, event) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        closeSettings();
        return Clutter.EVENT_STOP;
      }
      // Block other keys from reaching background applications
      return Clutter.EVENT_STOP;
    });

    // Change shortcut button handler
    changeShortcutButton.connect("clicked", () => {
      this.startShortcutCapture(
        changeShortcutButton,
        overlay,
        clickHandlerId,
        keyPressHandlerId,
        closeSettings
      );
    });

    // Reset to default button handler
    resetToDefaultButton.connect("clicked", () => {
      // Remove existing keybinding
      try {
        Main.wm.removeKeybinding("toggle-recording");
      } catch (e) {
        // Ignore errors
      }

      let defaultShortcut = "<Control><Shift><Alt>c";

      // Update settings
      this.settings.set_strv("toggle-recording", [defaultShortcut]);

      // Update current keybinding
      this.currentKeybinding = defaultShortcut;

      // Re-register keybinding using centralized method
      this.setupKeybinding();

      // Update display
      this.currentShortcutDisplay.set_text(defaultShortcut);
      this.currentShortcutDisplay.set_style(`
        font-size: 14px; 
        color: #ff8c00; 
        background-color: rgba(255, 140, 0, 0.1);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #ff8c00;
        min-width: 200px;
      `);

      // Update menu label
      this.updateShortcutLabel();

      // Show confirmation
      Main.notify("Speech2Text", "Shortcut reset to default: Ctrl+Shift+Alt+C");
    });

    // Remove shortcut button handler
    removeShortcutButton.connect("clicked", () => {
      // Remove the keybinding
      try {
        Main.wm.removeKeybinding("toggle-recording");
        this.currentKeybinding = null;

        // Clear the settings
        this.settings.set_strv("toggle-recording", []);

        // Update display
        this.currentShortcutDisplay.set_text("No shortcut set");
        this.currentShortcutDisplay.set_style(`
          font-size: 14px; 
          color: #dc3545; 
          background-color: rgba(220, 53, 69, 0.1);
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #dc3545;
          min-width: 200px;
        `);

        // Update menu label
        this.updateShortcutLabel();

        // Show confirmation
        Main.notify("Speech2Text", "Keyboard shortcut removed");
      } catch (e) {
        log(`Error removing keybinding: ${e}`);
        Main.notify("Speech2Text", "Error removing keyboard shortcut");
      }
    });

    // Ensure the overlay grabs focus and blocks input to background
    overlay.grab_key_focus();
    overlay.set_reactive(true);
  }

  startShortcutCapture(
    button,
    overlay,
    clickHandlerId,
    keyPressHandlerId,
    closeSettings
  ) {
    // Store original shortcut for potential restoration
    let originalShortcut = this.currentShortcutDisplay.get_text();
    let lastKeyCombo = null;
    let lastShortcut = null;
    let saveButtonClickId = null;

    // Temporarily disconnect the overlay's normal event handlers
    safeDisconnect(overlay, clickHandlerId, "settings click handler");
    safeDisconnect(overlay, keyPressHandlerId, "settings key handler");

    // Change button appearance to indicate capture mode
    button.set_label("Save Shortcut");
    button.set_style(`
      background-color: #ff8c00;
      color: white;
      border-radius: 6px;
      padding: 12px 20px;
      font-size: 14px;
      border: none;
    `);

    // Update the display to show capture mode
    this.currentShortcutDisplay.set_text("Press a key combination...");
    this.currentShortcutDisplay.set_style(`
      font-size: 14px; 
      color: #ff8c00; 
      background-color: rgba(255, 140, 0, 0.2);
      padding: 8px 12px;
      border-radius: 6px;
      border: 2px solid #ff8c00;
      min-width: 200px;
    `);

    // Ensure the overlay has focus and can capture keyboard events
    overlay.grab_key_focus();

    // Function to restore original handlers
    const restoreHandlers = () => {
      // Get reference to settingsWindow from the overlay's children
      let settingsWindow = overlay.get_first_child();

      // Reconnect original click handler
      clickHandlerId = overlay.connect("button-press-event", (actor, event) => {
        let [x, y] = event.get_coords();
        let [windowX, windowY] = settingsWindow.get_position();
        let [windowW, windowH] = settingsWindow.get_size();

        // If click is outside settings window area, close it
        if (
          x < windowX ||
          x > windowX + windowW ||
          y < windowY ||
          y > windowY + windowH
        ) {
          closeSettings();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      // Reconnect original key handler
      keyPressHandlerId = overlay.connect("key-press-event", (actor, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
          closeSettings();
          return Clutter.EVENT_STOP;
        }
        // Block other keys from reaching background applications
        return Clutter.EVENT_STOP;
      });
    };

    // Function to reset button and display on cancel
    const resetOnCancel = () => {
      // Disconnect save button handler if it exists
      if (safeDisconnect(button, saveButtonClickId, "save button handler")) {
        saveButtonClickId = null;
      }

      button.set_label("Change Shortcut");
      button.set_style(`
        background-color: #0066cc;
        color: white;
        border-radius: 6px;
        padding: 12px 20px;
        font-size: 14px;
        border: none;
      `);

      // Restore original shortcut display
      this.currentShortcutDisplay.set_text(originalShortcut);
      this.currentShortcutDisplay.set_style(`
        font-size: 14px; 
        color: #ff8c00; 
        background-color: rgba(255, 140, 0, 0.1);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #ff8c00;
        min-width: 200px;
      `);
    };

    // Function to show success state
    const showSuccess = (shortcut, displayText) => {
      // Disconnect save button handler if it exists
      if (safeDisconnect(button, saveButtonClickId, "save button handler")) {
        saveButtonClickId = null;
      }

      button.set_label("Shortcut Changed!");
      button.set_style(`
        background-color: #28a745;
        color: white;
        border-radius: 6px;
        padding: 12px 20px;
        font-size: 14px;
        border: none;
      `);

      // Update display with new shortcut
      this.currentShortcutDisplay.set_text(displayText);
      this.currentShortcutDisplay.set_style(`
        font-size: 14px; 
        color: #28a745; 
        background-color: rgba(40, 167, 69, 0.1);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #28a745;
        min-width: 200px;
      `);

      // Reset button after 2 seconds
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
        button.set_label("Change Shortcut");
        button.set_style(`
          background-color: #0066cc;
          color: white;
          border-radius: 6px;
          padding: 12px 20px;
          font-size: 14px;
          border: none;
        `);

        // Reset display to normal style but keep new shortcut
        this.currentShortcutDisplay.set_style(`
          font-size: 14px; 
          color: #ff8c00; 
          background-color: rgba(255, 140, 0, 0.1);
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #ff8c00;
          min-width: 200px;
        `);

        return false; // Don't repeat
      });
    };

    // Connect the Save Shortcut button handler
    saveButtonClickId = button.connect("clicked", () => {
      log(
        `Save shortcut clicked! lastShortcut: ${lastShortcut}, lastKeyCombo: ${lastKeyCombo}`
      );

      if (lastShortcut) {
        // Save the new shortcut
        this.updateKeybinding(lastShortcut);

        // Show success state
        showSuccess(lastShortcut, lastKeyCombo);

        // Reset everything
        safeDisconnect(overlay, captureId, "keyboard capture handler");
        restoreHandlers();

        // Show confirmation notification
        Main.notify("Speech2Text", `Shortcut changed to: ${lastKeyCombo}`);
      } else {
        // No valid shortcut was captured
        Main.notify(
          "Speech2Text",
          "Please press a valid key combination first"
        );
      }
    });

    // Capture key combinations on the overlay
    let captureId = overlay.connect("key-press-event", (actor, event) => {
      let keyval = event.get_key_symbol();
      let state = event.get_state();

      // Handle Escape to cancel
      if (keyval === Clutter.KEY_Escape) {
        safeDisconnect(overlay, captureId, "keyboard capture handler");
        restoreHandlers();
        resetOnCancel();
        return Clutter.EVENT_STOP;
      }

      // Show current key combination being pressed (real-time feedback)
      let currentCombo = "";
      if (state & Clutter.ModifierType.CONTROL_MASK) currentCombo += "Ctrl+";
      if (state & Clutter.ModifierType.SHIFT_MASK) currentCombo += "Shift+";
      if (state & Clutter.ModifierType.MOD1_MASK) currentCombo += "Alt+";
      if (state & Clutter.ModifierType.SUPER_MASK) currentCombo += "Super+";

      let keyname = Clutter.keyval_name(keyval);
      if (
        keyname &&
        keyname !== "Control_L" &&
        keyname !== "Control_R" &&
        keyname !== "Shift_L" &&
        keyname !== "Shift_R" &&
        keyname !== "Alt_L" &&
        keyname !== "Alt_R" &&
        keyname !== "Super_L" &&
        keyname !== "Super_R"
      ) {
        currentCombo += keyname;

        // Show the current combination in the display
        this.currentShortcutDisplay.set_text(`${currentCombo}`);

        // Store the last valid key combination
        lastKeyCombo = currentCombo;

        // Build shortcut string for saving
        let shortcut = "";
        if (state & Clutter.ModifierType.CONTROL_MASK) shortcut += "<Control>";
        if (state & Clutter.ModifierType.SHIFT_MASK) shortcut += "<Shift>";
        if (state & Clutter.ModifierType.MOD1_MASK) shortcut += "<Alt>";
        if (state & Clutter.ModifierType.SUPER_MASK) shortcut += "<Super>";

        // Always add the key name (even if no modifiers)
        shortcut += keyname.toLowerCase();
        lastShortcut = shortcut;

        log(
          `Key pressed: ${keyname}, shortcut: ${shortcut}, combo: ${currentCombo}`
        );
      }

      return Clutter.EVENT_STOP;
    });
  }

  setupKeybinding() {
    // Always remove existing keybinding first
    try {
      Main.wm.removeKeybinding("toggle-recording");
    } catch (e) {
      // Ignore errors if keybinding doesn't exist
    }

    // Get shortcut from settings
    let shortcuts = this.settings.get_strv("toggle-recording");
    if (shortcuts.length > 0) {
      this.currentKeybinding = shortcuts[0];
    } else {
      this.currentKeybinding = "<Control><Shift><Alt>c";
      this.settings.set_strv("toggle-recording", [this.currentKeybinding]);
    }

    // Set up keyboard shortcut using Main.wm.addKeybinding
    try {
      Main.wm.addKeybinding(
        "toggle-recording",
        this.settings,
        Meta.KeyBindingFlags.NONE,
        Shell.ActionMode.NORMAL,
        () => {
          log(`🎹 KEYBOARD SHORTCUT TRIGGERED`);

          // Debug: Show focus state when keyboard shortcut is used
          debugFocusState("SHORTCUT");

          this.toggleRecording();
        }
      );
      log(`Keybinding registered: ${this.currentKeybinding}`);
    } catch (e) {
      log(`Error registering keybinding: ${e}`);
    }
  }

  updateKeybinding(newShortcut) {
    log(`Updating keybinding from ${this.currentKeybinding} to ${newShortcut}`);

    // Save to settings
    this.settings.set_strv("toggle-recording", [newShortcut]);

    // Update current keybinding
    this.currentKeybinding = newShortcut;

    // Reregister keybinding
    this.setupKeybinding();

    // Update menu label
    this.updateShortcutLabel();

    log(`Keybinding updated to: ${newShortcut}`);
  }

  startRecording() {
    try {
      log("🎯 startRecording() called - creating recording dialog");

      const [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
        null,
        [`${this.path}/venv/bin/python3`, `${this.path}/whisper_typing.py`],
        null,
        GLib.SpawnFlags.DO_NOT_REAP_CHILD,
        null
      );

      if (success) {
        this.recordingProcess = pid;
        log(`🎯 Process started with PID: ${pid}`);

        // Show recording dialog immediately
        log("🎯 Creating RecordingDialog instance");
        this.recordingDialog = new RecordingDialog(
          () => {
            log("🎯 Stop callback triggered");
            // Stop callback - send gentle signal to stop recording but allow processing
            cleanupRecordingState(this);
          },
          () => {
            log("🎯 Cancel callback triggered");
            // Cancel callback - forcibly terminate process without transcription
            if (this.recordingProcess) {
              cleanupProcess(
                this.recordingProcess,
                "TERM",
                "recording process (cancelled)"
              );
              this.recordingProcess = null;
            }
            this.recordingDialog = null;
            this.icon?.set_style("");
          }
        );

        log(
          `🎯 RecordingDialog created: ${
            this.recordingDialog ? "SUCCESS" : "FAILED"
          }`
        );

        if (this.recordingDialog) {
          log("🎯 Attempting to open RecordingDialog");
          this.recordingDialog.open();
          log("🎯 RecordingDialog.open() called");
        } else {
          log("⚠️ RecordingDialog is null - cannot open");
        }

        // Set up stdout reading to monitor process
        const stdoutStream = new Gio.DataInputStream({
          base_stream: new Gio.UnixInputStream({ fd: stdout }),
        });

        // Function to read lines from stdout
        const readOutput = () => {
          stdoutStream.read_line_async(
            GLib.PRIORITY_DEFAULT,
            null,
            (stream, result) => {
              try {
                const [line] = stream.read_line_finish(result);
                if (line) {
                  const lineStr = new TextDecoder().decode(line);
                  log(`Whisper stdout: ${lineStr}`);
                  readOutput();
                }
              } catch (e) {
                log(`Error reading stdout: ${e}`);
              }
            }
          );
        };

        // Start monitoring output
        readOutput();

        // Watch for process completion
        GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => {
          cleanupRecordingState(this);
          log("Whisper process completed");
        });
      }
    } catch (e) {
      log(`Error starting recording: ${e}`);
      cleanupRecordingState(this);
    }
  }

  disable() {
    // Clean up recording state
    cleanupRecordingState(this);

    // Remove keybinding
    try {
      Main.wm.removeKeybinding("toggle-recording");
      log("Keybinding removed");
    } catch (e) {
      log(`Error removing keybinding: ${e}`);
    }

    // Clean up button
    if (button) {
      button.destroy();
      button = null;
      log("Extension button destroyed");
    }
  }

  // Consolidated toggle recording method
  toggleRecording() {
    log(`=== TOGGLE RECORDING DEBUG START ===`);

    // Check if Python environment is set up before proceeding
    const setup = checkSetupStatus(this.path);
    if (setup.needsSetup) {
      log(`Python environment not found - launching setup`);
      Main.notify("Speech2Text", "Python environment missing. Setting up...");

      if (this._runSetupInTerminal()) {
        Main.notify(
          "Speech2Text",
          "Please complete the setup in the terminal, then try again."
        );
      } else {
        Main.notify("Speech2Text Error", "Failed to launch setup terminal.");
      }
      return;
    }

    log(`this.recordingProcess = ${this.recordingProcess}`);
    log(`this.recordingDialog = ${this.recordingDialog ? "EXISTS" : "NULL"}`);
    log(`Icon style = ${this.icon.get_style()}`);

    let condition1 = this.recordingProcess;
    let condition2 = this.recordingDialog;
    let overallCondition = condition1 || condition2;

    log(`Condition 1 (recordingProcess): ${condition1 ? "TRUE" : "FALSE"}`);
    log(`Condition 2 (recordingDialog): ${condition2 ? "TRUE" : "FALSE"}`);
    log(
      `Overall condition (process OR dialog): ${
        overallCondition ? "TRUE" : "FALSE"
      }`
    );

    if (this.recordingProcess || this.recordingDialog) {
      log(`>>> TAKING STOP PATH <<<`);
      // If recording or dialog is open, stop it (with transcription)
      let cleanup = cleanupRecordingState(this);
      log(
        `Cleanup results: dialog=${cleanup.cleanedDialog}, process=${cleanup.cleanedProcess}`
      );
    } else {
      log(`>>> TAKING START PATH <<<`);
      // If not recording, start it
      this.icon.set_style(`color: ${COLORS.PRIMARY};`);
      log(`Icon style set to orange`);
      log(`About to call startRecording()`);
      this.startRecording();
      log(`startRecording() call completed`);
    }
    log(`=== TOGGLE RECORDING DEBUG END ===`);
  }
}

function init(metadata) {
  return new WhisperTypingExtension(metadata);
}
