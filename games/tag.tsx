'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GameModule } from './registry';
import { awardScores, dispatchLive, getSessionUid, patchRoom, setLive, subscribeLive, subscribeRoom } from '@/lib/room-store';
import { Confetti, GameHeader } from '@/components/GameChrome';
import type { Action, LiveState, RoomMeta } from '@/lib/types';

const ARENA_R = 7;
const ROUND_SECS = 60;
const TAG_DIST = 1.1;

interface TState extends LiveState {
  phase: 'waiting' | 'playing' | 'done';
  positions: Record<string, { x: number; z: number }>;
  itUid: string; startedAt: number; winnerUid: string | null;
}
function spawn(uids: string[]): Record<string, { x: number; z: number }> {
  const pos: Record<string, { x: number; z: number }> = {};
  uids.forEach((u, i) => {
    const a = (i / Math.max(uids.length, 1)) * Math.PI * 2;
    pos[u] = { x: Math.cos(a) * 4, z: Math.sin(a) * 4 };
  });
  return pos;
}
function init(uids: string[]): TState {
  return { phase: 'waiting', positions: spawn(uids), itUid: uids[Math.floor(Math.random() * uids.length)] ?? '', startedAt: 0, winnerUid: null };
}
function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as TState;
  switch (action.type) {
    case 'start':
      return { ...init(action.payload.playerUids), phase: 'playing', startedAt: Date.now(), itUid: action.payload.itUid };
    case 'move': {
      const raw = action.payload.pos as { x: number; z: number };
      // keep everyone inside the circular arena
      const d = Math.hypot(raw.x, raw.z);
      const pos = d > ARENA_R ? { x: (raw.x / d) * ARENA_R, z: (raw.z / d) * ARENA_R } : raw;
      const positions = { ...(s.positions || {}), [action.uid]: pos };
      // Symmetric tag transfer: whenever any player is on top of the current "it",
      // the tag transfers. Works whether the runner or "it" is the one moving,
      // and never re-tags the player who just became it in the same action.
      let itUid = s.itUid;
      const itPos = positions[s.itUid];
      if (itPos) {
        const tagger = action.uid !== s.itUid
          ? (Math.hypot(pos.x - itPos.x, pos.z - itPos.z) < TAG_DIST ? action.uid : null)
          : Object.keys(positions).find((u) => {
              if (u === s.itUid) return false;
              const p = positions[u]!;
              return Math.hypot(p.x - itPos.x, p.z - itPos.z) < TAG_DIST;
            }) ?? null;
        if (tagger) itUid = tagger;
      }
      return { ...s, positions, itUid };
    }
    case 'end':
      return { ...s, phase: 'done', winnerUid: action.payload?.winnerUid ?? s.itUid };
    default:
      return s;
  }
}

function Runners({ live, room, me }: { live: TState; room: RoomMeta; me: string }) {
  const refs = useRef(new Map<string, any>());
  useFrame((_, dt) => {
    // client-side interpolation toward latest broadcast positions
    refs.current.forEach((mesh, u) => {
      const target = live.positions[u];
      if (!mesh || !target) return;
      const k = Math.min(1, dt * 10);
      mesh.position.x += (target.x - mesh.position.x) * k;
      mesh.position.z += (target.z - mesh.position.z) * k;
    });
  });
  return (
    <group>
      {room.players.map((p) => {
        const pos = live.positions[p.uid] ?? { x: 0, z: 0 };
        const it = live.itUid === p.uid;
        return (
          <mesh key={p.uid} ref={(m) => { if (m) refs.current.set(p.uid, m); }} position={[pos.x, 0.5, pos.z]}>
            <sphereGeometry args={[0.45, 18, 18]} />
            <meshStandardMaterial color={it ? '#FB4D6D' : p.avatarColor} emissive={it ? '#FB4D6D' : '#000'} emissiveIntensity={it ? 1.2 : 0} />
            {it && <pointLight intensity={8} distance={6} color="#FB4D6D" />}
          </mesh>
        );
      })}
    </group>
  );
}

