# Read-only REST API tokens

MyNetwork can issue **read-only API tokens** so that another service on your
network (an inventory, monitoring or home-automation tool) can read the
network inventory without a user account or password.

They are separate from MCP tokens:

| | API token | MCP token |
|---|---|---|
| Prefix | `mwk_api_` + 64 hex characters | 64 hex characters |
| Works on | the REST routes listed below, GET/HEAD only | `/api/mcp` only |
| Managed in | Administration > API tokens | Administration > MCP |

An MCP token is refused on the REST API (401), and an API token is refused on
`/api/mcp` (401).

## Creating a token

From the web UI: **Administration > API tokens**. Give it a name (for example
`MyServices`), pick a validity period, then copy the token. It is shown only
once: if you lose it, revoke it and create a new one.

From the command line (for example inside the container):

```bash
docker exec -it -u node <container> node_modules/.bin/tsx scripts/mcp-token.ts --api
```

The CLI creates a token named `CLI` with no expiry.

## Using a token

Send it in the standard header:

```bash
curl -H "Authorization: Bearer mwk_api_0123...cdef" \
  http://192.168.1.10:7505/api/network-scan/history
```

```python
import requests

BASE = "http://192.168.1.10:7505"
HEADERS = {"Authorization": "Bearer mwk_api_0123...cdef"}

r = requests.get(f"{BASE}/api/network-scan/history",
                 params={"status": "online", "limit": 1000},
                 headers=HEADERS, timeout=10)
r.raise_for_status()
for device in r.json()["result"]["items"]:
    print(device["ip"], device.get("mac"), device.get("hostname"))
```

## Rules

These rules are always enforced, in this order:

1. **Network.** Requests are accepted only from private networks (RFC 1918),
   loopback and Tailscale (100.64.0.0/10), the same list as MCP. The check
   uses the real TCP peer address, not `X-Forwarded-For`, unless that peer is
   listed in `MCP_TRUSTED_PROXIES` (IPv4/CIDR list): then the client address is
   read from `X-Forwarded-For`, skipping trusted proxies from the right.
   Otherwise the response is `403 API_TOKEN_NETWORK`.
2. **Valid token.** Unknown, expired and revoked tokens get
   `401 API_TOKEN_INVALID`.
3. **Read only.** Only `GET` and `HEAD` are accepted. Any other method gets
   `403 API_TOKEN_READ_ONLY`.
4. **Allowlisted routes only.** Any route not listed below gets
   `403 API_TOKEN_ROUTE_NOT_ALLOWED`, never 404, so a client can tell a
   permission problem from a typo. Admin routes always refuse API tokens.
5. **No credentials in responses.** Any field whose name contains `key`,
   `pass`, `secret`, `token`, `auth`, `psk` or `cookie` is removed at every
   depth before the response is sent. This also drops a few harmless fields,
   for example Freebox `flags.authorized` on WiFi stations.

The usual per-IP rate limits apply: 300 requests per minute on most routes,
60 per minute on `/api/network-scan/*`.

Each request updates the token's "last used" date, shown in the admin UI at
most once per minute. Audit log entries show the token as `api:<name>`.

### Error format

```json
{ "success": false, "error": { "code": "API_TOKEN_ROUTE_NOT_ALLOWED", "message": "Route not available to API tokens: /api/users" } }
```

## Available routes

The single source of truth is `API_TOKEN_ALLOWED_ROUTES` in
`server/middleware/apiTokenAuth.ts`.

