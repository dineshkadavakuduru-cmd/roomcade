'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GameModule } from './registry';
import { awardScores, dispatchLive, getSessionUid, setLive, subscribeLive, subscribeRoom } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';
import { flashBuzzer, countUp } from '@/lib/anime';

const ROUNDS_TO_WIN = 3;
const COUNTDOWN_STAGES = ['🔴', '🟡', '🟢'];

interface QState extends LiveState {
  phase: 'waiting' | 'countdown' | 'armed' | 'round-end' | 'done';
  round: number;
  goAt: number;
  reactions: Record<string, number>;
  scores: Record<string, number>;
  winner: string | null;
  roundWinner: string | null;
  earlyLoser: string | null;
  startedAt: number;
}
function init(uids: string[]): QState {
  return {
    phase: 'waiting',
    round: 0,
    goAt: 0,
    reactions: {},
    scores: { [uids[0]]: 0, [uids[1]]: 0 },
    winner: null,
    roundWinner: null,
    earlyLoser: null,
    startedAt: 0,
  };
}
function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as QState;
  switch (action.type) {
    case 'start': {
      const goAt = Date.now() + 2000 + Math.random() * 3000;
      return { ...init(action.payload.playerUids), phase: 'countdown', round: 1, goAt, startedAt: Date.now() };
    }
    case 'react': {
      if (s.phase !== 'armed') {
        // early shot = lose round
        const other = Object.keys(s.scores).find((u) => u !== action.uid);
        return { ...s, phase: 'round-end', earlyLoser: action.uid, roundWinner: other };
      }
      const reactions = { ...s.reactions, [action.uid]: Date.now() };
      if (Object.keys(reactions).length === 2) {
        const [u1, u2] = Object.keys(reactions);
        const r1 = reactions[u1]! - s.goAt;
        const r2 = reactions[u2]! - s.goAt;
        const roundWinner = r1 <= r2 ? u1 : u2;
        const scores = { ...s.scores, [roundWinner]: (s.scores[roundWinner] ?? 0) + 1 };
        const winner = scores[roundWinner]! >= ROUNDS_TO_WIN ? roundWinner : null;
        return { ...s, phase: 'round-end', reactions, roundWinner, scores, winner };
      }
      return { ...s, reactions };
    }
    case 'next-round': {
      if (s.winner) return { ...s, phase: 'done' };
      const goAt = Date.now() + 1000 + Math.random() * 2000;
      return { ...s, phase: 'countdown', round: s.round + 1, goAt, reactions: {}, roundWinner: null, earlyLoser: null };
    }
    case 'end':
      return { ...s, phase: 'done' };
    default:
      return s;
  }
}

function DuelArena({ live, room, me }: { live: QState; room: RoomMeta; me: string }) {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      ref.current.position.y = 0.1 + Math.sin(t * 2) * 0.05;
    }
  });
  const opponent = room.players.find((p) => p.uid !== me)!;
  const myScore = live.scores[me] ?? 0;
  const oppScore = live.scores[opponent.uid] ?? 0;
  const myTurn = live.phase === 'armed';
  const myReaction = live.reactions[me];
  const oppReaction = live.reactions[opponent.uid];

  return (
    <group>
      {/* Chasm floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#0a0a1a" roughness={0.9} />
      </mesh>
      {/* Center lantern */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.3, 0.25, 1.2, 12]} />
        <meshStandardMaterial color="#332211" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 2.0, 0]} scale={live.phase === 'armed' ? 1.5 : 1}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial
          color={live.phase === 'armed' ? '#FFC53D' : '#332200'}
          emissive={live.phase === 'armed' ? '#FFC53D' : '#000'}
          emissiveIntensity={live.phase === 'armed' ? 3 : 0}
        />
      </mesh>
      {live.phase === 'armed' && <pointLight position={[0, 2, 0]} intensity={40} distance={10} color="#FFC53D" />}
      {/* Avatars at opposite ends */}
      <mesh position={[-4.5, 0.8, 0]}>
        <sphereGeometry args={[0.6, 18, 18]} />
        <meshStandardMaterial color="#FF6B35" roughness={0.5} />
      </mesh>
      <mesh position={[4.5, 0.8, 0]}>
        <sphereGeometry args={[0.6, 18, 18]} />
        <meshStandardMaterial color="#38BDF8" roughness={0.5} />
      </mesh>
    </group>
  );
}

