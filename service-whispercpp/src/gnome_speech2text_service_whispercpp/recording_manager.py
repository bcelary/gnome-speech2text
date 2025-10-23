#!/usr/bin/env python3
"""
Recording manager for managing a single recording at a time.

Manages the lifecycle of one recording, spawning a worker thread and
coordinating between Recording instance and D-Bus signals.
"""

import syslog
import threading
import uuid
from typing import Any, Callable, Dict, List, Optional, Tuple

from .dependency_checker import DependencyChecker
from .post_processor import PostProcessor
from .recording import Recording
from .transcriber import Transcriber
from .types import (
    MAX_RECORDING_DURATION,
    MIN_RECORDING_DURATION,
    WORKER_THREAD_JOIN_TIMEOUT,
    DependencyError,
    PostRecordingAction,
    RecordingConfig,
    RecordingState,
    ServiceConfig,
)
from .whisper_cpp_client import WhisperCppClient


class RecordingManager:
    """Manage a single recording at a time."""

    def __init__(
        self,
        service_config: ServiceConfig,
        whisper_client: WhisperCppClient,
        dependency_checker: DependencyChecker,
        post_processor: PostProcessor,
        state_change_callback: Optional[
            Callable[[str, RecordingState, Dict[str, Any]], None]
        ] = None,
    ):
        """Initialize recording manager.

        Args:
            service_config: Service-wide configuration
            whisper_client: WhisperCppClient instance
            dependency_checker: Dependency checker instance
            post_processor: PostProcessor instance
            state_change_callback: Callback for recording state changes
        """
        self.service_config = service_config
        self.whisper_client = whisper_client
        self.dependency_checker = dependency_checker
        self.post_processor = post_processor
        self.state_change_callback = state_change_callback

        # Single current recording
        self._current_recording: Optional[Recording] = None
        self._current_recording_id: Optional[str] = None
        self._current_thread: Optional[threading.Thread] = None
        self._recording_lock = threading.Lock()

        # Shutdown coordination
        self._shutdown_event = threading.Event()

    def start_recording(
        self, duration: int, post_recording_action: PostRecordingAction
    ) -> str:
        """Start a new recording.

        Args:
            duration: Maximum recording duration in seconds
            post_recording_action: Action to take after transcription completes

        Returns:
            Recording ID (UUID)

        Raises:
            DependencyError: If required dependencies are missing
            Exception: If recording already in progress or cannot be started
        """
        # Check if recording already in progress
        with self._recording_lock:
            if self._current_recording is not None:
                raise Exception("Recording already in progress")

        # Check dependencies
        dep_result = self.dependency_checker.check_dependencies()
        if not dep_result.all_ok:
            raise DependencyError(dep_result.missing_dependencies)

        # Generate unique recording ID
        recording_id = str(uuid.uuid4())

        # Validate and clamp duration
        duration = max(MIN_RECORDING_DURATION, min(duration, MAX_RECORDING_DURATION))

        # Create recording configuration
        config = RecordingConfig(
            recording_id=recording_id,
            duration=duration,
            post_recording_action=post_recording_action,
        )

        # Create recording instance
        recording = self._create_recording(config)

        # Store as current recording
        with self._recording_lock:
            self._current_recording = recording
            self._current_recording_id = recording_id

        # Start worker thread
        thread = threading.Thread(
            target=self._recording_worker,
            args=(recording,),
            name=f"recording-{recording_id[:8]}",
            daemon=False,  # Non-daemon for graceful shutdown
        )

        with self._recording_lock:
            self._current_thread = thread

        thread.start()

        syslog.syslog(
            syslog.LOG_INFO,
            f"Started recording {recording_id} (duration={duration}s, action={post_recording_action.value})",
        )

        return recording_id

    def stop_recording(self, recording_id: str) -> bool:
        """Request a recording to stop.

        Args:
            recording_id: Recording identifier (must match current recording)

        Returns:
            True if stop request was sent, False if recording not found/mismatch
        """
        with self._recording_lock:
            if (
                self._current_recording is None
                or self._current_recording_id != recording_id
            ):
                syslog.syslog(
                    syslog.LOG_WARNING,
                    f"Cannot stop recording {recording_id}: not current recording",
                )
                return False

            recording = self._current_recording

        recording.request_stop()
        return True

    def cancel_recording(self, recording_id: str) -> bool:
        """Request a recording to cancel (skip transcription).

        Args:
            recording_id: Recording identifier (must match current recording)

        Returns:
            True if cancel request was sent, False if recording not found/mismatch
        """
        with self._recording_lock:
            if (
                self._current_recording is None
                or self._current_recording_id != recording_id
            ):
                syslog.syslog(
                    syslog.LOG_WARNING,
                    f"Cannot cancel recording {recording_id}: not current recording",
                )
                return False

            recording = self._current_recording

        recording.request_cancel()
        return True

    def get_status(self) -> str:
        """Get service status string.

        Returns:
            Status string in format: "status:key=value,..."
        """
        try:
            # Check dependencies
            dep_result = self.dependency_checker.check_dependencies()
            if not dep_result.all_ok:
                missing = ",".join(dep_result.missing_dependencies)
                return f"dependencies_missing:{missing}"

            # Check if recording is active
            with self._recording_lock:
                is_active = self._current_recording is not None

            return f"ready:recording_active={1 if is_active else 0}"

        except Exception as e:
            return f"error:{str(e)}"

    def check_dependencies(self) -> Tuple[bool, List[str]]:
        """Check system dependencies.

        Returns:
            Tuple of (all_ok, list_of_missing)
        """
        result = self.dependency_checker.check_dependencies()
        return result.all_ok, result.missing_dependencies

    def shutdown(self) -> None:
        """Gracefully shutdown current recording and wait for thread."""
        syslog.syslog(syslog.LOG_INFO, "RecordingManager shutting down...")

        # Signal shutdown
        self._shutdown_event.set()

        # Get current recording
        with self._recording_lock:
            recording = self._current_recording
            recording_id = self._current_recording_id
            thread = self._current_thread

        # Cancel current recording if exists
        if recording:
            try:
                recording.request_cancel()
                syslog.syslog(syslog.LOG_INFO, f"Cancelling recording {recording_id}")
            except Exception as e:
                syslog.syslog(
                    syslog.LOG_ERR, f"Error cancelling recording {recording_id}: {e}"
                )

        # Wait for worker thread
        if thread:
            try:
                syslog.syslog(syslog.LOG_INFO, "Waiting for worker thread...")
                thread.join(timeout=WORKER_THREAD_JOIN_TIMEOUT)
                if thread.is_alive():
                    syslog.syslog(
                        syslog.LOG_WARNING,
                        f"Worker thread for {recording_id} did not finish in time",
                    )
            except Exception as e:
                syslog.syslog(syslog.LOG_ERR, f"Error joining thread: {e}")

        syslog.syslog(syslog.LOG_INFO, "RecordingManager shutdown complete")

    def _create_recording(self, config: RecordingConfig) -> Recording:
        """Factory method to create a Recording instance.

        Args:
            config: Recording configuration

        Returns:
            Initialized Recording instance
        """
        # Create transcriber
        transcriber = Transcriber(
            client=self.whisper_client, server_url=self.service_config.server_url
        )

        # Create recording with callback
        return Recording(
            config=config,
            transcriber=transcriber,
            post_processor=self.post_processor,
            callback=self._on_recording_state_change,
        )

    def _recording_worker(self, recording: Recording) -> None:
        """Worker thread function for a recording.

        Args:
            recording: Recording instance to execute
        """
        try:
            recording.run()
        except Exception as e:
            syslog.syslog(
                syslog.LOG_ERR,
                f"Unhandled error in recording worker {recording.config.recording_id}: {e}",
            )
        finally:
            # Clear current recording
            with self._recording_lock:
                if self._current_recording_id == recording.config.recording_id:
                    self._current_recording = None
                    self._current_recording_id = None
                    self._current_thread = None

            syslog.syslog(
                syslog.LOG_DEBUG,
                f"Worker thread for {recording.config.recording_id} exiting",
            )

    def _on_recording_state_change(
        self, recording_id: str, state: RecordingState, data: Dict[str, Any]
    ) -> None:
        """Handle recording state changes.

        Translates Recording state changes to D-Bus signals via callback.

        Args:
            recording_id: Recording identifier
            state: New recording state
            data: State-specific data
        """
        syslog.syslog(
            syslog.LOG_DEBUG,
            f"Recording {recording_id} state changed to {state.value}",
        )

        # Forward to D-Bus callback if registered
        if self.state_change_callback:
            try:
                self.state_change_callback(recording_id, state, data)
            except Exception as e:
                syslog.syslog(
                    syslog.LOG_ERR,
                    f"Error in state change callback: {e}",
                )
