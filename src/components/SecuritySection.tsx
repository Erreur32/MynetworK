/**
 * Security Section
 * 
 * Component for security settings within Administration
 */

import React, { useState, useEffect } from 'react';
import { Shield, Lock, Key, AlertTriangle, Save, Loader2, CheckCircle } from 'lucide-react';
import { Section, SettingRow } from '../pages/SettingsPage';
import { api } from '../api/client';
import { useUserAuthStore } from '../stores/userAuthStore';

export const SecuritySection: React.FC = () => {
    const { user } = useUserAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    
    // Security settings state
    const [jwtSecretWarning, setJwtSecretWarning] = useState(false);
    const [sessionTimeout, setSessionTimeout] = useState(24); // hours
    const [requireHttps, setRequireHttps] = useState(false);
    const [rateLimitEnabled, setRateLimitEnabled] = useState(true);
    const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);

    useEffect(() => {
        // Check if JWT secret is default
        // This would need to be checked via an API endpoint
        checkSecuritySettings();
    }, []);

    const checkSecuritySettings = async () => {
        try {
            // Check if using default JWT secret (would need backend endpoint)
            // For now, we'll assume it's a warning if not set
            const response = await api.get('/api/system/security');
            if (response.success && response.result) {
                setJwtSecretWarning(response.result.jwtSecretIsDefault || false);
                setSessionTimeout(response.result.sessionTimeout || 24);
                setRequireHttps(response.result.requireHttps || false);
                setRateLimitEnabled(response.result.rateLimitEnabled !== false);
                setMaxLoginAttempts(response.result.maxLoginAttempts || 5);
            }
        } catch (error) {
            // Endpoint might not exist yet, that's okay
            console.log('Security settings endpoint not available');
        }
    };

    const handleSaveSecuritySettings = async () => {
        setIsLoading(true);
        setMessage(null);
        
        try {
            const response = await api.post('/api/system/security', {
                sessionTimeout,
                requireHttps,
                rateLimitEnabled,
                maxLoginAttempts
            });
            
            if (response.success) {
                setMessage({ type: 'success', text: 'Paramètres de sécurité sauvegardés avec succès' });
            } else {
                setMessage({ type: 'error', text: response.error?.message || 'Erreur lors de la sauvegarde' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erreur lors de la sauvegarde' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
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

            {/* JWT Secret Warning */}
            {jwtSecretWarning && (
                <Section title="Avertissement de sécurité" icon={AlertTriangle}>
                    <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                        <div className="flex items-start gap-3">
                            <AlertTriangle size={20} className="text-yellow-400 mt-0.5" />
                            <div className="flex-1">
                                <h4 className="text-sm font-medium text-yellow-400 mb-1">
                                    Secret JWT par défaut détecté
                                </h4>
                                <p className="text-xs text-yellow-300 mb-3">
                                    Pour des raisons de sécurité, définissez une variable d'environnement <code className="bg-yellow-900/30 px-1 rounded">JWT_SECRET</code> avec une valeur unique et sécurisée.
                                </p>
                                <p className="text-xs text-gray-400">
                                    En production, utilisez un secret fort généré aléatoirement (minimum 32 caractères).
                                </p>
                            </div>
                        </div>
                    </div>
                </Section>
            )}

            {/* Authentication Settings */}
            <Section title="Authentification" icon={Lock}>
                <SettingRow
                    label="Délai d'expiration de session"
                    description="Durée avant expiration de la session utilisateur (en heures)"
                >
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min="1"
                            max="168"
                            value={sessionTimeout}
                            onChange={(e) => setSessionTimeout(parseInt(e.target.value) || 24)}
                            className="w-20 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-sm text-gray-400">heures</span>
                    </div>
                </SettingRow>

                <SettingRow
                    label="Tentatives de connexion maximum"
                    description="Nombre de tentatives de connexion autorisées avant blocage"
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
            </Section>

            {/* Network Security */}
            <Section title="Sécurité réseau" icon={Shield}>
                <SettingRow
                    label="Exiger HTTPS"
                    description="Forcer l'utilisation de HTTPS pour toutes les connexions (recommandé en production)"
                >
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={requireHttps}
                            onChange={(e) => setRequireHttps(e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-[#1a1a1a] border-gray-700 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-400">
                            {requireHttps ? 'Activé' : 'Désactivé'}
                        </span>
                    </div>
                </SettingRow>

                <SettingRow
                    label="Limitation de débit (Rate Limiting)"
                    description="Limiter le nombre de requêtes par IP pour prévenir les attaques"
                >
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={rateLimitEnabled}
                            onChange={(e) => setRateLimitEnabled(e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-[#1a1a1a] border-gray-700 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-400">
                            {rateLimitEnabled ? 'Activé' : 'Désactivé'}
                        </span>
                    </div>
                </SettingRow>
            </Section>

            {/* Security Information */}
            <Section title="Informations de sécurité" icon={Key}>
                <div className="space-y-3">
                    <div className="p-3 bg-[#1a1a1a] rounded-lg border border-gray-800">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400">Version de l'application</span>
                            <span className="text-sm text-white">2.0.0-dev</span>
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

            {/* Save Button */}
            <div className="flex justify-end pt-4">
                <button
                    onClick={handleSaveSecuritySettings}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    <span>Sauvegarder les paramètres</span>
                </button>
            </div>
        </div>
    );
};

