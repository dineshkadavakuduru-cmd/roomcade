'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GameModule } from './registry';
import { Avatar3D } from '@/components/Avatar3D';
import { awardScores, dispatchLive, getSessionUid, setLive, subscribeLive, subscribeRoom } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';
import { flashBuzzer } from '@/lib/anime';

const QUESTIONS = [
  { q: 'Which planet is known as the Red Planet?', choices: ['Venus', 'Mars', 'Jupiter', 'Mercury'], a: 1 },
  { q: 'How many players start a Tag Arena round as “it”?', choices: ['1', '2', '3', 'All'], a: 0 },
  { q: 'What does the “3D” in 3D lobby stand for?', choices: ['Three Dimensions', 'Third Door', 'Triple Dice', 'Three Dragons'], a: 0 },
  { q: 'Which shape has 6 square faces?', choices: ['Pyramid', 'Cone', 'Cube', 'Torus'], a: 2 },
  { q: 'A group of wolves is called a…', choices: ['Pack', 'Flock', 'School', 'Committee'], a: 0 },
  { q: 'How many seconds in 2 minutes?', choices: ['100', '110', '120', '200'], a: 2 },
  { q: 'Which color is NOT a Roomcade neon accent?', choices: ['Orange', 'Pink', 'Beige', 'Violet'], a: 2 },
  { q: 'What do you type to join a friend’s room?', choices: ['Room code', 'Password hash', 'IP address', 'Haiku'], a: 0 },
  { q: 'In Sculptionary, who sees the secret word?', choices: ['Everyone', 'The sculptor', 'Nobody', 'The host only'], a: 1 },
  { q: 'Best strategy for Tag Arena?', choices: ['Stand still', 'Keep moving', 'Close eyes', 'Log out'], a: 1 },
];

interface TState extends LiveState {
  phase: 'waiting' | 'question' | 'buzzed' | 'reveal' | 'done';
  qIndex: number; buzzedUid: string | null; buzzOrder: string[];
  correctUid: string | null; picked: number | null;
}
function init(): TState {
  return { phase: 'waiting', qIndex: 0, buzzedUid: null, buzzOrder: [], correctUid: null, picked: null };
}
function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as TState;
  switch (action.type) {
    case 'ask':
      return { ...s, phase: 'question', qIndex: action.payload.qIndex, buzzedUid: null, buzzOrder: [], correctUid: null, picked: null };
    case 'buzz':
      if (s.phase !== 'question' || s.buzzOrder.includes(action.uid)) return s;
      return { ...s, phase: 'buzzed', buzzedUid: action.uid, buzzOrder: [...s.buzzOrder, action.uid] };
    case 'answer': {
      const correct = action.payload.choice === QUESTIONS[s.qIndex]!.a;
      if (correct) return { ...s, phase: 'reveal', correctUid: action.uid, picked: action.payload.choice };
      // wrong: back to question, buzzed player locked out this round
      return { ...s, phase: 'question', buzzedUid: null, picked: action.payload.choice };
    }
    case 'next': {
      const qIndex = s.qIndex + 1;
      if (qIndex >= QUESTIONS.length) return { ...s, phase: 'done' };
      return { ...s, phase: 'question', qIndex, buzzedUid: null, buzzOrder: [], correctUid: null, picked: null };
    }
    case 'end':
      return { ...s, phase: 'done' };
    default:
      return s;
  }
}

function Podiums({ players, buzzedUid, correctUid }: { players: RoomMeta['players']; buzzedUid: string | null; correctUid: string | null }) {
  const spot = useRef<any>(null);
  useFrame(({ clock }) => {
    if (spot.current) spot.current.intensity = buzzedUid ? 30 + Math.sin(clock.getElapsedTime() * 8) * 10 : 12;
  });
  return (
    <group>
      {players.map((p, i) => {
        const x = (i - (players.length - 1) / 2) * 2.2;
        const hot = p.uid === (correctUid ?? buzzedUid);
        return (
          <group key={p.uid} position={[x, 0, 0]}>
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[0.55, 0.7, 0.8, 20]} />
              <meshStandardMaterial color={correctUid === p.uid ? '#34D399' : hot ? '#FF3D81' : '#2a2a5e'}
                emissive={hot || correctUid === p.uid ? (correctUid === p.uid ? '#34D399' : '#FF3D81') : '#000'} emissiveIntensity={hot ? 1 : 0.15} />
            </mesh>
            <Avatar3D color={p.avatarColor} name={p.name} position={[0, 0.8, 0]} highlight={hot} />
            {hot && <pointLight position={[x, 4, 2]} intensity={30} distance={10} color={correctUid ? '#34D399' : '#FF3D81'} />}
          </group>
        );
      })}
      <pointLight ref={spot} position={[0, 6, 4]} intensity={12} distance={20} color="#fff6e9" />
    </group>
  );
}

