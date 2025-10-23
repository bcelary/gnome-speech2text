import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Logger } from "./logger.js";

const logger = new Logger("State");

export class RecordingStateManager {
  constructor(dbusManager) {
    this.dbusManager = dbusManager;
    this.currentRecordingId = null;
    this.recordingDialog = null;
  }

  // Method to update dbusManager reference when extension recreates it
  updateDbusManager(dbusManager) {
    this.dbusManager = dbusManager;
  }

  async startRecording(settings) {
    // Check if already recording
    if (this.currentRecordingId) {
      logger.debug("Cannot start recording: already recording");
      return false;
    }

    try {
      const recordingDuration = settings.get_int("recording-duration");
      const postRecordingAction = settings.get_string("post-recording-action");
      const isWayland = Meta.is_wayland_compositor();

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
      logger.debug(`Recording started with ID: ${recordingId}`);
      return true;
    } catch (e) {
      logger.error(`Error starting recording: ${e}`);
      this.currentRecordingId = null;
      return false;
    }
  }

  async stopRecording() {
    if (!this.currentRecordingId) {
      logger.debug("Cannot stop recording: no recording in progress");
      return false;
    }

    logger.debug(`Stopping recording: ${this.currentRecordingId}`);
    try {
      await this.dbusManager.stopRecording(this.currentRecordingId);

      // Delegate to dialog to show processing state
      this.recordingDialog?.showProcessing();

      return true;
    } catch (e) {
      logger.error(`Error stopping recording: ${e}`);
      Main.notify(
        "Speech2Text Error",
        `Failed to stop recording: ${e.message || e}`
      );

      // Clean up on error
      this.currentRecordingId = null;
      if (this.recordingDialog) {
        this.recordingDialog.close();
        this.recordingDialog = null;
      }
      return false;
    }
  }

  handleRecordingCompleted(recordingId) {
    logger.debug(`=== RECORDING COMPLETED ===`);
    logger.debug(`Recording ID: ${recordingId}`);
    logger.debug(`Current Recording ID: ${this.currentRecordingId}`);

    // Ignore if not our current recording
    if (recordingId !== this.currentRecordingId) {
      logger.debug("Ignoring recording_completed for different recording");
      return;
    }

    // Forward to dialog - it knows what to do based on its current phase
    this.recordingDialog?.onRecordingCompleted();
  }

  async cancelRecording() {
    if (!this.currentRecordingId) {
      return false;
    }

    logger.debug(
      "Recording cancelled by user - discarding audio without processing"
    );

    const recordingId = this.currentRecordingId;
    this.currentRecordingId = null; // Clear ID immediately to ignore subsequent signals

    // Use the D-Bus service CancelRecording method to properly clean up
    try {
      await this.dbusManager.cancelRecording(recordingId);
      logger.debug("D-Bus cancel recording completed successfully");
    } catch (error) {
      logger.debug("Error calling D-Bus cancel recording:", error.message);
      // Continue with local cleanup even if D-Bus call fails
    }

    // Close dialog with error handling
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

  handleTranscriptionReady(recordingId, text, settings) {
    logger.debug(`=== TRANSCRIPTION READY ===`);
    logger.debug(`Recording ID: ${recordingId}`);
    logger.debug(`Current Recording ID: ${this.currentRecordingId}`);
    logger.debug(`Text: "${text}"`);

    // Ignore if not our current recording
    if (recordingId !== this.currentRecordingId) {
      logger.debug("Ignoring transcription_ready for different recording");
      return { action: "ignored", text: null };
    }

    // Forward to dialog - it decides what to do based on settings and current phase
    const result = this.recordingDialog?.onTranscriptionReady(text, settings);

    // Always clear recording ID when transcription completes (success or empty)
    this.currentRecordingId = null;

    if (result?.shouldClose) {
      // Dialog should close: auto-action or empty transcription
      if (this.recordingDialog) {
        this.recordingDialog.close();
        this.recordingDialog = null;
      }

      // Show notification for empty transcription
      if (result.action === "empty") {
        Main.notify("Speech2Text", "No speech detected");
      }
      // Note: Notifications for copy_only, type_only, and type_and_copy are now
      // handled by TextCopied and TextTyped signals in dbusManager.js
    }
    // else: Preview mode - dialog stays open for user interaction

    return result || { action: "ignored", text: null };
  }

  handleRecordingError(recordingId, errorMessage) {
    logger.debug(`=== RECORDING ERROR ===`);
    logger.debug(`Recording ID: ${recordingId}`);
    logger.debug(`Current Recording ID: ${this.currentRecordingId}`);
    logger.debug(`Error: ${errorMessage}`);

    // Ignore if not our current recording
    if (recordingId !== this.currentRecordingId) {
      logger.debug("Ignoring recording_error for different recording");
      return;
    }

    // Clean up recording state (error terminates the recording)
    this.currentRecordingId = null;

    if (this.recordingDialog) {
      // Forward to dialog - it will show the error and keep dialog open
      // Dialog will be closed when user clicks Close button (via onCancel callback)
      this.recordingDialog.onError(errorMessage);
    } else {
      // No dialog available - show notification
      Main.notify("Speech2Text Error", errorMessage);
    }
  }

  cleanup() {
    logger.debug("Cleaning up recording state manager");

    // Reset all state
    this.currentRecordingId = null;

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
