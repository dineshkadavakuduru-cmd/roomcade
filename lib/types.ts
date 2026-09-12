export type RoomStatus = 'lobby' | 'in-game' | 'recap';

export interface Player {
  uid: string;
  name: string;
  avatarColor: string;
  score: number;
}

export interface RoomMeta {
  code: string;
  hostId: string;
  status: RoomStatus;
  currentGameId: string | null;
  players: Player[];
  round: number;
  updatedAt: number;
}

export type LiveState = Record<string, any>;
export type Action = { type: string; uid: string; payload?: any };

export const AVATAR_COLORS = [
  '#FF6B35', '#FF3D81', '#8B5CF6', '#34D399',
  '#38BDF8', '#FFC53D', '#F8FAFC', '#FB4D6D',
];

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(len = 5): string {
  let s = '';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  return s;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
