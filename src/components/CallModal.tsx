import React, { useState, useEffect, useRef } from 'react';
import {
  doc,
  onSnapshot,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { CallSession, UserProfile } from '../types';
import { ModernAvatar } from '../utils/avatar';
import { callSounds } from '../utils/callSounds';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Shield,
  Volume2,
  Maximize2,
  Minimize2,
  AlertCircle,
} from 'lucide-react';

interface CallModalProps {
  currentUser: UserProfile;
  callSession: CallSession;
  isCaller: boolean;
  onClose: () => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const CallModal: React.FC<CallModalProps> = ({
  currentUser,
  callSession,
  isCaller,
  onClose,
}) => {
  const [callStatus, setCallStatus] = useState<string>(callSession.status);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState<boolean>(callSession.callType === 'audio');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<any>(null);

  const otherUserName = isCaller ? callSession.receiverName : callSession.callerName;
  const otherUserEmail = isCaller ? callSession.receiverEmail : callSession.callerEmail;
  const otherUserPhoto = isCaller ? callSession.receiverPhotoUrl : callSession.callerPhotoUrl;

  // Cleanup helper
  const cleanUpCall = () => {
    callSounds.stopRingtone();
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  // 1. WebRTC & Media Stream Initialization
  useEffect(() => {
    let isMounted = true;
    const callDocRef = doc(db, 'calls', callSession.id);

    async function startWebRTC() {
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        // Remote stream container
        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }

        // Track listener: add remote tracks
        pc.ontrack = (event) => {
          event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
          });
        };

        // Acquire local media
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callSession.callType === 'video',
          });
        } catch (err: any) {
          console.warn('Could not get requested video/audio, falling back to audio only', err);
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setIsVideoDisabled(true);
          } catch (audioErr: any) {
            setMediaError('Could not access microphone. Please check browser permissions.');
            return;
          }
        }

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Add local tracks to RTCPeerConnection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // ICE candidate collection
        const candidatesCol = isCaller ? 'callerCandidates' : 'receiverCandidates';
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            addDoc(collection(db, 'calls', callSession.id, candidatesCol), event.candidate.toJSON()).catch(() => {});
          }
        };

        // Start ringing sound if caller waiting
        if (isCaller) {
          callSounds.startRingtone();
          // Create offer
          const offerDescription = await pc.createOffer();
          await pc.setLocalDescription(offerDescription);

          await updateDoc(callDocRef, {
            offer: {
              type: offerDescription.type,
              sdp: offerDescription.sdp,
            },
            status: 'ringing',
          });
        } else {
          // Receiver: set remote offer and create answer
          if (callSession.offer) {
            await pc.setRemoteDescription(new RTCSessionDescription(callSession.offer as RTCSessionDescriptionInit));
            const answerDescription = await pc.createAnswer();
            await pc.setLocalDescription(answerDescription);

            await updateDoc(callDocRef, {
              answer: {
                type: answerDescription.type,
                sdp: answerDescription.sdp,
              },
              status: 'accepted',
            });
            callSounds.playConnected();
          }
        }

        // Listen for candidates from peer
        const peerCandidatesCol = isCaller ? 'receiverCandidates' : 'callerCandidates';
        onSnapshot(collection(db, 'calls', callSession.id, peerCandidatesCol), (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' && pcRef.current) {
              const candidate = new RTCIceCandidate(change.doc.data());
              pcRef.current.addIceCandidate(candidate).catch(() => {});
            }
          });
        });
      } catch (err: any) {
        console.error('WebRTC setup error:', err);
        setMediaError(err.message || 'Error connecting call.');
      }
    }

    startWebRTC();

    // 2. Listen to call document updates (answer, accepted, ended)
    const unsubscribeCall = onSnapshot(callDocRef, async (docSnap) => {
      if (!docSnap.exists()) {
        setCallStatus('ended');
        return;
      }

      const data = docSnap.data() as CallSession;
      setCallStatus(data.status);

      // Caller receives answer
      if (isCaller && data.answer && pcRef.current && !pcRef.current.currentRemoteDescription) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer as RTCSessionDescriptionInit));
          callSounds.playConnected();
        } catch (e) {
          console.error('Failed to set remote description', e);
        }
      }

      // Handle Call Termination
      if (data.status === 'ended' || data.status === 'rejected' || data.status === 'busy') {
        callSounds.playEnded();
        cleanUpCall();
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeCall();
      cleanUpCall();
    };
  }, [callSession.id, isCaller]);

  // Duration Timer
  useEffect(() => {
    if (callStatus === 'accepted') {
      if (!durationTimerRef.current) {
        durationTimerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    }
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [callStatus]);

  // Toggle Microphone
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoDisabled(!videoTrack.enabled);
      }
    }
  };

  // End / Hang up call
  const handleEndCall = async () => {
    try {
      const callDocRef = doc(db, 'calls', callSession.id);
      await updateDoc(callDocRef, {
        status: 'ended',
        endedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to update call as ended', e);
    }
    callSounds.playEnded();
    cleanUpCall();
    onClose();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col transition-all duration-300 ${
          isFullscreen
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-2xl h-[560px] sm:h-[620px]'
        }`}
      >
        {/* Top Header */}
        <div className="h-14 px-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <span>{otherUserName}</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                  {callSession.callType === 'video' ? 'Video Call' : 'Audio Call'}
                </span>
              </div>
              <div className="text-xs text-zinc-400">
                {callStatus === 'ringing'
                  ? isCaller
                    ? 'Ringing...'
                    : 'Connecting...'
                  : callStatus === 'accepted'
                  ? formatDuration(callDuration)
                  : callStatus === 'ended'
                  ? 'Call ended'
                  : 'Connecting...'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Media Viewport */}
        <div className="flex-1 relative bg-[#09090b] flex items-center justify-center overflow-hidden">
          {mediaError && (
            <div className="absolute top-4 inset-x-4 z-30 p-3 rounded-xl bg-red-950/60 border border-red-800/50 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{mediaError}</span>
            </div>
          )}

          {/* Remote Video (Always in DOM so audio tracks play cleanly) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${
              callSession.callType === 'video' && callStatus === 'accepted' ? 'block' : 'hidden'
            }`}
          />

          {/* Audio Avatar Display (Shown when audio-only or ringing) */}
          {(callSession.callType === 'audio' || callStatus !== 'accepted') && (
            <div className="flex flex-col items-center justify-center p-6 text-center z-10 select-none">
              <div className="relative mb-5">
                {/* Wave pulse animation during call */}
                {callStatus === 'accepted' && (
                  <>
                    <span className="absolute -inset-4 rounded-full bg-blue-500/20 animate-ping" />
                    <span className="absolute -inset-8 rounded-full bg-blue-500/10 animate-pulse" />
                  </>
                )}
                <ModernAvatar
                  seed={otherUserEmail || otherUserName}
                  name={otherUserName}
                  photoUrl={otherUserPhoto || undefined}
                  size={100}
                  className="shadow-2xl relative border-2 border-zinc-700"
                />
              </div>

              <h3 className="text-xl font-semibold text-white mb-1">{otherUserName}</h3>
              <p className="text-xs text-zinc-400 mb-3">{otherUserEmail}</p>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-300">
                {callStatus === 'ringing' ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    {isCaller ? 'Waiting for answer...' : 'Connecting call...'}
                  </span>
                ) : callStatus === 'accepted' ? (
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                    Audio connected
                  </span>
                ) : (
                  <span className="text-zinc-500">Call terminating</span>
                )}
              </div>
            </div>
          )}

          {/* Local Picture-in-Picture Video */}
          {callSession.callType === 'video' && (
            <div className="absolute bottom-4 right-4 w-32 sm:w-44 h-24 sm:h-32 rounded-2xl overflow-hidden border-2 border-zinc-700/80 shadow-2xl bg-zinc-900 z-20">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover mirror ${isVideoDisabled ? 'hidden' : 'block'}`}
              />
              {isVideoDisabled && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 text-[10px]">
                  <VideoOff className="w-5 h-5 mb-1 text-zinc-500" />
                  <span>Camera off</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Call Controls Toolbar */}
        <div className="h-20 bg-zinc-900/90 border-t border-zinc-800/80 px-6 flex items-center justify-center gap-4 shrink-0">
          {/* Mute Microphone */}
          <button
            onClick={toggleMute}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
              isAudioMuted
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-zinc-800 text-zinc-200 border border-zinc-700/50 hover:bg-zinc-700'
            }`}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Toggle Camera */}
          {callSession.callType === 'video' && (
            <button
              onClick={toggleVideo}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                isVideoDisabled
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-zinc-800 text-zinc-200 border border-zinc-700/50 hover:bg-zinc-700'
              }`}
              title={isVideoDisabled ? 'Turn on camera' : 'Turn off camera'}
            >
              {isVideoDisabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </button>
          )}

          {/* Hang Up Button */}
          <button
            onClick={handleEndCall}
            className="w-14 h-12 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-rose-950/50"
            title="End call"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
