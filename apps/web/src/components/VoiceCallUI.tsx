'use client';

import { Mic, MicOff, PhoneOff, User } from 'lucide-react';
import { clsx } from 'clsx';

interface VoiceCallUIProps {
  callState: string;
  isMuted: boolean;
  toggleMute: () => void;
  endCall: () => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
  partnerGender: string;
}

export function VoiceCallUI({ 
  callState, 
  isMuted, 
  toggleMute, 
  endCall, 
  remoteAudioRef,
  partnerGender 
}: VoiceCallUIProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 space-y-16 bg-[#050505]">
      {/* Remote Audio element (hidden) */}
      <audio ref={remoteAudioRef} autoPlay />

      <div className="flex flex-col items-center space-y-12">
        <div className="relative">
          {callState === 'connected' && (
            <div className="absolute inset-0 z-0">
              <div className="ripple"></div>
              <div className="ripple" style={{ animationDelay: '1s' }}></div>
            </div>
          )}
          <div className={clsx(
            "relative w-40 h-40 bg-zinc-900 border border-white/5 rounded-[2.5rem] flex items-center justify-center transition-all z-10",
            callState === 'connected' && "scale-105 border-blue-500/30"
          )}>
            <User className={clsx(
              "w-20 h-20 transition-colors",
              callState === 'connected' ? "text-blue-500" : "text-zinc-700"
            )} />
          </div>
          {callState === 'connected' && (
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 border-4 border-[#050505] rounded-full z-20"></div>
          )}
        </div>

        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Собеседник <span className="text-zinc-500 text-xl font-normal ml-1">({partnerGender || '...'})</span>
          </h2>
          <div className="flex items-center justify-center gap-2">
            <span className={clsx(
              "w-2 h-2 rounded-full",
              callState === 'connected' ? "bg-emerald-500" : "bg-zinc-700 animate-pulse"
            )} />
            <p className={clsx(
              "text-xs font-bold uppercase tracking-[0.2em]",
              callState === 'connected' ? "text-emerald-500" : "text-zinc-500"
            )}>
              {callState === 'calling' ? 'Установка связи...' : callState === 'connected' ? 'Голос активен' : 'Подключение...'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-6">
        <button
          onClick={toggleMute}
          className={clsx(
            "p-6 rounded-2xl border transition-all",
            isMuted 
              ? "bg-red-500/10 border-red-500/20 text-red-500" 
              : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-white"
          )}
        >
          {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
        </button>

        <button
          onClick={endCall}
          className="p-6 bg-red-600 text-white rounded-2xl hover:brightness-110 active:scale-95 transition-all"
        >
          <PhoneOff className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
}
