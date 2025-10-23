#!/usr/bin/env python3
"""
GNOME Speech2Text D-Bus Service - whisper.cpp Backend (Refactored)

This service provides speech-to-text functionality via D-Bus using a local
whisper.cpp server with OpenAI-compatible API.
"""

import os
import signal
import sys
import syslog
from typing import Any, Dict, List, Optional, Tuple

import dbus
import dbus.mainloop.glib
import dbus.service
from gi.repository import GLib

from . import DBUS_NAME, DBUS_PATH, SERVICE_EXECUTABLE
from .dependency_checker import DependencyChecker
from .post_processor import PostProcessor
from .recording_manager import RecordingManager
from .types import DependencyError, PostRecordingAction, RecordingState, ServiceConfig
from .whisper_cpp_client import WhisperCppClient


class Speech2TextService(dbus.service.Object):  # type: ignore
    """D-Bus service for speech-to-text functionality using whisper.cpp.

    Thin adapter over RecordingManager that translates D-Bus calls to
    manager operations and Recording state changes to D-Bus signals.

    Note: D-Bus method names must use PascalCase per D-Bus specification,
    hence ruff N802 warnings are suppressed for D-Bus methods/signals.
    """

    # Environment variable defaults
    DEFAULT_WHISPER_SERVER_URL = "http://localhost:8080"
    DEFAULT_WHISPER_MODEL = "small"
    DEFAULT_WHISPER_LANGUAGE = "auto"
    DEFAULT_WHISPER_VAD_MODEL = "auto"
    DEFAULT_WHISPER_AUTO_START = "true"

    def __init__(self) -> None:
        """Initialize D-Bus service and recording manager."""
        # Set up D-Bus
        dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
        bus = dbus.SessionBus()
        bus_name = dbus.service.BusName(DBUS_NAME, bus)
        super().__init__(bus_name, DBUS_PATH)

        # Parse service configuration from environment
        self.service_config = self._load_service_config()

        # Initialize whisper.cpp client
        self.whisper_client = WhisperCppClient(
            base_url=self.service_config.server_url,
            auto_start=self.service_config.auto_start,
            model_file=self.service_config.model_file,
            language=self.service_config.language,
            vad_model=self.service_config.vad_model,
        )

        # Initialize components
        self.dependency_checker = DependencyChecker(
            server_url=self.service_config.server_url,
            whisper_client=self.whisper_client,
        )
        self.post_processor = PostProcessor()

        # Initialize recording manager
        self.manager = RecordingManager(
            service_config=self.service_config,
            whisper_client=self.whisper_client,
            dependency_checker=self.dependency_checker,
            post_processor=self.post_processor,
            state_change_callback=self._on_recording_state_change,
            signal_emitter=self._emit_signal,
        )

        # Initialize syslog
        syslog.openlog(SERVICE_EXECUTABLE, syslog.LOG_PID, syslog.LOG_USER)
        syslog.syslog(
            syslog.LOG_INFO, "Speech2Text D-Bus service started (whisper.cpp backend)"
        )

        # Log configuration
        self._log_environment_config()

    def _load_service_config(self) -> ServiceConfig:
        """Load service configuration from environment variables.

        Returns:
            ServiceConfig instance
        """
        server_url = os.environ.get(
            "WHISPER_SERVER_URL", self.DEFAULT_WHISPER_SERVER_URL
        )
        model_file = os.environ.get("WHISPER_MODEL", self.DEFAULT_WHISPER_MODEL)
        language = os.environ.get("WHISPER_LANGUAGE", self.DEFAULT_WHISPER_LANGUAGE)

        # Handle VAD model (special values: "auto", "none", or specific name)
        vad_model_raw = os.environ.get(
            "WHISPER_VAD_MODEL", self.DEFAULT_WHISPER_VAD_MODEL
        )
        vad_model: Optional[str] = None
        if vad_model_raw and vad_model_raw.strip().lower() not in ("none", ""):
            vad_model = vad_model_raw

        # Parse auto-start flag
        auto_start_str = os.environ.get(
            "WHISPER_AUTO_START", self.DEFAULT_WHISPER_AUTO_START
        ).lower()
        auto_start = auto_start_str not in ("false", "0", "no", "off")

        return ServiceConfig(
            server_url=server_url,
            model_file=model_file,
            language=language,
            vad_model=vad_model,
            auto_start=auto_start,
        )

    def _log_environment_config(self) -> None:
        """Log non-default environment configuration."""
        env_vars = {
            "WHISPER_SERVER_URL": (
                os.environ.get("WHISPER_SERVER_URL"),
                self.DEFAULT_WHISPER_SERVER_URL,
            ),
            "WHISPER_MODEL": (
                os.environ.get("WHISPER_MODEL"),
                self.DEFAULT_WHISPER_MODEL,
            ),
            "WHISPER_LANGUAGE": (
                os.environ.get("WHISPER_LANGUAGE"),
                self.DEFAULT_WHISPER_LANGUAGE,
            ),
            "WHISPER_VAD_MODEL": (
                os.environ.get("WHISPER_VAD_MODEL"),
                self.DEFAULT_WHISPER_VAD_MODEL,
            ),
            "WHISPER_AUTO_START": (
                os.environ.get("WHISPER_AUTO_START"),
                self.DEFAULT_WHISPER_AUTO_START,
            ),
            "XDG_SESSION_TYPE": (os.environ.get("XDG_SESSION_TYPE"), None),
        }

        config_lines = []
        for key, (value, default) in env_vars.items():
            if value and value != default:
                config_lines.append(f"{key}={value}")

        if config_lines:
            syslog.syslog(
                syslog.LOG_INFO, f"Service configuration: {', '.join(config_lines)}"
            )
        else:
            syslog.syslog(
                syslog.LOG_INFO, "Service using all default configuration values"
            )

    # D-Bus Methods
    @dbus.service.method(  # type: ignore
        DBUS_NAME,
        in_signature="is",
        out_signature="s",
    )
    def StartRecording(  # noqa: N802
        self, duration: int, post_recording_action: str
    ) -> str:
        """Start a new recording session.

        Args:
            duration: Maximum recording duration in seconds
            post_recording_action: What to do after transcription completes.
                Valid values: "preview", "type_only", "copy_only", "type_and_copy"

        Returns:
            Recording ID (UUID)

        Raises:
            dbus.exceptions.DBusException: If recording cannot be started
        """
        try:
            # Validate and parse the action string
            try:
                action_enum = PostRecordingAction(post_recording_action)
            except ValueError:
                raise ValueError(
                    f"Invalid post_recording_action '{post_recording_action}'. "
                    f"Valid values: preview, type_only, copy_only, type_and_copy"
                ) from None

            recording_id = self.manager.start_recording(
                duration=duration,
                post_recording_action=action_enum,
            )
            return recording_id

        except DependencyError as e:
            error_msg = f"Missing dependencies: {', '.join(e.missing)}"
            syslog.syslog(syslog.LOG_ERR, f"StartRecording error: {error_msg}")
            raise dbus.exceptions.DBusException(error_msg) from e

        except Exception as e:
            error_msg = str(e)
            syslog.syslog(syslog.LOG_ERR, f"StartRecording error: {error_msg}")
            raise dbus.exceptions.DBusException(error_msg) from e

    @dbus.service.method(  # type: ignore
        DBUS_NAME,
        in_signature="s",
        out_signature="b",
    )
    def StopRecording(self, recording_id: str) -> bool:  # noqa: N802
        """Stop an active recording.

        Args:
            recording_id: Recording identifier

        Returns:
            True if stop request was sent
        """
        try:
            return self.manager.stop_recording(recording_id)
        except Exception as e:
            syslog.syslog(syslog.LOG_ERR, f"StopRecording error: {e}")
            return False

    @dbus.service.method(  # type: ignore
        DBUS_NAME,
        in_signature="s",
        out_signature="b",
    )
    def CancelRecording(self, recording_id: str) -> bool:  # noqa: N802
        """Cancel an active recording without processing.

        Args:
            recording_id: Recording identifier

        Returns:
            True if cancel request was sent
        """
        try:
            return self.manager.cancel_recording(recording_id)
        except Exception as e:
            syslog.syslog(syslog.LOG_ERR, f"CancelRecording error: {e}")
            return False

    @dbus.service.method(  # type: ignore
        DBUS_NAME,
        in_signature="sb",
        out_signature="b",
    )
    def TypeText(self, text: str, copy_to_clipboard: bool) -> bool:  # noqa: N802
        """Type provided text directly.

        Args:
            text: Text to type
            copy_to_clipboard: Whether to also copy to clipboard

        Returns:
            True if successful
        """
        try:
            success = True

            # Type the text
            if not self.post_processor.type_text(text):
                success = False

            # Copy to clipboard if requested
            if copy_to_clipboard and not self.post_processor.copy_to_clipboard(text):
                syslog.syslog(syslog.LOG_WARNING, "Failed to copy to clipboard")

            # Emit signal
            self.TextTyped(text, success)
            return success

        except Exception as e:
            syslog.syslog(syslog.LOG_ERR, f"TypeText error: {e}")
            self.TextTyped(text, False)
            return False

    @dbus.service.method(DBUS_NAME, out_signature="s")  # type: ignore
    def GetServiceStatus(  # noqa: N802
        self,
    ) -> str:
        """Get current service status.

        Returns:
            Status string in format: "status:key=value,..."
        """
        try:
            return self.manager.get_status()
        except Exception as e:
            return f"error:{str(e)}"

    @dbus.service.method(DBUS_NAME, out_signature="bas")  # type: ignore
    def CheckDependencies(  # noqa: N802
        self,
    ) -> Tuple[bool, List[str]]:
        """Check if all dependencies are available.

        Returns:
            Tuple of (all_ok, list_of_missing)
        """
        try:
            return self.manager.check_dependencies()
        except Exception as e:
            return False, [f"Error checking dependencies: {str(e)}"]

    # D-Bus Signals
    @dbus.service.signal(DBUS_NAME, signature="s")  # type: ignore
    def RecordingStarted(self, recording_id: str) -> None:  # noqa: N802
        """Signal emitted when recording starts."""
        pass

    @dbus.service.signal(DBUS_NAME, signature="ss")  # type: ignore
    def RecordingStopped(self, recording_id: str, reason: str) -> None:  # noqa: N802
        """Signal emitted when recording stops."""
        pass

    @dbus.service.signal(DBUS_NAME, signature="ss")  # type: ignore
    def TranscriptionReady(self, recording_id: str, text: str) -> None:  # noqa: N802
        """Signal emitted when transcription is ready."""
        pass

    @dbus.service.signal(DBUS_NAME, signature="ss")  # type: ignore
    def RecordingError(  # noqa: N802
        self, recording_id: str, error_message: str
    ) -> None:
        """Signal emitted when an error occurs."""
        pass

    @dbus.service.signal(DBUS_NAME, signature="sb")  # type: ignore
    def TextTyped(self, text: str, success: bool) -> None:  # noqa: N802
        """Signal emitted when text is typed."""
        pass

    @dbus.service.signal(DBUS_NAME, signature="sb")  # type: ignore
    def TextCopied(self, text: str, success: bool) -> None:  # noqa: N802
        """Signal emitted when text is copied to clipboard."""
        pass

    def _on_recording_state_change(
        self, recording_id: str, state: RecordingState, data: Dict[str, Any]
    ) -> None:
        """Translate Recording state changes to D-Bus signals.

        Args:
            recording_id: Recording identifier
            state: New recording state
            data: State-specific data
        """
        try:
            if state == RecordingState.RECORDING:
                self.RecordingStarted(recording_id)

            elif state == RecordingState.RECORDED:
                self.RecordingStopped(recording_id, "recorded")

            elif state == RecordingState.COMPLETED:
                text = data.get("text", "")
                self.TranscriptionReady(recording_id, text)

            elif state == RecordingState.CANCELLED:
                self.RecordingStopped(recording_id, "cancelled")

            elif state == RecordingState.FAILED:
                error = data.get("error", "Unknown error")
                self.RecordingError(recording_id, error)
                self.RecordingStopped(recording_id, "failed")

        except Exception as e:
            syslog.syslog(
                syslog.LOG_ERR, f"Error emitting D-Bus signal for state {state}: {e}"
            )

    def _emit_signal(self, signal_name: str, text: str, success: bool) -> None:
        """Emit a D-Bus signal for post-processing actions.

        Args:
            signal_name: Name of the signal to emit ("TextTyped" or "TextCopied")
            text: The text that was processed
            success: Whether the operation succeeded
        """
        try:
            if signal_name == "TextTyped":
                self.TextTyped(text, success)
            elif signal_name == "TextCopied":
                self.TextCopied(text, success)
            else:
                syslog.syslog(
                    syslog.LOG_WARNING, f"Unknown signal name: {signal_name}"
                )
        except Exception as e:
            syslog.syslog(
                syslog.LOG_ERR, f"Error emitting {signal_name} signal: {e}"
            )


