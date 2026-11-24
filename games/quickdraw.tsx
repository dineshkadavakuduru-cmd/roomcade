'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GameModule } from './registry';
import { awardScores, dispatchLive, getSessionUid, settleMatchScore, subscribeLive, subscribeRoom } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';
import { flashBuzzer } from '@/lib/anime';
import { Confetti, GameHeader, ReturnToLounge } from '@/components/GameChrome';
import { RoomProgress } from '@/components/RoomProgress';
import { MAX_SCORE } from '@/lib/room-logic';

const ROUNDS_TO_WIN = 5;
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
  startingTotals?: Record<string, number>;
}
function init(uids: string[]): QState {
  const scores: Record<string, number> = {};
  if (uids[0]) scores[uids[0]] = 0;
  if (uids[1]) scores[uids[1]] = 0;
  return {
    phase: 'waiting',
    round: 0,
    goAt: 0,
    reactions: {},
    scores,
    winner: null,
    roundWinner: null,
    earlyLoser: null,
    startedAt: 0,
  };
}
function finishRound(s: QState, roundWinner: string, earlyLoser: string | null = null): QState {
  const scores = { ...s.scores, [roundWinner]: (s.scores[roundWinner] ?? 0) + 1 };
  const winner = scores[roundWinner]! >= ROUNDS_TO_WIN ? roundWinner : null;
  return { ...s, phase: winner ? 'done' : 'round-end', roundWinner, earlyLoser, scores, winner };
}

function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as QState;
  switch (action.type) {
    case 'start': {
      if (s.phase !== 'waiting') return s;
      const goAt = Date.now() + 2000 + Math.random() * 3000;
      return { ...init(action.payload.playerUids), phase: 'countdown', round: 1, goAt, startedAt: Date.now(), startingTotals: action.payload.startingTotals };
    }
    case 'react': {
      if (!Object.hasOwn(s.scores, action.uid) || s.reactions[action.uid] !== undefined) return s;
      if (s.phase === 'countdown') {
        // jumped the gun — early shot loses the round
        const other = Object.keys(s.scores).find((u) => u !== action.uid) || null;
        return other ? finishRound(s, other, action.uid) : s;
      }
      if (s.phase !== 'armed') return s; // ignore stray reactions (round-end / done)
      const reactions = { ...s.reactions, [action.uid]: action.payload?.at ?? Date.now() };
      const expected = Math.max(1, Math.min(2, Object.keys(s.scores).length));
      if (Object.keys(reactions).length >= expected) {
        const uids = Object.keys(reactions);
        let roundWinner: string;
        if (uids.length === 1) {
          roundWinner = uids[0]!;
        } else {
          const [u1, u2] = uids;
          const r1 = reactions[u1!]! - s.goAt;
          const r2 = reactions[u2!]! - s.goAt;
          roundWinner = r1 <= r2 ? u1! : u2!;
        }
        return finishRound({ ...s, reactions }, roundWinner);
      }
      return { ...s, reactions };
    }
    case 'arm':
      if (s.phase !== 'countdown' || Date.now() < s.goAt) return s;
      return { ...s, phase: 'armed' };
    case 'next-round': {
      if (s.phase !== 'round-end') return s;
      const goAt = Date.now() + 1000 + Math.random() * 2000;
      return { ...s, phase: 'countdown', round: s.round + 1, goAt, reactions: {}, roundWinner: null, earlyLoser: null };
    }
    case 'end':
      return { ...s, phase: 'done' };
    default:
      return s;
  }
}

