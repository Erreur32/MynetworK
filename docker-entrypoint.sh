#!/bin/sh
# Docker entrypoint script to fix permissions for SQLite database and Docker socket
# This ensures the node user can write to /app/data directory and access Docker socket
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

# Fix Docker socket permissions if mounted
# Get the GID of the docker group from the host (usually 999 or from /var/run/docker.sock)
if [ -S "/var/run/docker.sock" ]; then
    DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo "999")
    
    # Check if docker group exists, if not create it with the host's GID
    if ! getent group docker > /dev/null 2>&1; then
        addgroup -g ${DOCKER_GID} docker 2>/dev/null || true
    fi
    
    # Add node user to docker group
    addgroup node docker 2>/dev/null || true
    
    # Fix socket permissions (ensure docker group can read/write)
    chmod 666 /var/run/docker.sock 2>/dev/null || true
fi

# Switch to node user and execute the main command (passed as arguments)
# Use su-exec (available in Alpine) to switch user
exec su-exec node "$@"

