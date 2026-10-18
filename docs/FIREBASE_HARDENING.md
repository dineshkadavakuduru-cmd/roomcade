# Firebase security & operations

Roomcade uses **Firebase Realtime Database** for both room metadata
(`rooms/{code}/meta`) and per-game live state (`rooms/{code}/live`), plus
**Anonymous Auth** for identity. The config in `NEXT_PUBLIC_FIREBASE_*` is not a
secret — it ships in every browser bundle. What protects the data is:

1. `database.rules.json` (auth required, per-uid write paths, host-only meta),
2. API-key restrictions in Google Cloud,
3. optional App Check,
4. the scheduled TTL sweep for orphaned rooms.

## 0. Prerequisite: enable Anonymous Auth (currently OFF)

As of this audit the configured project (`roomcade-…`) returns
`CONFIGURATION_NOT_FOUND` for anonymous sign-in, and `GET /rooms.json` on the
Realtime Database returns **200** — i.e. the live database is currently world
readable (and writable under the default rules). Do these two things in the
Firebase console before the hardened rules will work:

1. **Authentication → Sign-in method → Anonymous → Enable.** Without it every
   write is denied once `database.rules.json` is deployed (the app shows an
   amber warning banner with this same guidance).
2. **Deploy the rules** (§1). Until then, keep in mind that anyone with the URL
   can read and write every room.

## 1. Deploy the database rules

`firebase.json` already points at `database.rules.json`.

```bash
npx firebase-tools login
npx firebase-tools use <your-firebase-project-id>
npx firebase-tools deploy --only database
```

Then verify the Console → Realtime Database → **Rules** tab shows the deployed
JSON, and re-run the smoke check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$NEXT_PUBLIC_FIREBASE_RTDB_URL/rooms.json"
# expect 401/403 (permission denied), never 200
```

Never deploy with the default test rules (`".read": true, ".write": true`).

### What the rules enforce

| Requirement | Rule |
|---|---|
| No listing every room | `.read: false` at `rooms`; read is granted only at `rooms/$code` |
| Clients can't write other players' scores | `meta/players/$uid` is writable by `$uid` (or the host, for group awards) |
| Scores only go up | `score` validate: number, `0…999999`, `>= root` previous value |
| Host/phase can't be overwritten | `status`, `currentGameId`, `selectedGameId`, `round`, `hostId` are host-only |
| Host migration when the host vanishes | `hostId` writable by a remaining player iff the recorded host is no longer in `players` |
| 2–8 players | `players` validate: `numChildren() <= 8` (server-side, atomic even on a race) |
| No forged identities | player `uid` must equal its key and the caller's `auth.uid` |
| Typed/validated fields | name 1–24 chars, avatar color `#RRGGBB`, booleans/timestamps/ids bounded |
| Live payload bounded | `live` must be a string ≤ 30 000 chars, writable only by room members |
| No room deletion by outsiders | `rooms/$code` is deletable only when the caller was the last player, or the room is already empty |

## 2. Restrict the browser API key

Google Cloud Console → **APIs & Services → Credentials →** the browser key used
by `NEXT_PUBLIC_FIREBASE_API_KEY`:

- **Application restrictions → HTTP referrers**
  - `https://roomcade.vercel.app/*`
  - `http://localhost:3000/*`
  - any Vercel preview domain you actually use, e.g. `https://*-<team>.vercel.app/*`
- **API restrictions → Restrict key**, allow only what the web SDK needs:
  - Identity Toolkit API (`identitytoolkit.googleapis.com`)
  - Token Service API (`securetoken.googleapis.com`)
  - Firebase Installations API (`firebaseinstallations.googleapis.com`)

Do **not** add the Realtime Database Admin API key or any server key here.

### App Check (recommended)

Firebase Console → **App Check** → register the web app with reCAPTCHA
Enterprise and enforce it for Realtime Database. Rules already require auth and
cap payload sizes, but App Check blocks scripted abuse of anonymous sign-in.

## 3. Secrets hygiene

- `.env.local` (and every `.env*.local`) is gitignored and untracked. Keep it that way.
- Never commit a service-account JSON, `database.secret`, or an Admin SDK key.
  The TTL function uses Application Default Credentials via `firebase-admin`
  inside Cloud Functions — no key file needed.
- If a key ever *was* committed, rotate it in Google Cloud and purge git history;
  removing it from the working tree is not enough.
- The repo currently contains no `AIza…` key, private key, or service account.

## 4. TTL cleanup for empty rooms

`functions/index.js` exports `sweepRooms`, a scheduled function that deletes:

- rooms with **0 players** (last client vanished without a clean leave), and
- rooms whose `meta.updatedAt` is older than **6 hours**.

```bash
cd functions && npm install
cd .. && npx firebase-tools deploy --only functions
```

Requires the Blaze plan for scheduled functions. Without it, clients still reap
abandoned rooms opportunistically when a code is re-used or joined, but truly
orphaned rooms (nobody ever returns) will linger until the next sweep is enabled.
