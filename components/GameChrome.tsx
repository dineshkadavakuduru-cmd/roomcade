'use client';
import { useMemo } from 'react';
import { patchRoom, setLive } from '@/lib/room-store';

/**
 * Shared in-game chrome used by every GameScene so the header, phase indicator
 * and exit action look identical across all cartridges. Purely presentational —
 * it never touches game logic.
 */
export function GameHeader({
  name,
  accent,
  phase,
  round,
  playerCount,
}: {
  name: string;
  accent: string;
  phase?: string;
  round?: string | number;
  playerCount?: number;
}) {
  return (
    <div className="glass-card phase-fade mb-2 flex flex-wrap items-center gap-2 px-3 py-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
      <span className="font-display text-sm font-extrabold" style={{ color: accent }}>{name}</span>
      {round !== undefined && <span className="text-xs font-bold text-white/50">· {round}</span>}
      {phase && (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white/70">
          {phase}
        </span>
      )}
      {playerCount !== undefined && (
        <span className="ml-auto text-[11px] font-semibold text-white/45">👥 {playerCount} players</span>
      )}
    </div>
  );
}

/** Standard exit action: clear live state, return the room to the lobby. */
export async function leaveToLounge(roomCode: string) {
  await setLive(roomCode, null);
  await patchRoom(roomCode, { status: 'lobby', currentGameId: null });
}

export function ReturnToLounge({ roomCode, className = '' }: { roomCode: string; className?: string }) {
  return (
    <button
      onClick={() => void leaveToLounge(roomCode)}
      className={`btn-neon-secondary rounded-xl px-4 py-2 text-sm font-bold ${className}`}
    >
      🏠 Return to Lounge
    </button>
  );
}

/** CSS-only confetti burst for win screens (no JS animation loop). */
export function Confetti({ count = 28 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        delay: `${(i % 7) * 0.18}s`,
        duration: `${2.2 + (i % 5) * 0.35}s`,
        color: ['#FF6B35', '#FF3D81', '#FFC53D', '#34D399', '#38BDF8', '#8B5CF6'][i % 6]!,
        rotate: `${(i * 47) % 360}deg`,
      })),
    [count],
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: p.left,
            background: p.color,
            animationDelay: p.delay,
            animationDuration: p.duration,
            transform: `rotate(${p.rotate})`,
          }}
        />
      ))}
    </div>
  );
}
