export interface MnDevice {
    id: string;
    name: string;
    model: string;
    type: 'switch' | 'gateway' | 'access_point';
    modelKey: string | null;
    exact: boolean;
    portCount: number;
    ports: number[];
    uplinkPort: number | null;
}
export function classifyUnifiDevice(device: unknown): MnDevice['type'] | null;
export function mnDeviceId(device: unknown): string;
export function createMynetworkHass(
    unifiDevices: unknown[],
    language?: string
): { hass: Record<string, unknown>; devices: MnDevice[] };
