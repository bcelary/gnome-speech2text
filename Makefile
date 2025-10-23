# GNOME Speech2Text Extension - Makefile
# Automates common installation tasks

EXTENSION_UUID = gnome-speech2text-whispercpp@bcelary.github
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
SOURCE_DIR = src
SCHEMAS_DIR = $(EXTENSION_DIR)/schemas
SCHEMA_ID = org.gnome.shell.extensions.speech2text-whispercpp

# Colors for output
RED = \033[0;31m
GREEN = \033[0;32m
YELLOW = \033[1;33m
BLUE = \033[0;34m
CYAN = \033[0;36m
NC = \033[0m

.PHONY: help install uninstall clean package status verify-schema \
        copy-files compile-schemas remove-extension reset-settings \
        remove-service install-service install-service-local \
        upgrade-service install-extension uninstall-extension

# Default target
help:
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(BLUE)  GNOME Speech2Text Extension - Makefile$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(CYAN)Complete Workflows:$(NC)"
	@echo "  install                  - Install everything (service + extension)"
	@echo "  uninstall                - Uninstall everything"
	@echo "  install-extension        - Install extension only"
	@echo "  uninstall-extension      - Uninstall extension only"
	@echo ""
	@echo "$(CYAN)Extension Targets:$(NC)"
	@echo "  copy-files               - Copy extension files to installation directory"
	@echo "  compile-schemas          - Compile GSettings schemas"
	@echo "  remove-extension         - Remove extension directory"
	@echo "  reset-settings           - Reset GSettings to defaults"
	@echo ""
	@echo "$(CYAN)Service Targets:$(NC)"
	@echo "  install-service          - Install service from GitHub (production)"
	@echo "  install-service-local    - Install service from local source"
	@echo "  upgrade-service          - Upgrade existing service"
	@echo "  remove-service           - Remove service completely"
	@echo ""
	@echo "$(CYAN)Utilities:$(NC)"
	@echo "  status                   - Show complete installation status (extension + service)"
	@echo "  verify-schema            - Verify schema installation"
	@echo "  package                  - Create distribution package"
	@echo "  clean                    - Remove build artifacts"
	@echo ""
	@echo "$(BLUE)ℹ️  For service-only operations: cd service-whispercpp && make help$(NC)"

# Copy extension files to installation directory
copy-files:
	@echo "$(CYAN)Copying extension files...$(NC)"
	@mkdir -p $(EXTENSION_DIR)
	@cp -r $(SOURCE_DIR)/* $(EXTENSION_DIR)/
	@echo "$(GREEN)✅ Extension files copied$(NC)"

# Compile GSettings schemas
compile-schemas:
	@echo "$(CYAN)Compiling GSettings schemas...$(NC)"
	@if [ ! -d "$(SCHEMAS_DIR)" ]; then \
		echo "$(RED)❌ Schemas directory not found: $(SCHEMAS_DIR)$(NC)"; \
		echo "$(BLUE)ℹ️  Run 'make copy-files' first$(NC)"; \
		exit 1; \
	fi
	@glib-compile-schemas $(SCHEMAS_DIR)
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "$(GREEN)✅ Schemas compiled$(NC)"; \
	else \
		echo "$(RED)❌ Schema compilation failed$(NC)"; \
		exit 1; \
	fi

# Remove extension directory
remove-extension:
	@echo "$(CYAN)Removing extension directory...$(NC)"
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		rm -rf $(EXTENSION_DIR); \
		echo "$(GREEN)✅ Extension removed$(NC)"; \
	else \
		echo "$(BLUE)ℹ️  Extension not installed$(NC)"; \
	fi

# Reset GSettings to defaults (uses dconf for complete reset)
reset-settings:
	@echo "$(CYAN)Resetting extension settings...$(NC)"
	@dconf reset -f /org/gnome/shell/extensions/speech2text-whispercpp/ 2>/dev/null && echo "$(GREEN)✅ Settings reset$(NC)" || echo "$(BLUE)ℹ️  Settings already at defaults$(NC)"

# Remove service files and pipx package
remove-service:
	@cd service-whispercpp && $(MAKE) uninstall

# Install service via pipx (from GitHub)
install-service:
	@cd service-whispercpp && $(MAKE) install

# Install service from local source
install-service-local:
	@cd service-whispercpp && $(MAKE) install-local

# Upgrade service
upgrade-service:
	@cd service-whispercpp && $(MAKE) upgrade

# Convenience: Install everything (service + extension)
install: install-service copy-files compile-schemas
	@echo ""
	@echo "$(GREEN)✅ Complete installation finished (service + extension)$(NC)"

# Convenience: Complete uninstall (extension + service + settings)
uninstall: remove-extension remove-service reset-settings
	@echo ""
	@echo "$(GREEN)✅ Complete uninstall finished$(NC)"

# Convenience: Install extension only
install-extension: copy-files compile-schemas
	@echo ""
	@echo "$(GREEN)✅ Extension installation finished$(NC)"

# Convenience: Uninstall extension only
uninstall-extension: remove-extension reset-settings
	@echo ""
	@echo "$(GREEN)✅ Extension uninstall finished$(NC)"

# Create distribution package for GNOME Extensions store
package:
	@echo "$(CYAN)Creating distribution package...$(NC)"
	@mkdir -p dist && \
	PACKAGE_DIR="$(EXTENSION_UUID)" && \
	PACKAGE_FILE="dist/$(EXTENSION_UUID).zip" && \
	rm -rf "$$PACKAGE_DIR" "$$PACKAGE_FILE" && \
	mkdir -p "$$PACKAGE_DIR" && \
	echo "$(BLUE)ℹ️  Copying extension files...$(NC)" && \
	cp -r $(SOURCE_DIR)/* "$$PACKAGE_DIR/" && \
	echo "$(BLUE)ℹ️  Verifying no installation scripts in package...$(NC)" && \
	if find "$$PACKAGE_DIR/" -name "*.sh" -type f | grep -q .; then \
		echo "$(RED)❌ Installation scripts found in package!$(NC)" && \
		find "$$PACKAGE_DIR/" -name "*.sh" -type f && \
		rm -rf "$$PACKAGE_DIR" && \
		exit 1; \
	fi && \
	echo "$(GREEN)✅ Clean package verified$(NC)" && \
	echo "$(BLUE)ℹ️  Compiling schemas...$(NC)" && \
	glib-compile-schemas "$$PACKAGE_DIR/schemas/" && \
	echo "$(BLUE)ℹ️  Creating ZIP...$(NC)" && \
	cd "$$PACKAGE_DIR" && \
	zip -r "../$$PACKAGE_FILE" . >/dev/null && \
	cd .. && \
	rm -rf "$$PACKAGE_DIR" && \
	echo "$(GREEN)✅ Package created: $$PACKAGE_FILE$(NC)" && \
	echo "$(BLUE)ℹ️  Size: $$(du -h "$$PACKAGE_FILE" | cut -f1)$(NC)" && \
	echo "$(BLUE)ℹ️  Package ready for GNOME Extensions store$(NC)"

# Show installation status
status:
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo "$(BLUE)  GNOME Speech2Text - Installation Status$(NC)"
	@echo "$(BLUE)════════════════════════════════════════════════════════════════$(NC)"
	@echo ""
	@echo "$(CYAN)Extension:$(NC)"
	@echo "  Directory: $(EXTENSION_DIR)"
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		echo "  Installed: $(GREEN)yes$(NC)"; \
	else \
		echo "  Installed: $(RED)no$(NC)"; \
	fi
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "  Schemas: $(GREEN)compiled$(NC)"; \
	else \
		echo "  Schemas: $(RED)not compiled$(NC)"; \
	fi
	@echo "  Session: $(XDG_SESSION_TYPE)"
	@echo ""
	@cd service-whispercpp && $(MAKE) status

# Verify schema installation
verify-schema:
	@echo "$(CYAN)Verifying schema installation...$(NC)"
	@if [ -f "$(SCHEMAS_DIR)/$(SCHEMA_ID).gschema.xml" ]; then \
		echo "$(GREEN)✅ Schema file found$(NC)"; \
	else \
		echo "$(RED)❌ Schema file missing$(NC)"; \
		echo "$(BLUE)ℹ️  Available schemas:$(NC)"; \
		ls -la $(SCHEMAS_DIR)/*.gschema.xml 2>/dev/null || echo "$(YELLOW)⚠️  No schema files found$(NC)"; \
	fi
	@if [ -f "$(SCHEMAS_DIR)/gschemas.compiled" ]; then \
		echo "$(GREEN)✅ Schemas compiled$(NC)"; \
	else \
		echo "$(RED)❌ Schemas not compiled$(NC)"; \
	fi

# Clean build artifacts
clean:
	@echo "$(CYAN)Cleaning build artifacts...$(NC)"
	@if [ -d "dist" ]; then \
		rm -rf dist; \
		echo "$(GREEN)✅ Removed dist/$(NC)"; \
	fi
	@cd service-whispercpp && $(MAKE) clean
	@echo "$(GREEN)✅ Build artifacts cleaned$(NC)"
