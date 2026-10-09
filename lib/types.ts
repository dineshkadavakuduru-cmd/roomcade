export type RoomStatus = 'lobby' | 'in-game' | 'recap';

export interface Player {
  uid: string;
  name: string;
  /** Canonical avatar accent color — retained for legacy rooms and the 3D tint. */
  avatarColor: string;
  /** Stable avatar id (see lib/avatars). Optional for pre-registry room state. */
  avatarId?: string;
  score: number;
}

export interface RoomMeta {
  code: string;
  hostId: string;
  status: RoomStatus;
  currentGameId: string | null;
  selectedGameId?: string | null;
  players: Player[];
  round: number;
  updatedAt: number;
}

export type LiveState = Record<string, any>;
export type Action = { type: string; uid: string; payload?: any };

// Avatar identity lives in one authoritative registry. Re-exported here so existing
// imports keep working while there is a single source of truth.
export {
  AVATAR_COLORS,
  AVATAR_IDS,
  AVATAR_NAMES,
  AVATARS,
  DEFAULT_AVATAR_ID,
  avatarColorFor,
  avatarIdFor,
  deserializeAvatar,
  isKnownAvatar,
  normalizeAvatarRef,
  resolveAvatar,
  serializeAvatar,
  type Avatar,
  type AvatarSpecies,
} from './avatars';
import { avatarIdFor, avatarColorFor } from './avatars';

/** Build the avatar fields stored on a Player from any identity (id or color). */
export function avatarFields(ref: string | null | undefined): { avatarId: string; avatarColor: string } {
  return { avatarId: avatarIdFor(ref), avatarColor: avatarColorFor(ref) };
}

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
