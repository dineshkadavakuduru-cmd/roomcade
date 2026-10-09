'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { AVATAR_COLORS, type RoomMeta } from '@/lib/types';
import { getSessionUid, joinRoom, patchRoom, setLive, subscribeRoom } from '@/lib/room-store';
import { GAME_LIST } from '@/games';
import { LobbyScene } from '@/components/LobbyScene';
import { Scoreboard } from '@/components/Scoreboard';
import { RecapPodium } from '@/components/RecapPodium';
import { PortalTransition } from '@/components/PortalTransition';
import { popIn } from '@/lib/anime';
import { AvatarIcon } from '@/components/AvatarIcons';
import { ConnectionIndicator } from '@/components/ConnectionIndicator';

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
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [sel, setSel] = useState(0);
  const [warp, setWarp] = useState(false);
  const [recap, setRecap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinDing, setJoinDing] = useState(false);
  const prevCount = useRef(0);
  const uid = useMemo(() => (typeof window === 'undefined' ? '' : getSessionUid()), []);
  const me = room?.players.find((p) => p.uid === uid);
  const isHost = room?.hostId === uid;

  // Self-heal: if this tab has no player entry (fresh tab), auto-join with saved identity.
  useEffect(() => subscribeRoom(code, (m) => {
    setRoom(m);
    setMissing(!m);
    if (m && !m.players.some((p) => p.uid === getSessionUid())) {
      const n = sessionStorage.getItem('roomcade:name') || `Guest-${getSessionUid().slice(2, 6)}`;
      const c = sessionStorage.getItem('roomcade:color') || AVATAR_COLORS[2]!;
      joinRoom(code, n, c).catch(() => {});
    }
  }), [code]);

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

  const copyInvite = () => {
    navigator.clipboard?.writeText(`${location.origin}/room/${code}`).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  // Synchronize cartridge selection across all players via room.selectedGameId
  useEffect(() => {
    if (room?.selectedGameId) {
      const idx = GAME_LIST.findIndex((g) => g.id === room.selectedGameId);
      if (idx >= 0) setSel(idx);
    }
  }, [room?.selectedGameId]);

  const game = GAME_LIST[sel % GAME_LIST.length]!;
  const playerCount = room?.players.length ?? 0;
  const eligible = room ? playerCount >= game.minPlayers && playerCount <= game.maxPlayers : false;
  const tooManyPlayers = room ? playerCount > game.maxPlayers : false;

  const selectGame = (index: number) => {
    const next = (index + GAME_LIST.length) % GAME_LIST.length;
    setSel(next);
    if (isHost) {
      patchRoom(code, { selectedGameId: GAME_LIST[next]!.id });
    }
  };

  const selectGameById = (id: string) => {
    const idx = GAME_LIST.findIndex((g) => g.id === id);
    if (idx >= 0) {
      setSel(idx);
      if (isHost) {
        patchRoom(code, { selectedGameId: id });
      }
    }
  };

  const startGame = async () => {
    if (!isHost || !eligible) return;
    await setLive(code, null);
    await patchRoom(code, { status: 'in-game', currentGameId: game.id, selectedGameId: game.id });
    setWarp(true);
  };

  const goPlay = () => {
    router.push(`/room/${code}/play`);
  };

  const backToLobby = async () => {
    await setLive(code, null);
    await patchRoom(code, { status: 'lobby', currentGameId: null });
  };
  const endNight = () => patchRoom(code, { status: 'recap' });

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
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-3 px-4 py-4">
      <header className="flex flex-wrap items-center gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-[.25em] text-white/50">Roomcade · room code</div>
          <div className="room-code font-display text-3xl font-extrabold text-[#FFC53D]">{code}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ConnectionIndicator roomCode={code} />
          {me && <span className="arcade-card px-3 py-1.5 text-sm font-semibold">🎭 {me.name} {isHost && '· HOST'}</span>}
          <button
            onClick={copyInvite}
            className={`rounded-xl px-3 py-1.5 text-sm font-bold transition-all ${copied ? 'bg-[#34D399]/30 text-[#34D399] ring-1 ring-[#34D399]' : 'bg-white/10 hover:bg-white/20'}`}
          >
            {copied ? '✓ Copied!' : 'Copy invite link'}
          </button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[46vh] min-h-[340px] overflow-hidden rounded-2xl border border-white/10 lg:h-[62vh]">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-white/50">Loading lounge…</div>}>
            <LobbyScene players={room?.players ?? []} cartridges={GAME_LIST.map((g) => ({ id: g.id, label: g.displayName, color: g.accent }))} />
          </Suspense>
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
            <button onClick={() => selectGame(sel - 1)} aria-label="Previous game" className="arcade-card flex h-11 w-11 items-center justify-center font-bold hover:bg-white/20">‹</button>
            <div
              className="arcade-card lobby-pop flex-1 cursor-pointer px-3 py-2 text-center ring-2 ring-white/25"
              onClick={() => selectGame(sel + 1)}
              role="button"
            >
              <span className="font-display font-extrabold" style={{ color: game.accent }}>{game.displayName}</span>
              <span className="text-sm text-white/60"> · {game.tagline} · {game.minPlayers}–{game.maxPlayers} players</span>
              {!eligible && tooManyPlayers && <span className="ml-1 text-xs font-bold text-[#FB4D6D]">max {game.maxPlayers} players for this game</span>}
              {!eligible && !tooManyPlayers && <span className="ml-1 text-xs font-bold text-[#FFC53D]">needs {game.minPlayers}+ players</span>}
              {!eligible && (
                <span className="dot-pulse ml-1 align-middle text-[#FFC53D]"><span /><span /><span /></span>
              )}
            </div>
            <button onClick={() => selectGame(sel + 1)} aria-label="Next game" className="arcade-card flex h-11 w-11 items-center justify-center font-bold hover:bg-white/20">›</button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="arcade-card h-40 overflow-hidden p-2">
            <PreviewCanvas id={game.id} />
          </div>
          {isHost ? (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={startGame}
                disabled={!eligible}
                className={`btn-neon w-full px-4 py-3 font-display text-lg font-extrabold ${!eligible ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {eligible ? `▶ Start ${game.displayName}` : tooManyPlayers ? `Max ${game.maxPlayers} players for ${game.displayName}` : `Need ${game.minPlayers}+ players to start`}
              </button>
              {!eligible && (
                <span className="text-center text-xs font-medium text-white/50">
                  {tooManyPlayers
                    ? `${room?.players.length ?? 0} in the lounge · ${game.displayName} supports max ${game.maxPlayers} players`
                    : `${room?.players.length ?? 0} in the lounge · ${game.displayName} needs ${game.minPlayers}+ players`}
                </span>
              )}
            </div>
          ) : (
            <div className="arcade-card p-3 text-center text-sm text-white/70">
              {eligible
                ? `Waiting for host to start… Cartridge: ${game.displayName}`
                : tooManyPlayers
                ? `${game.displayName} supports max ${game.maxPlayers} players (${room?.players.length ?? 0} in lounge)`
                : `Waiting for host… Cartridge: ${game.displayName} (${game.minPlayers} players for party)`}
            </div>
          )}
          <Scoreboard players={room?.players ?? []} compact />
          {isHost && (
            <div className="flex gap-2">
              <button onClick={backToLobby} className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20">Reset to lobby</button>
              <button onClick={endNight} className="flex-1 rounded-xl bg-[#FFC53D]/20 px-3 py-2 text-xs font-bold text-[#FFC53D] hover:bg-[#FFC53D]/30">🏆 End night & recap</button>
            </div>
          )}
          <button onClick={() => setRecap(true)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-bold text-white/60 hover:bg-white/15">Preview recap podium</button>
        </div>
      </div>

      <div className="arcade-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-1 pb-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-[.2em] text-white/50">Arcade Cartridge Rack</span>
            <h2 className="font-display text-lg font-extrabold text-white">Choose Any Game Cartridge ({GAME_LIST.length} Games)</h2>
          </div>
          <span className="text-xs text-white/60">Click any cartridge to switch instantly</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
          {GAME_LIST.map((g, i) => {
            const isCurrent = (sel % GAME_LIST.length) === i;
            const tooMany = room && room.players.length > g.maxPlayers;
            return (
              <button
                key={g.id}
                onClick={() => selectGameById(g.id)}
                className={`arcade-card tilt-card relative flex flex-col items-start p-3 text-left ${
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
                <div className="font-display mt-2 text-sm font-extrabold text-white">{g.displayName}</div>
                <div className="line-clamp-1 text-xs text-white/60">{g.tagline}</div>
                <div className="mt-1 text-[11px] font-semibold" style={{ color: tooMany ? '#FB4D6D' : 'white/50' }}>
                  {tooMany ? `⛔ Max ${g.maxPlayers} (${room?.players.length ?? 0} in room)` : `${g.minPlayers}–${g.maxPlayers} players`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="arcade-card p-4">
        <div className="flex items-center justify-between pb-3">
          <div className={`font-display flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60 ${joinDing ? 'join-ding' : ''}`}>
            👥 Lounge Players ({room?.players.length ?? 0}/8)
            {room && room.players.length >= 2 && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            )}
          </div>
          <span className="text-xs text-white/40">Ready to play</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:grid-cols-8">
          {(room?.players ?? []).map((p) => {
            const isMe = p.uid === uid;
            const isThisHost = p.uid === room?.hostId;
            return (
              <div
                key={p.uid}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center transition-all ${
                  isMe ? 'border-white/30 bg-white/10 shadow-[0_0_12px_rgba(255,255,255,0.15)]' : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="relative">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-full border-2 text-xl shadow-md transition-transform hover:scale-110"
                    style={{
                      background: `linear-gradient(135deg, ${p.avatarColor}, #0d0d24)`,
                      borderColor: p.avatarColor,
                      boxShadow: `0 0 14px ${p.avatarColor}88`,
                    }}
                  >
                    {isThisHost ? '👑' : <AvatarIcon color={p.avatarColor} size={22} />}
                  </div>
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

      {(room?.status === 'recap' || recap) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => { setRecap(false); if (room?.status === 'recap' && isHost) backToLobby(); }}>
          <div className="arcade-card w-full max-w-2xl overflow-hidden p-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-center text-2xl font-extrabold">
              <span className="trophy-bounce">🏆</span> Night recap <span className="sparkle">✨</span>
            </div>
            <div className="h-72"><RecapPodium players={room?.players ?? []} /></div>
            <Scoreboard players={room?.players ?? []} />
            <button onClick={() => { setRecap(false); if (room?.status === 'recap' && isHost) backToLobby(); }} className="btn-neon mt-2 w-full rounded-xl px-4 py-2.5 font-bold">Back to lounge</button>
          </div>
        </div>
      )}

      <PortalTransition active={warp} label={`Entering ${room?.currentGameId ? GAME_LIST.find((g) => g.id === room.currentGameId)?.displayName ?? game.displayName : game.displayName}…`} onDone={() => { setWarp(false); goPlay(); }} />
    </main>
  );
}
