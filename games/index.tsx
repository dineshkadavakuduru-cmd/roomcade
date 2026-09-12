'use client';
import dynamic from 'next/dynamic';
import type { GameModule } from './registry';
import { Sculptionary } from './sculptionary';
import { Werewolf } from './werewolf';
import { Trivia } from './trivia';
import { TagArena } from './tag';

export const GAMES: Record<string, GameModule> = {
  sculptionary: Sculptionary,
  werewolf: Werewolf,
  trivia: Trivia,
  tag: TagArena,
};

export const GAME_LIST: GameModule[] = [Sculptionary, Werewolf, Trivia, TagArena];

// Lazy-load each game scene — never mount all four at once.
export function LazyGameScene({ id, roomCode }: { id: string; roomCode: string }) {
  if (id === 'sculptionary') {
    const C = dynamic(() => import('./sculptionary').then((m) => m.Sculptionary.GameScene), { ssr: false });
    return <C roomCode={roomCode} />;
  }
  if (id === 'werewolf') {
    const C = dynamic(() => import('./werewolf').then((m) => m.Werewolf.GameScene), { ssr: false });
    return <C roomCode={roomCode} />;
  }
  if (id === 'trivia') {
    const C = dynamic(() => import('./trivia').then((m) => m.Trivia.GameScene), { ssr: false });
    return <C roomCode={roomCode} />;
  }
  const C = dynamic(() => import('./tag').then((m) => m.TagArena.GameScene), { ssr: false });
  return <C roomCode={roomCode} />;
}
