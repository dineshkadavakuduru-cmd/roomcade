'use client';

import { useEffect, useState } from 'react';

export function RoomProgress({ step, error, onRetry }: {
  step: string;
  error?: string;
  onRetry?: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 2500);
    return () => window.clearTimeout(timer);
  }, [step]);

  return (
    <div className="arcade-card my-2 space-y-2 px-3 py-2 text-sm">
      <p role="status" className="font-semibold text-white/85">
        {step}
        {!error && slow && ' This step is taking longer than expected.'}
      </p>
      {error && <p role="alert" className="text-[#FF9CAC]">{error}</p>}
      {onRetry && (error || slow) && (
        <button type="button" onClick={onRetry} className="btn-ghost min-h-[44px] px-3 font-bold">Retry</button>
      )}
    </div>
  );
}

export function joinFailure(error: unknown) {
  switch ((error as Error)?.message) {
    case 'ROOM_NOT_FOUND': return 'Room not found. Check the code or ask the host for a new invite.';
    case 'ROOM_FULL': return 'The room is full (8 players max).';
    case 'ROOM_ENDED': return 'That game night has ended.';
    case 'AUTH_REQUIRED':
    case 'identity-timeout': return 'Could not connect to the room service. Check your connection and retry.';
    case 'JOIN_DENIED': return 'The room service rejected the join. Check the code and retry.';
    case 'JOIN_TIMEOUT': return 'The room service did not respond in time. Check your connection and retry.';
    default: return 'Could not join the room. Check your connection and retry.';
  }
}
