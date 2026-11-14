import { signUserToken } from "@knocklabs/node";

/** How long a signed Knock user token lives. The browser refreshes it before then. */
const USER_TOKEN_TTL_SECONDS = 60 * 60;

/** What the browser needs to open the signed-in person's Knock feed. */
export type KnockFeedConfig = {
  publicApiKey: string;
  feedChannelId: string;
  /** RS256 token for enhanced security mode, or null when there is no signing key. */
  userToken: string | null;
};

/**
 * Builds Knock feed config for a signed-in user, signing a fresh user token
 * on every call (no network call). Returns null when Knock isn't configured
 * (no public key or no feed channel id), which means there is no bell.
 */
export async function getKnockFeedConfig(
  userId: number
): Promise<KnockFeedConfig | null> {
  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!publicApiKey || !feedChannelId) return null;

  const signingKey = process.env.KNOCK_SIGNING_KEY;
  const userToken = signingKey
    ? await signUserToken(String(userId), {
        signingKey,
        expiresInSeconds: USER_TOKEN_TTL_SECONDS,
      })
    : null;

  return { publicApiKey, feedChannelId, userToken };
}
