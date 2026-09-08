// CLI: npm run mcp:token
// Generates (or rotates) the MCP bearer token and prints it once. Re-running
// this script revokes the previous token and issues a new one.
import { initializeDatabase } from "../server/database/connection.js";
import { initializeDatabaseConfig } from "../server/database/dbConfig.js";
import { mcpAuthService } from "../server/services/mcpAuthService.js";

initializeDatabase();
initializeDatabaseConfig();

let token: string;
try {
  token = mcpAuthService.generateToken();
} catch (error) {
  console.error("");
  console.error("ERROR: MCP token generation failed.");
  console.error("");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error(
    "If running via `docker exec`, try `docker exec -it -u node <container> npm run mcp:token`: " +
      "the app's database file is owned by the `node` user, and `docker exec` without `-u` attaches as a different user by default.",
  );
  console.error("");
  process.exit(1);
}

console.log("");
console.log("MCP token generated. This value will not be shown again:");
console.log("");
console.log(`  ${token}`);
console.log("");
// HOST_IP and DASHBOARD_PORT are the LAN-reachable address of the host
// machine, not the container's internal address/port (see server/index.ts's
// own startup banner, which uses the same env vars for the same reason:
// the container has no way to know its own host-mapped port otherwise).
const lanHost = process.env.HOST_IP || "<LAN-IP>";
const lanPort = process.env.DASHBOARD_PORT || "7505";
console.log("Configure your MCP client with:");
console.log(`  URL:     http://${lanHost}:${lanPort}/api/mcp`);
console.log(`  Header:  Authorization: Bearer ${token.slice(0, 8)}...`);
if (lanHost === "<LAN-IP>") {
  console.log(
    "  (set HOST_IP in docker-compose.yml to have this printed automatically)",
  );
}
console.log("");
console.log("This endpoint only accepts connections from the local network.");
console.log("Re-run this script at any time to rotate (and revoke) the token.");
console.log("");

process.exit(0);
