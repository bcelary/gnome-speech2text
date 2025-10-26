import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { COLORS, STYLES } from "../constants.js";
import { createHoverButton, createHorizontalBox } from "../uiUtils.js";
import { Logger } from "../logger.js";

/**
 * Dumb ModalDialog component - pre-built state containers, toggle visibility
 * No logic, no decisions - just shows what it's told
 */
export class ModalDialog {
  constructor() {
    this.logger = new Logger("ModalDialog");
    this.modalBarrier = null;
    this.container = null;
    this.focusTimeoutId = null;
    this.keyboardHandlerId = null;

    // State containers (pre-built)
    this.recordingContainer = null;
    this.processingContainer = null;
    this.previewContainer = null;
    this.errorContainer = null;

    // Dynamic elements (for updates)
    this.recordingTimeLabel = null;
    this.recordingProgressBar = null;
    this.recordingProgressBg = null;
    this.previewTextEntry = null;
    this.errorMessageLabel = null;

    // Button widgets and their signal IDs for cleanup
    this.buttonConnections = [];

    // Callbacks set by UICoordinator
    this.onCancel = null;
    this.onStop = null;
    this.onInsert = null;
    this.onCopy = null;

    this._buildDialog();
  }

  _buildDialog() {
    // Modal barrier
    this.modalBarrier = new St.Widget({
      style: `background-color: ${COLORS.TRANSPARENT_BLACK_30};`,
      reactive: true,
      can_focus: true,
      track_hover: true,
    });

    // Main container
    this.container = new St.Widget({
      style_class: "recording-dialog",
      style: `
        background-color: ${COLORS.TRANSPARENT_BLACK_85};
        border-radius: ${STYLES.DIALOG_BORDER_RADIUS};
        padding: ${STYLES.DIALOG_PADDING};
        border: ${STYLES.DIALOG_BORDER};
        min-width: 450px;
        max-width: 600px;
      `,
      layout_manager: new Clutter.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        spacing: 20,
      }),
      reactive: true,
      can_focus: true,
    });

    this.modalBarrier.add_child(this.container);

    // Pre-build all state containers
    this._buildRecordingContainer();
    this._buildProcessingContainer();
    this._buildPreviewContainer();
    this._buildErrorContainer();

    // Add all containers to main container (all hidden initially)
    this.container.add_child(this.recordingContainer);
    this.container.add_child(this.processingContainer);
    this.container.add_child(this.previewContainer);
    this.container.add_child(this.errorContainer);

    // Hide all containers initially
    this._hideAllContainers();

    // Keyboard handler
    this.keyboardHandlerId = this.modalBarrier.connect(
      "key-press-event",
      (actor, event) => {
        const keyval = event.get_key_symbol();
        if (keyval === Clutter.KEY_Escape) {
          this.onCancel?.();
          return Clutter.EVENT_STOP;
        } else if (
          keyval === Clutter.KEY_Return ||
          keyval === Clutter.KEY_KP_Enter
        ) {
          // Enter key behavior handled by callbacks
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      }
    );
  }

  /**
   * Build recording state container (once)
   * @private
   */
  _buildRecordingContainer() {
    this.recordingContainer = new St.Widget({
      layout_manager: new Clutter.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        spacing: 20,
      }),
      x_align: Clutter.ActorAlign.CENTER,
    });

    // Header
    const headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px;",
      x_align: Clutter.ActorAlign.CENTER,
    });

    const icon = new St.Icon({
      icon_name: "audio-input-microphone-symbolic",
      style: "icon-size: 48px;",
    });

    const label = new St.Label({
      text: "Recording...",
      style: `font-size: 20px; font-weight: bold; color: ${COLORS.WHITE};`,
    });

    headerBox.add_child(icon);
    headerBox.add_child(label);

    // Progress bar background
    this.recordingProgressBg = new St.Widget({
      style: `
        background-color: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        height: 30px;
        width: 380px;
      `,
    });

    // Progress bar fill
    this.recordingProgressBar = new St.Widget({
      style: `
        background-color: ${COLORS.PRIMARY};
        border-radius: 4px;
        height: 30px;
        width: 0px;
      `,
    });

    this.recordingProgressBg.add_child(this.recordingProgressBar);

    // Time label
    this.recordingTimeLabel = new St.Label({
      text: "0:00 / 3:00 (3:00 left)",
      style: `
        font-size: 14px;
        color: white;
        font-weight: bold;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
      `,
    });

    const timeDisplayBin = new St.Bin({
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
      child: this.recordingTimeLabel,
    });

    const progressContainer = new St.Widget({
      style: "width: 380px; height: 30px; margin: 15px 0;",
      layout_manager: new Clutter.BinLayout(),
    });

    progressContainer.add_child(this.recordingProgressBg);
    progressContainer.add_child(timeDisplayBin);

    // Instructions
    const instructionLabel = new St.Label({
      text: "Speak now\nPress Enter to process, Escape to cancel.",
      style: `font-size: 16px; color: ${COLORS.LIGHT_GRAY}; text-align: center;`,
    });

    // Buttons
    const buttonBox = createHorizontalBox();
    buttonBox.x_align = Clutter.ActorAlign.CENTER;

    const stopButton = createHoverButton(
      "Stop Recording",
      COLORS.DANGER,
      "#ff6666"
    );
    const cancelButton = createHoverButton(
      "Cancel",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );

    this.buttonConnections.push({
      widget: stopButton,
      signalId: stopButton.connect("clicked", () => this.onStop?.()),
    });
    this.buttonConnections.push({
      widget: cancelButton,
      signalId: cancelButton.connect("clicked", () => this.onCancel?.()),
    });

    buttonBox.add_child(stopButton);
    buttonBox.add_child(cancelButton);

    // Add to container
    this.recordingContainer.add_child(headerBox);
    this.recordingContainer.add_child(progressContainer);
    this.recordingContainer.add_child(instructionLabel);
    this.recordingContainer.add_child(buttonBox);
  }

  /**
   * Build processing state container (once)
   * @private
   */
  _buildProcessingContainer() {
    this.processingContainer = new St.Widget({
      layout_manager: new Clutter.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        spacing: 20,
      }),
      x_align: Clutter.ActorAlign.CENTER,
    });

    // Header
    const headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px;",
      x_align: Clutter.ActorAlign.CENTER,
    });

    const icon = new St.Icon({
      icon_name: "emblem-synchronizing-symbolic",
      style: "icon-size: 48px;",
    });

    const label = new St.Label({
      text: "Processing...",
      style: `font-size: 20px; font-weight: bold; color: ${COLORS.WHITE};`,
    });

    headerBox.add_child(icon);
    headerBox.add_child(label);

    // Instructions
    const instructionLabel = new St.Label({
      text: "Transcribing your speech...\nPress Escape to cancel.",
      style: `font-size: 16px; color: ${COLORS.LIGHT_GRAY}; text-align: center;`,
    });

    // Cancel button
    const buttonBox = new St.Bin({
      x_align: Clutter.ActorAlign.CENTER,
    });

    const cancelButton = createHoverButton(
      "Cancel Processing",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );

    this.buttonConnections.push({
      widget: cancelButton,
      signalId: cancelButton.connect("clicked", () => this.onCancel?.()),
    });

    buttonBox.set_child(cancelButton);

    // Add to container
    this.processingContainer.add_child(headerBox);
    this.processingContainer.add_child(instructionLabel);
    this.processingContainer.add_child(buttonBox);
  }

  /**
   * Build preview state container (once)
   * @private
   */
  _buildPreviewContainer() {
    this.previewContainer = new St.Widget({
      layout_manager: new Clutter.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        spacing: 20,
      }),
      x_align: Clutter.ActorAlign.CENTER,
    });

    const isWayland = Meta.is_wayland_compositor();

    // Text entry
    this.previewTextEntry = new St.Entry({
      text: "",
      style: `
        background-color: rgba(255, 255, 255, 0.1);
        border: 2px solid ${COLORS.SECONDARY};
        border-radius: 8px;
        color: ${COLORS.WHITE};
        font-size: 16px;
        padding: 15px;
        margin: 10px 0;
        width: 400px;
        caret-color: ${COLORS.PRIMARY};
      `,
      can_focus: true,
      reactive: true,
    });

    // Multiline behavior
    const clutterText = this.previewTextEntry.get_clutter_text();
    clutterText.set_line_wrap(true);
    clutterText.set_line_wrap_mode(2); // PANGO_WRAP_WORD
    clutterText.set_single_line_mode(false);
    clutterText.set_activatable(false);

    // Buttons
    const buttonBox = createHorizontalBox();
    buttonBox.x_align = Clutter.ActorAlign.CENTER;

    // Insert button (X11 only)
    if (!isWayland) {
      const insertButton = createHoverButton(
        "Insert Text",
        COLORS.SUCCESS,
        "#34ce57"
      );
      this.buttonConnections.push({
        widget: insertButton,
        signalId: insertButton.connect("clicked", () => {
          const finalText = this.previewTextEntry.get_text();
          this.onInsert?.(finalText);
        }),
      });
      buttonBox.add_child(insertButton);
    }

    // Copy button
    const copyButton = createHoverButton(
      isWayland ? "Copy" : "Copy Only",
      COLORS.INFO,
      "#0077ee"
    );
    this.buttonConnections.push({
      widget: copyButton,
      signalId: copyButton.connect("clicked", () => {
        const finalText = this.previewTextEntry.get_text();
        this.onCopy?.(finalText);
      }),
    });

    // Cancel button
    const cancelButton = createHoverButton(
      "Cancel",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );
    this.buttonConnections.push({
      widget: cancelButton,
      signalId: cancelButton.connect("clicked", () => this.onCancel?.()),
    });

    buttonBox.add_child(copyButton);
    buttonBox.add_child(cancelButton);

    // Keyboard hint
    const keyboardHint = new St.Label({
      text: "Press Enter to copy • Escape to cancel",
      style: `font-size: 12px; color: ${COLORS.DARK_GRAY}; text-align: center; margin-top: 10px;`,
    });

    // Add to container
    this.previewContainer.add_child(this.previewTextEntry);
    this.previewContainer.add_child(buttonBox);
    this.previewContainer.add_child(keyboardHint);
  }

  /**
   * Build error state container (once)
   * @private
   */
  _buildErrorContainer() {
    this.errorContainer = new St.Widget({
      layout_manager: new Clutter.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        spacing: 20,
      }),
      x_align: Clutter.ActorAlign.CENTER,
    });

    // Header
    const headerBox = new St.BoxLayout({
      vertical: false,
      style: "spacing: 15px;",
      x_align: Clutter.ActorAlign.CENTER,
    });

    const errorIcon = new St.Label({
      text: "❌",
      style: "font-size: 48px; text-align: center;",
    });

    const errorLabel = new St.Label({
      text: "Error",
      style: `font-size: 20px; font-weight: bold; color: ${COLORS.DANGER};`,
    });

    headerBox.add_child(errorIcon);
    headerBox.add_child(errorLabel);

    // Error message (dynamic)
    this.errorMessageLabel = new St.Label({
      text: "An error occurred.\nPress Escape to close.",
      style: `font-size: 16px; color: ${COLORS.DANGER}; text-align: center;`,
    });

    // Close button
    const buttonBox = new St.Bin({
      x_align: Clutter.ActorAlign.CENTER,
    });

    const closeButton = createHoverButton(
      "Close",
      COLORS.SECONDARY,
      COLORS.DARK_GRAY
    );
    this.buttonConnections.push({
      widget: closeButton,
      signalId: closeButton.connect("clicked", () => this.onCancel?.()),
    });

    buttonBox.set_child(closeButton);

    // Add to container
    this.errorContainer.add_child(headerBox);
    this.errorContainer.add_child(this.errorMessageLabel);
    this.errorContainer.add_child(buttonBox);
  }

  /**
   * Hide all state containers
   * @private
   */
  _hideAllContainers() {
    this.recordingContainer.hide();
    this.processingContainer.hide();
    this.previewContainer.hide();
    this.errorContainer.hide();
  }

  /**
   * Show RECORDING state - just toggle visibility + update data
   * @param {string} timeText - Formatted time text
   * @param {number} progress - Progress 0-1
   */
  showRecording(timeText, progress) {
    this.logger.debug(`showRecording: ${timeText}, progress=${progress.toFixed(2)}`);
    this._hideAllContainers();

    // Update dynamic content
    this.recordingTimeLabel.set_text(timeText);

    // Determine bar color
    let barColor = COLORS.PRIMARY;
    if (progress > 0.95) barColor = COLORS.DANGER;
    else if (progress > 0.8) barColor = COLORS.WARNING;

    this.recordingProgressBar.set_style(`
      background-color: ${barColor};
      border-radius: 4px;
      height: 30px;
      width: ${Math.floor(380 * progress)}px;
    `);

    // Show recording container
    this.recordingContainer.show();
  }

  /**
   * Show PROCESSING state - just toggle visibility
   */
  showProcessing() {
    this.logger.debug("showProcessing");
    this._hideAllContainers();
    this.processingContainer.show();
  }

  /**
   * Show PREVIEW state - just toggle visibility + update text
   * @param {string} text - Text to display for editing
   */
  showPreview(text) {
    this.logger.debug(`showPreview: ${text.length} chars`);
    this._hideAllContainers();

    // Update text
    this.previewTextEntry.set_text(text);

    // Select all text
    if (this.focusTimeoutId) {
      GLib.Source.remove(this.focusTimeoutId);
    }
    this.focusTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      const clutterText = this.previewTextEntry.get_clutter_text();
      clutterText.set_selection(0, text.length);
      this.focusTimeoutId = null;
      return false;
    });

    // Show preview container
    this.previewContainer.show();
  }

  /**
   * Show ERROR state - just toggle visibility + update message
   * @param {string} message - Error message to display
   */
  showError(message) {
    this.logger.debug(`showError: ${message}`);
    this._hideAllContainers();

    // Update error message
    this.errorMessageLabel.set_text(`${message}\nPress Escape to close.`);

    // Show error container
    this.errorContainer.show();
  }

  /**
   * Open the dialog
   */
  open() {
    this.logger.info("Opening modal dialog");

    Main.layoutManager.addTopChrome(this.modalBarrier);

    const monitor = Main.layoutManager.primaryMonitor;
    this.modalBarrier.set_position(monitor.x, monitor.y);
    this.modalBarrier.set_size(monitor.width, monitor.height);

    this.container.set_position(
      (monitor.width - 450) / 2,
      (monitor.height - 300) / 2
    );

    this.modalBarrier.show();

    // Focus
    if (this.focusTimeoutId) {
      GLib.Source.remove(this.focusTimeoutId);
    }
    this.focusTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
      try {
        if (this.modalBarrier?.get_parent?.()) {
          this.modalBarrier.grab_key_focus();
        }
      } catch (error) {
        this.logger.debug("Focus grab failed (non-critical):", error.message);
      }
      this.focusTimeoutId = null;
      return false;
    });
  }

  /**
   * Close the dialog (hides and removes from screen, but doesn't destroy)
   */
  close() {
    this.logger.info("Closing modal dialog");

    if (!this.modalBarrier) {
      this.logger.debug("Modal already cleaned up");
      return;
    }

    // Clean up timeouts
    if (this.focusTimeoutId) {
      GLib.Source.remove(this.focusTimeoutId);
      this.focusTimeoutId = null;
    }

    // Hide and remove from layout (but keep object alive for reuse)
    try {
      this.modalBarrier.hide();

      if (this.modalBarrier.get_parent?.()) {
        try {
          Main.layoutManager.removeChrome(this.modalBarrier);
        } catch (chromeError) {
          this.logger.debug(
            "Chrome removal failed, trying parent:",
            chromeError.message
          );
          const parent = this.modalBarrier.get_parent();
          if (parent) {
            parent.remove_child(this.modalBarrier);
          }
        }
      }
    } catch (error) {
      this.logger.debug("Cleanup error:", error.message);
    }
  }

  /**
   * Check if dialog is open
   */
  isOpen() {
    return this.modalBarrier?.get_parent?.() !== null;
  }

  /**
   * Destroy the dialog (fully cleanup, can't be reused)
   */
  destroy() {
    this.logger.info("Destroying modal dialog");

    if (!this.modalBarrier) {
      return;
    }

    // Clean up timeouts
    if (this.focusTimeoutId) {
      GLib.Source.remove(this.focusTimeoutId);
      this.focusTimeoutId = null;
    }

    // Disconnect keyboard handler
    if (this.keyboardHandlerId) {
      try {
        if (this.modalBarrier?.disconnect) {
          this.modalBarrier.disconnect(this.keyboardHandlerId);
        }
      } catch (error) {
        this.logger.debug("Keyboard handler disconnect failed:", error.message);
      }
      this.keyboardHandlerId = null;
    }

    // Disconnect all button signals
    for (const connection of this.buttonConnections) {
      try {
        if (connection.widget && connection.signalId) {
          connection.widget.disconnect(connection.signalId);
        }
      } catch (error) {
        this.logger.debug("Button signal disconnect failed:", error.message);
      }
    }
    this.buttonConnections = [];

    // Hide, remove, and destroy
    const modal = this.modalBarrier;
    this.modalBarrier = null;

    try {
      modal.hide();

      if (modal.get_parent?.()) {
        try {
          Main.layoutManager.removeChrome(modal);
        } catch (chromeError) {
          this.logger.debug(
            "Chrome removal failed, trying parent:",
            chromeError.message
          );
          const parent = modal.get_parent();
          if (parent) {
            parent.remove_child(modal);
          }
        }
      }

      if (modal.destroy) {
        modal.destroy();
      }
    } catch (error) {
      this.logger.debug("Destroy error:", error.message);
    }
  }
}
