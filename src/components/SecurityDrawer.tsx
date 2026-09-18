import React, { useState } from 'react';
import { UserProfile } from '../types';
import {
  getLocalPrivateKey,
  saveLocalPrivateKey,
  generateKeyPair,
  exportKeyAsJWK,
} from '../crypto/e2ee';
import {
  ShieldCheck,
  Key,
  Copy,
  Check,
  X,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface SecurityDrawerProps {
  currentUser: UserProfile;
  onClose: () => void;
  onKeysRotated: () => void;
}

export const SecurityDrawer: React.FC<SecurityDrawerProps> = ({
  currentUser,
  onClose,
  onKeysRotated,
}) => {
  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedPrivate, setCopiedPrivate] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const localPrivJwk = getLocalPrivateKey(currentUser.uid);

  const handleCopyPublic = () => {
    if (currentUser.publicKeyJwk) {
      navigator.clipboard.writeText(JSON.stringify(currentUser.publicKeyJwk, null, 2));
      setCopiedPublic(true);
      setTimeout(() => setCopiedPublic(false), 2000);
    }
  };

  const handleCopyPrivate = () => {
    if (localPrivJwk) {
      navigator.clipboard.writeText(JSON.stringify(localPrivJwk, null, 2));
      setCopiedPrivate(true);
      setTimeout(() => setCopiedPrivate(false), 2000);
    }
  };

  const handleRotateKeys = async () => {
    if (!window.confirm('Rotate your cryptographic keys? Existing cached messages will remain decrypted, but new messages will use the new keypair.')) {
      return;
    }

    setRotating(true);
    setStatusMsg('Generating new ECDH P-256 keypair...');

    try {
      const keyPair = await generateKeyPair();
      const publicJwk = await exportKeyAsJWK(keyPair.publicKey);
      const privateJwk = await exportKeyAsJWK(keyPair.privateKey);

      saveLocalPrivateKey(currentUser.uid, privateJwk);

      await updateDoc(doc(db, 'users', currentUser.uid), {
        publicKeyJwk: publicJwk,
      });

      setStatusMsg('New keys generated and synced successfully.');
      onKeysRotated();
    } catch (err: any) {
      console.error('Failed to rotate keys', err);
      setStatusMsg('Error: ' + err.message);
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md h-full bg-zinc-900 border-l border-zinc-800 flex flex-col justify-between text-zinc-100 p-6 overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-200">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="font-semibold text-base text-white">
                Cryptographic Security
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {statusMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs">
              {statusMsg}
            </div>
          )}

          <div className="space-y-4">
            {/* Identity Box */}
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs space-y-1">
              <div className="text-zinc-400 text-[11px]">Logged in as</div>
              <div className="font-semibold text-white text-sm">{currentUser.displayName}</div>
              <div className="text-zinc-400">{currentUser.email}</div>
            </div>

            {/* Public Key Display */}
            <div>
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="text-zinc-400 font-medium">Public Key (ECDH P-256)</span>
                <button
                  onClick={handleCopyPublic}
                  className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 cursor-pointer"
                >
                  {copiedPublic ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPublic ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-28 overflow-y-auto">
                <pre>{JSON.stringify(currentUser.publicKeyJwk || {}, null, 2)}</pre>
              </div>
            </div>

            {/* Private Key Display */}
            <div>
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="text-zinc-400 font-medium">Device Private Key</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
                  >
                    {showPrivateKey ? 'Hide' : 'Reveal'}
                  </button>
                  <button
                    onClick={handleCopyPrivate}
                    className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPrivate ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPrivate ? 'Copied' : 'Export'}</span>
                  </button>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-28 overflow-y-auto">
                {showPrivateKey ? (
                  <pre>{JSON.stringify(localPrivJwk || {}, null, 2)}</pre>
                ) : (
                  <div className="text-zinc-600 italic py-2 text-center text-xs">
                    Protected in device storage
                  </div>
                )}
              </div>
            </div>

            {/* Specs */}
            <div className="p-3.5 rounded-xl bg-zinc-950/40 border border-zinc-800 text-xs text-zinc-400 space-y-2">
              <div className="flex justify-between">
                <span>Key Exchange:</span>
                <span className="text-zinc-200">ECDH (NIST P-256)</span>
              </div>
              <div className="flex justify-between">
                <span>Symmetric Cipher:</span>
                <span className="text-zinc-200">AES-GCM-256</span>
              </div>
              <div className="flex justify-between">
                <span>Initialization Vector:</span>
                <span className="text-zinc-200">96-bit (Unique per msg)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-zinc-800 space-y-2">
          <button
            onClick={handleRotateKeys}
            disabled={rotating}
            className="w-full h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
            <span>Generate New Keypair</span>
          </button>

          <button
            onClick={onClose}
            className="w-full h-10 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
