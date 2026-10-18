// MyNetwork adapter (not part of the upstream project).
//
// Replaces the Home Assistant entity discovery layer: UniFi controller devices
// (as returned by the MyNetwork UniFi plugin) are turned into the device
// context the card expects, plus a minimal synthetic `hass.states` table that
// the existing port/telemetry rendering code reads from. The card stays
// read-only: commands are rejected.
import { applyPortsPerRowOverride, getDeviceLayout, MODEL_REGISTRY, resolveModelKey } from "./model-registry.js";
import { buildNormalizedDeviceIdentity } from "./identity.js";
import { mergeSpecialsWithLayout } from "./helpers.js";

export const MN_DEVICE_PREFIX = "mn:";

const SWITCH_TYPES = new Set(["usw"]);
const GATEWAY_TYPES = new Set(["ugw", "udm", "uxg", "uck"]);
const AP_TYPES = new Set(["uap", "u6", "u7"]);

export function classifyUnifiDevice(d) {
  const type = String(d?.type || "").toLowerCase();
  if (GATEWAY_TYPES.has(type)) return "gateway";
  if (SWITCH_TYPES.has(type)) return "switch";
  if (AP_TYPES.has(type)) return "access_point";
  return null;
}

// First non-empty port array the controller provides.
const portRowsOf = (d) =>
  [d.port_table, d.eth_port_table, d.ports].find((rows) => Array.isArray(rows) && rows.length) || [];

const macKey = (mac) => String(mac || "").toLowerCase().replace(/[^0-9a-f]/g, "");

export function mnDeviceId(d) {
  return `${MN_DEVICE_PREFIX}${macKey(d.mac)}`;
}

const num = (v) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function putState(states, entityId, state, attributes = {}) {
  states[entityId] = { entity_id: entityId, state: String(state), attributes };
  return entityId;
}

function onOff(value) {
  return value ? "on" : "off";
}

// Number of the port a UniFi port_table row describes.
function portNumber(port, index) {
  return num(port.port_idx) ?? num(port.portnum) ?? index + 1;
}

// MAC addresses of the LLDP neighbours seen on a port row.
function neighbourMacs(row) {
  return [].concat(row.lldp_table || []).map((n) => macKey(n?.chassis_id)).filter(Boolean);
}

// The port a switch reaches the network through, or, for a gateway, the LAN port
// that leads to the rest of the network. Sources, in order:
//  1. the flag / index the controller sets on the device itself
//  2. other devices that name this one as their uplink (uplink_mac + remote port)
//  3. LLDP: the port whose neighbour is the uplink device (switch) or a switch (gateway)
function detectUplinkPort(d, rows, all, type) {
  if (type === "switch") {
    const flagged = rows.findIndex((row) => row.is_uplink === true);
    if (flagged >= 0) return portNumber(rows[flagged], flagged);
    const fromUplink = num(d.uplink?.port_idx);
    if (fromUplink != null) return fromUplink;
  }

  const self = macKey(d.mac);
  const others = all.filter((o) => o !== d && o.mac);

  if (type === "gateway") {
    const child = others.find((o) => macKey(o.uplink?.uplink_mac) === self && num(o.uplink?.uplink_remote_port) != null);
    if (child) return num(child.uplink.uplink_remote_port);
  }

  const wanted = type === "switch" && d.uplink?.uplink_mac
    ? new Set([macKey(d.uplink.uplink_mac)])
    : new Set(others
      .filter((o) => (type === "switch" ? classifyUnifiDevice(o) === "gateway" : classifyUnifiDevice(o) === "switch"))
      .map((o) => macKey(o.mac)));
  const neighbour = rows.findIndex((row) => neighbourMacs(row).some((m) => wanted.has(m)));
  return neighbour >= 0 ? portNumber(rows[neighbour], neighbour) : null;
}

