// CLI fallback: node_modules/.bin/tsx scripts/mcp-token.ts
// (`npm run mcp:token` also works outside Docker, where npm is available.)
//
// Creates a new, unlimited-duration MCP bearer token named "CLI" and prints
// it once. With --api, creates a read-only REST API token instead (used by
// external LAN services, see docs/API-TOKENS.md). This is a fallback for when the admin UI (MCP > General tab) is
// unavailable: tokens are normally created and revoked from there, with a
// name and an optional expiry. Existing tokens are never touched by this
// script; each run adds a new one.
import { initializeDatabase } from "../server/database/connection.js";
import { initializeDatabaseConfig } from "../server/database/dbConfig.js";
import { mcpAuthService } from "../server/services/mcpAuthService.js";

const isApiToken = process.argv.includes("--api");

initializeDatabase();
initializeDatabaseConfig();
mcpAuthService.migrateLegacyTokenIfNeeded();

let token: string;
try {
  ({ token } = isApiToken
    ? mcpAuthService.generateToken("CLI", null, "read_only", "api")
    : mcpAuthService.generateToken("CLI", null));
} catch (error) {
  console.error("");
  console.error(`ERROR: ${isApiToken ? "API" : "MCP"} token generation failed.`);
  console.error("");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error(
    "If running via `docker exec`, try `docker exec -it -u node <container> node_modules/.bin/tsx scripts/mcp-token.ts`: " +
      "the app's database file is owned by the `node` user, and `docker exec` without `-u` attaches as a different user by default.",
  );
  console.error("");
  process.exit(1);
}

console.log("");
console.log(`${isApiToken ? "Read-only REST API" : "MCP"} token generated. This value will not be shown again:`);
console.log("");
console.log(`  ${token}`);
console.log("");
// HOST_IP and DASHBOARD_PORT are the LAN-reachable address of the host
// machine, not the container's internal address/port (see server/index.ts's
// own startup banner, which uses the same env vars for the same reason:
// the container has no way to know its own host-mapped port otherwise).
const lanHost = process.env.HOST_IP || "<LAN-IP>";
const lanPort = process.env.DASHBOARD_PORT || "7505";
if (isApiToken) {
  console.log("Example:");
  console.log(`  curl -H "Authorization: Bearer ${token.slice(0, 12)}..." http://${lanHost}:${lanPort}/api/network-scan/history`);
} else {
  console.log("Configure your MCP client with:");
  console.log(`  URL:     http://${lanHost}:${lanPort}/api/mcp`);
  console.log(`  Header:  Authorization: Bearer ${token.slice(0, 8)}...`);
}
if (lanHost === "<LAN-IP>") {
  console.log(
    "  (set HOST_IP in docker-compose.yml to have this printed automatically)",
  );
}
console.log("");
console.log("This token is only accepted from the local network and Tailscale.");
console.log(
  `This token has no expiry. Manage it (revoke) from the admin panel's ${isApiToken ? "API tokens" : "MCP"} section.`,
);
console.log("");

process.exit(0);
