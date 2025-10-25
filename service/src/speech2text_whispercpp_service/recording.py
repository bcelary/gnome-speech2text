#!/usr/bin/env python3
"""
Recording state machine for managing a single recording lifecycle.

Each recording runs in its own thread with its own lock for state management,
using event-based signaling instead of polling for better performance.
"""

import syslog
import tempfile
import threading
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from .audio_recorder import AudioRecorder
from .constants import RECORDING_POLL_INTERVAL
from .post_processor import PostProcessor
from .transcriber import Transcriber
from .types import (
    InvalidStateTransitionError,
    PostRecordingAction,
    RecordingConfig,
    RecordingState,
    TranscriptionCancelledError,
)

# Valid state transitions for the recording state machine
# FAILED state can be reached from any state (including terminal states)
# via the special case in Recording._transition_state() for error handling.
VALID_TRANSITIONS = {
    RecordingState.STARTING: {
        RecordingState.RECORDING,
        RecordingState.CANCELLED,
        RecordingState.FAILED,
    },
    RecordingState.RECORDING: {
        RecordingState.RECORDED,
        RecordingState.CANCELLED,
        RecordingState.FAILED,
    },
    RecordingState.RECORDED: {
        RecordingState.TRANSCRIBING,
        RecordingState.CANCELLED,  # Allow cancellation before transcription starts
        RecordingState.FAILED,
    },
    RecordingState.TRANSCRIBING: {
        RecordingState.COMPLETED,
        RecordingState.CANCELLED,  # Allow cancellation during transcription
        RecordingState.FAILED,
    },
    # Terminal states have no valid transitions
    RecordingState.COMPLETED: set(),
    RecordingState.CANCELLED: set(),
    RecordingState.FAILED: set(),
}


