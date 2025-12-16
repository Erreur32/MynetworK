import React from 'react';
import { AlertTriangle, Server, Wifi, HardDrive } from 'lucide-react';
import { useCapabilitiesStore } from '../../stores/capabilitiesStore';

type FeatureType = 'vm' | 'wifi6ghz' | 'storage' | 'generic';

interface UnsupportedFeatureProps {
  feature: string;
  featureType?: FeatureType;
  description?: string;
  showModelName?: boolean;
  className?: string;
}

const featureIcons: Record<FeatureType, React.ElementType> = {
  vm: Server,
  wifi6ghz: Wifi,
  storage: HardDrive,
  generic: AlertTriangle
};

export const UnsupportedFeature: React.FC<UnsupportedFeatureProps> = ({
  feature,
  featureType = 'generic',
  description,
  showModelName = true,
  className = ''
}) => {
  const { capabilities, getModelName } = useCapabilitiesStore();
  const modelName = getModelName();

  const Icon = featureIcons[featureType];

  const defaultDescriptions: Record<FeatureType, string> = {
    vm: 'Les machines virtuelles ne sont pas disponibles sur ce modele.',
    wifi6ghz: 'Le WiFi 6GHz (6E) n\'est pas supporte sur ce modele.',
    storage: 'Le stockage interne n\'est pas disponible sur ce modele.',
    generic: 'Cette fonctionnalite n\'est pas disponible sur ce modele.'
  };

  const displayDescription = description || defaultDescriptions[featureType];

  return (
    <div className={`flex flex-col items-center justify-center py-8 px-4 text-center ${className}`}>
      <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
        <Icon size={32} className="text-amber-500" />
      </div>
      <h3 className="text-lg font-medium text-gray-300 mb-2">
        {feature} non disponible
      </h3>
      <p className="text-sm text-gray-500 max-w-sm">
        {displayDescription}
      </p>
      {showModelName && capabilities && (
        <p className="text-xs text-gray-600 mt-3">
          Modele detecte : <span className="text-gray-400">{modelName}</span>
        </p>
      )}
    </div>
  );
};

// Compact version for inline use
interface UnsupportedBadgeProps {
  feature: string;
  className?: string;
}

export const UnsupportedBadge: React.FC<UnsupportedBadgeProps> = ({
  feature,
  className = ''
}) => {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20 ${className}`}>
      <AlertTriangle size={14} className="text-amber-500" />
      <span className="text-xs text-amber-400">{feature} non supporte</span>
    </div>
  );
};
