import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  browserSessionPersistence,
  getAuth,
  setPersistence,
  signInAnonymously,
  type Auth,
} from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let rtdb: Database | null = null;
let authPromise: Promise<string | null> | null = null;
let authFailure: string | null = null;

/**
 * Why anonymous sign-in failed, if it did. The RTDB rules require `auth != null`,
 * so this must be surfaced to the operator: enable Authentication → Anonymous in
 * the Firebase console (see docs/FIREBASE_HARDENING.md).
 */
export function authFailureReason(): string | null {
  return authFailure;
}

interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  rtdb: Database;
}

// Test-only hook: the integration script simulates several players, each with a
// separate anonymous Firebase user and RTDB connection. Production never sets it.
let overrideClient: FirebaseClient | null = null;

export function setFirebaseClientForTests(client: FirebaseClient | null): void {
  overrideClient = client;
  authPromise = null;
  authFailure = null;
}

export function firebaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_RTDB_URL);
}

export function getFirebase() {
  if (overrideClient) return overrideClient;
  if (!firebaseConfigured()) return null;
  if (!app) {
    const config = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      databaseURL: process.env.NEXT_PUBLIC_FIREBASE_RTDB_URL,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    app = getApps().length ? getApps()[0]! : initializeApp(config);
    auth = getAuth(app);
    if (config.databaseURL) rtdb = getDatabase(app);
  }
  return { app: app!, auth: auth!, rtdb: rtdb! };
}

/**
 * Anonymous auth is the identity that RTDB security rules bind writes to.
 *
 * Persistence is deliberately scoped to the browser *tab*: two tabs on the same
 * machine must be able to play as two different players (the core Roomcade
 * demo), and the anonymous user id must survive a refresh inside that tab.
 * `browserSessionPersistence` gives exactly that. Without it, both tabs would
 * share one Firebase uid and overwrite each other's player node.
 */
export async function ensureAnonymousAuth(): Promise<string | null> {
  const fb = getFirebase();
  if (!fb) return null;
  if (fb.auth.currentUser) return fb.auth.currentUser.uid;
  if (!authPromise) {
    authPromise = (async () => {
      try {
        await setPersistence(fb.auth, browserSessionPersistence);
      } catch {
        // Environments without IndexedDB/sessionStorage (SSR, some test runners)
        // fall back to Firebase's default in-memory persistence.
      }
      try {
        if (!fb.auth.currentUser) {
          const cred = await signInAnonymously(fb.auth);
          return cred.user.uid;
        }
        return fb.auth.currentUser.uid;
      } catch (e: any) {
        authFailure = String(e?.code ?? e?.message ?? 'auth-failed');
        return null;
      }
    })();
  }
  return authPromise;
}

/** Synchronous peek at the auth uid, used by the room store after boot. */
export function currentAuthUid(): string | null {
  if (!firebaseConfigured() && !overrideClient) return null;
  try {
    return getFirebase()?.auth.currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

/** Test hook: forget in-flight auth so a new identity can be acquired. */
export function resetAuthCacheForTests(): void {
  authPromise = null;
}
