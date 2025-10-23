import { initializeApp, getApps } from "firebase/app";
export function safeInitFirebase(config) {
  try {
    if (!config?.apiKey) { console.warn("Firebase config manquante — mode démo"); return null; }
    return getApps().length ? getApps()[0] : initializeApp(config);
  } catch (e) { console.error("Erreur init Firebase:", e); return null; }
}
