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
            <div className="bg-[#121212] border border-gray-700 rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-cyan-500/20 rounded-lg">
                            <Info size={20} className="text-cyan-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Aide recherche</h2>
                            <p className="text-xs text-gray-400 mt-0.5">Options et syntaxe</p>
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
                                        <span className="text-xs font-medium text-emerald-400">IP Actif</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-300 ml-1">
                                    Affiche uniquement les appareils actifs/en ligne.
                                </p>
                            </div>

                                {/* removed: Correspondance exacte - feature retirée */}
                                <p className="hidden">
                                    Fonctionne avec <span className="font-medium">IP</span>, <span className="font-medium">nom</span>, <span className="font-medium">MAC</span>, <span className="font-medium">port</span>, <span className="font-medium">hostname</span>. La fiche détaillée (ports, schéma UniFi) s’affiche uniquement pour une recherche par <span className="font-medium">IP exacte</span>.
                                </p>
                        </div>

                        <div className="space-y-4">
                            {/* Sensible à la casse */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-2.5 py-1 bg-purple-500/20 border border-purple-500/50 rounded-lg">
                                        <Search size={14} className="text-purple-400" />
                                        <span className="text-xs font-medium text-purple-400">Sensible à la casse</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-300 ml-1">
                                    Distingue majuscules et minuscules (ex. "Freebox" ≠ "freebox").
                                </p>
                            </div>

                            {/* Ping IP locales */}
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-2 px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded-lg">
                                        <CheckCircle size={14} className="text-cyan-400" />
                                        <span className="text-xs font-medium text-cyan-400">Ping IP locales</span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-300 ml-1">
                                    Teste la connectivité (IP locales uniquement). 3 pings par IP, latence affichée.
                                </p>
                                <div className="ml-1 p-2 bg-gray-900/50 rounded border border-gray-800 text-xs text-gray-400">
                                    <p className="font-medium text-gray-300 mb-1">IP autorisées : 192.168.x.x, 10.x.x.x, 172.16-31.x.x, 127.x.x.x</p>
                                    <p>Non autorisées : IP publiques, IPv6</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Syntaxe recherche : IP, wildcard *, plage, MAC, texte */}
                    <div className="pt-4 mt-4 border-t border-gray-800">
                        <h3 className="text-xs font-semibold text-white mb-2 flex items-center gap-2">
                            <Search size={14} className="text-cyan-400" />
                            Exemples de syntaxe recherche
                        </h3>
                        <div className="space-y-3 text-xs">
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">IP exacte</p>
                                <p className="text-gray-400 font-mono">192.168.32.1</p>
                                <p className="text-gray-500 mt-0.5">Une seule adresse (fiche détail si trouvée).</p>
                            </div>
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">IP avec joker <span className="text-white">*</span></p>
                                <p className="text-gray-400 font-mono">192.168.32.*</p>
                                <p className="text-gray-400 font-mono">192.168.32.1*</p>
                                <p className="text-gray-500 mt-0.5">Toutes les IP qui commencent par ce préfixe (ex. .* = .1 à .254, .1* = .10 à .19).</p>
                            </div>
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">Plage d’IP</p>
                                <p className="text-gray-400 font-mono">192.168.32.1-32</p>
                                <p className="text-gray-400 font-mono">192.168.32.1-192.168.32.50</p>
                                <p className="text-gray-500 mt-0.5">Dernier octet de 1 à 32, ou plage complète (même sous-réseau).</p>
                            </div>
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">MAC exacte ou joker</p>
                                <p className="text-gray-400 font-mono">AA:BB:CC:DD:EE:FF</p>
                                <p className="text-gray-400 font-mono">AA:BB:*</p>
                                <p className="text-gray-500 mt-0.5">Tirets ou deux-points ; <span className="font-mono">*</span> pour préfixe MAC.</p>
                            </div>
                            <div className="p-2.5 bg-gray-900/50 rounded border border-gray-800">
                                <p className="font-medium text-cyan-400 mb-1.5">Texte (hostname, vendor, commentaire)</p>
                                <p className="text-gray-400 font-mono">tapo</p>
                                <p className="text-gray-400 font-mono">Freebox</p>
                                <p className="text-gray-500 mt-0.5">Tout ce qui n’est pas IP/MAC : recherche dans nom, hostname, fabricant, commentaire.</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-gray-800">
                        <h3 className="text-xs font-semibold text-white mb-1.5 flex items-center gap-2">
                            <Info size={14} className="text-cyan-400" />
                            Conseils
                        </h3>
                        <div className="space-y-2 text-xs text-gray-300 ml-1">
                            <p>• Fiche détaillée (ports, UniFi, DHCP) : recherche par <span className="text-cyan-400">IP exacte</span></p>
                            <p>• Filtres par plugin (Freebox, UniFi, Scan) et par type (appareils, clients, etc.)</p>
                            <p>• Tri en cliquant sur les en-têtes de colonnes</p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end p-4 border-t border-gray-800">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-xs font-medium"
                    >
                        Compris
                    </button>
                </div>
            </div>
        </div>
    );
};

