import React from 'react';
import { PluginSummaryCard } from '../../components/widgets/PluginSummaryCard';
import { NetworkEventsWidget } from '../../components/widgets/NetworkEventsWidget';

interface AnalyseTabProps {
    onNavigateToSearch?: (ip: string) => void;
}

export const AnalyseTab: React.FC<AnalyseTabProps> = ({ onNavigateToSearch }) => {
    return (
        <div className="col-span-full space-y-6">
            <PluginSummaryCard
                pluginId="unifi"
                onViewDetails={undefined}
                hideController={true}
                cardClassName="bg-unifi-card border border-gray-800 rounded-xl"
                showDeviceTables={true}
                onNavigateToSearch={onNavigateToSearch}
            />
            <NetworkEventsWidget
                twoColumns={true}
                cardClassName="bg-unifi-card border border-gray-800 rounded-xl"
                onNavigateToSearch={onNavigateToSearch}
            />
        </div>
    );
};