// What the detection looks at, shown in the card's diagnostic block.
function uplinkDiagnostic(d, rows, all) {
  const brief = (o) => (o && typeof o === "object"
    ? { name: o.name, ifname: o.ifname, port_idx: o.port_idx, up: o.up, speed: o.speed, type: o.type }
    : null);
  return {
    model: d.model,
    keys: Object.keys(d),
    lengths: { port_table: d.port_table?.length, eth_port_table: d.eth_port_table?.length, ports: d.ports?.length, num_port: d.num_port },
    // addresses are left out on purpose: only what identifies a port
    wan: [d.wan1, d.wan2].map(brief),
    uplink: d.uplink ?? null,
    children: all
      .filter((o) => o !== d && macKey(o.uplink?.uplink_mac) === macKey(d.mac))
      .map((o) => ({ name: o.name, remote_port: o.uplink?.uplink_remote_port })),
    ports: rows.map((row, i) => ({
      port: portNumber(row, i),
      name: row.name,
      ifname: row.ifname,
      media: row.media,
      up: row.up,
      speed: row.speed,
      is_uplink: row.is_uplink,
      lldp: [].concat(row.lldp_table || []).map((n) => n?.chassis_id),
    })),
  };
}

function buildPortEntities(states, prefix, row, index) {
  const n = portNumber(row, index);
  const id = (suffix) => `${prefix}_p${n}_${suffix}`;
  const up = row.up === true;
  const speed = up ? num(row.speed) ?? 0 : 0;
  const poeCapable = row.port_poe === true || num(row.poe_power) != null;
  const poePower = num(row.poe_power) ?? 0;

  const port = {
    key: `port-${n}`,
    port: n,
    label: String(n),
    kind: "numbered",
    link_entity: putState(states, `binary_sensor.${id("link")}`, onOff(up)),
    speed_entity: putState(states, `sensor.${id("speed")}`, speed, { unit_of_measurement: "Mbit/s" }),
    poe_switch_entity: null,
    poe_power_entity: null,
    port_switch_entity: null,
    power_cycle_entity: null,
    rx_entity: putState(states, `sensor.${id("rx")}`, num(row["rx_bytes-r"]) ?? 0, { unit_of_measurement: "B/s" }),
    tx_entity: putState(states, `sensor.${id("tx")}`, num(row["tx_bytes-r"]) ?? 0, { unit_of_measurement: "B/s" }),
    port_label: row.name || null,
    media: row.media || undefined,
    raw_entities: [],
  };
  if (poeCapable) {
    port.poe_switch_entity = putState(states, `switch.${id("poe")}`, onOff(row.poe_enable === true || poePower > 0));
    port.poe_power_entity = putState(states, `sensor.${id("poe_power")}`, poePower, { unit_of_measurement: "W" });
  }
  return port;
}

function buildTelemetry(states, prefix, d) {
  const stats = d["system-stats"] || {};
  const cpu = num(stats.cpu);
  const mem = num(stats.mem);
  const temp = num(d.general_temperature) ?? num(stats.temps?.CPU);
  const entity = (key, value, unit) =>
    value == null ? null : putState(states, `sensor.${prefix}_${key}`, value, { unit_of_measurement: unit });
  return {
    cpu_utilization_entity: entity("cpu", cpu, "%"),
    memory_utilization_entity: entity("memory", mem, "%"),
    temperature_entity: entity("temperature", temp, "°C"),
    cpu_temperature_entity: null,
  };
}

function resolveUplink(d, all) {
  const mac = d.uplink?.uplink_mac;
  if (!mac) return null;
  const via = all.find((o) => macKey(o.mac) === macKey(mac));
  return {
    via_mac: mac,
    via_device_name: via?.name || via?.model || null,
    remote_port: num(d.uplink?.uplink_remote_port),
    type: d.uplink?.type || null,
  };
}

// Keeps the rows the model's front panel can show (numbered rows and special slots).
function portsInLayout(layout, ports) {
  const shown = new Set([
    ...(layout?.rows || []).flat(),
    ...(layout?.specialSlots || []).flatMap((slot) => [slot.port, slot.apiPort]),
  ].filter((n) => n != null));
  return shown.size ? ports.filter((p) => shown.has(p.port)) : ports;
}

