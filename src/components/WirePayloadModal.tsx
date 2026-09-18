import React, { useState } from 'react';
import { MessageItem } from '../types';
import { Copy, Check, X, Code2, Shield } from 'lucide-react';

interface WirePayloadModalProps {
  message: MessageItem;
  onClose: () => void;
}

export const WirePayloadModal: React.FC<WirePayloadModalProps> = ({ message, onClose }) => {
  const [copied, setCopied] = useState(false);

  const payloadJson = JSON.stringify(
    {
      messageId: message.id,
      senderId: message.senderId,
      senderEmail: message.senderEmail,
      algorithm: 'AES-GCM-256',
      iv_base64: message.iv,
      ciphertext_base64: message.encryptedCiphertext,
      storedOnServerAs: 'Raw Encrypted Binary / Base64',
    },
    null,
    2
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 text-zinc-100 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-sm text-white">
              Raw Encrypted Wire Payload
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
          This is the exact encrypted payload stored on the Firebase server. Plaintext is only computed locally on your device:
        </p>

        <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto max-h-56 mb-4">
          <pre>{payloadJson}</pre>
        </div>

        <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs mb-5">
          <span className="text-zinc-400 block text-[11px] mb-0.5">Locally Decrypted Plaintext:</span>
          <span className="text-zinc-100 font-medium">"{message.decryptedText}"</span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={handleCopy}
            className="h-9 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy JSON</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="h-9 px-4 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
