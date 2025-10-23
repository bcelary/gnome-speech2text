import { DBusManager } from "./dbusManager.js";
import { Logger } from "./logger.js";

const logger = new Logger("Service");

export class ServiceManager {
  constructor() {
    this.dbusManager = null;
    this.isInitialized = false;
  }

  async initialize() {
    // Check if D-Bus manager exists and is initialized
    if (!this.dbusManager) {
      logger.debug("D-Bus manager is null, creating new instance");
      this.dbusManager = new DBusManager();
    }

    // Double-check that dbusManager wasn't nullified during creation
    if (!this.dbusManager) {
      logger.debug("D-Bus manager became null after creation attempt");
      return false;
    }

    if (!this.dbusManager.isInitialized) {
      logger.debug("D-Bus manager not initialized, initializing...");
      const initialized = await this.dbusManager.initialize();
      if (!initialized) {
        logger.debug("Failed to initialize D-Bus manager");
        return false;
      }
    }

    this.isInitialized = true;
    return true;
  }

  async ensureServiceAvailable() {
    // Ensure D-Bus manager is available and initialized
    const dbusReady = await this.initialize();
    if (!dbusReady || !this.dbusManager) {
      logger.debug("D-Bus manager initialization failed or was nullified");
      return false;
    }

    // Double-check that dbusManager is still valid (race condition protection)
    if (!this.dbusManager) {
      logger.debug("D-Bus manager became null during initialization");
      return false;
    }

    // Check service status
    const serviceStatus = await this.dbusManager.checkServiceStatus();
    if (!serviceStatus.available) {
      logger.debug("Service not available:", serviceStatus.error);
      return false;
    }

    return true;
  }

  connectSignals(handlers) {
    if (!this.dbusManager) {
      logger.error("D-Bus manager not available for signal connection");
      return;
    }

    this.dbusManager.connectSignals(handlers);
  }

  async typeText(text, copyToClipboard) {
    if (!text || !text.trim()) {
      logger.debug("No text to type");
      return;
    }

    // Ensure D-Bus manager is available
    const dbusReady = await this.initialize();
    if (!dbusReady || !this.dbusManager) {
      logger.error("Failed to ensure D-Bus manager is ready for text typing");
      throw new Error("Failed to connect to service.");
    }

    logger.info(`Typing text via D-Bus: "${text}"`);

    await this.dbusManager.typeText(text.trim(), copyToClipboard);
  }

  async startRecording(settings) {
    if (!this.dbusManager) {
      logger.error("D-Bus manager not available for recording");
      return false;
    }

    return await this.dbusManager.startRecording(settings);
  }

  async stopRecording() {
    if (!this.dbusManager) {
      logger.error("D-Bus manager not available for stopping recording");
      return false;
    }

    return await this.dbusManager.stopRecording();
  }

  async cancelRecording() {
    if (!this.dbusManager) {
      logger.error("D-Bus manager not available for cancelling recording");
      return false;
    }

    return await this.dbusManager.cancelRecording();
  }

  isRecording() {
    if (!this.dbusManager) {
      return false;
    }

    return this.dbusManager.isRecording();
  }

  destroy() {
    if (this.dbusManager) {
      logger.debug("Destroying D-Bus manager");
      try {
        this.dbusManager.destroy();
      } catch (error) {
        logger.debug("Error destroying D-Bus manager:", error.message);
      } finally {
        this.dbusManager = null;
        this.isInitialized = false;
      }
    }
  }
}
