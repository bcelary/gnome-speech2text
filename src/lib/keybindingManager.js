import Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Logger } from "./logger.js";

export class KeybindingManager {
  constructor(extensionCore) {
    this.logger = new Logger("Keybinding");
    this.extensionCore = extensionCore;
    this.currentKeybinding = null;
  }

  setupKeybinding() {
    // Remove existing keybinding if it exists
    Main.wm.removeKeybinding("toggle-recording");

    // Get shortcut from settings
    const shortcuts = this.extensionCore.settings.get_strv("toggle-recording");
    if (shortcuts.length > 0) {
      this.currentKeybinding = shortcuts[0];
    } else {
      this.currentKeybinding = "<Super><Alt>space";
      this.extensionCore.settings.set_strv("toggle-recording", [
        this.currentKeybinding,
      ]);
    }

    // Register keybinding
    // Store reference to 'this' to avoid context issues in callback
    const self = this;
    Main.wm.addKeybinding(
      "toggle-recording",
      this.extensionCore.settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL,
      () => {
        self.logger.debug("Keyboard shortcut triggered");
        // Use direct reference to this extension instance
        self.extensionCore.toggleRecording();
      }
    );
    this.logger.info(`Keybinding registered: ${this.currentKeybinding}`);
  }

  cleanup() {
    this.logger.info("Cleaning up keybinding");
    // Remove keybinding
    Main.wm.removeKeybinding("toggle-recording");
    this.currentKeybinding = null;
  }
}