function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []);
  const [live, setL] = useState<TState | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [now, setNow] = useState(Date.now());
  // Joystick values live in a ref so the movement loop always reads fresh values
  // (the loop only re-runs when the phase changes, so React state would be stale).
  const stick = useRef({ x: 0, y: 0 });
  const [stickUi, setStickUi] = useState({ x: 0, y: 0 });
  const keys = useRef<Record<string, boolean>>({});
  const lastSent = useRef(0);
  const lastFrame = useRef(0);
  const local = useRef({ x: 0, z: 0 });
  const isHost = room?.hostId === uid;
  const isHostRef = useRef(isHost);
  const awardedRef = useRef(false);
  const [myPos, setMyPos] = useState({ x: 0, z: 0 });

  useEffect(() => subscribeLive(roomCode, (s) => setL((s as TState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  const timeLeft = live?.phase === 'playing' ? Math.max(0, ROUND_SECS - Math.floor((now - live.startedAt) / 1000)) : ROUND_SECS;

  // movement loop: 10Hz broadcast, delta-time local prediction
  useEffect(() => {
    if (live?.phase !== 'playing') return;
    const start = live.positions[uid] ?? { x: 0, z: 0 };
    local.current = { ...start };
    setMyPos({ ...start });
    lastFrame.current = 0;
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const prev = lastFrame.current || t;
      const dt = Math.min(0.1, (t - prev) / 1000);
      lastFrame.current = t;
      const k = keys.current;
      let dx = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0) + stick.current.x;
      let dz = (k['s'] || k['arrowdown'] ? 1 : 0) - (k['w'] || k['arrowup'] ? 1 : 0) + stick.current.y;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) return;
      const speed = 5.4 * dt; // units per second, frame-rate independent
      const step = speed / Math.max(1, len);
      const nx = local.current.x + dx * step;
      const nz = local.current.z + dz * step;
      const d = Math.hypot(nx, nz);
      const cx = d > ARENA_R ? (nx / d) * ARENA_R : nx;
      const cz = d > ARENA_R ? (nz / d) * ARENA_R : nz;
      local.current = { x: cx, z: cz };
      if (Date.now() - lastSent.current > 100) {
        lastSent.current = Date.now();
        setMyPos({ x: cx, z: cz });
        dispatchLive(roomCode, { type: 'move', uid, payload: { pos: { ...local.current } } }, applyAction, () => init(room?.players.map((p) => p.uid) ?? []));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (live?.phase === 'playing' && timeLeft <= 0 && !awardedRef.current) {
      // Only the host awards scores and closes out the round, so points and the
      // 'end' action aren't dispatched once per client.
      if (!isHostRef.current) return;
      awardedRef.current = true;
      // winner: everyone except "it"? Spec: last untagged wins — with transfer tag,
      // the player who is NOT it at timeout wins a share; "it" loses.
      const winners = (room?.players ?? []).filter((p) => p.uid !== live.itUid);
      const awards: Record<string, number> = {};
      winners.forEach((w) => { awards[w.uid] = 100; });
      void awardScores(roomCode, awards).then(() => {
        void dispatchLive(roomCode, { type: 'end', uid, payload: { winnerUid: winners[0]?.uid ?? live.itUid } }, applyAction, () => init([]));
      });
    }
  }, [timeLeft]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (live?.phase === 'waiting') awardedRef.current = false; }, [live?.phase]);

  const start = () => {
    const uids = room?.players.map((p) => p.uid) ?? [];
    dispatchLive(roomCode, { type: 'start', uid, payload: { playerUids: uids, itUid: uids[Math.floor(Math.random() * uids.length)] } }, applyAction, () => init(uids));
  };

  const joyRef = useRef<HTMLDivElement>(null);
  const onStick = (e: React.TouchEvent) => {
    const el = joyRef.current?.getBoundingClientRect();
    if (!el) return;
    const t = e.touches[0]!;
    const dx = (t.clientX - (el.left + el.width / 2)) / (el.width / 2);
    const dy = (t.clientY - (el.top + el.height / 2)) / (el.height / 2);
    const next = { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) };
    stick.current = next;
    setStickUi(next);
  };
  const resetStick = () => { stick.current = { x: 0, y: 0 }; setStickUi({ x: 0, y: 0 }); };

  const goLobby = async () => {
    await setLive(roomCode, null);
    await patchRoom(roomCode, { status: 'lobby', currentGameId: null });
  };

  // Near the ring edge: clamp local prediction onto the boundary so the player
  // sees the wall stopping them instead of sliding past the visual ring.
  const edge = Math.hypot(myPos.x, myPos.z) / ARENA_R;
  const onEdge = live?.phase === 'playing' && edge > 0.93;

  const itName = room?.players.find((p) => p.uid === live?.itUid)?.name;

  return (
    <div className="flex h-full flex-col gap-2">
      <GameHeader name="Tag Arena" accent="#38BDF8" phase={live?.phase === 'playing' ? 'IT: ' + (itName ?? '—') : live?.phase} round={`${timeLeft}s`} playerCount={room?.players.length} />
      <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 11, 7], fov: 50 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#0d0d24']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 9, 4]} intensity={1} />
          <pointLight position={[0, 5, 0]} intensity={20} distance={20} color="#38BDF8" />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[ARENA_R + 0.8, 48]} />
            <meshStandardMaterial color="#1b1b40" roughness={0.85} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[ARENA_R, ARENA_R + 0.15, 48]} />
            <meshBasicMaterial color="#FB4D6D" transparent opacity={0.8} />
          </mesh>
          {live && room && <Runners live={live} room={room} me={uid} />}
        </Canvas>
        <div className="absolute left-3 top-3 flex gap-2">
          <span className={`arcade-card tnum px-3 py-1 font-display text-lg font-extrabold text-[#FFC53D] ${timeLeft <= 10 && live?.phase === 'playing' ? 'timer-alert' : ''}`}>⏱ {timeLeft}s</span>
          {live?.phase === 'playing' && <span className="arcade-card px-3 py-1 text-sm font-bold text-[#FB4D6D]">🔥 {itName} is IT</span>}
        </div>
        {(!live || live.phase === 'waiting') && (
          <div className="absolute inset-x-0 bottom-3 mx-auto w-fit arcade-card px-4 py-2 text-center">
            {isHost
              ? <button onClick={start} className="btn-neon rounded-xl px-5 py-2 text-sm font-bold">Start Tag Arena (60s)</button>
              : <p className="text-sm text-white/70">Waiting for host… WASD / arrows / joystick to run.</p>}
          </div>
        )}
        {live?.phase === 'done' && (
          <div className="absolute inset-x-0 bottom-3 mx-auto w-fit arcade-card phase-fade px-4 py-2 text-center">
            <Confetti />
            <span className="font-display font-extrabold">🏁 {room?.players.find((p) => p.uid === live.winnerUid)?.name} survives! Everyone not-it scores +100.</span>
            {isHost && <button onClick={goLobby} className="btn-neon ml-2 rounded-xl px-4 py-1.5 text-sm font-bold">Lobby</button>}
          </div>
        )}
        {onEdge && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-xl border border-[#FB4D6D]/50 bg-[#FB4D6D]/20 px-3 py-1 text-xs font-bold text-[#FB4D6D]">
            ⛔ Arena wall
          </div>
        )}
        {/* virtual joystick (touch) */}
        <div ref={joyRef} onTouchMove={onStick} onTouchEnd={resetStick}
          className="absolute bottom-4 right-4 flex h-28 w-28 touch-none items-center justify-center rounded-full border-2 border-[#38BDF8]/50 bg-[#0d0d24]/70 shadow-[0_0_24px_rgba(56,189,248,0.35)] backdrop-blur-sm md:hidden">
          <span className="pointer-events-none absolute -top-5 text-[10px] font-bold uppercase tracking-widest text-white/50">Drag to move</span>
          <div className="h-12 w-12 rounded-full border border-white/50 bg-[#38BDF8]/70 shadow-[0_0_14px_#38BDF8]" style={{ transform: `translate(${stickUi.x * 20}px, ${stickUi.y * 20}px)` }} />
        </div>
      </div>
      <p className="hidden text-center text-sm text-white/50 md:block">Move with WASD or arrow keys — don’t get tagged. Tag transfers on contact.</p>
    </div>
  );
}

function Preview() {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) {
      ref.current.children[0].position.x = Math.cos(t * 1.5) * 0.5;
      ref.current.children[1].position.x = Math.cos(t * 1.5 + Math.PI) * 0.5;
    }
  });
  return (
    <group ref={ref}>
      <mesh><sphereGeometry args={[0.28, 14, 14]} /><meshStandardMaterial color="#FB4D6D" emissive="#FB4D6D" emissiveIntensity={0.8} /></mesh>
      <mesh><sphereGeometry args={[0.28, 14, 14]} /><meshStandardMaterial color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.5} /></mesh>
    </group>
  );
}

export const TagArena: GameModule = {
  id: 'tag', displayName: 'Tag Arena', tagline: 'Run. Tag. Survive 60 seconds.',
  minPlayers: 2, maxPlayers: 8, accent: '#38BDF8',
  LobbyPreviewScene: Preview, GameScene, applyAction, initState: (uids) => init(uids),
};
