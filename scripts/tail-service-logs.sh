#!/bin/bash
# Helper script to tail GNOME Speech2Text service logs
#
# Usage:
#   ./scripts/tail-service-logs.sh              # Show all service logs
#   ./scripts/tail-service-logs.sh transcrib    # Filter logs
#

FILTER="$1"

if [ -z "$FILTER" ]; then
    # Show all service logs
    echo "Tailing GNOME Speech2Text service logs..."
    echo "Press Ctrl+C to stop"
    echo "===================="
    journalctl -f --identifier=speech2text-whispercpp-service
else
    # Show filtered logs
    echo "Tailing GNOME Speech2Text service logs (filter: $FILTER)..."
    echo "Press Ctrl+C to stop"
    echo "===================="
    journalctl -f --identifier=speech2text-whispercpp-service | grep -i "$FILTER"
fi
