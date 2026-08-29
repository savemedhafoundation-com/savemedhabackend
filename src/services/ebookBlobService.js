const { del, head } = require("@vercel/blob");
const { EbookAssetError } = require("./ebookAssetService");

const BLOB_PROVIDER = "vercel-blob";
const PDF_CONTENT_TYPE = "application/pdf";
const PDF_PATH_PREFIX = "savemedha/ebooks/pdfs/";
const DEFAULT_MAX_PDF_BYTES = 500 * 1024 * 1024;
const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;
const UPLOAD_TOKEN_TTL_MS = 60 * 60 * 1000;

const getMaxPdfBytes = () => {
  const configured = Number(process.env.EBOOK_PDF_MAX_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_PDF_BYTES;
};

const ensureBlobStorageConfigured = () => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new EbookAssetError("Ebook Blob storage is not configured", 503);
  }
};

const isValidPdfPathname = (pathname) =>
  typeof pathname === "string" &&
  pathname.startsWith(PDF_PATH_PREFIX) &&
  pathname.length > PDF_PATH_PREFIX.length &&
  pathname.length <= PDF_PATH_PREFIX.length + 240 &&
  /^[a-zA-Z0-9._/-]+$/.test(pathname) &&
  pathname.toLowerCase().endsWith(".pdf") &&
  !pathname.includes("..") &&
  !pathname.includes("//") &&
  !pathname.slice(PDF_PATH_PREFIX.length).includes("/");

const parsePublicBlobUrl = (value, { allowQuery = false } = {}) => {
  try {
    const url = new URL(value);
    const isPublicBlobHost = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(
      url.hostname
    );
    if (
      url.protocol !== "https:" ||
      !isPublicBlobHost ||
      url.username ||
      url.password ||
      url.hash ||
      (!allowQuery && url.search)
    ) {
      return null;
    }
    return url;
  } catch (_error) {
    return null;
  }
};

const getEbookBlobTokenOptions = (
  pathname,
  _clientPayload,
  _multipart,
  { nowMs = Date.now() } = {}
) => {
  ensureBlobStorageConfigured();
  if (!isValidPdfPathname(pathname)) {
    throw new EbookAssetError(`PDF pathname must match ${PDF_PATH_PREFIX}<filename>.pdf`);
  }

  return {
    // The admin prefixes a UUID and overwrites are disabled, so the pathname is already collision-safe.
    addRandomSuffix: false,
    allowOverwrite: false,
    allowedContentTypes: [PDF_CONTENT_TYPE],
    maximumSizeInBytes: getMaxPdfBytes(),
    validUntil: nowMs + UPLOAD_TOKEN_TTL_MS,
  };
};

const isEbookBlobAsset = (asset) =>
  Boolean(
    asset &&
      typeof asset === "object" &&
      (asset.provider === BLOB_PROVIDER ||
        (typeof asset.pathname === "string" && asset.pathname.startsWith(PDF_PATH_PREFIX)))
  );

const readPdfHeader = async (url, fetchImpl) => {
  const response = await fetchImpl(url, {
    headers: { Range: "bytes=0-4" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.body) return false;

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < 5) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return Buffer.concat(chunks, total).subarray(0, 5).toString("ascii") === "%PDF-";
};

const removeEbookBlob = async (urlOrPathname, { deleteBlob = del } = {}) => {
  ensureBlobStorageConfigured();
  const pathname = parsePublicBlobUrl(urlOrPathname)?.pathname.slice(1) || urlOrPathname;
  if (!isValidPdfPathname(pathname)) {
    throw new EbookAssetError("Invalid ebook Blob pathname");
  }
  await deleteBlob(pathname);
};

const inspectEbookBlobUpload = async (
  asset,
  {
    headBlob = head,
    fetchImpl = fetch,
    deleteBlob = del,
    canDeleteBlob = async () => true,
  } = {}
) => {
  ensureBlobStorageConfigured();
  if (!asset || typeof asset !== "object") {
    throw new EbookAssetError("Uploaded PDF Blob details are required");
  }

  const pathname = typeof asset.pathname === "string" ? asset.pathname : "";
  const submittedUrl = parsePublicBlobUrl(asset.url);
  if (!submittedUrl || !isValidPdfPathname(pathname) || asset.contentType !== PDF_CONTENT_TYPE) {
    throw new EbookAssetError("Invalid uploaded PDF Blob details");
  }

  let metadata;
  try {
    metadata = await headBlob(asset.url);
    const metadataUrl = parsePublicBlobUrl(metadata.url);
    const downloadUrl = parsePublicBlobUrl(metadata.downloadUrl, { allowQuery: true });
    const sameBlobHost = metadataUrl && downloadUrl && metadataUrl.hostname === downloadUrl.hostname;
    const submittedFieldsMatch =
      (!asset.downloadUrl || asset.downloadUrl === metadata.downloadUrl) &&
      (!asset.contentDisposition || asset.contentDisposition === metadata.contentDisposition) &&
      (!asset.etag || asset.etag === metadata.etag) &&
      (asset.size === undefined || Number(asset.size) === Number(metadata.size));
    const bytes = Number(metadata.size);

    if (
      !metadataUrl ||
      !downloadUrl ||
      !sameBlobHost ||
      metadataUrl.href !== submittedUrl.href ||
      metadata.pathname !== pathname ||
      metadata.contentType !== PDF_CONTENT_TYPE ||
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > getMaxPdfBytes() ||
      !submittedFieldsMatch ||
      !(await readPdfHeader(metadata.url, fetchImpl))
    ) {
      throw new EbookAssetError("Uploaded PDF failed Blob storage validation");
    }

    return {
      bytes,
      pdfDownloadUrl: metadata.downloadUrl,
      pdfStorageKey: metadata.pathname,
      pdfStorageProvider: BLOB_PROVIDER,
      pdfUrl: metadata.url,
    };
  } catch (error) {
    const mayDelete =
      metadata?.pathname === pathname &&
      (await canDeleteBlob(pathname).catch((referenceError) => {
        console.error("Failed to check ebook Blob references:", referenceError);
        return false;
      }));
    if (mayDelete) {
      await removeEbookBlob(pathname, { deleteBlob }).catch((cleanupError) => {
        console.error("Failed to remove invalid ebook Blob upload:", cleanupError);
      });
    }
    if (error instanceof EbookAssetError) throw error;
    throw new EbookAssetError("Uploaded PDF Blob could not be verified", 502);
  }
};

module.exports = {
  BLOB_PROVIDER,
  DEFAULT_MAX_PDF_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  PDF_CONTENT_TYPE,
  PDF_PATH_PREFIX,
  UPLOAD_TOKEN_TTL_MS,
  getEbookBlobTokenOptions,
  inspectEbookBlobUpload,
  isEbookBlobAsset,
  removeEbookBlob,
};
