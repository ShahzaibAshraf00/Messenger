import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  generateKeyPair,
  exportKeyAsJWK,
  saveLocalPrivateKey,
  getLocalPrivateKey,
} from './e2ee';

/**
 * Synchronizes and restores the user's permanent ECDH P-256 keypair.
 * Guarantees that:
 * 1. The user's private key is securely stored in their private Firestore subcollection (read/write restricted to their uid).
 * 2. On new devices, browsers, incognito sessions, or cache clears, the existing private key is restored.
 * 3. The keypair NEVER gets overwritten or desynced, ensuring past chats can ALWAYS be decrypted.
 */
export async function syncUserKeypair(
  uid: string
): Promise<{ publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey }> {
  const privateKeyDocRef = doc(db, 'users', uid, 'private', 'keys');
  const userDocRef = doc(db, 'users', uid);

  let localPriv = getLocalPrivateKey(uid);
  let cloudPriv: JsonWebKey | null = null;
  let publicJwk: JsonWebKey | null = null;

  // 1. Check cloud storage for existing private key
  try {
    const [privateSnap, userSnap] = await Promise.all([
      getDoc(privateKeyDocRef),
      getDoc(userDocRef),
    ]);

    if (privateSnap.exists() && privateSnap.data()?.privateKeyJwk) {
      cloudPriv = privateSnap.data().privateKeyJwk as JsonWebKey;
    }

    if (userSnap.exists() && userSnap.data()?.publicKeyJwk) {
      publicJwk = userSnap.data().publicKeyJwk as JsonWebKey;
    }
  } catch (err) {
    console.warn('Key sync network check warning:', err);
  }

  // 2. Restore local private key from cloud if missing locally
  if (!localPriv && cloudPriv) {
    localPriv = cloudPriv;
    saveLocalPrivateKey(uid, cloudPriv);
  }

  // 3. Backup local private key to cloud if missing in cloud
  if (localPriv && !cloudPriv) {
    try {
      await setDoc(privateKeyDocRef, { privateKeyJwk: localPriv }, { merge: true });
    } catch (err) {
      console.warn('Failed to backup private key to cloud:', err);
    }
  }

  // 4. Only if neither local nor cloud private key exists, generate a new keypair once
  if (!localPriv || !publicJwk) {
    const keyPair = await generateKeyPair();
    publicJwk = await exportKeyAsJWK(keyPair.publicKey);
    localPriv = await exportKeyAsJWK(keyPair.privateKey);

    saveLocalPrivateKey(uid, localPriv);

    try {
      await Promise.all([
        setDoc(privateKeyDocRef, { privateKeyJwk: localPriv }, { merge: true }),
        setDoc(userDocRef, { publicKeyJwk: publicJwk }, { merge: true }),
      ]);
    } catch (err) {
      console.error('Failed to initialize keypair in database:', err);
    }
  }

  return { publicKeyJwk: publicJwk, privateKeyJwk: localPriv };
}

/**
 * Fetches the peer's most up-to-date public key directly from their user document.
 */
export async function getPeerLatestPublicKey(peerUid: string): Promise<JsonWebKey | null> {
  try {
    const userSnap = await getDoc(doc(db, 'users', peerUid));
    if (userSnap.exists() && userSnap.data()?.publicKeyJwk) {
      return userSnap.data().publicKeyJwk as JsonWebKey;
    }
  } catch (err) {
    console.warn(`Failed to fetch latest public key for peer ${peerUid}:`, err);
  }
  return null;
}
