# ROOMCADE — 3D Multiplayer Party Games via Room Code

**Live:** https://roomcade.vercel.app

Create a room, get a short 5-letter code, and your friends join by typing that
code in — no accounts, no app install. Everyone lands in a shared 3D lounge as
a stylized avatar, picks a game from floating cartridges, and plays the night
together on a dedicated 3D stage. Scores carry across games into a podium recap.

Built as an **extensible game platform, not a single game** — new games are
self-contained modules that appear in the lobby automatically (see
[Adding a new game](#adding-a-new-game)).

## Games (v1 lineup)

| Game | What it is | Players |
|------|------------|---------|
| **Sculptionary** | One player sculpts a secret word in 3D from primitives on a shared pedestal; everyone else guesses live | 3–8 |
| **Werewolf** | Social deduction — night dims the lounge for secret wolf/seer prompts, day is debate + vote, eliminations get a spotlight reveal | 4–8 |
| **Trivia Podiums** | Quiz show — buzz in for a spotlight + camera push-in, correct answers flash green | 2–8 |
| **Tag Arena** | Real-time chase — one player is "it", tag transfers on contact, 60s timer (WASD/arrows + touch joystick) | 2–8 |

## Quick start

```bash
npm install
npm run dev    # http://localhost:3000
```

**Two tabs = two players.** Create a room in tab 1, join with the same code in
tab 2, and play a full round of every game.

## How multiplayer works

| Layer | Firebase configured | No env (default) |
|-------|--------------------|------------------|
| Room metadata (host, players, scores, status) | Firestore `rooms/{code}` | localStorage + BroadcastChannel |
| Live per-game state (positions, votes, buzzers) | Realtime Database `rooms/{code}/live` | localStorage + BroadcastChannel |
| Identity | Firebase Anonymous Auth | per-tab session id |

Without env vars the app runs a **local same-browser backend**, so the full
create → join → play → recap flow works with zero setup. For cross-device play,
copy `.env.example` to `.env.local` and fill in a Firebase project (Anonymous
Auth + Firestore + Realtime Database enabled):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_RTDB_URL=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

The same variables must be set in Vercel → Project → Settings → Environment
Variables for the deployed site, then redeployed.

## Project structure

```
app/
  page.tsx                    # landing: avatar setup, create / join by code
  room/[code]/page.tsx        # 3D lobby: lounge, game carousel, recap overlay
  room/[code]/play/page.tsx   # renders the active game module (lazy-loaded)
  not-found.tsx               # branded 404
games/
  registry.ts                 # shared GameModule interface
  index.tsx                   # registry + per-game lazy loader
  sculptionary.tsx | werewolf.tsx | trivia.tsx | tag.tsx
components/
  LobbyScene.tsx | Avatar3D.tsx | PortalTransition.tsx |
  Scoreboard.tsx | RecapPodium.tsx
lib/
  types.ts                    # RoomMeta, Player, LiveState, Action, code gen
  firebase.ts                 # Firebase init (null when unconfigured)
  room-store.ts               # room + live state abstraction (both backends)
  anime.ts                    # 2D UI motion helpers (anime.js only)
design/DESIGN.md              # design tokens + provenance (Refero: Slush, Rainbow)
```

## Adding a new game

1. Create `games/my-game.tsx` exporting a `GameModule`:
   ```ts
   interface GameModule {
     id: string;
     displayName: string;
     minPlayers: number;
     maxPlayers: number;
     LobbyPreviewScene: React.FC;              // mini 3D preview on its cartridge
     GameScene: React.FC<{ roomCode: string }>; // full 3D stage + client logic
     applyAction: (state: LiveState, action: Action) => LiveState;
   }
   ```
2. Register it in `games/index.tsx` (`GAMES` + `GAME_LIST` + lazy branch in `LazyGameScene`).
3. It appears in the lobby carousel automatically. Use `dispatchLive` /
   `subscribeLive` from `lib/room-store` for state and `awardScores` for
   cross-game scoring. Never mount other games' scenes — each module lazy-loads.

## Design system

- **Mood:** boutique arcade at night — warm neon (tangerine `#FF8A00`, ember
  `#FF6B35`, hot pink `#FF54BB`) on deep indigo (`#0D0D24` / `#171736`).
- **Sources:** Refero systems **Slush** (pill buttons, sticker chips, marquee)
  and **Rainbow** (rounded type, chromatic CTA duo, inset-highlight depth);
  motion reference **"Golden Portal"** (motionsites.ai). See `design/DESIGN.md`.
- **Motion split:** anime.js owns the 2D UI layer (entry, buzzers, count-ups,
  portal overlay); react-three-fiber owns the 3D canvas. One shared
  `PortalTransition` (charge → burst → settle) connects lobby ↔ every game.

## Tech stack

Next.js 14 (App Router) · TypeScript · react-three-fiber + drei · anime.js ·
Tailwind CSS · Firebase (Anonymous Auth, Firestore, RTDB) · Deployed on Vercel

## Scripts

```bash
npm run dev      # local dev server
npm run build    # production build (type-check + lint)
npm start        # serve production build
```

## Definition of done (status)

- [x] Two clients can create, join by code, and finish a round of all four games (local backend)
- [x] One shared lobby↔game transition across all games
- [x] Scores persist across a multi-game session; recap crowns the winner
- [x] Production build is clean; all routes serve 200
- [ ] Playwright two-client pass with desktop/mobile screenshots (needs a browser session)
- [ ] Cross-device rooms (needs Firebase env vars — see above)
