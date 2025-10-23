# GNOME Speech2Text Service (WhisperCpp) - Makefile
# Handles service installation, development setup, and management

PACKAGE_NAME = speech2text-whispercpp-service
SERVICE_NAME = speech2text-whispercpp-service
SETUP_CMD = speech2text-whispercpp-setup
UNINSTALL_CMD = speech2text-whispercpp-uninstall
DBUS_SERVICE_FILE = $(HOME)/.local/share/dbus-1/services/org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service
GITHUB_URL = git+https://github.com/bcelary/gnome-speech2text.git\#subdirectory=service-whispercpp

# Colors for output
RED = \033[0;31m
GREEN = \033[0;32m
YELLOW = \033[1;33m
BLUE = \033[0;34m
CYAN = \033[0;36m
NC = \033[0m

.PHONY: help install install-local upgrade dev uninstall reinstall status \
        check-system-deps check-pipx pipx-install-github pipx-install-local \
        pipx-upgrade setup-dbus check-whisper dev-setup dev-register \
        uninstall-pipx uninstall-dbus kill-service clean \
        format lint typecheck check test

# Default target
help:
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(BLUE)  GNOME Speech2Text Service (WhisperCpp) - Makefile$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(CYAN)Production Installation:$(NC)"
	@echo "  make install         - Full install from GitHub (recommended for users)"
	@echo "  make install-local   - Full install from local source"
	@echo "  make upgrade         - Upgrade existing installation"
	@echo "  make uninstall       - Complete removal"
	@echo "  make reinstall       - Uninstall then install fresh"
	@echo ""
	@echo "$(CYAN)Development:$(NC)"
	@echo "  make dev             - Setup development environment (uv + editable install)"
	@echo "  make format          - Format code with black"
	@echo "  make lint            - Lint and fix code with ruff"
	@echo "  make typecheck       - Type check with mypy"
	@echo "  make check           - Run all code quality checks and fixes"
	@echo "  make test            - Run tests (pytest)"
	@echo "  make clean           - Remove build artifacts"
	@echo ""
	@echo "$(CYAN)Atomic Operations:$(NC)"
	@echo "  make check-system-deps      - Check required system packages"
	@echo "  make check-pipx             - Check if pipx is installed"
	@echo "  make pipx-install-github    - Install via pipx from GitHub"
	@echo "  make pipx-install-local     - Install via pipx from local source"
	@echo "  make pipx-upgrade           - Upgrade pipx package"
	@echo "  make setup-dbus             - Register D-Bus service"
	@echo "  make check-whisper          - Check whisper.cpp setup"
	@echo "  make dev-setup              - Create uv development environment"
	@echo "  make dev-register           - Register dev installation with D-Bus"
	@echo "  make uninstall-pipx         - Remove pipx package"
	@echo "  make uninstall-dbus         - Remove D-Bus registration"
	@echo "  make kill-service           - Stop running service process"
	@echo ""
	@echo "$(CYAN)Utilities:$(NC)"
	@echo "  make status          - Show installation status"
	@echo "  make help            - Show this help message"

# ════════════════════════════════════════════════════════════════
# Convenience Targets (User-Facing Workflows)
# ════════════════════════════════════════════════════════════════

install: check-system-deps check-pipx pipx-install-github setup-dbus check-whisper
	@echo ""
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(GREEN)✅ Installation completed successfully!$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  1. Install the GNOME Shell extension (if not already installed)"
	@echo "  2. The service will start automatically when needed"
	@echo "  3. To manually test: $(SERVICE_NAME)"
	@echo ""
	@echo "$(YELLOW)To uninstall:$(NC)"
	@echo "  make uninstall"

install-local: check-system-deps check-pipx pipx-install-local setup-dbus check-whisper
	@echo ""
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(GREEN)✅ Local installation completed successfully!$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(YELLOW)Installed from local source directory$(NC)"
	@echo ""
	@echo "$(YELLOW)To uninstall:$(NC)"
	@echo "  make uninstall"

upgrade: check-pipx pipx-upgrade setup-dbus
	@echo ""
	@echo "$(GREEN)✅ Service upgraded successfully$(NC)"

dev: check-system-deps dev-setup dev-register
	@echo ""
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(GREEN)✅ Development environment ready!$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(YELLOW)Development workflow:$(NC)"
	@echo "  • Code changes are immediately active (editable install)"
	@echo "  • Restart service: pkill -f $(SERVICE_NAME)"
	@echo "  • Run service: .venv/bin/$(SERVICE_NAME)"
	@echo "  • View logs: journalctl -f | grep -E 'gnome-speech2text|whispercpp'"
	@echo ""
	@echo "$(YELLOW)Code quality:$(NC)"
	@echo "  make check      - Run all checks and fixes"
	@echo "  make format     - Format code"
	@echo "  make lint       - Lint and fix code"

uninstall: uninstall-pipx uninstall-dbus clean
	@echo ""
	@echo "$(GREEN)✅ Service uninstalled successfully$(NC)"

reinstall: uninstall install
	@echo ""
	@echo "$(GREEN)✅ Service reinstalled successfully$(NC)"

# ════════════════════════════════════════════════════════════════
# Atomic Targets (Fine-Grained Operations)
# ════════════════════════════════════════════════════════════════

check-system-deps:
	@echo "$(CYAN)Checking system dependencies...$(NC)"
	@MISSING_PACKAGES=""; \
	python3 -c "import dbus" 2>/dev/null || MISSING_PACKAGES="$$MISSING_PACKAGES python3-dbus"; \
	python3 -c "import gi" 2>/dev/null || MISSING_PACKAGES="$$MISSING_PACKAGES python3-gi"; \
	command -v ffmpeg >/dev/null 2>&1 || MISSING_PACKAGES="$$MISSING_PACKAGES ffmpeg"; \
	SESSION_TYPE="$${XDG_SESSION_TYPE:-}"; \
	if [ "$$SESSION_TYPE" = "wayland" ]; then \
		command -v wl-copy >/dev/null 2>&1 || MISSING_PACKAGES="$$MISSING_PACKAGES wl-clipboard"; \
	else \
		if ! command -v xclip >/dev/null 2>&1 && ! command -v xsel >/dev/null 2>&1; then \
			MISSING_PACKAGES="$$MISSING_PACKAGES xclip-or-xsel"; \
		fi; \
	fi; \
	if [ -n "$$MISSING_PACKAGES" ]; then \
		echo "$(RED)❌ Missing system packages:$$MISSING_PACKAGES$(NC)"; \
		echo ""; \
		echo "Please install the required packages using your system's package manager."; \
		echo "Required: python3-dbus python3-gi ffmpeg wl-clipboard (Wayland) or xclip/xsel (X11)"; \
		echo "Optional: xdotool (for text insertion on X11)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✅ All required system packages are installed$(NC)"
	@SESSION_TYPE="$${XDG_SESSION_TYPE:-}"; \
	if [ "$$SESSION_TYPE" != "wayland" ] && ! command -v xdotool >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  Optional: xdotool not found (needed for text insertion on X11)$(NC)"; \
	fi

check-pipx:
	@if ! command -v pipx >/dev/null 2>&1; then \
		echo "$(YELLOW)⚠️  pipx is not installed$(NC)"; \
		echo ""; \
		echo "Install pipx using your package manager or see:"; \
		echo "  https://pipx.pypa.io/stable/installation/"; \
		exit 1; \
	fi
	@echo "$(GREEN)✅ pipx is installed$(NC)"

pipx-install-github:
	@echo "$(CYAN)Installing service from GitHub via pipx...$(NC)"
	@if pipx list 2>/dev/null | grep -q "$(PACKAGE_NAME)"; then \
		echo "$(YELLOW)⚠️  Service already installed, upgrading...$(NC)"; \
		pipx upgrade $(PACKAGE_NAME) || exit 1; \
	else \
		pipx install --system-site-packages "$(GITHUB_URL)" || exit 1; \
	fi
	@echo "$(GREEN)✅ Service installed from GitHub$(NC)"

pipx-install-local:
	@echo "$(CYAN)Installing service from local source via pipx...$(NC)"
	@if [ ! -f "pyproject.toml" ]; then \
		echo "$(RED)❌ pyproject.toml not found$(NC)"; \
		echo "Make sure you're running this from the service-whispercpp directory"; \
		exit 1; \
	fi
	@SCRIPT_DIR="$$(pwd)"; \
	if pipx list 2>/dev/null | grep -q "$(PACKAGE_NAME)"; then \
		echo "$(YELLOW)⚠️  Service already installed, using --force to reinstall...$(NC)"; \
		pipx install --force --system-site-packages "$$SCRIPT_DIR" || exit 1; \
	else \
		pipx install --system-site-packages "$$SCRIPT_DIR" || exit 1; \
	fi
	@echo "$(GREEN)✅ Service installed from local source$(NC)"

pipx-upgrade:
	@echo "$(CYAN)Upgrading service via pipx...$(NC)"
	@if ! pipx list 2>/dev/null | grep -q "$(PACKAGE_NAME)"; then \
		echo "$(RED)❌ Service not installed via pipx$(NC)"; \
		echo "Install it first: make install"; \
		exit 1; \
	fi
	@pipx upgrade $(PACKAGE_NAME) || exit 1
	@echo "$(GREEN)✅ Service upgraded$(NC)"

setup-dbus:
	@echo "$(CYAN)Setting up D-Bus integration...$(NC)"
	@export PATH="$$HOME/.local/bin:$$PATH"; \
	if command -v $(SETUP_CMD) >/dev/null 2>&1; then \
		$(SETUP_CMD) || exit 1; \
	else \
		echo "$(RED)❌ Setup command not found: $(SETUP_CMD)$(NC)"; \
		echo "Make sure the service is installed"; \
		exit 1; \
	fi
	@echo "$(GREEN)✅ D-Bus integration configured$(NC)"

check-whisper:
	@echo "$(CYAN)Checking whisper.cpp setup...$(NC)"
	@if command -v whisper-server >/dev/null 2>&1; then \
		if whisper-server -h >/dev/null 2>&1; then \
			echo "$(GREEN)✅ whisper-server found and working$(NC)"; \
			WHISPER_PATH=$$(which whisper-server); \
			echo "$(BLUE)ℹ️  Path: $$WHISPER_PATH$(NC)"; \
		else \
			echo "$(RED)❌ whisper-server found but not working$(NC)"; \
			WHISPER_PATH=$$(which whisper-server); \
			echo "$(BLUE)ℹ️  Path: $$WHISPER_PATH$(NC)"; \
			echo "$(YELLOW)⚠️  The binary may be corrupted or incompatible$(NC)"; \
		fi; \
	else \
		echo "$(YELLOW)⚠️  whisper-server not found in PATH$(NC)"; \
		echo ""; \
		echo "To use this service, build whisper.cpp:"; \
		echo "  git clone https://github.com/ggerganov/whisper.cpp"; \
		echo "  cd whisper.cpp"; \
		echo "  make server"; \
		echo "  sudo make install"; \
		echo "  bash ./models/download-ggml-model.sh base ~/.cache/whisper.cpp"; \
		echo ""; \
		echo "The service will auto-start whisper-server when needed."; \
	fi

dev-setup:
	@echo "$(CYAN)Setting up development environment...$(NC)"
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "$(RED)❌ uv is not installed$(NC)"; \
		echo "Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"; \
		exit 1; \
	fi
	@echo "$(BLUE)ℹ️  Creating virtual environment with system site packages...$(NC)"
	@uv venv --system-site-packages || exit 1
	@echo "$(BLUE)ℹ️  Installing package in editable mode with dev dependencies...$(NC)"
	@uv sync --group dev || exit 1
	@echo "$(GREEN)✅ Development environment ready$(NC)"

dev-register:
	@echo "$(CYAN)Registering development installation with D-Bus...$(NC)"
	@if [ ! -f ".venv/bin/$(SETUP_CMD)" ]; then \
		echo "$(RED)❌ Setup command not found in .venv$(NC)"; \
		echo "Run 'make dev-setup' first"; \
		exit 1; \
	fi
	@.venv/bin/$(SETUP_CMD) || exit 1
	@echo "$(GREEN)✅ Development installation registered$(NC)"

uninstall-pipx:
	@echo "$(CYAN)Removing pipx package...$(NC)"
	@if command -v $(UNINSTALL_CMD) >/dev/null 2>&1; then \
		echo "" | $(UNINSTALL_CMD) 2>/dev/null || true; \
	fi
	@if command -v pipx >/dev/null 2>&1 && pipx list 2>/dev/null | grep -q "$(PACKAGE_NAME)"; then \
		pipx uninstall $(PACKAGE_NAME) || true; \
		echo "$(GREEN)✅ pipx package removed$(NC)"; \
	else \
		echo "$(BLUE)ℹ️  pipx package not found (not installed or already removed)$(NC)"; \
	fi

uninstall-dbus:
	@echo "$(CYAN)Removing D-Bus registration...$(NC)"
	@PID=$$(ps aux | grep -E "$(SERVICE_NAME)" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ -n "$$PID" ]; then \
		echo "$(BLUE)ℹ️  Stopping service process $$PID...$(NC)"; \
		kill $$PID 2>/dev/null || true; \
		sleep 1; \
	fi
	@if [ -f "$(DBUS_SERVICE_FILE)" ]; then \
		rm -f "$(DBUS_SERVICE_FILE)" && echo "$(GREEN)✅ D-Bus service file removed$(NC)"; \
	else \
		echo "$(BLUE)ℹ️  D-Bus service file not found$(NC)"; \
	fi
	@DESKTOP_FILE="$$HOME/.local/share/applications/$(SERVICE_NAME).desktop"; \
	if [ -f "$$DESKTOP_FILE" ]; then \
		rm -f "$$DESKTOP_FILE" && echo "$(GREEN)✅ Desktop entry removed$(NC)"; \
	fi

kill-service:
	@echo "$(CYAN)Stopping service process...$(NC)"
	@PID=$$(ps aux | grep "$(SERVICE_NAME)" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ -n "$$PID" ]; then \
		echo "$(BLUE)ℹ️  Found process $$PID, terminating...$(NC)"; \
		kill $$PID 2>/dev/null || true; \
		sleep 1; \
		echo "$(GREEN)✅ Service stopped$(NC)"; \
	else \
		echo "$(YELLOW)⚠️  No service process found$(NC)"; \
	fi

clean:
	@echo "$(CYAN)Cleaning build artifacts...$(NC)"
	@rm -rf build dist *.egg-info .mypy_cache .ruff_cache .pytest_cache 2>/dev/null || true
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "$(GREEN)✅ Build artifacts cleaned$(NC)"

# ════════════════════════════════════════════════════════════════
# Development Targets
# ════════════════════════════════════════════════════════════════

format:
	@echo "$(CYAN)═══ Running: black ═══$(NC)"
	@if [ ! -d ".venv" ]; then \
		echo "$(RED)❌ Development environment not found$(NC)"; \
		echo "Run 'make dev' first"; \
		exit 1; \
	fi
	@.venv/bin/black src
	@echo "$(GREEN)✅ black: Code formatted$(NC)"

lint:
	@echo "$(CYAN)═══ Running: ruff ═══$(NC)"
	@if [ ! -d ".venv" ]; then \
		echo "$(RED)❌ Development environment not found$(NC)"; \
		echo "Run 'make dev' first"; \
		exit 1; \
	fi
	@.venv/bin/ruff check --fix src
	@echo "$(GREEN)✅ ruff: Linting complete$(NC)"

typecheck:
	@echo "$(CYAN)═══ Running: mypy ═══$(NC)"
	@if [ ! -d ".venv" ]; then \
		echo "$(RED)❌ Development environment not found$(NC)"; \
		echo "Run 'make dev' first"; \
		exit 1; \
	fi
	@.venv/bin/mypy src
	@echo "$(GREEN)✅ mypy: Type checking passed$(NC)"

check: format lint typecheck
	@echo ""
	@echo "$(GREEN)✅ All code quality checks and fixes complete$(NC)"

test:
	@echo "$(CYAN)Running tests with pytest...$(NC)"
	@if [ ! -d ".venv" ]; then \
		echo "$(RED)❌ Development environment not found$(NC)"; \
		echo "Run 'make dev' first"; \
		exit 1; \
	fi
	@if [ -d "test" ] || [ -d "tests" ]; then \
		.venv/bin/pytest || exit 1; \
		echo "$(GREEN)✅ Tests passed$(NC)"; \
	else \
		echo "$(YELLOW)⚠️  No tests found$(NC)"; \
	fi

# ════════════════════════════════════════════════════════════════
# Utility Targets
# ════════════════════════════════════════════════════════════════

status:
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(BLUE)  Service Installation Status$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(CYAN)Production (pipx):$(NC)"
	@PIPX_INSTALLED=false; \
	if command -v pipx >/dev/null 2>&1 && pipx list 2>/dev/null | grep -q "$(PACKAGE_NAME)"; then \
		echo "  Installed: $(GREEN)yes$(NC)"; \
		PIPX_INSTALLED=true; \
		PIPX_INFO=$$(pipx list 2>/dev/null | grep -A 2 "$(PACKAGE_NAME)" | grep "version" | awk '{print $$2}'); \
		if [ -n "$$PIPX_INFO" ]; then \
			echo "  Version: $$PIPX_INFO"; \
		fi; \
	else \
		echo "  Installed: $(RED)no$(NC)"; \
	fi
	@echo ""
	@echo "$(CYAN)Development (uv):$(NC)"
	@DEV_INSTALLED=false; \
	if [ -d ".venv" ]; then \
		echo "  Environment: $(GREEN)yes$(NC)"; \
		if [ -f ".venv/bin/$(SERVICE_NAME)" ]; then \
			echo "  Executable: $(GREEN)yes$(NC)"; \
			DEV_INSTALLED=true; \
		else \
			echo "  Executable: $(RED)no$(NC)"; \
		fi; \
	else \
		echo "  Environment: $(RED)no$(NC)"; \
	fi
	@echo ""
	@echo "$(CYAN)D-Bus Registration:$(NC)"
	@if [ -f "$(DBUS_SERVICE_FILE)" ]; then \
		echo "  Registered: $(GREEN)yes$(NC)"; \
		echo "  File: $(DBUS_SERVICE_FILE)"; \
		DBUS_EXEC=$$(grep "^Exec=" "$(DBUS_SERVICE_FILE)" | cut -d= -f2); \
		if [ -n "$$DBUS_EXEC" ]; then \
			echo "  Exec: $$DBUS_EXEC"; \
			if echo "$$DBUS_EXEC" | grep -q "pipx"; then \
				echo "  Active: $(GREEN)Production (pipx)$(NC)"; \
			elif echo "$$DBUS_EXEC" | grep -q ".venv"; then \
				echo "  Active: $(YELLOW)Development (uv)$(NC)"; \
			else \
				echo "  Active: $(YELLOW)Other/Unknown$(NC)"; \
			fi; \
		fi; \
	else \
		echo "  Registered: $(RED)no$(NC)"; \
	fi
	@echo ""
	@echo "$(CYAN)Service Process:$(NC)"
	@PID=$$(ps aux | grep "$(SERVICE_NAME)" | grep -v grep | awk '{print $$2}' | head -1); \
	if [ -n "$$PID" ]; then \
		echo "  Running: $(GREEN)yes$(NC) (PID: $$PID)"; \
	else \
		echo "  Running: $(RED)no$(NC)"; \
	fi
	@echo ""
	@echo "$(CYAN)whisper.cpp:$(NC)"
	@if command -v whisper-server >/dev/null 2>&1; then \
		if whisper-server -h >/dev/null 2>&1; then \
			echo "  Server: $(GREEN)found and working$(NC)"; \
		else \
			echo "  Server: $(RED)found but not working$(NC)"; \
		fi; \
		WHISPER_PATH=$$(which whisper-server); \
		echo "  Path: $$WHISPER_PATH"; \
	else \
		echo "  Server: $(RED)not found$(NC)"; \
	fi
	@CACHE_DIR="$$HOME/.cache/whisper.cpp"; \
	if [ -d "$$CACHE_DIR" ]; then \
		MODEL_COUNT=$$(find "$$CACHE_DIR" -name "ggml-*.bin" -type f 2>/dev/null | wc -l); \
		if [ $$MODEL_COUNT -gt 0 ]; then \
			echo "  Models: $(GREEN)$$MODEL_COUNT found$(NC)"; \
		else \
			echo "  Models: $(YELLOW)none$(NC)"; \
		fi; \
	else \
		echo "  Models: $(YELLOW)cache dir not found$(NC)"; \
	fi
