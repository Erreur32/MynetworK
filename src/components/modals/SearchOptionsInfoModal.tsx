/**
 * Search Options Info Modal
 * 
 * Modal explaining search options with examples
 */

import React from 'react';
import { X, Info, CheckCircle, Search } from 'lucide-react';

interface SearchOptionsInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SearchOptionsInfoModal: React.FC<SearchOptionsInfoModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#121212] border border-gray-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Info size={24} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-white">Options de recherche</h2>
                            <p className="text-sm text-gray-400 mt-1">Explications et exemples pour chaque option</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Two columns layout for large screens */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left column */}
                        <div className="space-y-6">
                            {/* Actif seulement */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/50 rounded-lg">
                                        <CheckCircle size={16} className="text-emerald-400" />
                                        <span className="text-sm font-medium text-emerald-400">Actif seulement</span>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-300 ml-1">
                                    Affiche uniquement les appareils et éléments actuellement actifs/en ligne.
                                </p>
                                <div className="ml-1 p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                                    <p className="text-xs text-gray-400 mb-2 font-medium">Exemple :</p>
                                    <div className="space-y-1 text-xs text-gray-300">
                                        <p>• <span className="text-emerald-400">Avec</span> : Affiche seulement les appareils connectés actuellement</p>
                                        <p>• <span className="text-gray-500">Sans</span> : Affiche tous les appareils (actifs et inactifs)</p>
                                    </div>
                                </div>
                            </div>

                            {/* Correspondance exacte */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 border border-blue-500/50 rounded-lg">
                                        <Search size={16} className="text-blue-400" />
                                        <span className="text-sm font-medium text-blue-400">Correspondance exacte</span>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-300 ml-1">
                                    La recherche doit correspondre exactement au terme recherché (pas de recherche partielle).
                                </p>
                                <div className="ml-1 p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                                    <p className="text-xs text-gray-400 mb-2 font-medium">Exemple :</p>
                                    <div className="space-y-1 text-xs text-gray-300">
                                        <p>• Recherche : <span className="text-blue-400 font-mono">"iPhone"</span></p>
                                        <p className="text-gray-500 ml-4">- <span className="text-emerald-400">Avec</span> : Trouve uniquement "iPhone" (pas "iPhone 13" ni "iPhone 14")</p>
                                        <p className="text-gray-500 ml-4">- <span className="text-gray-500">Sans</span> : Trouve "iPhone", "iPhone 13", "iPhone 14 Pro", etc.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right column */}
                        <div className="space-y-6">
                            {/* Sensible à la casse */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/20 border border-purple-500/50 rounded-lg">
                                        <Search size={16} className="text-purple-400" />
                                        <span className="text-sm font-medium text-purple-400">Sensible à la casse</span>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-300 ml-1">
                                    La recherche distingue les majuscules et les minuscules.
                                </p>
                                <div className="ml-1 p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                                    <p className="text-xs text-gray-400 mb-2 font-medium">Exemple :</p>
                                    <div className="space-y-1 text-xs text-gray-300">
                                        <p>• Recherche : <span className="text-purple-400 font-mono">"Freebox"</span></p>
                                        <p className="text-gray-500 ml-4">- <span className="text-emerald-400">Avec</span> : Trouve "Freebox" mais pas "freebox" ni "FREEBOX"</p>
                                        <p className="text-gray-500 ml-4">- <span className="text-gray-500">Sans</span> : Trouve "Freebox", "freebox", "FREEBOX", etc.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Ping IP locales */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/50 rounded-lg">
                                        <CheckCircle size={16} className="text-cyan-400" />
                                        <span className="text-sm font-medium text-cyan-400">Ping IP locales (IPv4)</span>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-300 ml-1">
                                    Teste la connectivité réseau des adresses IP locales. Par défaut en mode strict (1 IP exacte).
                                </p>
                                <div className="ml-1 p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                                    <p className="text-xs text-gray-400 mb-2 font-medium">Mode strict (par défaut) :</p>
                                    <div className="space-y-1 text-xs text-gray-300 mb-3">
                                        <p>• Ping d'une <span className="text-cyan-400 font-medium">seule IP exacte</span></p>
                                         
                                        <p>• Le mode "Étendu" est automatiquement désactivé lors de l'activation du ping</p>
                                    </div>
                                    
                                    <p className="text-xs text-gray-400 mb-2 font-medium">Mode étendu (optionnel) :</p>
                                    <div className="space-y-1 text-xs text-gray-300 mb-3">
                                        <p>• Activez le bouton "Étendu" pour permettre le ping de <span className="text-cyan-400 font-medium">ranges d'IP</span></p>
                                        <p>• Formats supportés :</p>
                                        <p className="ml-4 text-cyan-400 font-mono">• 192.168.1.0/24</p>
                                        <p className="ml-4 text-cyan-400 font-mono">• 192.168.1.1-254</p>
                                        <p className="ml-4 text-cyan-400 font-mono">• 192.168.1.1-192.168.1.254</p>
                                    </div>
                                    
                                    <div className="pt-2 border-t border-gray-800">
                                        <p className="text-cyan-400 font-medium mb-1">✓ IP autorisées (locales uniquement) :</p>
                                        <p className="ml-2 text-gray-400">• 192.168.x.x (réseaux privés)</p>
                                        <p className="ml-2 text-gray-400">• 10.x.x.x (réseaux privés)</p>
                                        <p className="ml-2 text-gray-400">• 172.16-31.x.x (réseaux privés)</p>
                                        <p className="ml-2 text-gray-400">• 127.x.x.x (localhost)</p>
                                    </div>
                                    <div className="pt-2">
                                        <p className="text-red-400 font-medium mb-1">✗ IP non autorisées :</p>
                                        <p className="ml-2 text-gray-400">• IP publiques (ex: 8.8.8.8, 1.1.1.1)</p>
                                        <p className="ml-2 text-gray-400">• IP externes/internet</p>
                                        <p className="ml-2 text-gray-400">• IPv6 (non supporté)</p>
                                    </div>
                                    <div className="pt-2 border-t border-gray-800">
                                        <p className="text-cyan-400 font-medium mb-1">Comment ça marche :</p>
                                        <p className="ml-2">• 3 pings par IP pour calculer la latence moyenne</p>
                                        <p className="ml-2">• Ping séquentiel (une IP après l'autre) avec délai de 200ms</p>
                                        <p className="ml-2">• Affichage du résultat :</p>
                                        <p className="ml-6 text-emerald-400">✓ Répond (ex: 5ms, 12ms)</p>
                                        <p className="ml-6 text-red-400">✗ Ne répond pas</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Conseils généraux - Full width */}
                    <div className="pt-6 mt-6 border-t border-gray-800">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                            <Info size={16} className="text-blue-400" />
                            Conseils de recherche
                        </h3>
                        <div className="space-y-2 text-xs text-gray-300 ml-1">
                            <p>• Vous pouvez rechercher par : <span className="text-blue-400">nom</span>, <span className="text-blue-400">adresse MAC</span>, <span className="text-blue-400">adresse IP</span>, <span className="text-blue-400">port</span>, <span className="text-blue-400">hostname</span></p>
                            <p>• Utilisez les <span className="text-purple-400">filtres par plugin</span> pour limiter la recherche à Freebox ou UniFi</p>
                            <p>• Utilisez les <span className="text-purple-400">filtres par type</span> pour rechercher uniquement des appareils, clients, points d'accès, etc.</p>
                            <p>• Les résultats peuvent être triés en cliquant sur les en-têtes de colonnes</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end p-6 border-t border-gray-800">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                        Compris
                    </button>
                </div>
            </div>
        </div>
    );
};

