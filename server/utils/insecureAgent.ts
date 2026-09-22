import { Agent, buildConnector } from 'undici';
import { isPrivateNetworkIp, isValidIp } from './networkValidation.js';

const baseConnector = buildConnector({ rejectUnauthorized: false });

// Refuses to connect (before the TLS handshake) when the target is an IP
// literal outside private/LAN ranges — catches a copy-pasted fetch call or a
// hardcoded external IP being pointed at this insecure agent by mistake.
// Hostnames (e.g. mafreebox.freebox.fr, a custom UniFi domain) are trusted
// as-is: they're admin-configured, not attacker input, and DNS-resolving
// them here to validate is unreliable in Docker — the container's resolver
// isn't necessarily the LAN device itself, so a legitimate local hostname
// can resolve to a public IP (or fail to resolve at all), incorrectly
// blocking a valid connection. This previously broke Freebox connectivity
// in production for exactly that reason.
const lanOnlyConnector: buildConnector.connector = (options, callback) => {
    if (isValidIp(options.hostname) && !isPrivateNetworkIp(options.hostname)) {
        callback(
            new Error(
                `insecureAgent: refusing to disable certificate verification for non-private IP "${options.hostname}"`
            ),
            null
        );
        return;
    }
    baseConnector(options, callback);
};

// Shared HTTPS agent with disabled certificate verification, for LAN devices
// using self-signed certificates (Freebox, UniFi controller). Passed as
// fetch's `dispatcher` option, scoped to those specific requests only —
// never touches the process-wide TLS settings. See lanOnlyConnector above
// for the host-allowlisting safeguard.
export const insecureAgent = new Agent({
    connect: lanOnlyConnector
});
