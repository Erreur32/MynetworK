import { Agent } from 'undici';

// Shared HTTPS agent with disabled certificate verification, for LAN devices
// using self-signed certificates (Freebox, UniFi controller). Passed as
// fetch's `dispatcher` option, scoped to those specific requests only —
// never touches the process-wide TLS settings.
export const insecureAgent = new Agent({
    connect: {
        rejectUnauthorized: false
    }
});
