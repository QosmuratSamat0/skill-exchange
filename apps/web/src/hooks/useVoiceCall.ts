import { useEffect, useRef, useState, useCallback } from 'react';
import { chatSocket } from '@/lib/socket';
import { useChatStore } from '@/store/chatStore';

export type CallState = 'idle' | 'calling' | 'connected' | 'ended' | 'error';

export function useVoiceCall() {
  const { mode, status, isInitiator } = useChatStore();
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const isStartingRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const iceQueue = useRef<RTCIceCandidateInit[]>([]);
  // Track if we've already processed an offer for the current WS session
  const handlingOfferRef = useRef(false);

  const closePeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    iceQueue.current = [];
    handlingOfferRef.current = false;
  }, []);

  const cleanup = useCallback(() => {
    closePeerConnection();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setCallState('idle');
  }, [closePeerConnection]);

  const createPeerConnection = useCallback(() => {
    // Always close existing PC first
    closePeerConnection();

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
    };

    const pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        chatSocket.sendRTC('rtc:ice-candidate', event.candidate);
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
      setCallState('connected');
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.log('ICE failed/disconnected, attempting to restart ICE...');
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Peer Connection State:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          setCallState('connected');
          break;
        case 'disconnected':
        case 'failed':
          setCallState('error');
          break;
        case 'closed':
          setCallState('ended');
          break;
      }
    };

    return pc;
  }, [closePeerConnection]);

  const startCall = useCallback(async () => {
    if (callState === 'connected') return;

    try {
      setCallState('calling');
      let stream = localStreamRef.current;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
      }

      const pc = createPeerConnection();
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream!));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log('Sending RTC Offer');
      chatSocket.sendRTC('rtc:offer', offer);
      chatSocket.sendRTC('call:start', {});
    } catch (err: unknown) {
      console.error('Failed to start call', err);
      setCallState('error');
    }
  }, [createPeerConnection, callState]);

  const endCall = useCallback(() => {
    chatSocket.sendRTC('call:end', {});
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  // Initiator: start call when chatting begins
  useEffect(() => {
    if (mode !== 'voice' || (status !== 'matched' && status !== 'chatting')) return;
    let retryInterval: NodeJS.Timeout;

    if (!localStreamRef.current) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          localStreamRef.current = stream;
          console.log('Mic prewarmed');
        })
        .catch(e => console.error('Mic prewarm failed', e));
    }

    if (status === 'chatting' && isInitiator && !isStartingRef.current && callState === 'idle') {
      isStartingRef.current = true;

      const startFast = async () => {
        if (!localStreamRef.current) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
            console.log('Mic ready');
          } catch (e) {
            console.error('Mic failed', e);
          }
        }

        console.log('Voice session: Fast start initiated');
        await startCall();

        retryInterval = setInterval(async () => {
          if (
            pcRef.current &&
            (pcRef.current.connectionState === 'failed' || pcRef.current.connectionState === 'disconnected')
          ) {
            console.log('Connection dropped: aggressive retry...');
            await startCall();
          }
        }, 3000);
      };

      startFast();
    }

    return () => {
      clearInterval(retryInterval);
      isStartingRef.current = false;
    };
  }, [mode, status, isInitiator, startCall, callState]);

  // Handle incoming RTC messages
  useEffect(() => {
    if (!mode || mode !== 'voice' || status === 'idle' || status === 'searching') return;

    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      // Guard: don't process an offer if we're already handling one or connected
      if (handlingOfferRef.current) {
        console.log('Already handling an offer, ignoring duplicate');
        return;
      }
      if (callState === 'connected') {
        console.log('Ignoring offer - already connected');
        return;
      }

      console.log('Received RTC Offer');
      handlingOfferRef.current = true;

      const pc = createPeerConnection();
      pcRef.current = pc;

      try {
        let stream = localStreamRef.current;
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = stream;
        }
        stream.getTracks().forEach(track => pc.addTrack(track, stream!));

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log('Sending RTC Answer');
        chatSocket.sendRTC('rtc:answer', answer);

        console.log(`Processing ${iceQueue.current.length} queued ICE candidates`);
        for (const candidate of iceQueue.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Error adding queued candidate', e);
          }
        }
        iceQueue.current = [];
      } catch (e) {
        console.error('Error handling offer', e);
        handlingOfferRef.current = false;
      }
    };

    const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
      const pc = pcRef.current;
      if (!pc || pc.signalingState !== 'have-local-offer') {
        console.log('Ignoring answer - wrong state:', pc?.signalingState);
        return;
      }

      console.log('Received RTC Answer');
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (e) {
        console.error('Error setting remote answer', e);
      }
    };

    const handleCandidate = async (payload: RTCIceCandidateInit) => {
      const pc = pcRef.current;

      if (!pc || pc.signalingState === 'closed') {
        return;
      }

      if (!pc.remoteDescription) {
        console.log('Queueing ICE candidate', iceQueue.current.length);
        iceQueue.current.push(payload);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload));
      } catch (e) {
        console.error('Error adding ice candidate', e);
      }
    };

    const handleCallEnd = () => {
      cleanup();
    };

    const onOffer = (payload: unknown) => {
      void handleOffer(payload as RTCSessionDescriptionInit);
    };
    const onAnswer = (payload: unknown) => {
      void handleAnswer(payload as RTCSessionDescriptionInit);
    };
    const onCandidate = (payload: unknown) => {
      void handleCandidate(payload as RTCIceCandidateInit);
    };
    const onCallEnd = () => {
      handleCallEnd();
    };

    chatSocket.onMessage('rtc:offer', onOffer);
    chatSocket.onMessage('rtc:answer', onAnswer);
    chatSocket.onMessage('rtc:ice-candidate', onCandidate);
    chatSocket.onMessage('call:end', onCallEnd);

    return () => {
      chatSocket.offMessage('rtc:offer', onOffer);
      chatSocket.offMessage('rtc:answer', onAnswer);
      chatSocket.offMessage('rtc:ice-candidate', onCandidate);
      chatSocket.offMessage('call:end', onCallEnd);
    };
  }, [mode, status, createPeerConnection, cleanup, callState]);

  return {
    startCall,
    endCall,
    isMuted,
    toggleMute,
    callState,
    remoteAudioRef,
  };
}
