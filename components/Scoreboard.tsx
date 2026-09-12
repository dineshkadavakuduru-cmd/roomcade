'use client';
import { useEffect, useRef } from 'react';
import { countUp, staggerReveal } from '@/lib/anime';
import type { Player } from '@/lib/types';

export function Scoreboard({ players, compact = false }: { players: Player[]; compact?: boolean }) {
  const refs = useRef(new Map<string, HTMLSpanElement>());
  const sorted = [...players].sort((a, b) => b.score - a.score);

  useEffect(() => {
    staggerReveal('.score-row');
    refs.current.forEach((el, uid) => {
      const p = players.find((x) => x.uid === uid);
      if (p) countUp(el, p.score);
    });
  }, [players.map((p) => `${p.uid}:${p.score}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`arcade-card ${compact ? 'p-3' : 'p-4'}`}>
      <div className="font-display mb-2 text-sm font-bold uppercase tracking-widest text-white/60">
        Night scoreboard
      </div>
      <div className="flex flex-col gap-1.5">
        {sorted.map((p, i) => (
          <div key={p.uid} className="score-row flex items-center gap-2">
            <span className="w-6 text-center font-display font-extrabold text-white/50">{i + 1}</span>
            <span className="h-4 w-4 rounded-full border border-white/30" style={{ background: p.avatarColor }} />
            <span className="flex-1 truncate text-sm font-semibold">{p.name}</span>
            <span
              ref={(el) => {
                if (el) refs.current.set(p.uid, el);
              }}
              className="font-display text-lg font-extrabold text-[#FFC53D]"
            >
              {p.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
