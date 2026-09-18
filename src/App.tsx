/**
 * Madebyshahzaib - Modern Minimal Real-Time End-to-End Encrypted Messenger
 * Powered by Firebase Firestore, Firebase Auth, and Web Cryptography API
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  serverTimestamp,
  addDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  UserProfile,
  Conversation,
  UserPresenceStatus,
  CallSession,
  CallType,
  ConversationParticipant,
} from './types';
import { syncUserKeypair } from './crypto/keySync';
import { AuthScreen } from './components/AuthScreen';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { CallModal } from './components/CallModal';
import { IncomingCallBanner } from './components/IncomingCallBanner';
import { getEffectivePresence, isUserOnline } from './utils/presence';
import {
  MessageSquare,
  Search,
  Loader2,
} from 'lucide-react';

export default function App() {
  // Authentication & Profile States
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Real-time Data
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [pendingPeerUser, setPendingPeerUser] = useState<UserProfile | null>(null);

  // UI States
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Calling States
  const [activeCallSession, setActiveCallSession] = useState<CallSession | null>(null);
  const [incomingCallSession, setIncomingCallSession] = useState<CallSession | null>(null);
  const [isCaller, setIsCaller] = useState(false);

  // 1. Firebase Auth State Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (!user) {
        setCurrentUserProfile(null);
        setLoadingAuth(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Current User Profile, Heartbeat, and Cryptographic Key Restoration
  useEffect(() => {
    if (!authUser) return;

    // Immediately ensure user's ECDH keypair is synced & restored from cloud
    syncUserKeypair(authUser.uid).catch((err) => {
      console.warn('Background key synchronization error:', err);
    });

    const userDocRef = doc(db, 'users', authUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setCurrentUserProfile(data);
      }
      setLoadingAuth(false);
    });

    updateDoc(userDocRef, {
      status: 'online',
      lastSeen: serverTimestamp(),
    }).catch(() => {});

    const heartbeat = setInterval(() => {
      updateDoc(userDocRef, {
        lastSeen: serverTimestamp(),
      }).catch(() => {});
    }, 45000);

    const handleBeforeUnload = () => {
      updateDoc(userDocRef, {
        status: 'offline',
        lastSeen: serverTimestamp(),
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubscribe();
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [authUser]);

  // 3. Real-Time Directory Listener
  useEffect(() => {
    if (!authUser) return;

    const usersCol = collection(db, 'users');
    const unsubscribe = onSnapshot(usersCol, (snapshot) => {
      const usersList: UserProfile[] = snapshot.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as Omit<UserProfile, 'uid'>),
      }));

      setOnlineUsers(usersList);
    });

    return () => unsubscribe();
  }, [authUser]);

  // 4. Real-time Active Conversations Listener (Sorted by recent activity)
  useEffect(() => {
    if (!authUser) return;

    const convCol = collection(db, 'conversations');
    const q = query(convCol, where('participants', 'array-contains', authUser.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Conversation[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Conversation, 'id'>),
      }));

      list.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis
          ? a.updatedAt.toMillis()
          : a.updatedAt?.seconds
          ? a.updatedAt.seconds * 1000
          : 0;
        const timeB = b.updatedAt?.toMillis
          ? b.updatedAt.toMillis()
          : b.updatedAt?.seconds
          ? b.updatedAt.seconds * 1000
          : 0;
        return timeB - timeA;
      });

      setConversations(list);
    });

    return () => unsubscribe();
  }, [authUser]);

  // 5. Incoming WebRTC Call Signaling Listener
  useEffect(() => {
    if (!authUser) return;

    const callsCol = collection(db, 'calls');
    const q = query(
      callsCol,
      where('receiverId', '==', authUser.uid),
      where('status', '==', 'ringing')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setIncomingCallSession(null);
        return;
      }

      const activeCalls = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CallSession, 'id'>),
      }));

      if (activeCalls.length > 0) {
        setIncomingCallSession(activeCalls[0]);
      }
    });

    return () => unsubscribe();
  }, [authUser]);

  // Start outgoing call
  const handleStartCall = async (
    peer: { uid: string; displayName: string; email: string; photoUrl?: string | null },
    callType: CallType
  ) => {
    if (!authUser || !currentUserProfile) return;

    try {
      const callsCol = collection(db, 'calls');
      const docRef = await addDoc(callsCol, {
        callerId: authUser.uid,
        callerName: currentUserProfile.displayName || authUser.displayName || 'Caller',
        callerEmail: authUser.email || '',
        callerPhotoUrl: (currentUserProfile as any).photoUrl || authUser.photoURL || null,
        receiverId: peer.uid,
        receiverName: peer.displayName || 'User',
        receiverEmail: peer.email || '',
        receiverPhotoUrl: peer.photoUrl || null,
        callType: callType,
        status: 'ringing',
        createdAt: serverTimestamp(),
      });

      const newSession: CallSession = {
        id: docRef.id,
        callerId: authUser.uid,
        callerName: currentUserProfile.displayName || authUser.displayName || 'Caller',
        callerEmail: authUser.email || '',
        callerPhotoUrl: (currentUserProfile as any).photoUrl || authUser.photoURL || null,
        receiverId: peer.uid,
        receiverName: peer.displayName || 'User',
        receiverEmail: peer.email || '',
        receiverPhotoUrl: peer.photoUrl || null,
        callType: callType,
        status: 'ringing',
        createdAt: new Date(),
      };

      setIsCaller(true);
      setActiveCallSession(newSession);
    } catch (err) {
      console.error('Failed to initiate call:', err);
    }
  };

  const handleAcceptIncomingCall = () => {
    if (!incomingCallSession) return;
    setIsCaller(false);
    setActiveCallSession(incomingCallSession);
    setIncomingCallSession(null);
  };

  const handleDeclineIncomingCall = async () => {
    if (!incomingCallSession) return;
    try {
      await updateDoc(doc(db, 'calls', incomingCallSession.id), {
        status: 'rejected',
        endedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to reject incoming call:', err);
    }
    setIncomingCallSession(null);
  };

  // Start or open chat with user selected from search bar
  const handleStartChatWithUser = (targetUser: UserProfile) => {
    if (!authUser || !currentUserProfile) return;

    setMobileSidebarOpen(false);

    // Look for an existing conversation that already has messages
    const existing = conversations.find(
      (c) =>
        c.participants.includes(targetUser.uid) &&
        c.participants.includes(authUser.uid) &&
        c.lastMessage
    );

    if (existing) {
      setActiveConversationId(existing.id);
      setPendingPeerUser(null);
      return;
    }

    // Do NOT create an empty document in Firestore yet!
    // Set as draft conversation. It will be created when the first message is sent.
    setActiveConversationId(null);
    setPendingPeerUser(targetUser);
  };

  const handleUpdatePresence = async (status: UserPresenceStatus) => {
    if (!authUser) return;
    try {
      await updateDoc(doc(db, 'users', authUser.uid), {
        status: status,
        lastSeen: serverTimestamp(),
      });
    } catch (err) {
      console.error('Failed to update presence', err);
    }
  };

  const handleSignOut = async () => {
    if (authUser) {
      try {
        await updateDoc(doc(db, 'users', authUser.uid), {
          status: 'offline',
          lastSeen: serverTimestamp(),
        });
      } catch {}
    }
    await signOut(auth);
    setActiveConversationId(null);
    setPendingPeerUser(null);
  };

  // Resolving active conversation or pending draft conversation
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activePeerUid = activeConversation?.participants.find((p) => p !== authUser?.uid);
  const rawActivePeerUser = activePeerUid ? activeConversation?.participantData[activePeerUid] : null;
  const livePeerFromDir = activePeerUid ? onlineUsers.find((u) => u.uid === activePeerUid) : null;
  const activePeerUser: ConversationParticipant | null = rawActivePeerUser
    ? {
        ...rawActivePeerUser,
        status: livePeerFromDir ? getEffectivePresence(livePeerFromDir, authUser?.uid) : rawActivePeerUser.status || 'offline',
        lastSeen: livePeerFromDir?.lastSeen || (rawActivePeerUser as any).lastSeen,
      }
    : null;

  const draftLivePeer = pendingPeerUser ? onlineUsers.find((u) => u.uid === pendingPeerUser.uid) : null;
  const draftPeerUser: ConversationParticipant | null = pendingPeerUser
    ? {
        uid: pendingPeerUser.uid,
        email: pendingPeerUser.email || '',
        displayName: pendingPeerUser.displayName || 'User',
        photoUrl: (pendingPeerUser as any).photoUrl || null,
        publicKeyJwk: pendingPeerUser.publicKeyJwk,
        status: draftLivePeer ? getEffectivePresence(draftLivePeer, authUser?.uid) : pendingPeerUser.status || 'offline',
        lastSeen: draftLivePeer?.lastSeen || (pendingPeerUser as any).lastSeen,
      }
    : null;

  const draftConversation: Conversation | null =
    pendingPeerUser && currentUserProfile
      ? {
          id: '',
          participants: [currentUserProfile.uid, pendingPeerUser.uid],
          participantData: {
            [currentUserProfile.uid]: {
              uid: currentUserProfile.uid,
              email: currentUserProfile.email || '',
              displayName: currentUserProfile.displayName || 'User',
              photoUrl: (currentUserProfile as any).photoUrl || null,
              publicKeyJwk: currentUserProfile.publicKeyJwk,
              status: currentUserProfile.status,
            },
            [pendingPeerUser.uid]: {
              uid: pendingPeerUser.uid,
              email: pendingPeerUser.email || '',
              displayName: pendingPeerUser.displayName || 'User',
              photoUrl: (pendingPeerUser as any).photoUrl || null,
              publicKeyJwk: pendingPeerUser.publicKeyJwk,
              status: pendingPeerUser.status,
            },
          },
          createdAt: null,
          updatedAt: null,
        }
      : null;

  const currentDisplayConversation = activeConversation || draftConversation;
  const currentPeerUser = activePeerUser || draftPeerUser;

  // Render Loading Screen
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-3 text-zinc-400 text-xs font-medium">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span>Connecting to messenger...</span>
        </div>
      </div>
    );
  }

  // Render Auth Screen if not signed in
  if (!authUser || !currentUserProfile) {
    return (
      <AuthScreen
        onAuthenticated={() => {
          setLoadingAuth(true);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans antialiased select-none">
      {/* Top Navigation */}
      <Navbar
        currentUser={currentUserProfile}
        onlineCount={onlineUsers.filter((u) => isUserOnline(u, authUser?.uid)).length}
        onSignOut={handleSignOut}
        onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        onUpdateStatus={handleUpdatePresence}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar Component */}
        <div
          className={`${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } md:translate-x-0 transition-transform duration-200 ease-in-out fixed md:static inset-y-0 left-0 z-30 md:z-auto h-full`}
        >
          <Sidebar
            currentUser={currentUserProfile}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={(id) => {
              setActiveConversationId(id);
              setPendingPeerUser(null);
              setMobileSidebarOpen(false);
            }}
            onlineUsers={onlineUsers}
            onStartChatWithUser={handleStartChatWithUser}
            onStartCallWithUser={(user, type) =>
              handleStartCall(
                {
                  uid: user.uid,
                  displayName: user.displayName,
                  email: user.email,
                  photoUrl: (user as any).photoUrl,
                },
                type
              )
            }
          />
        </div>

        {/* Mobile Backdrop */}
        {mobileSidebarOpen && (
          <div
            className="md:hidden fixed inset-0 z-20 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Main Stage */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#09090b]">
          {currentDisplayConversation && currentPeerUser ? (
            <ChatArea
              key={currentDisplayConversation.id || currentPeerUser.uid}
              currentUser={currentUserProfile}
              conversation={currentDisplayConversation}
              peerUser={currentPeerUser}
              onCloseChat={() => {
                setActiveConversationId(null);
                setPendingPeerUser(null);
              }}
              onStartCall={(type) =>
                handleStartCall(
                  {
                    uid: currentPeerUser.uid,
                    displayName: currentPeerUser.displayName,
                    email: currentPeerUser.email,
                    photoUrl: (currentPeerUser as any).photoUrl,
                  },
                  type
                )
              }
              onConversationCreated={(newConvId) => {
                setActiveConversationId(newConvId);
                setPendingPeerUser(null);
              }}
            />
          ) : (
            // Modern Minimal Empty State / Main Menu
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none overflow-y-auto">
              <div className="max-w-md w-full p-8 rounded-3xl bg-zinc-900/40 border border-zinc-800/60 shadow-xl">
                <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center mx-auto mb-4 text-blue-400">
                  <MessageSquare className="w-7 h-7" />
                </div>

                <h2 className="text-xl font-semibold text-white mb-1">
                  Madebyshahzaib
                </h2>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-medium text-emerald-400 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Secured
                </div>

                <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                  Select a chat from the sidebar or search for a user to start messaging.
                </p>

                {/* Instructions Card */}
                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 text-left text-xs text-zinc-300 space-y-2">
                  <div className="flex items-center gap-2 text-zinc-100 font-medium">
                    <Search className="w-4 h-4 text-blue-400" />
                    <span>Quick Search</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Type a name or email in the search bar on the left to start a direct message or voice/video call.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Incoming Call Notification Banner */}
      {incomingCallSession && !activeCallSession && (
        <IncomingCallBanner
          callSession={incomingCallSession}
          onAccept={handleAcceptIncomingCall}
          onDecline={handleDeclineIncomingCall}
        />
      )}

      {/* Active Call Modal */}
      {activeCallSession && currentUserProfile && (
        <CallModal
          currentUser={currentUserProfile}
          callSession={activeCallSession}
          isCaller={isCaller}
          onClose={() => setActiveCallSession(null)}
        />
      )}
    </div>
  );
}
