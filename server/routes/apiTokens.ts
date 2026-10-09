// REST API token management for the admin UI (read-only tokens used by
// external LAN services such as MyServices). Independent of MCP_ENABLED:
// these tokens authenticate on the REST API, never on /api/mcp.
import { Router } from "express";
import { registerTokenLifecycleRoutes } from "./tokenLifecycle.js";

const router = Router();
registerTokenLifecycleRoutes(router, "api");

export default router;
