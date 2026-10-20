// MyNetwork SFP helper (not part of the upstream project).
//
// Reads the transceiver data the controller attaches to a port (sfp_* fields) and
// grades it. Shared by the card's port detail and the React device views.

const num = (v) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

// A transceiver reports its own optical power even when it is a copper (10GBASE-T) one, where the
// value is a placeholder: the signal is only trusted for optical modules.
const COPPER = /(^|[-_ ])T$|BASE-?T\b|RJ-?45|COPPER/i;

export const TEMP_WARN_C = 70;
export const TEMP_CRIT_C = 85;
// Receive power (dBm) of an optical module, from a typical 10G SR / LR sensitivity.
export const RX_WARN_DBM = -14;
export const RX_CRIT_DBM = -18;

const worst = (...levels) => (levels.includes("crit") ? "crit" : levels.includes("warn") ? "warn" : "ok");

export function sfpTempLevel(celsius) {
  if (celsius == null) return "ok";
  return celsius >= TEMP_CRIT_C ? "crit" : celsius >= TEMP_WARN_C ? "warn" : "ok";
}

export function sfpRxLevel(dbm) {
  if (dbm == null) return "ok";
  return dbm < RX_CRIT_DBM ? "crit" : dbm < RX_WARN_DBM ? "warn" : "ok";
}

/**
 * Normalised view of the SFP module of a port row, or null when no module is plugged in.
 * Accepts numbers or numeric strings (switches send strings).
 */
export function readSfp(row) {
  if (!row || row.sfp_found !== true) return null;
  const part = text(row.sfp_part);
  const compliance = text(row.sfp_compliance);
  const electrical = COPPER.test(`${part ?? ""}`) || COPPER.test(`${compliance ?? ""}`);
  const temperature = num(row.sfp_temperature);
  const rxLos = row.sfp_rx_los === true || row.sfp_rxfault === true;
  const txFault = row.sfp_tx_fault === true || row.sfp_txfault === true;
  const rx = electrical ? undefined : num(row.sfp_rxpower);
  const tx = electrical ? undefined : num(row.sfp_txpower);

  const tempLevel = sfpTempLevel(temperature);
  const signalLevel = rxLos || txFault ? "crit" : sfpRxLevel(rx);
  return {
    port: num(row.port_idx),
    name: text(row.name),
    kind: electrical ? "electrical" : "optical",
    vendor: text(row.sfp_vendor),
    part,
    serial: text(row.sfp_serial),
    compliance,
    temperature,
    voltage: num(row.sfp_voltage),
    current: num(row.sfp_current),
    rx,
    tx,
    rxLos,
    txFault,
    tempLevel,
    signalLevel,
    level: worst(tempLevel, signalLevel),
  };
}

/** Every module found in a device's port table. */
export function readSfpModules(device) {
  const rows = [device?.port_table, device?.eth_port_table, device?.ports].find((r) => Array.isArray(r) && r.length) || [];
  return rows.map((row) => readSfp(row)).filter(Boolean);
}

const LABELS = {
  en: { electrical: "Electrical", optical: "Optical", module: "Module", temperature: "Temperature", signal: "Signal", fault: "Fault", los: "No signal (LOS)", txFault: "TX fault" },
  fr: { electrical: "Électrique", optical: "Optique", module: "Module", temperature: "Température", signal: "Signal", fault: "Défaut", los: "Pas de signal (LOS)", txFault: "Défaut TX" },
};

/** Rows for the card's port detail: { label, value, level }. */
export function sfpDetailItems(sfp, language = "en") {
  const l = LABELS[String(language).slice(0, 2)] || LABELS.en;
  const items = [{ label: l.module, value: `${l[sfp.kind]}${sfp.part ? ` · ${sfp.part}` : ""}`, level: "ok" }];
  if (sfp.temperature != null) items.push({ label: l.temperature, value: `${sfp.temperature.toFixed(1)} °C`, level: sfp.tempLevel });
  if (sfp.rx != null) items.push({ label: "RX", value: `${sfp.rx.toFixed(2)} dBm`, level: sfp.rxLos ? "crit" : sfpRxLevel(sfp.rx) });
  if (sfp.tx != null) items.push({ label: "TX", value: `${sfp.tx.toFixed(2)} dBm`, level: sfp.txFault ? "crit" : "ok" });
  if (sfp.rxLos) items.push({ label: l.fault, value: l.los, level: "crit" });
  if (sfp.txFault) items.push({ label: l.fault, value: l.txFault, level: "crit" });
  return items;
}
