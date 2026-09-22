import { Agent, buildConnector } from 'undici';
import * as dns from 'node:dns/promises';
import { isPrivateNetworkIp, isValidIp } from './networkValidation.js';

const baseConnector = buildConnector({ rejectUnauthorized: false });

async function isPrivateHost(hostname: string): Promise<boolean> {
    if (hostname === 'localhost') return true;
    if (isValidIp(hostname)) return isPrivateNetworkIp(hostname);
    try {
        const { address } = await dns.lookup(hostname);
        return isPrivateNetworkIp(address);
    } catch {
        return false;
    }
}

// Refuses to connect (even before the TLS handshake) unless the target resolves to a
// private/LAN address — the actual safeguard against this agent being misused against
// a non-LAN host (e.g. a copy-pasted fetch call or a misconfigured controller URL),
// enforced centrally instead of relying on discipline at each call site.
const lanOnlyConnector: buildConnector.connector = (options, callback) => {
    isPrivateHost(options.hostname)
        .then((isPrivate) => {
            if (!isPrivate) {
                callback(
                    new Error(
                        `insecureAgent: refusing to disable certificate verification for non-private host "${options.hostname}"`
                    ),
                    null
                );
                return;
            }
            baseConnector(options, callback);
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
