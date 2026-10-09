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
   uses the real TCP peer address, not `X-Forwarded-For`. Otherwise the
   response is `403 API_TOKEN_NETWORK`.
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
| `GET /api/topology` | MyNetwork | Last computed topology snapshot |
| `GET /api/plugins/unifi/clients` | UniFi | Connected clients, compact summary |
| `GET /api/plugins/unifi/devices` | UniFi | APs, switches, gateways, compact summary |

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

Freebox WiFi stations currently associated, relayed from the Freebox OS API
(`/wifi/stations/`).

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
      "state": "connected", "version": "6.6.77", "uptime": 864000, "clients": 12, "satisfaction": 97,
      "cpu_pct": "4.1", "mem_pct": "38.2",
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
| `upgradable`? | boolean | Present (true) only when an update is available |
| `uptime`? / `clients`? / `satisfaction`? | number | |
| `cpu_pct`? / `mem_pct`? / `temperature`? | | Health |
| `uplink`? | object | `{ type, mac, port, speed }` |
| `ports`? | object | `{ total, up }` (switches, gateways) |
| `radios`? | array | `[{ radio, channel, clients, satisfaction }]` (APs) |
| `last_seen`? | number | Unix seconds |

When UniFi is not configured or unreachable:
`503 { "success": false, "error": { "code": "UNIFI_UNAVAILABLE", ... } }`.
Raw controller objects are never exposed through this API.
