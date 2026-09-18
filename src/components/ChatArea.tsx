import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Conversation,
  ConversationParticipant,
  MessageItem,
  UserProfile,
} from '../types';
import {
  importPublicKey,
  importPrivateKey,
  deriveSharedSecretKey,
  encryptMessage,
  decryptMessage,
  getLocalPrivateKey,
  setCachedDecryptedMessage,
  getCachedDecryptedMessage,
} from '../crypto/e2ee';
import { syncUserKeypair, getPeerLatestPublicKey } from '../crypto/keySync';
import { ModernAvatar } from '../utils/avatar';
import { formatPresenceText } from '../utils/presence';
import {
  Send,
  CheckCheck,
  Smile,
  AlertCircle,
  MoreVertical,
  Phone,
  Video,
  Sparkles,
  X,
} from 'lucide-react';

interface ChatAreaProps {
  currentUser: UserProfile;
  conversation: Conversation;
  peerUser: ConversationParticipant;
  onOpenSecurityDrawer?: () => void;
  onStartCall: (type: 'audio' | 'video') => void;
  onConversationCreated?: (newConvId: string) => void;
  onCloseChat?: () => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '👏', '🔒'];

export const ChatArea: React.FC<ChatAreaProps> = ({
  currentUser,
  conversation,
  peerUser,
  onStartCall,
  onConversationCreated,
  onCloseChat,
}) => {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [derivedKey, setDerivedKey] = useState<CryptoKey | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const decryptedCache = useRef<Record<string, string>>({});

  // Establish Shared Secret Key via ECDH P-256 with key recovery
  useEffect(() => {
    let isMounted = true;

    async function initSharedCrypto() {
      // 1. Retrieve or restore local private key
      let localPrivJwk = getLocalPrivateKey(currentUser.uid);
      if (!localPrivJwk) {
        try {
          const synced = await syncUserKeypair(currentUser.uid);
          localPrivJwk = synced.privateKeyJwk;
        } catch (err) {
          console.warn('Could not sync user keypair:', err);
        }
      }

      if (!localPrivJwk) {
        return;
      }

      // 2. Retrieve peer public key (from participant data or directly from users collection)
      let peerPubKeyJwk: JsonWebKey | undefined = peerUser.publicKeyJwk;
      if (!peerPubKeyJwk) {
        const latestKey = await getPeerLatestPublicKey(peerUser.uid);
        if (latestKey) peerPubKeyJwk = latestKey;
      }

      if (!peerPubKeyJwk) {
        return;
      }

      try {
        const myPrivKey = await importPrivateKey(localPrivJwk);
        const peerPubKey = await importPublicKey(peerPubKeyJwk);
        const secretKey = await deriveSharedSecretKey(myPrivKey, peerPubKey);

        if (isMounted) {
          setDerivedKey(secretKey);
          setKeyError(null);
        }
      } catch (err: any) {
        console.error('Failed to derive shared key:', err);
        if (isMounted) {
          setKeyError('Unable to connect securely right now.');
        }
      }
    }

    initSharedCrypto();

    return () => {
      isMounted = false;
    };
  }, [currentUser.uid, peerUser.uid, peerUser.publicKeyJwk, peerUser.displayName]);

  // Listen to Firestore messages stream & decrypt
  useEffect(() => {
    if (!conversation.id) {
      setMessages([]);
      return;
    }

    const messagesCol = collection(db, 'conversations', conversation.id, 'messages');
    const q = query(messagesCol, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const rawList: MessageItem[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MessageItem, 'id'>),
      }));

      const decryptedList: MessageItem[] = await Promise.all(
        rawList.map(async (msg) => {
          // 1. Check in-memory decrypted cache
          if (decryptedCache.current[msg.id]) {
            return {
              ...msg,
              decryptedText: decryptedCache.current[msg.id],
            };
          }

          // 2. Check persistent localStorage cache
          const cachedText = getCachedDecryptedMessage(msg.id);
          if (cachedText) {
            decryptedCache.current[msg.id] = cachedText;
            return {
              ...msg,
              decryptedText: cachedText,
            };
          }

          // 3. Decrypt with derived shared key if available
          if (derivedKey) {
            try {
              const plain = await decryptMessage(msg.encryptedCiphertext, msg.iv, derivedKey);
              decryptedCache.current[msg.id] = plain;
              setCachedDecryptedMessage(msg.id, plain);
              return {
                ...msg,
                decryptedText: plain,
              };
            } catch {
              // AES-GCM tag mismatch or key change
            }
          }

          // 4. Resilient fallbacks: ensure previous chats are never lost
          if (msg.plainPreviewSnippet) {
            decryptedCache.current[msg.id] = msg.plainPreviewSnippet;
            setCachedDecryptedMessage(msg.id, msg.plainPreviewSnippet);
            return {
              ...msg,
              decryptedText: msg.plainPreviewSnippet,
            };
          }

          if (
            conversation.lastMessage?.encryptedCiphertext === msg.encryptedCiphertext &&
            conversation.lastMessage?.plainPreviewSnippet
          ) {
            const fallback = conversation.lastMessage.plainPreviewSnippet;
            decryptedCache.current[msg.id] = fallback;
            setCachedDecryptedMessage(msg.id, fallback);
            return {
              ...msg,
              decryptedText: fallback,
            };
          }

          return {
            ...msg,
            decryptedText: '[Encrypted payload]',
            decryptionError: true,
          };
        })
      );

      setMessages(decryptedList);

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    });

    return () => unsubscribe();
  }, [conversation.id, conversation.lastMessage, derivedKey]);

  // Listen to typing state
  useEffect(() => {
    if (!conversation.typing) return;
    const typingStatus = conversation.typing[peerUser.uid] || false;
    setIsPeerTyping(typingStatus);
  }, [conversation.typing, peerUser.uid]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);

    if (conversation.id) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      updateDoc(doc(db, 'conversations', conversation.id), {
        [`typing.${currentUser.uid}`]: true,
      }).catch(() => {});

      typingTimeoutRef.current = setTimeout(() => {
        updateDoc(doc(db, 'conversations', conversation.id), {
          [`typing.${currentUser.uid}`]: false,
        }).catch(() => {});
      }, 2000);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !derivedKey || sending) return;

    const plainText = inputText.trim();
    setInputText('');
    setSending(true);

    if (conversation.id) {
      updateDoc(doc(db, 'conversations', conversation.id), {
        [`typing.${currentUser.uid}`]: false,
      }).catch(() => {});
    }

    try {
      const { ciphertext, iv } = await encryptMessage(plainText, derivedKey);
      const snippet = plainText.length > 45 ? plainText.slice(0, 45) + '...' : plainText;

      let convId = conversation.id;

      // If this conversation hasn't been created yet in Firestore (new chat initiated via search)
      if (!convId) {
        const convCol = collection(db, 'conversations');
        const newConvRef = await addDoc(convCol, {
          participants: [currentUser.uid, peerUser.uid],
          participantData: {
            [currentUser.uid]: {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || 'User',
              photoUrl: (currentUser as any).photoUrl || null,
              publicKeyJwk: currentUser.publicKeyJwk || null,
              status: currentUser.status || 'online',
            },
            [peerUser.uid]: {
              uid: peerUser.uid,
              email: peerUser.email || '',
              displayName: peerUser.displayName || 'User',
              photoUrl: (peerUser as any).photoUrl || null,
              publicKeyJwk: peerUser.publicKeyJwk || null,
              status: peerUser.status || 'online',
            },
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessage: {
            senderId: currentUser.uid,
            senderEmail: currentUser.email,
            encryptedCiphertext: ciphertext,
            iv: iv,
            plainPreviewSnippet: snippet,
            timestamp: serverTimestamp(),
          },
        });
        convId = newConvRef.id;
        if (onConversationCreated) {
          onConversationCreated(convId);
        }
      } else {
        await updateDoc(doc(db, 'conversations', convId), {
          lastMessage: {
            senderId: currentUser.uid,
            senderEmail: currentUser.email,
            encryptedCiphertext: ciphertext,
            iv: iv,
            plainPreviewSnippet: snippet,
            timestamp: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        });
      }

      const messagesCol = collection(db, 'conversations', convId, 'messages');
      const newDocRef = await addDoc(messagesCol, {
        senderId: currentUser.uid,
        senderEmail: currentUser.email,
        senderName: currentUser.displayName,
        encryptedCiphertext: ciphertext,
        iv: iv,
        plainPreviewSnippet: snippet,
        timestamp: serverTimestamp(),
        status: 'sent',
      });

      decryptedCache.current[newDocRef.id] = plainText;
      setCachedDecryptedMessage(newDocRef.id, plainText);
    } catch (sendErr) {
      console.error('Failed to send encrypted message:', sendErr);
      setInputText(plainText);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !conversation.id) return;

    const reactions = msg.reactions || {};
    const existingUids = reactions[emoji] || [];
    const hasReacted = existingUids.includes(currentUser.uid);

    let nextUids: string[];
    if (hasReacted) {
      nextUids = existingUids.filter((uid) => uid !== currentUser.uid);
    } else {
      nextUids = [...existingUids, currentUser.uid];
    }

    const nextReactions = { ...reactions };
    if (nextUids.length === 0) {
      delete nextReactions[emoji];
    } else {
      nextReactions[emoji] = nextUids;
    }

    try {
      await updateDoc(doc(db, 'conversations', conversation.id, 'messages', messageId), {
        reactions: nextReactions,
      });
    } catch (err) {
      console.error('Failed to update reaction', err);
    }
  };

  const formatTime = (timestamp: any): string => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const statusDotColor =
    peerUser.status === 'online'
      ? 'bg-emerald-500'
      : peerUser.status === 'idle'
      ? 'bg-amber-500'
      : peerUser.status === 'busy'
      ? 'bg-rose-500'
      : 'bg-zinc-600';
  const presenceText = formatPresenceText(
    peerUser.status || 'offline',
    (peerUser as any).lastSeen
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090b] relative select-none">
      {/* Top Header */}
      <header className="h-14 border-b border-zinc-800/80 px-4 sm:px-6 flex items-center justify-between z-10 shrink-0 bg-zinc-950/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative">
            <ModernAvatar
              seed={peerUser.email || peerUser.uid}
              name={peerUser.displayName}
              photoUrl={(peerUser as any).photoUrl}
              size={36}
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${statusDotColor}`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white leading-tight">
                {peerUser.displayName}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span>{presenceText}</span>
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Audio Call */}
          <button
            id="start-audio-call-btn"
            onClick={() => onStartCall('audio')}
            className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Start Audio Call"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Call</span>
          </button>

          {/* Video Call */}
          <button
            id="start-video-call-btn"
            onClick={() => onStartCall('video')}
            className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Start Video Call"
          >
            <Video className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">Video</span>
          </button>

          {/* Close Chat Cross Button */}
          {onCloseChat && (
            <button
              id="close-chat-btn"
              onClick={onCloseChat}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer ml-1"
              title="Close chat and return to main menu"
              aria-label="Close chat"
            >
              <X className="w-4 h-4 text-zinc-400" />
              <span className="hidden sm:inline">Close</span>
            </button>
          )}
        </div>
      </header>

      {/* Alert if key issue */}
      {keyError && (
        <div className="p-3 bg-red-950/30 border-b border-red-800/40 text-red-300 text-xs flex items-center px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{keyError}</span>
          </div>
        </div>
      )}

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Empty / Draft Conversation Prompt */}
        {messages.length === 0 && (
          <div className="text-center py-10 px-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-blue-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-200">
              Start chatting with {peerUser.displayName}
            </h3>
            <p className="text-xs text-zinc-400 mt-1.5 max-w-xs mx-auto">
              Type a message below to start your conversation.
            </p>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.uid;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
            >
              <div
                className={`max-w-[80%] sm:max-w-[70%] p-3.5 rounded-2xl relative shadow-xs ${
                  isMe
                    ? 'bg-blue-600 text-white rounded-tr-xs'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-xs'
                }`}
              >
                {/* Text Content */}
                <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {msg.decryptedText || (
                    <span className="italic opacity-60 text-xs">
                      Decrypting message...
                    </span>
                  )}
                </div>

                {/* Message Meta: Time & Status */}
                <div
                  className={`flex items-center justify-end gap-1.5 mt-1.5 text-[10px] ${
                    isMe ? 'text-blue-200' : 'text-zinc-500'
                  }`}
                >
                  <span>{formatTime(msg.timestamp)}</span>

                  {isMe && (
                    <CheckCheck className="w-3.5 h-3.5 text-blue-200 shrink-0" />
                  )}
                </div>

                {/* Reaction Badges */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(msg.reactions).map(([emoji, uids]) => {
                      const hasReacted = uids.includes(currentUser.uid);
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleToggleReaction(msg.id, emoji)}
                          className={`text-xs px-2 py-0.5 rounded-full border cursor-pointer ${
                            hasReacted
                              ? 'bg-blue-700/80 border-blue-400 text-white'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                          }`}
                        >
                          {emoji} <span className="text-[10px] ml-0.5">{uids.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Hover Quick Emoji Toolbar */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-1 px-1">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleToggleReaction(msg.id, emoji)}
                    className="p-1 text-xs hover:scale-125 transition-transform rounded-md bg-zinc-900 border border-zinc-800 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Peer Typing Indicator */}
        {isPeerTyping && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 px-2 py-1">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:0.4s]" />
            </span>
            <span>{peerUser.displayName} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Composer Footer */}
      <footer className="p-3 sm:p-4 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto space-y-2">
          {/* Quick Emoji Shelf */}
          {showEmojiPicker && (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-base">
              {['👍', '❤️', '🔥', '👏', '😊', '🎉', '🔒', '🚀'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setInputText((prev) => prev + emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="p-1 hover:scale-125 transition-transform cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 relative bg-zinc-900 rounded-2xl border border-zinc-800 focus-within:border-zinc-600 transition-colors">
              <textarea
                id="message-input"
                rows={1}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${peerUser.displayName}...`}
                className="w-full pl-4 pr-10 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 bg-transparent resize-none focus:outline-none max-h-32"
              />
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="absolute right-3 bottom-3 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <Smile className="w-4 h-4" />
              </button>
            </div>

            <button
              id="send-button"
              type="submit"
              disabled={!inputText.trim() || !derivedKey || sending}
              className="w-11 h-11 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            >
              {sending ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
};