def main() -> int:
    """Main function to start the D-Bus service."""
    try:
        service = Speech2TextService()

        # Set up signal handlers for graceful shutdown
        def signal_handler(signum: int, _frame: Any) -> None:
            syslog.syslog(
                syslog.LOG_INFO, f"Received signal {signum}, shutting down..."
            )

            # Shutdown recording manager
            try:
                service.manager.shutdown()
            except Exception as e:
                syslog.syslog(syslog.LOG_ERR, f"Error during manager shutdown: {e}")

            # Stop whisper-server if we started it
            try:
                syslog.syslog(syslog.LOG_INFO, "Stopping whisper-server...")
                service.whisper_client.stop_server()
                syslog.syslog(syslog.LOG_INFO, "Whisper-server stopped")
            except Exception as e:
                syslog.syslog(syslog.LOG_ERR, f"Error stopping whisper-server: {e}")

            syslog.syslog(syslog.LOG_INFO, "Shutdown complete, exiting...")
            sys.exit(0)

        signal.signal(signal.SIGTERM, signal_handler)
        signal.signal(signal.SIGINT, signal_handler)

        syslog.syslog(
            syslog.LOG_INFO,
            "Starting Speech2Text D-Bus service main loop (whisper.cpp backend)...",
        )

        # Start the main loop
        loop = GLib.MainLoop()
        loop.run()

        return 0

    except Exception as e:
        syslog.syslog(syslog.LOG_ERR, f"Error starting service: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
