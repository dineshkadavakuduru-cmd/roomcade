'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { GameModule } from './registry';
import { dispatchLive, getSessionUid, setLive, subscribeLive, subscribeRoom, awardScores } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';
import { flashBuzzer } from '@/lib/anime';

const WORDS = ['rocket', 'crab', 'castle', 'guitar', 'mushroom', 'bridge', 'robot', 'pineapple', 'telescope', 'dragon', 'lamp', 'submarine', 'pyramid', 'bicycle', 'volcano', 'crown', 'anchor', 'tent', 'elephant', 'lighthouse'];
const SHAPES = ['box', 'sphere', 'cone', 'cylinder'] as const;
const BLOCK_LIMIT = 24;
const ROUND_SECS = 150;

interface Block { id: string; shape: string; pos: [number, number, number]; scale: number; color: string }
interface SState extends LiveState {
  phase: 'waiting' | 'playing' | 'done';
  sculptorUid: string; word: string; blocks: Block[];
  guesses: { uid: string; name: string; text: string; correct: boolean; at: number }[];
  startedAt: number; winnerUids: string[];
}

function init(playerUids: string[]): SState {
  return {
    phase: 'waiting',
    sculptorUid: playerUids[0] ?? '',
    word: WORDS[Math.floor(Math.random() * WORDS.length)]!,
    blocks: [], guesses: [], startedAt: 0, winnerUids: [],
  };
}

function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as SState;
  switch (action.type) {
    case 'start':
      return { ...init(action.payload.playerUids), phase: 'playing', startedAt: Date.now(),
        sculptorUid: action.payload.sculptorUid, word: action.payload.word };
    case 'add-block':
      if (s.blocks.length >= BLOCK_LIMIT) return s;
      return { ...s, blocks: [...s.blocks, action.payload.block] };
    case 'move-block':
      return { ...s, blocks: s.blocks.map((b) => (b.id === action.payload.id ? { ...b, pos: action.payload.pos, scale: action.payload.scale ?? b.scale } : b)) };
    case 'clear':
      return { ...s, blocks: [] };
    case 'guess': {
      const text = String(action.payload.text).trim().toLowerCase();
      if (!text || s.phase !== 'playing') return s;
      const correct = text === s.word.toLowerCase();
      if (s.guesses.some((g) => g.uid === action.uid && g.correct)) return s;
      const guesses = [...s.guesses.slice(-29), { uid: action.uid, name: action.payload.name, text: action.payload.text, correct, at: Date.now() }];
      if (correct && !s.winnerUids.includes(action.uid)) {
        return { ...s, guesses, winnerUids: [...s.winnerUids, action.uid] };
      }
      return { ...s, guesses };
    }
    case 'end':
      return { ...s, phase: 'done' };
    default:
      return s;
  }
}

