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
import { TruthOrDare } from './truthordare';
import { MovieTrivia } from './movietrivia';
import { RoomProgress } from '@/components/RoomProgress';

export const GAMES: Record<string, GameModule> = {
  sculptionary: Sculptionary,
  werewolf: Werewolf,
  trivia: Trivia,
  tag: TagArena,
  quickdraw: QuickDraw,
  tugofwar: TugOfWar,
  fogduel: FogDuel,
  truthordare: TruthOrDare,
  movietrivia: MovieTrivia,
};

export const GAME_LIST: GameModule[] = [
  Sculptionary, Werewolf, Trivia, TagArena, QuickDraw, TugOfWar, FogDuel, TruthOrDare, MovieTrivia,
];

function CartridgeProgress({ error }: { error?: Error | null }) {
  return <RoomProgress step="Loading the cartridge…" error={error ? 'The cartridge could not load. Check your connection and retry.' : undefined}
    onRetry={() => location.reload()} />;
}

const LazySculptionary = dynamic(() => import('./sculptionary').then((m) => ({ default: m.Sculptionary.GameScene })), { ssr: false, loading: CartridgeProgress });
const LazyWerewolf = dynamic(() => import('./werewolf').then((m) => ({ default: m.Werewolf.GameScene })), { ssr: false, loading: CartridgeProgress });
const LazyTrivia = dynamic(() => import('./trivia').then((m) => ({ default: m.Trivia.GameScene })), { ssr: false, loading: CartridgeProgress });
const LazyTag = dynamic(() => import('./tag').then((m) => ({ default: m.TagArena.GameScene })), { ssr: false, loading: CartridgeProgress });
const LazyQuickDraw = dynamic(() => import('./quickdraw').then((m) => ({ default: m.QuickDraw.GameScene })), { ssr: false, loading: CartridgeProgress });
const LazyTugOfWar = dynamic(() => import('./tugofwar').then((m) => ({ default: m.TugOfWar.GameScene })), { ssr: false, loading: CartridgeProgress });
const LazyFogDuel = dynamic(() => import('./fogduel').then((m) => ({ default: m.FogDuel.GameScene })), { ssr: false, loading: CartridgeProgress });
const LazyTruthOrDare = dynamic(() => import('./truthordare').then((m) => ({ default: m.TruthOrDare.GameScene })), { ssr: false, loading: CartridgeProgress });
const LazyMovieTrivia = dynamic(() => import('./movietrivia').then((m) => ({ default: m.MovieTrivia.GameScene })), { ssr: false, loading: CartridgeProgress });

const LAZY_MAP: Record<string, React.ComponentType<{ roomCode: string }>> = {
  sculptionary: LazySculptionary,
  werewolf: LazyWerewolf,
  trivia: LazyTrivia,
  tag: LazyTag,
  quickdraw: LazyQuickDraw,
  tugofwar: LazyTugOfWar,
  fogduel: LazyFogDuel,
  truthordare: LazyTruthOrDare,
  movietrivia: LazyMovieTrivia,
};

export function LazyGameScene({ id, roomCode }: { id: string; roomCode: string }) {
  const C = LAZY_MAP[id];
  if (!C) return <div className="arcade-card p-6 text-center text-white/60">Unknown game — head back to the lobby.</div>;
  return <C roomCode={roomCode} />;
}
