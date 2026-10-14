import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

// Public folders are served by the CDN/bucket; private folders never get a
// public URL and are only readable through short-lived signed GET URLs.
export const PUBLIC_FOLDERS = ["avatars", "categories", "courses", "logos", "signatures", "resources"];
export const PRIVATE_FOLDERS = ["certifications", "documents", "submissions", "certificates"];
const ALLOWED_FOLDERS = [...PUBLIC_FOLDERS, ...PRIVATE_FOLDERS];

const hasCredentials = () => Boolean(env.AWS_ACCESS_KEY_ID) && Boolean(env.AWS_SECRET_ACCESS_KEY);

const getS3Client = () =>
  new S3Client({
    region: env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

/**
 * Generate AWS S3 PUT presigned URL or dev fallback URL
 * @param {Object} params
 * @param {string} params.filename Original filename
 * @param {string} params.fileType File MIME type
 * @param {string} [params.folder] Target storage folder
 * @returns {Promise<{ uploadUrl: string, fileUrl: string, key: string, expiresIn: number }>}
 */
export const generatePresignedPutUrl = async ({ filename, fileType, folder, userId }) => {
  const targetFolder = ALLOWED_FOLDERS.includes(folder) ? folder : "resources";
  
  const sanitizedFilename = (filename || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .toLowerCase();
  
  const timestamp = Date.now();
  const randomUuid = crypto.randomBytes(4).toString("hex");
  const isPrivate = PRIVATE_FOLDERS.includes(targetFolder);
  // Private objects are namespaced by owner so signed-url can enforce access.
  const ownerSegment = isPrivate && userId ? `${userId}/` : "";
  const key = `${targetFolder}/${ownerSegment}${timestamp}-${randomUuid}_${sanitizedFilename}`;
  const expiresIn = 900; // 15 minutes in seconds

  if (!hasCredentials()) {
    console.warn(
      "[S3 DEV NOTICE] AWS credentials missing. Operating in mock presigned mode."
    );
    const mockHost = `http://localhost:${env.PORT || 3001}`;
    const uploadUrl = `${mockHost}/api/upload/mock-put/${key}`;
    const fileUrl = isPrivate ? null : `https://${env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;

    return {
      uploadUrl,
      fileUrl,
      key,
      expiresIn,
    };
  }

  const s3Client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: fileType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  const fileUrl = isPrivate
    ? null
    : `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;

  return {
    uploadUrl,
    fileUrl,
    key,
    expiresIn,
  };
};

/**
 * Short-lived signed GET URL for an object in a private folder.
 * @param {string} key S3 object key (e.g. "documents/<userId>/…")
 */
export const generateSignedGetUrl = async (key, expiresIn = 300) => {
  if (!hasCredentials()) {
    return {
      url: `http://localhost:${env.PORT || 3001}/api/upload/mock-get/${key}`,
      key,
      expiresIn,
    };
  }
  const command = new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key });
  const url = await getSignedUrl(getS3Client(), command, { expiresIn });
  return { url, key, expiresIn };
};

/**
 * Readiness probe helper: "skipped" when S3 isn't configured (dev), otherwise
 * checks the bucket is reachable with the configured credentials.
 */
export const checkS3Connectivity = async () => {
  if (!hasCredentials()) return "skipped";
  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: env.AWS_S3_BUCKET }));
    return "ok";
  } catch {
    return "error";
  }
};

export default { generatePresignedPutUrl, generateSignedGetUrl, checkS3Connectivity };
