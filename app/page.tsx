'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVATAR_COLORS } from '@/lib/types';
import { createRoom, getSessionUid, joinRoom } from '@/lib/room-store';
import { popIn, staggerReveal } from '@/lib/anime';
import { useEffect } from 'react';

export default function Landing() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]!);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setName(sessionStorage.getItem('roomcade:name') ?? '');
    setColor(sessionStorage.getItem('roomcade:color') ?? AVATAR_COLORS[0]!);
    popIn('.landing-hero');
    staggerReveal('.landing-card');
  }, []);

  const doCreate = async () => {
    if (!name.trim()) { setErr('Pick a display name first.'); return; }
    setBusy(true); setErr('');
    try {
      const { code: c } = await createRoom(name.trim(), color);
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
      setErr(e.message ?? 'Could not join room.');
    } finally { setBusy(false); }
  };

  const games = useMemo(() => [
    { n: 'Sculptionary', d: 'Sculpt words in 3D', c: '#FF6B35', tag: '3D!', tilt: '-3deg' },
    { n: 'Werewolf', d: 'Night-fall deduction', c: '#8B5CF6', tag: 'sus', tilt: '2deg' },
    { n: 'Trivia Podiums', d: 'Buzz in, shine bright', c: '#FFC53D', tag: 'buzz', tilt: '-2deg' },
    { n: 'Tag Arena', d: '60 seconds of chase', c: '#38BDF8', tag: 'run', tilt: '3deg' },
  ], []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-4 py-10">
      <div className="landing-hero text-center">
          <div className="font-display inline-block rounded-full border border-white/15 bg-white/5 px-4 py-1 text-xs font-bold uppercase tracking-[.25em] text-white/70">
            No accounts · No installs · 2–8 players
          </div>
        <h1 className="font-display mt-4 text-5xl font-extrabold leading-none tracking-tight md:text-7xl">
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
          <div className="font-display text-lg font-extrabold">Your avatar</div>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Display name"
            className="mt-2 w-full rounded-xl bg-black/40 px-3 py-2.5 outline-none placeholder:text-white/30 focus:ring-2 focus:ring-[#FF6B35]" />
          <div className="mt-3 flex gap-2">
            {AVATAR_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={c}
                className="h-9 w-9 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: color === c ? '#fff' : 'transparent', boxShadow: color === c ? `0 0 14px ${c}` : 'none' }} />
            ))}
          </div>
          {err && <p className="mt-2 text-sm font-semibold text-[#FB4D6D]">{err}</p>}
        </div>
        <div className="flex flex-col gap-4">
          <div className="landing-card arcade-card p-5">
            <div className="font-display text-lg font-extrabold">Start a game night</div>
            <div className="relative">
              <button onClick={doCreate} disabled={busy || !name.trim()} className="btn-neon mt-2 w-full px-4 py-3 font-display text-lg font-extrabold disabled:opacity-50 disabled:cursor-not-allowed">
                {busy ? '…' : '＋ Create room'}
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

      <div className="mt-8 grid w-full grid-cols-2 gap-3 md:grid-cols-4" style={{ overflow: 'visible' }}>
        {games.map((g) => (
          <div key={g.n} className="landing-card arcade-card relative p-4 pt-6" style={{ boxShadow: `inset 0 -3px 0 ${g.c}55, inset 0 1px 0 rgba(255,255,255,.16)` }}>
            <span className="sticker absolute -top-3 left-3" style={{ background: g.c, color: '#0d0d24', borderColor: '#FFF6E9', transform: `rotate(${g.tilt})` }}>
              {g.tag}
            </span>
            <div className="h-2 w-10 rounded-full" style={{ background: g.c }} />
            <div className="font-display mt-2 font-extrabold">{g.n}</div>
            <div className="text-sm text-white/60">{g.d}</div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-white/40">Two tabs on this machine = two players. Open a second tab, join with the same code, play the full night.</p>
    </main>
  );
}