class Recording:
    """State machine for a single recording lifecycle."""

    def __init__(
        self,
        config: RecordingConfig,
        transcriber: Transcriber,
        post_processor: PostProcessor,
        on_state_change: Optional[
            Callable[[str, RecordingState, Dict[str, Any]], None]
        ] = None,
        on_action_result: Optional[Callable[[str, str, bool], None]] = None,
    ):
        """Initialize recording state machine.

        Args:
            config: Immutable recording configuration
            transcriber: Transcriber instance for audio-to-text
            post_processor: PostProcessor for clipboard/typing
            on_state_change: Callback for lifecycle signals (RecordingStarted, etc)
            on_action_result: Callback for action result signals (TextTyped, TextCopied)
        """
        self.config = config
        self.transcriber = transcriber
        self.post_processor = post_processor
        self.on_state_change = on_state_change
        self.on_action_result = on_action_result

        # State management
        self._state = RecordingState.STARTING
        self._state_lock = threading.Lock()

        # Control events
        self._stop_event = threading.Event()
        self._cancel_event = threading.Event()  # Separate event for cancellation
        self._cancelled = False

        # Resources
        self._audio_file: Optional[Path] = None
        self._audio_recorder: Optional[AudioRecorder] = None
        self._transcribed_text: Optional[str] = None

    def run(self) -> None:
        """Main execution method (called in worker thread).

        Executes the full recording lifecycle with guaranteed cleanup.
        """
        try:
            self._execute_recording()

            # Check if cancelled before proceeding
            with self._state_lock:
                if self._cancelled:
                    syslog.syslog(
                        syslog.LOG_INFO,
                        f"Recording {self.config.recording_id} was cancelled, skipping transcription",
                    )
                    return

            self._execute_transcription()
            self._execute_post_processing()

        except Exception as e:
            syslog.syslog(
                syslog.LOG_ERR,
                f"Recording {self.config.recording_id} failed: {e}",
            )
            self._transition_state(RecordingState.FAILED, {"error": str(e)})
        finally:
            self._cleanup()

    def request_stop(self) -> None:
        """Request recording to stop gracefully."""
        syslog.syslog(
            syslog.LOG_INFO, f"Stop requested for recording {self.config.recording_id}"
        )
        self._stop_event.set()

    def request_cancel(self) -> None:
        """Request recording to cancel (abort at any stage)."""
        syslog.syslog(
            syslog.LOG_INFO,
            f"Cancel requested for recording {self.config.recording_id}",
        )
        with self._state_lock:
            self._cancelled = True
        self._stop_event.set()
        self._cancel_event.set()  # Signal cancellation to transcriber
        self._transition_state(RecordingState.CANCELLED, {})

    def get_state(self) -> RecordingState:
        """Get current state (thread-safe).

        Returns:
            Current recording state
        """
        with self._state_lock:
            return self._state

    def _transition_state(
        self, new_state: RecordingState, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Transition to a new state with validation.

        Args:
            new_state: Target state
            data: Optional data to pass to callback

        Raises:
            InvalidStateTransition: If transition is invalid
        """
        with self._state_lock:
            current_state = self._state

            # Check if transition is valid
            valid_next_states = VALID_TRANSITIONS.get(current_state, set())
            if (
                new_state not in valid_next_states
                and new_state != RecordingState.FAILED
            ):
                raise InvalidStateTransitionError(current_state, new_state)

            self._state = new_state
            syslog.syslog(
                syslog.LOG_INFO,
                f"Recording {self.config.recording_id}: {current_state.value} -> {new_state.value}",
            )

        # Invoke callback outside lock to avoid deadlocks
        if self.on_state_change:
            try:
                self.on_state_change(self.config.recording_id, new_state, data or {})
            except Exception as e:
                syslog.syslog(
                    syslog.LOG_ERR,
                    f"Error in state change callback: {e}",
                )

    def _execute_recording(self) -> None:
        """Execute the recording phase."""
        # Create temporary audio file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            self._audio_file = Path(tmp_file.name)

        syslog.syslog(
            syslog.LOG_INFO,
            f"Recording {self.config.recording_id} to {self._audio_file}",
        )

        # Create and start audio recorder
        self._audio_recorder = AudioRecorder(self._audio_file, self.config.duration)
        self._audio_recorder.start()

        # Transition to RECORDING state
        self._transition_state(RecordingState.RECORDING, {})

        # Monitor recording with event-based stop detection
        while (
            self._audio_recorder.process and self._audio_recorder.process.poll() is None
        ):
            # Wait on event with timeout (no polling!)
            if self._stop_event.wait(timeout=RECORDING_POLL_INTERVAL):
                # Stop requested
                break

        # Stop recording
        self._audio_recorder.stop(graceful=True)
        self._audio_recorder.wait()

        # Validate audio file
        audio_file_info = self._audio_recorder.validate_audio_file()
        if not audio_file_info.exists or audio_file_info.size_bytes < 100:
            raise Exception(
                f"Audio validation failed: size={audio_file_info.size_bytes} bytes, exists={audio_file_info.exists}"
            )

        # Check cancellation and transition to RECORDED atomically under lock
        # This prevents race condition where cancel could be called between the check and transition
        with self._state_lock:
            if self._cancelled:
                # Already in CANCELLED state, don't transition to RECORDED
                return
            # Transition to RECORDED while holding lock
            current_state = self._state
            valid_next_states = VALID_TRANSITIONS.get(current_state, set())
            if RecordingState.RECORDED not in valid_next_states:
                raise InvalidStateTransitionError(
                    current_state, RecordingState.RECORDED
                )
            self._state = RecordingState.RECORDED
            syslog.syslog(
                syslog.LOG_INFO,
                f"Recording {self.config.recording_id}: {current_state.value} -> {RecordingState.RECORDED.value}",
            )

        # Invoke callback outside lock to avoid deadlocks
        if self.on_state_change:
            try:
                self.on_state_change(self.config.recording_id, RecordingState.RECORDED, {})
            except Exception as e:
                syslog.syslog(
                    syslog.LOG_ERR,
                    f"Error in state change callback: {e}",
                )

    def _execute_transcription(self) -> None:
        """Execute the transcription phase."""
        if not self._audio_file:
            raise Exception("No audio file available for transcription")

        self._transition_state(RecordingState.TRANSCRIBING, {})

        try:
            # Transcribe audio with cancellation support
            self._transcribed_text = self.transcriber.transcribe(
                self._audio_file, cancel_event=self._cancel_event
            )

            syslog.syslog(
                syslog.LOG_INFO,
                f"Transcription completed: {len(self._transcribed_text)} chars",
            )

            self._transition_state(
                RecordingState.COMPLETED, {"text": self._transcribed_text}
            )
        except TranscriptionCancelledError:
            # Transcription was cancelled - state already set to CANCELLED
            syslog.syslog(
                syslog.LOG_INFO,
                f"Transcription cancelled for recording {self.config.recording_id}",
            )
            # Don't transition state - request_cancel() already did it
            return

    def _execute_post_processing(self) -> None:
        """Execute post-processing based on configured action."""
        if not self._transcribed_text:
            syslog.syslog(
                syslog.LOG_WARNING,
                "No transcribed text available for post-processing",
            )
            return

        action = self.config.post_recording_action

        # Handle each action explicitly
        if action == PostRecordingAction.PREVIEW:
            # No automatic action - text is available via D-Bus signal
            syslog.syslog(
                syslog.LOG_DEBUG,
                f"Preview mode - no automatic action for {self.config.recording_id}",
            )

        elif action == PostRecordingAction.TYPE_ONLY:
            self._type_text()

        elif action == PostRecordingAction.COPY_ONLY:
            self._copy_to_clipboard()

        elif action == PostRecordingAction.TYPE_AND_COPY:
            self._copy_to_clipboard()
            self._type_text()

        else:
            syslog.syslog(
                syslog.LOG_WARNING,
                f"Unknown post-recording action: {action}",
            )

    def _copy_to_clipboard(self) -> None:
        """Copy transcribed text to clipboard."""
        if self._transcribed_text is None:
            syslog.syslog(
                syslog.LOG_WARNING,
                f"No text to copy for recording {self.config.recording_id}",
            )
            return
        success = self.post_processor.copy_to_clipboard(self._transcribed_text)

        # Emit TextCopied signal if callback is available
        if self.on_action_result:
            try:
                self.on_action_result("TextCopied", self._transcribed_text, success)
            except Exception as e:
                syslog.syslog(
                    syslog.LOG_ERR,
                    f"Error emitting TextCopied signal: {e}",
                )

        if not success:
            syslog.syslog(
                syslog.LOG_WARNING,
                f"Failed to copy to clipboard for recording {self.config.recording_id}",
            )

    def _type_text(self) -> None:
        """Type transcribed text."""
        if self._transcribed_text is None:
            syslog.syslog(
                syslog.LOG_WARNING,
                f"No text to type for recording {self.config.recording_id}",
            )
            return
        success = self.post_processor.type_text(self._transcribed_text)

        # Emit TextTyped signal if callback is available
        if self.on_action_result:
            try:
                self.on_action_result("TextTyped", self._transcribed_text, success)
            except Exception as e:
                syslog.syslog(
                    syslog.LOG_ERR,
                    f"Error emitting TextTyped signal: {e}",
                )

        # Note: We don't fail the recording if typing fails, just log it
        if not success:
            syslog.syslog(
                syslog.LOG_WARNING,
                f"Failed to type text for recording {self.config.recording_id}",
            )

    def _cleanup(self) -> None:
        """Clean up resources (always called in finally block)."""
        syslog.syslog(
            syslog.LOG_DEBUG,
            f"Cleaning up recording {self.config.recording_id}",
        )

        # Clean up audio file
        if self._audio_file and self._audio_file.exists():
            try:
                self._audio_file.unlink()
                syslog.syslog(
                    syslog.LOG_DEBUG,
                    f"Deleted audio file: {self._audio_file}",
                )
            except Exception as e:
                syslog.syslog(
                    syslog.LOG_WARNING,
                    f"Failed to delete audio file {self._audio_file}: {e}",
                )

        # Ensure recorder process is stopped
        if (
            self._audio_recorder
            and self._audio_recorder.process
            and self._audio_recorder.process.poll() is None
        ):
            try:
                self._audio_recorder.stop(graceful=False)
            except Exception as e:
                syslog.syslog(
                    syslog.LOG_WARNING,
                    f"Error stopping recorder process: {e}",
                )
