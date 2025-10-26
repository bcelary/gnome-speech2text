import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { RECORDING_DURATION, GITHUB_REPO_URL } from "./lib/constants.js";

export default class Speech2TextPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    // Create a preferences page
    const page = new Adw.PreferencesPage({
      title: "General",
      icon_name: "dialog-information-symbolic",
    });
    window.add(page);

    // User Interface Group
    const uiGroup = new Adw.PreferencesGroup({
      title: "User Interface",
      description: "Choose how recording and processing are displayed",
    });
    page.add(uiGroup);

    // Progress Display
    const progressDisplayRow = new Adw.ComboRow({
      title: "Progress Display",
      subtitle: "How to show recording and transcription progress",
    });

    const progressDisplayList = new Gtk.StringList();
    progressDisplayList.append("Always (blocks screen)");
    progressDisplayList.append("Focused (blocks recording only)");
    progressDisplayList.append("Normal (brief messages)");
    progressDisplayList.append("Errors only");
    progressDisplayRow.set_model(progressDisplayList);

    // Map setting values to list indices
    const progressDisplayMap = {
      always: 0,
      focused: 1,
      normal: 2,
      silent: 3,
    };
    const reverseMap = ["always", "focused", "normal", "silent"];

    // Set initial value
    const currentProgressDisplay = settings.get_string("progress-display");
    progressDisplayRow.set_selected(
      progressDisplayMap[currentProgressDisplay] ?? 0
    );

    // Bind to setting
    progressDisplayRow.connect("notify::selected", (widget) => {
      const selected = widget.get_selected();
      settings.set_string("progress-display", reverseMap[selected]);
    });

    uiGroup.add(progressDisplayRow);

    // Post-Recording Action Group
    const postRecordingGroup = new Adw.PreferencesGroup({
      title: "Post-Recording Action",
      description: "What to do with transcribed text after recording completes",
    });
    page.add(postRecordingGroup);

    const postRecordingRow = new Adw.ComboRow({
      title: "Action",
      subtitle: "Choose how to handle transcribed text",
    });

    // Create string list for the dropdown options
    const stringList = new Gtk.StringList();
    stringList.append("Show preview dialog");
    stringList.append("Auto-type text (X11 only)");
    stringList.append("Copy to clipboard only");
    stringList.append("Auto-type and copy (X11 only)");

    postRecordingRow.set_model(stringList);

    // Map setting values to dropdown indices
    const actionToIndex = {
      preview: 0,
      type_only: 1,
      copy_only: 2,
      type_and_copy: 3,
    };
    const indexToAction = [
      "preview",
      "type_only",
      "copy_only",
      "type_and_copy",
    ];

    // Set initial value
    const currentAction = settings.get_string("post-recording-action");
    postRecordingRow.set_selected(actionToIndex[currentAction] || 0);

    // Connect to changes
    postRecordingRow.connect("notify::selected", (widget) => {
      const selectedIndex = widget.get_selected();
      const action = indexToAction[selectedIndex];
      if (action) {
        settings.set_string("post-recording-action", action);
      }
    });

    postRecordingGroup.add(postRecordingRow);

    // Keyboard Shortcut Group
    const shortcutGroup = new Adw.PreferencesGroup({
      title: "Keyboard Shortcut",
      description: "Set the keyboard combination to toggle recording on/off",
    });
    page.add(shortcutGroup);

    const shortcutRow = new Adw.ActionRow({
      title: "Toggle Recording",
      subtitle: "Keyboard shortcut to start/stop recording",
    });

    const shortcutButton = new Gtk.Button({
      label: this._getShortcutLabel(settings),
      valign: Gtk.Align.CENTER,
    });

    shortcutButton.connect("clicked", () => {
      this._captureShortcut(window, settings, shortcutButton);
    });

    shortcutRow.add_suffix(shortcutButton);
    shortcutRow.activatable_widget = shortcutButton;
    shortcutGroup.add(shortcutRow);

    // Recording Duration Group
    const durationGroup = new Adw.PreferencesGroup({
      title: "Recording Duration",
      description: `Maximum recording time (${this._formatSeconds(RECORDING_DURATION.MIN)} to ${this._formatSeconds(RECORDING_DURATION.MAX)})`,
    });
    page.add(durationGroup);

    const durationRow = new Adw.ActionRow({
      title: "Duration",
      subtitle: "Set how long the recording can last",
    });

    const durationAdjustment = new Gtk.Adjustment({
      lower: RECORDING_DURATION.MIN,
      upper: RECORDING_DURATION.MAX,
      step_increment: RECORDING_DURATION.STEP,
      page_increment: RECORDING_DURATION.PAGE_STEP,
      value: settings.get_int("recording-duration"),
    });

    const durationSpinButton = new Gtk.SpinButton({
      adjustment: durationAdjustment,
      numeric: true,
      valign: Gtk.Align.CENTER,
    });

    // Create a label to show the formatted time (mm:ss)
    const formattedLabel = new Gtk.Label({
      label: `(${this._formatSeconds(settings.get_int("recording-duration"))})`,
      css_classes: ["dim-label"],
      valign: Gtk.Align.CENTER,
    });

    // Update both setting and formatted label when value changes
    durationSpinButton.connect("value-changed", (widget) => {
      const value = widget.get_value();
      settings.set_int("recording-duration", value);
      formattedLabel.set_label(`(${this._formatSeconds(value)})`);
    });

    // Add both formatted label and spinbutton to a box
    const durationBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      valign: Gtk.Align.CENTER,
    });
    durationBox.append(formattedLabel);
    durationBox.append(durationSpinButton);

    durationRow.add_suffix(durationBox);
    durationRow.activatable_widget = durationSpinButton;
    durationGroup.add(durationRow);

    // Setup Requirements Group
    const setupGroup = new Adw.PreferencesGroup({
      title: "Setup Requirements",
      description:
        "Extension requires D-Bus service and whisper.cpp server to function",
    });
    page.add(setupGroup);

    const setupRow = new Adw.ActionRow({
      title: "Installation Guide",
      subtitle:
        "See full setup instructions including service and server setup",
    });

    const setupButton = new Gtk.LinkButton({
      label: "Open Setup Guide",
      uri: GITHUB_REPO_URL,
      valign: Gtk.Align.CENTER,
    });

    setupRow.add_suffix(setupButton);
    setupRow.activatable_widget = setupButton;
    setupGroup.add(setupRow);
  }

  _formatSeconds(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  _getShortcutLabel(settings) {
    const shortcuts = settings.get_strv("toggle-recording");
    if (shortcuts.length > 0) {
      return shortcuts[0];
    }
    return "Click to set";
  }

  _captureShortcut(window, settings, button) {
    const dialog = new Gtk.MessageDialog({
      transient_for: window,
      modal: true,
      buttons: Gtk.ButtonsType.CANCEL,
      message_type: Gtk.MessageType.INFO,
      text: "Press a key combination",
      secondary_text: "Press Escape to cancel",
    });

    const eventController = new Gtk.EventControllerKey();

    eventController.connect(
      "key-pressed",
      (_controller, keyval, _keycode, state) => {
        // Ignore modifier-only keys
        const modifierKeys = [
          Gtk.KEY_Shift_L,
          Gtk.KEY_Shift_R,
          Gtk.KEY_Control_L,
          Gtk.KEY_Control_R,
          Gtk.KEY_Alt_L,
          Gtk.KEY_Alt_R,
          Gtk.KEY_Super_L,
          Gtk.KEY_Super_R,
          Gtk.KEY_Meta_L,
          Gtk.KEY_Meta_R,
        ];

        if (modifierKeys.includes(keyval)) {
          return false;
        }

        // Check for Escape key
        if (keyval === Gtk.KEY_Escape) {
          dialog.close();
          return true;
        }

        // Build the shortcut string
        const modifiers = [];
        if (state & Gtk.ModifierType.CONTROL_MASK) modifiers.push("Control");
        if (state & Gtk.ModifierType.SHIFT_MASK) modifiers.push("Shift");
        if (state & Gtk.ModifierType.ALT_MASK) modifiers.push("Alt");
        if (state & Gtk.ModifierType.SUPER_MASK) modifiers.push("Super");

        const keyName = Gtk.accelerator_name(keyval, 0);
        const shortcut = `<${modifiers.join("><")}>${keyName}`;

        // Save the shortcut
        settings.set_strv("toggle-recording", [shortcut]);
        button.set_label(shortcut);

        dialog.close();
        return true;
      }
    );

    dialog.add_controller(eventController);
    dialog.show();
  }
}
