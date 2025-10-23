import Meta from "gi://Meta";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { COLORS } from "./constants.js";
import { Logger } from "./logger.js";

const logger = new Logger("State");

export class RecordingStateManager {
  constructor(icon, dbusManager) {
    this.icon = icon;
    this.dbusManager = dbusManager;
    this.currentRecordingId = null;
    this.recordingDialog = null;
    this.lastRecordingSettings = null; // Store settings for transcription handling
    this.isCancelled = false; // Flag to track if recording was cancelled (user action overrides service)
  }

  // Method to update dbusManager reference when extension recreates it
  updateDbusManager(dbusManager) {
    this.dbusManager = dbusManager;
  }

  async startRecording(settings) {
    if (this.currentRecordingId) {
      logger.debug("Recording already in progress");
      return false;
    }

    try {
      // Reset cancellation flag for new recording
      this.isCancelled = false;

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
      this.updateIcon(true);
      logger.debug(`Recording started with ID: ${recordingId}`);
      return true;
    } catch (e) {
      logger.error(`Error starting recording: ${e}`);
      this.updateIcon(false);
      return false;
    }
  }

  async stopRecording() {
    if (!this.currentRecordingId) {
      logger.debug("No recording to stop");
      return false;
    }

    logger.debug(`Stopping recording: ${this.currentRecordingId}`);
    try {
      await this.dbusManager.stopRecording(this.currentRecordingId);
      this.updateIcon(false);

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
      return false;
    }
  }

  handleRecordingCompleted(recordingId) {
    logger.debug(`=== RECORDING COMPLETED ===`);
    logger.debug(`Recording ID: ${recordingId}`);
    logger.debug(`Current Recording ID: ${this.currentRecordingId}`);
    logger.debug(`Dialog exists: ${!!this.recordingDialog}`);
    logger.debug(`Is cancelled: ${this.isCancelled}`);

    // If the recording was cancelled, ignore the completion
    if (this.isCancelled) {
      logger.debug("Recording was cancelled - ignoring completion");
      return;
    }

    // If we don't have a dialog, the recording was already stopped manually
    if (!this.recordingDialog) {
      logger.debug(
        `Recording ${recordingId} completed but dialog already closed (manual stop)`
      );
      return;
    }

    // Show processing state
    if (
      this.recordingDialog &&
      typeof this.recordingDialog.showProcessing === "function"
    ) {
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

    // Set cancellation flag FIRST to override any incoming service signals
    this.isCancelled = true;

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
    this.updateIcon(false);

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

  updateIcon(isRecording) {
    if (this.icon) {
      if (isRecording) {
        this.icon.set_style(`color: ${COLORS.PRIMARY};`);
      } else {
        this.icon.set_style("");
      }
    }
  }

  handleTranscriptionReady(recordingId, text, settings) {
    logger.debug(`=== TRANSCRIPTION READY ===`);
    logger.debug(`Recording ID: ${recordingId}`);
    logger.debug(`Current Recording ID: ${this.currentRecordingId}`);
    logger.debug(`Text: "${text}"`);
    logger.debug(`Dialog exists: ${!!this.recordingDialog}`);
    logger.debug(`Is cancelled: ${this.isCancelled}`);

    // If the recording was cancelled, ignore the transcription
    if (this.isCancelled) {
      logger.debug("Recording was cancelled - ignoring transcription");
      return { action: "ignored", text: null };
    }

    // Check if transcription is empty (no speech detected)
    if (!text || text.trim().length === 0) {
      logger.debug("No speech detected - showing notification");
      Main.notify("Speech2Text", "No speech detected");

      // Close dialog and clean up
      if (this.recordingDialog) {
        this.recordingDialog.close();
        this.recordingDialog = null;
      }
      this.currentRecordingId = null;
      this.updateIcon(false);
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
      if (
        this.recordingDialog &&
        typeof this.recordingDialog.showPreview === "function"
      ) {
        logger.debug("Using existing dialog for preview");
        this.recordingDialog.showPreview(text);
        this.currentRecordingId = null;
        return { action: "preview", text };
      } else {
        logger.debug("No dialog available, need to create preview dialog");
        this.currentRecordingId = null;
        this.updateIcon(false);
        return { action: "createPreview", text };
      }
    } else {
      // AUTO-ACTION MODE: Service handles ALL post-processing automatically
      // Extension should NOT insert/copy - service already did it in Recording._execute_post_processing()
      // Valid auto-actions: type_only, copy_only, type_and_copy
      logger.debug(`=== AUTO-ACTION MODE: ${postRecordingAction} ===`);
      logger.debug("Service handled all text insertion/copying automatically");
      if (this.recordingDialog) {
        this.recordingDialog.close();
        this.recordingDialog = null;
      }
      this.currentRecordingId = null;
      this.updateIcon(false);
      // Return "service_handled" to indicate service processed everything, extension does nothing
      return { action: "service_handled", text };
    }
  }

  handleRecordingError(recordingId, errorMessage) {
    logger.debug(`=== RECORDING ERROR ===`);
    logger.debug(`Recording ID: ${recordingId}`);
    logger.debug(`Current Recording ID: ${this.currentRecordingId}`);
    logger.debug(`Error: ${errorMessage}`);
    logger.debug(`Is cancelled: ${this.isCancelled}`);

    // If the recording was cancelled, ignore the error
    if (this.isCancelled) {
      logger.debug("Recording was cancelled - ignoring error");
      return;
    }

    // Show error in dialog if available
    if (
      this.recordingDialog &&
      typeof this.recordingDialog.showError === "function"
    ) {
      this.recordingDialog.showError(errorMessage);
    } else {
      logger.debug("No dialog available for error display");
    }

    // Clean up state
    this.currentRecordingId = null;
    this.updateIcon(false);
  }

  cleanup() {
    logger.debug("Cleaning up recording state manager");

    // Reset all state
    this.currentRecordingId = null;
    this.isCancelled = false;
    this.lastRecordingSettings = null;

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

    // Reset icon safely
    try {
      this.updateIcon(false);
    } catch (error) {
      logger.debug("Error resetting icon during cleanup:", error.message);
    }
  }
}
