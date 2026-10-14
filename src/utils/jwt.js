import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const signToken = (payload, options = {}) => {
  const secret = env.JWT_SECRET || process.env.JWT_SECRET;
  const expiresIn = options.expiresIn || env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, secret, { expiresIn, ...options });
};

export const verifyToken = (token) => {
  const secret = env.JWT_SECRET || process.env.JWT_SECRET;
  return jwt.verify(token, secret);
};

// Verifies signature but tolerates tokens that expired up to graceSeconds ago
// (used by /auth/refresh so a client whose token just lapsed can recover).
export const verifyTokenWithGrace = (token, graceSeconds = 300) => {
  const secret = env.JWT_SECRET || process.env.JWT_SECRET;
  const decoded = jwt.verify(token, secret, { ignoreExpiration: true });
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp !== undefined && now - decoded.exp > graceSeconds) {
    const err = new Error("jwt expired");
    err.name = "TokenExpiredError";
    throw err;
  }
  return decoded;
};

export default {
  signToken,
  verifyToken,
  verifyTokenWithGrace,
};
