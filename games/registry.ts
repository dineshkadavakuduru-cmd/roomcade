'use client';
import type { Action, LiveState } from '@/lib/types';

export interface GameModule {
  id: string;
  displayName: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  accent: string;
  LobbyPreviewScene: React.FC;
  GameScene: React.FC<{ roomCode: string }>;
  applyAction: (state: LiveState, action: Action) => LiveState;
  initState: (playerUids: string[], hostId: string) => LiveState;
}

export const GAME_ORDER = ['sculptionary', 'werewolf', 'trivia', 'tag'] as const;
export type GameId = (typeof GAME_ORDER)[number];
