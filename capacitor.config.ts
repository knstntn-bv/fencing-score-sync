import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native apps load the Vite production bundle from `webDir`.
 *
 * Do not commit `server.url`: that makes the WebView load a remote site
 * instead of the packaged assets (Lovable used this for live preview).
 *
 * For device live-reload only, set CAPACITOR_LIVE_RELOAD_URL to your
 * machine's LAN address (e.g. http://192.168.1.10:8080) before `cap sync`.
 */
const liveReloadUrl = process.env.CAPACITOR_LIVE_RELOAD_URL;

const config: CapacitorConfig = {
  appId: "app.konbo.d1df035b813845be9ffb36f88a5ffd3b",
  appName: "fencing-score-sync",
  webDir: "dist",
  server: {
    androidScheme: "https",
    ...(liveReloadUrl
      ? { url: liveReloadUrl, cleartext: true }
      : {}),
  },
};

export default config;
