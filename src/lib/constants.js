/**
 * Naming constants - Single source of truth for extension and service naming
 *
 * When renaming:
 * - Extension: Update these constants and metadata.json
 * - Service: Update these constants and service-whispercpp/src/.../.__init__.py
 */

// Extension identification
export const EXTENSION_UUID = "speech2text-whispercpp@bcelary.github";

// GSettings schema
export const SCHEMA_ID = "org.gnome.shell.extensions.speech2text-whispercpp";

// D-Bus service identification (must match service-side constants!)
export const DBUS_NAME = "org.gnome.Shell.Extensions.Speech2TextWhisperCpp";
export const DBUS_PATH = "/org/gnome/Shell/Extensions/Speech2TextWhisperCpp";

// Service package and executable names (must match service-side constants!)
// These are used in UI messages and service interaction
export const SERVICE_EXECUTABLE = "speech2text-whispercpp-service";

// Project URLs
export const GITHUB_REPO_URL = "https://github.com/bcelary/gnome-speech2text";
export const SERVICE_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/bcelary/gnome-speech2text/main/service-whispercpp/install.sh";

// Constants for consistent styling and colors
export const COLORS = {
  PRIMARY: "#ff8c00",
  SUCCESS: "#28a745",
  DANGER: "#ff4444",
  SECONDARY: "#666666",
  INFO: "#0066cc",
  WARNING: "#dc3545",
  WHITE: "white",
  LIGHT_GRAY: "#ccc",
  DARK_GRAY: "#888888",
  TRANSPARENT_BLACK_30: "rgba(0, 0, 0, 0.3)",
  TRANSPARENT_BLACK_70: "rgba(0, 0, 0, 0.7)",
  TRANSPARENT_BLACK_85: "rgba(0, 0, 0, 0.85)",
};

export const STYLES = {
  BUTTON_BASE: `
    color: white;
    border-radius: 6px;
    padding: 12px 20px;
    font-size: 14px;
    border: none;
    transition: all 0.2s ease;
  `,
  DIALOG_BORDER: `2px solid ${COLORS.PRIMARY}`,
  DIALOG_PADDING: "30px",
  DIALOG_BORDER_RADIUS: "12px",

  // Common button styles
  CIRCULAR_BUTTON_BASE: `
    border-radius: 50%;
    color: white;
    font-weight: bold;
    text-align: center;
    transition-duration: 200ms;
    reactive: true;
    can_focus: true;
  `,

  // Input/display styles
  INPUT_DISPLAY: `
    text-align: center;
    font-weight: bold;
    font-size: 16px;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid;
  `,

  // Layout styles
  CENTERED_BOX: `
    spacing: 8px;
    x_align: center;
    y_align: center;
  `,
};

// Recording duration constraints (in seconds)
// Note: Service accepts up to 1 hour, but UI enforces more reasonable limits
export const RECORDING_DURATION = {
  MIN: 10, // 0:10
  MAX: 900, // 15:00
  DEFAULT: 180, // 3:00
  STEP: 10, // 10 second increments
  PAGE_STEP: 30, // 30 second page increments
};