| Route | Source | Notes |
|---|---|---|
| `GET /api/health` | MyNetwork | Public, no token needed |
| `GET /api/network-scan/history` | MyNetwork scanner DB | Full inventory, paginated |
| `GET /api/network-scan/:ip` | MyNetwork scanner DB | One device, IPv4 only |
| `GET /api/lan/devices` | Freebox | LAN hosts on all interfaces |
| `GET /api/dhcp/leases` | Freebox | Dynamic DHCP leases (no DHCP config) |
| `GET /api/wifi/stations` | Freebox | Connected WiFi stations |
| `GET /api/connection/summary` | Freebox | Line state, rates, box health, storage, FTTH, WiFi and VMs (no public IP, serial or MAC) |
| `GET /api/topology` | MyNetwork | Last computed topology snapshot |
| `GET /api/plugins/unifi/clients` | UniFi | Connected clients, compact summary |
| `GET /api/plugins/unifi/devices` | UniFi | APs, switches, gateways, compact summary |
| `GET /api/plugins/unifi/system` | UniFi | UniFi Network version and update, gateway health |

All responses use the `{ "success": true, "result": ... }` envelope. In the
field lists below, `?` marks a field that may be missing or `null`.

### `GET /api/health`

```json
{ "status": "ok", "timestamp": "2026-10-09T21:00:00.000Z" }
```

### `GET /api/network-scan/history`

Query parameters (all optional):

| Parameter | Values | Default |
|---|---|---|
| `status` | `online`, `offline`, `unknown` | all |
| `ip` | partial IP, e.g. `192.168.1` | all |
| `search` | text matched against IP, MAC, hostname, vendor | none |
| `limit` | 1 to 1000 | 100 |
| `offset` | integer | 0 |
| `sortBy` | `ip`, `last_seen`, `first_seen`, `status`, `ping_latency`, `hostname`, `mac`, `vendor` | `last_seen` |
| `sortOrder` | `asc`, `desc` | `desc` |

Blacklisted IPs and IPs outside the configured scan ranges are excluded. Use
`offset` to page through more than 1000 devices.

```json
{
  "success": true,
  "result": {
    "items": [
      {
        "id": 42,
        "ip": "192.168.1.20",
        "mac": "aa:bb:cc:dd:ee:ff",
        "hostname": "nas",
        "vendor": "Synology",
        "hostnameSource": "freebox",
        "vendorSource": "scanner",
        "status": "online",
        "pingLatency": 1.4,
        "firstSeen": "2026-03-01T10:00:00.000Z",
        "lastSeen": "2026-10-09T20:58:12.000Z",
        "scanCount": 812,
        "additionalInfo": { "openPorts": [22, 80, 443] }
      }
    ],
    "total": 57,
    "limit": 100,
    "offset": 0
  }
}
```

| Field | Type | Description |
|---|---|---|
| `id` | number | Internal row id |
| `ip` | string | IPv4 address (unique key) |
| `mac`? | string | MAC address |
| `hostname`? | string | Best known hostname |
| `vendor`? | string | Manufacturer |
| `hostnameSource`? / `vendorSource`? | string | Where the value came from: `freebox`, `unifi`, `scanner`, `system`, `api`, `manual` |
| `vendorIcon`? | string | Manual icon override (`simple:<slug>`, `lucide:<name>`, `custom:<data-url>`) |
| `status` | string | `online`, `offline` or `unknown` |
| `pingLatency`? | number | Last ping latency in ms |
| `firstSeen` / `lastSeen` | string | ISO 8601 |
| `scanCount` | number | Number of scans that saw the device |
| `additionalInfo`? | object | Free-form scanner data (open ports, OS hints...), shape not guaranteed |

### `GET /api/network-scan/:ip`

Example: `GET /api/network-scan/192.168.1.20`. `result` is a single item with
the same shape as above. Unknown IP: `404 IP_NOT_FOUND`.

### `GET /api/lan/devices`

Freebox LAN hosts from every interface, relayed from the Freebox OS API
(`/lan/browser/<interface>/`) with an added `interface` field. Exact fields
depend on the Freebox firmware. The main ones:

