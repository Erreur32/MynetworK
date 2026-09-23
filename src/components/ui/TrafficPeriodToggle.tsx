import React from 'react';

export type TrafficPeriod = 'live' | 'today' | 'alltime';

interface TrafficPeriodToggleProps {
    period: TrafficPeriod;
    onChange: (period: TrafficPeriod) => void;
    labels: Readonly<{ live: string; today: string; alltime: string }>;
}

const OPTIONS: readonly TrafficPeriod[] = ['live', 'today', 'alltime'];

/** Live/Today/All-time pill toggle, shared by the home dashboard and unifi/traffic "Volume de données" sections. */
export const TrafficPeriodToggle: React.FC<TrafficPeriodToggleProps> = ({ period, onChange, labels }) => (
    <span className="inline-flex items-center gap-0.5 bg-[#1b1b1b] rounded-full p-0.5 border border-gray-800 text-[11px]">
        {OPTIONS.map((option) => (
            <button
                key={option}
                type="button"
                className={`px-2 py-0.5 rounded-full ${period === option ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                onClick={() => onChange(option)}
            >
                {labels[option]}
            </button>
        ))}
    </span>
);
