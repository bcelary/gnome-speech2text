import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Logger } from "../logger.js";

/**
 * Dumb ToastNotification component - just shows notifications when told
 * No logic, no state management
 */
export class ToastNotification {
  constructor() {
    this.logger = new Logger("ToastNotification");
  }

  /**
   * Show processing notification
   */
  showProcessing() {
    this.logger.debug("showProcessing");
    Main.notify("Speech2Text", "Transcribing...");
  }

  /**
   * Show error notification
   * @param {string} message - Error message
   */
  showError(message) {
    this.logger.debug(`showError: ${message}`);
    Main.notify("Speech2Text Error", message);
  }

  /**
   * Show no speech detected notification
   */
  showNoSpeech() {
    this.logger.debug("showNoSpeech");
    Main.notify("Speech2Text", "No speech detected");
  }

  /**
   * Show text copied notification
   */
  showTextCopied() {
    this.logger.debug("showTextCopied");
    Main.notify("Speech2Text", "Text copied to clipboard!");
  }

  /**
   * Show text typed notification
   */
  showTextTyped() {
    this.logger.debug("showTextTyped");
    Main.notify("Speech2Text", "Text inserted!");
  }

  /**
   * Show transcription cancelled notification
   */
  showTranscriptionCancelled() {
    this.logger.debug("showTranscriptionCancelled");
    Main.notify("Speech2Text", "Transcription cancelled");
  }
}