| Field | Type | Description |
|---|---|---|
| `id` | string | Freebox host id |
| `interface` | string | LAN interface name (e.g. `pub`), added by MyNetwork |
| `primary_name` | string | Display name |
| `host_type` | string | e.g. `workstation`, `smartphone`, `nas`... |
| `vendor_name`? | string | Manufacturer |
| `l2ident` | object | `{ "id": "<MAC>", "type": "mac_address" }` |
| `l3connectivities` | array | `[{ "addr", "af": "ipv4"/"ipv6", "active", "reachable", "last_activity", "last_time_reachable" }]` |
| `active` / `reachable` / `persistent` | boolean | Current state |
| `first_activity` / `last_activity` / `last_time_reachable` | number | Unix seconds |
| `access_point`? | object | Connection details (`connectivity_type`: `ethernet`/`wifi`, band, signal...) |
| `names`? | array | Names learned from mDNS/DHCP/NetBIOS |

When the Freebox is unreachable or not paired, the response is the Freebox
error envelope: `{ "success": false, "msg": "...", "error_code": "..." }`.

### `GET /api/dhcp/leases`

Freebox dynamic DHCP leases (`/dhcp/dynamic_lease/`). Static lease and DHCP
server configuration are not exposed.

| Field | Type | Description |
|---|---|---|
| `mac` | string | Client MAC |
| `ip` | string | Leased IPv4 |
| `hostname`? | string | Hostname sent by the client |
| `is_static` | boolean | True if a static lease matches |
| `assign_time` / `refresh_time` | number | Unix seconds |
| `lease_remaining` | number | Seconds left |
| `host`? | object | Matching LAN host (same shape as `/api/lan/devices`) |

### `GET /api/wifi/stations`

Freebox WiFi stations currently associated, gathered from every access point
(`/wifi/ap/<id>/stations/`) with an added `ap_id` field.

| Field | Type | Description |
|---|---|---|
| `id` / `mac` | string | Station MAC |
| `bssid` | string | Access point BSSID |
| `hostname`? | string | Station name |
| `host`? | object | Matching LAN host |
| `signal` | number | dBm |
| `rx_rate` / `tx_rate` | number | Current rates |
| `rx_bytes` / `tx_bytes` | number | Byte counters |
| `conn_duration` / `inactive` | number | Seconds |
| `state` | string | Association state |
| `flags`? | object | Capability flags (`authorized` is removed by the credential filter) |

### `GET /api/connection/summary`

Line state and box health in one call, built from the Freebox connection
status and system info. Identifiers (public IP, serial number, MAC addresses,
remote-access domain) are left out.

```json
{
  "success": true,
  "result": {
    "connection": { "state": "up", "type": "ethernet", "media": "ftth", "rate_down": 1200, "rate_up": 300,
                    "bandwidth_down": 8000000000, "bandwidth_up": 700000000, "bytes_down": 0, "bytes_up": 0 },
    "system": { "model": "Freebox Ultra", "firmware": "4.9.4", "latest_firmware": "4.9.16", "update_available": true,
                "uptime": 86400, "disk_status": "active", "lan_ip": "192.168.1.254",
                "sensors": [{ "id": "temp_cpu0", "name": "CPU 0", "value": 52 }],
                "fans": [{ "id": "fan0", "name": "Fan", "value": 1800 }] },
    "storage": { "disks": [{ "id": 1, "model": "SSD", "state": "enabled", "smart_ok": null, "temperature": 38, "total_bytes": 240000000000 }],
                 "partitions": [{ "label": "Freebox", "fstype": "ext4", "state": "mounted", "total_bytes": 230000000000,
                                  "used_bytes": 23000000000, "free_bytes": 207000000000, "used_pct": 10 }] },
    "ftth": { "sfp_present": true, "sfp_has_signal": true, "link": true, "sfp_pwr_rx": -18.5, "sfp_pwr_tx": 2.1 },
    "wifi": { "enabled": true, "stations_count": 12,
              "aps": [{ "name": "wifi0", "state": "active", "band": "2d4g", "channel": 6, "width": "20" }] },
    "vms": [{ "id": 0, "name": "debian", "status": "running", "vcpus": 2, "memory_mb": 2048, "disk_type": "qcow2",
              "disk_total_bytes": 21474836480, "disk_used_bytes": 3000000000, "os": "debian" }],
    "vm_system": { "total_memory_mb": 8192, "used_memory_mb": 2048, "memory_pct": 25, "total_cpus": 4, "used_cpus": 2, "cpu_pct": 50 },
    "missing_rights": []
  }
}
```