function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []);
  const [live, setL] = useState<QState | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [now, setNow] = useState(Date.now());
  const [screenFlash, setScreenFlash] = useState(false);
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as QState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 50); return () => clearInterval(t); }, []);

  const me = room?.players.find((p) => p.uid === uid);
  const opponent = room?.players.find((p) => p.uid !== uid);
  const timeToGo = live?.phase === 'countdown' ? Math.max(0, Math.ceil((live.goAt - now) / 1000)) : 0;
  const countdownStage = live?.phase === 'countdown' ? Math.floor(Math.max(0, 3 - (live.goAt - now) / 1000)) : 0;

  const act = (type: string, payload: any = {}) =>
    dispatchLive(roomCode, { type, uid, payload }, applyAction, () => init(room?.players.map((p) => p.uid) ?? []));

  const onReact = () => {
    if (live?.phase !== 'armed') return;
    act('react');
    setScreenFlash(true);
    setTimeout(() => setScreenFlash(false), 80);
    flashBuzzer('#draw-btn', '#FFC53D');
  };

  useEffect(() => {
    if (live?.phase === 'round-end' && live.roundWinner === uid) {
      awardScores(roomCode, { [uid]: 50 });
    }
  }, [live?.phase, live?.roundWinner]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (live?.winner) {
      awardScores(roomCode, { [live.winner]: 200 });
    }
  }, [live?.winner]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col gap-2 lg:flex-row">
      <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 2.5, 7], fov: 45 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#0d0d24']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 4]} intensity={0.8} />
          {live && room && <DuelArena live={live} room={room} me={uid} />}
        </Canvas>
        {/* Screen-edge vignette during countdown */}
        {live?.phase === 'countdown' && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              boxShadow: `inset 0 0 ${120 - countdownStage * 30}px ${60 - countdownStage * 15}px rgba(0,0,0,${0.7 + countdownStage * 0.1})`,
              borderRadius: '28px',
            }}
          />
        )}
        {/* GO flash */}
        {live?.phase === 'armed' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="font-display text-6xl font-extrabold text-[#FFC53D] drop-shadow-[0_0_20px_#FFC53D] animate-pulse">GO!</div>
          </div>
        )}
        {screenFlash && (
          <div className="absolute inset-0 bg-white/15 pointer-events-none z-10 animate-[flash_0.1s_ease-out]" style={{ borderRadius: '28px' }} />
        )}
        {/* Countdown lights */}
        <div className="absolute left-1/2 top-4 -translate-x-1/2 flex gap-3 z-10">
          {COUNTDOWN_STAGES.map((s, i) => (
            <span
              key={i}
              className={`text-4xl font-bold transition-all duration-300 ${
                live?.phase === 'countdown' && i <= countdownStage ? 'opacity-100 scale-125' : 'opacity-20 scale-75'
              }`}
              style={{ color: i === 0 ? '#FB4D6D' : i === 1 ? '#FFC53D' : '#34D399' }}
            >
              {s}
            </span>
          ))}
        </div>
        {/* Round counter */}
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="arcade-card px-3 py-1 font-display text-lg font-extrabold text-[#FFC53D]">Round {live?.round ?? 1}/{ROUNDS_TO_WIN}</span>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-80">
        {(!live || live.phase === 'waiting') && (
          <div className="arcade-card p-4">
            <div className="font-display text-lg font-extrabold">Quick Draw Duel</div>
            <p className="text-sm text-white/70">Best of 5. Countdown → GO! Tap fastest. React before GO = instant loss. Two players only.</p>
            <button onClick={() => act('start', { playerUids: room?.players.map((p) => p.uid) ?? [] })} className="btn-neon mt-2 w-full rounded-xl px-3 py-2 text-sm font-bold">▶ Start Duel</button>
          </div>
        )}
        {live && live.phase !== 'waiting' && live.phase !== 'done' && (
          <div className="arcade-card flex flex-col gap-3 p-4">
            <div className="flex gap-2">
              <div className="flex-1 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-white/50">{me?.name}</div>
                <div id="my-score" className="font-display text-3xl font-extrabold text-[#FFC53D]">{live.scores[uid] ?? 0}</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-white/50">{opponent?.name}</div>
                <div id="opp-score" className="font-display text-3xl font-extrabold text-[#FFC53D]">{live.scores[opponent?.uid ?? ''] ?? 0}</div>
              </div>
            </div>
            {live.phase === 'countdown' && (
              <div className="text-center text-white/70">Get ready… <span className="font-display font-extrabold text-[#FFC53D]">{timeToGo}s</span></div>
            )}
            {live.phase === 'armed' && (
              <button id="draw-btn" onClick={onReact} className="btn-neon w-full py-4 font-display text-xl font-extrabold">🔫 DRAW!</button>
            )}
            {live.phase === 'round-end' && (
              <div className="text-center">
                {live.earlyLoser === uid && <p className="text-[#FB4D6D] font-bold">⚡ Too early! You lose this round.</p>}
                {live.earlyLoser === opponent?.uid && <p className="text-[#34D399] font-bold">⚡ Opponent fired early! You win!</p>}
                {live.roundWinner === uid && !live.earlyLoser && <p className="text-[#34D399] font-bold">⚡ Fastest draw! Round won.</p>}
                {live.roundWinner === opponent?.uid && !live.earlyLoser && <p className="text-[#FB4D6D] font-bold">⚡ Opponent was faster.</p>}
              </div>
            )}
            {live.phase === 'round-end' && !live.winner && (
              <button onClick={() => act('next-round')} className="btn-neon w-full px-3 py-2 font-bold">Next Round ▶</button>
            )}
          </div>
        )}
        {live?.phase === 'done' && (
          <div className="arcade-card p-4 text-center">
            <div className="font-display text-xl font-extrabold text-[#FFC53D]">
              {live.winner === uid ? '🏆 YOU WIN!' : '💀 YOU LOSE'}
            </div>
            <p className="text-sm text-white/70">Final: {live.scores[uid] ?? 0} — {live.scores[opponent?.uid ?? ''] ?? 0}</p>
            <button onClick={() => setLive(roomCode, null)} className="btn-neon mt-2 rounded-xl px-4 py-2 text-sm font-bold">Back to lobby scoring</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Preview() {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      ref.current.rotation.y = t * 0.5;
      ref.current.children[0].scale.setScalar(1 + Math.sin(t * 3) * 0.1);
    }
  });
  return (
    <group ref={ref}>
      <mesh position={[-1.5, 0, 0]}><sphereGeometry args={[0.5, 16, 16]} /><meshStandardMaterial color="#FF6B35" emissive="#FF6B35" emissiveIntensity={0.4} /></mesh>
      <mesh position={[1.5, 0, 0]}><sphereGeometry args={[0.5, 16, 16]} /><meshStandardMaterial color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.4} /></mesh>
      <mesh position={[0, 1.5, 0]}><sphereGeometry args={[0.3, 12, 12]} /><meshStandardMaterial color="#FFC53D" emissive="#FFC53D" emissiveIntensity={0.8} /></mesh>
    </group>
  );
}

export const QuickDraw: GameModule = {
  id: 'quickdraw',
  displayName: 'Quick Draw Duel',
  tagline: 'Best of 5. React to GO!',
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#FFC53D',
  LobbyPreviewScene: Preview,
  GameScene,
  applyAction,
  initState: (uids) => init(uids),
};