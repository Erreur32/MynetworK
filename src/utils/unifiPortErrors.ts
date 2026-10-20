export interface PortErrorCount {
    port: number;
    rx: number;
    tx: number;
}

export interface PortErrorSummary {
    // RX + TX over all ports; undefined when no port reports error counters.
    total?: number;
    // Only the ports that have errors, the most affected first.
    ports: PortErrorCount[];
}

export function summarizePortErrors(ports: any[]): PortErrorSummary {
    let total: number | undefined;
    const withErrors: PortErrorCount[] = [];
    ports.forEach((p, i) => {
        if (typeof p.rx_errors !== 'number' && typeof p.tx_errors !== 'number') return;
        const rx = typeof p.rx_errors === 'number' ? p.rx_errors : 0;
        const tx = typeof p.tx_errors === 'number' ? p.tx_errors : 0;
        total = (total ?? 0) + rx + tx;
        if (rx + tx > 0) withErrors.push({ port: p.port_idx ?? p.portnum ?? i + 1, rx, tx });
    });
    withErrors.sort((a, b) => b.rx + b.tx - (a.rx + a.tx));
    return { total, ports: withErrors };
}
