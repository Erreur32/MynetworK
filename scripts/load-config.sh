#!/bin/bash

# Centralized configuration loader for development scripts
# This script loads credentials from .env.local, environment variables, or prompts interactively
# Usage: source scripts/load-config.sh unifi|backend|freebox

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_LOCAL="$PROJECT_ROOT/.env.local"

# Service to load (unifi, backend, freebox)
SERVICE="${1:-}"

# Load .env.local if it exists
load_env_local() {
    if [ -f "$ENV_LOCAL" ]; then
        set -a
        source "$ENV_LOCAL" 2>/dev/null || true
        set +a
        return 0
    fi
    return 1
}

# Prompt for a value if missing
prompt_if_missing() {
    local var_name="$1"
    local prompt_text="$2"
    local is_password="${3:-false}"
    local default_value="${4:-}"
    
    if [ -z "${!var_name:-}" ]; then
        if [ -n "$default_value" ]; then
            read -p "$prompt_text [$default_value]: " input_value
            eval "$var_name=\"\${input_value:-$default_value}\""
        else
            if [ "$is_password" = "true" ]; then
                read -s -p "$prompt_text: " input_value
                echo
            else
                read -p "$prompt_text: " input_value
            fi
            eval "$var_name=\"$input_value\""
        fi
    fi
}

# Load UniFi configuration
load_unifi_config() {
    load_env_local
    
    # Extract controller URL components if needed
    if [ -n "${UNIFI_CONTROLLER:-}" ]; then
        # Remove https:// prefix if present
        CONTROLLER="${UNIFI_CONTROLLER#https://}"
        CONTROLLER="${CONTROLLER#http://}"
        # Remove port if present
        CONTROLLER="${CONTROLLER%:8443}"
        CONTROLLER="${CONTROLLER%:443}"
    else
        CONTROLLER=""
    fi
    
    prompt_if_missing "CONTROLLER" "Adresse du contrôleur UniFi" false "192.168.1.206"
    prompt_if_missing "UNIFI_USERNAME" "Username UniFi" false
    prompt_if_missing "UNIFI_PASSWORD" "Password UniFi" true
    
    UNIFI_SITE="${UNIFI_SITE:-default}"
    
    export CONTROLLER
    export UNIFI_USERNAME
    export UNIFI_PASSWORD
    export UNIFI_SITE
}

# Load backend configuration
load_backend_config() {
    load_env_local
    
    prompt_if_missing "BACKEND_URL" "URL du backend" false "http://localhost:3003"
    prompt_if_missing "BACKEND_USERNAME" "Username backend" false "admin"
    prompt_if_missing "BACKEND_PASSWORD" "Password backend" true "admin123"
    
    export BACKEND_URL
    export BACKEND_USERNAME
    export BACKEND_PASSWORD
}

# Load Freebox configuration
load_freebox_config() {
    load_env_local
    
    prompt_if_missing "FREEBOX_URL" "URL Freebox" false "http://mafreebox.freebox.fr"
    prompt_if_missing "FREEBOX_APP_ID" "App ID Freebox" false
    prompt_if_missing "FREEBOX_APP_TOKEN" "App Token Freebox" false
    
    export FREEBOX_URL
    export FREEBOX_APP_ID
    export FREEBOX_APP_TOKEN
}

# Main loader based on service
case "$SERVICE" in
    unifi)
        load_unifi_config
        ;;
    backend)
        load_backend_config
        ;;
    freebox)
        load_freebox_config
        ;;
    *)
        # If no service specified, just load .env.local
        load_env_local
        ;;
esac

