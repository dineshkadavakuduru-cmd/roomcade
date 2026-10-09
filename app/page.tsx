'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVATARS, AVATAR_NAMES, DEFAULT_AVATAR_ID, avatarIdFor, resolveAvatar } from '@/lib/types';
import { createRoom, getSessionUid, joinRoom } from '@/lib/room-store';
import { popIn, staggerReveal } from '@/lib/anime';
import { useEffect } from 'react';
import { AvatarIcon } from '@/components/AvatarIcons';

export default function Landing() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<string>(DEFAULT_AVATAR_ID);
  const avatar = resolveAvatar(avatarId);
  const color = avatar.color;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [selectedGame, setSelectedGame] = useState('movietrivia');

  useEffect(() => {
    setName(sessionStorage.getItem('roomcade:name') ?? '');
    setAvatarId(avatarIdFor(sessionStorage.getItem('roomcade:avatarId') ?? sessionStorage.getItem('roomcade:color')));
    popIn('.landing-hero');
    staggerReveal('.landing-card');
  }, []);

  const doCreate = async () => {
    if (!name.trim()) { setErr('Pick a display name first.'); return; }
    setBusy(true); setErr('');
    try {
      const { code: c } = await createRoom(name.trim(), color, selectedGame);
      router.push(`/room/${c}`);
    } catch (e: any) {
      setErr(e.message ?? 'Could not create room.');
    } finally { setBusy(false); }
  };

  const doJoin = async () => {
    if (!name.trim()) { setErr('Pick a display name first.'); return; }
    if (code.trim().length < 4) { setErr('Enter the 5-letter room code.'); return; }
    setBusy(true); setErr('');
    try {
      getSessionUid();
      const c = code.trim().toUpperCase();
      await joinRoom(c, name.trim(), color);
      router.push(`/room/${c}`);
    } catch (e: any) {
      const msg = e.message ?? 'Could not join room.';
      if (msg === 'ROOM_NOT_FOUND') setErr('Room not found. Check the code.');
      else if (msg === 'ROOM_FULL') setErr('Room is full (8 max).');
      else setErr(msg);
    } finally { setBusy(false); }
  };

  const games = useMemo(() => [
    { id: 'movietrivia', n: 'Movie Trivia', d: 'Lights, camera, buzz!', c: '#FFC53D', tag: '🎬', tilt: '3deg' },
    { id: 'quickdraw', n: 'Quick Draw', d: 'Reaction showdown', c: '#38BDF8', tag: '⚡', tilt: '-2deg' },
    { id: 'trivia', n: 'Trivia Podiums', d: 'Buzz & beat friends', c: '#34D399', tag: '🎙️', tilt: '2deg' },
    { id: 'tugofwar', n: 'Tug of War', d: 'Furious tap battle', c: '#FB7185', tag: '💪', tilt: '-3deg' },
    { id: 'fogduel', n: 'Fog Duel', d: 'Grid warfare in fog', c: '#60A5FA', tag: '🚢', tilt: '2deg' },
    { id: 'sculptionary', n: 'Sculptionary', d: 'Sculpt words in 3D', c: '#FF6B35', tag: '3D!', tilt: '-3deg' },
    { id: 'werewolf', n: 'Werewolf', d: 'Night-fall deduction', c: '#8B5CF6', tag: '🐺', tilt: '2deg' },
    { id: 'truthordare', n: 'Truth or Dare', d: 'Confess or commit', c: '#FF3D81', tag: '🔥', tilt: '-2deg' },
    { id: 'tag', n: 'Tag Arena', d: 'Chase & escape in 3D', c: '#F472B6', tag: '🏃', tilt: '3deg' },
  ], []);

  return (
    <main className="page-fade relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-4 py-10">
      {/* Animated background: slow gradient mesh + floating particles */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="mesh-blob absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#FF6B35]/20 blur-3xl" />
        <div className="mesh-blob absolute right-0 top-1/3 h-80 w-80 rounded-full bg-[#8B5CF6]/20 blur-3xl" style={{ animationDelay: '-6s' }} />
        <div className="mesh-blob absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#FF3D81]/20 blur-3xl" style={{ animationDelay: '-12s' }} />
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="particle absolute h-1.5 w-1.5 rounded-full bg-white/40"
            style={{
              left: `${(i * 53) % 100}%`,
              animationDelay: `${-(i * 1.7)}s`,
              animationDuration: `${9 + (i % 5) * 2}s`,
            }}
          />
        ))}
      </div>
      <div className="landing-hero text-center">
          <div className="font-display inline-block rounded-full border border-white/15 bg-white/5 px-4 py-1 text-xs font-bold uppercase tracking-[.25em] text-white/70">
            No accounts · No installs · 2–8 players
          </div>
        <h1 className="logo-glow font-display mt-4 text-5xl font-extrabold leading-none tracking-tight md:text-7xl">
          ROOM<span style={{ background: 'linear-gradient(135deg,#FF8A00,#FF6B35 45%,#FF54BB)', WebkitBackgroundClip: 'text', color: 'transparent' }}>CADE</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-white/70">
          Create a room, get a short code, friends join from a chat link. Hang in a 3D lounge,
          pick a game cartridge, play the night — scores carry across games.
        </p>
      </div>

      <div className="marquee mt-8 w-full py-2 text-sm font-bold uppercase tracking-[.2em] text-white/60" aria-hidden>
        <div className="marquee-track">
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k}>
              {'No accounts ✦ No installs ✦ 2–8 players ✦ Scores carry all night ✦ '.repeat(3)}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-8 grid w-full gap-4 md:grid-cols-2">
        <div className="landing-card arcade-card p-5">
          <div className="flex items-center justify-between">
            <div className="font-display text-lg font-extrabold">Your avatar</div>
            <span className="text-xs font-semibold text-white/50">Pick character & color</span>
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Display name"
            className="mt-2 w-full rounded-xl bg-black/40 px-3 py-2.5 outline-none placeholder:text-white/30 focus:ring-2 focus:ring-[#FF6B35]" />
          