function SculptScene({ blocks, selected, onSelect }: { blocks: Block[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[4.4, 40]} />
        <meshStandardMaterial color="#1b1b40" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[1.6, 1.9, 0.3, 24]} />
        <meshStandardMaterial color="#2a2a5e" roughness={0.6} />
      </mesh>
      {blocks.map((b) => (
        <mesh key={b.id} position={b.pos} scale={b.scale} onClick={(e) => { e.stopPropagation(); onSelect(b.id); }}>
          {b.shape === 'box' && <boxGeometry args={[0.6, 0.6, 0.6]} />}
          {b.shape === 'sphere' && <sphereGeometry args={[0.35, 18, 18]} />}
          {b.shape === 'cone' && <coneGeometry args={[0.35, 0.7, 18]} />}
          {b.shape === 'cylinder' && <cylinderGeometry args={[0.3, 0.3, 0.6, 18]} />}
          <meshStandardMaterial color={b.color} emissive={selected === b.id ? '#FFC53D' : '#000'} emissiveIntensity={selected === b.id ? 0.7 : 0} roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []);
  const [live, setL] = useState<SState | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [guess, setGuess] = useState('');
  const [shape, setShape] = useState<(typeof SHAPES)[number]>('box');
  const [color, setColor] = useState('#FF6B35');
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const me = room?.players.find((p) => p.uid === uid);
  const isSculptor = live?.sculptorUid === uid;
  const isHost = room?.hostId === uid;

  useEffect(() => subscribeLive(roomCode, (s) => setL((s as SState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const timeLeft = live?.phase === 'playing' ? Math.max(0, ROUND_SECS - Math.floor((now - live.startedAt) / 1000)) : ROUND_SECS;

  useEffect(() => {
    if (live?.phase === 'playing' && timeLeft <= 0 && isHost) {
      const awards: Record<string, number> = {};
      live.winnerUids.forEach((w) => { awards[w] = 100; });
      if (live.sculptorUid) awards[live.sculptorUid] = 40 * live.winnerUids.length;
      awardScores(roomCode, awards).then(() => dispatchLive(roomCode, { type: 'end', uid }, applyAction, () => init([])));
    }
  }, [timeLeft, live?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (sculptorUid: string) => {
    const uids = room?.players.map((p) => p.uid) ?? [];
    dispatchLive(roomCode, { type: 'start', uid, payload: { playerUids: uids, sculptorUid, word: WORDS[Math.floor(Math.random() * WORDS.length)] } }, applyAction, () => init(uids));
  };

  const addBlock = () => {
    if (!live || !isSculptor) return;
    const a = Math.random() * Math.PI * 2;
    const block: Block = { id: `b${Date.now()}${Math.floor(Math.random() * 999)}`, shape, pos: [Math.cos(a) * 0.8, 0.8 + Math.random() * 1.4, Math.sin(a) * 0.8], scale: 1, color };
    dispatchLive(roomCode, { type: 'add-block', uid, payload: { block } }, applyAction, () => init([]));
  };

  const sendGuess = () => {
    if (!guess.trim() || isSculptor) return;
    dispatchLive(roomCode, { type: 'guess', uid, payload: { text: guess, name: me?.name ?? '?' } }, applyAction, () => init([]));
    setGuess('');
    flashBuzzer('#guess-box', '#8B5CF6');
  };

  const nudge = (dx: number, dz: number) => {
    if (!live || !selected || !isSculptor) return;
    const b = live.blocks.find((x) => x.id === selected);
    if (!b) return;
    dispatchLive(roomCode, { type: 'move-block', uid, payload: { id: selected, pos: [b.pos[0] + dx, b.pos[1], b.pos[2] + dz] } }, applyAction, () => init([]));
  };

  return (
    <div className="flex h-full flex-col gap-2 lg:flex-row">
      <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [4.5, 4, 6], fov: 50 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#0d0d24']} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 8, 4]} intensity={1.1} />
          <pointLight position={[0, 5, 0]} intensity={26} distance={18} color="#ff6b35" />
          {live && <SculptScene blocks={live.blocks} selected={selected} onSelect={(id) => isSculptor && setSelected(id)} />}
          <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.1} />
        </Canvas>
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="arcade-card px-3 py-1 font-display text-lg font-extrabold text-[#FFC53D]">⏱ {timeLeft}s</span>
          <span className="arcade-card px-3 py-1 text-sm font-semibold">🧱 {live?.blocks.length ?? 0}/{BLOCK_LIMIT}</span>
        </div>
        {live?.phase === 'playing' && isSculptor && (
          <div className="absolute left-1/2 top-3 -translate-x-1/2 arcade-card px-4 py-1 font-display text-lg font-extrabold text-[#34D399]">
            Sculpt: “{live.word}”
          </div>
        )}
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-80">
        {(!live || live.phase === 'waiting') && (
          <div className="arcade-card p-4">
            <div className="font-display text-lg font-extrabold">Sculptionary</div>
            <p className="text-sm text-white/70">Sculptor builds the secret word in 3D. Guessers type live — sculptor + every correct guesser score.</p>
            {isHost && (
              <div className="mt-2 flex flex-col gap-1">
                {(room?.players ?? []).map((p) => (
                  <button key={p.uid} onClick={() => start(p.uid)} className="btn-neon rounded-xl px-3 py-2 text-sm font-bold">
                    Start — {p.name} sculpts
                  </button>
                ))}
              </div>
            )}
            {!isHost && <p className="mt-2 text-sm text-white/60">Waiting for host to start…</p>}
          </div>
        )}
        {live?.phase === 'playing' && isSculptor && (
          <div className="arcade-card flex flex-col gap-2 p-3">
            <div className="flex gap-1">
              {SHAPES.map((s) => (
                <button key={s} onClick={() => setShape(s)} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold ${shape === s ? 'btn-neon' : 'bg-white/10'}`}>{s}</button>
              ))}
            </div>
            <div className="flex gap-1">
              {['#FF6B35', '#FF3D81', '#8B5CF6', '#34D399', '#38BDF8', '#FFC53D'].map((c) => (
                <button key={c} onClick={() => setColor(c)} className="h-7 flex-1 rounded-lg border-2" style={{ background: c, borderColor: color === c ? '#fff' : 'transparent' }} />
              ))}
            </div>
            <button onClick={addBlock} className="btn-neon rounded-xl px-3 py-2 text-sm font-bold">+ Place block</button>
            <div className="grid grid-cols-4 gap-1">
              {[['◀', -0.25, 0], ['▶', 0.25, 0], ['▲', 0, -0.25], ['▼', 0, 0.25]].map(([l, dx, dz]) => (
                <button key={l as string} onClick={() => nudge(dx as number, dz as number)} className="rounded-lg bg-white/10 px-2 py-1.5 font-bold">{l}</button>
              ))}
            </div>
            <button onClick={() => dispatchLive(roomCode, { type: 'clear', uid }, applyAction, () => init([]))} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70">Clear pedestal</button>
          </div>
        )}
        {live?.phase === 'playing' && !isSculptor && (
          <div id="guess-box" className="arcade-card flex gap-2 p-3">
            <input value={guess} onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendGuess()}
              placeholder="Type your guess…" className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:ring-2 focus:ring-[#FF3D81]" />
            <button onClick={sendGuess} className="btn-neon rounded-xl px-4 py-2 text-sm font-bold">Guess</button>
          </div>
        )}
        <div className="arcade-card max-h-56 flex-1 overflow-y-auto p-3">
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-white/50">Live guesses</div>
          {(live?.guesses ?? []).slice().reverse().map((g, i) => (
            <div key={i} className={`rounded-lg px-2 py-1 text-sm ${g.correct ? 'bg-[#34D399]/20 font-bold text-[#34D399]' : 'text-white/80'}`}>
              <b>{g.name}:</b> {g.text} {g.correct && '✓'}
            </div>
          ))}
          {(!live?.guesses?.length) && <p className="text-sm text-white/40">No guesses yet.</p>}
        </div>
        {live?.phase === 'done' && (
          <div className="arcade-card p-4 text-center">
            <div className="font-display text-lg font-extrabold">Word was “{live.word}” 🎉</div>
            <p className="text-sm text-white/70">{live.winnerUids.length} guesser(s) scored + sculptor banked {40 * live.winnerUids.length}.</p>
            {isHost && <button onClick={() => setLive(roomCode, null)} className="btn-neon mt-2 rounded-xl px-4 py-2 text-sm font-bold">Back to lobby scoring</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Preview() {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.8;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, -0.3, 0]}><boxGeometry args={[0.7, 0.7, 0.7]} /><meshStandardMaterial color="#FF6B35" emissive="#FF6B35" emissiveIntensity={0.4} /></mesh>
      <mesh position={[0.55, 0.35, 0]}><sphereGeometry args={[0.35, 16, 16]} /><meshStandardMaterial color="#FF3D81" emissive="#FF3D81" emissiveIntensity={0.4} /></mesh>
      <mesh position={[-0.5, 0.4, 0.1]}><coneGeometry args={[0.3, 0.6, 14]} /><meshStandardMaterial color="#8B5CF6" emissive="#8B5CF6" emissiveIntensity={0.4} /></mesh>
    </group>
  );
}

export const Sculptionary: GameModule = {
  id: 'sculptionary', displayName: 'Sculptionary', tagline: 'Sculpt it in 3D, shout the word',
  minPlayers: 3, maxPlayers: 8, accent: '#FF6B35',
  LobbyPreviewScene: Preview, GameScene, applyAction, initState: (uids) => init(uids),
};
