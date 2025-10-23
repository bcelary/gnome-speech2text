import { RecordingStateManager } from "./recordingStateManager.js";
import { RecordingDialog } from "./recordingDialog.js";
import { Logger } from "./logger.js";

const logger = new Logger("Recording");

export class RecordingController {
  constructor(uiManager, dbusManager) {
    this.uiManager = uiManager;
    this.dbusManager = dbusManager;
    this.recordingStateManager = null;
  }

  initialize() {
    // Initialize recording state manager
    this.recordingStateManager = new RecordingStateManager(
      this.uiManager.icon,
      this.dbusManager
    );
  }

  async toggleRecording(settings) {
    // Check if service is available and initialize if needed
    if (!this.recordingStateManager || !this.dbusManager.isInitialized) {
      logger.debug("Checking D-Bus manager and service status");

      // Ensure D-Bus connection is established
      const connectionReady = await this.dbusManager.ensureConnection();
      if (!connectionReady) {
        logger.info("D-Bus connection failed");
        this.uiManager.showServiceMissingNotification(
          "Speech-to-text service is not available.\nPlease install the WhisperCpp service."
        );
        return;
      }

      const serviceStatus = await this.dbusManager.checkServiceStatus();
      if (!serviceStatus.available) {
        logger.info("Service not available:", serviceStatus.error);
        this.uiManager.showServiceMissingNotification(serviceStatus.error);
        return;
      }

      // Initialize recording state manager if not already done
      if (!this.recordingStateManager) {
        logger.debug("Initializing recording state manager");
        this.initialize();
      }
    }

    // Now handle the actual recording toggle
    if (this.recordingStateManager.isRecording()) {
      logger.info("Stopping recording");
      this.recordingStateManager.stopRecording();
    } else {
      logger.info("Starting recording");

      // Ensure RecordingStateManager has current D-Bus manager reference
      if (
        this.recordingStateManager &&
        this.dbusManager &&
        this.recordingStateManager.dbusManager !== this.dbusManager
      ) {
        this.recordingStateManager.updateDbusManager(this.dbusManager);
      }

      const success = await this.recordingStateManager.startRecording(settings);

      if (success) {
        // Create and show recording dialog
        const recordingDialog = new RecordingDialog(
          () => {
            // Cancel callback
            this.recordingStateManager.cancelRecording();
            this.recordingStateManager.setRecordingDialog(null);
          },
          (text) => {
            // Insert callback
            logger.debug(`Inserting text: ${text}`);
            this._typeText(text);
            this.recordingStateManager.setRecordingDialog(null);
          },
          () => {
            // Stop callback
            logger.debug("Stop recording button clicked");
            this.recordingStateManager.stopRecording();
          },
          settings.get_int("recording-duration")
        );

        this.recordingStateManager.setRecordingDialog(recordingDialog);
        logger.debug(
          "RecordingController: Created and set recording dialog, opening now"
        );
        recordingDialog.open();
      } else {
        this.uiManager.showErrorNotification(
          "Speech2Text Error",
          "Failed to start recording. Please try again."
        );
      }
    }
  }

  handleRecordingStopped(recordingId, reason) {
    if (!this.recordingStateManager) {
      logger.debug("Recording state manager not initialized");
      return;
    }

    logger.debug(
      `RecordingController: Recording stopped - ID: ${recordingId}, reason: ${reason}`
    );
    if (reason === "completed") {
      // Recording completed automatically - don't close dialog yet
      this.recordingStateManager.handleRecordingCompleted(recordingId);
    }
    // For manual stops (reason === "stopped"), the dialog is already closed
    // in the stopRecording method
  }

  handleTranscriptionReady(recordingId, text) {
    if (!this.recordingStateManager) {
      logger.debug("Recording state manager not initialized");
      return;
    }

    logger.debug(
      `RecordingController: Transcription ready - ID: ${recordingId}, text: "${text}"`
    );
    const result = this.recordingStateManager.handleTranscriptionReady(
      recordingId,
      text,
      this.uiManager.extensionCore.settings
    );

    logger.debug(
      `RecordingController: Transcription result - action: ${result?.action}`
    );
    if (result && result.action === "service_handled") {
      // Service already handled all post-processing (type_only, copy_only, type_and_copy)
      // Extension should NOT insert or copy - service did it automatically
      logger.debug(
        "Service handled post-processing automatically - no action needed from extension"
      );
    } else if (result && result.action === "preview") {
      // Preview mode - dialog is already showing, user will manually insert/copy
      logger.debug("Preview mode - user will manually insert/copy via dialog");
    } else if (result && result.action === "createPreview") {
      logger.debug("Creating new preview dialog for transcribed text");
      this._showPreviewDialog(result.text);
    } else if (result && result.action === "ignored") {
      logger.debug("Transcription ignored - recording was cancelled");
      // Nothing to do - recording was cancelled
    }
  }

  handleRecordingError(recordingId, errorMessage) {
    if (!this.recordingStateManager) {
      logger.debug("Recording state manager not initialized");
      return;
    }

    // Log error to journal for debugging
    logger.error(`Recording error for ${recordingId}: ${errorMessage}`);

    this.recordingStateManager.handleRecordingError(recordingId, errorMessage);
  }

  _showPreviewDialog(text) {
    logger.debug("Creating preview dialog for text:", text);

    // Create a new preview-only dialog
    const previewDialog = new RecordingDialog(
      () => {
        // Cancel callback - just close
        previewDialog.close();
      },
      (finalText) => {
        // Insert callback
        logger.debug(`Inserting text from preview: ${finalText}`);
        this._typeText(finalText);
        previewDialog.close();
      },
      null, // No stop callback needed for preview-only
      0 // No duration for preview-only
    );

    // First open the dialog, then show preview
    logger.debug("Opening preview dialog");
    previewDialog.open();
    logger.debug("Showing preview in opened dialog");
    previewDialog.showPreview(text);
  }

  async _typeText(text) {
    // IMPORTANT: This method should ONLY be called from preview dialog callbacks
    // when the user explicitly clicks "Insert" button.
    //
    // Valid call sites:
    // 1. Line 82: Preview dialog "Insert" button callback (initial dialog)
    // 2. Line 177: Preview dialog insert callback (_showPreviewDialog)
    //
    // This method should NEVER be called for automatic post-recording actions
    // (type_only, copy_only, type_and_copy) - those are handled by the service
    // in Recording._execute_post_processing().

    try {
      // When user clicks "Insert" in preview dialog, only type (don't copy to clipboard)
      // Clipboard copying is handled separately via the "Copy" button or post-recording action
      await this.dbusManager.typeText(text, false);
    } catch (e) {
      logger.error(`Error typing text: ${e}`);
      this.uiManager.showErrorNotification(
        "Speech2Text Error",
        "Failed to insert text."
      );
    }
  }

  cleanup() {
    if (this.recordingStateManager) {
      logger.debug("Cleaning up recording state manager");
      this.recordingStateManager.cleanup();
      this.recordingStateManager = null;
    }
  }
}
