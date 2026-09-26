'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GameModule } from './registry';
import { Avatar3D } from '@/components/Avatar3D';
import { awardScores, dispatchLive, getSessionUid, setLive, subscribeLive, subscribeRoom } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';
import { flashBuzzer } from '@/lib/anime';

const TRUTHS = [
  "What's the most embarrassing thing you've done sober?", "Who in this room would you swap lives with for a week?", "What's the worst lie you've told a partner?", "Have you ever ghosted someone you actually liked?", "What's something you've done that you'd never admit to your parents?", "What's the most money you've spent on something you regret?", "Have you ever liked a situationship more than a real relationship?", "What's the pettiest reason you've ended a friendship?", "What's an opinion you hold that most people in this room would disagree with?", "What's the most embarrassing thing on your phone right now?", "Have you ever talked badly about someone in this room to someone outside it?", "What's the worst date you've ever been on?", "What's a secret you've kept from your best friend?", "Have you ever caught feelings for someone who was already taken?", "What's the most impulsive decision you've ever made?", "Have you ever pretended to be sick to avoid someone in this room?", "What's something you're too scared to say out loud but would type anonymously?", "What's the shadiest thing you've done for money?", "Have you ever sent a text to the wrong person and it was bad?", "What's your biggest insecurity you don't talk about?", "What's the most ridiculous thing you've been jealous of?", "Have you ever manipulated someone to get what you wanted?", "What's the most desperate thing you've done for attention?", "Which person in this room do you think will be most successful? Most likely to fail?", "What's a red flag in yourself that you actively ignore?",
];
const DARES = [
  'Do your best impression of the host right now.', "Text your most recent contact 'I have something important to tell you' and wait for a reply.", 'Let the group go through your camera roll for 30 seconds.', 'Call someone random in your contacts and sing Happy Birthday.', 'Post a photo chosen by the group to your Instagram story for 1 hour.', 'DM your celebrity crush something cheesy right now.', 'Do 20 pushups or take a dare penalty (chosen by group).', 'Let someone in the group change your profile picture for the next hour.', 'Say something genuinely nice about every person in the room.', 'Speak in an accent chosen by the group for the next 2 rounds.', 'Let the group read your last 5 WhatsApp messages out loud.', 'Act out your most-used emoji for 30 seconds without speaking.', "Send a voice note to your last three contacts saying only 'you know what you did'.", 'Share your screen and show your most recent search history.', 'Text your boss or a teacher an unsolicited compliment right now.', 'Do your best runway walk across the room.', 'Let someone in the room write a caption for your next social media post.', 'Describe the last person you liked without saying their name — everyone tries to guess.', 'Show your Spotify listening history for the last week.', 'Do a 30-second standup comedy routine about something that happened this week.', 'Let the group choose a word you have to use naturally in your next 3 sentences.', "Text someone 'we need to talk' and do not explain until they reply.", 'Share your honest rating of everyone in the room on vibe only (1–10).', 'Show your most embarrassing saved meme.', 'Roast the person on your left in under 30 seconds. They cannot retaliate.',
];

