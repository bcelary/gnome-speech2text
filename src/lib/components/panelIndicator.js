import GLib from "gi://GLib";
import { COLORS } from "../constants.js";

/**
 * Dumb PanelIndicator component - just displays icon/text when told
 * No logic, no state management, no decisions
 *
 * Expects to receive:
 * - iconWidget: St.Icon widget to manipulate
 * - label: St.Label widget to manipulate
 */
export class PanelIndicator {
  constructor(iconWidget, label) {
    this.iconWidget = iconWidget;
    this.label = label;
    this.timerInterval = null;
    this.originalIconName = null;
  }

  /**
   * Show IDLE state - default icon, white color, no text
   */
  showIdle() {
    if (this.iconWidget) {
      this.iconWidget.icon_name = "radio-checked-symbolic";
      this.iconWidget.set_style("");
    }
    if (this.label) {
      this.label.set_text("");
      this.label.set_style("");
    }
    this._stopTimer();
  }

  /**
   * Show RECORDING state - red icon, countdown timer in mm:ss format
   * @param {number} startTime - Recording start time (Date.now())
   * @param {number} maxDuration - Max duration in seconds
   */
  showRecording(startTime, maxDuration) {
    // Save original icon
    if (this.iconWidget && !this.originalIconName) {
      this.originalIconName = this.iconWidget.icon_name;
    }

    // Set red color
    if (this.iconWidget) {
      this.iconWidget.set_style(`color: ${COLORS.PRIMARY};`);
    }

    // Start countdown timer
    this._updateCountdown(startTime, maxDuration);
    this._stopTimer(); // Clear any existing timer
    this.timerInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._updateCountdown(startTime, maxDuration);
      return GLib.SOURCE_CONTINUE;
    });
  }

  /**
   * Show PROCESSING state - spinner icon, red color, no text
   */
  showProcessing() {
    this._stopTimer();

    if (this.iconWidget) {
      this.iconWidget.icon_name = "emblem-synchronizing-symbolic";
      this.iconWidget.set_style(`color: ${COLORS.PRIMARY};`);
    }

    if (this.label) {
      this.label.set_text("");
      this.label.set_style("");
    }
  }

  /**
   * Update countdown timer display
   * @private
   */
  _updateCountdown(startTime, maxDuration) {
    if (!this.label) return;

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = Math.max(0, maxDuration - elapsed);

    // Format as mm:ss
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const text = `${mins}:${secs.toString().padStart(2, "0")}`;

    // Red color when ≤10s
    const style = remaining <= 10 ? `color: ${COLORS.DANGER};` : "";

    this.label.set_text(text);
    this.label.set_style(style);

    // Stop timer when countdown reaches 0
    if (remaining <= 0) {
      this._stopTimer();
    }
  }

  /**
   * Stop and clean up timer
   * @private
   */
  _stopTimer() {
    if (this.timerInterval) {
      GLib.Source.remove(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this._stopTimer();
    this.showIdle();
    this.originalIconName = null;
  }
}
