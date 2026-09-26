'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GameModule } from './registry';
import { Avatar3D } from '@/components/Avatar3D';
import { awardScores, dispatchLive, getSessionUid, setLive, subscribeLive, subscribeRoom } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';

type Role = 'werewolf' | 'seer' | 'villager';
interface WState extends LiveState {
  phase: 'waiting' | 'night' | 'day' | 'reveal' | 'ended';
  roles: Record<string, Role>;
  alive: string[];
  seerChecks: Record<string, Role>;
  nightKill?: string | null;
  votes: Record<string, string>;
  eliminated?: string | null;
  eliminatedRole?: Role | null;
  winner?: string | null;
  dayNum: number;
}

function dealRoles(uids: string[]): Record<string, Role> {
  const shuffled = [...uids].sort(() => Math.random() - 0.5);
  const roles: Record<string, Role> = {};
  const wolves = uids.length >= 6 ? 2 : 1;
  shuffled.forEach((u, i) => {
    roles[u] = i < wolves ? 'werewolf' : i === wolves ? 'seer' : 'villager';
  });
  return roles;
}
function init(uids: string[]): WState {
  return { phase: 'waiting', roles: {}, alive: uids, seerChecks: {}, nightKill: null, votes: {}, dayNum: 0 };
}

function checkWin(s: WState): string | null {
  const alive = s.alive || [];
  const roles = s.roles || {};
  const aliveW = alive.filter((u) => roles[u] === 'werewolf');
  const aliveV = alive.filter((u) => roles[u] !== 'werewolf');
  if (aliveW.length === 0) return 'villagers';
  if (aliveW.length >= aliveV.length) return 'werewolves';
  return null;
}

function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as WState;
  switch (action.type) {
    case 'start': {
      return { ...init(action.payload.playerUids), phase: 'night', roles: action.payload.roles, dayNum: 1 };
    }
    case 'wolf-kill':
      return { ...s, nightKill: action.payload.target };
    case 'seer-check':
      return { ...s, seerChecks: { ...s.seerChecks, [action.uid]: s.roles[action.payload.target]! } };
    case 'resolve-night': {
      const killed = s.nightKill;
      const alive = killed ? s.alive.filter((u) => u !== killed) : s.alive;
      const mid: WState = { ...s, alive, eliminated: killed ?? null, eliminatedRole: killed ? s.roles[killed]! : null, phase: killed ? 'reveal' : 'day', nightKill: null, votes: {} };
      const w = checkWin(mid);
      if (w) return { ...mid, phase: 'ended', winner: w };
      return mid;
    }
    case 'to-day':
      return { ...s, phase: 'day', eliminated: null, eliminatedRole: null };
    case 'vote': {
      const votes = { ...s.votes, [action.uid]: action.payload.target };
      return { ...s, votes };
    }
    case 'resolve-day': {
      const tally: Record<string, number> = {};
      Object.values(s.votes).forEach((t) => { tally[t] = (tally[t] ?? 0) + 1; });
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const alive = top ? s.alive.filter((u) => u !== top) : s.alive;
      const mid: WState = { ...s, alive, eliminated: top, eliminatedRole: top ? s.roles[top]! : null, phase: top ? 'reveal' : 'night', votes: {}, dayNum: s.dayNum + 1 };
      const w = checkWin(mid);
      if (w) return { ...mid, phase: 'ended', winner: w };
      return mid;
    }
    case 'to-night':
      return { ...s, phase: 'night', eliminated: null, eliminatedRole: null };
    default:
      return s;
  }
}

function NightSpot({ on, color }: { on: boolean; color: string }) {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.intensity = on ? 4 + Math.sin(clock.getElapsedTime() * 3) * 1.5 : 26;
  });
  return <pointLight ref={ref} position={[0, 5, 0]} intensity={26} distance={20} color={color} />;
}

