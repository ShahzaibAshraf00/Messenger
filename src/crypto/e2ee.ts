/**
 * Cryptographic engine for CipherBBS using Web Cryptography API (SubtleCrypto)
 * - Key Exchange: ECDH (Elliptic Curve Diffie-Hellman) with NIST P-256 (secp256r1)
 * - Message Cipher: AES-GCM 256-bit with unique 96-bit (12-byte) initialization vectors
 * - Key Fingerprint: SHA-256 hash formatted as Signal-style verification digits
 */

// ArrayBuffer to Base64
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Base64 to ArrayBuffer
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate ECDH P-256 Keypair
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['deriveKey', 'deriveBits']
  );
}

// Export Public or Private key as JWK (JSON Web Key)
export async function exportKeyAsJWK(key: CryptoKey): Promise<JsonWebKey> {
  return await window.crypto.subtle.exportKey('jwk', key);
}

// Import Public Key from JWK
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

// Import Private Key from JWK
export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// Derive AES-GCM 256-bit shared encryption key from our private key & peer's public key
export async function deriveSharedSecretKey(
  myPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return await window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    myPrivateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // derived AES key does not need to be exported
    ['encrypt', 'decrypt']
  );
}

// Encrypt plaintext with AES-GCM-256 using a fresh 12-byte IV
export async function encryptMessage(
  plainText: string,
  derivedKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(plainText);

  // Generate cryptographically secure 12-byte IV (96 bits recommended for AES-GCM)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    derivedKey,
    encodedData
  );

  return {
    ciphertext: bufferToBase64(encryptedBuffer),
    iv: bufferToBase64(iv),
  };
}

// Decrypt ciphertext with AES-GCM-256
export async function decryptMessage(
  ciphertextB64: string,
  ivB64: string,
  derivedKey: CryptoKey
): Promise<string> {
  const ciphertextBuffer = base64ToBuffer(ciphertextB64);
  const ivBuffer = base64ToBuffer(ivB64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(ivBuffer),
    },
    derivedKey,
    ciphertextBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Compute Safety Number / Cryptographic Fingerprint for two public keys (Signal protocol style)
export async function computeSafetyFingerprint(
  keyA: JsonWebKey,
  keyB: JsonWebKey
): Promise<{ hex: string; numericGroups: string[] }> {
  // Sort keys deterministically by their x coordinate
  const keyAStr = `${keyA.x || ''}:${keyA.y || ''}`;
  const keyBStr = `${keyB.x || ''}:${keyB.y || ''}`;
  const combined = keyAStr < keyBStr ? `${keyAStr}##${keyBStr}` : `${keyBStr}##${keyAStr}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

  // Create 6 numeric groups of 5 digits each for retro terminal verification
  const numericGroups: string[] = [];
  for (let i = 0; i < 6; i++) {
    const chunk = hashArray.slice(i * 4, (i + 1) * 4);
    const num = ((chunk[0] << 24) | (chunk[1] << 16) | (chunk[2] << 8) | chunk[3]) >>> 0;
    numericGroups.push((num % 100000).toString().padStart(5, '0'));
  }

  return { hex, numericGroups };
}

// LocalStorage helpers for user's private key
const PRIV_KEY_PREFIX = 'madebyshahzaib_e2ee_priv_';
const MSG_CACHE_PREFIX = 'madebyshahzaib_msg_cache_';

export function saveLocalPrivateKey(uid: string, jwk: JsonWebKey): void {
  try {
    localStorage.setItem(`${PRIV_KEY_PREFIX}${uid}`, JSON.stringify(jwk));
    // Also save under legacy key just in case
    localStorage.setItem(`cipherbbs_e2ee_priv_${uid}`, JSON.stringify(jwk));
  } catch (err) {
    console.error('Failed to save private key to localStorage', err);
  }
}

export function getLocalPrivateKey(uid: string): JsonWebKey | null {
  try {
    const raw =
      localStorage.getItem(`${PRIV_KEY_PREFIX}${uid}`) ||
      localStorage.getItem(`cipherbbs_e2ee_priv_${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as JsonWebKey;
  } catch (err) {
    console.error('Failed to read private key from localStorage', err);
    return null;
  }
}

export function clearLocalPrivateKey(uid: string): void {
  try {
    localStorage.removeItem(`${PRIV_KEY_PREFIX}${uid}`);
    localStorage.removeItem(`cipherbbs_e2ee_priv_${uid}`);
  } catch (err) {
    console.error('Failed to remove private key', err);
  }
}

// Persistent cache for decrypted messages to guarantee chats never disappear
export function setCachedDecryptedMessage(msgId: string, plainText: string): void {
  try {
    if (!msgId || !plainText) return;
    localStorage.setItem(`${MSG_CACHE_PREFIX}${msgId}`, plainText);
  } catch (err) {
    // LocalStorage quota or access error handled gracefully
  }
}

export function getCachedDecryptedMessage(msgId: string): string | null {
  try {
    if (!msgId) return null;
    return localStorage.getItem(`${MSG_CACHE_PREFIX}${msgId}`);
  } catch {
    return null;
  }
}

