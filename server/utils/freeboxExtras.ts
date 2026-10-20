// Optional Freebox blocks for GET /api/connection/summary (API tokens).
// Explicit field allowlists: serial, MAC, keys and raw Freebox payloads are never forwarded.
// A block is null when the paired app lacks the right for it (see missing_rights);
// unknown values are null, never false.

type Obj = Record<string, unknown>;
interface Resp { success: boolean; result?: unknown; error_code?: string; missing_right?: string }

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

const pct = (used: number | null, total: number | null): number | null =>
    used !== null && total !== null && total > 0 ? Math.min(100, Math.max(0, Math.round((used / total) * 100))) : null;

export function mapStorage(disks: unknown) {
    return {
        disks: list(disks).map((d) => ({
            id: num(d.id),
            model: str(d.model),
            state: str(d.state),
            smart_ok: bool(d.smart_ok),
            temperature: num(d.temp),
            total_bytes: num(d.total_bytes),
        })),
        partitions: list(disks).flatMap((d) => list(d.partitions)).map((p) => {
            const total = num(p.total_bytes);
            const used = num(p.used_bytes);
            return {
                label: str(p.label),
                fstype: str(p.fstype),
                state: str(p.state),
                total_bytes: total,
                used_bytes: used,
                free_bytes: num(p.free_bytes),
                used_pct: pct(used, total),
            };
        }),
    };
}

// Freebox reports optical power in 1/100 dBm. Line IPs are deliberately not exposed.
export function mapFtth(ftth: unknown) {
    const f = isObj(ftth) ? ftth : {};
    const dbm = (v: unknown) => { const n = num(v); return n === null ? null : n / 100; };
    return {
        sfp_present: bool(f.sfp_present),
        sfp_has_signal: bool(f.sfp_has_signal),
        link: bool(f.link),
        sfp_pwr_rx: dbm(f.sfp_pwr_rx),
        sfp_pwr_tx: dbm(f.sfp_pwr_tx),
        // Module identity and state; the serial number is deliberately left out.
        sfp_model: str(f.sfp_model),
        sfp_vendor: str(f.sfp_vendor),
        sfp_alim_ok: bool(f.sfp_alim_ok),
        link_type: str(f.link_type),
    };
}

// Main networks only: a non-main BSS is skipped when a main one exists on the same radio (guest network).
// Key, passphrase and encryption are never read.
export function mapWifiNetworks(bss: unknown, aps: unknown) {
    const all = list(bss);
    const radiosWithMain = new Set(all.filter((b) => isObj(b.status) && b.status.is_main_bss === true).map((b) => b.phy_id));
    const bandOfRadio = new Map(list(aps).map((ap) => [ap.id, isObj(ap.config) ? str(ap.config.band) : null]));
    return all
        .filter((b) => !(isObj(b.status) && b.status.is_main_bss === false && radiosWithMain.has(b.phy_id)))
        .map((b) => {
            const status = isObj(b.status) ? b.status : {};
            const config = isObj(b.config) ? b.config : {};
            return {
                ssid: str(config.ssid),
                enabled: bool(config.enabled),
                hidden: bool(config.hide_ssid),
                state: str(status.state),
                band: str(status.band) ?? bandOfRadio.get(b.phy_id) ?? null,
            };
        });
}

export function mapDhcp(cfg: unknown) {
    const c = isObj(cfg) ? cfg : {};
    return {
        enabled: bool(c.enabled),
        ip_range_start: str(c.ip_range_start),
        ip_range_end: str(c.ip_range_end),
        gateway: str(c.gateway),
        netmask: str(c.netmask),
        dns: Array.isArray(c.dns) ? c.dns.filter((d): d is string => typeof d === 'string' && d !== '') : [],
    };
}

