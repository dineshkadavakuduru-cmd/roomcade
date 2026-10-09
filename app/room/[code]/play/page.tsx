'use client';
import React, { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSessionUid, patchRoom, setLive, subscribeRoom } from '@/lib/room-store';
import { GAMES, LazyGameScene } from '@/games';
import { Scoreboard } from '@/components/Scoreboard';
import { PortalTransition } from '@/components/PortalTransition';
import type { RoomMeta } from '@/lib/types';
import { AvatarIcon } from '@/components/AvatarIcons';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';

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

  const quitToLobby = async () => {
    try {
      if (room && room.hostId === getSessionUid()) {
        await setLive(code, null);
        await patchRoom(code, { status: 'lobby', currentGameId: null });
      }
    } catch (e) {
      console.error('Error exiting to lobby:', e);
    } finally {
      router.push(`/room/${code}`);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-2 px-4 py-3">
      <header className="flex items-center gap-2">
        <button onClick={() => setLeaving(true)} className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20">‹ Lobby</button>
        <div className="font-display text-lg font-extrabold" style={{ color: game?.accent ?? '#fff' }}>
          {game?.displayName ?? 'Loading game…'}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ConnectionIndicator roomCode={code} />
          <div className="room-code text-lg font-bold text-white/60">{code}</div>
        </div>
      </header>
      <div className="min-h-[70vh] flex-1">
        <GameErrorBoundary key={gameId ?? 'empty'} onBackToLobby={quitToLobby}>
          <Suspense fallback={<div className="arcade-card flex h-[60vh] items-center justify-center font-display text-xl font-bold text-white/60">Warping in…</div>}>
            {!room ? (
              <div className="arcade-card flex h-[60vh] items-center justify-center font-display text-xl font-bold text-white/60">Warping in…</div>
            ) : gameId ? (
              <LazyGameScene id={gameId} roomCode={code} />
            ) : (
              <div className="arcade-card p-6 text-center text-white/60">No game selected — head back to the lobby.</div>
            )}
          </Suspense>
        </GameErrorBoundary>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_280px]">
        <div className="arcade-card flex flex-wrap items-center gap-2.5 p-3">
          {(room?.players ?? []).map((p) => {
            const isMe = p.uid === getSessionUid();
            const isThisHost = p.uid === room?.hostId;
            return (
              <div
                key={p.uid}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-all ${
                  isMe ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/5'
                }`}
              >
                <span className="relative flex items-center">
                  <span
                    data-player-avatar={p.uid}
                    className="flex h-7 w-7 items-center justify-center rounded-full border text-xs shadow-sm"
                    style={{
                      background: p.avatarColor,
                      borderColor: p.avatarColor,
                      boxShadow: `0 0 8px ${p.avatarColor}88`,
                    }}
                  >
                    <AvatarIcon color={p.avatarId ?? p.avatarColor} size={16} />
                  </span>
                  {isThisHost && (
                    <span className="absolute -right-1.5 -top-1.5 text-[10px] leading-none" title="Host" aria-label="Host">
                      👑
                    </span>
                  )}
                </span>
                <span className="text-xs font-bold text-white">{p.name} {isMe && <span className="text-[10px] text-white/50">(You)</span>}</span>
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-extrabold text-[#FFC53D]">
                  {p.score}
                </span>
              </div>
            );
          })}
        </div>
        <Scoreboard players={room?.players ?? []} compact />
      </div>
      <PortalTransition active={leaving} label="Back to lounge…" onDone={() => { setLeaving(false); quitToLobby(); }} />
    </main>
  );
}
