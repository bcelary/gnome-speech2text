import GLib from "gi://GLib";
import Meta from "gi://Meta";
import St from "gi://St";

import { Logger } from "./logger.js";
import { ModalDialog } from "./components/modalDialog.js";
import { PanelIndicator } from "./components/panelIndicator.js";
import { ToastNotification } from "./components/toastNotification.js";

// UI States
const State = {
  IDLE: "idle",
  RECORDING: "recording",
  PROCESSING: "processing",
  PREVIEW: "preview",
  ERROR: "error",
};

/**
 * UICoordinator - Single source of truth for UI state
 * Maintains state, data, and tells dumb components what to show
 */
export class UICoordinator {
  constructor(uiManager, dbusManager) {
    this.logger = new Logger("UICoordinator");
    this.uiManager = uiManager;
    this.dbusManager = dbusManager;

    // State
    this.currentState = State.IDLE;
    this.currentRecordingId = null;
    this.transcribedText = "";
    this.errorMessage = "";

    // Recording timing
    this.recordingStartTime = null;
    this.maxDuration = 0;
    this.recordingTimerInterval = null;

    // Components
    this.panelIndicator = null;
    this.modalDialog = null;

    // Settings
    this.settings = null;
  }

  initialize() {
    // Create panel indicator (always exists)
    this.panelIndicator = new PanelIndicator(
      this.uiManager.iconWidget,
      this.uiManager.label
    );

    // Create modal dialog ONCE - reuse throughout lifecycle
    this.modalDialog = new ModalDialog();
    this._setupModalCallbacks();

    // Start in IDLE state
    this._transitionTo(State.IDLE);
  }

  /**
   * Force reset to IDLE state (used during startup/recovery)
   */
  forceReset() {
    this.logger.info("Forcing UICoordinator reset to IDLE");

    // Clear any timers
    if (this.recordingTimerInterval) {
      GLib.Source.remove(this.recordingTimerInterval);
      this.recordingTimerInterval = null;
    }

    // Close any open dialogs
    if (this.modalDialog && this.modalDialog.isOpen()) {
      this.modalDialog.close();
    }

    // Reset state
    this.currentRecordingId = null;
    this.transcribedText = "";
    this.errorMessage = "";
    this.recordingStartTime = null;
    this.maxDuration = 0;

    // Transition to IDLE
    this._transitionTo(State.IDLE);
  }

  /**
   * Start recording
   * @param {Gio.Settings} settings - Extension settings
   */
  async startRecording(settings) {
    this.logger.info(
      `startRecording called, current state: ${this.currentState}`
    );
    if (this.currentState !== State.IDLE) {
      this.logger.warn(
        `Cannot start recording from state: ${this.currentState}`
      );
      return false;
    }

    this.settings = settings;

    // Check service availability
    const connectionReady = await this.dbusManager.ensureConnection();
    if (!connectionReady) {
      this._showCriticalError(
        "Speech-to-text service is not available.\nPlease install the WhisperCpp service."
      );
      return false;
    }

    const serviceStatus = await this.dbusManager.checkServiceStatus();
    if (!serviceStatus.available) {
      this._showCriticalError(serviceStatus.error);
      return false;
    }

    // Start recording via D-Bus
    try {
      const recordingDuration = settings.get_int("recording-duration");
      const postRecordingAction = settings.get_string("post-recording-action");
      const isWayland = Meta.is_wayland_compositor();

      // Wayland fallback
      let effectiveAction = postRecordingAction;
      if (
        isWayland &&
        (postRecordingAction === "type_only" ||
          postRecordingAction === "type_and_copy")
      ) {
        effectiveAction =
          postRecordingAction === "type_and_copy" ? "copy_only" : "preview";
      }

      const recordingId = await this.dbusManager.startRecording(
        recordingDuration,
        effectiveAction
      );

      this.currentRecordingId = recordingId;
      this.recordingStartTime = Date.now();
      this.maxDuration = recordingDuration;

      // Transition to RECORDING state
      this._transitionTo(State.RECORDING);

      return true;
    } catch (error) {
      this.logger.error("Error starting recording:", error);
      ToastNotification.showError(
        "Failed to start recording. Please try again."
      );
      return false;
    }
  }