export function mapWifi(enabled: unknown, aps: unknown, stationsCount: number | null, bss: unknown = []) {
    return {
        networks: mapWifiNetworks(bss, aps),
        enabled: bool(enabled),
        aps: list(aps).map((ap) => {
            const status = isObj(ap.status) ? ap.status : {};
            const config = isObj(ap.config) ? ap.config : {};
            return {
                name: str(ap.name),
                state: str(status.state),
                band: str(config.band) ?? str(status.band),
                channel: num(status.primary_channel) ?? num(config.primary_channel) ?? num(config.channel),
                width: str(status.channel_width) ?? str(config.channel_width),
            };
        }),
        stations_count: stationsCount,
    };
}

export interface VmDiskSize { total: number | null; used: number | null }

export function mapVmDisk(info: unknown): VmDiskSize {
    const d = isObj(info) ? info : {};
    return { total: num(d.virtual_size), used: num(d.actual_size) };
}

// sizes[i] is the disk size of vms[i], null when the lookup failed
export function mapVms(vms: unknown, sizes: Array<VmDiskSize | null> = []) {
    return list(vms).map((v, i) => ({
        id: num(v.id),
        name: str(v.name),
        status: str(v.status),
        vcpus: num(v.vcpus),
        memory_mb: num(v.memory),
        disk_type: str(v.disk_type),
        disk_total_bytes: sizes[i]?.total ?? null,
        disk_used_bytes: sizes[i]?.used ?? null,
        os: str(v.os),
    }));
}

export function mapVmSystem(info: unknown) {
    const i = isObj(info) ? info : {};
    const totalMem = num(i.total_memory);
    const usedMem = num(i.used_memory);
    const totalCpus = num(i.total_cpus);
    const usedCpus = num(i.used_cpus);
    return {
        total_memory_mb: totalMem,
        used_memory_mb: usedMem,
        memory_pct: pct(usedMem, totalMem),
        total_cpus: totalCpus,
        used_cpus: usedCpus,
        cpu_pct: pct(usedCpus, totalCpus),
    };
}

export function mapSwitch(ports: unknown) {
    const p = list(ports).map((x) => ({
        id: num(x.id),
        link_up: typeof x.link === 'string' ? x.link === 'up' : null,
        speed_mbps: num(Number.parseInt(String(x.speed ?? ''), 10)),
        duplex: str(x.duplex),
    }));
    return { ports_total: p.length, ports_up: p.filter((x) => x.link_up === true).length, ports: p };
}

// Hosts known to the box and those currently reachable, over every LAN interface
export function countHosts(perInterface: unknown[][]) {
    const hosts = perInterface.flat().filter(isObj);
    return { hosts: hosts.length, hosts_active: hosts.filter((h) => h.active === true).length };
}

interface Api {
    getSwitchStatus(): Promise<Resp>;
    getLanBrowserInterfaces(): Promise<Resp>;
    getLanHosts(name: string): Promise<Resp>;
    getDhcpConfig(): Promise<Resp>;
    getWifiBss(): Promise<Resp>;
    getVmInfo(): Promise<Resp>;
    getVmDiskInfo(diskPath: string, diskType?: string): Promise<Resp>;
    getLanConfig(): Promise<Resp>;
    getDisks(): Promise<Resp>;
    getFtthInfo(): Promise<Resp>;
    getWifiConfig(): Promise<Resp>;
    getWifiAps(): Promise<Resp>;
    getWifiStations(): Promise<Resp>;
    getVms(): Promise<Resp>;
    // Bumped by every write to the box (freeboxApi), drops the long-lived blocks
    getWriteGeneration?(): number;
}

export interface FreeboxExtras {
    lan_ip: string | null;
    dhcp: ReturnType<typeof mapDhcp> | null;
    switch: ReturnType<typeof mapSwitch> | null;
    hosts: number | null;
    hosts_active: number | null;
    storage: ReturnType<typeof mapStorage> | null;
    ftth?: ReturnType<typeof mapFtth> | null;
    wifi: ReturnType<typeof mapWifi> | null;
    vms?: ReturnType<typeof mapVms> | null;
    vm_system?: ReturnType<typeof mapVmSystem> | null;
    missing_rights: string[];
}