<div className="mt-3.5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 text-2xl shadow-lg transition-transform hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${color}, #0d0d24)`,
                  borderColor: color,
                  boxShadow: `0 0 16px ${color}88`,
                }}
              >
                <AvatarIcon color={color} size={28} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-extrabold text-white">
                  {name.trim() || 'Player'}
                </div>
                <div className="text-xs font-semibold" style={{ color }}>
                  {AVATAR_NAMES[color] ?? 'Avatar'}
                </div>
                <div className="text-[11px] text-white/40">Ready for 3D arcade lounge</div>
              </div>
            </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {AVATARS.map((a) => {
              const isSelected = avatarId === a.id;
              return (
                <button
                  key={a.id}
                  data-avatar-option={a.id}
                  data-avatar-species={a.species}
                  onClick={() => setAvatarId(a.id)}
                  aria-label={a.name}
                  aria-pressed={isSelected}
                  className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 text-base transition-all hover:scale-110 ${
                    isSelected ? 'ring-2 ring-white scale-110 avatar-bounce' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    background: a.color,
                    borderColor: isSelected ? '#fff' : 'transparent',
                    boxShadow: isSelected ? `0 0 14px ${a.color}` : 'none',
                  }}
                >
                  <AvatarIcon color={a.id} size={18} />
                  <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-2 py-1 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {a.name}
                  </span>
                </button>
              );
            })}
          </div>
          {err && <p className="mt-2 text-sm font-semibold text-[#FB4D6D]">{err}</p>}
        </div>
        <div className="flex flex-col gap-4">
          <div className="landing-card arcade-card p-5">
            <div className="font-display text-lg font-extrabold">Start a game night</div>
            <div className="text-xs text-white/60">Cartridge: <span className="font-bold text-[#FFC53D]">{games.find((g) => g.id === selectedGame)?.n}</span></div>
            <div className="relative">
              <button onClick={doCreate} disabled={busy || !name.trim()} className="btn-neon pulse-glow mt-2 w-full px-4 py-4 font-display text-xl font-extrabold disabled:opacity-50 disabled:cursor-not-allowed">
                {busy ? '…' : `＋ Create room (${games.find((g) => g.id === selectedGame)?.n})`}
              </button>
              {!name.trim() && (
                <p className="mt-1.5 text-center text-xs font-medium text-white/50">
                  Enter a display name first
                </p>
              )}
            </div>
          </div>
          <div className="landing-card arcade-card p-5">
            <div className="font-display text-lg font-extrabold">Join with a code</div>
            <div className="mt-2 flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABCDE"
                className="room-code min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2.5 text-center text-xl font-bold uppercase outline-none placeholder:text-white/25 focus:ring-2 focus:ring-[#FF3D81]" />
              <button onClick={doJoin} disabled={busy} className="btn-ghost px-5 py-2.5 font-display font-extrabold text-[#FF54BB] hover:bg-[#FF54BB]/20 disabled:opacity-50">
                Join
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 w-full text-center">
        <div className="font-display text-sm font-bold uppercase tracking-widest text-white/50">Choose starting cartridge (click any to select)</div>
      </div>
      <div className="mt-3 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5" style={{ overflow: 'visible' }}>
        {games.map((g) => {
          const isSel = selectedGame === g.id;
          return (
            <div
              key={g.id}
              onClick={() => setSelectedGame(g.id)}
              className={`landing-card arcade-card relative cursor-pointer p-4 pt-6 transition-all duration-200 hover:-translate-y-1 ${isSel ? 'ring-2 ring-white shadow-lg' : 'opacity-80 hover:opacity-100'}`}
              style={{
                boxShadow: isSel ? `0 0 20px ${g.c}88, inset 0 -3px 0 ${g.c}, inset 0 1px 0 rgba(255,255,255,.3)` : `inset 0 -3px 0 ${g.c}55, inset 0 1px 0 rgba(255,255,255,.16)`,
                borderColor: isSel ? g.c : undefined,
              }}
            >
              <span className="sticker absolute -top-3 left-3" style={{ background: g.c, color: '#0d0d24', borderColor: '#FFF6E9', transform: `rotate(${g.tilt})` }}>
                {isSel ? '✓ ACTIVE' : g.tag}
              </span>
              <div className="h-2 w-10 rounded-full" style={{ background: g.c }} />
              <div className="font-display mt-2 font-extrabold text-sm sm:text-base" style={{ color: isSel ? g.c : '#fff' }}>{g.n}</div>
              <div className="text-xs text-white/60">{g.d}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-white/40">Two tabs on this machine = two players. Open a second tab, join with the same code, play the full night.</p>
      <footer className="mt-10 w-full border-t border-white/10 pt-4 text-center text-[11px] text-white/35">
        <span className="font-display font-bold tracking-wide text-white/50">ROOMCADE</span> · v0.1.0 · 9 games · built for game night
      </footer>
    </main>
  );
}