  /**
   * Stop recording manually
   */
  async stopRecording() {
    if (this.currentState !== State.RECORDING) {
      this.logger.debug(
        `Cannot stop recording from state: ${this.currentState}`
      );
      return false;
    }

    try {
      await this.dbusManager.stopRecording(this.currentRecordingId);
      this._transitionTo(State.PROCESSING);
      return true;
    } catch (error) {
      this.logger.error("Error stopping recording:", error);
      this._handleError("Failed to stop recording");
      return false;
    }
  }

  /**
   * Cancel recording/processing
   */
  async cancelRecording() {
    if (
      this.currentState === State.IDLE ||
      this.currentState === State.PREVIEW
    ) {
      // Just close dialog if in preview
      if (this.currentState === State.PREVIEW) {
        this._transitionTo(State.IDLE);
      }
      return;
    }

    const wasProcessing = this.currentState === State.PROCESSING;
    const recordingId = this.currentRecordingId;
    this.currentRecordingId = null;

    try {
      await this.dbusManager.cancelRecording(recordingId);

      // Show notification if cancelling during transcription (unless silent mode)
      if (wasProcessing && !this._isSilentMode()) {
        ToastNotification.showTranscriptionCancelled();
      }
    } catch (error) {
      this.logger.debug("Error canceling recording:", error.message);
    }

    this._transitionTo(State.IDLE);
  }

  /**
   * Handle recording completed signal from service
   */
  handleRecordingCompleted(recordingId) {
    if (recordingId !== this.currentRecordingId) {
      this.logger.debug("Ignoring recording_completed for different recording");
      return;
    }

    // Only transition if still in recording state
    if (this.currentState === State.RECORDING) {
      this._transitionTo(State.PROCESSING);
    }
  }

  /**
   * Check if current mode is silent
   * @private
   */
  _isSilentMode() {
    return this.settings?.get_string("progress-display") === "silent";
  }

  /**
   * Handle transcription ready signal from service
   */
  handleTranscriptionReady(recordingId, text) {
    if (recordingId !== this.currentRecordingId) {
      this.logger.debug("Ignoring transcription_ready for different recording");
      return;
    }

    // Only handle if in processing state
    if (this.currentState !== State.PROCESSING) {
      this.logger.debug(`Not in processing state, ignoring transcription`);
      return;
    }

    // Clear recording ID
    this.currentRecordingId = null;

    // Handle empty transcription
    if (!text || text.trim().length === 0) {
      if (!this._isSilentMode()) {
        ToastNotification.showNoSpeech();
      }
      this._transitionTo(State.IDLE);
      return;
    }

    // Check if we should show preview
    const postRecordingAction = this.settings.get_string(
      "post-recording-action"
    );
    const isWayland = Meta.is_wayland_compositor();

    const shouldShowPreview =
      postRecordingAction === "preview" ||
      (isWayland &&
        (postRecordingAction === "type_only" ||
          postRecordingAction === "type_and_copy"));

    if (shouldShowPreview) {
      // Show preview
      this.transcribedText = text;
      this._transitionTo(State.PREVIEW);
    } else {
      // Auto-action handled by service, just show toast and return to idle
      this._transitionTo(State.IDLE);
    }
  }

  /**
   * Handle recording error signal from service
   */
  handleRecordingError(recordingId, errorMessage) {
    if (recordingId !== this.currentRecordingId) {
      this.logger.debug("Ignoring recording_error for different recording");
      return;
    }

    this.currentRecordingId = null;
    this._handleError(errorMessage);
  }

  /**
   * Handle text typed/copied signals (for toast notifications)
   */
  handleTextTyped() {
    ToastNotification.showTextTyped();
  }

  handleTextCopied() {
    ToastNotification.showTextCopied();
  }

  /**
   * Insert text from preview dialog
   */
  async insertText(text) {
    try {
      await this.dbusManager.typeText(text, false);
      this._transitionTo(State.IDLE);
    } catch (error) {
      this.logger.error("Error typing text:", error);
      ToastNotification.showError("Failed to insert text.");
    }
  }