// Right each block needs, used when the box does not name the missing one itself.
const RIGHT = { switch: 'settings', hosts: 'settings', lan: 'settings', dhcp: 'settings', bss: 'settings', storage: 'settings', ftth: 'settings', wifi: 'settings', vm: 'vm' } as const;

type Rights = Set<string>;
interface Fetched { ok: boolean; result?: unknown; denied: boolean }

// Never throws; records the missing right on a 403.
async function fetchBlock(call: () => Promise<Resp>, fallbackRight: string, missing: Rights): Promise<Fetched> {
    const r = await call().catch((): Resp => ({ success: false }));
    const denied = r.error_code === 'insufficient_rights';
    if (denied) missing.add(r.missing_right || fallbackRight);
    return { ok: r.success, result: r.result, denied };
}

async function vmDiskSizes(api: Api, vms: unknown, missing: Rights): Promise<Array<VmDiskSize | null>> {
    return Promise.all(list(vms).map(async (v) => {
        const path = str(v.disk_path);
        if (!path) return null;
        const r = await api.getVmDiskInfo(path, str(v.disk_type) ?? undefined).catch((): Resp => ({ success: false }));
        if (r.error_code === 'insufficient_rights') missing.add(r.missing_right || RIGHT.vm);
        return r.success ? mapVmDisk(r.result) : null;
    }));
}

function mapWifiBlock(wcfg: Fetched, aps: Fetched, stations: Fetched, bss: Fetched) {
    if (!aps.ok) return null;
    const enabled = wcfg.ok && isObj(wcfg.result) ? wcfg.result.enabled : null;
    const count = stations.ok && Array.isArray(stations.result) ? stations.result.length : null;
    return mapWifi(enabled, aps.result, count, bss.ok ? bss.result : []);
}

async function fetchHosts(api: Api, missing: Rights) {
    const ifaces = await fetchBlock(() => api.getLanBrowserInterfaces(), RIGHT.hosts, missing);
    if (!ifaces.ok) return null;
    const names = list(ifaces.result).map((i) => str(i.name)).filter((n): n is string => n !== null);
    const perInterface = await Promise.all(names.map((n) => fetchBlock(() => api.getLanHosts(n), RIGHT.hosts, missing)));
    return countHosts(perInterface.map((r) => (r.ok && Array.isArray(r.result) ? r.result : [])));
}

// Blocks that rarely change: configuration, disks, FTTH optics, VM disk sizes and VM host info
interface SlowExtras {
    lan: Fetched; dhcp: Fetched; disks: Fetched; ftth: Fetched | null;
    wcfg: Fetched; aps: Fetched; bss: Fetched; vmInfo: Fetched | null;
    diskSizeByPath: Map<string, VmDiskSize | null>;
    missing: Rights;
}

async function collectSlowExtras(api: Api, media: string | null): Promise<SlowExtras> {
    const missing: Rights = new Set();
    const get = (call: () => Promise<Resp>, right: string) => fetchBlock(call, right, missing);

    const [lan, dhcp, disks, ftth, wcfg, aps, bss, vms] = await Promise.all([
        get(() => api.getLanConfig(), RIGHT.lan),
        get(() => api.getDhcpConfig(), RIGHT.dhcp),
        get(() => api.getDisks(), RIGHT.storage),
        media === 'ftth' ? get(() => api.getFtthInfo(), RIGHT.ftth) : Promise.resolve(null),
        get(() => api.getWifiConfig(), RIGHT.wifi),
        get(() => api.getWifiAps(), RIGHT.wifi),
        get(() => api.getWifiBss(), RIGHT.bss),
        get(() => api.getVms(), RIGHT.vm),
    ]);

    // Disk sizes are keyed by path: the VM list itself is refreshed with the live blocks
    const diskSizeByPath = new Map<string, VmDiskSize | null>();
    let vmInfo: Fetched | null = null;
    if (vms.ok) {
        const sizes = await vmDiskSizes(api, vms.result, missing);
        list(vms.result).forEach((v, i) => {
            const path = str(v.disk_path);
            if (path) diskSizeByPath.set(path, sizes[i] ?? null);
        });
        vmInfo = await get(() => api.getVmInfo(), RIGHT.vm);
    }
    return { lan, dhcp, disks, ftth, wcfg, aps, bss, vmInfo, diskSizeByPath, missing };
}

