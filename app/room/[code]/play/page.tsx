'use client';
import React, { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSessionUid, patchRoom, subscribeRoom } from '@/lib/room-store';
import { GAMES, LazyGameScene } from '@/games';
import { Scoreboard } from '@/components/Scoreboard';
import { PortalTransition } from '@/components/PortalTransition';
import type { RoomMeta } from '@/lib/types';

interface ErrorBoundaryProps {
  children: ReactNode;
  onBackToLobby: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GameErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Roomcade Game Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="arcade-card flex h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="font-display text-2xl font-extrabold text-[#FB4D6D]">Arcade Glitch Detected</div>
          <p className="max-w-md text-sm text-white/70">
            {this.state.error?.message || 'Something went wrong rendering this game cartridge.'}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn-neon rounded-xl px-4 py-2 text-sm font-bold"
            >
              🔄 Reload cartridge
            </button>
            <button
              onClick={this.props.onBackToLobby}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
            >
              ‹ Back to lounge
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Play() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code ?? '').toUpperCase();
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => subscribeRoom(code, setRoom), [code]);

  // If host resets to lobby, everyone warps back through the same portal.
  useEffect(() => {
    if (room && room.status === 'lobby') setLeaving(true);
  }, [room?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const gameId = room?.currentGameId;
  const game = gameId ? GAMES[gameId] : null;

  const quitToLobby = () => {
    if (room && room.hostId === getSessionUid()) patchRoom(code, { status: 'lobby', currentGameId: null });
    else router.push(`/room/${code}`);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-2 px-4 py-3">
      <header className="flex items-center gap-2">
        <button onClick={() => setLeaving(true)} className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20">‹ Lobby</button>
        <div className="font-display text-lg font-extrabold" style={{ color: game?.accent ?? '#fff' }}>
          {game?.displayName ?? 'Loading game…'}
        </div>
        <div className="room-code ml-auto text-lg font-bold text-white/60">{code}</div>
      </header>
      <div className="min-h-[70vh] flex-1">
        <GameErrorBoundary key={gameId ?? 'empty'} onBackToLobby={quitToLobby}>
          <Suspense fallback={<div className="arcade-card flex h-[60vh] items-center justify-center font-display text-xl font-bold text-white/60">Warping in…</div>}>
            {gameId ? <LazyGameScene id={gameId} roomCode={code} /> : <div className="arcade-card p-6 text-center text-white/60">No game selected — head back to the lobby.</div>}
          </Suspense>
        </GameErrorBoundary>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_280px]">
        <div className="arcade-card flex flex-wrap gap-2 p-3">
          {(room?.players ?? []).map((p) => (
            <span key={p.uid} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-semibold">{p.name} · {p.score}</span>
          ))}
        </div>
        <Scoreboard players={room?.players ?? []} compact />
      </div>
      <PortalTransition active={leaving} label="Back to lounge…" onDone={() => { setLeaving(false); quitToLobby(); }} />
    </main>
  );
}
