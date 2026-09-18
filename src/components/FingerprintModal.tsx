import React, { useEffect, useState } from 'react';
import { computeSafetyFingerprint } from '../crypto/e2ee';
import { UserProfile, ConversationParticipant } from '../types';
import { ShieldCheck, Copy, Check, X, Lock } from 'lucide-react';

interface FingerprintModalProps {
  currentUser: UserProfile;
  peerUser: ConversationParticipant;
  onClose: () => void;
}

export const FingerprintModal: React.FC<FingerprintModalProps> = ({
  currentUser,
  peerUser,
  onClose,
}) => {
  const [fingerprint, setFingerprint] = useState<{ hex: string; numericGroups: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadFingerprint() {
      if (currentUser.publicKeyJwk && peerUser.publicKeyJwk) {
        try {
          const res = await computeSafetyFingerprint(currentUser.publicKeyJwk, peerUser.publicKeyJwk);
          setFingerprint(res);
        } catch (err) {
          console.error('Failed to compute safety fingerprint', err);
        }
      }
    }
    loadFingerprint();
  }, [currentUser.publicKeyJwk, peerUser.publicKeyJwk]);

  const handleCopy = () => {
    if (!fingerprint) return;
    navigator.clipboard.writeText(fingerprint.numericGroups.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 text-zinc-100 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="font-semibold text-sm text-white">
              Verify Safety Numbers
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          Compare this safety number with <strong className="text-zinc-200">{peerUser.displayName}</strong> to confirm this end-to-end encrypted chat is secure.
        </p>

        {fingerprint ? (
          <div className="grid grid-cols-3 gap-2.5 p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80 mb-5 font-mono text-center">
            {fingerprint.numericGroups.map((group, idx) => (
              <div
                key={idx}
                className="bg-zinc-900 border border-zinc-800/60 py-2 rounded-lg text-sm font-semibold tracking-wider text-zinc-200"
              >
                {group}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-zinc-500">
            Computing cryptographic fingerprint...
          </div>
        )}

        <div className="p-3 rounded-xl bg-zinc-950/50 border border-zinc-800 text-[11px] text-zinc-400 space-y-1 mb-5">
          <div className="flex justify-between">
            <span>Algorithm:</span>
            <span className="text-zinc-200 font-medium">ECDH NIST P-256</span>
          </div>
          <div className="flex justify-between">
            <span>Cipher:</span>
            <span className="text-zinc-200 font-medium">AES-GCM-256</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Numbers</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="h-10 px-5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
