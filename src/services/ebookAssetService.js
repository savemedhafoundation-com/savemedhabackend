const crypto = require("crypto");
const cloudinary = require("../config/cloudinary");

const ASSET_CONFIG = {
  pdf: {
    folder: "savemedha/ebooks/pdfs",
    format: "pdf",
    maxBytes: 20 * 1024 * 1024,
    resourceType: "raw",
  },
  image: {
    folder: "savemedha/ebooks/banners",
    format: "jpg",
    maxBytes: 20 * 1024 * 1024,
    resourceType: "image",
  },
};

class EbookAssetError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "EbookAssetError";
    this.statusCode = statusCode;
  }
}

const getCloudinaryCredentials = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new EbookAssetError("Ebook file storage is not configured", 503);
  }

  return { cloudName, apiKey, apiSecret };
};

const getAssetConfig = (kind) => {
  const config = ASSET_CONFIG[kind];
  if (!config) {
    throw new EbookAssetError("Upload kind must be either pdf or image");
  }
  return config;
};

const safeEqual = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const createEbookUploadSignature = (kind) => {
  const config = getAssetConfig(kind);
  const { cloudName, apiKey, apiSecret } = getCloudinaryCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const uploadParams = {
    folder: config.folder,
    format: config.format,
    timestamp,
  };

  return {
    apiKey,
    kind,
    resourceType: config.resourceType,
    signature: cloudinary.utils.api_sign_request(uploadParams, apiSecret),
    uploadParams,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${config.resourceType}/upload`,
  };
};

const verifyEbookUpload = (asset, kind) => {
  const config = getAssetConfig(kind);
  const { apiSecret } = getCloudinaryCredentials();

  if (!asset || typeof asset !== "object") {
    throw new EbookAssetError(`Signed ${kind} upload details are required`);
  }

  const publicId = typeof asset.publicId === "string" ? asset.publicId.trim() : "";
  const version = Number(asset.version);
  const responseSignature = asset.signature;

  if (!publicId || !Number.isSafeInteger(version) || version <= 0 || !responseSignature) {
    throw new EbookAssetError(`Invalid signed ${kind} upload details`);
  }

  if (!publicId.startsWith(`${config.folder}/`)) {
    throw new EbookAssetError(`Invalid ${kind} upload folder`);
  }

  const hasExpectedFormat =
    kind === "pdf" ? !asset.format || asset.format === config.format : asset.format === config.format;

  if (asset.resourceType !== config.resourceType || !hasExpectedFormat) {
    throw new EbookAssetError(`Invalid ${kind} upload type`);
  }

  const expectedSignature = cloudinary.utils.api_sign_request(
    { public_id: publicId, version },
    apiSecret
  );

  if (!safeEqual(responseSignature, expectedSignature)) {
    throw new EbookAssetError(`Invalid ${kind} upload signature`);
  }

  return {
    publicId,
    version,
  };
};

const removeEbookUpload = (publicId, kind) => {
  const config = getAssetConfig(kind);
  return cloudinary.uploader.destroy(publicId, {
    invalidate: true,
    resource_type: config.resourceType,
  });
};

const validateCloudinaryUrl = (secureUrl) => {
  try {
    const url = new URL(secureUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === "res.cloudinary.com" || url.hostname === "api.cloudinary.com")
    );
  } catch (_error) {
    return false;
  }
};

const hasPdfHeader = async (secureUrl) => {
  const response = await fetch(secureUrl, {
    headers: { Range: "bytes=0-4" },
  });
  if (!response.ok) return false;

  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
};

const inspectEbookUpload = async (asset, kind) => {
  const config = getAssetConfig(kind);
  const verified = verifyEbookUpload(asset, kind);

  try {
    const resource = await cloudinary.api.resource(verified.publicId, {
      resource_type: config.resourceType,
      type: "upload",
    });
    const bytes = Number(resource.bytes);

    if (
      resource.public_id !== verified.publicId ||
      Number(resource.version) !== verified.version ||
      resource.resource_type !== config.resourceType ||
      !Number.isFinite(bytes) ||
      bytes <= 0 ||
      bytes > config.maxBytes ||
      !validateCloudinaryUrl(resource.secure_url)
    ) {
      throw new EbookAssetError(`Uploaded ${kind} failed storage validation`);
    }

    if (kind === "image" && (resource.format !== config.format || !resource.width || !resource.height)) {
      throw new EbookAssetError("Uploaded banner is not a valid image");
    }

    if (kind === "pdf") {
      const downloadUrl = cloudinary.utils.private_download_url(verified.publicId, "pdf", {
        attachment: true,
        resource_type: "raw",
        type: "upload",
      });
      if (!validateCloudinaryUrl(downloadUrl) || !(await hasPdfHeader(downloadUrl))) {
        throw new EbookAssetError("Uploaded file is not a valid PDF");
      }
    }

    return {
      bytes,
      publicId: verified.publicId,
      secureUrl: resource.secure_url,
      version: verified.version,
    };
  } catch (error) {
    await removeEbookUpload(verified.publicId, kind).catch((cleanupError) => {
      console.error(`Failed to remove invalid ${kind} upload:`, cleanupError);
    });

    if (error instanceof EbookAssetError) throw error;
    throw new EbookAssetError(`Uploaded ${kind} could not be verified`, 502);
  }
};

module.exports = {
  ASSET_CONFIG,
  EbookAssetError,
  createEbookUploadSignature,
  inspectEbookUpload,
  removeEbookUpload,
  verifyEbookUpload,
};
