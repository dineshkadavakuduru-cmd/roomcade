import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let rtdb: Database | null = null;

export function firebaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_RTDB_URL);
}

export function getFirebase() {
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

export async function ensureAnonymousAuth(): Promise<string | null> {
  try {
    const fb = getFirebase();
    if (!fb) return null;
    if (!fb.auth.currentUser) {
      const cred = await signInAnonymously(fb.auth);
      return cred.user.uid;
    }
    return fb.auth.currentUser.uid;
  } catch {
    return null;
  }
}
