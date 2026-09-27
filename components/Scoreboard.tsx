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

  const getRankBadge = (rank: number) => {
    if (rank === 0) return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 text-xs shadow-[0_0_8px_#f59e0b88]">🥇</span>;
    if (rank === 1) return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-slate-300 to-slate-500 text-xs shadow-[0_0_6px_#94a3b866]">🥈</span>;
    if (rank === 2) return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-700 to-amber-900 text-xs shadow-[0_0_6px_#b4530966]">🥉</span>;
    return <span className="w-6 text-center font-display text-xs font-bold text-white/40">#{rank + 1}</span>;
  };

  return (
    <div className={`arcade-card ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between pb-2">
        <div className="font-display text-xs font-bold uppercase tracking-widest text-white/60">
          🏆 Night Leaderboard
        </div>
        <span className="text-[10px] font-semibold text-white/40">{players.length} players</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {sorted.map((p, i) => (
          <div
            key={p.uid}
            className={`score-row flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-all ${
              i === 0 ? 'bg-gradient-to-r from-yellow-500/15 via-white/5 to-transparent border border-yellow-500/30' : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            {getRankBadge(i)}
            <div className="relative">
              <span
                className="block h-6 w-6 rounded-full border-2 shadow-sm"
                style={{
                  background: p.avatarColor,
                  borderColor: i === 0 ? '#FFC53D' : p.avatarColor,
                  boxShadow: `0 0 10px ${p.avatarColor}77`,
                }}
              />
            </div>
            <span className={`flex-1 truncate text-sm font-bold ${i === 0 ? 'text-[#FFC53D]' : 'text-white'}`}>
              {p.name}
            </span>
            <div className="flex items-baseline gap-1">
              <span
                ref={(el) => {
                  if (el) refs.current.set(p.uid, el);
                }}
                className="font-display text-base font-extrabold text-[#FFC53D]"
              >
                {p.score}
              </span>
              <span className="text-[10px] font-semibold text-white/40">pts</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
