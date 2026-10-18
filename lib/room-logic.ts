/**
 * Pure room invariants used by lib/room-store and unit-tested directly.
 * Keeping these free of Firebase/browser APIs lets the race rules (names,
 * staleness, host migration, ghost pruning) be tested without a live backend.
 */
export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 16;
/** Rooms with no heartbeat for this long are treated as abandoned by TTL cleanup. */
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
/** Only prune players that have not heartbeated for this long (background tabs throttle). */
export const GHOST_AGE_MS = 5 * 60 * 1000;
/**
 * How long a room waits for a host that vanished before another player takes over.
 * A page reload also fires onDisconnect, so migrating instantly would hand the
 * room to a guest every time the host refreshes mid-game.
 */
export const HOST_GRACE_MS = 20_000;
export const MAX_SCORE = 999_999;

export function cleanDisplayName(raw: string | null | undefined, fallback = 'Player'): string {
  const n = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return n || fallback;
}

/** Deterministic, collision-free display name: "Sam", "Sam (2)", "Sam (3)"… */
export function uniqueDisplayName(base: string, others: string[]): string {
  const wanted = cleanDisplayName(base);
  const taken = new Set(others.map((n) => cleanDisplayName(n).toLowerCase()));
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let i = 2; i < 100; i++) {
    const suffix = ` (${i})`;
    const candidate = `${wanted.slice(0, MAX_NAME_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return wanted;
}

export function roomIsStale(playerCount: number, updatedAt: number, now = Date.now()): boolean {
  return playerCount === 0 || !updatedAt || now - updatedAt > ROOM_TTL_MS;
}

export function hostIsMissing(hostId: string, players: Array<{ uid: string }>): boolean {
  if (players.length === 0) return false; // nobody left to take over
  if (!hostId) return true;
  return !players.some((p) => p.uid === hostId);
}

export function isGhost(lastSeen: number | undefined, now = Date.now(), maxAge = GHOST_AGE_MS): boolean {
  return !lastSeen || now - lastSeen > maxAge;
}