type TDPhase = 'waiting' | 'picking' | 'chosen' | 'revealed' | 'scored';
interface TDState extends LiveState {
  phase: TDPhase;
  currentPlayerUid: string | null;
  choice: 'truth' | 'dare' | null;
  promptIndex: number | null;
  votes: Record<string, 'done' | 'chickened'>;
  roundScores: Record<string, number>;
  round: number;
  usedTruths: number[];
  usedDares: number[];
}
function init(_uids: string[] = []): TDState {
  return { phase: 'waiting', currentPlayerUid: null, choice: null, promptIndex: null, votes: {}, roundScores: {}, round: 0, usedTruths: [], usedDares: [] };
}
function pickUnused(used: number[], total: number): number {
  const available = Array.from({ length: total }, (_, i) => i).filter((i) => !used.includes(i));
  return available.length ? available[Math.floor(Math.random() * available.length)]! : Math.floor(Math.random() * total);
}
function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as TDState;
  switch (action.type) {
    case 'pick-player': return { ...s, phase: 'chosen', currentPlayerUid: action.payload.uid, choice: null, promptIndex: null, votes: {} };
    case 'choose': {
      const isTruth = action.payload.choice === 'truth';
      const idx = pickUnused(isTruth ? s.usedTruths : s.usedDares, isTruth ? TRUTHS.length : DARES.length);
      return { ...s, phase: 'revealed', choice: action.payload.choice, promptIndex: idx, usedTruths: isTruth ? [...s.usedTruths, idx] : s.usedTruths, usedDares: isTruth ? s.usedDares : [...s.usedDares, idx] };
    }
    case 'vote': return { ...s, votes: { ...s.votes, [action.uid]: action.payload.verdict } };
    case 'resolve': {
      const votes = s.votes || {};
      const done = Object.values(votes).filter((v) => v === 'done').length;
      const total = Object.keys(votes).length;
      const pts = total > 0 && done > total / 2 ? (s.choice === 'dare' ? 100 : 50) : 0;
      return { ...s, phase: 'scored', roundScores: s.currentPlayerUid ? { [s.currentPlayerUid]: pts } : {}, round: s.round + 1 };
    }
    case 'next': return { ...s, phase: 'picking', currentPlayerUid: null, choice: null, promptIndex: null, votes: {}, roundScores: {} };
    case 'end': return { ...s, phase: 'waiting' };
    default: return s;
  }
}

function CampfireScene({ players, hotUid }: { players: RoomMeta['players']; hotUid: string | null }) {
  const fireRef = useRef<any>(null); const glowRef = useRef<any>(null);
  useFrame(({ clock }) => { const t = clock.getElapsedTime(); if (fireRef.current) { fireRef.current.scale.y = 1 + Math.sin(t * 7) * 0.12; fireRef.current.scale.x = 1 + Math.sin(t * 5.3) * 0.07; } if (glowRef.current) glowRef.current.intensity = 18 + Math.sin(t * 4) * 6; });
  const count = Math.max(players.length, 1);
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[7, 40]} /><meshStandardMaterial color="#111128" roughness={0.9} /></mesh>
    {[0, 1, 2].map((i) => <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.4, 0.08, Math.sin((i / 3) * Math.PI * 2) * 0.4]} rotation={[0, (i / 3) * Math.PI * 2, Math.PI / 2.5]}><cylinderGeometry args={[0.08, 0.1, 0.9, 8]} /><meshStandardMaterial color="#3d2009" roughness={0.9} /></mesh>)}
    <mesh ref={fireRef} position={[0, 0.35, 0]}><coneGeometry args={[0.22, 0.7, 10]} /><meshStandardMaterial color="#FF6B35" emissive="#FF4400" emissiveIntensity={2.5} transparent opacity={0.85} /></mesh>
    <mesh position={[0, 0.15, 0]}><coneGeometry args={[0.15, 0.4, 8]} /><meshStandardMaterial color="#FFC53D" emissive="#FFC53D" emissiveIntensity={3} transparent opacity={0.7} /></mesh>
    <pointLight ref={glowRef} position={[0, 1.5, 0]} intensity={18} distance={14} color="#FF6B35" />
    {players.map((p, i) => { const a = (i / count) * Math.PI * 2 - Math.PI / 2; return <Avatar3D key={p.uid} color={p.avatarColor} name={p.name} position={[Math.cos(a) * 4.2, 0, Math.sin(a) * 4.2]} highlight={p.uid === hotUid} />; })}
  </group>;
}

