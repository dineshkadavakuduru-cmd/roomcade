'use client';
import { useEffect, useState, useCallback } from 'react';
import { ensureIdentity, firebaseAuthWarning, retryAuth } from '@/lib/room-store';

/**
 * Surface a user-friendly banner when the multiplayer backend is unavailable.
 * Internal details (auth error codes, config file names) are logged to the
 * console for operators; users just see "service unavailable" + a retry button.
 */
export function AuthWarning() {
  const [reason, setReason] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let alive = true;
    void ensureIdentity().finally(() => {
      if (alive) {
        const r = firebaseAuthWarning();
        setReason(r);
        if (r) console.warn('[Roomcade] Anonymous auth failed:', r, '— see docs/FIREBASE_HARDENING.md');
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await retryAuth();
      setReason(firebaseAuthWarning());
    } finally {
      setRetrying(false);
    }
  }, []);

  if (!reason) return null;

  return (
    <div
      role="status"
      className="arcade-card w-full border-[#FFC53D]/40 p-3 text-center text-xs font-semibold text-[#FFC53D] sm:text-sm"
    >
      <p>
        ⚠️ Multiplayer is temporarily unavailable — the room service could not connect.
        Creating or joining rooms will not work until the connection is restored.
      </p>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#FFC53D]/20 px-3 py-1.5 text-xs font-bold text-[#FFC53D] transition-colors hover:bg-[#FFC53D]/30 disabled:opacity-50"
      >
        {retrying ? (
          <>
            <span className="flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#FFC53D] border-t-transparent" />
            Reconnecting…
          </>
        ) : (
          'Retry connection'
        )}
      </button>
    </div>
  );
}
