import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Logger } from "./logger.js";

const logger = new Logger("State");

export class RecordingStateManager {
  constructor(dbusManager) {
    this.dbusManager = dbusManager;
    this.currentRecordingId = null;
    this.recordingDialog = null;
    this.lastRecordingSettings = null; // Store settings for transcription handling
    this.isCancelled = false; // Flag to track if recording was cancelled (user action overrides service)
    this.handledSignals = new Set(); // Track processed signals to prevent duplicates
    this.recordingState = "idle"; // State machine: idle, recording, processing, completed, error
  }

  // Method to update dbusManager reference when extension recreates it
  updateDbusManager(dbusManager) {
    this.dbusManager = dbusManager;
  }

  /**
   * Validates if a signal should be processed based on common guard conditions
   * @param {string} recordingId - The recording ID from the signal
   * @param {string} signalType - Type of signal (e.g., "completed", "transcription", "error")
   * @param {string|string[]} expectedStates - Expected state(s) for this signal
   * @returns {boolean} - true if signal should be processed, false if it should be ignored
   */
  _validateSignal(recordingId, signalType, expectedStates) {
    const allowedStates = Array.isArray(expectedStates)
      ? expectedStates
      : [expectedStates];

    // GUARD 1: Check if recording was cancelled
    if (this.isCancelled) {
      logger.debug(`Recording was cancelled - ignoring ${signalType} signal`);
      return false;
    }

    // GUARD 2: Validate recording ID matches current recording
    if (recordingId !== this.currentRecordingId) {
      logger.debug(
        `Ignoring ${signalType} for ${recordingId}, current recording is ${this.currentRecordingId}`
      );
      return false;
    }

    // GUARD 3: Check valid state transition
    if (!allowedStates.includes(this.recordingState)) {
      logger.debug(
        `Invalid state for ${signalType}: ${this.recordingState}, expected one of [${allowedStates.join(", ")}]`
      );
      return false;
    }

    // GUARD 4: Prevent duplicate signal handling
    const signalKey = `${recordingId}:${signalType}`;
    if (this.handledSignals.has(signalKey)) {
      logger.debug(
        `Already handled ${signalType} for ${recordingId}, ignoring duplicate`
      );
      return false;
    }
    this.handledSignals.add(signalKey);

    return true;
  }

  async startRecording(settings) {
    // Check if already recording
    if (this.currentRecordingId || this.recordingState !== "idle") {
      logger.debug(
        `Cannot start recording: already in state ${this.recordingState}`
      );
      return false;
    }

    try {
      // Reset state for new recording session
      this.isCancelled = false;
      this.handledSignals.clear(); // Clear previous recording's signal tracking

      const recordingDuration = settings.get_int("recording-duration");
      const postRecordingAction = settings.get_string("post-recording-action");
      const isWayland = Meta.is_wayland_compositor();

      // Store settings for later use in transcription handling
      this.lastRecordingSettings = {
        recordingDuration,
        postRecordingAction,
      };

      // On Wayland, fallback to preview mode for auto-type actions
      let effectiveAction = postRecordingAction;
      if (
        isWayland &&
        (postRecordingAction === "type_only" ||
          postRecordingAction === "type_and_copy")
      ) {
        logger.debug(
          `Wayland detected: falling back from ${postRecordingAction} to preview mode`
        );
        // For Wayland, convert type-based actions to copy_only if they had copy, otherwise preview
        effectiveAction =
          postRecordingAction === "type_and_copy" ? "copy_only" : "preview";
      }

      logger.debug(
        `Starting recording: duration=${recordingDuration}, action=${effectiveAction}`
      );

      if (!this.dbusManager) {
        logger.error("RecordingStateManager: dbusManager is null");
        return false;
      }

      const recordingId = await this.dbusManager.startRecording(
        recordingDuration,
        effectiveAction
      );

      this.currentRecordingId = recordingId;

      // Transition to recording state
      this.recordingState = "recording";
      logger.debug(`State transition: idle → recording (ID: ${recordingId})`);

      logger.debug(`Recording started with ID: ${recordingId}`);
      return true;
    } catch (e) {
      logger.error(`Error starting recording: ${e}`);
      // Reset to idle on error
      this.recordingState = "idle";
      this.currentRecordingId = null;
      return false;
    }
  }

  async stopRecording() {
    if (!this.currentRecordingId || this.recordingState !== "recording") {
      logger.debug(`Cannot stop recording: state is ${this.recordingState}`);
      return false;
    }

    logger.debug(`Stopping recording: ${this.currentRecordingId}`);
    try {
      await this.dbusManager.stopRecording(this.currentRecordingId);

      // Transition to processing state
      this.recordingState = "processing";
      logger.debug(`State transition: recording → processing (manual stop)`);

      // Show processing state instead of closing dialog
      if (
        this.recordingDialog &&
        typeof this.recordingDialog.showProcessing === "function"
      ) {
        logger.debug("Showing processing state after manual stop");
        this.recordingDialog.showProcessing();
      }

      // Don't set currentRecordingId to null or close dialog yet
      // Wait for transcription to complete

      return true;
    } catch (e) {
      logger.error(`Error stopping recording: ${e}`);
      // On error, transition to error state
      this.recordingState = "error";
      logger.debug(`State transition: recording → error (stop failed)`);
      return false;
    }
  }

