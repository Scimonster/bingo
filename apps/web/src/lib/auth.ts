import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut as fbSignOut, type User } from "firebase/auth";
import { auth } from "./firebase";

/** Host sign-in: Google only (the auth emulator shows a fake account picker). */
export async function signInWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      // Falls back to a full-page redirect; the user comes back signed in.
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw e;
  }
}

export function signOut(): Promise<void> {
  return fbSignOut(auth);
}

/** A host is any signed-in, non-anonymous user. */
export function isHost(user: User | null | undefined): user is User {
  return !!user && !user.isAnonymous;
}
