/**
 * Search History Modal
 * Affiche l'historique des recherches avec les mêmes options (exact, case, actif)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { X, History, Search, Trash2 } from 'lucide-react';

export interface SearchHistoryEntry {
    query: string;
    timestamp: number;
    caseSensitive: boolean;
    showOnlyActive: boolean;
}

interface SearchHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    history: SearchHistoryEntry[];
    onSelect: (entry: SearchHistoryEntry) => void;
    onDelete?: (index: number) => void;
    onClearAll?: () => void;
}

const MAX_VISIBLE = 50;

export const SearchHistoryModal: React.FC<SearchHistoryModalProps> = ({
    isOpen,
    onClose,
    history,
    onSelect,
    onDelete,
    onClearAll
}) => {
    const { t, i18n } = useTranslation();
    if (!isOpen) return null;

    const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB';
    const formatDate = (ts: number) => {
        const d = new Date(ts);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        if (sameDay) {
            return d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
    };

    const displayed = history.slice(0, MAX_VISIBLE);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] border border-gray-700 rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <History size={22} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">{t('search.historyTitle')}</h2>
                            <p className="text-xs text-gray-400 mt-0.5">{t('search.historyModalSubtitle')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {onClearAll && history.length > 0 && (
                            <button
                                onClick={onClearAll}
                                className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 rounded-lg transition-colors flex items-center gap-1.5"
                                title={t('search.clearAllHistory')}
                            >
                                <Trash2 size={14} />
                                {t('search.clearAll')}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                            aria-label={t('search.closeLabel')}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                    {displayed.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <Search size={40} className="mx-auto mb-3 opacity-50" />
                            <p>{t('search.noHistory')}</p>
                        </div>
                    ) : (
                        <ul className="space-y-1">
                            {displayed.map((entry, index) => (
                                <li key={`${entry.timestamp}-${entry.query}-${index}`}>
                                    <div className="group flex items-center gap-2 rounded-lg border border-gray-800 hover:border-gray-600 hover:bg-gray-800/50 transition-colors">
                                        <button
                                            type="button"
                                            onClick={() => onSelect(entry)}
                                            className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left min-w-0"
                                        >
                                            <Search size={16} className="text-gray-500 flex-shrink-0" />
                                            <span className="font-mono text-sm text-cyan-300 truncate" title={entry.query}>
                                                {entry.query}
                                            </span>
                                            <span className="text-xs text-gray-500 flex-shrink-0 ml-auto">
                                                {formatDate(entry.timestamp)}
                                            </span>
                                        </button>
                                        {onDelete && (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onDelete(index); }}
                                                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                                title={t('search.delete')}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-0.5 ml-9 mb-1">
                                        {entry.caseSensitive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">{t('search.caseBadge')}</span>}
                                        {entry.showOnlyActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">{t('search.activeBadge')}</span>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};