| Field | Type | Description |
|---|---|---|
| `connection.state`? | string | `up`, `down`, `going_up`, `going_down` |
| `connection.media`? / `type`? | string | `ftth`, `xdsl`, `backup_4g` / `ethernet`, `rfc2684`, `pppoatm` |
| `connection.rate_down` / `rate_up`? | number | Current rate, bytes/s |
| `connection.bandwidth_down` / `bandwidth_up`? | number | Line capacity, bit/s |
| `system.firmware`? | string | Installed Freebox Server firmware |
| `system.latest_firmware`? | string | Latest Freebox Server firmware published on dev.freebox.fr/blog |
| `system.update_available` | boolean or null | `true` when `latest_firmware` is newer than `firmware`. `null` when unknown (blog check not run yet or disabled): the box does not report pending updates itself |
| `system.uptime`? | number | Seconds since the box started |
| `system.sensors` / `fans` | array | `{ id, name, value }`, °C and rpm |
| `system.lan_ip`? | string | LAN address of the box, for a reliable match with other sources |
| `system.board_name`? / `user_main_storage`? / `box_authenticated`? | string / string / boolean | Board name, main storage location, authentication state |
| `storage` | object or null | `disks` (`id`, `model`, `state`, `smart_ok`, `temperature` in °C, `total_bytes`) and `partitions` (`label`, `fstype`, `state`, sizes in bytes, `used_pct` 0 to 100 computed by MynetworK, `null` when the total is unknown). Serial numbers are never returned |
| `ftth` | object or null | Only present when `connection.media` is `ftth`: `sfp_present`, `sfp_has_signal`, `link`, `sfp_pwr_rx` / `sfp_pwr_tx` in dBm. The line IPv4/IPv6 are deliberately not exposed |
| `wifi` | object or null | `enabled`, `stations_count`, `aps` (`name`, `state`, `band`, `channel`, `width`) |
| `vms` | array or null | Freebox Delta / Ultra only, absent otherwise: `id`, `name`, `status`, `vcpus`, `memory_mb`, `disk_type`, `disk_total_bytes` (virtual size), `disk_used_bytes` (actual size), `os` |
| `vm_system` | object or null | Memory (MB) and CPUs, total and used, available to VMs, with `memory_pct` and `cpu_pct` (0 to 100, `null` when the total is unknown). This is capacity allocated to VMs, not the load of the box itself: the Freebox does not report its own CPU or memory usage (use `system.sensors` for CPU temperature) |
| `missing_rights` | string[] | Freebox permissions the paired app lacks (e.g. `settings`, `vm`). The matching blocks are `null`, the rest of the response stays valid |

Optional blocks are cached for 30 seconds. An unknown value is `null`, never `false`.

Any field may be `null` when the box firmware does not report it.

### `GET /api/topology`

The last computed snapshot (daily, or after an admin refresh). `result` is
`null` before the first computation.