function DuelArena({ live }: { live: QState }) {
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
  const [scoreError, setScoreError] = useState('');
  const [scoreAttempt, setScoreAttempt] = useState(0);
  const awardedRef = useRef(false);
  const arming = useRef(false);
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as QState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 50); return () => clearInterval(t); }, []);

  const me = room?.players.find((p) => p.uid === uid);
  const opponent = room?.players.find((p) => p.uid !== uid);
  const timeToGo = live?.phase === 'countdown' ? Math.max(0, Math.ceil((live.goAt - now) / 1000)) : 0;
  const countdownStage = live?.phase === 'countdown' ? Math.floor(Math.max(0, 3 - (live.goAt - now) / 1000)) : 0;

  const act = (type: string, payload: any = {}) =>
    dispatchLive(roomCode, { type, uid, payload }, applyAction, () => init(room?.players.map((p) => p.uid) ?? []));

  const isHost = room?.hostId === uid;
  const roundWinner = live?.roundWinner;
  const pointsDue = live && (live.phase === 'round-end' || live.phase === 'done') && roundWinner
    && live.startingTotals?.[roundWinner] !== undefined
    ? Math.min(MAX_SCORE, live.startingTotals[roundWinner]! + (live.scores[roundWinner]! - 1) * 50 + (live.winner ? 200 : 50))
    : null;
  const scorePending = pointsDue !== null && (room?.players.find((p) => p.uid === roundWinner)?.score ?? 0) < pointsDue;
  useEffect(() => {
    if (!isHost || !scorePending || !roundWinner || pointsDue === null) return;
    let active = true;
    void settleMatchScore(roomCode, roundWinner, pointsDue)
      .catch(() => { if (active) setScoreError('Could not save the round points. Check your connection and retry.'); });
    return () => { active = false; };
  }, [isHost, scorePending, roundWinner, pointsDue, roomCode, scoreAttempt]);
  // Host flips the shared phase to 'armed' at goAt so DRAW! goes live for both players.
  useEffect(() => {
    if (!isHost || live?.phase !== 'countdown' || now < live.goAt || arming.current) return;
    arming.current = true;
    void act('arm').catch(() => {}).finally(() => { arming.current = false; });
  }, [isHost, live?.phase, live?.goAt, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const onReact = () => {
    if (!live || (live.phase !== 'armed' && live.phase !== 'countdown')) return;
    void act('react', { at: Date.now() });
    setScreenFlash(true);
    setTimeout(() => setScreenFlash(false), 80);
    flashBuzzer('#draw-btn', '#FFC53D');
  };

  const awardedRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (live?.phase === 'round-end' && !live.startingTotals && live.roundWinner === uid && awardedRoundRef.current !== live.round) {
      awardedRoundRef.current = live.round;
      awardScores(roomCode, { [uid]: 50 });
    }
  }, [live?.phase, live?.roundWinner, live?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Only the winner writes their own +200: that is the one score path RTDB rules
    // allow a non-host to touch, and it prevents the winner being paid twice.
    if (live?.winner && !live.startingTotals && live.winner === uid && !awardedRef.current) {
      awardedRef.current = true;
      void awardScores(roomCode, { [uid]: 200 });
    }
  }, [live?.winner, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col gap-2" data-game-scene="quickdraw">
      <GameHeader name="Quick Draw Duel" accent="#FFC53D" phase={live?.phase} round={`Round ${live?.round ?? 1}`} playerCount={room?.players.length} />
      <div className="flex h-full flex-col gap-2 lg:flex-row">
      <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 2.5, 7], fov: 45 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#0d0d24']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 4]} intensity={0.8} />
          {live && <DuelArena live={live} />}
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
          <span className="arcade-card px-3 py-1 font-display text-lg font-extrabold text-[#FFC53D]">Round {live?.round ?? 1}</span>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-80">
        {(!live || live.phase === 'waiting') && (
          <div className="arcade-card p-4">
            <div className="font-display text-lg font-extrabold">Quick Draw Duel</div>
            <p className="text-sm text-white/70">First to 5 round wins. Tap fastest after GO! A false start gives your opponent the round.</p>
            {isHost ? (
              <button disabled={room?.players.length !== 2} onClick={() => act('start', {
                playerUids: room?.players.map((p) => p.uid),
                startingTotals: Object.fromEntries(room?.players.map((p) => [p.uid, p.score]) ?? []),
              })} className="btn-neon mt-2 w-full rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-50">▶ Start Duel</button>
            ) : <p className="mt-2 text-sm text-white/70">Waiting for the host to start the duel…</p>}
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
            {(live.phase === 'armed' || live.phase === 'countdown') && (
              <button id="draw-btn" onClick={onReact} disabled={live.reactions[uid] !== undefined} className="btn-neon w-full py-4 font-display text-xl font-extrabold">
                {live.reactions[uid] !== undefined ? 'Draw recorded' : live.phase === 'armed' ? '🔫 DRAW!' : '✋ WAIT FOR IT…'}
              </button>
            )}
            {live.phase === 'round-end' && (
              <div className="text-center">
                {live.earlyLoser === uid && <p className="text-[#FB4D6D] font-bold">⚡ Too early! You lose this round.</p>}
                {live.earlyLoser === opponent?.uid && <p className="text-[#34D399] font-bold">⚡ Opponent fired early! You win!</p>}
                {live.roundWinner === uid && !live.earlyLoser && <p className="text-[#34D399] font-bold">⚡ Fastest draw! Round won.</p>}
                {live.roundWinner === opponent?.uid && !live.earlyLoser && <p className="text-[#FB4D6D] font-bold">⚡ Opponent was faster.</p>}
              </div>
            )}
            {live.phase === 'round-end' && !live.winner && isHost && (
              <button disabled={scorePending} onClick={() => act('next-round')} className="btn-neon min-h-[44px] w-full px-3 py-2 font-bold disabled:opacity-50">Next Round ▶</button>
            )}
            {live.phase === 'round-end' && !live.winner && !isHost && (
              <p className="text-center text-sm text-white/50">Waiting for host to start the next round…</p>
            )}
          </div>
        )}
        {live?.phase === 'done' && (
          <div className="arcade-card phase-fade relative p-4 text-center">
            {live.winner === uid && <Confetti />}
            <div className="font-display text-xl font-extrabold text-[#FFC53D]">
              {live.winner === uid ? '🏆 YOU WIN!' : '💀 YOU LOSE'}
            </div>
            <section aria-label="Duel recap" className="my-3 text-sm text-white/80">
              <h2 className="font-display font-bold">Duel recap</h2>
              <ul>{room?.players.filter((p) => Object.hasOwn(live.scores, p.uid)).map((p) => (
                <li key={p.uid}>{p.name} · {live.scores[p.uid]} rounds won</li>
              ))}</ul>
            </section>
            {isHost && !scorePending ? (
              <ReturnToLounge roomCode={roomCode} className="mt-2" />
            ) : !isHost ? (
              <p className="mt-2 text-xs text-white/50">Waiting for the host to return to the lounge…</p>
            ) : null}
          </div>
        )}
        {scorePending && (
          <RoomProgress step="Saving round points…" error={scoreError} onRetry={isHost ? () => {
            setScoreError('');
            setScoreAttempt((value) => value + 1);
          } : undefined} />
        )}
      </div>
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
  tagline: 'First to 5. React to GO!',
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#FFC53D',
  LobbyPreviewScene: Preview,
  GameScene,
  applyAction,
  initState: (uids) => init(uids),
};
