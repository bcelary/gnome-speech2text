import * as Main from "resource:///org/gnome/shell/ui/main.js";

/**
 * Dumb ToastNotification component - just shows notifications when told
 * No logic, no state management
 */
export class ToastNotification {
  /**
   * Show a toast notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   */
  static show(title, message) {
    Main.notify(title, message);
  }

  /**
   * Show processing notification
   */
  static showProcessing() {
    Main.notify("Speech2Text", "Transcribing...");
  }

  /**
   * Show error notification
   * @param {string} message - Error message
   */
  static showError(message) {
    Main.notify("Speech2Text Error", message);
  }

  /**
   * Show no speech detected notification
   */
  static showNoSpeech() {
    Main.notify("Speech2Text", "No speech detected");
  }

  /**
   * Show text copied notification
   */
  static showTextCopied() {
    Main.notify("Speech2Text", "Text copied to clipboard!");
  }

  /**
   * Show text typed notification
   */
  static showTextTyped() {
    Main.notify("Speech2Text", "Text inserted!");
  }
}
