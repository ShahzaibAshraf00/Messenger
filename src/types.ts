export type UserPresenceStatus = 'online' | 'idle' | 'busy' | 'offline';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  handle?: string;
  avatarSeed?: string;
  avatarColor?: string;
  publicKeyJwk?: JsonWebKey;
  status: UserPresenceStatus;
  statusMessage?: string;
  lastSeen: any;
  createdAt: any;
}

export interface ConversationParticipant {
  uid: string;
  email: string;
  displayName: string;
  avatarSeed?: string;
  avatarColor?: string;
  photoUrl?: string | null;
  publicKeyJwk?: JsonWebKey;
  status?: UserPresenceStatus;
  lastSeen?: any;
}

export interface Conversation {
  id: string;
  participants: string[]; // [uidA, uidB]
  participantData: {
    [uid: string]: ConversationParticipant;
  };
  lastMessage?: {
    senderId: string;
    senderEmail: string;
    encryptedCiphertext: string;
    iv: string;
    plainPreviewSnippet?: string; // cached locally or decrypted
    timestamp: any;
  };
  unreadCount?: {
    [uid: string]: number;
  };
  typing?: {
    [uid: string]: boolean;
  };
  updatedAt: any;
  createdAt: any;
}

export interface EncryptedMessagePayload {
  ciphertext: string; // base64
  iv: string;         // base64
}

export interface MessageItem {
  id: string;
  senderId: string;
  senderEmail: string;
  senderName?: string;
  encryptedCiphertext: string;
  iv: string;
  decryptedText?: string;
  decryptionError?: boolean;
  plainPreviewSnippet?: string;
  timestamp: any;
  status?: 'sent' | 'delivered' | 'read';
  reactions?: Record<string, string[]>; // reaction -> array of uids
}

export type CallType = 'audio' | 'video';
export type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'ended' | 'busy' | 'failed';

export interface CallSession {
  id: string;
  callerId: string;
  callerName: string;
  callerEmail: string;
  callerPhotoUrl?: string | null;
  receiverId: string;
  receiverName: string;
  receiverEmail: string;
  receiverPhotoUrl?: string | null;
  callType: CallType;
  status: CallStatus;
  offer?: { type: RTCSdpType; sdp: string };
  answer?: { type: RTCSdpType; sdp: string };
  createdAt: any;
  endedAt?: any;
  endReason?: string;
}
