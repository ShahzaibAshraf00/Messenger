import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { syncUserKeypair } from '../crypto/keySync';
import { Shield, Lock, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'github' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Helper to ensure cryptographic keys exist for a user permanently
  const ensureUserKeysAndProfile = async (user: any, preferredName?: string) => {
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef).catch(() => null);

    const { publicKeyJwk } = await syncUserKeypair(user.uid);

    const nameToUse =
      preferredName?.trim() ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'User';

    await setDoc(
      userDocRef,
      {
        uid: user.uid,
        email: user.email?.toLowerCase(),
        displayName: nameToUse,
        photoUrl: user.photoURL || null,
        publicKeyJwk: publicKeyJwk,
        status: 'online',
        lastSeen: serverTimestamp(),
        ...(userSnap?.exists() ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    );
  };

  // Handle Email & Password Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // Sign up with unique email
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const nameToSet = displayName.trim() || cleanEmail.split('@')[0];
        await updateProfile(cred.user, { displayName: nameToSet });
        await ensureUserKeysAndProfile(cred.user, nameToSet);
      } else {
        // Sign in
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        await ensureUserKeysAndProfile(cred.user);
      }
      onAuthenticated();
    } catch (err: any) {
      console.error('Authentication error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please sign in instead or use another email.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/user-not-found'
      ) {
        setError('Incorrect email or password. Please check your credentials.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else {
        setError(err.message || 'Unable to authenticate. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Google Login
  const handleGoogleLogin = async () => {
    setError(null);
    setSocialLoading('google');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      await ensureUserKeysAndProfile(result.user);
      onAuthenticated();
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(err.message || 'Failed to sign in with Google. You can use direct email & password below.');
      }
    } finally {
      setSocialLoading(null);
    }
  };

  // Handle GitHub Login
  const handleGithubLogin = async () => {
    setError(null);
    setSocialLoading('github');
    try {
      const provider = new GithubAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await ensureUserKeysAndProfile(result.user);
      onAuthenticated();
    } catch (err: any) {
      console.error('GitHub Sign-In error:', err);
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setError(err.message || 'Failed to sign in with GitHub. You can use direct email & password below.');
      }
    } finally {
      setSocialLoading(null);
    }
  };

  // Quick Demo Accounts for Multi-Tab Testing
  const handleQuickDemo = async (role: 'alice' | 'bob') => {
    const demoEmail = role === 'alice' ? 'alice@modern.chat' : 'bob@modern.chat';
    const demoPass = 'secure-pass-123';
    const demoName = role === 'alice' ? 'Alice Vance' : 'Bob Miller';

    setLoading(true);
    setError(null);

    try {
      try {
        const cred = await signInWithEmailAndPassword(auth, demoEmail, demoPass);
        await ensureUserKeysAndProfile(cred.user, demoName);
        onAuthenticated();
      } catch (signInErr: any) {
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
          const cred = await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
          await updateProfile(cred.user, { displayName: demoName });
          await ensureUserKeysAndProfile(cred.user, demoName);
          onAuthenticated();
          return;
        }
        throw signInErr;
      }
    } catch (err: any) {
      setError('Could not initialize demo account: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f4f4f5] flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-zinc-700 selection:text-white">
      {/* Container */}
      <div className="max-w-[420px] w-full mx-auto">
        {/* Logo & Headline */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-inner mb-3 text-zinc-100">
            <Lock className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-xs uppercase tracking-widest font-semibold text-zinc-400 mb-0.5">
            Madebyshahzaib
          </div>
          <div className="inline-flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium tracking-wide mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Secured
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            End-to-end encrypted real-time chat
          </p>
        </div>

        {/* Minimal Glass Card */}
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-7 shadow-xl backdrop-blur-xl">
          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-200 text-xs flex items-start gap-2.5 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Social Logins: Google & GitHub */}
          <div className="space-y-2.5 mb-6">
            <button
              id="google-login-btn"
              type="button"
              disabled={loading || socialLoading !== null}
              onClick={handleGoogleLogin}
              className="w-full h-11 px-4 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 text-sm font-medium text-zinc-200 flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50"
            >
              {socialLoading === 'google' ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            <button
              id="github-login-btn"
              type="button"
              disabled={loading || socialLoading !== null}
              onClick={handleGithubLogin}
              className="w-full h-11 px-4 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 text-sm font-medium text-zinc-200 flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50"
            >
              {socialLoading === 'github' ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              ) : (
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              )}
              <span>Continue with GitHub</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-5">
            <div className="border-t border-zinc-800 w-full" />
            <span className="bg-[#121215] px-3 text-xs text-zinc-500 uppercase tracking-wider relative">
              or with email
            </span>
          </div>

          {/* Direct Email & Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isSignUp && (
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Your Name
                </label>
                <input
                  id="signup-name-input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full h-10 px-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Email address
              </label>
              <input
                id="email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full h-10 px-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Password
                </label>
                {!isSignUp && (
                  <span className="text-[11px] text-zinc-500">Min. 6 chars</span>
                )}
              </div>
              <input
                id="password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 px-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all"
              />
            </div>

            <button
              id="submit-auth-btn"
              type="submit"
              disabled={loading || socialLoading !== null}
              className="w-full h-11 mt-1 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{isSignUp ? 'Create account' : 'Sign in'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle between Sign in and Sign up */}
          <div className="mt-5 text-center text-xs text-zinc-400">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="text-white hover:underline font-medium cursor-pointer"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </div>
        </div>

        {/* Quick Demo Sandbox for multi-device testing */}
        <div className="mt-6 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 text-center">
          <p className="text-xs text-zinc-400 mb-2.5">
            Testing real-time chat with two browser tabs?
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickDemo('alice')}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 cursor-pointer border border-zinc-700/50"
            >
              Demo: Alice
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickDemo('bob')}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 cursor-pointer border border-zinc-700/50"
            >
              Demo: Bob
            </button>
          </div>
        </div>

        {/* Footer Minimal Privacy Note */}
        <div className="mt-6 text-center text-[11px] text-zinc-500 flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-zinc-400" />
          <span>Messages encrypted with AES-GCM-256 + ECDH P-256</span>
        </div>
      </div>
    </div>
  );
};
