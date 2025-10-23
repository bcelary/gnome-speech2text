import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { UIManager } from "./lib/uiManager.js";
import { RecordingController } from "./lib/recordingController.js";
import { DBusManager } from "./lib/dbusManager.js";
import { KeybindingManager } from "./lib/keybindingManager.js";
import { Logger } from "./lib/logger.js";
import { SCHEMA_ID } from "./lib/constants.js";

const logger = new Logger("Extension");

export default class Speech2TextExtension extends Extension {
  constructor(metadata) {
    super(metadata);

    this.settings = null;
    this.uiManager = null;
    this.recordingController = null;
    this.dbusManager = null;
    this.keybindingManager = null;
  }

  async enable() {
    logger.info("Enabling Speech2Text extension (D-Bus version)");
    this.settings = this.getSettings(SCHEMA_ID);

    this.dbusManager = new DBusManager();
    await this.dbusManager.initialize();

    this.uiManager = new UIManager(this);
    this.uiManager.initialize();

    this.recordingController = new RecordingController(
      this.uiManager,
      this.dbusManager
    );
    this.recordingController.initialize();

    this.keybindingManager = new KeybindingManager(this);
    this.keybindingManager.setupKeybinding();

    this._setupSignalHandlers();

    logger.info("Extension enabled successfully");
  }

  _setupSignalHandlers() {
    this.dbusManager.connectSignals({
      onTranscriptionReady: (recordingId, text) => {
        this.recordingController.handleTranscriptionReady(recordingId, text);
      },
      onRecordingError: (recordingId, errorMessage) => {
        this.recordingController.handleRecordingError(
          recordingId,
          errorMessage
        );
      },
      onRecordingStopped: (recordingId, reason) => {
        this.recordingController.handleRecordingStopped(recordingId, reason);
      },
    });
  }

  async toggleRecording() {
    try {
      logger.debug("=== TOGGLE RECORDING (D-Bus) ===");

      if (!this.settings || !this.uiManager) {
        logger.info(
          "Extension state inconsistent, attempting comprehensive auto-recovery"
        );
        await this._performAutoRecovery();
      }

      if (!this.settings || !this.uiManager) {
        logger.error("Required components still missing after auto-recovery");
        return;
      }

      // Ensure D-Bus connection is valid
      const connectionReady = await this.dbusManager.ensureConnection();
      if (!connectionReady) {
        this.uiManager.showErrorNotification(
          "Speech2Text",
          "Service is not available. Please check if the service is running."
        );
        return;
      }

      // Check service status
      const serviceStatus = await this.dbusManager.checkServiceStatus();
      if (!serviceStatus.available) {
        this.uiManager.showErrorNotification(
          "Speech2Text",
          serviceStatus.error || "Service is not available."
        );
        return;
      }

      await this.recordingController.toggleRecording(this.settings);
    } catch (error) {
      logger.error("Error in toggleRecording:", error);
      this.uiManager.showErrorNotification(
        "Speech2Text Error",
        "An error occurred while toggling recording. Please check the logs."
      );
    }
  }

  async _performAutoRecovery() {
    try {
      logger.info("Attempting full extension state recovery");

      if (!this.settings) {
        this.settings = this.getSettings(SCHEMA_ID);
      }

      if (!this.uiManager) {
        this.uiManager = new UIManager(this);
      }

      if (!this.dbusManager) {
        this.dbusManager = new DBusManager();
      }

      if (this.uiManager && this.dbusManager) {
        if (this.recordingController) {
          this.recordingController.cleanup();
        }
        this.recordingController = new RecordingController(
          this.uiManager,
          this.dbusManager
        );
      }

      if (this.settings && !this.keybindingManager) {
        this.keybindingManager = new KeybindingManager(this);
      }

      if (this.settings && this.uiManager) {
        this._setupSignalHandlers();
      }
    } catch (recoveryError) {
      logger.error("Comprehensive auto-recovery failed:", recoveryError);
      this.uiManager?.showErrorNotification(
        "Speech2Text Error",
        "Extension recovery failed. Please restart GNOME Shell: Alt+F2 → 'r' → Enter"
      );
      throw recoveryError;
    }
  }

  disable() {
    logger.info("Disabling Speech2Text extension (D-Bus version)");

    // Clean up components in reverse order of initialization
    if (this.keybindingManager) {
      this.keybindingManager.cleanup();
      this.keybindingManager = null;
    }

    if (this.recordingController) {
      logger.debug("Cleaning up recording controller");
      this.recordingController.cleanup();
      this.recordingController = null;
    }

    if (this.uiManager) {
      logger.debug("Cleaning up UI manager");
      this.uiManager.cleanup();
      this.uiManager = null;
    }

    if (this.dbusManager) {
      this.dbusManager.destroy();
      this.dbusManager = null;
    }

    // Clear settings reference
    this.settings = null;
  }
}
