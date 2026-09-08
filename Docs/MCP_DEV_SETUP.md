# MCP: Token Generation (Dev Reference)

Reference notes for generating the MCP access token, kept out of the admin UI's Setup tab to keep it short. See the [README's MCP section](../README.md#mcp-model-context-protocol) for how to connect a client once you have a token.

## Local / dev (no container)

```bash
npm run mcp:token
```

Run this directly when working with `npm run dev` (no Docker involved).

## Docker

```bash
docker exec -it -u node mynetwork npm run mcp:token
```

Container name is `mynetwork` by default, adjust if you renamed it in `docker-compose.yml`.

### Why `-u node` is required

The app's Docker image has no `USER` instruction in the `Dockerfile`; the main process only runs as the `node` user at runtime because `docker-entrypoint.sh` does a `chown -R node:node /app/data` (as root) then `exec su-exec node "$@"`. A plain `docker exec` **skips that entrypoint entirely** and attaches as the image's default user (root) instead.

Normally root can write anywhere regardless of file ownership, but this project's `docker-compose.yml` hardens the container with `cap_drop: ALL` (only `NET_RAW`/`NET_ADMIN`/`SETUID`/`SETGID` are re-added). `CAP_DAC_OVERRIDE` (the capability that lets root bypass Unix file permissions) is deliberately **not** re-added. So a `docker exec` without `-u` behaves like a normal non-owning user against `dashboard.db` (owned by `node:node`): it can read, but not write.

Symptom if you forget `-u node`: the script prints `MCP token generated...` but every `AppConfigRepository` write fails with `SqliteError: attempt to write a readonly database`, and the printed token is never actually persisted: it will not authenticate any client. (`generateToken()` now throws instead of silently succeeding in this case, see `server/services/mcpAuthService.ts`, but the underlying cause is still the missing `-u node`.)

**Do not** "fix" this by re-adding `CAP_CHOWN`/`CAP_DAC_OVERRIDE` to `cap_drop`/`cap_add`: that would widen root's privileges inside the container, undoing a deliberate hardening choice. Always pass `-u node` on the `docker exec` instead.