function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []);
  const [live, setL] = useState<WState | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [voteFor, setVoteFor] = useState('');
  const [killFor, setKillFor] = useState('');
  const [checkFor, setCheckFor] = useState('');
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as WState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);

  const myRole = live?.roles?.[uid];
  const alive = live?.alive ? live.alive.includes(uid) : false;
  const isHost = room?.hostId === uid;
  const night = live?.phase === 'night';
  const nameOf = (u: string) => room?.players.find((p) => p.uid === u)?.name ?? u.slice(0, 6);
  const colorOf = (u: string) => room?.players.find((p) => p.uid === u)?.avatarColor ?? '#888';

  const wolves = Object.entries(live?.roles ?? {}).filter(([, r]) => r === 'werewolf').map(([u]) => u);

  useEffect(() => {
    if (live?.phase === 'ended' && isHost) {
      const awards: Record<string, number> = {};
      (room?.players ?? []).forEach((p) => {
        const r = live.roles?.[p.uid];
        const won = (live.winner === 'werewolves' && r === 'werewolf') || (live.winner === 'villagers' && r !== 'werewolf');
        if (won && (live.alive || []).includes(p.uid)) awards[p.uid] = 150;
        else if (won) awards[p.uid] = 80;
      });
      awardScores(roomCode, awards);
    }
  }, [live?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (type: string, payload: any = {}) =>
    dispatchLive(roomCode, { type, uid, payload }, applyAction, () => init(room?.players.map((p) => p.uid) ?? []));

  return (
    <div className="flex h-full flex-col gap-2 lg:flex-row">
      <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 5, 9], fov: 50 }} dpr={[1, 1.75]}>
          <color attach="background" args={[night ? '#050514' : '#141432']} />
          <ambientLight intensity={night ? 0.15 : 0.7} />
          <directionalLight position={[4, 7, 3]} intensity={night ? 0.15 : 0.9} />
          <NightSpot on={!!night} color={night ? '#5b2a86' : '#ff6b35'} />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[6.5, 40]} />
            <meshStandardMaterial color={night ? '#101024' : '#1b1b40'} roughness={0.85} />
          </mesh>
          {(room?.players ?? []).map((p, i) => {
            const a = (i / Math.max(room!.players.length, 1)) * Math.PI * 2;
            const isOut = live && !(live.alive || []).includes(p.uid);
            const isElimSpot = live?.phase === 'reveal' && live.eliminated === p.uid;
            return (
              <Avatar3D key={p.uid} color={p.avatarColor} name={`${p.name}${isOut ? ' ☠' : ''}`}
                position={[Math.cos(a) * 3, 0, Math.sin(a) * 3]} dimmed={!!night || !!isOut} highlight={!!isElimSpot} />
            );
          })}
        </Canvas>
        <div className="absolute left-3 top-3 arcade-card px-3 py-1 font-display text-lg font-extrabold">
          {live?.phase === 'waiting' ? '🌙 Lobby' : live?.phase === 'night' ? `🌙 Night ${live.dayNum}` : live?.phase === 'day' ? `☀️ Day ${live.dayNum} — discuss!` : live?.phase === 'reveal' ? '🔦 Reveal!' : `🏁 ${live?.winner} win!`}
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-80">
        {(!live || live.phase === 'waiting') && (
          <div className="arcade-card p-4">
            <div className="font-display text-lg font-extrabold">Werewolf</div>
            <p className="text-sm text-white/70">Secret roles. Night dims the lounge — wolves hunt, the seer peeks. Day: debate & vote. Spotlight reveals the fallen.</p>
            {isHost
               ? <button onClick={() => {
                   const uids = room?.players.map((p) => p.uid) ?? [];
                   act('start', { playerUids: uids, roles: dealRoles(uids) });
                 }} className="btn-neon mt-2 w-full rounded-xl px-3 py-2 text-sm font-bold">Deal roles & start night</button>
              : <p className="mt-2 text-sm text-white/60">Waiting for host…</p>}
          </div>
        )}
        {live && live.phase !== 'waiting' && live.phase !== 'ended' && (
          <div className="arcade-card p-3">
            <div className={`rounded-xl px-3 py-2 text-sm font-bold ${alive ? 'bg-white/10' : 'bg-black/40 text-white/40'}`}>
              {alive ? <>Your role: <span className="font-display text-base">{myRole === 'werewolf' ? '🐺 Werewolf' : myRole === 'seer' ? '🔮 Seer' : '🌾 Villager'}</span></> : '☠ You are out — watch quietly.'}
            </div>
            {night && myRole === 'werewolf' && alive && (
              <div className="mt-2">
                <div className="text-xs font-bold uppercase tracking-widest text-[#FF3D81]">Pack: {wolves.map(nameOf).join(', ')}</div>
                <div className="mt-1 flex gap-1">
                  <select value={killFor} onChange={(e) => setKillFor(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-black/40 px-2 py-1.5 text-sm">
                    <option value="">Kill…</option>
                    {live.alive.filter((u) => u !== uid).map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
                  </select>
                  <button onClick={() => killFor && act('wolf-kill', { target: killFor })} className="rounded-lg bg-[#FF3D81] px-3 py-1.5 text-sm font-bold">🐺</button>
                </div>
              </div>
            )}
            {night && myRole === 'seer' && alive && (
              <div className="mt-2 flex gap-1">
                <select value={checkFor} onChange={(e) => setCheckFor(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-black/40 px-2 py-1.5 text-sm">
                  <option value="">Peek at…</option>
                  {live.alive.filter((u) => u !== uid).map((u) => <option key={u} value={u}>{nameOf(u)}</option>)}
                </select>
                <button onClick={() => checkFor && act('seer-check', { target: checkFor })} className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-sm font-bold">🔮</button>
              </div>
            )}
            {checkFor && live.seerChecks[uid] && <p className="mt-1 text-sm text-[#8B5CF6]">🔮 {nameOf(checkFor)} is a <b>{live.seerChecks[uid]}</b></p>}
            {live.phase === 'day' && alive && (
              <div className="mt-2 flex gap-1">
                <select value={voteFor} onChange={(e) => setVoteFor(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-black/40 px-2 py-1.5 text-sm">
                  <option value="">Vote to eliminate…</option>
                  {live.alive.filter((u) => u !== uid).map((u) => <option key={u} value={u}>{nameOf(u)} ({Object.values(live.votes).filter((v) => v === u).length})</option>)}
                </select>
                <button onClick={() => voteFor && act('vote', { target: voteFor })} className="rounded-lg bg-[#FFC53D] px-3 py-1.5 text-sm font-bold text-black">Vote</button>
              </div>
            )}
            {isHost && (
              <div className="mt-2 flex gap-1">
                {night && <button onClick={() => act('resolve-night')} className="flex-1 rounded-xl bg-white/10 px-2 py-2 text-xs font-bold">🌅 Resolve night</button>}
                {live.phase === 'day' && <button onClick={() => act('resolve-day')} className="flex-1 rounded-xl bg-white/10 px-2 py-2 text-xs font-bold">⚖️ Resolve vote</button>}
                {live.phase === 'reveal' && (
                  <>
                    <button onClick={() => act('to-day')} className="flex-1 rounded-xl bg-white/10 px-2 py-2 text-xs font-bold">☀️ To day</button>
                    <button onClick={() => act('to-night')} className="flex-1 rounded-xl bg-white/10 px-2 py-2 text-xs font-bold">🌙 To night</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {live?.phase === 'reveal' && live.eliminated && (
          <div className="arcade-card border-[#FFC53D]/50 p-4 text-center">
            <div className="font-display text-xl font-extrabold text-[#FFC53D]">🔦 {nameOf(live.eliminated)} falls!</div>
            <p className="text-sm text-white/70">They were a <b>{live.eliminatedRole}</b>.</p>
          </div>
        )}
        {live?.phase === 'ended' && (
          <div className="arcade-card p-4 text-center">
            <div className="font-display text-xl font-extrabold">🏁 {live.winner} win the village!</div>
            <div className="mt-1 text-sm text-white/70">
              {Object.entries(live.roles).map(([u, r]) => <div key={u}>{nameOf(u)} — {r}{live.alive.includes(u) ? ' (survived)' : ''}</div>)}
            </div>
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
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.6;
  });
  return (
    <group ref={ref}>
      <mesh><sphereGeometry args={[0.45, 18, 18]} /><meshStandardMaterial color="#1b1b40" roughness={0.4} /></mesh>
      <mesh position={[0.15, 0.1, 0.35]}><boxGeometry args={[0.4, 0.16, 0.1]} /><meshStandardMaterial color="#FF3D81" emissive="#FF3D81" emissiveIntensity={1.4} /></mesh>
      <mesh position={[-0.15, 0.1, 0.35]}><boxGeometry args={[0.4, 0.16, 0.1]} /><meshStandardMaterial color="#FF3D81" emissive="#FF3D81" emissiveIntensity={1.4} /></mesh>
    </group>
  );
}

export const Werewolf: GameModule = {
  id: 'werewolf', displayName: 'Werewolf', tagline: 'Night falls. Trust no one.',
  minPlayers: 4, maxPlayers: 8, accent: '#5b2a86',
  LobbyPreviewScene: Preview, GameScene, applyAction, initState: (uids) => init(uids),
};
