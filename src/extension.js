import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { UIManager } from "./lib/uiManager.js";
import { UICoordinator } from "./lib/uiCoordinator.js";
import { DBusManager } from "./lib/dbusManager.js";
import { KeybindingManager } from "./lib/keybindingManager.js";
import { Logger } from "./lib/logger.js";

export default class Speech2TextExtension extends Extension {
  constructor(metadata) {
    super(metadata);

    this.logger = null;
    this.settings = null;
    this.uiManager = null;
    this.uiCoordinator = null;
    this.dbusManager = null;
    this.keybindingManager = null;
  }

  async enable() {
    this.logger = new Logger("Extension");
    this.logger.info("Enabling Speech2Text extension (D-Bus version)");
    this.settings = this.getSettings();

    this.dbusManager = new DBusManager();
    await this.dbusManager.initialize();

    this.uiManager = new UIManager(this);
    this.uiManager.initialize();

    this.uiCoordinator = new UICoordinator(this.uiManager, this.dbusManager);
    this.uiCoordinator.initialize();

    // Setup automatic recovery when service dies
    this.dbusManager.setServiceDiedCallback(() => {
      this.logger.warn("Service died unexpectedly, forcing UI reset");
      this.uiCoordinator.forceReset();
    });

    this.keybindingManager = new KeybindingManager(this);
    this.keybindingManager.setupKeybinding();
    this.logger.info("Keybinding configured");

    this._setupSignalHandlers();

    // Always reset service state on startup (cleans orphaned recordings from sleep/wake)
    await this._resetServiceState();

    this.logger.info("Extension enabled successfully");
  }

  async _resetServiceState() {
    try {
      // Reset service state (UI already initialized to IDLE)
      const success = await this.dbusManager.forceReset();
      if (success) {
        this.logger.debug("Service state reset on startup");
      }
    } catch (error) {
      this.logger.debug("Error resetting service state:", error.message);
      // Non-fatal - continue with extension initialization
    }
  }

  _setupSignalHandlers() {
    this.logger.debug("Setting up D-Bus signal handlers");
    this.dbusManager.connectSignals({
      onTranscriptionReady: (recordingId, text) => {
        this.uiCoordinator.handleTranscriptionReady(recordingId, text);
      },
      onRecordingError: (recordingId, errorMessage) => {
        this.uiCoordinator.handleRecordingError(recordingId, errorMessage);
      },
      onRecordingStopped: (recordingId, _reason) => {
        this.uiCoordinator.handleRecordingCompleted(recordingId);
      },
      onTextTyped: () => {
        this.uiCoordinator.handleTextTyped();
      },
      onTextCopied: () => {
        this.uiCoordinator.handleTextCopied();
      },
    });
  }

  async toggleRecording() {
    try {
      this.logger.debug("Toggle recording");

      if (!this.settings || !this.uiManager) {
        this.logger.info(
          "Extension state inconsistent, attempting comprehensive auto-recovery"
        );
        await this._performAutoRecovery();
      }

      if (!this.settings || !this.uiManager) {
        this.logger.error(
          "Required components still missing after auto-recovery"
        );
        return;
      }

      // Toggle recording via UICoordinator
      if (this.uiCoordinator.isRecording()) {
        await this.uiCoordinator.stopRecording();
      } else if (this.uiCoordinator.isProcessing()) {
        await this.uiCoordinator.cancelRecording();
      } else {
        await this.uiCoordinator.startRecording(this.settings);
      }
    } catch (error) {
      this.logger.error("Failed to toggle recording:", error);
      this.uiManager.showErrorNotification(
        "Speech2Text Error",
        "An error occurred while toggling recording. Please check the logs."
      );
    }
  }

  async _performAutoRecovery() {
    try {
      this.logger.info("Attempting full extension state recovery");

      if (!this.settings) {
        this.settings = this.getSettings();
      }

      if (!this.uiManager) {
        this.uiManager = new UIManager(this);
      }

      if (!this.dbusManager) {
        this.dbusManager = new DBusManager();
      }

      if (this.uiManager && this.dbusManager) {
        if (this.uiCoordinator) {
          this.uiCoordinator.cleanup();
        }
        this.uiCoordinator = new UICoordinator(
          this.uiManager,
          this.dbusManager
        );
        this.uiCoordinator.initialize();
      }

      if (this.settings && !this.keybindingManager) {
        this.keybindingManager = new KeybindingManager(this);
      }

      if (this.settings && this.uiManager) {
        this._setupSignalHandlers();
      }
    } catch (recoveryError) {
      this.logger.error("Failed to perform auto-recovery:", recoveryError);
      this.uiManager?.showErrorNotification(
        "Speech2Text Error",
        "Extension recovery failed. Please restart GNOME Shell: Alt+F2 → 'r' → Enter"
      );
      throw recoveryError;
    }
  }

  disable() {
    this.logger?.info("Disabling Speech2Text extension (D-Bus version)");

    // Clean up components in reverse order of initialization
    if (this.keybindingManager) {
      this.keybindingManager.cleanup();
      this.keybindingManager = null;
    }

    if (this.uiCoordinator) {
      this.logger?.debug("Cleaning up UI coordinator");
      this.uiCoordinator.cleanup();
      this.uiCoordinator = null;
    }

    if (this.uiManager) {
      this.logger?.debug("Cleaning up UI manager");
      this.uiManager.cleanup();
      this.uiManager = null;
    }

    if (this.dbusManager) {
      this.dbusManager.destroy();
      this.dbusManager = null;
    }

    // Clear settings and logger references
    this.settings = null;
    this.logger = null;
  }
}
