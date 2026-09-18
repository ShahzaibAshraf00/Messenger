import React, { useEffect } from 'react';
import { CallSession } from '../types';
import { ModernAvatar } from '../utils/avatar';
import { callSounds } from '../utils/callSounds';
import { Phone, PhoneOff, Video, Shield } from 'lucide-react';

interface IncomingCallBannerProps {
  callSession: CallSession;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallBanner: React.FC<IncomingCallBannerProps> = ({
  callSession,
  onAccept,
  onDecline,
}) => {
  useEffect(() => {
    callSounds.startRingtone();
    return () => {
      callSounds.stopRingtone();
    };
  }, []);

  return (
    <div className="fixed top-4 sm:top-6 inset-x-4 sm:inset-x-auto sm:right-6 z-50 max-w-md w-full animate-in slide-in-from-top duration-300">
      <div className="bg-zinc-900 border-2 border-blue-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-zinc-100 flex items-center justify-between gap-4">
        {/* Caller Avatar & Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <ModernAvatar
              seed={callSession.callerEmail || callSession.callerName}
              name={callSession.callerName}
              photoUrl={callSession.callerPhotoUrl || undefined}
              size={48}
              className="border border-zinc-700"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-zinc-900 animate-ping" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-white truncate">
                {callSession.callerName}
              </h4>
            </div>
            <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
              {callSession.callType === 'video' ? (
                <>
                  <Video className="w-3 h-3 text-blue-400 shrink-0" />
                  <span>Incoming Video Call...</span>
                </>
              ) : (
                <>
                  <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Incoming Audio Call...</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons: Accept & Decline */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Decline */}
          <button
            id="decline-call-btn"
            onClick={onDecline}
            className="w-10 h-10 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Decline"
          >
            <PhoneOff className="w-4 h-4" />
          </button>

          {/* Accept */}
          <button
            id="accept-call-btn"
            onClick={onAccept}
            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-950/40 animate-pulse"
            title="Accept Call"
          >
            {callSession.callType === 'video' ? (
              <Video className="w-4 h-4" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
};
