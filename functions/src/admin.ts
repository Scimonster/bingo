/** Lazily initialised Admin SDK handles shared by every Function module. */
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export function adminApp(): App {
  return getApps()[0] ?? initializeApp();
}

let firestore: Firestore | null = null;

export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(adminApp());
    try {
      firestore.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Another module already used this Firestore instance; settings are fixed then.
    }
  }
  return firestore;
}

export function bucket() {
  return getStorage(adminApp()).bucket();
}
