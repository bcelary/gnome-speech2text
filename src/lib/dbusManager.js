import Gio from "gi://Gio";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Logger } from "./logger.js";
import { DBUS_NAME, DBUS_PATH, SERVICE_EXECUTABLE } from "./constants.js";

const logger = new Logger("DBus");

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
    this.dbusProxy = null;
    this.signalConnections = [];
    this.isInitialized = false;
    this.lastConnectionCheck = 0;
    this.connectionCheckInterval = 10000; // Check every 10 seconds
    this.serviceStartTimeoutId = null;
  }

  async initialize() {
    try {
      // Clean up existing proxy and signals before creating a new one
      // This prevents duplicate signal connections if initialize() is called multiple times
      if (this.dbusProxy) {
        logger.debug("Cleaning up existing D-Bus proxy before reinitializing");
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
        logger.info("D-Bus proxy initialized and service is reachable");
        return true;
      } catch (serviceError) {
        logger.debug(
          "D-Bus proxy created but service is not reachable:",
          serviceError.message
        );
        // Don't set isInitialized = true if service isn't reachable
        return false;
      }
    } catch (e) {
      logger.error(`Failed to initialize D-Bus proxy: ${e}`);
      return false;
    }
  }

  connectSignals(handlers) {
    if (!this.dbusProxy) {
      logger.error("Cannot connect signals: D-Bus proxy not initialized");
      return false;
    }

    // Clear existing connections
    this.disconnectSignals();

    // Connect to D-Bus signals
    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingStarted",
        (proxy, sender, [recordingId]) => {
          logger.debug(`Recording started: ${recordingId}`);
          handlers.onRecordingStarted?.(recordingId);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingStopped",
        (proxy, sender, [recordingId, reason]) => {
          logger.debug(`Recording stopped: ${recordingId}, reason: ${reason}`);
          handlers.onRecordingStopped?.(recordingId, reason);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "TranscriptionReady",
        (proxy, sender, [recordingId, text]) => {
          logger.debug(`Transcription ready: ${recordingId}, text: ${text}`);
          handlers.onTranscriptionReady?.(recordingId, text);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "RecordingError",
        (proxy, sender, [recordingId, errorMessage]) => {
          logger.debug(
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
          if (success) {
            Main.notify("Speech2Text", "Text inserted successfully!");
          } else {
            Main.notify("Speech2Text Error", "Failed to insert text.");
          }
          handlers.onTextTyped?.(text, success);
        }
      )
    );

    this.signalConnections.push(
      this.dbusProxy.connectSignal(
        "TextCopied",
        (proxy, sender, [text, success]) => {
          if (success) {
            Main.notify("Speech2Text", "Text copied to clipboard!");
          } else {
            Main.notify("Speech2Text Error", "Failed to copy to clipboard.");
          }
          handlers.onTextCopied?.(text, success);
        }
      )
    );

    logger.info("D-Bus signals connected successfully");
    return true;
  }

  disconnectSignals() {
    this.signalConnections.forEach((connection) => {
      if (this.dbusProxy && connection) {
        try {
          this.dbusProxy.disconnectSignal(connection);
        } catch {
          logger.debug(
            `Signal connection ${connection} was already disconnected or invalid`
          );
        }
      }
    });
    this.signalConnections = [];
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
        return { available: true };
      }

      if (status.startsWith("error:")) {
        const error = status.substring("error:".length);
        return { available: false, error };
      }

      return { available: false, error: "Unknown service status" };
    } catch (e) {
      logger.error(`Error checking service status: ${e}`);

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
      logger.debug("D-Bus connection invalid, need to reinitialize");
      return false;
    }

    try {
      // Quick test to see if the connection is still valid
      await this.dbusProxy.GetServiceStatusAsync();
      return true;
    } catch (e) {
      logger.debug("D-Bus connection validation failed:", e.message);
      // Connection is stale, need to reinitialize
      this.isInitialized = false;
      this.dbusProxy = null;
      return false;
    }
  }

  async ensureConnection() {
    const isValid = await this.validateConnection();
    if (!isValid) {
      logger.info("Reinitializing D-Bus connection...");
      const initialized = await this.initialize();

      // If initialization failed, try to start the service
      if (!initialized) {
        logger.info("Service not available, attempting to start...");
        const serviceStarted = await this._startService();
        if (serviceStarted) {
          return await this.initialize();
        }
      }

      return initialized;
    }
    return true;
  }

  async _startService() {
    try {
      logger.info("Starting Speech2Text service...");

      // Get the user's home directory
      const homeDir = GLib.get_home_dir();
      // Note: This checks for old-style installation. Modern installations via pipx
      // don't use this path, but we keep it for backwards compatibility.
      const servicePath = `${homeDir}/.local/share/${SERVICE_EXECUTABLE}/${SERVICE_EXECUTABLE}`;

      // Check if the service file exists
      const serviceFile = Gio.File.new_for_path(servicePath);
      if (!serviceFile.query_exists(null)) {
        logger.error(`Service file not found: ${servicePath}`);
        return false;
      }

      // Start the service (fire-and-forget)
      Gio.Subprocess.new([servicePath], Gio.SubprocessFlags.NONE);

      // Wait for service to start and register with D-Bus
      await new Promise((resolve) => {
        this.serviceStartTimeoutId = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          3000,
          () => {
            this.serviceStartTimeoutId = null;
            resolve();
            return false;
          }
        );
      });

      // Verify service is available
      try {
        const testProxy = Gio.DBusProxy.new_sync(
          Gio.DBus.session,
          Gio.DBusProxyFlags.NONE,
          null,
          DBUS_NAME,
          DBUS_PATH,
          DBUS_NAME,
          null
        );

        const [status] = testProxy.GetServiceStatusSync();
        if (status.startsWith("ready:")) {
          logger.info("Service started successfully");
          return true;
        } else {
          logger.info(`Service started but not ready: ${status}`);
          return false;
        }
      } catch {
        logger.info("Service not available after start attempt");
        return false;
      }
    } catch (e) {
      logger.error(`Failed to start service: ${e}`);
      return false;
    }
  }

  destroy() {
    this.disconnectSignals();

    // Clean up any pending timeout
    if (this.serviceStartTimeoutId) {
      GLib.Source.remove(this.serviceStartTimeoutId);
      this.serviceStartTimeoutId = null;
    }

    this.dbusProxy = null;
    this.isInitialized = false;
    this.lastConnectionCheck = 0;
  }
}
