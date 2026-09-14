# MCP: Token Generation (Dev Reference)

Tokens are normally created and revoked from the admin UI (Settings > MCP > General tab): named, with an optional expiry, shown once. This page documents the CLI fallback, kept out of the admin UI's Setup tab to keep it short. See the [README's MCP section](../README.md#mcp-model-context-protocol) for how to connect a client once you have a token.

## Local / dev (no container)

```bash
npm run mcp:token
```

Run this directly when working with `npm run dev` (no Docker involved).

## Docker

The production image has no `npm`/`npx` at runtime (removed to shrink the attack surface, see the Dockerfile), so invoke the script through `tsx` directly instead of `npm run`:

```bash
docker exec -it -u node mynetwork node_modules/.bin/tsx scripts/mcp-token.ts
```

Container name is `mynetwork` by default, adjust if you renamed it in `docker-compose.yml`.

Each run creates a new token named "CLI" with no expiry; it does not touch tokens created from the admin UI.

### Why `-u node` is required

The app's Docker image has no `USER` instruction in the `Dockerfile`; the main process only runs as the `node` user at runtime because `docker-entrypoint.sh` does a `chown -R node:node /app/data` (as root) then `exec su-exec node "$@"`. A plain `docker exec` **skips that entrypoint entirely** and attaches as the image's default user (root) instead.

Normally root can write anywhere regardless of file ownership, but this project's `docker-compose.yml` hardens the container with `cap_drop: ALL` (only `NET_RAW`/`NET_ADMIN`/`SETUID`/`SETGID` are re-added). `CAP_DAC_OVERRIDE` (the capability that lets root bypass Unix file permissions) is deliberately **not** re-added. So a `docker exec` without `-u` behaves like a normal non-owning user against `dashboard.db` (owned by `node:node`): it can read, but not write.

Symptom if you forget `-u node`: the insert into `mcp_tokens` fails with `SqliteError: attempt to write a readonly database`, and the printed token is never actually persisted: it will not authenticate any client. (`generateToken()` throws instead of silently succeeding in this case, see `server/services/mcpAuthService.ts`, but the underlying cause is still the missing `-u node`.)

**Do not** "fix" this by re-adding `CAP_CHOWN`/`CAP_DAC_OVERRIDE` to `cap_drop`/`cap_add`: that would widen root's privileges inside the container, undoing a deliberate hardening choice. Always pass `-u node` on the `docker exec` instead.
