/**
 * Search Options Info Modal
 * 
 * Modal explaining search options with examples
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, Info, CheckCircle, Search } from 'lucide-react';

interface SearchOptionsInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SearchOptionsInfoModal: React.FC<SearchOptionsInfoModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] border border-gray-700 rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-cyan-500/20 rounded-lg">
                            <Info size={20} className="text-cyan-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">{t('search.optionsModalTitle')}</h2>
                            <p className="text-xs text-gray-400 mt-0.5">{t('search.optionsModalSubtitle')}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-1.5 hover:bg-gray-800 rounded-lg"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {/* Two columns layout for large screens */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/50 rounded-lg">
                                        <CheckCircle size={14} className="text-emerald-400" />
                                        <span className="text-xs font-medium text-emerald-400">{t('search.activeIp')}</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-300 ml-1">
                                    {t('search.ipActiveDescription')}
                                </p>
                            </div>

                                {/* removed: Correspondance exacte - feature retirée */}
                                <p className="hidden">{t('search.exactMatchRemovedDesc')}</p>
                        </div>

                        <div className="space-y-4">
                            {/* Sensible à la casse */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-2.5 py-1 bg-purple-500/20 border border-purple-500/50 rounded-lg">
                                        <Search size={14} className="text-purple-400" />
                                        <span className="text-xs font-medium text-purple-400">{t('search.caseSensitive')}</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-300 ml-1">
                                    {t('search.caseSensitiveDescription')}
                                </p>
                            </div>

                            {/* Ping IP locales */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded-lg">
                                        <CheckCircle size={14} className="text-cyan-400" />
                                        <span className="text-xs font-medium text-cyan-400">{t('search.pingIpsTitle')}</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-300 ml-1">
                                    {t('search.pingDescription')}
                                </p>
                                <div className="ml-1 p-2 bg-gray-900/50 rounded border border-gray-800 text-xs text-gray-400">
                                    <p className="font-medium text-gray-300 mb-1">{t('search.allowedIps')}</p>
                                    <p>{t('search.notAllowedIps')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Syntaxe recherche : IP, wildcard *, plage, MAC, texte */}
                    <div className="pt-4 mt-4 border-t border-gray-800">
                        <h3 className="text-xs font-semibold text-white mb-2 flex items-center gap-2">
                            <Search size={14} className="text-cyan-400" />
                            {t('search.syntaxTitle')}
                        </h3>
                        <div className="space-y-3 text-xs">
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">{t('search.exactIp')}</p>
                                <p className="text-gray-400 font-mono">192.168.32.1</p>
                                <p className="text-gray-500 mt-0.5">{t('search.exactIpDesc')}</p>
                            </div>
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">{t('search.wildcardIp')}</p>
                                <p className="text-gray-400 font-mono">192.168.32.*</p>
                                <p className="text-gray-400 font-mono">192.168.32.1*</p>
                                <p className="text-gray-500 mt-0.5">{t('search.wildcardIpDesc')}</p>
                            </div>
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">{t('search.rangeIp')}</p>
                                <p className="text-gray-400 font-mono">192.168.32.1-32</p>
                                <p className="text-gray-400 font-mono">192.168.32.1-192.168.32.50</p>
                                <p className="text-gray-500 mt-0.5">{t('search.rangeIpDesc')}</p>
                            </div>
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">{t('search.macSearch')}</p>
                                <p className="text-gray-400 font-mono">AA:BB:CC:DD:EE:FF</p>
                                <p className="text-gray-400 font-mono">AA:BB:*</p>
                                <p className="text-gray-500 mt-0.5">{t('search.macSearchDesc')}</p>
                            </div>
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">{t('search.textSearch')}</p>
                                <p className="text-gray-400 font-mono">tapo</p>
                                <p className="text-gray-400 font-mono">Freebox</p>
                                <p className="text-gray-500 mt-0.5">{t('search.textSearchDesc')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-gray-800">
                        <h3 className="text-xs font-semibold text-white mb-1.5 flex items-center gap-2">
                            <Info size={14} className="text-cyan-400" />
                            {t('search.tipsTitle')}
                        </h3>
                        <div className="space-y-2 text-xs text-gray-300 ml-1">
                            <p>• {t('search.tipsDetail')} : <span className="text-cyan-400">{t('search.exactIp')}</span></p>
                            <p>• {t('search.tipsFilters')}</p>
                            <p>• {t('search.tipsSort')}</p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end p-4 border-t border-gray-800">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-xs font-medium"
                    >
                        {t('search.understood')}
                    </button>
                </div>
            </div>
        </div>
    );
};

