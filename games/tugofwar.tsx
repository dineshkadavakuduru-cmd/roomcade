'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GameModule } from './registry';
import { awardScores, dispatchLive, getSessionUid, setLive, subscribeLive, subscribeRoom } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';
import { flashBuzzer } from '@/lib/anime';

const WIN_THRESHOLD = 1;
const MAX_POSITION = 3;
const ROPE_SEGMENTS = 20;

interface TState extends LiveState {
  phase: 'waiting' | 'playing' | 'done';
  ropePos: number;
  tapCounts: Record<string, number>;
  lastTap: Record<string, number>;
  winner: string | null;
  startedAt: number;
}
function init(uids: string[]): TState {
  const tapCounts: Record<string, number> = {};
  if (uids[0]) tapCounts[uids[0]] = 0;
  if (uids[1]) tapCounts[uids[1]] = 0;
  return {
    phase: 'waiting',
    ropePos: 0,
    tapCounts,
    lastTap: {},
    winner: null,
    startedAt: 0,
  };
}
function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as TState;
  switch (action.type) {
    case 'start':
      return { ...init(action.payload.playerUids), phase: 'playing', startedAt: Date.now() };
    case 'tap': {
      if (s.phase !== 'playing') return s;
      const now = Date.now();
      const last = s.lastTap[action.uid] ?? 0;
      if (now - last < 30) return s; // debounce
      const tapCounts = { ...s.tapCounts, [action.uid]: (s.tapCounts[action.uid] ?? 0) + 1 };
      const p1 = tapCounts[Object.keys(tapCounts)[0]] ?? 0;
      const p2 = tapCounts[Object.keys(tapCounts)[1]] ?? 0;
      const total = p1 + p2;
      let ropePos = 0;
      if (total > 0) {
        ropePos = ((p1 - p2) / total) * MAX_POSITION;
        ropePos = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, ropePos));
      }
      let winner: string | null = null;
      if (ropePos <= -WIN_THRESHOLD) winner = Object.keys(tapCounts)[0];
      if (ropePos >= WIN_THRESHOLD) winner = Object.keys(tapCounts)[1];
      return { ...s, ropePos, tapCounts, lastTap: { ...s.lastTap, [action.uid]: now }, winner };
    }
    case 'end':
      return { ...s, phase: 'done' };
    default:
      return s;
  }
}

function Rope({ pos }: { pos: number }) {
  const ref = useRef<any>(null);
  const segments = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= ROPE_SEGMENTS; i++) {
      const t = i / ROPE_SEGMENTS;
      const x = -MAX_POSITION + t * (2 * MAX_POSITION);
      const sag = Math.sin(t * Math.PI) * 0.6;
      const sway = Math.sin(t * Math.PI * 2) * 0.15;
      pts.push([x + pos * (t - 0.5), sag, sway]);
    }
    return pts;
  }, [pos]);
  return (
    <group ref={ref}>
      {segments.map((p, i) => (
        i < segments.length - 1 && (
          <mesh key={i} position={[(p[0] + segments[i + 1][0]) / 2, (p[1] + segments[i + 1][1]) / 2, (p[2] + segments[i + 1][2]) / 2]}>
            <cylinderGeometry args={[0.08, 0.08, Math.sqrt(
              Math.pow(segments[i + 1][0] - p[0], 2) +
              Math.pow(segments[i + 1][1] - p[1], 2) +
              Math.pow(segments[i + 1][2] - p[2], 2)
            )]} />
            <meshStandardMaterial color="#8B6B4F" roughness={0.8} metalness={0.1} />
          </mesh>
        )
      ))}
    </group>
  );
}

function DustParticles({ intensity }: { intensity: number }) {
  const ref = useRef<any[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ref.current.forEach((p, i) => {
      p.position.y -= p.speed * 0.02;
      p.position.x += Math.sin(t * 2 + i) * 0.005;
      if (p.position.y < -2) {
        p.position.y = 2;
        p.position.x = (Math.random() - 0.5) * 0.5;
      }
    });
  });
  const count = Math.floor(intensity * 30);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={new Float32Array(
            Array.from({ length: count * 3 }, (_, i) =>
              i % 3 === 0 ? (Math.random() - 0.5) * 0.5 : i % 3 === 1 ? Math.random() * 3 - 1 : 0
            )
          )}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#C9B896" size={0.04} sizeAttenuation transparent opacity={0.6} />
    </points>
  );
}

