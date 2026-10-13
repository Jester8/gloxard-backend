import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET"];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`[WARN] Missing required environment variable: ${envVar}`);
  }
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn("[WARN] JWT_SECRET should ideally be at least 32 characters long for production security.");
}

const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.JWT_SECRET) {
  // The development fallback secret is public; never sign production tokens with it.
  throw new Error("JWT_SECRET must be set when NODE_ENV=production");
}

export const env = {
  PORT: process.env.PORT || 3001,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET || "gloxad_academy_super_secret_jwt_key_2026_xyz123!",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
  FRONTEND_ORIGINS: (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "Gloxad Academy <onboarding@resend.dev>",
  RESEND_APIKEY: process.env.RESEND_APIKEY || process.env.RESEND_API_KEY || "",
  AWS_REGION: process.env.AWS_REGION || "us-east-1",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || "gloxad-media-bucket",
  // No mock fallback in production: an empty key makes webhook/verification fail closed.
  PAYSTACK_SECRET_KEY:
    process.env.PAYSTACK_SECRET_KEY ||
    (isProduction ? "" : "sk_test_mock_paystack_secret_key_12345"),
};

export default env;
