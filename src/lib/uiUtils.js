import St from "gi://St";
import { STYLES } from "./constants.js";

// Helper function to create button styles (internal use only)
function createButtonStyle(baseColor, hoverColor) {
  return {
    normal: `
      background-color: ${baseColor};
      ${STYLES.BUTTON_BASE}
    `,
    hover: `
      background-color: ${hoverColor};
      ${STYLES.BUTTON_BASE}
      transform: scale(1.05);
    `,
  };
}

// Helper function to create a button with hover effects
export function createHoverButton(label, baseColor, hoverColor) {
  const styles = createButtonStyle(baseColor, hoverColor);
  const button = new St.Button({
    label,
    style: styles.normal,
    reactive: true,
    can_focus: true,
    track_hover: true,
  });

  button.connect("enter-event", () => {
    button.set_style(styles.hover);
  });

  button.connect("leave-event", () => {
    button.set_style(styles.normal);
  });

  return button;
}

// Create a horizontal box layout with standard spacing
export function createHorizontalBox(spacing = "10px", marginBottom = "10px") {
  return new St.BoxLayout({
    vertical: false,
    style: `spacing: ${spacing}; margin-bottom: ${marginBottom};`,
  });
}
