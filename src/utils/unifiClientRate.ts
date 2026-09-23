/**
 * Real instantaneous per-client throughput, from the UniFi controller's own '*_bytes-r' fields
 * (bytes/sec, computed by the controller). Deliberately NOT rx_rate / tx_rate / phy_*_rate /
 * sw_*_rate — those are the negotiated WiFi PHY rate or Ethernet port speed (link capability,
 * not actual traffic). Confirmed the hard way: two different IoT devices showed the exact same
 * "307 Mb/s" simultaneously, which a real traffic rate never would.
 */
export function getClientRateBytesPerSec(c: any): { rx: number; tx: number; total: number } {
    const rx = Number(c?.['rx_bytes-r']) || Number(c?.['wired-rx_bytes-r']) || 0;
    const tx = Number(c?.['tx_bytes-r']) || Number(c?.['wired-tx_bytes-r']) || 0;
    return { rx, tx, total: rx + tx };
}