  handleRecordingCompleted(recordingId) {
    logger.debug(`=== RECORDING COMPLETED ===`);
    logger.debug(`Recording ID: ${recordingId}`);
    logger.debug(`Current Recording ID: ${this.currentRecordingId}`);
    logger.debug(`Current State: ${this.recordingState}`);
    logger.debug(`Dialog exists: ${!!this.recordingDialog}`);
    logger.debug(`Dialog phase: ${this.recordingDialog?.currentPhase}`);
    logger.debug(`Is cancelled: ${this.isCancelled}`);

    // Validate signal using common guard logic
    if (!this._validateSignal(recordingId, "completed", "recording")) {
      return;
    }

    // If we don't have a dialog, the recording was already stopped manually
    if (!this.recordingDialog) {
      logger.debug(
        `Recording ${recordingId} completed but dialog already closed (manual stop)`
      );
      // Still transition to processing state
      this.recordingState = "processing";
      return;
    }

    // Check the dialog's current phase to avoid overwriting the preview with processing UI.
    const currentPhase = this.recordingDialog.currentPhase;
    if (currentPhase === "preview" || currentPhase === "closed") {
      logger.debug(
        `Dialog already in ${currentPhase} phase - not showing processing`
      );
      return;
    }

    // Transition to processing state
    this.recordingState = "processing";
    logger.debug(`State transition: recording → processing`);

    // Show processing state only if we're still in recording phase
    if (typeof this.recordingDialog.showProcessing === "function") {
      logger.debug("Showing processing state after automatic completion");
      this.recordingDialog.showProcessing();
    } else {
      logger.debug(`ERROR: Dialog does not have showProcessing method`);
    }

    // Don't close the dialog here - wait for transcription
    // The dialog will be closed in handleTranscriptionReady based on settings
  }

  async cancelRecording() {
    if (!this.currentRecordingId) {
      return false;
    }

    logger.debug(
      "Recording cancelled by user - discarding audio without processing"
    );

    const previousState = this.recordingState;

    // Set cancellation flag FIRST to override any incoming service signals
    this.isCancelled = true;

    // Transition to idle state immediately (blocks all signal processing)
    this.recordingState = "idle";
    logger.debug(`State transition: ${previousState} → idle (cancelled)`);

    // Use the D-Bus service CancelRecording method to properly clean up
    try {
      await this.dbusManager.cancelRecording(this.currentRecordingId);
      logger.debug("D-Bus cancel recording completed successfully");
    } catch (error) {
      logger.debug("Error calling D-Bus cancel recording:", error.message);
      // Continue with local cleanup even if D-Bus call fails
    }

    // Clean up our local state
    this.currentRecordingId = null;

    // Close dialog on cancel with error handling
    if (this.recordingDialog) {
      try {
        logger.debug("Closing dialog after cancellation");
        this.recordingDialog.close();
      } catch (error) {
        logger.debug("Error closing dialog after cancellation:", error.message);
      } finally {
        this.recordingDialog = null;
      }
    }

    return true;
  }

  setRecordingDialog(dialog) {
    logger.debug(`=== SETTING RECORDING DIALOG ===`);
    logger.debug(`Previous dialog: ${!!this.recordingDialog}`);
    logger.debug(`New dialog: ${!!dialog}`);
    this.recordingDialog = dialog;
  }

  isRecording() {
    return this.currentRecordingId !== null;
  }

  getRecordingState() {
    return this.recordingState;
  }

