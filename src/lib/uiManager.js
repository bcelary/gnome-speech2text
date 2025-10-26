import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { Logger } from "./logger.js";

export class UIManager {
  constructor(extensionCore) {
    this.logger = new Logger("UI");
    this.extensionCore = extensionCore;
    this.icon = null;
    this.iconWidget = null;
    this.label = null;
    this._buttonPressSignalId = null;
  }

  initialize() {
    // Create the panel button
    this.icon = new PanelMenu.Button(0.0, "Speech2Text Indicator");

    // Create box container for icon + label
    const box = new St.BoxLayout({
      style_class: "panel-status-menu-box",
    });

    // Set up the icon
    this.iconWidget = new St.Icon({
      icon_name: "radio-checked-symbolic",
      style_class: "system-status-icon",
    });
    box.add_child(this.iconWidget);

    // Create label for panel indicator countdown
    this.label = new St.Label({
      text: "",
      y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(this.label);

    // Add box to panel button
    this.icon.add_child(box);

    // Create popup menu
    this.createPopupMenu();

    // Add click handler for left-click recording toggle
    this._setupClickHandler();

    // Add to panel (remove existing first to avoid conflicts)
    this._addToPanel();

    this.logger.info("UI initialized");
  }

  createPopupMenu() {
    // Settings menu item - opens standard GNOME extension preferences
    const settingsItem = new PopupMenu.PopupMenuItem("Settings");
    settingsItem.connect("activate", () => {
      this.openPreferences();
    });
    this.icon.menu.addMenuItem(settingsItem);
  }

  _setupClickHandler() {
    // Store reference to 'this' to avoid context issues in callback
    const self = this;
    this._buttonPressSignalId = this.icon.connect(
      "button-press-event",
      (_actor, event) => {
        const buttonPressed = event.get_button();

        if (buttonPressed === 1) {
          // Left click - toggle recording
          self.icon.menu.close(true);
          self.logger.debug("Click handler triggered");

          // Use direct reference to this extension instance
          self.extensionCore.toggleRecording();
          return Clutter.EVENT_STOP;
        } else if (buttonPressed === 3) {
          // Right click - show menu
          return Clutter.EVENT_PROPAGATE;
        }

        return Clutter.EVENT_STOP;
      }
    );
  }

  _addToPanel() {
    try {
      // Remove any existing indicator first
      Main.panel.statusArea["speech2text-indicator"]?.destroy();
      delete Main.panel.statusArea["speech2text-indicator"];
    } catch (e) {
      this.logger.debug("No existing indicator to remove:", e.message);
    }

    Main.panel.addToStatusArea("speech2text-indicator", this.icon);
  }

  openPreferences() {
    try {
      this.extensionCore.openPreferences();
    } catch (e) {
      this.logger.error("Failed to open preferences:", e);
      Main.notify("Speech2Text", "Failed to open preferences window");
    }
  }

  setPanelLabel(text, style = "") {
    if (this.label) {
      this.label.set_text(text);
      this.label.set_style(style);
    }
  }

  clearPanelLabel() {
    if (this.label) {
      this.label.set_text("");
      this.label.set_style("");
    }
  }

  cleanup() {
    this.logger.info("Cleaning up UI");
    // Clear panel label
    this.clearPanelLabel();
    // Disconnect signal handler
    if (this._buttonPressSignalId && this.icon) {
      try {
        this.icon.disconnect(this._buttonPressSignalId);
        this.logger.debug("Button press signal disconnected");
      } catch (error) {
        this.logger.debug(
          "Error disconnecting button press signal:",
          error.message
        );
      }
      this._buttonPressSignalId = null;
    }

    // Clean up panel icon (this.icon and statusArea reference the same object)
    try {
      if (this.icon) {
        this.logger.debug("Removing panel icon from status area");
        // Only destroy once - this.icon and statusArea["speech2text-indicator"] are the same object
        this.icon.destroy();
        this.icon = null;
        // Clean up the reference in statusArea
        delete Main.panel.statusArea["speech2text-indicator"];
      }
    } catch (error) {
      this.logger.debug("Error cleaning up panel icon:", error.message);
      // Force cleanup even if there are errors
      this.icon = null;
      try {
        delete Main.panel.statusArea["speech2text-indicator"];
      } catch {
        // Ignore secondary cleanup errors
      }
    }
  }
}
