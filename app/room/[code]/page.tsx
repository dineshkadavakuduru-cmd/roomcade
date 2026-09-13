'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import { AVATAR_COLORS, type RoomMeta } from '@/lib/types';
import { getSessionUid, joinRoom, patchRoom, subscribeRoom } from '@/lib/room-store';
import { GAME_LIST } from '@/games';
import { LobbyScene } from '@/components/LobbyScene';
import { Scoreboard } from '@/components/Scoreboard';
import { RecapPodium } from '@/components/RecapPodium';
import { PortalTransition } from '@/components/PortalTransition';
import { popIn } from '@/lib/anime';

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

  const game = GAME_LIST[sel % GAME_LIST.length]!;
  const eligible = room ? room.players.length >= game.minPlayers : false;

  const startGame = async () => {
    if (!isHost || !eligible) return;
    setWarp(true);
  };

  const goPlay = () => {
    patchRoom(code, { status: 'in-game', currentGameId: game.id }).then(() => router.push(`/room/${code}/play`));
  };

  const backToLobby = () => patchRoom(code, { status: 'lobby', currentGameId: null });
  const endNight = () => patchRoom(code, { status: 'recap' });

  if (missing) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="font-display text-3xl font-extrabold">Room {code} not found</div>
        <p className="text-white/60">Rooms live in this browser unless Firebase is configured. Create a new room on this device.</p>
        <button onClick={() => router.push('/')} className="btn-neon rounded-xl px-5 py-2.5 font-bold">Back home</button>
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
        <div className="ml-auto flex items-center gap-2">
          {me && <span className="arcade-card px-3 py-1.5 text-sm font-semibold">🎭 {me.name} {isHost && '· HOST'}</span>}
          <button onClick={() => { navigator.clipboard?.writeText(`${location.origin}/room/${code}`).catch(() => {}); }} className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20">Copy invite link</button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[46vh] min-h-[340px] overflow-hidden rounded-2xl border border-white/10 lg:h-[62vh]">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-white/50">Loading lounge…</div>}>
            <LobbyScene players={room?.players ?? []} cartridges={GAME_LIST.map((g) => ({ id: g.id, label: g.displayName, color: g.accent }))} />
          </Suspense>
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
            <button onClick={() => setSel((s) => (s + GAME_LIST.length - 1) % GAME_LIST.length)} className="arcade-card px-3 py-2 font-bold">‹</button>
            <div
              className={`arcade-card lobby-pop flex-1 cursor-pointer px-3 py-2 text-center ${eligible ? 'ring-2 ring-white/25' : 'opacity-40'}`}
              onClick={() => eligible && setSel(sel)}
              role="button"
              aria-disabled={!eligible}
            >
              <span className="font-display font-extrabold" style={{ color: game.accent }}>{game.displayName}</span>
              <span className="text-sm text-white/60"> · {game.tagline} · {game.minPlayers}–{game.maxPlayers} players</span>
              {!eligible && <span className="ml-1 text-xs font-bold text-[#FB4D6D]">(needs {game.minPlayers}+)</span>}
            </div>
            <button onClick={() => setSel((s) => (s + 1) % GAME_LIST.length)} className="arcade-card px-3 py-2 font-bold">›</button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="arcade-card h-40 overflow-hidden p-2">
            <PreviewCanvas id={game.id} />
          </div>
          {isHost ? (
            <button
              onClick={startGame}
              disabled={!eligible}
              className="btn-neon w-full px-4 py-3 font-display text-lg font-extrabold disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-50"
            >
              {eligible ? `▶ Start ${game.displayName}` : `Need ${game.minPlayers}+ players (${room?.players.length ?? 0} here)`}
            </button>
          ) : (
            <div className="arcade-card p-3 text-center text-sm text-white/70">
              {eligible
                ? `Waiting for host to start… Cartridge: ${game.displayName}`
                : `Waiting — ${game.displayName} needs ${game.minPlayers} players (${room?.players.length ?? 0} here)`}
            </div>
          )}
          <Scoreboard players={room?.players ?? []} compact />
          {isHost && (
            <div className="flex gap-2">
              <button onClick={backToLobby} className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">Reset to lobby</button>
              <button onClick={endNight} className="flex-1 rounded-xl bg-[#FFC53D]/20 px-3 py-2 text-xs font-bold text-[#FFC53D]">🏆 End night & recap</button>
            </div>
          )}
          <button onClick={() => setRecap(true)} className="rounded-xl bg-white/5 px-3 py-2 text-xs font-bold text-white/60">Preview recap podium</button>
        </div>
      </div>

      <div className="arcade-card flex flex-wrap gap-2 p-3">
        <span className="text-sm font-bold text-white/60">In room ({room?.players.length ?? 0}/8):</span>
        {(room?.players ?? []).map((p) => (
          <span key={p.uid} className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-semibold">
            <span className="h-3 w-3 rounded-full" style={{ background: p.avatarColor }} />{p.name} · {p.score}
          </span>
        ))}
      </div>

      {(room?.status === 'recap' || recap) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => { setRecap(false); if (room?.status === 'recap' && isHost) backToLobby(); }}>
          <div className="arcade-card w-full max-w-2xl overflow-hidden p-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-center text-2xl font-extrabold">🏆 Night recap</div>
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
