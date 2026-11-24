'use client';
import React, { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import {
  claimHostIfMissing,
  ensureIdentity,
  ensureLiveInitialized,
  getSessionUid,
  joinRoom,
  leaveRoom,
  patchRoom,
  setLive,
  subscribeRoom,
  subscribeLive,
} from '@/lib/room-store';
import { GAMES, LazyGameScene } from '@/games';
import { Scoreboard } from '@/components/Scoreboard';
import { PortalTransition } from '@/components/PortalTransition';
import type { RoomMeta } from '@/lib/types';
import { HOST_GRACE_MS } from '@/lib/room-logic';
import { AvatarIcon } from '@/components/AvatarIcons';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';
import { RoomProgress, joinFailure } from '@/components/RoomProgress';
import { useRoomNavigation } from '@/lib/use-room-navigation';

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
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => location.reload()}
              className="btn-neon min-h-[44px] rounded-xl px-4 py-2 text-sm font-bold"
            >
              🔄 Reload cartridge
            </button>
            <button
              onClick={this.props.onBackToLobby}
              className="min-h-[44px] rounded-xl bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20"
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

type LeaveIntent = 'lobby' | 'home' | 'server' | null;

export default function Play() {
  const params = useParams();
  const navigate = useRoomNavigation();
  const code = String(params.code ?? '').toUpperCase();
  const [uid, setUid] = useState(() => (typeof window === 'undefined' ? '' : getSessionUid()));
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [liveReady, setLiveReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [joinStep, setJoinStep] = useState('Joining the game room…');
  const [joining, setJoining] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const intentRef = useRef<LeaveIntent>(null);
  const joinTried = useRef(false);
  const hostClaimAt = useRef(0);

  useEffect(() => {
    let alive = true;
    void ensureIdentity().then((u) => {
      if (alive) setUid(u);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => subscribeRoom(code, (nextRoom) => {
    setRoom(nextRoom);
    setRoomLoaded(true);
  }, () => setLoadError('Could not read the room. Check your connection and retry.')), [code, attempt]);

  useEffect(() => subscribeLive(code, (state) => {
    setLiveReady(Boolean(state));
  }, () => setLoadError('Could not read the shared game state. Check your connection and retry.')), [code, attempt]);

  // Deep links land on /play without ever passing through the lounge; rejoin so
  // the player exists before any game state write (rules require membership).
  useEffect(() => {
    if (!room || !uid) return;
    if (room.players.some((p) => p.uid === uid)) {
      joinTried.current = false;
      return;
    }
    if (joinTried.current) return;
    joinTried.current = true;
    setJoining(true);
    const name = sessionStorage.getItem('roomcade:name') || `Guest-${uid.slice(-4)}`;
    const avatar =
      sessionStorage.getItem('roomcade:avatarId') || sessionStorage.getItem('roomcade:color') || '#FF6B35';
    void joinRoom(code, name, avatar, setJoinStep)
      .catch((error) => setLoadError(joinFailure(error)))
      .finally(() => setJoining(false));
  }, [room, uid, code, attempt]);

  // Host migration: the host's onDisconnect removes their player node, which
  // leaves hostId dangling. Give the host a grace window first — a reload briefly
  // removes the node too, and migrating instantly would end the game.
  const hostMissingSince = useRef<number | null>(null);
  useEffect(() => {
    if (!room) return;
    if (room.players.some((p) => p.uid === room.hostId)) {
      hostMissingSince.current = null;
      return;
    }
    if (hostMissingSince.current === null) hostMissingSince.current = Date.now();
    if (Date.now() - hostMissingSince.current < HOST_GRACE_MS) return;
    if (Date.now() - hostClaimAt.current < 4000) return;
    hostClaimAt.current = Date.now();
    void claimHostIfMissing(code, room);
  }, [code, room]);

  // Every game gets a safe initial shared state the moment the room enters play.
  // Seeding is a transaction, so two clients can't disagree on random setup
  // (werewolf roles, who is "it" in tag, fogduel's first turn).
  useEffect(() => {
    if (!room || room.status !== 'in-game' || !room.currentGameId) return;
    const game = GAMES[room.currentGameId];
    if (!game || room.players.length < game.minPlayers || !room.players.some((p) => p.uid === uid)) return;
    const uids = room.players.map((p) => p.uid);
    void ensureLiveInitialized(code, () => game.initState(uids, room.hostId))
      .catch(() => setLoadError('Could not synchronize the cartridge. Check your connection and retry.'));
  }, [code, room?.status, room?.currentGameId, room?.players.map((p) => p.uid).join(','), uid, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // If host resets to lobby, everyone warps back through the same portal.
  useEffect(() => {
    if (room && room.status === 'lobby' && !leaving) {
      intentRef.current = 'server';
      setLeaving(true);
    }
  }, [room?.status, leaving]); // eslint-disable-line react-hooks/exhaustive-deps

  const gameId = room?.currentGameId;
  const game = gameId ? GAMES[gameId] : null;
  const isHost = !!room && room.hostId === uid;
  const understaffed = !!room && !!game && room.players.length > 0 && room.players.length < game.minPlayers;
  const isMember = room?.players.some((p) => p.uid === uid);
  const loadStep = !room ? 'Finding the room…' : !isMember || joining ? joinStep : 'Synchronizing the game…';
  const retry = () => {
    joinTried.current = false;
    setLoadError('');
    setAttempt((value) => value + 1);
  };

  const finishLeaving = async () => {
    const intent = intentRef.current;
    setLeaving(false);
    intentRef.current = null;
    if (intent === 'home') {
      await leaveRoom(code);
      navigate('/');
      return;
    }
    if (intent === 'lobby' && isHost) {
      try {
        await setLive(code, null);
        await patchRoom(code, { status: 'lobby', currentGameId: null });
      } catch (e) {
        console.error('Error exiting to lobby:', e);
      }
    }
    navigate(`/room/${code}`);
  };

  const requestHostLobby = () => {
    intentRef.current = 'lobby';
    setLeaving(true);
  };
  const requestLeaveRoom = () => {
    intentRef.current = 'home';
    setLeaving(true);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-2 px-3 py-3 sm:px-4">
      <header className="flex flex-nowrap items-center gap-2">
        {isHost ? (
          <button
            onClick={requestHostLobby}
            className="min-h-[44px] shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20"
          >
            ‹ Lobby
          </button>
        ) : (
          <button
            onClick={requestLeaveRoom}
            className="min-h-[44px] shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20"
            aria-label="Leave room"
          >
            ✕ Leave
          </button>
        )}
        <div className="min-w-0 flex-1 truncate font-display text-base font-extrabold sm:text-lg" style={{ color: game?.accent ?? '#fff' }}>
          {game?.displayName ?? 'Loading game…'}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <ConnectionIndicator roomCode={code} />
          <div className="room-code hidden text-lg font-bold text-white/60 sm:block">{code}</div>
        </div>
      </header>

      {understaffed && game && (
        <div className="arcade-card flex flex-wrap items-center gap-2 border-[#FB4D6D]/40 p-3 text-sm">
          <span className="font-bold text-[#FB4D6D]">
            {room!.players.length}/{game.minPlayers} players — someone left, {game.displayName} is paused.
          </span>
          <span className="text-white/60">They can rejoin with code {code}.</span>
          {isHost && (
            <button
              onClick={requestHostLobby}
              className="ml-auto min-h-[44px] rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20"
            >
              End round & back to lounge
            </button>
          )}
        </div>
      )}

      <div className="min-h-[60vh] flex-1">
        <GameErrorBoundary key={gameId ?? 'empty'} onBackToLobby={requestHostLobby}>
          <Suspense fallback={<RoomProgress step="Loading the cartridge…" onRetry={() => location.reload()} />}>
            {roomLoaded && !room ? (
              <RoomProgress step="Finding the room…" error="Room not found. Check your code with the host." onRetry={retry} />
            ) : !room || !isMember || joining || loadError || (game && !liveReady) ? (
              <RoomProgress key={attempt} step={loadStep} error={loadError}
                onRetry={joining ? undefined : retry} />
            ) : gameId && game && room.status === 'in-game' ? (
              <LazyGameScene id={gameId} roomCode={code} />
            ) : (
              <div className="arcade-card p-6 text-center text-white/60">No game selected — head back to the lobby.</div>
            )}
          </Suspense>
        </GameErrorBoundary>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_280px]">
        <div className="arcade-card flex flex-wrap items-center gap-2 p-2.5 sm:gap-2.5 sm:p-3">
          {(room?.players ?? []).map((p) => {
            const isMe = p.uid === uid;
            const isThisHost = p.uid === room?.hostId;
            return (
              <div
                key={p.uid}
                className={`flex min-w-0 max-w-full items-center gap-1.5 rounded-xl border px-2 py-1.5 transition-all sm:gap-2 sm:px-2.5 ${
                  isMe ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/5'
                }`}
              >
                <span className="relative flex shrink-0 items-center">
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
                <span className="max-w-[7.5rem] truncate text-xs font-bold text-white sm:max-w-[10rem]">
                  {p.name} {isMe && <span className="text-[10px] text-white/50">(You)</span>}
                </span>
                <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-extrabold text-[#FFC53D]">
                  {p.score}
                </span>
              </div>
            );
          })}
        </div>
        <Scoreboard players={room?.players ?? []} compact />
      </div>

      <PortalTransition active={leaving} label={intentRef.current === 'home' ? 'Leaving room…' : 'Back to lounge…'} onDone={finishLeaving} />
    </main>
  );
}
