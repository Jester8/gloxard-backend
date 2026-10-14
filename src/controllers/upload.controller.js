import { generatePresignedPutUrl, generateSignedGetUrl, PRIVATE_FOLDERS } from "../utils/s3.js";

/**
 * POST /api/upload/presigned-url
 * Generate AWS S3 PUT presigned URL for direct client-side upload
 */
export const getPresignedUrl = async (req, res, next) => {
  try {
    const { filename, fileType, folder } = req.body;

    if (!filename || typeof filename !== "string" || !filename.trim() ||
        !fileType || typeof fileType !== "string" || !fileType.trim()) {
      return res.status(400).json({
        error: "Filename and fileType are required",
      });
    }

    const presignedData = await generatePresignedPutUrl({
      filename: filename.trim(),
      fileType: fileType.trim(),
      folder: folder ? String(folder).trim() : undefined,
      userId: req.user?._id?.toString(),
    });

    return res.status(200).json(presignedData);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/upload/signed-url?key=...
 * Short-lived signed GET URL for objects in private folders. Only the owner
 * (the user id embedded in the key) or an admin may read them.
 */
export const getSignedUrl = async (req, res, next) => {
  try {
    const key = typeof req.query.key === "string" ? req.query.key.trim() : "";
    const segments = key.split("/");

    if (!key || key.includes("..") || segments.length < 3 || !PRIVATE_FOLDERS.includes(segments[0])) {
      return res.status(400).json({
        error: "A valid key from a private folder is required",
      });
    }

    const isOwner = segments[1] === req.user._id.toString();
    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({
        error: "You do not have access to this file",
      });
    }

    return res.status(200).json(await generateSignedGetUrl(key));
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/upload/mock-put/*
 * Developer fallback endpoint for testing direct uploads without live AWS S3 credentials
 */
export const mockUpload = async (req, res) => {
  return res.status(200).json({
    message: "Mock S3 PUT upload successful",
  });
};

/**
 * GET /api/upload/mock-get/*
 * Developer fallback for signed GET URLs when AWS credentials are missing.
 */
export const mockDownload = async (req, res) => {
  return res.status(200).json({ message: "Mock S3 GET successful" });
};

export default {
  mockDownload,
  getPresignedUrl,
  getSignedUrl,
  mockUpload,
};
