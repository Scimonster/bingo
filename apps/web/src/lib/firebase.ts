import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

export const useEmulators = import.meta.env.VITE_USE_EMULATORS ? import.meta.env.VITE_USE_EMULATORS === "true" : import.meta.env.DEV;

let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
export let functions: Functions;
export let storage: FirebaseStorage;

async function loadConfig(): Promise<FirebaseOptions> {
  if (import.meta.env.VITE_FIREBASE_CONFIG) return JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
  if (useEmulators) {
    return { apiKey: "demo-key", authDomain: "demo-bingo.firebaseapp.com", projectId: "demo-bingo", storageBucket: "demo-bingo.appspot.com", appId: "demo-app" };
  }
  // Firebase Hosting serves the project's web config at this reserved URL.
  const res = await fetch("/__/firebase/init.json");
  if (!res.ok) throw new Error("Could not load Firebase config");
  return res.json();
}

/** Must resolve before rendering. */
export async function initFirebase(): Promise<void> {
  const config = await loadConfig();
  app = initializeApp(config);
  if (!useEmulators && import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
  }
  auth = getAuth(app);
  db = initializeFirestore(app, useEmulators ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  functions = getFunctions(app, "us-central1");
  storage = getStorage(app);
  if (useEmulators) {
    const host = location.hostname;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
    connectStorageEmulator(storage, host, 9199);
  }
}