  /**
   * Copy text from preview dialog
   */
  copyText(text) {
    try {
      const clipboard = St.Clipboard.get_default();
      clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
      ToastNotification.showTextCopied();
      this._transitionTo(State.IDLE);
    } catch (error) {
      this.logger.error("Error copying text:", error);
      ToastNotification.showError("Failed to copy to clipboard");
    }
  }

  /**
   * Main state transition logic - single source of truth
   * @private
   */
  _transitionTo(newState) {
    const oldState = this.currentState;
    this.logger.info(`State transition: ${oldState} -> ${newState}`);
    this.currentState = newState;
    this._render();
    this.logger.debug(
      `State transition complete: ${oldState} -> ${newState}, current state: ${this.currentState}`
    );
  }

  /**
   * Render current state - tells components what to show
   * @private
   */
  _render() {
    const progressDisplay =
      this.settings?.get_string("progress-display") || "normal";

    this.logger.debug(
      `Rendering state: ${this.currentState}, progress: ${progressDisplay}`
    );

    switch (this.currentState) {
      case State.IDLE:
        this._renderIdle();
        break;

      case State.RECORDING:
        this._renderRecording(progressDisplay);
        break;

      case State.PROCESSING:
        this._renderProcessing(progressDisplay);
        break;

      case State.PREVIEW:
        this._renderPreview();
        break;

      case State.ERROR:
        this._renderError();
        break;
    }
  }

  /**
   * Render IDLE state
   * @private
   */
  _renderIdle() {
    // Panel: default icon, white, no text
    this.panelIndicator.showIdle();

    // Modal: close if open
    if (this.modalDialog?.isOpen()) {
      this.modalDialog.close();
    }

    // Clear timer
    this._stopRecordingTimer();
  }

