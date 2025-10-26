#!/bin/bash
# Helper script to tail GNOME Speech2Text service logs
#
# Usage:
#   ./scripts/tail-service-logs.sh                    # Show all service logs (auto-chop to terminal width)
#   ./scripts/tail-service-logs.sh transcrib          # Filter logs
#   ./scripts/tail-service-logs.sh --chop 200         # Chop lines at 200 chars
#

FILTER=""
CHOP=$(tput cols 2>/dev/null || echo "")

while [[ $# -gt 0 ]]; do
    case $1 in
        --chop)
            CHOP="$2"
            shift 2
            ;;
        *)
            FILTER="$1"
            shift
            ;;
    esac
done

CMD="journalctl -f --identifier=speech2text-whispercpp-service --no-pager"

if [ -n "$FILTER" ]; then
    echo "Tailing service logs (filter: $FILTER)..."
    CMD="$CMD | grep -i '$FILTER'"
else
    echo "Tailing service logs..."
fi

if [ -n "$CHOP" ]; then
    CMD="$CMD | cut -c1-$CHOP"
fi

echo "===================="
eval "$CMD"
