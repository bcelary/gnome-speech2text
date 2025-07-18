# GNOME Speech2Text Extension - Makefile
# Automates common development and installation tasks

EXTENSION_UUID = gnome-speech2text@kaveh.page
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
SOURCE_DIR = src
SCHEMAS_DIR = $(EXTENSION_DIR)/schemas

.PHONY: help install compile-schemas restart-shell clean package dev-install

# Default target
help:
	@echo "GNOME Speech2Text Extension - Development Automation"
	@echo "=================================================="
	@echo ""
	@echo "Available targets:"
	@echo "  install          - Install extension to user directory"
	@echo "  compile-schemas  - Compile GSettings schemas"
	@echo "  restart-shell    - Restart GNOME Shell (X11 only)"
	@echo "  setup           - Install + compile schemas + restart"
	@echo "  clean           - Remove installed extension"
	@echo "  package         - Create distribution package"
	@echo "  dev-install     - Development install (install + compile + restart)"
	@echo ""
	@echo "Usage: make <target>"

# Install extension files
install:
	@echo "📦 Installing extension to $(EXTENSION_DIR)..."
	@mkdir -p $(EXTENSION_DIR)
	@cp -r $(SOURCE_DIR)/* $(EXTENSION_DIR)/
	@echo "✅ Extension installed successfully!"

# Compile GSettings schemas
compile-schemas:
	@echo "🔧 Compiling GSettings schemas..."
	@if [ ! -d "$(SCHEMAS_DIR)" ]; then \
		echo "❌ Schemas directory not found: $(SCHEMAS_DIR)"; \
		echo "   Run 'make install' first"; \
		exit 1; \
	fi
	@glib-compile-schemas $(SCHEMAS_DIR)
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "✅ Schemas compiled successfully!"; \
	else \
		echo "❌ Schema compilation failed"; \
		exit 1; \
	fi

# Restart GNOME Shell (X11 only)
restart-shell:
	@echo "🔄 Restarting GNOME Shell..."
	@if [ "$(XDG_SESSION_TYPE)" = "x11" ]; then \
		busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting GNOME Shell")' > /dev/null 2>&1; \
		echo "✅ GNOME Shell restarted (X11)"; \
	elif [ "$(XDG_SESSION_TYPE)" = "wayland" ]; then \
		echo "⚠️  Wayland detected - please log out and log back in"; \
	else \
		echo "⚠️  Unknown session type - manual restart required"; \
	fi

# Complete setup process
setup: install compile-schemas restart-shell
	@echo ""
	@echo "🎉 Extension setup completed!"
	@echo "   The extension should now be available in GNOME Extensions."

# Development install (quick iteration)
dev-install: install compile-schemas
	@echo ""
	@echo "🔧 Development install completed!"
	@echo "   Remember to restart GNOME Shell if needed."

# Clean installation
clean:
	@echo "🧹 Removing installed extension..."
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		rm -rf $(EXTENSION_DIR); \
		echo "✅ Extension removed from $(EXTENSION_DIR)"; \
	else \
		echo "ℹ️  Extension not found at $(EXTENSION_DIR)"; \
	fi

# Create distribution package
package:
	@echo "📦 Creating distribution package..."
	@mkdir -p dist
	@cd $(SOURCE_DIR) && zip -r ../dist/$(EXTENSION_UUID).zip *
	@echo "✅ Package created: dist/$(EXTENSION_UUID).zip"

# Check if extension is enabled
status:
	@echo "📊 Extension Status:"
	@echo "   Directory: $(EXTENSION_DIR)"
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		echo "   ✅ Installed"; \
	else \
		echo "   ❌ Not installed"; \
	fi
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "   ✅ Schemas compiled"; \
	else \
		echo "   ❌ Schemas not compiled"; \
	fi
	@echo "   Session: $(XDG_SESSION_TYPE)" 