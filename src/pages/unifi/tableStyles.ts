// Shared by the UniFi Clients and Switch tables so their rows have the same zebra.
export const zebraRowClass = (index: number): string =>
    `transition-colors hover:bg-white/10 ${index % 2 === 0 ? 'bg-unifi-card/30' : 'bg-white/[0.06]'}`;
