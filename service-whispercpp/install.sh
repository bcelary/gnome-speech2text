#!/bin/bash

# GNOME Speech2Text WhisperCpp Service - Installer
# This script installs the service using pipx
#
# Usage:
#   ./install.sh              # Install from GitHub (default)
#   ./install.sh --from-source # Install from local source directory
#
# For development workflow, see README.md for uv-based editable install

set -e

# Parse arguments
INSTALL_FROM_SOURCE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --from-source)
            INSTALL_FROM_SOURCE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --from-source    Install from local source directory"
            echo "  -h, --help       Show this help message"
            echo ""
            echo "Default: Install from GitHub"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   GNOME Speech2Text WhisperCpp Service Installer (pipx)      ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo
}

print_status() {
    echo -e "${GREEN}✅${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ️${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

error_exit() {
    print_error "$1"
    echo -e "\n${RED}Installation failed. Check the error above and try again.${NC}"
    exit 1
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

print_header

if [ "$INSTALL_FROM_SOURCE" = true ]; then
    print_info "Installing WhisperCpp service from local source directory using pipx"
else
    print_info "Installing WhisperCpp service from GitHub using pipx"
fi
print_info "pipx is the recommended way to install Python applications"
echo

# Step 0: Check for required system packages
echo -e "${CYAN}Step 0/4: Checking required system packages...${NC}"

check_python_package() {
    python3 -c "import $1" 2>/dev/null
}

missing_packages=()

if ! check_python_package "dbus"; then
    missing_packages+=("python3-dbus")
fi

if ! check_python_package "gi"; then
    missing_packages+=("python3-gi/python3-gobject")
fi

if ! command_exists ffmpeg; then
    missing_packages+=("ffmpeg")
fi

# Check for clipboard tools (session-type specific)
SESSION_TYPE="${XDG_SESSION_TYPE:-}"
clipboard_found=false

if [ "$SESSION_TYPE" = "wayland" ]; then
    if command_exists wl-copy; then
        clipboard_found=true
    else
        missing_packages+=("wl-clipboard")
    fi
else
    # X11 or unknown - check for xclip or xsel
    if command_exists xclip || command_exists xsel; then
        clipboard_found=true
    else
        missing_packages+=("xclip or xsel")
    fi
fi

if [ ${#missing_packages[@]} -gt 0 ]; then
    print_error "Missing required system packages: ${missing_packages[*]}"
    echo
    echo "Please install them first:"
    echo

    if command_exists apt; then
        echo "  sudo apt install python3-dbus python3-gi ffmpeg wl-clipboard xdotool xclip"
    elif command_exists dnf; then
        echo "  sudo dnf install python3-dbus python3-gobject ffmpeg wl-clipboard xdotool xclip"
    elif command_exists pacman; then
        echo "  sudo pacman -S python-dbus python-gobject ffmpeg wl-clipboard xdotool xclip"
    else
        echo "  Install: python3-dbus python3-gi ffmpeg wl-clipboard xdotool xclip"
    fi

    echo
    exit 1
fi

print_status "All required system packages are installed"

# Check for optional packages
if [ "$SESSION_TYPE" != "wayland" ] && ! command_exists xdotool; then
    print_warning "Optional package not found: xdotool (needed for text insertion on X11)"
    echo "  Install with: sudo apt install xdotool (or equivalent for your distro)"
fi

echo

# Step 1: Check/Install pipx
echo -e "${CYAN}Step 1/4: Checking pipx...${NC}"
if command_exists pipx; then
    print_status "pipx is already installed"
else
    print_warning "pipx is not installed"
    echo
    echo "Installing pipx..."

    # Detect package manager
    if command_exists apt; then
        sudo apt update && sudo apt install -y pipx || error_exit "Failed to install pipx"
    elif command_exists dnf; then
        sudo dnf install -y pipx || error_exit "Failed to install pipx"
    elif command_exists pacman; then
        sudo pacman -S --noconfirm python-pipx || error_exit "Failed to install pipx"
    else
        print_error "Could not detect package manager"
        echo
        echo "Please install pipx manually:"
        echo "  https://pipx.pypa.io/stable/installation/"
        exit 1
    fi

    # Ensure pipx PATH is configured
    pipx ensurepath || true

    print_status "pipx installed successfully"
    print_warning "You may need to restart your shell or run: source ~/.bashrc"
    echo "  (This ensures pipx-installed commands are available)"
fi

echo

# Step 2: Install the service with pipx
echo -e "${CYAN}Step 2/4: Installing service with pipx...${NC}"

# Determine installation source
if [ "$INSTALL_FROM_SOURCE" = true ]; then
    # Get the directory where this script is located
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # Verify we're in the service directory
    if [ ! -f "$SCRIPT_DIR/pyproject.toml" ]; then
        error_exit "pyproject.toml not found. Make sure you're running this from the service-whispercpp directory"
    fi

    INSTALL_SOURCE="$SCRIPT_DIR"
    print_info "Installing from: $INSTALL_SOURCE"
else
    INSTALL_SOURCE="git+https://github.com/bcelary/gnome-speech2text.git#subdirectory=service-whispercpp"
    print_info "Installing from GitHub"
fi

# Check if already installed
if pipx list | grep -q "gnome-speech2text-service-whispercpp"; then
    print_warning "Service is already installed. Upgrading..."

    # For local source installs, use --force to ensure changes are picked up
    if [ "$INSTALL_FROM_SOURCE" = true ]; then
        print_info "Using --force to reinstall from local source..."
        pipx install --force --system-site-packages "$INSTALL_SOURCE" || error_exit "Failed to reinstall service"
    else
        pipx upgrade gnome-speech2text-service-whispercpp || error_exit "Failed to upgrade service"
    fi

    print_status "Service upgraded successfully"
else
    print_info "Installing gnome-speech2text-service-whispercpp..."
    # Use --system-site-packages to allow access to python3-dbus and python3-gi
    pipx install --system-site-packages "$INSTALL_SOURCE" || error_exit "Failed to install service"
    print_status "Service installed successfully"
fi

echo

# Step 3: Run setup (D-Bus registration)
echo -e "${CYAN}Step 3/4: Configuring D-Bus integration...${NC}"

# Make sure pipx bin directory is in PATH for this session
export PATH="$HOME/.local/bin:$PATH"

# Run the setup command
if command_exists gnome-speech2text-whispercpp-setup; then
    gnome-speech2text-whispercpp-setup || error_exit "Setup command failed. D-Bus integration could not be configured"
else
    error_exit "Setup command not found. Please check pipx installation"
fi

echo

# Step 4: Check whisper.cpp setup
echo -e "${CYAN}Step 4/4: Checking whisper.cpp setup...${NC}"

if command_exists whisper-server; then
    print_status "whisper-server found in PATH"
else
    print_warning "whisper-server not found in PATH"
    echo
    echo "To use this service, you need to build whisper.cpp:"
    echo "  git clone https://github.com/ggerganov/whisper.cpp"
    echo "  cd whisper.cpp"
    echo "  make server"
    echo "  bash ./models/download-ggml-model.sh base ~/.cache/whisper.cpp"
    echo
    echo "The service will auto-start whisper-server when needed."
fi

echo
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Installation completed successfully!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo
echo -e "${YELLOW}What's next?${NC}"
echo
echo "1. Install the GNOME Shell extension from:"
echo "   https://extensions.gnome.org/extension/8238/gnome-speech2text/"
echo
echo "2. The service will start automatically when the extension needs it"
echo
echo "3. To manually test the service:"
echo "   gnome-speech2text-service-whispercpp"
echo
echo -e "${YELLOW}To uninstall:${NC}"
echo "  gnome-speech2text-whispercpp-uninstall  # Clean up service files"
echo "  pipx uninstall gnome-speech2text-service-whispercpp  # Remove package"
echo
print_status "Happy speech-to-texting! 🎤"
