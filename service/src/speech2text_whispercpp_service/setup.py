#!/usr/bin/env python3
"""
D-Bus service setup and registration for GNOME Speech2Text WhisperCpp Service.

This module handles:
- D-Bus service file registration
- Desktop entry creation
- Installation verification
- Uninstallation and cleanup

Can be run standalone after pipx installation:
    speech2text-whispercpp-setup    # Setup
    speech2text-whispercpp-uninstall  # Cleanup before uninstalling
"""

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

from speech2text_whispercpp_service.constants import (
    DBUS_NAME,
    DBUS_SERVICE_FILE,
    SERVICE_EXECUTABLE,
)


def get_service_executable_path() -> Optional[str]:
    """Find the installed service executable path."""
    # Try to find the executable in PATH
    executable = shutil.which(SERVICE_EXECUTABLE)
    if executable:
        return str(Path(executable).resolve())

    # Check if we're running from a venv (development mode)
    # Look in the same bin directory as the Python interpreter
    python_bin = Path(sys.executable)
    if python_bin.parent.name == "bin":
        service_bin = python_bin.parent / SERVICE_EXECUTABLE
        if service_bin.exists():
            return str(service_bin)

    # Fallback: check common pipx installation location
    home = Path.home()
    pipx_bin = home / ".local" / "bin" / SERVICE_EXECUTABLE
    if pipx_bin.exists():
        return str(pipx_bin)

    return None


def setup_dbus_service() -> bool:
    """Register D-Bus service file. Returns (success, file_path)."""
    executable_path = get_service_executable_path()
    if not executable_path:
        print(f"❌ Could not find {SERVICE_EXECUTABLE}. See README for installation.")
        return False

    dbus_service_dir = Path.home() / ".local" / "share" / "dbus-1" / "services"
    dbus_service_dir.mkdir(parents=True, exist_ok=True)
    service_file = dbus_service_dir / DBUS_SERVICE_FILE

    service_content = f"""[D-BUS Service]
Name={DBUS_NAME}
Exec={executable_path}
"""

    try:
        service_file.write_text(service_content)
        print("✅ D-Bus service registered")
        return True
    except Exception as e:
        print(f"❌ Failed to register D-Bus service: {e}")
        return False


def setup_desktop_entry() -> bool:
    """Create desktop entry (hidden, for system integration). Returns (success, file_path)."""
    executable_path = get_service_executable_path()
    if not executable_path:
        print("❌ Failed to create desktop entry, no executable path found")
        return False

    desktop_dir = Path.home() / ".local" / "share" / "applications"
    desktop_dir.mkdir(parents=True, exist_ok=True)
    desktop_file = desktop_dir / f"{SERVICE_EXECUTABLE}.desktop"

    desktop_content = f"""[Desktop Entry]
Type=Application
Name=GNOME Speech2Text Service (WhisperCpp)
Comment=D-Bus service for speech-to-text functionality using whisper.cpp
Exec={executable_path}
Icon=audio-input-microphone
StartupNotify=false
NoDisplay=true
Categories=Utility;
"""

    try:
        desktop_file.write_text(desktop_content)
        print("✅ Desktop entry created")
        return True
    except Exception as e:
        print(f"❌ Failed to create desktop entry: {e}")
        return False


def check_whisper_cpp() -> None:
    """Check if whisper.cpp is set up (informational only)."""
    if shutil.which("whisper-server"):
        print("✅ whisper-server found")
    else:
        print("⚠️ whisper-server not found")

    cache_dir = Path.home() / ".cache" / "whisper.cpp"
    if cache_dir.exists():
        models = list(cache_dir.glob("ggml-*.bin"))
        if models:
            print(f"✅ {len(models)} model(s) cached")
        else:
            print("⚠️ No models found")
    else:
        print("⚠️ No model cache")


def setup() -> int:
    """Setup function."""
    executable_path = get_service_executable_path()
    if not executable_path:
        print("❌ Service executable not found. See README for installation.")
        return 1

    if not setup_dbus_service():
        return 1

    if not setup_desktop_entry():
        return 1

    check_whisper_cpp()

    print("✅ Setup complete!")

    return 0


def remove_dbus_service() -> tuple[bool, Optional[Path]]:
    """Remove D-Bus service file. Returns (success, file_path)."""
    dbus_service_file = (
        Path.home() / ".local" / "share" / "dbus-1" / "services" / DBUS_SERVICE_FILE
    )

    if dbus_service_file.exists():
        try:
            dbus_service_file.unlink()
            print("✅ D-Bus service removed")
            return True, dbus_service_file
        except Exception as e:
            print(f"❌ Failed to remove D-Bus service: {e}")
            return False, None
    return True, None


def remove_desktop_entry() -> tuple[bool, Optional[Path]]:
    """Remove desktop entry. Returns (success, file_path)."""
    desktop_file = (
        Path.home()
        / ".local"
        / "share"
        / "applications"
        / f"{SERVICE_EXECUTABLE}.desktop"
    )

    if desktop_file.exists():
        try:
            desktop_file.unlink()
            print("✅ Desktop entry removed")
            return True, desktop_file
        except Exception as e:
            print(f"❌ Failed to remove desktop entry: {e}")
            return False, None
    return True, None


def remove_old_service_directory() -> tuple[bool, Optional[Path]]:
    """Remove old-style service directory if it exists. Returns (success, dir_path)."""
    service_dir = Path.home() / ".local" / "share" / "speech2text-whispercpp-service"

    if service_dir.exists():
        try:
            shutil.rmtree(service_dir)
            print("✅ Old service directory removed")
            return True, service_dir
        except Exception as e:
            print(f"❌ Failed to remove old service directory: {e}")
            return False, None
    return True, None


def stop_running_service() -> bool:
    """Stop the D-Bus service using modern systemd/D-Bus tools.

    Returns True if service is stopped (either was not running or successfully stopped).
    Returns False only if we failed to stop a running service.
    """
    # First, try to check if the service is running via D-Bus
    try:
        result = subprocess.run(
            ["busctl", "--user", "status", DBUS_NAME],
            capture_output=True,
            text=True,
            timeout=5,
        )

        # If service is not running, busctl status will fail
        if result.returncode != 0:
            print("ℹ️ Service not running")
            return True  # Already stopped, mission accomplished

        # Service is running, send SIGTERM via D-Bus
        # This is the clean way - let the service shut down gracefully
        subprocess.run(
            [
                "busctl",
                "--user",
                "call",
                DBUS_NAME,
                "/",
                "org.freedesktop.DBus.Peer",
                "Ping",
            ],
            capture_output=True,
            timeout=2,
        )

        # Now send termination signal
        # The service listens to SIGTERM and shuts down gracefully
        subprocess.run(
            [
                "systemctl",
                "--user",
                "kill",
                "--signal=TERM",
                f"dbus-{DBUS_NAME}.service",
            ],
            capture_output=True,
            timeout=5,
        )

        print(f"✅ Stopped D-Bus service {DBUS_NAME}")
        return True

    except subprocess.TimeoutExpired:
        print("⚠️ Timeout while trying to stop service")
    except FileNotFoundError:
        # busctl or systemctl not available - try fallback
        # Just remove the D-Bus file, service will exit on idle
        pass
    except Exception as e:
        print(f"⚠️ Could not stop service via D-Bus: {e}")

    return False


def uninstall() -> int:
    """Main uninstall function - removes all service-related files."""
    stop_running_service()
    remove_dbus_service()
    remove_desktop_entry()
    remove_old_service_directory()

    return 0
