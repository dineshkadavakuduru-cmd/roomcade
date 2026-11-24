'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoomNavigation } from '@/lib/use-room-navigation';
import { AVATARS, AVATAR_NAMES, DEFAULT_AVATAR_ID, avatarIdFor, resolveAvatar } from '@/lib/types';
import { createRoom, joinRoom } from '@/lib/room-store';
import { popIn, staggerReveal } from '@/lib/anime';
import { AvatarIcon } from '@/components/AvatarIcons';
import { AuthWarning } from '@/components/AuthWarning';
import { GAME_META } from '@/lib/games';

import { RoomProgress, joinFailure } from '@/components/RoomProgress';

type CreateState = 'idle' | 'loading' | 'success' | 'error' | 'timeout';


export default function Landing() {
  const navigate = useRoomNavigation();
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<string>(DEFAULT_AVATAR_ID);
  const avatar = resolveAvatar(avatarId);
  const color = avatar.color;
  const [code, setCode] = useState('');
  const [createState, setCreateState] = useState<CreateState>('idle');
  const [joinStep, setJoinStep] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinedCode, setJoinedCode] = useState('');
  const joinForm = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState('');
  const [selectedGame, setSelectedGame] = useState('movietrivia');

  useEffect(() => {
    setName(sessionStorage.getItem('roomcade:name') ?? '');
    setAvatarId(avatarIdFor(sessionStorage.getItem('roomcade:avatarId') ?? sessionStorage.getItem('roomcade:color')));
    popIn('.landing-hero');
    staggerReveal('.landing-card');
  }, []);

  const doCreate = useCallback(async () => {
    if (!name.trim()) { setErr('Pick a display name first.'); return; }
    setCreateState('loading');
    setErr('');
    try {
      const { code: c } = await createRoom(name.trim(), color, selectedGame);
      setCreateState('success');
      navigate(`/room/${c}`);
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg === 'AUTH_REQUIRED') {
        setErr('The room service is temporarily unavailable. Please try again in a moment, or check the warning banner above.');
        console.warn('[Roomcade] Room creation failed: anonymous auth not enabled. See docs/FIREBASE_HARDENING.md.');
      }
      else if (msg === 'ROOM_CODE_TAKEN' || msg === 'ROOM_CREATE_DENIED') setErr('Could not create the room — try again.');
      else if (msg === 'ROOM_CREATE_TIMEOUT' || msg === 'identity-timeout') setErr('Request timed out. Check your connection and try again.');
      else if (msg.includes('Permission denied') || msg.includes('permission-denied')) {
        setErr('The room service is temporarily unavailable. Please try again in a moment, or check the warning banner above.');
        console.warn('[Roomcade] Room creation failed: permission denied. See docs/FIREBASE_HARDENING.md.');
      }
      else setErr(msg || 'Could not create room.');
      setCreateState('error');
    }
  }, [name, color, selectedGame, navigate]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const keepFormVisible = () => {
      const form = joinForm.current;
      if (!viewport || !form?.contains(document.activeElement)) return;
      const bounds = form.querySelector('[data-join-controls]')?.getBoundingClientRect();
      if (!bounds || bounds.height + 12 >= viewport.height) return;
      if (bounds.bottom > viewport.offsetTop + viewport.height) {
        window.scrollBy(0, bounds.bottom - viewport.offsetTop - viewport.height + 12);
      } else if (bounds.top < viewport.offsetTop) {
        window.scrollBy(0, bounds.top - viewport.offsetTop - 12);
      }
    };
    viewport?.addEventListener('resize', keepFormVisible);
    return () => viewport?.removeEventListener('resize', keepFormVisible);
  }, []);

  const doJoin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (joining || !name.trim() || code.trim().length !== 5) return;
    setJoining(true);
    setJoinError('');
    try {
      const c = code.trim().toUpperCase();
      await joinRoom(c, name.trim(), color, setJoinStep);
      setJoinedCode(c);
      setJoinStep('Opening the lounge…');
      navigate(`/room/${c}`);
    } catch (error) {
      setJoinError(joinFailure(error));
      setJoining(false);
    }
  };

  const resetCreate = () => {
    setCreateState('idle');
    setErr('');
  };

  const games = GAME_META;

  return (
    <main className="page-fade relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-4 py-4 md:py-10">
      {/* Animated background: slow gradient mesh + floating particles */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="mesh-blob absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#FF6B35]/12 blur-3xl" />
        <div className="mesh-blob absolute right-0 top-1/3 h-80 w-80 rounded-full bg-[#8B5CF6]/12 blur-3xl" style={{ animationDelay: '-6s' }} />
        <div className="mesh-blob absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-[#FF3D81]/12 blur-3xl" style={{ animationDelay: '-12s' }} />
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="particle absolute h-1.5 w-1.5 rounded-full bg-white/25"
            style={{
              left: `${(i * 53) % 100}%`,
              animationDelay: `${-(i * 1.7)}s`,
              animationDuration: `${9 + (i % 5) * 2}s`,
            }}
          />
        ))}
      </div>
      <div className="landing-hero text-center">
        <h1 className="logo-glow font-display text-4xl font-extrabold leading-none tracking-tight md:text-7xl">
          ROOM<span style={{ background: 'linear-gradient(135deg,#FF8A00,#FF6B35 45%,#FF54BB)', WebkitBackgroundClip: 'text', color: 'transparent' }}>CADE</span>
        </h1>
      </div>

      <div className="mt-4 w-full">
        <AuthWarning />
      </div>

      <div className="mt-3 grid w-full gap-4 md:mt-8 md:grid-cols-2">
        <form ref={joinForm} onSubmit={doJoin} aria-labelledby="join-title" className="arcade-card self-start p-4 md:row-span-2 md:p-5">
          <div data-join-controls className="space-y-2">
            <h2 id="join-title" className="font-display text-lg font-extrabold">Join with a code</h2>
            <label className="block text-sm font-semibold" htmlFor="display-name">Display name</label>
            <input id="display-name" autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Display name"
              className="min-h-[44px] w-full rounded-xl bg-black/40 px-3 py-2.5 text-base outline-none placeholder:text-white/30 focus:ring-2 focus:ring-[#FF6B35]" />
            <label className="block text-sm font-semibold" htmlFor="room-code">Room code</label>
            <div className="flex gap-2">
              <input id="room-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5}
                placeholder="ABCDE" autoCapitalize="characters" autoComplete="off" spellCheck={false} enterKeyHint="go"
                className="room-code min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-center text-lg font-bold uppercase outline-none placeholder:text-white/25 focus:ring-2 focus:ring-[#FF3D81]" />
              <button type="submit" disabled={joining || !name.trim() || code.trim().length !== 5}
                className="btn-ghost min-h-[44px] shrink-0 px-5 py-2 font-display font-extrabold text-[#FF54BB] disabled:opacity-50">
                {joining ? 'Joining…' : joinError ? 'Retry join' : 'Join'}
              </button>
            </div>
          </div>
          {joinStep && <RoomProgress step={joinStep} error={joinError}
            onRetry={joinedCode ? () => location.assign(`/room/${joinedCode}`) : undefined} />}
        </form>
        <div className="landing-card arcade-card p-5">
          <div className="flex items-center justify-between">
            <div className="font-display text-lg font-extrabold">Your avatar</div>
            <span className="text-xs font-semibold text-white/50">Pick character & color</span>
          </div>
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
                <div className="truncate font-display text-sm font-extrabold text-white">
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
        </div>
        <div className="landing-card arcade-card p-5">
            <div className="font-display text-lg font-extrabold">Start a game night</div>
            <div className="text-xs text-white/60">Cartridge: <span className="font-bold" style={{ color: games.find((g) => g.id === selectedGame)?.accent }}>{games.find((g) => g.id === selectedGame)?.displayName}</span></div>
            {err && <p role="alert" className="mt-2 text-sm font-semibold text-[#FB4D6D]">{err}</p>}
            <div className="relative">
              {createState === 'loading' && (
                <div className="flex items-center justify-center gap-3 py-4 text-white/70 text-sm font-medium">
                  <span className="flex h-5 w-5 animate-spin rounded-full border-2 border-[#FFC53D] border-t-transparent" />
                  Creating room…
                </div>
              )}
              <button
                onClick={createState === 'loading' ? undefined : doCreate}
                disabled={createState === 'loading' || !name.trim()}
                className="btn-neon pulse-glow mt-2 w-full px-4 py-4 font-display text-xl font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createState === 'loading' ? '' : createState === 'success' ? '✓ Room created!' : createState === 'error' ? '✕ Try again' : createState === 'timeout' ? '⏱ Timeout — retry' : `＋ Create room (${games.find((g) => g.id === selectedGame)?.displayName})`}
              </button>
              {createState === 'error' && (
                <button onClick={resetCreate} className="btn-ghost mt-2 w-full text-sm font-semibold text-white/70 hover:text-white">
                  Dismiss & retry
                </button>
              )}
              {!name.trim() && createState === 'idle' && (
                <p className="mt-1.5 text-center text-xs font-medium text-white/50">
                  Enter a display name first
                </p>
              )}
            </div>
          </div>
      </div>

      <p className="mt-6 max-w-xl text-center text-sm text-white/70">
        Share a room code or invite link with up to eight players. Scores carry across games.
      </p>

      <div className="mt-8 w-full text-center">
        <div className="font-display text-sm font-bold uppercase tracking-widest text-white/50">Choose starting cartridge (click any to select)</div>
      </div>
      <div className="mt-3 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5" style={{ overflow: 'visible' }}>
        {games.map((g) => {
          const isSel = selectedGame === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGame(g.id)}
              aria-pressed={isSel}
              className={`landing-card arcade-card relative min-h-[96px] cursor-pointer p-4 pt-6 text-left transition-all duration-200 hover:-translate-y-1 ${isSel ? 'ring-2 ring-white shadow-lg' : 'opacity-80 hover:opacity-100'}`}
              style={{
                boxShadow: isSel ? `0 0 20px ${g.accent}88, inset 0 -3px 0 ${g.accent}, inset 0 1px 0 rgba(255,255,255,.3)` : `inset 0 -3px 0 ${g.accent}55, inset 0 1px 0 rgba(255,255,255,.16)`,
                borderColor: isSel ? g.accent : undefined,
              }}
            >
              <span className="sticker absolute -top-3 left-3" style={{ background: g.accent, color: '#0d0d24', borderColor: '#FFF6E9', transform: `rotate(${g.tilt})` }}>
                {isSel ? '✓ ACTIVE' : g.tag}
              </span>
              <div className="h-2 w-10 rounded-full" style={{ background: g.accent }} />
              <div className="font-display mt-2 line-clamp-2 text-sm font-extrabold sm:text-base" style={{ color: isSel ? g.accent : '#fff' }}>{g.displayName}</div>
              <div className="line-clamp-2 text-xs text-white/60">{g.tagline}</div>
            </button>
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