  handleTranscriptionReady(recordingId, text, settings) {
    logger.debug(`=== TRANSCRIPTION READY ===`);
    logger.debug(`Recording ID: ${recordingId}`);
    logger.debug(`Current Recording ID: ${this.currentRecordingId}`);
    logger.debug(`Current State: ${this.recordingState}`);
    logger.debug(`Text: "${text}"`);
    logger.debug(`Dialog exists: ${!!this.recordingDialog}`);
    logger.debug(`Is cancelled: ${this.isCancelled}`);

    // Validate signal using common guard logic
    if (!this._validateSignal(recordingId, "transcription", "processing")) {
      return { action: "ignored", text: null };
    }

    // Check if transcription is empty (no speech detected)
    if (!text || text.trim().length === 0) {
      logger.debug("No speech detected - showing notification");
      Main.notify("Speech2Text", "No speech detected");

      // Transition to completed state
      this.recordingState = "completed";
      logger.debug(
        `State transition: processing → completed (empty transcription)`
      );

      // Close dialog and clean up
      if (this.recordingDialog) {
        this.recordingDialog.close();
        this.recordingDialog = null;
      }
      this.currentRecordingId = null;

      // Reset to idle state
      this.recordingState = "idle";
      return { action: "ignored", text: null };
    }

    // Use the post-recording action that was set when recording STARTED
    // (not the current setting, in case user changed it mid-recording)
    const postRecordingAction =
      this.lastRecordingSettings?.postRecordingAction ||
      settings.get_string("post-recording-action");
    const isWayland = Meta.is_wayland_compositor();

    logger.debug(`=== SETTINGS CHECK ===`);
    logger.debug(
      `postRecordingAction (from recording start): ${postRecordingAction}`
    );
    logger.debug(`isWayland: ${isWayland}`);

    // Determine if we should show preview
    // Show preview for: "preview", or on Wayland for type-based actions
    const shouldShowPreview =
      postRecordingAction === "preview" ||
      (isWayland &&
        (postRecordingAction === "type_only" ||
          postRecordingAction === "type_and_copy"));

    if (shouldShowPreview) {
      // PREVIEW MODE: Extension handles text insertion/copying via preview dialog
      // User can edit text and explicitly choose to insert or copy
      logger.debug("=== PREVIEW MODE ===");
      logger.debug(
        "Extension will handle text insertion/copying via preview dialog"
      );

      // Transition to completed state (preview is a "completed" state, user decides next action)
      this.recordingState = "completed";
      logger.debug(`State transition: processing → completed (preview mode)`);

      if (
        this.recordingDialog &&
        typeof this.recordingDialog.showPreview === "function"
      ) {
        logger.debug("Using existing dialog for preview");
        this.recordingDialog.showPreview(text);
        this.currentRecordingId = null;
        // Note: We stay in "completed" state until dialog closes, then cleanup() resets to "idle"
        return { action: "preview", text };
      } else {
        logger.debug("No dialog available, need to create preview dialog");
        this.currentRecordingId = null;
        // Reset to idle since we're done
        this.recordingState = "idle";
        return { action: "createPreview", text };
      }
    } else {
      // AUTO-ACTION MODE: Service handles ALL post-processing automatically
      // Extension should NOT insert/copy - service already did it in Recording._execute_post_processing()
      // Valid auto-actions: type_only, copy_only, type_and_copy
      logger.debug(`=== AUTO-ACTION MODE: ${postRecordingAction} ===`);
      logger.debug("Service handled all text insertion/copying automatically");

      // Transition to completed state
      this.recordingState = "completed";
      logger.debug(`State transition: processing → completed (auto-action)`);

      if (this.recordingDialog) {
        this.recordingDialog.close();
        this.recordingDialog = null;
      }
      this.currentRecordingId = null;

      // Reset to idle state
      this.recordingState = "idle";

      // Return "service_handled" to indicate service processed everything, extension does nothing
      return { action: "service_handled", text };
    }
  }

  handleRecordingError(recordingId, errorMessage) {
    logger.debug(`=== RECORDING ERROR ===`);
    logger.debug(`Recording ID: ${recordingId}`);
    logger.debug(`Current Recording ID: ${this.currentRecordingId}`);
    logger.debug(`Current State: ${this.recordingState}`);
    logger.debug(`Error: ${errorMessage}`);
    logger.debug(`Is cancelled: ${this.isCancelled}`);

    // Validate signal using common guard logic (errors can occur in "recording" or "processing" states)
    if (
      !this._validateSignal(recordingId, "error", ["recording", "processing"])
    ) {
      return;
    }

    // Transition to error state
    this.recordingState = "error";
    logger.debug(`State transition: ${this.recordingState} → error`);

    // Show error in dialog if available
    if (
      this.recordingDialog &&
      typeof this.recordingDialog.showError === "function"
    ) {
      this.recordingDialog.showError(errorMessage);
    } else {
      logger.debug("No dialog available for error display");
      // Show notification if no dialog
      Main.notify("Speech2Text Error", errorMessage);
    }

    // Clean up state
    this.currentRecordingId = null;

    // Reset to idle state after error
    this.recordingState = "idle";
  }

  cleanup() {
    logger.debug("Cleaning up recording state manager");
    logger.debug(`Current state before cleanup: ${this.recordingState}`);

    // Reset all state
    this.currentRecordingId = null;
    this.isCancelled = false;
    this.lastRecordingSettings = null;
    this.handledSignals.clear(); // Clear signal tracking

    // Reset state machine to idle
    const previousState = this.recordingState;
    this.recordingState = "idle";
    logger.debug(`State transition: ${previousState} → idle (cleanup)`);

    // Clean up dialog with error handling
    if (this.recordingDialog) {
      try {
        logger.debug("Closing recording dialog during cleanup");
        this.recordingDialog.close();
      } catch (error) {
        logger.debug(
          "Error closing recording dialog during cleanup:",
          error.message
        );
      } finally {
        this.recordingDialog = null;
      }
    }
  }
}
