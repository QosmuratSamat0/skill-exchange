import { useEffect } from 'react';
import { useChatStore } from '@/store/chatStore';
import { api } from '@/lib/api';
import { chatSocket } from '@/lib/socket';

/**
 * Hook to fetch and manage partner profile data in real-time chat.
 * Subscribes to partner connection events and fetches profile info.
 * Updates store with partner online status and profile data.
 */
export function usePartnerProfile() {
  const partnerUserId = useChatStore((state) => state.partnerUserId);
  const { setPartnerProfile, setPartnerOnline } = useChatStore();

  useEffect(() => {
    if (!partnerUserId) {
      setPartnerProfile(null);
      setPartnerOnline(false);
      return;
    }

    const fetchPartnerProfile = async () => {
      try {
        const profile = await api.getPublicProfile(partnerUserId);
        setPartnerProfile(profile);
        setPartnerOnline(true);
      } catch (err) {
        console.error('[usePartnerProfile] Failed to fetch partner profile:', err);
        setPartnerProfile(null);
        setPartnerOnline(false);
      }
    };

    void fetchPartnerProfile();
  }, [partnerUserId, setPartnerProfile, setPartnerOnline]);

  // Listen for partner connection/disconnection events via WebSocket
  useEffect(() => {
    const handlePartnerConnected = () => {
      setPartnerOnline(true);
    };

    const handlePartnerDisconnected = () => {
      setPartnerOnline(false);
    };

    chatSocket.onMessage('partner_connected', handlePartnerConnected);
    chatSocket.onMessage('partner_disconnected', handlePartnerDisconnected);

    return () => {
      chatSocket.offMessage('partner_connected', handlePartnerConnected);
      chatSocket.offMessage('partner_disconnected', handlePartnerDisconnected);
    };
  }, [setPartnerOnline]);
}
