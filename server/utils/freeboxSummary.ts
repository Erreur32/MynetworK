// Compact Freebox health for read-only API tokens (GET /api/connection/summary).
// Only line state, rates and box health: no public IP, serial, MAC or remote-access domain.

type Obj = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const readings = (v: unknown) =>
    Array.isArray(v)
        ? v.filter((x): x is Obj => !!x && typeof x === 'object')
            .map((x) => ({ id: str(x.id), name: str(x.name) ?? str(x.id), value: num(x.value) }))
            .filter((x) => x.value !== null)
        : [];

export function summarizeFreebox(connection: unknown, system: unknown) {
    const c = (connection && typeof connection === 'object' ? connection : {}) as Obj;
    const s = (system && typeof system === 'object' ? system : {}) as Obj;
    return {
        connection: {
            state: str(c.state),            // up, down, going_up, going_down
            type: str(c.type),              // ethernet, rfc2684, pppoatm
            media: str(c.media),            // ftth, xdsl, backup_4g
            rate_down: num(c.rate_down),    // bytes/s, current
            rate_up: num(c.rate_up),
            bandwidth_down: num(c.bandwidth_down), // bit/s, line capacity
            bandwidth_up: num(c.bandwidth_up),
            bytes_down: num(c.bytes_down),
            bytes_up: num(c.bytes_up),
        },
        system: {
            model: str(s.box_model_name) ?? str(s.board_name),
            firmware: str(s.firmware_version),
            uptime: num(s.uptime_val),      // seconds
            disk_status: str(s.disk_status),
            sensors: readings(s.sensors),   // °C
            fans: readings(s.fans),         // rpm
        },
    };
}