function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []);
  const [live, setL] = useState<TState | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as TState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);
  const isHost = room?.hostId === uid;
  const q = live ? QUESTIONS[live.qIndex] : null;
  const myTurn = live?.buzzedUid === uid;
  const lockedOut = !!live && live.phase === 'question' && live.buzzOrder.includes(uid) && live.buzzOrder[0] !== uid;

  const act = (type: string, payload: any = {}) =>
    dispatchLive(roomCode, { type, uid, payload }, applyAction, init);

  const buzz = () => {
    act('buzz');
    flashBuzzer('#buzz-btn', '#FF3D81');
  };
  const answer = (choice: number) => {
    const correct = choice === QUESTIONS[live!.qIndex]!.a;
    if (correct) {
      awardScores(roomCode, { [uid]: 100 });
      flashBuzzer('#quiz-card', '#34D399');
    }
    act('answer', { choice });
  };

  return (
    <div className="flex h-full flex-col gap-2 lg:flex-row">
      <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 4.5, 9], fov: 50 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#101028']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 7, 3]} intensity={0.9} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[30, 30]} />
            <meshStandardMaterial color="#141432" roughness={0.9} />
          </mesh>
          {room && <Podiums players={room.players} buzzedUid={live?.buzzedUid ?? null} correctUid={live?.correctUid ?? null} />}
        </Canvas>
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-96">
        {(!live || live.phase === 'waiting') && (
          <div className="arcade-card p-4">
            <div className="font-display text-lg font-extrabold">Trivia Podiums 🎙️</div>
            <p className="text-sm text-white/70">Host reveals a question — fastest buzzer gets the spotlight and answers. Correct = +100 & green flash.</p>
            {isHost
              ? <button onClick={() => act('ask', { qIndex: 0 })} className="btn-neon mt-2 w-full rounded-xl px-3 py-2 text-sm font-bold">Ask question 1</button>
              : <p className="mt-2 text-sm text-white/60">Waiting for host…</p>}
          </div>
        )}
        {live && (live.phase === 'question' || live.phase === 'buzzed') && q && (
          <div id="quiz-card" className="arcade-card p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-white/50">Question {live.qIndex + 1}/{QUESTIONS.length}</div>
            <div className="font-display mt-1 text-xl font-extrabold">{q.q}</div>
            {live.phase === 'question' && !lockedOut && (
              <button id="buzz-btn" onClick={buzz} className="btn-neon mt-3 w-full rounded-xl px-3 py-3 font-display text-xl font-extrabold">🔔 BUZZ IN</button>
            )}
            {lockedOut && <p className="mt-2 text-sm text-white/60">You buzzed wrong — locked out for this question.</p>}
            {live.phase === 'buzzed' && (
              <p className="mt-2 text-sm font-bold text-[#FF3D81]">
                {myTurn ? '🎯 You have the spotlight — pick an answer!' : `${room?.players.find((p) => p.uid === live.buzzedUid)?.name} is answering…`}
              </p>
            )}
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {q.choices.map((c, i) => (
                <button key={i} disabled={!myTurn} onClick={() => answer(i)}
                  className={`rounded-xl px-3 py-2 text-left text-sm font-semibold ${myTurn ? 'bg-white/10 hover:bg-[#FF3D81]/40' : 'bg-white/5 text-white/60'}`}>
                  {String.fromCharCode(65 + i)}. {c}
                </button>
              ))}
            </div>
            {isHost && <button onClick={() => act('next')} className="mt-2 w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">Skip / next →</button>}
          </div>
        )}
        {live?.phase === 'reveal' && q && (
          <div className="arcade-card border-[#34D399]/50 p-4 text-center">
            <div className="font-display text-xl font-extrabold text-[#34D399]">✅ {room?.players.find((p) => p.uid === live.correctUid)?.name} scores +100!</div>
            <p className="text-sm text-white/70">Answer: {q.choices[q.a]}</p>
            {isHost && (
              <div className="mt-2 flex gap-1">
                <button onClick={() => act('next')} className="btn-neon flex-1 rounded-xl px-3 py-2 text-sm font-bold">Next question</button>
                <button onClick={() => act('end')} className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">Finish</button>
              </div>
            )}
          </div>
        )}
        {live?.phase === 'done' && (
          <div className="arcade-card p-4 text-center">
            <div className="font-display text-xl font-extrabold">That’s the quiz! 🎉</div>
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
    if (ref.current) ref.current.position.y = 0.2 + Math.sin(clock.getElapsedTime() * 2) * 0.15;
  });
  return (
    <group>
      <mesh position={[0, -0.4, 0]}><cylinderGeometry args={[0.4, 0.5, 0.5, 16]} /><meshStandardMaterial color="#FFC53D" emissive="#FFC53D" emissiveIntensity={0.5} /></mesh>
      <mesh ref={ref}><sphereGeometry args={[0.25, 14, 14]} /><meshStandardMaterial color="#FF3D81" emissive="#FF3D81" emissiveIntensity={0.9} /></mesh>
    </group>
  );
}

export const Trivia: GameModule = {
  id: 'trivia', displayName: 'Trivia Podiums', tagline: 'Buzz fast, shine bright',
  minPlayers: 2, maxPlayers: 8, accent: '#FFC53D',
  LobbyPreviewScene: Preview, GameScene, applyAction, initState: init,
};
