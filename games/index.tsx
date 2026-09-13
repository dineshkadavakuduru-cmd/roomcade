'use client';
import dynamic from 'next/dynamic';
import type { GameModule } from './registry';
import { Sculptionary } from './sculptionary';
import { Werewolf } from './werewolf';
import { Trivia } from './trivia';
import { TagArena } from './tag';
import { QuickDraw } from './quickdraw';
import { TugOfWar } from './tugofwar';
import { FogDuel } from './fogduel';

export const GAMES: Record<string, GameModule> = {
  sculptionary: Sculptionary,
  werewolf: Werewolf,
  trivia: Trivia,
  tag: TagArena,
  quickdraw: QuickDraw,
  tugofwar: TugOfWar,
  fogduel: FogDuel,
};

export const GAME_LIST: GameModule[] = [Sculptionary, Werewolf, Trivia, TagArena, QuickDraw, TugOfWar, FogDuel];

// Lazy-load each game scene — never mount all at once.
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
  if (id === 'tag') {
    const C = dynamic(() => import('./tag').then((m) => m.TagArena.GameScene), { ssr: false });
    return <C roomCode={roomCode} />;
  }
  if (id === 'quickdraw') {
    const C = dynamic(() => import('./quickdraw').then((m) => m.QuickDraw.GameScene), { ssr: false });
    return <C roomCode={roomCode} />;
  }
  if (id === 'tugofwar') {
    const C = dynamic(() => import('./tugofwar').then((m) => m.TugOfWar.GameScene), { ssr: false });
    return <C roomCode={roomCode} />;
  }
  const C = dynamic(() => import('./fogduel').then((m) => m.FogDuel.GameScene), { ssr: false });
  return <C roomCode={roomCode} />;
}