import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Loader2, CheckCircle, AlertCircle, Globe } from 'lucide-react';

interface CustomDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type DomainSetupType = 'freebox' | 'existing' | null;

export const CustomDomainModal: React.FC<CustomDomainModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [setupType, setSetupType] = useState<DomainSetupType>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Freebox domain setup
  const [freeboxDomainName, setFreeboxDomainName] = useState('');
  const [freeboxDomainAvailable, setFreeboxDomainAvailable] = useState<boolean | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  
  // Existing domain setup
  const [existingDomain, setExistingDomain] = useState('');
  const [dnsRecords, setDnsRecords] = useState<Array<{ type: string; name: string; value: string }>>([]);
  const [certificateType, setCertificateType] = useState<'RSA' | 'ECDSA'>('RSA');

  if (!isOpen) return null;

  const handleClose = () => {
    setStep(1);
    setSetupType(null);
    setFreeboxDomainName('');
    setFreeboxDomainAvailable(null);
    setExistingDomain('');
    setDnsRecords([]);
    setError(null);
    onClose();
  };

  const handleNext = () => {
    if (step === 1 && !setupType) {
      setError('Veuillez choisir une option');
      return;
    }
    if (step === 2 && setupType === 'freebox' && !freeboxDomainName) {
      setError('Veuillez saisir un nom de domaine');
      return;
    }
    if (step === 2 && setupType === 'existing' && !existingDomain) {
      setError('Veuillez saisir un nom de domaine');
      return;
    }
    setError(null);
    setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const checkDomainAvailability = async () => {
    if (!freeboxDomainName) return;
    setCheckingAvailability(true);
    setError(null);
    // TODO: Implement API call to check domain availability
    setTimeout(() => {
      // Simulate API call
      setFreeboxDomainAvailable(true);
      setCheckingAvailability(false);
    }, 1000);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Implement API call to configure domain
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (onSuccess) onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la configuration du domaine');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <p className="text-gray-300 text-sm mb-6">
        Cet assistant va vous permettre de configurer un nom de domaine pour accéder à Freebox OS
      </p>
      <p className="text-gray-400 text-xs mb-6">
        Si vous ne possédez pas de nom de domaine, vous avez la possibilité d'en choisir un gratuitement.
      </p>
      
      <div className="space-y-3">
        <button
          onClick={() => {
            setSetupType('freebox');
            setError(null);
          }}
          className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
            setupType === 'freebox'
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-gray-700 bg-[#1a1a1a] hover:border-gray-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <Globe size={24} className={setupType === 'freebox' ? 'text-blue-400' : 'text-gray-400'} />
            <div>
              <div className="font-semibold text-white">Je veux choisir un nom de domaine Freebox personnalisé</div>
              <div className="text-xs text-gray-400 mt-1">Obtenez un nom de domaine gratuit de type *.freeboxos.fr</div>
            </div>
          </div>
        </button>
        
        <button
          onClick={() => {
            setSetupType('existing');
            setError(null);
          }}
          className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
            setupType === 'existing'
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-gray-700 bg-[#1a1a1a] hover:border-gray-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <Globe size={24} className={setupType === 'existing' ? 'text-blue-400' : 'text-gray-400'} />
            <div>
              <div className="font-semibold text-white">Je veux ajouter un nom de domaine que j'ai déjà configuré</div>
              <div className="text-xs text-gray-400 mt-1">Utilisez votre propre nom de domaine existant</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => {
    if (setupType === 'freebox') {
      return (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm mb-4">
            Choisissez un nom de domaine personnalisé de type <span className="font-mono text-blue-400">*.freeboxos.fr</span>
          </p>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Nom de domaine
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={freeboxDomainName}
                onChange={(e) => {
                  setFreeboxDomainName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  setFreeboxDomainAvailable(null);
                }}
                placeholder="mon-domaine"
                className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <span className="px-3 py-2 bg-gray-800 text-gray-400 text-sm rounded-lg flex items-center">
                .freeboxos.fr
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={checkDomainAvailability}
                disabled={!freeboxDomainName || checkingAvailability}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkingAvailability ? (
                  <>
                    <Loader2 size={14} className="inline animate-spin mr-2" />
                    Vérification...
                  </>
                ) : (
                  'Vérifier la disponibilité'
                )}
              </button>
              {freeboxDomainAvailable === true && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle size={16} />
                  <span>Disponible</span>
                </div>
              )}
              {freeboxDomainAvailable === false && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle size={16} />
                  <span>Non disponible</span>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm mb-4">
            Saisissez le nom de domaine que vous souhaitez utiliser
          </p>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Nom de domaine
            </label>
            <input
              type="text"
              value={existingDomain}
              onChange={(e) => setExistingDomain(e.target.value)}
              placeholder="example.com"
              className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-400">
              Assurez-vous que ce domaine pointe vers votre Freebox via un enregistrement DNS
            </p>
          </div>
        </div>
      );
    }
  };

  const renderStep3 = () => {
    if (setupType === 'freebox') {
      return (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm mb-4">
            Configuration du certificat TLS
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Type de certificat
              </label>
              <select
                value={certificateType}
                onChange={(e) => setCertificateType(e.target.value as 'RSA' | 'ECDSA')}
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="RSA">RSA</option>
                <option value="ECDSA">ECDSA</option>
              </select>
            </div>
            
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
              <p className="text-sm text-blue-300">
                Un certificat TLS Let's Encrypt sera automatiquement généré pour votre domaine.
                Cela peut prendre quelques minutes.
              </p>
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="space-y-4">
          <p className="text-gray-300 text-sm mb-4">
            Configuration DNS requise
          </p>
          
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-300 mb-3">
              Vous devez configurer les enregistrements DNS suivants pour votre domaine :
            </p>
            <div className="space-y-2 font-mono text-xs">
              <div className="text-gray-300">
                Type: <span className="text-blue-400">A</span> | Nom: <span className="text-blue-400">@</span> | Valeur: <span className="text-green-400">[IP de votre Freebox]</span>
              </div>
              <div className="text-gray-300">
                Type: <span className="text-blue-400">CNAME</span> | Nom: <span className="text-blue-400">www</span> | Valeur: <span className="text-green-400">{existingDomain}</span>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Type de certificat
            </label>
            <select
              value={certificateType}
              onChange={(e) => setCertificateType(e.target.value as 'RSA' | 'ECDSA')}
              className="w-full px-3 py-2 bg-[#1a1a1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="RSA">RSA</option>
              <option value="ECDSA">ECDSA</option>
            </select>
          </div>
        </div>
      );
    }
  };

  const renderStep4 = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-center mb-4">
        <div className="w-16 h-16 rounded-full bg-green-900/40 border-2 border-green-500 flex items-center justify-center">
          <CheckCircle size={32} className="text-green-400" />
        </div>
      </div>
      
      <h3 className="text-lg font-semibold text-white text-center mb-2">
        Configuration terminée
      </h3>
      
      <p className="text-gray-300 text-sm text-center mb-4">
        Votre nom de domaine a été configuré avec succès.
      </p>
      
      <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Domaine :</span>
            <span className="text-white font-mono">
              {setupType === 'freebox' ? `${freeboxDomainName}.freeboxos.fr` : existingDomain}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Certificat :</span>
            <span className="text-white">{certificateType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Statut :</span>
            <span className="text-green-400">Valide</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#0f0f0f] border-b border-gray-800 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-white">
            Configuration du nom de domaine
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>
        
        <div className="px-6 py-4">
          {/* Progress indicator */}
          <div className="flex items-center justify-between mb-6">
            {[1, 2, 3, 4].map((s) => (
              <React.Fragment key={s}>
                <div className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                      step >= s
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {step > s ? <CheckCircle size={16} /> : s}
                  </div>
                  {s < 4 && (
                    <div
                      className={`w-12 h-1 ${
                        step > s ? 'bg-blue-600' : 'bg-gray-800'
                      }`}
                    />
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>
          
          <div className="mb-2">
            <span className="text-sm text-gray-400">Étape {step}/4</span>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          
          <div className="min-h-[300px]">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </div>
        </div>
        
        <div className="sticky bottom-0 bg-[#0f0f0f] border-t border-gray-800 px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ChevronLeft size={16} />
            Précédent
          </button>
          
          {step < 4 ? (
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              Suivant
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Configuration...
                </>
              ) : (
                <>
                  Terminer
                  <CheckCircle size={16} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
