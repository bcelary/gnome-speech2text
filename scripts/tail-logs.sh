#!/bin/bash
# Helper script to tail GNOME Speech2Text extension logs
#
# Usage:
#   ./scripts/tail-logs.sh              # Show all S2T-WC logs
#   ./scripts/tail-logs.sh DBus          # Show only DBus component logs
#   ./scripts/tail-logs.sh Recording     # Show only Recording component logs
#

COMPONENT="$1"

if [ -z "$COMPONENT" ]; then
    # Show all S2T-WC logs
    echo "Tailing all GNOME Speech2Text logs..."
    echo "Press Ctrl+C to stop"
    echo "===================="
    journalctl -f /usr/bin/gnome-shell | grep '\[S2T-WC'
else
    # Show specific component logs
    echo "Tailing GNOME Speech2Text logs for component: $COMPONENT"
    echo "Press Ctrl+C to stop"
    echo "===================="
    journalctl -f /usr/bin/gnome-shell | grep "\[S2T-WC:$COMPONENT\]"
fi
