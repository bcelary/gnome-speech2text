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
    PACKAGE_NAME,
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


def setup_dbus_service() -> tuple[bool, Optional[Path]]:
    """Register D-Bus service file. Returns (success, file_path)."""
    executable_path = get_service_executable_path()
    if not executable_path:
        print(f"❌ Could not find {SERVICE_EXECUTABLE}. See README for installation.")
        return False, None

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
        return True, service_file
    except Exception as e:
        print(f"❌ Failed to register D-Bus service: {e}")
        return False, None


def setup_desktop_entry() -> tuple[bool, Optional[Path]]:
    """Create desktop entry (hidden, for system integration). Returns (success, file_path)."""
    executable_path = get_service_executable_path()
    if not executable_path:
        return False, None

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
        return True, desktop_file
    except Exception as e:
        print(f"❌ Failed to create desktop entry: {e}")
        return False, None


def check_whisper_cpp() -> None:
    """Check if whisper.cpp is set up (informational only)."""
    print("\n🔍 Checking whisper.cpp:")

    if shutil.which("whisper-server"):
        print("  ✅ whisper-server found")
    else:
        print("  ⚠️  whisper-server not found")

    cache_dir = Path.home() / ".cache" / "whisper.cpp"
    if cache_dir.exists():
        models = list(cache_dir.glob("ggml-*.bin"))
        if models:
            print(f"  ✅ {len(models)} model(s) cached")
        else:
            print("  ⚠️  No models found")
    else:
        print("  ⚠️  No model cache")

    print("\n  See README for whisper.cpp setup.")


def print_setup_summary(
    executable_path: str,
    dbus_file: Optional[Path],
    desktop_file: Optional[Path],
) -> None:
    """Print summary of installed files."""
    print("\n📋 Installation summary:")
    print(f"  Service:  {executable_path}")
    if dbus_file:
        print(f"  D-Bus:    {dbus_file}")
    if desktop_file:
        print(f"  Desktop:  {desktop_file}")


def main() -> int:
    """Main setup function."""
    print("=" * 60)
    print("  GNOME Speech2Text Service (WhisperCpp) - Setup")
    print("=" * 60)
    print()

    executable_path = get_service_executable_path()
    if not executable_path:
        print("❌ Service executable not found. See README for installation.")
        return 1

    print("🔧 Setting up D-Bus integration...")
    success, dbus_file = setup_dbus_service()
    if not success:
        return 1

    success, desktop_file = setup_desktop_entry()
    if not success:
        return 1

    check_whisper_cpp()

    print_setup_summary(executable_path, dbus_file, desktop_file)

    print()
    print("=" * 60)
    print("✅ Setup complete!")
    print("=" * 60)
    print()
    print("Service will start automatically via D-Bus.")
    print(f"Test manually: {executable_path}")

    return 0


def remove_dbus_service() -> tuple[bool, Optional[Path]]:
    """Remove D-Bus service file. Returns (success, file_path)."""
    dbus_service_file = (
        Path.home() / ".local" / "share" / "dbus-1" / "services" / DBUS_SERVICE_FILE
    )

    if dbus_service_file.exists():
        try:
            dbus_service_file.unlink()
            print("✅ Removed D-Bus service")
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
            print("✅ Removed desktop entry")
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
            print("✅ Removed old service directory")
            return True, service_dir
        except Exception as e:
            print(f"❌ Failed to remove old service directory: {e}")
            return False, None
    return True, None


def stop_running_service() -> list[str]:
    """Attempt to stop any running service processes. Returns list of stopped PIDs."""
    stopped_pids = []
    try:
        result = subprocess.run(
            ["pgrep", "-f", SERVICE_EXECUTABLE],
            capture_output=True,
            text=True,
        )

        if result.returncode == 0 and result.stdout.strip():
            pids = result.stdout.strip().split("\n")
            current_pid = str(sys.getpid())
            for pid in pids:
                # Skip our own process to avoid killing the uninstall script
                if pid == current_pid:
                    continue
                try:
                    subprocess.run(["kill", pid], check=True)
                    print(f"✅ Stopped process {pid}")
                    stopped_pids.append(pid)
                except subprocess.CalledProcessError:
                    print(f"⚠️  Could not stop process {pid}")
    except FileNotFoundError:
        print("ℹ️  Could not check for running processes (pgrep not available)")
    except Exception as e:
        print(f"⚠️  Could not check for running processes: {e}")
    return stopped_pids


def print_uninstall_summary(
    stopped_pids: list[str],
    dbus_file: Optional[Path],
    desktop_file: Optional[Path],
    old_dir: Optional[Path],
) -> None:
    """Print summary of removed files."""
    print("\n📋 Removal summary:")
    if stopped_pids:
        print(f"  Processes: Stopped {len(stopped_pids)} process(es)")
    if dbus_file:
        print(f"  D-Bus:     {dbus_file}")
    if desktop_file:
        print(f"  Desktop:   {desktop_file}")
    if old_dir:
        print(f"  Old dir:   {old_dir}")


def uninstall() -> int:
    """Main uninstall function - removes all service-related files."""
    print("=" * 60)
    print("  GNOME Speech2Text Service (WhisperCpp) - Uninstall")
    print("=" * 60)
    print()

    stopped_pids = stop_running_service()
    _, dbus_file = remove_dbus_service()
    _, desktop_file = remove_desktop_entry()
    _, old_dir = remove_old_service_directory()

    print_uninstall_summary(stopped_pids, dbus_file, desktop_file, old_dir)

    print()
    print("=" * 60)
    print("✅ Cleanup complete!")
    print("=" * 60)
    print()
    print(f"To complete uninstall: pipx uninstall {PACKAGE_NAME}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
