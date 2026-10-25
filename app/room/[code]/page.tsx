'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { AVATAR_COLORS, type RoomMeta } from '@/lib/types';
import { HOST_GRACE_MS } from '@/lib/room-logic';
import {
  claimHostIfMissing,
  ensureIdentity,
  getSessionUid,
  joinRoom,
  leaveRoom,
  patchRoom,
  pruneGhosts,
  setLive,
  subscribeRoom,
  touchRoom,
} from '@/lib/room-store';
import { GAME_LIST } from '@/games';
import { GAME_META, GAME_META_MAP } from '@/lib/games';
import { LobbyScene } from '@/components/LobbyScene';
import { Scoreboard } from '@/components/Scoreboard';
import { RecapPodium } from '@/components/RecapPodium';
import { PortalTransition } from '@/components/PortalTransition';
import { popIn } from '@/lib/anime';
import { AvatarIcon } from '@/components/AvatarIcons';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';
import { AuthWarning } from '@/components/AuthWarning';

const PreviewCanvas = ({ id }: { id: string }) => {
  const game = GAME_LIST.find((g) => g.id === id)!;
  const P = game.LobbyPreviewScene;
  return (
    <Canvas camera={{ position: [0, 0.6, 2.6], fov: 45 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.8} />
      <pointLight position={[2, 3, 2]} intensity={12} color={game.accent} />
      <P />
    </Canvas>
  );
};

export default function Lobby() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code ?? '').toUpperCase();
  const [uid, setUid] = useState(() => (typeof window === 'undefined' ? '' : getSessionUid()));
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [ended, setEnded] = useState(false);
  const [full, setFull] = useState(false);
  const [sel, setSel] = useState(0);
  const [warp, setWarp] = useState(false);
  const [starting, setStarting] = useState(false);
  const [recap, setRecap] = useState(false);
  const [recapHidden, setRecapHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinDing, setJoinDing] = useState(false);
  const prevCount = useRef(0);
  const lastJoinAt = useRef(0);
  const hostClaimAt = useRef(0);
  const prunedOnce = useRef(false);

  const me = room?.players.find((p) => p.uid === uid);
  const isHost = !!room && room.hostId === uid;

  useEffect(() => {
    let alive = true;
    void ensureIdentity().then((u) => {
      if (alive) setUid(u);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Self-heal: if this tab has no player entry (refresh, rejoin, migrated host),
  // auto-join with the saved identity. Throttled so a failing join can't spin.
  useEffect(() => subscribeRoom(code, (m) => {
    setRoom(m);
    setMissing(!m);
    if (!m) return;
    if (!uid || m.players.some((p) => p.uid === uid)) return;
    if (Date.now() - lastJoinAt.current < 5000) return;
    lastJoinAt.current = Date.now();
    const n = sessionStorage.getItem('roomcade:name') || `Guest-${uid.slice(-4)}`;
    const savedAvatar =
      sessionStorage.getItem('roomcade:avatarId') || sessionStorage.getItem('roomcade:color') || AVATAR_COLORS[2]!;
    joinRoom(code, n, savedAvatar).catch((e: any) => {
      if (e?.message === 'ROOM_ENDED') setEnded(true);
      else if (e?.message === 'ROOM_FULL') setFull(true);
    });
  }), [code, uid]);

  // Host left / dropped: the first remaining client takes over so the room never
  // gets stuck with a host that isn't in the player list. A reload also fires
  // onDisconnect, so wait out a grace window before stealing hostship.
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

  // Host heartbeat keeps an active room out of TTL cleanup; host-only ghost sweep
  // removes players whose tab died without a clean onDisconnect.
  useEffect(() => {
    if (!room) return;
    const t = window.setInterval(() => {
      if (room.hostId === uid) void touchRoom(code);
    }, 60_000);
    return () => window.clearInterval(t);
  }, [code, room?.hostId, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!room || room.hostId !== uid || room.status !== 'lobby' || prunedOnce.current) return;
    prunedOnce.current = true;
    void pruneGhosts(code, room);
  }, [code, room, uid]);

  // Follow host into the game + back.
  useEffect(() => {
    if (!room) return;
    if (room.status === 'in-game' && room.currentGameId) {
      setWarp(true);
    }
  }, [room?.status, room?.currentGameId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { popIn('.lobby-pop'); }, [room?.players.length]);

  // Visual "ding" when a new player joins (CSS animation, no audio).
  useEffect(() => {
    const n = room?.players.length ?? 0;
    if (prevCount.current && n > prevCount.current) {
      setJoinDing(true);
      const t = window.setTimeout(() => setJoinDing(false), 700);
      prevCount.current = n;
      return () => window.clearTimeout(t);
    }
    prevCount.current = n;
  }, [room?.players.length]);

  // Synchronize cartridge selection across all players via room.selectedGameId
  useEffect(() => {
    if (room?.selectedGameId) {
      const idx = GAME_LIST.findIndex((g) => g.id === room.selectedGameId);
      if (idx >= 0) setSel(idx);
    }
  }, [room?.selectedGameId]);

  useEffect(() => {
    if (room?.status !== 'recap') setRecapHidden(false);
  }, [room?.status]);

  const copyInvite = () => {
    navigator.clipboard?.writeText(`${location.origin}/room/${code}`).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const game = GAME_LIST[sel % GAME_LIST.length]!;
  const playerCount = room?.players.length ?? 0;
  const eligible = room ? playerCount >= game.minPlayers && playerCount <= game.maxPlayers : false;
  const tooManyPlayers = room ? playerCount > game.maxPlayers : false;

  const selectGame = (index: number) => {
    const next = (index + GAME_LIST.length) % GAME_LIST.length;
    setSel(next);
    if (isHost) {
      void patchRoom(code, { selectedGameId: GAME_LIST[next]!.id });
    }
  };

  const selectGameById = (id: string) => {
    const idx = GAME_LIST.findIndex((g) => g.id === id);
    if (idx >= 0) {
      setSel(idx);
      if (isHost) {
        void patchRoom(code, { selectedGameId: id });
      }
    }
  };

  const startGame = async () => {
    if (!isHost || !eligible || starting) return;
    setStarting(true);
    try {
      await setLive(code, null);
      await patchRoom(code, { status: 'in-game', currentGameId: game.id, selectedGameId: game.id });
      setWarp(true);
    } catch (e) {
      console.error('Could not start game:', e);
    } finally {
      window.setTimeout(() => setStarting(false), 900);
    }
  };

  const goPlay = () => {
    router.push(`/room/${code}/play`);
  };

  const backToLobby = async () => {
    await setLive(code, null);
    await patchRoom(code, { status: 'lobby', currentGameId: null });
  };
  const endNight = () => patchRoom(code, { status: 'recap' });

  if (ended) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="font-display text-3xl font-extrabold">Room {code} has ended</div>
        <p className="text-white/60">That night is over — the recap is final. Start a fresh room to play again.</p>
        <button onClick={() => router.push('/')} className="btn-neon min-h-[44px] rounded-xl px-5 py-2.5 font-bold">
          Start a new room
        </button>
      </main>
    );
  }

  if (missing) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="font-display text-3xl font-extrabold">Room {code} not found</div>
        <p className="text-white/60">This room has ended or the code is wrong. Double-check the code, or start a fresh room to play.</p>
        <button onClick={() => router.push('/')} className="btn-neon min-h-[44px] rounded-xl px-5 py-2.5 font-bold">Back home</button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
      <header className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[.2em] text-white/50 sm:text-xs sm:tracking-[.25em]">Roomcade · room code</div>
          <div className="room-code font-display text-2xl font-extrabold text-[#FFC53D] sm:text-3xl">{code}</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <ConnectionIndicator roomCode={code} />
          {me && (
            <span className="arcade-card flex min-w-0 max-w-[11rem] items-center gap-1.5 px-2.5 py-1.5 text-sm font-semibold sm:max-w-[16rem] sm:px-3">
              <AvatarIcon color={me.avatarId ?? me.avatarColor} size={18} />
              <span className="truncate">{me.name}</span>
              {isHost && <span className="shrink-0 text-[10px] font-extrabold text-[#FFC53D]">HOST</span>}
            </span>
          )}
          <button
            onClick={copyInvite}
            className={`min-h-[44px] rounded-xl px-3 py-1.5 text-sm font-bold transition-all ${copied ? 'bg-[#34D399]/30 text-[#34D399] ring-1 ring-[#34D399]' : 'bg-white/10 hover:bg-white/20'}`}
          >
            {copied ? '✓ Copied!' : 'Copy invite link'}
          </button>
          <button
            onClick={async () => { await leaveRoom(code); router.push('/'); }}
            className="min-h-[44px] rounded-xl bg-white/5 px-3 py-1.5 text-sm font-bold text-white/70 hover:bg-white/15"
          >
            Leave
          </button>
        </div>
      </header>

      <AuthWarning />

      {full && (
        <div className="arcade-card border-[#FB4D6D]/40 p-3 text-sm font-semibold text-[#FB4D6D]">
          This room is full (8 players max). Ask someone to leave, or start your own room.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[46vh] min-h-[300px] max-h-[62vh] overflow-hidden rounded-2xl border border-white/10 landscape:h-[38vh] landscape:min-h-[200px] lg:h-[62vh] lg:min-h-[340px]">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-white/50">Loading lounge…</div>}>
            <LobbyScene players={room?.players ?? []} cartridges={GAME_META.map((g) => ({ id: g.id, label: g.displayName, color: g.accent }))} />
          </Suspense>
          <div className="absolute bottom-3 left-2 right-2 flex items-stretch gap-1.5 sm:left-3 sm:right-3 sm:gap-2">
            <button
              onClick={() => selectGame(sel - 1)}
              aria-label="Previous game"
              className="arcade-card flex h-11 w-11 shrink-0 items-center justify-center text-lg font-bold hover:bg-white/20"
            >
              ‹
            </button>
            <div
              className="arcade-card lobby-pop min-w-0 flex-1 cursor-pointer px-2 py-2 text-center ring-2 ring-white/25 sm:px-3"
              data-active-game={game.id}
              onClick={() => selectGame(sel + 1)}
              role="button"
              tabIndex={0}
              aria-label={`${game.displayName}. Next game`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectGame(sel + 1);
                }
              }}
            >
              <span className="font-display text-sm font-extrabold sm:text-base" style={{ color: game.accent }}>{game.displayName}</span>
              <span className="ml-1 hidden text-xs text-white/60 sm:inline">· {game.tagline} · {game.minPlayers}–{game.maxPlayers} players</span>
              <div className="truncate text-[11px] text-white/55 sm:hidden">
                {game.tagline} · {game.minPlayers}–{game.maxPlayers}p
              </div>
              {!eligible && tooManyPlayers && <span className="text-[11px] font-bold text-[#FB4D6D]">max {game.maxPlayers} players for this game</span>}
              {!eligible && !tooManyPlayers && <span className="text-[11px] font-bold text-[#FFC53D]">needs {game.minPlayers}+ players</span>}
            </div>
            <button
              onClick={() => selectGame(sel + 1)}
              aria-label="Next game"
              className="arcade-card flex h-11 w-11 shrink-0 items-center justify-center text-lg font-bold hover:bg-white/20"
            >
              ›
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="arcade-card h-32 overflow-hidden p-2 sm:h-40">
            <PreviewCanvas id={game.id} />
          </div>
          {isHost ? (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={startGame}
                disabled={!eligible || starting}
                className={`btn-neon min-h-[48px] w-full px-4 py-3 font-display text-base font-extrabold sm:text-lg ${!eligible || starting ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {starting
                  ? 'Warping…'
                  : eligible
                  ? `▶ Start ${game.displayName}`
                  : tooManyPlayers
                  ? `Max ${game.maxPlayers} players for ${game.displayName}`
                  : `Need ${game.minPlayers}+ players to start`}
              </button>
              {!eligible && (
                <span className="text-center text-xs font-medium text-white/50">
                  {tooManyPlayers
                    ? `${playerCount} in the lounge · ${game.displayName} supports max ${game.maxPlayers} players`
                    : `${playerCount} in the lounge · ${game.displayName} needs ${game.minPlayers}+ players`}
                </span>
              )}
            </div>
          ) : (
            <div className="arcade-card p-3 text-center text-sm text-white/70">
              {eligible
                ? `Waiting for host to start… Cartridge: ${game.displayName}`
                : tooManyPlayers
                ? `${game.displayName} supports max ${game.maxPlayers} players (${playerCount} in lounge)`
                : `Waiting for host… Cartridge: ${game.displayName} (${game.minPlayers} players for party)`}
            </div>
          )}
          <Scoreboard players={room?.players ?? []} compact />
          {isHost && (
            <div className="flex gap-2">
              <button onClick={backToLobby} className="min-h-[44px] flex-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20">Reset to lobby</button>
              <button onClick={endNight} className="min-h-[44px] flex-1 rounded-xl bg-[#FFC53D]/20 px-3 py-2 text-xs font-bold text-[#FFC53D] hover:bg-[#FFC53D]/30">🏆 End night & recap</button>
            </div>
          )}
          <button onClick={() => setRecap(true)} className="min-h-[44px] rounded-xl bg-white/5 px-3 py-2 text-xs font-bold text-white/60 hover:bg-white/15">Preview recap podium</button>
        </div>
      </div>

      <div className="arcade-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-1 pb-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[.2em] text-white/50 sm:text-xs">Arcade Cartridge Rack</span>
            <h2 className="font-display text-base font-extrabold text-white sm:text-lg">Choose Any Game Cartridge ({GAME_META.length} Games)</h2>
          </div>
          <span className="text-[11px] text-white/60 sm:text-xs">Tap a cartridge to switch</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-5">
          {GAME_META.map((g) => {
            const gameModule = GAME_LIST.find((gm) => gm.id === g.id)!;
            const isCurrent = gameModule.id === game.id;
            const tooMany = !!room && room.players.length > g.maxPlayers;
            return (
              <button
                key={g.id}
                data-game-cartridge={g.id}
                onClick={() => selectGameById(g.id)}
                className={`arcade-card tilt-card relative flex min-h-[88px] flex-col items-start p-3 text-left ${
                  isCurrent ? 'ring-2 ring-white shadow-lg' : tooMany ? 'opacity-50' : 'opacity-70 hover:opacity-100'
                }`}
                style={{
                  boxShadow: isCurrent ? `0 0 16px ${g.accent}88, inset 0 -2px 0 ${g.accent}` : `inset 0 -2px 0 ${g.accent}55`,
                  borderColor: isCurrent ? g.accent : undefined,
                }}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="h-2 w-6 rounded-full" style={{ background: g.accent }} />
                  {isCurrent && <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-extrabold text-white">ACTIVE</span>}
                </div>
                <div className="font-display mt-2 line-clamp-2 text-sm font-extrabold text-white">{g.displayName}</div>
                <div className="line-clamp-1 text-xs text-white/60">{g.tagline}</div>
                <div className="mt-1 text-[11px] font-semibold" style={{ color: tooMany ? '#FB4D6D' : 'rgba(255,255,255,.5)' }}>
                  {tooMany ? `⛔ Max ${g.maxPlayers} (${room?.players.length ?? 0} in room)` : `${g.minPlayers}–${g.maxPlayers} players`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="arcade-card p-3 sm:p-4">
        <div className="flex items-center justify-between pb-3">
          <div className={`font-display flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/60 sm:text-sm ${joinDing ? 'join-ding' : ''}`}>
            👥 Lounge Players ({playerCount}/8)
            {room && playerCount >= 2 && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            )}
          </div>
          <span className="text-[11px] text-white/40 sm:text-xs">Ready to play</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-8">
          {(room?.players ?? []).map((p) => {
            const isMe = p.uid === uid;
            const isThisHost = p.uid === room?.hostId;
            return (
              <div
                key={p.uid}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition-all sm:p-2.5 ${
                  isMe ? 'border-white/30 bg-white/10 shadow-[0_0_12px_rgba(255,255,255,0.15)]' : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="relative">
                  <div
                    data-player-avatar={p.uid}
                    className="flex h-11 w-11 items-center justify-center rounded-full border-2 text-xl shadow-md transition-transform hover:scale-110"
                    style={{
                      background: `linear-gradient(135deg, ${p.avatarColor}, #0d0d24)`,
                      borderColor: p.avatarColor,
                      boxShadow: `0 0 14px ${p.avatarColor}88`,
                    }}
                  >
                    <AvatarIcon color={p.avatarId ?? p.avatarColor} size={22} />
                  </div>
                  {isThisHost && (
                    <span className="absolute -right-1 -top-1 text-sm leading-none drop-shadow" title="Host" aria-label="Host">
                      👑
                    </span>
                  )}
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0d0d24] bg-emerald-400" />
                </div>
                <div className="w-full truncate text-xs font-extrabold text-white">
                  {p.name} {isMe && <span className="text-[10px] text-white/50">(You)</span>}
                </div>
                <div className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-[#FFC53D]">
                  🏆 {p.score} pts
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(recap || (room?.status === 'recap' && !recapHidden)) && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-3 sm:p-4"
          onClick={() => {
            setRecap(false);
            setRecapHidden(true);
            if (room?.status === 'recap' && isHost) void backToLobby();
          }}
        >
          <div className="arcade-card my-auto w-full max-w-2xl overflow-hidden p-3 sm:p-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-center text-xl font-extrabold sm:text-2xl">
              <span className="trophy-bounce">🏆</span> Night recap <span className="sparkle">✨</span>
            </div>
            <div className="h-56 sm:h-72"><RecapPodium players={room?.players ?? []} /></div>
            <Scoreboard players={room?.players ?? []} />
            <button
              onClick={() => {
                setRecap(false);
                setRecapHidden(true);
                if (room?.status === 'recap' && isHost) void backToLobby();
              }}
              className="btn-neon mt-2 min-h-[44px] w-full rounded-xl px-4 py-2.5 font-bold"
            >
              Back to lounge
            </button>
          </div>
        </div>
      )}

      <PortalTransition active={warp} label={`Entering ${room?.currentGameId ? GAME_LIST.find((g) => g.id === room.currentGameId)?.displayName ?? game.displayName : game.displayName}…`} onDone={() => { setWarp(false); goPlay(); }} />
    </main>
  );
}
