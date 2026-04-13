/**
 * Cloudinary image upload service.
 *
 * Handles uploading base64 images (from diagnostic/business chat) to
 * Cloudinary and returning public URLs. Images are auto-optimised and
 * thumbnails are generated on the fly via Cloudinary transforms.
 *
 * Required env vars:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */

import { v2 as cloudinary } from 'cloudinary';
import logger from '../logger';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    logger.warn({
      hasCloudName: !!cloudName,
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
    }, '[image-upload] Cloudinary missing env vars');
    return false;
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  configured = true;
  return true;
}

export interface UploadResult {
  /** Full-size image URL (auto-optimised) */
  url: string;
  /** 400px-wide thumbnail URL */
  thumbnailUrl: string;
  /** Cloudinary public ID (for deletion later if needed) */
  publicId: string;
}

/**
 * Upload a base64 data-URL image to Cloudinary.
 *
 * @param dataUrl - Full data URL: `data:image/jpeg;base64,...`
 * @param folder  - Cloudinary folder path (e.g. 'homie/jobs' or 'homie/scans')
 * @returns Upload result with URLs, or null if Cloudinary isn't configured
 */
export async function uploadImage(dataUrl: string, folder = 'homie/jobs'): Promise<UploadResult | null> {
  if (!ensureConfigured()) {
    logger.warn('[image-upload] Cloudinary not configured — skipping upload');
    return null;
  }

  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder,
      resource_type: 'image',
      // Auto quality + format for smallest file size
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    });

    const url = result.secure_url;
    // Generate a 400px thumbnail via on-the-fly transform
    const thumbnailUrl = cloudinary.url(result.public_id, {
      width: 400,
      crop: 'limit',
      quality: 'auto',
      fetch_format: 'auto',
      secure: true,
    });

    return { url, thumbnailUrl, publicId: result.public_id };
  } catch (err) {
    logger.error({ err }, '[image-upload] Cloudinary upload failed');
    return null;
  }
}

/**
 * Upload any file (PDF, HTML, image) to Cloudinary.
 * Uses resource_type 'auto' so Cloudinary detects the type.
 */
export async function uploadFile(dataUrl: string, folder = 'homie/jobs'): Promise<{ url: string; publicId: string } | null> {
  if (!ensureConfigured()) {
    throw new Error(`Cloudinary not configured — CLOUD_NAME:${!!process.env.CLOUDINARY_CLOUD_NAME} API_KEY:${!!process.env.CLOUDINARY_API_KEY} API_SECRET:${!!process.env.CLOUDINARY_API_SECRET}`);
  }

  try {
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder,
      resource_type: 'auto',
    });
    return { url: result.secure_url, publicId: result.public_id };
  } catch (err) {
    logger.error({ err }, '[image-upload] Cloudinary file upload failed');
    return null;
  }
}

/**
 * Upload multiple base64 data-URL images in parallel.
 * Skips any that fail individually and returns the successful ones.
 */
export async function uploadImages(dataUrls: string[], folder = 'homie/jobs'): Promise<UploadResult[]> {
  const results = await Promise.allSettled(
    dataUrls.map(url => uploadImage(url, folder)),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<UploadResult | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((r): r is UploadResult => r !== null);
}