function buildContext(states, d, all, cardConfig) {
  const type = classifyUnifiDevice(d);
  if (!type) return null;

  const prefix = `mn_${macKey(d.mac)}`;
  const device = {
    id: mnDeviceId(d),
    name: d.name || d.model,
    model_id: d.model,
    model: d.model_name || d.shortname || d.model,
    hw_version: d.hw_version,
    manufacturer: "Ubiquiti",
  };

  const rows = portRowsOf(d);
  const discovered = rows.map((row, i) => buildPortEntities(states, prefix, row, i));

  let layout = getDeviceLayout(device, discovered);
  const perRow = Number.parseInt(cardConfig?.ports_per_row, 10);
  if (Number.isFinite(perRow) && perRow > 0) layout = applyPortsPerRowOverride(layout, perRow);
  else if (type === "switch" && !(layout?.rows?.length > 1)) layout = applyPortsPerRowOverride(layout, 8);

  const online = d.state === 1 || d.state === "1" || d.status === "online" || d.active === true;
  const uptime = num(d.uptime);
  const clients = num(d.num_sta) ?? num(d["user-num_sta"]);
  const telemetry = buildTelemetry(states, prefix, d);
  const statusEntity = putState(states, `sensor.${prefix}_status`, online ? "online" : "offline");

  return {
    device,
    identity: buildNormalizedDeviceIdentity(device),
    capabilities: {},
    entities: [],
    all_entities: [],
    telemetry_entities: [],
    type,
    layout,
    specialPorts: mergeSpecialsWithLayout(layout, [], discovered),
    // The card merges these with the layout itself (numbered rows and special slots), so they must
    // stay unmerged and still include the special ports' rows.
    numberedPorts: portsInLayout(layout, discovered),
    name: device.name,
    model: device.model,
    manufacturer: "Ubiquiti",
    firmware: d.version || "",
    online_entity: putState(states, `binary_sensor.${prefix}_online`, onOff(online)),
    status_entity: statusEntity,
    ap_status_entity: statusEntity,
    uptime_entity: uptime == null ? null : putState(states, `sensor.${prefix}_uptime`, uptime, { unit_of_measurement: "s" }),
    clients_entity: clients == null ? null : putState(states, `sensor.${prefix}_clients`, clients),
    led_switch_entity: null,
    led_color_entity: null,
    reboot_entity: null,
    ap_uplink: type === "access_point" ? resolveUplink(d, all) : null,
    outlet_entities: [],
    ...telemetry,
    // Switches and gateways only: an AP's uplink is already shown as a device link.
    uplink_port: type === "access_point" ? null : detectUplinkPort(d, rows, all, type),
    mynetwork: true,
    model_key: resolveModelKey(device),
  };
}

/**
 * Builds the object the card receives as `hass` from MyNetwork UniFi devices.
 * Returns { hass, devices } where `devices` lists the displayable ones with
 * the id to give the card as `device_id`.
 */
export function createMynetworkHass(unifiDevices, language = "en") {
  const states = {};
  const all = Array.isArray(unifiDevices) ? unifiDevices : [];
  // Contexts are built eagerly so `states` is complete on every poll, whichever
  // device the card asks for. Entity ids are stable, so a context built on an
  // earlier poll keeps working against a newer `states` table.
  const contexts = new Map();
  const devices = [];
  for (const d of all) {
    const type = classifyUnifiDevice(d);
    if (!type || !d.mac) continue;
    const ctx = buildContext(states, d, all, null);
    if (!ctx) continue;
    contexts.set(mnDeviceId(d), ctx);
    // exact = a dedicated front panel exists in the registry, otherwise the
    // card draws a generic layout from the port count.
    const modelKey = ctx.model_key || null;
    devices.push({
      id: mnDeviceId(d),
      name: d.name || d.model,
      model: d.model,
      type,
      modelKey,
      exact: !!(modelKey && MODEL_REGISTRY[modelKey]),
      portCount: ctx.numberedPorts.length + ctx.specialPorts.length,
      ports: [...ctx.numberedPorts, ...ctx.specialPorts]
        .map((p) => p.port)
        .filter((n) => Number.isInteger(n))
        .sort((a, b) => a - b),
      uplinkPort: ctx.uplink_port,
      uplinkDebug: JSON.stringify(uplinkDiagnostic(d, portRowsOf(d), all), null, 1),
    });
  }

  const hass = {
    states,
    language,
    locale: { language },
    mynetwork: { buildContext: async (deviceId) => contexts.get(deviceId) ?? null },
    callService: async () => {
      throw new Error("MyNetwork: read-only preview");
    },
    callWS: async () => null,
  };
  return { hass, devices };
}
