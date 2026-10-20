import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePluginStore } from '../../stores/pluginStore';
import { createMynetworkHass, mnDeviceId } from '../../vendor/unifi-device-card/mynetwork-adapter';
import { DeviceCard } from './DeviceCard';

interface SwitchPortsCardProps {
    switchMac?: string;
    clientPort: number;
    // Shown while the device list is not available or the switch is not in it.
    fallback?: React.ReactNode;
}

const macKey = (mac: unknown): string => String(mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');

// Compact front-panel card of the switch a wired client is plugged into, the client's port selected.
// The caller shows the switch name, so the card title is hidden (model and firmware stay in its subtitle).
// One snapshot of the UniFi stats, no live polling (the Overview cards do that).
export const SwitchPortsCard: React.FC<SwitchPortsCardProps> = ({ switchMac, clientPort, fallback = null }) => {
    const { i18n } = useTranslation();
    const unifiDevices = usePluginStore((s) => s.pluginStats['unifi']?.devices) as any[] | undefined;
    const fetchPluginStats = usePluginStore((s) => s.fetchPluginStats);
    const [cardReady, setCardReady] = useState(false);

    useEffect(() => {
        if (!unifiDevices) fetchPluginStats('unifi');
    }, [unifiDevices, fetchPluginStats]);

    useEffect(() => {
        let cancelled = false;
        import('../../vendor/unifi-device-card/unifi-device-card.js')
            .then(() => { if (!cancelled) setCardReady(true); })
            .catch((error: unknown) => console.error('Failed to load the device card component', error));
        return () => { cancelled = true; };
    }, []);

    const { hass, devices } = useMemo(
        () => createMynetworkHass(unifiDevices ?? [], i18n.language?.slice(0, 2) || 'en'),
        [unifiDevices, i18n.language]
    );
    const deviceId = useMemo(() => {
        const raw = (unifiDevices ?? []).find((d) => macKey(d.mac) === macKey(switchMac));
        const id = raw ? mnDeviceId(raw) : null;
        return id && devices.some((d) => d.id === id) ? id : null;
    }, [unifiDevices, devices, switchMac]);

    if (!deviceId || !cardReady) return <>{fallback}</>;
    return <DeviceCard deviceId={deviceId} hass={hass} uplinkPort={clientPort} compact />;
};