export async function collectExtras(api: Api, media: string | null, slowExtras?: Promise<SlowExtras>): Promise<FreeboxExtras> {
    const missing: Rights = new Set();
    const get = (call: () => Promise<Resp>, right: string) => fetchBlock(call, right, missing);

    const [slow, sw, hostCounts, stations, vms] = await Promise.all([
        slowExtras ?? collectSlowExtras(api, media),
        get(() => api.getSwitchStatus(), RIGHT.switch),
        fetchHosts(api, missing),
        get(() => api.getWifiStations(), RIGHT.wifi),
        get(() => api.getVms(), RIGHT.vm),
    ]);
    const { lan, dhcp, disks, ftth, wcfg, aps, bss, vmInfo, diskSizeByPath } = slow;

    const out: FreeboxExtras = {
        lan_ip: lan.ok && isObj(lan.result) ? str(lan.result.ip) : null,
        dhcp: dhcp.ok ? mapDhcp(dhcp.result) : null,
        switch: sw.ok ? mapSwitch(sw.result) : null,
        hosts: hostCounts?.hosts ?? null,
        hosts_active: hostCounts?.hosts_active ?? null,
        storage: disks.ok ? mapStorage(disks.result) : null,
        wifi: mapWifiBlock(wcfg, aps, stations, bss),
        missing_rights: [],
    };
    if (ftth) out.ftth = ftth.ok ? mapFtth(ftth.result) : null;
    // No VM support (Revolution/Pop): block omitted. Denied rights: explicit null.
    if (vms.ok) {
        const sizes = list(vms.result).map((v) => diskSizeByPath.get(str(v.disk_path) ?? '') ?? null);
        out.vms = mapVms(vms.result, sizes);
        out.vm_system = vmInfo?.ok ? mapVmSystem(vmInfo.result) : null;
    } else if (vms.denied) {
        out.vms = null;
    }
    out.missing_rights = [...new Set([...missing, ...slow.missing])].sort((a, b) => a.localeCompare(b));
    return out;
}

// Live counts (hosts, WiFi stations, VM states, switch links) stay at 30 s; the rarely
// changing blocks are kept 5 min, and any write to the box drops them
const TTL_MS = 30_000;
const SLOW_TTL_MS = 5 * 60_000;
let cache: { key: string; at: number; value: Promise<FreeboxExtras> } | null = null;
let slowCache: { key: string; at: number; generation: number; value: Promise<SlowExtras> } | null = null;

function getSlowExtras(api: Api, media: string | null): Promise<SlowExtras> {
    const key = media ?? '';
    const generation = api.getWriteGeneration?.() ?? 0;
    if (slowCache?.key === key && slowCache.generation === generation && Date.now() - slowCache.at < SLOW_TTL_MS) {
        return slowCache.value;
    }
    const value = collectSlowExtras(api, media);
    slowCache = { key, at: Date.now(), generation, value };
    value.catch(() => { if (slowCache?.value === value) slowCache = null; });
    return value;
}

// Shared caches: several consumers polling the summary must not multiply Freebox calls.
export function getExtras(api: Api, media: string | null): Promise<FreeboxExtras> {
    const key = media ?? '';
    if (cache?.key === key && Date.now() - cache.at < TTL_MS) return cache.value;
    const value = collectExtras(api, media, getSlowExtras(api, media));
    cache = { key, at: Date.now(), value };
    value.catch(() => { if (cache?.value === value) cache = null; });
    return value;
}

