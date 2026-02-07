/**
 * Language switcher: EN / FR. Persists choice in localStorage (key: mynetwork_lang).
 * Default app language is English.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

export const LanguageSwitcher: React.FC = () => {
    const { i18n, t } = useTranslation();
    const current = i18n.language?.startsWith('fr') ? 'fr' : 'en';

    return (
        <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-[#1a1a1a] p-0.5">
            <button
                type="button"
                onClick={() => i18n.changeLanguage('en')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${current === 'en' ? 'bg-accent-primary/20 text-accent-primary' : 'text-gray-400 hover:text-gray-200'}`}
                title="English"
            >
                EN
            </button>
            <button
                type="button"
                onClick={() => i18n.changeLanguage('fr')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${current === 'fr' ? 'bg-accent-primary/20 text-accent-primary' : 'text-gray-400 hover:text-gray-200'}`}
                title="Français"
            >
                FR
            </button>
        </div>
    );
};
