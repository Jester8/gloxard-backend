import { AccessToken } from "livekit-server-sdk";

const config = () => ({
  serverUrl: process.env.LIVEKIT_URL || "",
  apiKey: process.env.LIVEKIT_API_KEY || "",
  apiSecret: process.env.LIVEKIT_API_SECRET || "",
});

export const isLiveKitConfigured = () => {
  const { serverUrl, apiKey, apiSecret } = config();
  return Boolean(serverUrl && apiKey && apiSecret);
};

/**
 * Issues a short-lived LiveKit room token. Returns `configured: false` (no token) when LiveKit
 * credentials are not set, so the frontend can show its preview room instead of failing.
 */
export const createRoomToken = async ({ roomName, identity, name, canPublish = true, isHost = false, ttlSeconds = 2 * 60 * 60 }) => {
  if (!isLiveKitConfigured()) {
    return { provider: "livekit", configured: false, serverUrl: null, roomToken: null, roomName };
  }
  const { serverUrl, apiKey, apiSecret } = config();
  const token = new AccessToken(apiKey, apiSecret, { identity, name, ttl: ttlSeconds });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canSubscribe: true,
    canPublish,
    canPublishData: true,
    roomAdmin: isHost,
  });
  return { provider: "livekit", configured: true, serverUrl, roomToken: await token.toJwt(), roomName };
};
