#!/bin/bash
# Helper script to tail GNOME Speech2Text extension logs
#
# Usage:
#   ./scripts/tail-logs.sh                    # Show all S2T-WC logs (auto-chop to terminal width)
#   ./scripts/tail-logs.sh DBus               # Show only DBus component logs
#   ./scripts/tail-logs.sh --chop 200         # Chop lines at 200 chars
#

COMPONENT=""
CHOP=$(tput cols 2>/dev/null || echo "")

while [[ $# -gt 0 ]]; do
    case $1 in
        --chop)
            CHOP="$2"
            shift 2
            ;;
        *)
            COMPONENT="$1"
            shift
            ;;
    esac
done

CMD="journalctl -f /usr/bin/gnome-shell --no-pager"

if [ -z "$COMPONENT" ]; then
    echo "Tailing all extension logs..."
    CMD="$CMD | grep '\[S2T-WC'"
else
    echo "Tailing extension logs (component: $COMPONENT)..."
    CMD="$CMD | grep '\[S2T-WC:$COMPONENT\]'"
fi

if [ -n "$CHOP" ]; then
    CMD="$CMD | cut -c1-$CHOP"
fi

echo "===================="
eval "$CMD"
