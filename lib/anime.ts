'use client';
// anime.js lives ONLY in the 2D UI layer. 3D motion belongs to react-three-fiber.

export async function popIn(selector: string) {
  const anime = (await import('animejs')).default;
  anime({ targets: selector, scale: [0.6, 1], opacity: [0, 1], duration: 600, easing: 'easeOutBack' });
}

export async function flashBuzzer(selector: string, color = '#FF3D81') {
  const anime = (await import('animejs')).default;
  anime({
    targets: selector,
    backgroundColor: [color, 'rgba(255,255,255,0.06)'],
    scale: [1.06, 1],
    duration: 900,
    easing: 'easeOutExpo',
  });
}

export async function countUp(el: HTMLElement, to: number, duration = 900) {
  const anime = (await import('animejs')).default;
  const obj = { v: Number(el.textContent) || 0 };
  anime({
    targets: obj,
    v: to,
    duration,
    easing: 'easeOutExpo',
    update: () => {
      el.textContent = String(Math.round(obj.v));
    },
  });
}

export async function staggerReveal(selector: string) {
  const anime = (await import('animejs')).default;
  anime({ targets: selector, translateY: [18, 0], opacity: [0, 1], duration: 500, delay: anime.stagger(80), easing: 'easeOutCubic' });
}