// ===== Opt-in compact lists (?compact=1) for /api/lan/devices, /api/wifi/stations, /api/dhcp/leases =====
// Same projections as the MCP freebox tools: the raw objects carry every name source,
// IPv6 address and access point detail ever seen for a host.

export function hostIpv4(host: unknown): string[] {
    return list(isObj(host) ? host.l3connectivities : null).filter((c) => c.af === 'ipv4').map((c) => String(c.addr));
}

const objOf = (v: unknown): Obj => (isObj(v) ? v : {});

export function summarizeLanHost(host: unknown) {
    const h = objOf(host);
    const ap = objOf(h.access_point);
    const wifi = objOf(ap.wifi_information);
    return {
        name: h.primary_name,
        type: h.host_type,
        mac: objOf(h.l2ident).id,
        vendor: h.vendor_name || undefined,
        ipv4: hostIpv4(h),
        active: h.active,
        reachable: h.reachable,
        last_activity: h.last_activity,
        interface: h.interface,
        connection: ap.connectivity_type,
        ssid: wifi.ssid,
        band: wifi.band,
        signal_dbm: wifi.signal,
    };
}

export function summarizeWifiStation(station: unknown) {
    const s = objOf(station);
    const host = objOf(s.host);
    return {
        name: s.hostname || host.primary_name,
        mac: s.mac,
        ipv4: hostIpv4(host),
        vendor: host.vendor_name || undefined,
        bssid: s.bssid,
        state: s.state,
        signal_dbm: s.signal,
        rx_rate: s.rx_rate,
        tx_rate: s.tx_rate,
        rx_bytes: s.rx_bytes,
        tx_bytes: s.tx_bytes,
        conn_duration: s.conn_duration,
        inactive: s.inactive,
    };
}

export function summarizeDhcpLease(lease: unknown) {
    const l = objOf(lease);
    const host = objOf(l.host);
    return {
        name: l.hostname || host.primary_name,
        mac: l.mac,
        ip: l.ip,
        is_static: l.is_static,
        active: host.active,
        lease_remaining: l.lease_remaining,
        assign_time: l.assign_time,
        refresh_time: l.refresh_time,
    };
}

export interface CompactQuery { compact: boolean; active: boolean; limit?: number; search?: string }

const MAX_COMPACT_LIMIT = 1000;
const MAX_SEARCH_LENGTH = 200;
const flag = (v: unknown): boolean => v === '1' || v === 'true';

// Parses ?compact=1&active=1&limit=N&search=... (other values are ignored, never an error)
export function parseCompactQuery(query: Record<string, unknown>): CompactQuery {
    const limit = Number.parseInt(String(query.limit ?? ''), 10);
    const search = typeof query.search === 'string' ? query.search.trim().slice(0, MAX_SEARCH_LENGTH) : '';
    return {
        compact: flag(query.compact),
        active: flag(query.active),
        limit: limit > 0 ? Math.min(limit, MAX_COMPACT_LIMIT) : undefined,
        search: search || undefined,
    };
}

/**
 * Filter (active, case-insensitive search), count, truncate, then project the kept items.
 * Same envelope as the MCP list tools: `total` is the match count before `limit`.
 */
export function compactList(
    items: unknown[],
    q: CompactQuery,
    opts: { isActive: (item: Obj) => boolean; searchFields: (item: Obj) => unknown[]; project: (item: unknown) => unknown },
) {
    const needle = q.search?.toLowerCase();
    const matched = items.filter(isObj).filter((item) =>
        (!q.active || opts.isActive(item)) &&
        (!needle || opts.searchFields(item).some((v) => v !== undefined && v !== null && String(v).toLowerCase().includes(needle))));
    const kept = q.limit ? matched.slice(0, q.limit) : matched;
    return { success: true, result: kept.map(opts.project), total: matched.length };
}
