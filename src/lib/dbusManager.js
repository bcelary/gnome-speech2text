import Gio from "gi://Gio";
import { Logger } from "./logger.js";
import { DBUS_NAME, DBUS_PATH } from "./constants.js";

// D-Bus interface XML for the speech2text service
const Speech2TextInterface = `
<node>
  <interface name="${DBUS_NAME}">
    <method name="StartRecording">
      <arg direction="in" type="i" name="duration" />
      <arg direction="in" type="s" name="post_recording_action" />
      <arg direction="out" type="s" name="recording_id" />
    </method>
    <method name="StopRecording">
      <arg direction="in" type="s" name="recording_id" />
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="CancelRecording">
      <arg direction="in" type="s" name="recording_id" />
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="TypeText">
      <arg direction="in" type="s" name="text" />
      <arg direction="in" type="b" name="copy_to_clipboard" />
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="ForceReset">
      <arg direction="out" type="b" name="success" />
    </method>
    <method name="GetServiceStatus">
      <arg direction="out" type="s" name="status" />
    </method>
    <method name="CheckDependencies">
      <arg direction="out" type="b" name="all_available" />
      <arg direction="out" type="as" name="missing_dependencies" />
    </method>
    <signal name="RecordingStarted">
      <arg type="s" name="recording_id" />
    </signal>
    <signal name="RecordingStopped">
      <arg type="s" name="recording_id" />
      <arg type="s" name="reason" />
    </signal>
    <signal name="TranscriptionReady">
      <arg type="s" name="recording_id" />
      <arg type="s" name="text" />
    </signal>
    <signal name="RecordingError">
      <arg type="s" name="recording_id" />
      <arg type="s" name="error_message" />
    </signal>
    <signal name="TextTyped">
      <arg type="s" name="text" />
      <arg type="b" name="success" />
    </signal>
    <signal name="TextCopied">
      <arg type="s" name="text" />
      <arg type="b" name="success" />
    </signal>
  </interface>
</node>`;

export class DBusManager {
  constructor() {
    this.logger = new Logger("DBus");
    this.dbusProxy = null;
    this.signalConnections = [];
    this.isInitialized = false;
    this.lastConnectionCheck = 0;
    this.connectionCheckInterval = 10000; // Check every 10 seconds
    this.nameOwnerChangedId = null;
    this.onServiceDied = null; // Callback for when service dies
  }

  async initialize() {
    try {
      // Clean up existing proxy and signals before creating a new one
      // This prevents duplicate signal connections if initialize() is called multiple times
      if (this.dbusProxy) {
        this.logger.debug(
          "Cleaning up existing D-Bus proxy before reinitializing"
        );
        this.disconnectSignals();
        this.dbusProxy = null;
      }

      const Speech2TextProxy =
        Gio.DBusProxy.makeProxyWrapper(Speech2TextInterface);

      this.dbusProxy = new Speech2TextProxy(
        Gio.DBus.session,
        DBUS_NAME,
        DBUS_PATH
      );

      // Test if the service is actually reachable
      try {
        await this.dbusProxy.GetServiceStatusAsync();
        this.isInitialized = true;

        // Monitor service lifecycle - detect when service dies
        this._setupServiceMonitoring();

        this.logger.info("D-Bus proxy initialized and service is reachable");
        return true;
      } catch (serviceError) {
        this.logger.debug(
          "D-Bus proxy created but service is not reachable:",
          serviceError.message
        );
        // Don't set isInitialized = true if service isn't reachable
        return false;
      }
    } catch (e) {
      this.logger.error(`Failed to initialize D-Bus proxy: ${e}`);
      return false;
    }
  }