  /**
   * Render RECORDING state
   * @private
   */
  _renderRecording(progressDisplay) {
    // Panel: ALWAYS show (red icon + timer)
    this.panelIndicator.showRecording(
      this.recordingStartTime,
      this.maxDuration
    );

    // Modal: show if "always" or "focused" mode
    if (progressDisplay === "always" || progressDisplay === "focused") {
      // Update content FIRST (containers pre-built, just toggle + update)
      const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
      const remaining = Math.max(0, this.maxDuration - elapsed);
      const progress = Math.min(elapsed / this.maxDuration, 1.0);

      const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
      };

      const timeText = `${formatTime(elapsed)} / ${formatTime(
        this.maxDuration
      )} (${formatTime(remaining)} left)`;

      this.modalDialog.showRecording(timeText, progress);

      // THEN open modal (content already visible)
      if (!this.modalDialog.isOpen()) {
        this.modalDialog.open();
      }

      // Start timer to update modal
      this._startRecordingTimer();
    } else {
      // Panel mode (normal/silent): don't show modal during recording
      if (this.modalDialog.isOpen()) {
        this.modalDialog.close();
      }
    }
  }

  /**
   * Render PROCESSING state
   * @private
   */
  _renderProcessing(progressDisplay) {
    // Panel: ALWAYS show (spinner icon)
    this.panelIndicator.showProcessing();

    // Stop recording timer
    this._stopRecordingTimer();

    // Modal/Toast/Silent: based on progress display setting
    switch (progressDisplay) {
      case "always":
        // Build processing content FIRST
        this.modalDialog.showProcessing();

        // THEN open modal with content ready
        if (!this.modalDialog.isOpen()) {
          this.modalDialog.open();
        }
        break;

      case "focused":
        // Close modal (was shown during recording), panel only
        if (this.modalDialog.isOpen()) {
          this.modalDialog.close();
        }
        // No toast - user dismissed recording, let transcription happen in background
        break;

      case "normal":
        // Close modal if open
        if (this.modalDialog.isOpen()) {
          this.modalDialog.close();
        }

        // Show toast
        ToastNotification.showProcessing();
        break;

      case "silent":
        // Just panel indicator, no modal/toast
        if (this.modalDialog.isOpen()) {
          this.modalDialog.close();
        }
        break;
    }
  }

  /**
   * Render PREVIEW state
   * @private
   */
  _renderPreview() {
    // Panel: back to idle
    this.panelIndicator.showIdle();

    // Modal: ALWAYS show for preview
    if (!this.modalDialog.isOpen()) {
      this.modalDialog.open();
    }

    this.modalDialog.showPreview(this.transcribedText);
  }

  /**
   * Render ERROR state
   * @private
   */
  _renderError() {
    // Panel: back to idle
    this.panelIndicator.showIdle();

    // Show error in modal (for critical errors) or toast (for non-critical)
    const isCritical =
      this.errorMessage.includes("service") ||
      this.errorMessage.includes("unavailable") ||
      this.errorMessage.includes("install");

    if (isCritical) {
      if (!this.modalDialog.isOpen()) {
        this.modalDialog.open();
      }

      this.modalDialog.showError(this.errorMessage);
    } else {
      // Non-critical: toast
      ToastNotification.showError(this.errorMessage);
      this._transitionTo(State.IDLE);
    }
  }

  /**
   * Setup modal dialog callbacks
   * @private
   */
  _setupModalCallbacks() {
    if (!this.modalDialog) return;

    this.modalDialog.onCancel = () => {
      this.logger.debug("Modal cancel callback");
      this.cancelRecording();
    };

    this.modalDialog.onStop = () => {
      this.logger.debug("Modal stop callback");
      this.stopRecording();
    };

    this.modalDialog.onInsert = (text) => {
      this.logger.debug("Modal insert callback");
      this.insertText(text);
    };

    this.modalDialog.onCopy = (text) => {
      this.logger.debug("Modal copy callback");
      this.copyText(text);
    };
  }

  /**
   * Start timer to update recording modal
   * @private
   */
  _startRecordingTimer() {
    this._stopRecordingTimer();

    this.recordingTimerInterval = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      1000,
      () => {
        if (
          this.currentState === State.RECORDING &&
          this.modalDialog?.isOpen()
        ) {
          const elapsed = Math.floor(
            (Date.now() - this.recordingStartTime) / 1000
          );
          const remaining = Math.max(0, this.maxDuration - elapsed);
          const progress = Math.min(elapsed / this.maxDuration, 1.0);

          const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, "0")}`;
          };

          const timeText = `${formatTime(elapsed)} / ${formatTime(
            this.maxDuration
          )} (${formatTime(remaining)} left)`;

          this.modalDialog.showRecording(timeText, progress);

          return elapsed < this.maxDuration;
        }
        return false;
      }
    );
  }

  /**
   * Stop recording timer
   * @private
   */
  _stopRecordingTimer() {
    if (this.recordingTimerInterval) {
      GLib.Source.remove(this.recordingTimerInterval);
      this.recordingTimerInterval = null;
    }
  }

  /**
   * Handle error (non-critical by default)
   * @private
   */
  _handleError(message) {
    this.errorMessage = message;
    this._transitionTo(State.ERROR);
  }

  /**
   * Show critical error (service unavailable, etc.)
   * @private
   */
  _showCriticalError(message) {
    // Don't show duplicate errors if already in ERROR state
    if (this.currentState === State.ERROR) {
      logger.debug("Already in ERROR state, ignoring duplicate error");
      return;
    }
    this.errorMessage = message;
    this._transitionTo(State.ERROR);
  }

  /**
   * Check if currently recording
   */
  isRecording() {
    return this.currentState === State.RECORDING;
  }

  /**
   * Check if currently processing
   */
  isProcessing() {
    return this.currentState === State.PROCESSING;
  }

  /**
   * Clean up
   */
  cleanup() {
    this.logger.debug("Cleaning up UICoordinator");

    // Stop timers
    this._stopRecordingTimer();

    // Clean up components
    if (this.panelIndicator) {
      this.panelIndicator.destroy();
      this.panelIndicator = null;
    }

    if (this.modalDialog) {
      this.modalDialog.destroy();
      this.modalDialog = null;
    }

    // Reset state
    this.currentState = State.IDLE;
    this.currentRecordingId = null;
    this.transcribedText = "";
    this.errorMessage = "";
  }
}