function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []);
  const [live, setL] = useState<TState | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [localPos, setLocalPos] = useState(0);
  const [showSnap, setShowSnap] = useState(false);
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as TState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);

  const me = room?.players.find((p) => p.uid === uid);
  const opponent = room?.players.find((p) => p.uid !== uid);
  const isLeft = room?.players[0]?.uid === uid;

  useEffect(() => {
    if (live) setLocalPos(live.ropePos);
  }, [live?.ropePos]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (type: string, payload: any = {}) =>
    dispatchLive(roomCode, { type, uid, payload }, applyAction, () => init(room?.players.map((p) => p.uid) ?? []));

  const onTap = () => {
    if (live?.phase !== 'playing') return;
    act('tap');
    flashBuzzer('#pull-btn', isLeft ? '#FF6B35' : '#38BDF8');
  };

  useEffect(() => {
    if (live?.winner && live.winner !== uid) return;
    if (live?.winner === uid) {
      awardScores(roomCode, { [uid]: 200 });
      setShowSnap(true);
      setTimeout(() => setShowSnap(false), 400);
    }
  }, [live?.winner]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col gap-2 lg:flex-row">
      <div className="relative min-h-[360px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 2.5, 8], fov: 40 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#0d0d24']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 4]} intensity={0.8} />
          <pointLight position={[0, 3, 0]} intensity={15} distance={15} color="#FFC53D" />
          {/* Chasm */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[16, 16]} />
            <meshStandardMaterial color="#080818" roughness={0.9} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
            <ringGeometry args={[MAX_POSITION + 0.5, MAX_POSITION + 1.5, 32]} />
            <meshBasicMaterial color="#FFC53D" transparent opacity={0.3} />
          </mesh>
          <Rope pos={localPos} />
          <DustParticles intensity={Math.abs(localPos) / MAX_POSITION} />
          {/* Avatars pulling */}
          <mesh position={[-MAX_POSITION - 0.5, 1.2, 0]} rotation={[0, Math.PI / 2, 0]}>
            <sphereGeometry args={[0.7, 18, 18]} />
            <meshStandardMaterial color="#FF6B35" roughness={0.5} />
          </mesh>
          <mesh position={[MAX_POSITION + 0.5, 1.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <sphereGeometry args={[0.7, 18, 18]} />
            <meshStandardMaterial color="#38BDF8" roughness={0.5} />
          </mesh>
          {/* Win zones */}
          <mesh position={[-MAX_POSITION - 0.5, 0, 0]}>
            <cylinderGeometry args={[0.8, 0.8, 0.1, 16]} />
            <meshBasicMaterial color="#FF6B35" transparent opacity={0.4} />
          </mesh>
          <mesh position={[MAX_POSITION + 0.5, 0, 0]}>
            <cylinderGeometry args={[0.8, 0.8, 0.1, 16]} />
            <meshBasicMaterial color="#38BDF8" transparent opacity={0.4} />
          </mesh>
        </Canvas>
        {showSnap && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 animate-[snap_0.3s_ease_out]">
            <div className="font-display text-5xl font-extrabold text-[#FFC53D] drop-shadow-[0_0_30px_#FFC53D]">SNAP!</div>
          </div>
        )}
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-80">
        {(!live || live.phase === 'waiting') && (
          <div className="arcade-card p-4">
            <div className="font-display text-lg font-extrabold">Tug of War</div>
            <p className="text-sm text-white/70">Rapid tap to pull the rope. First to drag the marker into your zone wins. Two players only.</p>
            <button onClick={() => act('start', { playerUids: room?.players.map((p) => p.uid) ?? [] })} className="btn-neon mt-2 w-full rounded-xl px-3 py-2 text-sm font-bold">▶ Start Pull</button>
          </div>
        )}
        {live && live.phase !== 'waiting' && live.phase !== 'done' && (
          <div className="arcade-card flex flex-col gap-3 p-4">
            <div className="flex gap-2">
              <div className="flex-1 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-white/50">{me?.name}</div>
                <div className="font-display text-3xl font-extrabold text-[#FF6B35]">{live.tapCounts[uid] ?? 0}</div>
              </div>
              <div className="w-24 text-center">
                <div className="relative h-4 bg-gradient-to-r from-[#FF6B35] via-white/20 to-[#38BDF8] rounded-full overflow-hidden">
                  <div
                    className="absolute top-0 bottom-0 w-4 rounded-full bg-white/80 shadow-[0_0_8px_#FFC53D] transition-all duration-300 ease-out"
                    style={{
                      left: `${50 + (localPos / MAX_POSITION) * 45}%`,
                      transform: 'translateX(-50%)',
                    }}
                  />
                </div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-xs font-bold uppercase tracking-widest text-white/50">{opponent?.name}</div>
                <div className="font-display text-3xl font-extrabold text-[#38BDF8]">{live.tapCounts[opponent?.uid ?? ''] ?? 0}</div>
              </div>
            </div>
            <button id="pull-btn" onClick={onTap} className="btn-neon w-full py-4 font-display text-xl font-extrabold">💪 PULL!</button>
            <p className="text-center text-sm text-white/60">Drag the marker past your threshold to win.</p>
          </div>
        )}
        {live?.phase === 'done' && (
          <div className="arcade-card p-4 text-center">
            <div className="font-display text-xl font-extrabold text-[#FFC53D]">
              {live.winner === uid ? '🏆 YOU WIN!' : '💀 YOU LOSE'}
            </div>
            <p className="text-sm text-white/70">Taps: {live.tapCounts[uid] ?? 0} vs {live.tapCounts[opponent?.uid ?? ''] ?? 0}</p>
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
      ref.current.rotation.y = t * 0.4;
      // Animate rope segments
      ref.current.children.forEach((child: any, i: number) => {
        if (child.isMesh && child.geometry?.type === 'CylinderGeometry') {
          child.position.y = Math.sin((i * 0.5) + t * 3) * 0.15;
        }
      });
    }
  });
  return (
    <group ref={ref}>
      <mesh position={[-2, 0, 0]}><sphereGeometry args={[0.5, 16, 16]} /><meshStandardMaterial color="#FF6B35" emissive="#FF6B35" emissiveIntensity={0.4} /></mesh>
      <mesh position={[2, 0, 0]}><sphereGeometry args={[0.5, 16, 16]} /><meshStandardMaterial color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.4} /></mesh>
      {Array.from({ length: 10 }, (_, i) => {
        const t = i / 9;
        const x = -2 + t * 4;
        const y = Math.sin(t * Math.PI) * 0.3;
        return (
          <mesh key={i} position={[x, y, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.45]} />
            <meshStandardMaterial color="#8B6B4F" roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );
}

export const TugOfWar: GameModule = {
  id: 'tugofwar',
  displayName: 'Tug of War',
  tagline: 'Rapid tap. Pull to your side.',
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#FF6B35',
  LobbyPreviewScene: Preview,
  GameScene,
  applyAction,
  initState: (uids) => init(uids),
};