```json
{
  "success": true,
  "result": {
    "nodes": [
      { "id": "aa:bb:cc:dd:ee:ff", "kind": "switch", "label": "USW Lite 8", "ip": "192.168.1.2",
        "mac": "aa:bb:cc:dd:ee:ff", "vendor": "Ubiquiti", "sources": ["unifi"],
        "metadata": { "model": "USL8LP", "modelDisplay": "USW Lite 8 PoE", "active": true,
                      "ports": [{ "idx": 1, "up": true, "speed": 1000, "poe": false }] } }
    ],
    "edges": [
      { "id": "e1", "source": "aa:bb:cc:dd:ee:ff", "target": "11:22:33:44:55:66",
        "medium": "ethernet", "linkSpeedMbps": 1000, "portIndex": 1, "source_plugin": "unifi" }
    ],
    "sources": ["freebox", "unifi", "scan-reseau"],
    "computed_at": "2026-10-09T04:00:00.000Z",
    "schema_version": 19
  }
}
```

| Node field | Type | Description |
|---|---|---|
| `id` | string | Stable id (usually the MAC) |
| `kind` | string | `gateway`, `switch`, `ap`, `repeater`, `client`, `vm-host`, `port-overflow`, `unknown` |
| `label` | string | Display name |
| `ip`? / `mac`? / `vendor`? | string | Identity |
| `sources` | array | `freebox`, `unifi`, `scan-reseau` |
| `metadata`? | object | `model`, `modelDisplay`, `firmware`, `active`, `last_seen` (unix s), `ssid`, `band`, `signal`, `ports[]`... Open-ended |

| Edge field | Type | Description |
|---|---|---|
| `source` / `target` | string | Node ids. Edges go from child to parent |
| `medium` | string | `ethernet`, `wifi`, `uplink`, `virtual` |
| `linkSpeedMbps`? | number | Negotiated speed |
| `portIndex`? / `localPortIndex`? | number | Port on the source / target device |
| `ssid`? / `band`? / `signal`? | | WiFi links |
| `source_plugin` | string | Plugin that reported the link |

### `GET /api/plugins/unifi/clients`

Query parameters (all optional): `type` (`all`, `wifi`, `wired`, default
`all`), `search` (max 200 chars, matched against name, hostname, IP, MAC),
`limit` (1 to 1000). `total` is the number of matches before `limit`.

