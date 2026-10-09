/**
 * Authoritative avatar registry — the single source of truth for player identity.
 *
 * Identity rules:
 *  - `id`   is the stable, unique, never-reordered key. Persist it (Player.avatarId).
 *  - `color` is the canonical accent color. It is what the 3D body/tint uses and
 *    what legacy rooms (which only stored a colour) already carry.
 *  - `species` selects the pixel icon. Icons are keyed by species, NOT by color,
 *    so two avatars can never accidentally render the same artwork again.
 *
 * The eight entries below are fixed: reordering or renaming them is a breaking
 * change, because `serializeAvatar` persists ids into room state.
 */
export type AvatarSpecies = 'fox' | 'cat' | 'alien' | 'frog' | 'robot' | 'tiger' | 'ghost' | 'wolf';

export interface Avatar {
  /** Stable unique id, e.g. `cyber-fox`. */
  readonly id: string;
  /** Player-facing name, e.g. `Cyber Fox`. */
  readonly name: string;
  /** Icon key — must match a key in AVATAR_ICONS. */
  readonly species: AvatarSpecies;
  /** Canonical accent color (also the legacy serialized value). */
  readonly color: string;
}

export const AVATARS: readonly Avatar[] = [
  { id: 'cyber-fox', name: 'Cyber Fox', species: 'fox', color: '#FF6B35' },
  { id: 'astro-cat', name: 'Astro Cat', species: 'cat', color: '#FF3D81' },
  { id: 'glitch-alien', name: 'Glitch Alien', species: 'alien', color: '#8B5CF6' },
  { id: 'pixel-frog', name: 'Pixel Frog', species: 'frog', color: '#34D399' },
  { id: 'neon-bot', name: 'Neon Bot', species: 'robot', color: '#38BDF8' },
  { id: 'hyper-tiger', name: 'Hyper Tiger', species: 'tiger', color: '#FFC53D' },
  { id: 'frost-ghost', name: 'Frost Ghost', species: 'ghost', color: '#F8FAFC' },
  { id: 'blaze-wolf', name: 'Blaze Wolf', species: 'wolf', color: '#FB4D6D' },
];

/** Ordered list of canonical colors (index-aligned with AVATARS). */
export const AVATAR_COLORS: readonly string[] = AVATARS.map((a) => a.color);

/** Stable id list, kept in lockstep with AVATARS. */
export const AVATAR_IDS: readonly string[] = AVATARS.map((a) => a.id);

export const DEFAULT_AVATAR_ID = AVATARS[0]!.id;

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));
const BY_COLOR = new Map(AVATARS.map((a) => [a.color.toUpperCase(), a]));

export const AVATAR_BY_ID: Readonly<Record<string, Avatar>> = Object.freeze(
  Object.fromEntries(AVATARS.map((a) => [a.id, a])),
);

/** Canonical name lookup by color — used by the picker and player cards. */
export const AVATAR_NAMES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(AVATARS.map((a) => [a.color, a.name])),
);

export const DEFAULT_AVATAR: Avatar = AVATAR_BY_ID[DEFAULT_AVATAR_ID]!;

/**
 * Resolve a stored identity (stable id OR canonical color OR undefined) to its
 * avatar, deterministically. Unknown values fall back to the default avatar so
 * a corrupt/legacy value never renders someone else's species by accident.
 */
export function resolveAvatar(ref: string | null | undefined): Avatar {
  if (!ref) return DEFAULT_AVATAR;
  return BY_ID.get(ref) ?? BY_COLOR.get(ref.toUpperCase()) ?? DEFAULT_AVATAR;
}

/** Stable id for whatever identity a client holds (id or color). */
export function avatarIdFor(ref: string | null | undefined): string {
  return resolveAvatar(ref).id;
}

/** Canonical color for whatever identity a client holds (id or color). */
export function avatarColorFor(ref: string | null | undefined): string {
  return resolveAvatar(ref).color;
}

/**
 * Deterministic serialization: always the stable id, regardless of whether the
 * input was an id or a color. Round-trips through `deserializeAvatar`.
 */
export function serializeAvatar(ref: string | null | undefined): string {
  return resolveAvatar(ref).id;
}

/** Inverse of `serializeAvatar` (tolerant of unknown ids → default). */
export function deserializeAvatar(id: string | null | undefined): Avatar {
  return resolveAvatar(id);
}

/** True when `ref` maps to a real registry entry (id or canonical color). */
export function isKnownAvatar(ref: string | null | undefined): boolean {
  if (!ref) return false;
  return BY_ID.has(ref) || BY_COLOR.has(ref.toUpperCase());
}

/** Guard used at the boundary where a client-provided avatar enters room state. */
export function normalizeAvatarRef(ref: string | null | undefined): string {
  return resolveAvatar(ref).color;
}
