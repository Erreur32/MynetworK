export type SfpLevel = 'ok' | 'warn' | 'crit';

export interface SfpInfo {
    port?: number;
    name?: string;
    kind: 'electrical' | 'optical';
    vendor?: string;
    part?: string;
    serial?: string;
    compliance?: string;
    temperature?: number;
    voltage?: number;
    current?: number;
    // Optical modules only: a copper module reports placeholder power values.
    rx?: number;
    tx?: number;
    rxLos: boolean;
    txFault: boolean;
    tempLevel: SfpLevel;
    signalLevel: SfpLevel;
    level: SfpLevel;
}

export const TEMP_WARN_C: number;
export const TEMP_CRIT_C: number;
export const RX_WARN_DBM: number;
export const RX_CRIT_DBM: number;
export function sfpTempLevel(celsius: number | undefined): SfpLevel;
export function sfpRxLevel(dbm: number | undefined): SfpLevel;
export function readSfp(row: unknown): SfpInfo | null;
export function readSfpModules(device: unknown): SfpInfo[];
export function sfpDetailItems(sfp: SfpInfo, language?: string): Array<{ label: string; value: string; level: SfpLevel }>;
