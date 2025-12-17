/**
 * Security Section
 * 
 * Component for security settings within Administration
 * Organized in blocks with multiple columns
 */

import React, { useState, useEffect } from 'react';
import { Shield, Lock, Key, AlertTriangle, Save, Loader2, CheckCircle, XCircle, Info } from 'lucide-react';
import { Section, SettingRow } from '../pages/SettingsPage';
import { api } from '../api/client';
import { useUserAuthStore } from '../stores/userAuthStore';
import { getVersionString } from '../constants/version';

export const SecuritySection: React.FC = () => {
    const { user } = useUserAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Security settings state
    const [jwtSecretWarning, setJwtSecretWarning] = useState(false);
    const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
    const [lockoutDuration, setLockoutDuration] = useState(15); // minutes
    const [trackingWindow, setTrackingWindow] = useState(30); // minutes
    const [sessionTimeoutHours, setSessionTimeoutHours] = useState(168); // hours (7 days default)
    const [showSessionWarning, setShowSessionWarning] = useState(false);

    useEffect(() => {
        checkSecuritySettings();
    }, []);

    const checkSecuritySettings = async () => {
        try {
            const response = await api.get<{
                jwtSecretIsDefault: boolean;
                sessionTimeout: number;
                requireHttps: boolean;
                rateLimitEnabled: boolean;
                maxLoginAttempts: number;
                lockoutDuration: number;
                trackingWindow: number;
            }>('/api/system/security');
            if (response.success && response.result) {
                setJwtSecretWarning(response.result.jwtSecretIsDefault || false);
                setMaxLoginAttempts(response.result.maxLoginAttempts || 5);
                setLockoutDuration(response.result.lockoutDuration || 15);
                setTrackingWindow(response.result.trackingWindow || 30);
                setSessionTimeoutHours(response.result.sessionTimeout || 168);
            }
        } catch (error) {
            console.log('Security settings endpoint not available');
        }
    };

    const handleSaveSecuritySettings = async () => {
        setIsLoading(true);
        setMessage(null);
        
        try {
            const response = await api.post('/api/system/security', {
                maxLoginAttempts,
                lockoutDuration,
                sessionTimeoutHours
            });
            
            if (response.success) {
                const messageText = response.result?.message 
                    ? response.result.message 
                    : 'Paramètres de sécurité sauvegardés avec succès';
                setMessage({ type: 'success', text: messageText });
                // Reload settings to get updated values
                await checkSecuritySettings();
                setShowSessionWarning(false);
            } else {
                setMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erreur lors de la sauvegarde' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSessionTimeoutChange = (value: number) => {
        setSessionTimeoutHours(value);
        // Show warning if changing from default or if value is significantly different
        if (value !== 168) {
            setShowSessionWarning(true);
        } else {
            setShowSessionWarning(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Message Banner */}
            {message && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                    message.type === 'success' 
                        ? 'bg-green-900/20 border border-green-700 text-green-400' 
                        : 'bg-red-900/20 border border-red-700 text-red-400'
                }`}>
                    {message.type === 'success' ? (
                        <CheckCircle size={16} />
                    ) : (
                        <AlertTriangle size={16} />
                    )}
                    <span className="text-sm">{message.text}</span>
                </div>
            )}

            {/* JWT Secret Warning - Full Width Alert */}
            {jwtSecretWarning && (
                <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={20} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <h4 className="text-sm font-medium text-yellow-400 mb-1">
                                Secret JWT par défaut détecté
                            </h4>
                            <p className="text-xs text-yellow-300 mb-2">
                                Pour des raisons de sécurité, définissez une variable d'environnement <code className="bg-yellow-900/30 px-1.5 py-0.5 rounded">JWT_SECRET</code> avec une valeur unique et sécurisée.
                            </p>
                            <p className="text-xs text-gray-400">
                                En production, utilisez un secret fort généré aléatoirement (minimum 32 caractères).
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Security Settings - Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Protection contre les attaques */}
                <div className="space-y-6">
                    {/* Protection Brute Force */}
                    <Section title="Protection contre les attaques" icon={Shield} iconColor="red">
                        <div className="space-y-4">
                            <SettingRow
                                label="Tentatives de connexion maximum"
                                description="Nombre de tentatives de connexion autorisées avant blocage automatique"
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="3"
                                        max="10"
                                        value={maxLoginAttempts}
                                        onChange={(e) => setMaxLoginAttempts(parseInt(e.target.value) || 5)}
                                        className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                    />
                                    <span className="text-sm text-gray-400">tentatives</span>
                                </div>
                            </SettingRow>

                            <SettingRow
                                label="Durée de blocage"
                                description="Durée du blocage après dépassement du nombre maximum de tentatives"
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="5"
                                        max="60"
                                        value={lockoutDuration}
                                        onChange={(e) => setLockoutDuration(parseInt(e.target.value) || 15)}
                                        className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                    />
                                    <span className="text-sm text-gray-400">minutes</span>
                                </div>
                            </SettingRow>

                            <SettingRow
                                label="Fenêtre de suivi"
                                description="Durée pendant laquelle les tentatives échouées sont comptabilisées"
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="15"
                                        max="120"
                                        value={trackingWindow}
                                        onChange={(e) => setTrackingWindow(parseInt(e.target.value) || 30)}
                                        disabled
                                        className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 opacity-50 cursor-not-allowed"
                                    />
                                    <span className="text-sm text-gray-400">minutes</span>
                                    <span className="text-xs text-gray-500">(lecture seule)</span>
                                </div>
                            </SettingRow>

                            <div className="mt-4 p-3 bg-green-900/10 border border-green-700/30 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <CheckCircle size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-xs text-green-400 font-medium mb-1">Protection active</p>
                                        <p className="text-xs text-gray-400">
                                            Les tentatives de connexion échouées sont automatiquement bloquées après {maxLoginAttempts} tentatives pendant {lockoutDuration} minutes.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Section>
                </div>

                {/* Right Column: Options non implémentées */}
                <div className="space-y-6">
                    {/* Authentification */}
                    <Section title="Authentification" icon={Lock} iconColor="blue">
                        <div className="space-y-4">
                            <SettingRow
                                label="Délai d'expiration de session"
                                description="Durée avant expiration de la session utilisateur (appliqué aux nouvelles connexions uniquement)"
                            >
                                <div className="flex items-center gap-2 flex-wrap">
                                    <input
                                        type="number"
                                        min="1"
                                        max="168"
                                        value={sessionTimeoutHours}
                                        onChange={(e) => handleSessionTimeoutChange(parseInt(e.target.value) || 168)}
                                        className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                    />
                                    <span className="text-sm text-gray-400">heures</span>
                                    {sessionTimeoutHours >= 24 && (
                                        <span className="text-sm text-blue-400 font-medium">
                                            ({sessionTimeoutHours % 24 === 0 
                                                ? `${sessionTimeoutHours / 24} jour${sessionTimeoutHours >= 48 ? 's' : ''}`
                                                : `${Math.round((sessionTimeoutHours / 24) * 10) / 10} jour${sessionTimeoutHours >= 48 ? 's' : ''}`
                                            })
                                        </span>
                                    )}
                                </div>
                                {showSessionWarning && (
                                    <div className="mt-2 flex items-start gap-2 p-2 bg-yellow-900/20 rounded border border-yellow-700/50">
                                        <AlertTriangle size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                                        <p className="text-xs text-yellow-300">
                                            <strong>Attention :</strong> Le nouveau délai d'expiration s'appliquera uniquement aux nouvelles connexions. Les sessions actives conserveront leur délai d'expiration d'origine.
                                        </p>
                                    </div>
                                )}
                                <div className="mt-2 flex items-start gap-2 p-2 bg-gray-900/50 rounded border border-gray-800">
                                    <Info size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-gray-500">
                                        La configuration est stockée en base de données et remplace la variable d'environnement <code className="bg-gray-800 px-1 rounded">JWT_EXPIRES_IN</code> si définie.
                                    </p>
                                </div>
                            </SettingRow>
                        </div>
                    </Section>

                    {/* Sécurité réseau */}
                    <Section title="Sécurité réseau" icon={Shield}>
                        <div className="space-y-4">
                            <SettingRow
                                label="Exiger HTTPS"
                                description="Forcer l'utilisation de HTTPS pour toutes les connexions"
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={false}
                                        disabled
                                        className="w-4 h-4 text-blue-600 bg-[#1a1a1a] border-gray-700 rounded opacity-50 cursor-not-allowed"
                                    />
                                    <span className="text-sm text-gray-500">Non implémenté</span>
                                </div>
                                <div className="mt-2 flex items-start gap-2 p-2 bg-gray-900/50 rounded border border-gray-800">
                                    <XCircle size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-gray-500">
                                        Généralement géré par nginx/reverse proxy. Peut être ajouté via middleware Express si nécessaire.
                                    </p>
                                </div>
                            </SettingRow>

                            <SettingRow
                                label="Limitation de débit (Rate Limiting)"
                                description="Limiter le nombre de requêtes par IP pour prévenir les attaques DDoS"
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={false}
                                        disabled
                                        className="w-4 h-4 text-blue-600 bg-[#1a1a1a] border-gray-700 rounded opacity-50 cursor-not-allowed"
                                    />
                                    <span className="text-sm text-gray-500">Non implémenté</span>
                                </div>
                                <div className="mt-2 flex items-start gap-2 p-2 bg-gray-900/50 rounded border border-gray-800">
                                    <XCircle size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-gray-500">
                                        Nécessite l'installation de <code className="bg-gray-800 px-1 rounded">express-rate-limit</code> et configuration des limites par endpoint.
                                    </p>
                                </div>
                            </SettingRow>
                        </div>
                    </Section>
                </div>
            </div>

            {/* Informations de sécurité - Full Width */}
            <Section title="Informations de sécurité" icon={Key} iconColor="purple">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400">Version</span>
                            <span className="text-sm text-white font-mono">{getVersionString()}</span>
                        </div>
                    </div>
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400">Base de données</span>
                            <span className="text-sm text-white">SQLite</span>
                        </div>
                    </div>
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400">Authentification</span>
                            <span className="text-sm text-white">JWT</span>
                        </div>
                    </div>
                </div>
            </Section>

            {/* Status Summary - Full Width */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-900/10 border border-blue-700/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle size={18} className="text-blue-400" />
                        <h4 className="text-sm font-medium text-blue-400">Fonctionnalités actives</h4>
                    </div>
                    <ul className="space-y-1 text-xs text-gray-400">
                        <li>• Protection contre les attaques brute force</li>
                        <li>• Blocage automatique des IPs et comptes</li>
                        <li>• Notifications de sécurité</li>
                        <li>• Audit de sécurité</li>
                        <li>• Détection du secret JWT par défaut</li>
                    </ul>
                </div>

                <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                        <Info size={18} className="text-gray-500" />
                        <h4 className="text-sm font-medium text-gray-500">Fonctionnalités à venir</h4>
                    </div>
                    <ul className="space-y-1 text-xs text-gray-500">
                        <li>• Rate limiting configurable</li>
                        <li>• Middleware HTTPS</li>
                        <li>• Politique de mot de passe avancée</li>
                    </ul>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-gray-800">
                <button
                    onClick={handleSaveSecuritySettings}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    <span>Sauvegarder les paramètres</span>
                </button>
            </div>
        </div>
    );
};
