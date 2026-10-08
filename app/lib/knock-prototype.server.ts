// PROTOTYPE — throwaway Knock spike for "Does Knock hold up against Cadence?"
// (ai-hero-dev/cohort-005-project#21). Lives on prototype/knock-spike only.
import Knock, { signUserToken } from "@knocklabs/node";

if (!process.env.KNOCK_SECRET_API_KEY) {
  // Vite doesn't put non-VITE_ vars on process.env, so load .env ourselves.
  process.loadEnvFile(".env");
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`PROTOTYPE: ${name} missing from .env`);
  return value;
}

export const knock = new Knock({ apiKey: env("KNOCK_SECRET_API_KEY") });

export const knockPublicConfig = {
  publicApiKey: env("KNOCK_PUBLIC_API_KEY"),
  feedChannelId: env("KNOCK_FEED_CHANNEL_ID"),
};

export function knockUserId(cadenceUserId: number) {
  return String(cadenceUserId);
}

// Short expiry so a token minted for one DevUI user goes stale quickly.
export function signKnockUserToken(cadenceUserId: number) {
  return signUserToken(knockUserId(cadenceUserId), {
    signingKey: env("KNOCK_SIGNING_KEY"),
    expiresInSeconds: 60 * 10,
  });
}
