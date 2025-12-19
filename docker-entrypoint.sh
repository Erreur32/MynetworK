#!/bin/sh
# Docker entrypoint script to fix permissions for SQLite database
# This ensures the node user can write to /app/data directory
# This script runs as root to fix permissions, then switches to node user

set -e

# Fix permissions for /app/data directory
# This is necessary because Docker volumes are created with root ownership
if [ -d "/app/data" ]; then
    # Get the UID/GID of the node user (usually 1000:1000)
    NODE_UID=$(id -u node 2>/dev/null || echo "1000")
    NODE_GID=$(id -g node 2>/dev/null || echo "1000")
    
    # Change ownership of /app/data to node:node
    chown -R ${NODE_UID}:${NODE_GID} /app/data 2>/dev/null || true
    
    # Ensure the directory is writable
    chmod -R 755 /app/data 2>/dev/null || true
fi

# Switch to node user and execute the main command (passed as arguments)
# Use su-exec (available in Alpine) to switch user
exec su-exec node "$@"

