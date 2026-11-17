import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, type User } from "firebase/auth";
import { auth } from "./firebase";

/** Host sign-in: Google only (the auth emulator shows a fake account picker). */
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export function signOut(): Promise<void> {
  return fbSignOut(auth);
}

/** A host is any signed-in, non-anonymous user. */
export function isHost(user: User | null | undefined): user is User {
  return !!user && !user.isAnonymous;
}
