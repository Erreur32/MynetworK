// Compact Freebox health for read-only API tokens (GET /api/connection/summary).
// Only line state, rates and box health: no public IP, serial, MAC or remote-access domain.
import { compareVersions } from './version.js';

type Obj = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const readings = (v: unknown) =>
    Array.isArray(v)
        ? v.filter((x): x is Obj => !!x && typeof x === 'object')
            .map((x) => ({ id: str(x.id), name: str(x.name) ?? str(x.id), value: num(x.value) }))
            .filter((x) => x.value !== null)
        : [];

// Freebox Server update state. The box does not report pending updates itself:
// latest comes from the dev.freebox.fr blog check (freeboxFirmwareCheckService).
// null means "unknown" (check not run yet or disabled), never "up to date".
export function firmwareUpdate(current: unknown, latest: string | null | undefined) {
    const installed = str(current);
    const latestFirmware = latest || null;
    return {
        latest_firmware: latestFirmware,
        update_available: installed && latestFirmware ? compareVersions(latestFirmware, installed) > 0 : null,
    };
}

export function summarizeFreebox(connection: unknown, system: unknown, latestFirmware?: string | null) {
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
            ...firmwareUpdate(s.firmware_version, latestFirmware),
            uptime: num(s.uptime_val),      // seconds
            disk_status: str(s.disk_status),
            board_name: str(s.board_name),
            user_main_storage: str(s.user_main_storage),
            sensors: readings(s.sensors),   // °C
            fans: readings(s.fans),         // rpm
        },
    };
}

interface Entry { latestVersion?: string; updateAvailable?: boolean; changelog?: string; date?: string; blogUrl?: string }

const entry = (e: Entry | null | undefined) => e ? {
    latest: str(e.latestVersion),
    update_available: typeof e.updateAvailable === 'boolean' ? e.updateAvailable : null,
    date: str(e.date),
    changelog: str(e.changelog),
    url: str(e.blogUrl),
} : null;

// Firmware updates summary (Freebox Server and Player), from the dev.freebox.fr blog check.
// null when the check has not run yet or is disabled.
export function firmwareBlock(info: { server?: Entry; player?: Entry | null; lastCheck?: string } | null | undefined, installed: unknown) {
    if (!info) return null;
    const server = entry(info.server);
    return {
        server: server && { installed: str(installed), ...server, ...firmwareUpdate(installed, server.latest) },
        player: entry(info.player),
        last_check: str(info.lastCheck),
    };
}

// Health in one place: temperatures, fans, disk, line and fibre. Same values as elsewhere in the response.
export function healthBlock(base: ReturnType<typeof summarizeFreebox>, storage: { partitions: Array<{ used_pct: number | null }> } | null, ftth: { sfp_has_signal: boolean | null; link: boolean | null } | null | undefined) {
    const temps = base.system.sensors.map((x) => x.value as number);
    const pcts = (storage?.partitions ?? []).map((p) => p.used_pct).filter((v): v is number => v !== null);
    return {
        sensors: base.system.sensors,
        fans: base.system.fans,
        max_temperature: temps.length ? Math.max(...temps) : null,
        disk_status: base.system.disk_status,
        max_used_pct: pcts.length ? Math.max(...pcts) : null,
        line_up: base.connection.state === null ? null : base.connection.state === 'up',
        fibre_signal: ftth?.sfp_has_signal ?? null,
        fibre_link: ftth?.link ?? null,
    };
}
