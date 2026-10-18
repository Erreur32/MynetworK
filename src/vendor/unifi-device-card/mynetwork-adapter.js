// MyNetwork adapter (not part of the upstream project).
//
// Replaces the Home Assistant entity discovery layer: UniFi controller devices
// (as returned by the MyNetwork UniFi plugin) are turned into the device
// context the card expects, plus a minimal synthetic `hass.states` table that
// the existing port/telemetry rendering code reads from. The card stays
// read-only: commands are rejected.
import { applyPortsPerRowOverride, getDeviceLayout, MODEL_REGISTRY, resolveModelKey } from "./model-registry.js";
import { buildNormalizedDeviceIdentity } from "./identity.js";
import { mergePortsWithLayout, mergeSpecialsWithLayout } from "./helpers.js";

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

  const rows = d.port_table || d.eth_port_table || [];
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
    numberedPorts: mergePortsWithLayout(layout, discovered),
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
