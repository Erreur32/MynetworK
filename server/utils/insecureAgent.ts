import { Agent, buildConnector } from 'undici';
import * as dns from 'node:dns/promises';
import { isPrivateNetworkIp, isValidIp } from './networkValidation.js';

const baseConnector = buildConnector({ rejectUnauthorized: false });

// Resolves the hostname once and returns the address to connect to if it's
// private/LAN, or null otherwise. Resolving once and reusing that address for
// the actual connection (rather than checking, then letting the real connector
// re-resolve the same hostname) avoids a DNS-rebinding TOCTOU window where a
// malicious/compromised DNS answer could differ between the check and the
// connect.
async function resolvePrivateAddress(hostname: string): Promise<string | null> {
    if (hostname === 'localhost') return '127.0.0.1';
    if (isValidIp(hostname)) return isPrivateNetworkIp(hostname) ? hostname : null;
    try {
        const { address } = await dns.lookup(hostname);
        return isPrivateNetworkIp(address) ? address : null;
    } catch {
        return null;
    }
}

// Refuses to connect (even before the TLS handshake) unless the target resolves to a
// private/LAN address — the actual safeguard against this agent being misused against
// a non-LAN host (e.g. a copy-pasted fetch call or a misconfigured controller URL),
// enforced centrally instead of relying on discipline at each call site.
const lanOnlyConnector: buildConnector.connector = (options, callback) => {
    resolvePrivateAddress(options.hostname)
        .then((address) => {
            if (!address) {
                callback(
                    new Error(
                        `insecureAgent: refusing to disable certificate verification for non-private host "${options.hostname}"`
                    ),
                    null
                );
                return;
            }
            baseConnector({ ...options, hostname: address }, callback);
        })
        .catch((err) => callback(err, null));
};

// Shared HTTPS agent with disabled certificate verification, for LAN devices
// using self-signed certificates (Freebox, UniFi controller). Passed as
// fetch's `dispatcher` option, scoped to those specific requests only —
// never touches the process-wide TLS settings. See lanOnlyConnector above
// for the host-allowlisting safeguard.
export const insecureAgent = new Agent({
    connect: lanOnlyConnector
});
