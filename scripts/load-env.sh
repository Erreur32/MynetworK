#!/bin/bash

# Helper script to load environment variables from .env.local
# This is a simple wrapper around load-config.sh
# Usage: source scripts/load-env.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/load-config.sh"

