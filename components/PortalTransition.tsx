'use client';
import { useEffect, useRef } from 'react';

/**
 * THE one transition system (motionsites.ai "Golden Portal" reference).
 * Three staged acts: CHARGE (rings contract, flash builds) → BURST
 * (white-gold flash + expanding rings + particle spray) → SETTLE (title out).
 * Used lobby→game, game→lobby, game→recap. Do not invent per-game transitions.
 */
export function PortalTransition({ active, label, onDone }: { active: boolean; label: string; onDone?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    let cancelled = false;
    (async () => {
      const anime = (await import('animejs')).default;
      if (cancelled) return;
      const tl = anime.timeline({ autoplay: true });
      tl
        // ACT 1 — charge: rings pull inward, glow builds
        .add({
          targets: ref.current,
          opacity: [0, 1],
          duration: 200,
          easing: 'easeInQuad',
        })
        .add(
          {
            targets: '.portal-ring',
            scale: [2.2, 0.55],
            opacity: [0, 1],
            duration: 550,
            easing: 'easeInExpo',
          },
          0,
        )
        // ACT 2 — burst: flash + rings explode outward + particles spray
        .add(
          {
            targets: '.portal-flash',
            opacity: [0, 1, 0.9],
            scale: [0.4, 1.15],
            duration: 450,
            easing: 'easeOutExpo',
          },
          '-=120',
        )
        .add(
          {
            targets: '.portal-ring',
            scale: [0.55, 2.4],
            rotate: ['0turn', '0.6turn'],
            opacity: [1, 0.2],
            duration: 750,
            easing: 'easeOutExpo',
            delay: anime.stagger(70),
          },
          '-=380',
        )
        .add(
          {
            targets: '.portal-bit',
            translateX: () => anime.random(-260, 260),
            translateY: () => anime.random(-220, 220),
            scale: [1, 0],
            opacity: [1, 0],
            duration: 800,
            easing: 'easeOutExpo',
            delay: anime.stagger(12),
          },
          '-=700',
        )
        // ACT 3 — settle: hold the wash, then release
        .add({ targets: {}, duration: 300 })
        .add({
          targets: ref.current,
          opacity: [1, 0],
          duration: 350,
          easing: 'easeOutQuad',
          complete: () => onDone?.(),
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [active, onDone]);

  if (!active) return null;
  const bits = Array.from({ length: 26 }, (_, i) => ({
    c: ['#FFC53D', '#FF6B35', '#FF54BB', '#FFF6E9'][i % 4]!,
    s: 5 + ((i * 37) % 8),
  }));
  return (
    <div ref={ref} className="fixed inset-0 z-[80] flex items-center justify-center opacity-0"
      style={{ background: 'radial-gradient(circle at 50% 55%, #ff8a00 0%, #ff3d81 45%, #171736 78%, #0d0d24 100%)' }}>
      <div className="portal-flash absolute h-[36rem] w-[36rem] rounded-full bg-white opacity-0 blur-3xl" />
      <div className="portal-ring absolute h-64 w-64 rounded-full border-4 border-white/70" />
      <div className="portal-ring absolute h-96 w-96 rounded-full border-2 border-white/50" />
      <div className="portal-ring absolute h-[32rem] w-[32rem] rounded-full border border-white/30" />
      {bits.map((b, i) => (
        <span key={i} className="portal-bit absolute left-1/2 top-1/2 rounded-full"
          style={{ width: b.s, height: b.s, background: b.c }} />
      ))}
      <div className="font-display text-3xl font-extrabold tracking-tight text-white drop-shadow-lg">{label}</div>
    </div>
  );
}
