'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { firebaseConfigured, getFirebase } from '@/lib/firebase';
import { ref, onValue, onDisconnect, set, type Unsubscribe, type Database } from 'firebase/database';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected' | 'room-full' | 'room-not-found';

interface UseConnectionStatusOptions {
  roomCode?: string;
  onStatusChange?: (status: ConnectionStatus) => void;
}

export function useConnectionStatus({ roomCode, onStatusChange }: UseConnectionStatusOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isOnline, setIsOnline] = useState(true);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const rtdbRef = useRef<Database | null>(null);
  const roomCodeRef = useRef(roomCode);
  const statusRef = useRef(status);
  const isOnlineRef = useRef(isOnline);

  roomCodeRef.current = roomCode;
  statusRef.current = status;
  isOnlineRef.current = isOnline;

  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    if (statusRef.current !== newStatus) {
      statusRef.current = newStatus;
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    }
  }, [onStatusChange]);

  // Browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (roomCodeRef.current && firebaseConfigured()) {
        updateStatus('reconnecting');
        // Re-subscribe will happen via the roomCode effect
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      updateStatus('disconnected');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [updateStatus]);

  // Firebase connection monitoring
  useEffect(() => {
    if (!firebaseConfigured() || !roomCode) {
      if (!firebaseConfigured()) {
        updateStatus('connected'); // Local mode is always "connected" for same-tab
      }
      return;
    }

    const fb = getFirebase();
    if (!fb?.rtdb) return;
    rtdbRef.current = fb.rtdb;

    // Monitor .info/connected
    const connectedRef = ref(fb.rtdb, '.info/connected');
    const connectedUnsub = onValue(connectedRef, (snap) => {
      const connected = snap.val() === true;
      if (!connected) {
        updateStatus('reconnecting');
      } else if (isOnlineRef.current) {
        updateStatus('connected');
      }
    });

    // Monitor room existence
    const roomRef = ref(fb.rtdb, `rooms/${roomCode}/meta`);
    const roomUnsub = onValue(roomRef, (snap) => {
      if (!snap.exists()) {
        updateStatus('room-not-found');
      } else if (statusRef.current === 'room-not-found') {
        updateStatus('reconnecting');
      }
    });

    return () => {
      connectedUnsub();
      roomUnsub();
    };
  }, [roomCode, updateStatus]);

  return status;
}

export function ConnectionIndicator({ roomCode }: { roomCode?: string }) {
  const status = useConnectionStatus({ roomCode });
  
  const statusConfig: Record<ConnectionStatus, { label: string; color: string; icon: string }> = {
    connected: { label: 'CONNECTED', color: '#34D399', icon: '●' },
    reconnecting: { label: 'RECONNECTING', color: '#FFC53D', icon: '◐' },
    disconnected: { label: 'DISCONNECTED', color: '#FB4D6D', icon: '○' },
    'room-full': { label: 'ROOM FULL', color: '#FB4D6D', icon: '⛔' },
    'room-not-found': { label: 'ROOM NOT FOUND', color: '#FB4D6D', icon: '🔍' },
  };

  const config = statusConfig[status];
  
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`relative flex h-2 w-2 rounded-full connection-dot ${status === 'reconnecting' ? 'connection-pulse' : ''}`}
        style={{
          background: config.color,
          boxShadow: `0 0 8px ${config.color}, 0 0 16px ${config.color}80`,
        }}
      />
      <span className="font-display text-xs font-extrabold tracking-wider text-white/90" style={{ color: config.color }}>
        {config.label}
      </span>
    </div>
  );
}