```json
{
  "success": true,
  "result": [
    { "name": "Pixel 8", "hostname": "pixel-8", "mac": "aa:bb:cc:dd:ee:01", "ip": "192.168.1.31",
      "oui": "Google", "network": "LAN", "wired": false, "essid": "Home", "ap_mac": "aa:bb:cc:00:00:01",
      "radio": "na", "channel": 36, "signal_dbm": -58, "satisfaction": 98,
      "link_rx_rate_kbps": 866700, "link_tx_rate_kbps": 780000,
      "live_rx_bytes_per_sec": 1200, "live_tx_bytes_per_sec": 800,
      "rx_bytes": 123456789, "tx_bytes": 98765432, "uptime": 5400, "last_seen": 1760043600 }
  ],
  "total": 1
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Alias, else hostname, IP or MAC |
| `hostname`? / `mac` / `ip`? / `oui`? | string | Identity |
| `network`? | string | UniFi network name |
| `wired` | boolean | Wired or wireless |
| `guest`? | boolean | Present (true) only for guest clients |
| `essid`? / `ap_mac`? / `radio`? / `channel`? / `signal_dbm`? | | WiFi clients |
| `switch_mac`? / `switch_port`? | | Wired clients |
| `satisfaction`? | number | 0 to 100 |
| `link_rx_rate_kbps`? / `link_tx_rate_kbps`? | number | Negotiated link speed, not throughput |
| `live_rx_bytes_per_sec`? / `live_tx_bytes_per_sec`? | number | Current throughput |
| `rx_bytes`? / `tx_bytes`? | number | Counters |
| `uptime`? | number | Seconds |
| `last_seen`? | number | Unix seconds |

### `GET /api/plugins/unifi/devices`

Query parameters (all optional): `type` (`all`, `ap`, `switch`, `gateway`,
default `all`), `search`, `limit`, as for clients.

```json
{
  "success": true,
  "result": [
    { "name": "AP Salon", "model": "U6LR", "type": "uap", "mac": "aa:bb:cc:00:00:01", "ip": "192.168.1.5",
      "state": "connected", "version": "6.6.77", "upgradable": true, "upgrade_to_firmware": "6.7.31", "uptime": 864000, "clients": 12, "satisfaction": 97,
      "cpu_pct": 4.1, "mem_pct": 38.2,
      "uplink": { "type": "wire", "mac": "aa:bb:cc:00:00:02", "port": 3, "speed": 1000 },
      "radios": [{ "radio": "na", "channel": 36, "clients": 9, "satisfaction": 98 }],
      "last_seen": 1760043600 }
  ],
  "total": 1
}
```

| Field | Type | Description |
|---|---|---|
| `name` / `model` / `type` | string | `type`: `uap` (AP), `usw` (switch), `ugw`/`udm`/`uxg` (gateway) |
| `mac` / `ip`? | string | Identity |
| `state` | string or number | `connected`, or the raw UniFi state code |
| `version`? | string | Firmware |
| `upgradable` | boolean or null | `true` when a firmware update is available, `false` when up to date, `null` when the controller does not report it |
| `upgrade_to_firmware` | string or null | Target firmware version, `null` when there is none or it is unknown |
| `lan_ip`? | string or null | Gateways only: address on the main LAN (`ip` is often the WAN address). `null` when not reported |
| `uptime`? / `clients`? / `satisfaction`? | number | |
| `cpu_pct`? / `mem_pct`? | number | Health, percent |
| `temperature`? | number | °C, highest sensor reading (gateways, some switches) |
| `uplink`? | object | `{ type, mac, port, speed }` |
| `ports`? | object | `{ total, up }` (switches, gateways) |
| `radios`? | array | `[{ radio, channel, clients, satisfaction }]` (APs) |
| `last_seen`? | number | Unix seconds |

When UniFi is not configured or unreachable:
`503 { "success": false, "error": { "code": "UNIFI_UNAVAILABLE", ... } }`.
Raw controller objects are never exposed through this API.

### `GET /api/plugins/unifi/system`

No query parameters. Controller information from `stat/sysinfo` (UniFi
Network application) plus the health of the first gateway found.

```json
{
  "success": true,
  "result": {
    "name": "UniFi Network", "hostname": "udm", "version": "9.4.19", "previous_version": "9.3.45",
    "update_available": true, "update_downloaded": false, "console_version": "4.3.6", "uptime": 864000,
    "gateway": { "name": "UDM Pro", "model": "UDMPRO", "type": "udm", "version": "4.3.6",
      "upgradable": false, "upgrade_to_firmware": null, "lan_ip": "192.168.32.1", "uptime": 864000,
      "cpu_pct": 12.4, "mem_pct": 61.2, "mem_total": 4124114944, "mem_used": 2523959296, "temperature": 58 }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `name`? / `hostname`? | string | Controller display name and hostname |
| `version`? | string | UniFi Network application version |
| `previous_version`? | string | Version before the last update |
| `update_available` | boolean or null | `true` when a UniFi Network update is available, `null` when not reported |
| `update_downloaded` | boolean or null | Update already downloaded |
| `console_version`? | string | UniFi OS console version (UniFi OS consoles only) |
| `uptime`? | number | Controller uptime, seconds |
| `gateway` | object or null | `null` without a UniFi gateway (software controller) |
| `gateway.version` / `upgradable` / `upgrade_to_firmware` | | Gateway firmware and pending update, same rules as `/devices` |
| `gateway.lan_ip`? | string | Address on the main LAN |
| `gateway.uptime`? / `cpu_pct`? / `mem_pct`? / `temperature`? | number | Seconds, percent, percent, °C |
| `gateway.mem_total`? / `mem_used`? | number | Bytes |

Same `503 UNIFI_UNAVAILABLE` as above when UniFi is not configured or
unreachable. With the cloud Site Manager connection most fields are `null`.
