'use client';
import { useEffect, useState } from 'react';
import { ensureIdentity, firebaseAuthWarning } from '@/lib/room-store';

/**
 * The RTDB rules bind every write to `auth.uid`, so anonymous sign-in must be
 * enabled in the Firebase project. Without it the app still runs against a
 * project with open rules, but cross-device rooms will be denied — say so
 * instead of failing silently.
 */
export function AuthWarning() {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void ensureIdentity().finally(() => {
      if (alive) setReason(firebaseAuthWarning());
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!reason) return null;

  return (
    <div
      role="status"
      className="arcade-card w-full border-[#FFC53D]/40 p-3 text-center text-xs font-semibold text-[#FFC53D] sm:text-sm"
    >
      ⚠️ Firebase anonymous sign-in is unavailable ({reason}). Rooms will be denied until you enable
      Authentication → Sign-in method → Anonymous and deploy <code>database.rules.json</code> — see
      <span className="font-bold"> docs/FIREBASE_HARDENING.md</span>.
    </div>
  );
}
