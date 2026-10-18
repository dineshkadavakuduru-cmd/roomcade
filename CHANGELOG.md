# Changelog

All notable changes to Roomcade will be documented in this file.

## 0.2.0

### Security & Rules
- **RTDB security rules**: Replaced blanket `.read`/`.write` grants with per-uid, host-only validated writes. Added capacity validation (`<= 8 players`), host-only phase control, and per-room presence cleanup on disconnect.
- **Auth gating**: Added anonymous auth identity per tab via `IdentityGate` component. Store writes are now gated behind `ensureIdentity()` so each client can only write its own player node/score.
- **Key restriction docs**: Added `docs/FIREBASE_HARDENING.md` with per-uid write patterns, host migration logic, and capacity bounds.

### Room Store & Logic
- **Atomic join capacity**: `joinRoom` now uses Firebase transactions to safely increment player count, preventing race conditions and double-awards.
- **Host migration grace window**: Added `HOST_GRACE_MS = 20_000` to prevent instant host takeover on page reload — the host's `onDisconnect` fires on reload, so a 20s grace window lets the host reacquire before a guest takes over.
- **Stale/finished room reaping**: `roomIsStale()` checks empty rooms or rooms older than `ROOM_TTL_MS = 6h`. Ghost pruning respects `GHOST_AGE_MS = 5m` heartbeat grace.
- **Duplicate name handling**: `uniqueDisplayName()` gives stable suffixes (`Sam`, `Sam (2)`, `Sam (3)`) while staying within the 16-char limit.
- **Score double-awards fixed**: Both host and guest score write paths now go through `dispatchLive` with `applyAction`, ensuring scores are only awarded once per action.

### Games (all 9)
- **Movietrivia**: Full buzz→answer→reveal→next cycle with distinct question ordering. Wrong answer locks out the buzzer.
- **Quickdraw**: Countdown→arm→react→round win→best-of-5 done. Early tap during countdown = instant round loss.
- **Trivia**: ask→buzz→answer→reveal→next with wrong-answer lockout.
- **Tugofwar**: Tap debounce (same-timestamp taps are deduplicated), rope lead to 30-tap instant win, buzzer → timeout → draw path.
- **Fogduel**: Place fleets→turn-locked fire→hit→sink→win. Out-of-turn fire ignored.
- **Sculptionary**: Sculpt→guess→score→block cap (24 max)→end. Duplicate correct guesses from same player don't double-score.
- **Werewolf**: Deal→night kill→reveal→day vote→villagers win. Tied votes fall back to night with `noConsensus: true`.
- **Truthordare**: Pick→choose→vote→score→next. Prompt decks shuffled (100+ entries). Truth = +50, Dare completed = +100, Chickened = 0.
- **Tag**: Start→move→symmetric tag transfer→arena clamp (radius ≤ 7)→end.

### Tests
- All 41 unit tests pass (room logic, rules invariants, game state, avatar registry).
- TypeScript typecheck passes (`tsc --noEmit`).
- ESLint passes with 0 warnings across `lib/`, `games/`, and `components/`.

## 0.1.0
- Initial release: room creation, code sharing, 9 party games via room code, anonymous avatars.
