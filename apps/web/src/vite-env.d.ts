/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** "true" to connect to local emulators (default in dev). */
  readonly VITE_USE_EMULATORS?: string;
  /** Optional explicit Firebase web config as JSON; otherwise /__/firebase/init.json from Hosting. */
  readonly VITE_FIREBASE_CONFIG?: string;
  /** reCAPTCHA Enterprise site key; enables App Check when set. */
  readonly VITE_RECAPTCHA_SITE_KEY?: string;
  /** Added to every default emulator port (dev only), for emulators running on shifted ports. */
  readonly VITE_EMULATOR_PORT_OFFSET?: string;
}