function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []); const [live, setL] = useState<TDState | null>(null); const [room, setRoom] = useState<RoomMeta | null>(null); const [myVote, setMyVote] = useState<'done' | 'chickened' | null>(null); const awardedRef = useRef(false);
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as TDState) ?? null)), [roomCode]); useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);
  useEffect(() => { if (live?.phase === 'picking') { setMyVote(null); awardedRef.current = false; } }, [live?.phase]);
  const isHost = room?.hostId === uid; const isOnTheSpot = live?.currentPlayerUid === uid;
  const prompt = live?.promptIndex != null ? (live.choice === 'truth' ? TRUTHS[live.promptIndex] : DARES[live.promptIndex]) : null;
  const act = (type: string, payload: any = {}) => dispatchLive(roomCode, { type, uid, payload }, applyAction, init);
  const vote = (verdict: 'done' | 'chickened') => { if (myVote || isOnTheSpot) return; setMyVote(verdict); act('vote', { verdict }); flashBuzzer('#vote-card', verdict === 'done' ? '#34D399' : '#FB4D6D'); };
  useEffect(() => { if (live?.phase === 'scored' && !awardedRef.current && isHost) { awardedRef.current = true; const awards = live.roundScores; if (Object.keys(awards).length > 0) void awardScores(roomCode, awards); } }, [live?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const allVoted = live ? Object.keys(live.votes || {}).length >= Math.max(0, (room?.players.length ?? 0) - 1) : false;
  return <div className="flex h-full flex-col gap-2 lg:flex-row">
    <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-white/10"><Canvas camera={{ position: [0, 7, 10], fov: 50 }} dpr={[1, 1.75]}><color attach="background" args={['#05050f']} /><ambientLight intensity={0.25} /><directionalLight position={[4, 6, 3]} intensity={0.4} />{room && <CampfireScene players={room.players} hotUid={live?.currentPlayerUid ?? null} />}</Canvas><div className="absolute left-3 top-3 arcade-card px-3 py-1 font-display text-lg font-extrabold text-[#FF6B35]">🔥 Round {live?.round ?? 0}</div></div>
    <div className="flex w-full flex-col gap-2 lg:w-96">
      {(!live || live.phase === 'waiting') && <div className="arcade-card p-4"><div className="font-display text-lg font-extrabold">Truth or Dare 🔥</div><p className="mt-1 text-sm text-white/70">Host picks a player each round. That player chooses Truth or Dare. Everyone votes if they completed it.<br />Truth ✅ = +50 · Dare ✅ = +100 · Chickened = 0</p>{isHost ? <button onClick={() => act('next')} className="btn-neon mt-3 w-full rounded-xl px-3 py-2 text-sm font-bold">🔥 Start Game</button> : <p className="mt-2 text-sm text-white/60">Waiting for host to start…</p>}</div>}
      {live?.phase === 'picking' && <div className="arcade-card p-4"><div className="mb-2 font-display text-lg font-extrabold">🎯 Host — pick a player</div>{isHost ? <div className="flex flex-col gap-1.5">{(room?.players ?? []).map((p) => <button key={p.uid} onClick={() => act('pick-player', { uid: p.uid })} className="rounded-xl bg-white/10 px-3 py-2 text-left text-sm font-bold hover:bg-[#FF6B35]/30"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.avatarColor }} />{p.name} · {p.score} pts</button>)}</div> : <p className="text-sm text-white/60">Host is picking someone…</p>}</div>}
      {live?.phase === 'chosen' && live.currentPlayerUid && <div className="arcade-card p-4 text-center"><div className="font-display text-xl font-extrabold text-[#FFC53D]">🎭 {room?.players.find((p) => p.uid === live.currentPlayerUid)?.name}</div><p className="mt-1 text-sm text-white/70">Your moment. Choose wisely.</p>{isOnTheSpot ? <div className="mt-3 flex gap-2"><button onClick={() => act('choose', { choice: 'truth' })} className="flex-1 rounded-xl border border-[#38BDF8]/40 bg-[#38BDF8]/20 px-3 py-3 font-display font-extrabold text-[#38BDF8]">💬 Truth</button><button onClick={() => act('choose', { choice: 'dare' })} className="flex-1 rounded-xl border border-[#FF6B35]/40 bg-[#FF6B35]/20 px-3 py-3 font-display font-extrabold text-[#FF6B35]">🔥 Dare</button></div> : <p className="mt-2 text-sm text-white/60">Waiting for their choice…</p>}</div>}
      {live?.phase === 'revealed' && prompt && <><div className="arcade-card p-4"><div className={`mb-2 text-xs font-bold uppercase tracking-widest ${live.choice === 'dare' ? 'text-[#FF6B35]' : 'text-[#38BDF8]'}`}>{live.choice === 'dare' ? '🔥 Dare' : '💬 Truth'} for {room?.players.find((p) => p.uid === live.currentPlayerUid)?.name}</div><div className="font-display text-base font-bold leading-snug">{prompt}</div>{isOnTheSpot && <p className="mt-2 text-xs text-white/50">Do it. Then wait for the vote.</p>}</div>{!isOnTheSpot && <div id="vote-card" className="arcade-card p-4"><div className="mb-2 text-sm font-bold text-white/70">Did they do it?</div><div className="flex gap-2"><button onClick={() => vote('done')} disabled={!!myVote} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold ${myVote === 'done' ? 'border-[#34D399] bg-[#34D399]/30' : 'border-white/20 bg-white/10'}`}>✅ Done it</button><button onClick={() => vote('chickened')} disabled={!!myVote} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold ${myVote === 'chickened' ? 'border-[#FB4D6D] bg-[#FB4D6D]/30' : 'border-white/20 bg-white/10'}`}>❌ Chickened</button></div><p className="mt-2 text-xs text-white/40">{Object.keys(live?.votes || {}).length} / {Math.max(0, (room?.players.length ?? 0) - 1)} voted</p>{isHost && allVoted && <button onClick={() => act('resolve')} className="btn-neon mt-2 w-full rounded-xl px-3 py-2 text-sm font-bold">⚖️ Reveal verdict</button>}</div>}</>}
      {live?.phase === 'scored' && <div className="arcade-card p-4 text-center"><div className="font-display text-xl font-extrabold text-[#FFC53D]">{live.currentPlayerUid && live.roundScores[live.currentPlayerUid]! > 0 ? '🏆 Completed!' : '🐔 Chickened out!'}</div><div className="mt-1 text-sm text-white/70">{room?.players.find((p) => p.uid === live.currentPlayerUid)?.name} gets <span className="font-bold text-[#FFC53D]">+{live.currentPlayerUid ? live.roundScores[live.currentPlayerUid] : 0}</span></div>{isHost && <div className="mt-3 flex gap-2"><button onClick={() => act('next')} className="btn-neon flex-1 rounded-xl px-3 py-2 text-sm font-bold">Next player ▶</button><button onClick={() => void setLive(roomCode, null)} className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">End game</button></div>}</div>}
      <div className="arcade-card p-3"><div className="mb-1 text-xs font-bold uppercase tracking-widest text-white/50">Scores</div>{(room?.players ?? []).slice().sort((a, b) => b.score - a.score).map((p) => <div key={p.uid} className="flex items-center gap-2 py-0.5 text-sm"><span className="h-2 w-2 rounded-full" style={{ background: p.avatarColor }} /><span className="flex-1 font-semibold">{p.name}</span><span className="font-bold text-[#FFC53D]">{p.score}</span></div>)}</div>
    </div>
  </div>;
}

function Preview() { const ref = useRef<any>(null); useFrame(({ clock }) => { const t = clock.getElapsedTime(); if (ref.current) { ref.current.scale.y = 1 + Math.sin(t * 6) * 0.15; ref.current.rotation.y = t * 0.4; } }); return <group><mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}><circleGeometry args={[1.5, 24]} /><meshStandardMaterial color="#111128" /></mesh><mesh ref={ref} position={[0, 0.2, 0]}><coneGeometry args={[0.25, 0.8, 8]} /><meshStandardMaterial color="#FF6B35" emissive="#FF4400" emissiveIntensity={2} /></mesh>{[0, 1, 2, 3].map((i) => { const a = (i / 4) * Math.PI * 2; const color = ['#FF6B35', '#38BDF8', '#8B5CF6', '#34D399'][i]!; return <mesh key={i} position={[Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9]}><sphereGeometry args={[0.18, 10, 10]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} /></mesh>; })}</group>; }

export const TruthOrDare: GameModule = { id: 'truthordare', displayName: 'Truth or Dare', tagline: 'Confess or commit. No in-between.', minPlayers: 3, maxPlayers: 8, accent: '#FF6B35', LobbyPreviewScene: Preview, GameScene, applyAction, initState: (uids) => init(uids) };