  connectSignals(handlers) {
    if (!this.dbusProxy) {
      this.logger.error("Cannot connect signals: D-Bus proxy not initialized");
      return false;
    }

    // Clear existing connections
    this.disconnectSignals();

    // Connect to D-Bus signals
    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingStarted",
        (proxy, sender, [recordingId]) => {
          this.logger.debug(`Recording started: ${recordingId}`);
          handlers.onRecordingStarted?.(recordingId);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingStopped",
        (proxy, sender, [recordingId, reason]) => {
          this.logger.debug(
            `Recording stopped: ${recordingId}, reason: ${reason}`
          );
          handlers.onRecordingStopped?.(recordingId, reason);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "TranscriptionReady",
        (proxy, sender, [recordingId, text]) => {
          this.logger.debug(
            `Transcription ready: ${recordingId}, text: ${text}`
          );
          handlers.onTranscriptionReady?.(recordingId, text);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingError",
        (proxy, sender, [recordingId, errorMessage]) => {
          this.logger.debug(
            `Recording error: ${recordingId}, error: ${errorMessage}`
          );
          handlers.onRecordingError?.(recordingId, errorMessage);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "TextTyped",
        (proxy, sender, [text, success]) => {
          handlers.onTextTyped?.(text, success);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "TextCopied",
        (proxy, sender, [text, success]) => {
          handlers.onTextCopied?.(text, success);
        }
      )
    );

    this.logger.info("D-Bus signals connected successfully");
    return true;
  }

  disconnectSignals() {
    this.signalConnections.forEach((connection) => {
      if (this.dbusProxy && connection) {
        try {
          this.dbusProxy.disconnectSignal(connection);
        } catch {
          this.logger.debug(
            `Signal connection ${connection} was already disconnected or invalid`
          );
        }
      }
    });
    this.signalConnections = [];
  }

  _setupServiceMonitoring() {
    if (!this.dbusProxy) return;

    // Disconnect previous monitor if exists
    if (this.nameOwnerChangedId) {
      this.dbusProxy.disconnect(this.nameOwnerChangedId);
      this.nameOwnerChangedId = null;
    }

    // Monitor g-name-owner property - triggers when service dies/restarts
    this.nameOwnerChangedId = this.dbusProxy.connect(
      "notify::g-name-owner",
      (proxy) => {
        const owner = proxy.g_name_owner;
        if (!owner) {
          this.logger.warn("Service died - name owner lost");
          if (this.onServiceDied) {
            this.onServiceDied();
          }
        } else {
          this.logger.info("Service owner changed:", owner);
        }
      }
    );
  }

  setServiceDiedCallback(callback) {
    this.onServiceDied = callback;
  }

  async forceReset() {
    if (!this.dbusProxy) {
      this.logger.debug("Cannot force reset: no D-Bus proxy");
      return false;
    }

    try {
      const [success] = await this.dbusProxy.ForceResetAsync();
      this.logger.info(`ForceReset called, success: ${success}`);
      return success;
    } catch (e) {
      this.logger.error(`ForceReset error: ${e}`);
      return false;
    }
  }

  async checkServiceStatus() {
    if (!this.dbusProxy) {
      return {
        available: false,
        error: "Service not available",
      };
    }

    try {
      const [status] = await this.dbusProxy.GetServiceStatusAsync();

      if (status.startsWith("dependencies_missing:")) {
        const missing = status
          .substring("dependencies_missing:".length)
          .split(",");
        return {
          available: false,
          error: `Missing dependencies: ${missing.join(", ")}`,
        };
      }

      if (status.startsWith("ready:")) {
        return { available: true, status };
      }

      if (status.startsWith("error:")) {
        const error = status.substring("error:".length);
        return { available: false, error };
      }

      return { available: false, error: "Unknown service status" };
    } catch (e) {
      this.logger.error(`Error checking service status: ${e}`);

      if (
        e.message &&
        e.message.includes("org.freedesktop.DBus.Error.ServiceUnknown")
      ) {
        return {
          available: false,
          error: "Service not running",
        };
      } else if (
        e.message &&
        e.message.includes("org.freedesktop.DBus.Error.NoReply")
      ) {
        return {
          available: false,
          error: "Service not responding",
        };
      } else {
        return {
          available: false,
          error: `Service error: ${e.message || "Unknown error"}`,
        };
      }
    }
  }

  async startRecording(duration, postRecordingAction) {
    const connectionReady = await this.ensureConnection();
    if (!connectionReady || !this.dbusProxy) {
      throw new Error("D-Bus connection not available");
    }

    try {
      const [recordingId] = await this.dbusProxy.StartRecordingAsync(
        duration,
        postRecordingAction
      );
      return recordingId;
    } catch (e) {
      throw new Error(`Failed to start recording: ${e.message}`);
    }
  }

  async stopRecording(recordingId) {
    const connectionReady = await this.ensureConnection();
    if (!connectionReady || !this.dbusProxy) {
      throw new Error("D-Bus connection not available");
    }

    try {
      const [success] = await this.dbusProxy.StopRecordingAsync(recordingId);
      return success;
    } catch (e) {
      throw new Error(`Failed to stop recording: ${e.message}`);
    }
  }

  async cancelRecording(recordingId) {
    const connectionReady = await this.ensureConnection();
    if (!connectionReady || !this.dbusProxy) {
      throw new Error("D-Bus connection not available");
    }

    try {
      const [success] = await this.dbusProxy.CancelRecordingAsync(recordingId);
      return success;
    } catch (e) {
      throw new Error(`Failed to cancel recording: ${e.message}`);
    }
  }

  async typeText(text, copyToClipboard) {
    const connectionReady = await this.ensureConnection();
    if (!connectionReady || !this.dbusProxy) {
      throw new Error("D-Bus connection not available");
    }

    try {
      const [success] = await this.dbusProxy.TypeTextAsync(
        text,
        copyToClipboard
      );
      return success;
    } catch (e) {
      throw new Error(`Failed to type text: ${e.message}`);
    }
  }

  async validateConnection() {
    // Check if we should validate the connection
    const now = Date.now();
    if (now - this.lastConnectionCheck < this.connectionCheckInterval) {
      return this.isInitialized && this.dbusProxy !== null;
    }

    this.lastConnectionCheck = now;

    if (!this.dbusProxy || !this.isInitialized) {
      this.logger.debug("D-Bus connection invalid, need to reinitialize");
      return false;
    }

    try {
      // Quick test to see if the connection is still valid
      await this.dbusProxy.GetServiceStatusAsync();
      return true;
    } catch (e) {
      this.logger.debug("D-Bus connection validation failed:", e.message);
      // Connection is stale, need to reinitialize
      this.isInitialized = false;
      this.dbusProxy = null;
      return false;
    }
  }

  async ensureConnection() {
    const isValid = await this.validateConnection();
    if (!isValid) {
      this.logger.info("Reinitializing D-Bus connection...");
      // initialize() already handles D-Bus auto-activation via GetServiceStatusAsync()
      // No need for separate activation attempt
      return await this.initialize();
    }
    return true;
  }

  destroy() {
    this.disconnectSignals();

    // Clean up service monitoring
    if (this.nameOwnerChangedId && this.dbusProxy) {
      this.dbusProxy.disconnect(this.nameOwnerChangedId);
      this.nameOwnerChangedId = null;
    }

    this.onServiceDied = null;
    this.dbusProxy = null;
    this.isInitialized = false;
    this.lastConnectionCheck = 0;
  }
}
