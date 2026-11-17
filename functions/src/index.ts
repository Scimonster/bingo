import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

// Setup / admin callables and the liveRound dispatcher are added by the functions module.
export { exportSheetsPdf } from "./pdf";
