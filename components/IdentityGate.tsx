'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ensureIdentity } from '@/lib/room-store';

/**
 * Resolve the player identity (anonymous Firebase auth when configured) *before*
 * any room UI mounts. RTDB rules bind writes to `auth.uid`, and game modules call
 * getSessionUid() synchronously at mount — so the identity must already be final
 * or a player would act under a stale id for the whole game.
 */
export function IdentityGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void ensureIdentity().finally(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" aria-busy="true" aria-live="polite">
        <div className="text-center">
          <div className="font-display text-2xl font-extrabold text-[#FFC53D]">ROOMCADE</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[.25em] text-white/50">Warming up the arcade…</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
