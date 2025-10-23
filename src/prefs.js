import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { SCHEMA_ID } from './lib/constants.js';

export default class Speech2TextPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings(SCHEMA_ID);

        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // Keyboard Shortcut Group
        const shortcutGroup = new Adw.PreferencesGroup({
            title: 'Keyboard Shortcut',
            description: 'Set the keyboard combination to toggle recording on/off',
        });
        page.add(shortcutGroup);

        const shortcutRow = new Adw.ActionRow({
            title: 'Toggle Recording',
            subtitle: 'Keyboard shortcut to start/stop recording',
        });

        const shortcutButton = new Gtk.Button({
            label: this._getShortcutLabel(settings),
            valign: Gtk.Align.CENTER,
        });

        shortcutButton.connect('clicked', () => {
            this._captureShortcut(window, settings, shortcutButton);
        });

        shortcutRow.add_suffix(shortcutButton);
        shortcutRow.activatable_widget = shortcutButton;
        shortcutGroup.add(shortcutRow);

        // Recording Duration Group
        const durationGroup = new Adw.PreferencesGroup({
            title: 'Recording Duration',
            description: 'Maximum recording time (10 seconds to 5 minutes)',
        });
        page.add(durationGroup);

        const durationRow = new Adw.ActionRow({
            title: 'Duration (seconds)',
            subtitle: 'Set how long the recording can last',
        });

        const durationAdjustment = new Gtk.Adjustment({
            lower: 10,
            upper: 300,
            step_increment: 10,
            page_increment: 30,
            value: settings.get_int('recording-duration'),
        });

        const durationSpinButton = new Gtk.SpinButton({
            adjustment: durationAdjustment,
            numeric: true,
            valign: Gtk.Align.CENTER,
        });

        durationSpinButton.connect('value-changed', (widget) => {
            settings.set_int('recording-duration', widget.get_value());
        });

        durationRow.add_suffix(durationSpinButton);
        durationRow.activatable_widget = durationSpinButton;
        durationGroup.add(durationRow);

        // Post-Recording Action Group
        const postRecordingGroup = new Adw.PreferencesGroup({
            title: 'Post-Recording Action',
            description: 'What to do with transcribed text after recording completes',
        });
        page.add(postRecordingGroup);

        const postRecordingRow = new Adw.ComboRow({
            title: 'Action',
            subtitle: 'Choose how to handle transcribed text',
        });

        // Create string list for the dropdown options
        const stringList = new Gtk.StringList();
        stringList.append('Show preview dialog');
        stringList.append('Auto-type text (X11 only)');
        stringList.append('Copy to clipboard only');
        stringList.append('Auto-type and copy (X11 only)');

        postRecordingRow.set_model(stringList);

        // Map setting values to dropdown indices
        const actionToIndex = {
            'preview': 0,
            'type_only': 1,
            'copy_only': 2,
            'type_and_copy': 3,
        };
        const indexToAction = ['preview', 'type_only', 'copy_only', 'type_and_copy'];

        // Set initial value
        const currentAction = settings.get_string('post-recording-action');
        postRecordingRow.set_selected(actionToIndex[currentAction] || 0);

        // Connect to changes
        postRecordingRow.connect('notify::selected', (widget) => {
            const selectedIndex = widget.get_selected();
            const action = indexToAction[selectedIndex];
            if (action) {
                settings.set_string('post-recording-action', action);
            }
        });

        postRecordingGroup.add(postRecordingRow);
    }

    _getShortcutLabel(settings) {
        const shortcuts = settings.get_strv('toggle-recording');
        if (shortcuts.length > 0) {
            return shortcuts[0];
        }
        return 'Click to set';
    }

    _captureShortcut(window, settings, button) {
        const dialog = new Gtk.MessageDialog({
            transient_for: window,
            modal: true,
            buttons: Gtk.ButtonsType.CANCEL,
            message_type: Gtk.MessageType.INFO,
            text: 'Press a key combination',
            secondary_text: 'Press Escape to cancel',
        });

        const eventController = new Gtk.EventControllerKey();

        eventController.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            // Ignore modifier-only keys
            const modifierKeys = [
                Gtk.KEY_Shift_L, Gtk.KEY_Shift_R,
                Gtk.KEY_Control_L, Gtk.KEY_Control_R,
                Gtk.KEY_Alt_L, Gtk.KEY_Alt_R,
                Gtk.KEY_Super_L, Gtk.KEY_Super_R,
                Gtk.KEY_Meta_L, Gtk.KEY_Meta_R,
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
            if (state & Gtk.ModifierType.CONTROL_MASK) modifiers.push('Control');
            if (state & Gtk.ModifierType.SHIFT_MASK) modifiers.push('Shift');
            if (state & Gtk.ModifierType.ALT_MASK) modifiers.push('Alt');
            if (state & Gtk.ModifierType.SUPER_MASK) modifiers.push('Super');

            const keyName = Gtk.accelerator_name(keyval, 0);
            const shortcut = `<${modifiers.join('><')}>${keyName}`;

            // Save the shortcut
            settings.set_strv('toggle-recording', [shortcut]);
            button.set_label(shortcut);

            dialog.close();
            return true;
        });

        dialog.add_controller(eventController);
        dialog.show();
    }
}
