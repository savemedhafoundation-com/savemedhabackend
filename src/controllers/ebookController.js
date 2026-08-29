const { Readable } = require("stream");
const { handleUpload } = require("@vercel/blob/client");
const Ebook = require("../models/Ebook");
const cloudinary = require("../config/cloudinary");
const {
  createEbookUploadSignature: buildEbookUploadSignature,
  inspectEbookUpload,
  removeEbookUpload,
  verifyEbookUpload,
} = require("../services/ebookAssetService");
const {
  BLOB_PROVIDER,
  getEbookBlobTokenOptions,
  inspectEbookBlobUpload,
  isEbookBlobAsset,
  removeEbookBlob,
} = require("../services/ebookBlobService");

const streamUpload = (file, options) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });

    const source = Readable.from(file.buffer);
    source.on("error", reject);
    source.pipe(uploadStream);
  });

const normalizeArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => `${item}`.trim()).filter(Boolean);
  return [`${value}`.trim()].filter(Boolean);
};

const getUploadedPdf = (req) => {
  if (req.file) return req.file;
  if (req.files) {
    if (req.files.pdf && req.files.pdf[0]) return req.files.pdf[0];
    if (req.files.file && req.files.file[0]) return req.files.file[0];
  }
  return null;
};

const getUploadedImage = (req) => {
  if (req.files) {
    if (req.files.image && req.files.image[0]) return req.files.image[0];
    if (req.files.banner && req.files.banner[0]) return req.files.banner[0];
  }
  return null;
};

const getPdfDownloadUrl = (publicId) =>
  cloudinary.utils?.private_download_url?.(publicId, "pdf", {
    resource_type: "raw",
    attachment: true,
    type: "upload",
  });

const uploadPdf = async (file) => {
  const uploadResult = await streamUpload(file, {
    folder: "savemedha/ebooks/pdfs",
    resource_type: "raw", // explicit raw to avoid mixed-type deletes
    format: "pdf",
    type: "upload",
  });

  const pdfUrl = getPdfDownloadUrl(uploadResult.public_id) || uploadResult.secure_url;

  return {
    pdfUrl,
    cloudinaryId: uploadResult.public_id,
    pdfDownloadUrl: pdfUrl,
    pdfStorageKey: uploadResult.public_id,
    pdfStorageProvider: "cloudinary",
  };
};

const removeStoredCloudinaryPdf = async (filename) => {
  if (!filename) return;
  try {
    await cloudinary.uploader.destroy(filename, { resource_type: "raw" });
  } catch (err) {
    console.error("Failed to delete PDF from Cloudinary:", err);
  }
};

const uploadImage = async (file) => {
  const uploadResult = await streamUpload(file, {
    folder: "savemedha/ebooks/banners",
    resource_type: "image",
    format: "jpg",
  });

  return {
    imageUrl: uploadResult.secure_url,
    imagePublicId: uploadResult.public_id,
  };
};

const removeStoredImage = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (err) {
    console.error("Failed to delete banner from Cloudinary:", err);
  }
};

const removeStoredPdfAsset = async (asset) => {
  if (!asset) return;

  if (asset.pdfStorageProvider === BLOB_PROVIDER) {
    if (!asset.pdfStorageKey) return;
    try {
      await removeEbookBlob(asset.pdfStorageKey);
    } catch (error) {
      console.error("Failed to delete PDF from Vercel Blob:", error);
    }
    return;
  }

  await removeStoredCloudinaryPdf(asset.cloudinaryId || asset.pdfStorageKey);
};

const getStoredPdfAsset = (ebook) => {
  if (!ebook) return null;
  const isBlob = ebook.pdfStorageProvider === BLOB_PROVIDER;
  return {
    cloudinaryId: isBlob ? null : ebook.cloudinaryId,
    pdfStorageKey: isBlob ? ebook.pdfStorageKey : ebook.cloudinaryId || ebook.pdfStorageKey,
    pdfStorageProvider: isBlob ? BLOB_PROVIDER : "cloudinary",
  };
};

const getDirectAsset = (req, fieldName) => {
  const asset = req.body?.[fieldName];
  return asset && typeof asset === "object" ? asset : null;
};

const canDeleteUnreferencedBlob = async (pdfStorageKey) =>
  !(await Ebook.exists({ pdfStorageProvider: BLOB_PROVIDER, pdfStorageKey }));

const resolvePdfAsset = async (req) => {
  const file = getUploadedPdf(req);
  if (file) return uploadPdf(file);

  const directAsset = getDirectAsset(req, "pdfAsset");
  if (!directAsset) return null;

  if (isEbookBlobAsset(directAsset)) {
    return inspectEbookBlobUpload(directAsset, { canDeleteBlob: canDeleteUnreferencedBlob });
  }

  const verified = await inspectEbookUpload(directAsset, "pdf");
  const pdfUrl = getPdfDownloadUrl(verified.publicId) || verified.secureUrl;
  return {
    pdfUrl,
    cloudinaryId: verified.publicId,
    pdfDownloadUrl: pdfUrl,
    pdfStorageKey: verified.publicId,
    pdfStorageProvider: "cloudinary",
  };
};

const resolveImageAsset = async (req) => {
  const file = getUploadedImage(req);
  if (file) return uploadImage(file);

  const directAsset = getDirectAsset(req, "imageAsset");
  if (!directAsset) return null;

  const verified = await inspectEbookUpload(directAsset, "image");
  return {
    imageUrl: verified.secureUrl,
    imagePublicId: verified.publicId,
  };
};

const removePdfIfUnreferenced = async (pdfAsset) => {
  if (!pdfAsset) return;
  const storageKey = pdfAsset.cloudinaryId || pdfAsset.pdfStorageKey;
  if (!storageKey) return;
  try {
    const query =
      pdfAsset.pdfStorageProvider === BLOB_PROVIDER
        ? { pdfStorageProvider: BLOB_PROVIDER, pdfStorageKey: storageKey }
        : { cloudinaryId: storageKey };
    const referenced = await Ebook.exists(query);
    if (!referenced) await removeStoredPdfAsset(pdfAsset);
  } catch (error) {
    console.error("Failed to check PDF references during cleanup:", error);
  }
};

const removeImageIfUnreferenced = async (imagePublicId) => {
  if (!imagePublicId) return;
  try {
    const referenced = await Ebook.exists({ imagePublicId });
    if (!referenced) await removeStoredImage(imagePublicId);
  } catch (error) {
    console.error("Failed to check banner references during cleanup:", error);
  }
};

const cleanupResolvedAssets = async (pdfAsset, imageAsset) => {
  await Promise.all([
    removePdfIfUnreferenced(pdfAsset),
    removeImageIfUnreferenced(imageAsset?.imagePublicId),
  ]);
};

const resolveRequestedAssets = async (req) => {
  const outcomes = await Promise.allSettled([
    resolvePdfAsset(req),
    resolveImageAsset(req),
  ]);
  const pdfAsset = outcomes[0].status === "fulfilled" ? outcomes[0].value : null;
  const imageAsset = outcomes[1].status === "fulfilled" ? outcomes[1].value : null;
  const failed = outcomes.find((outcome) => outcome.status === "rejected");

  if (failed) {
    await cleanupResolvedAssets(pdfAsset, imageAsset);
    throw failed.reason;
  }

  return { pdfAsset, imageAsset };
};

const sendEbookError = (res, error, fallbackMessage) => {
  const statusCode = Number(error.statusCode);
  const isSafeError = Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600;

  return res.status(isSafeError ? statusCode : 500).json({
    message: isSafeError ? error.message : fallbackMessage,
  });
};

const getEbookUploadSignature = (req, res) => {
  try {
    return res.status(200).json(buildEbookUploadSignature(req.body?.kind));
  } catch (error) {
    console.error("Failed to sign ebook upload:", error);
    return sendEbookError(res, error, "Failed to prepare ebook upload");
  }
};

const handleEbookBlobUpload = async (req, res) => {
  try {
    const result = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: getEbookBlobTokenOptions,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Failed to handle ebook Blob upload:", error);
    const statusCode = Number(error.statusCode);
    return res
      .status(Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : 400)
      .json({ message: error.message || "Failed to prepare ebook Blob upload" });
  }
};

const cleanupEbookUploads = async (req, res) => {
  try {
    const assets = req.body?.assets;
    if (!Array.isArray(assets) || assets.length === 0 || assets.length > 2) {
      return res.status(400).json({ message: "One or two uploaded assets are required" });
    }

    await Promise.all(
      assets.map(async ({ asset, kind }) => {
        if (kind === "pdf" && isEbookBlobAsset(asset)) {
          const verifiedBlob = await inspectEbookBlobUpload(asset, {
            canDeleteBlob: canDeleteUnreferencedBlob,
          });
          const referenced = await Ebook.exists({
            pdfStorageProvider: BLOB_PROVIDER,
            pdfStorageKey: verifiedBlob.pdfStorageKey,
          });
          if (!referenced) await removeEbookBlob(verifiedBlob.pdfStorageKey);
          return;
        }

        const verified = verifyEbookUpload(asset, kind);
        const referenced = await Ebook.exists(
          kind === "pdf"
            ? { cloudinaryId: verified.publicId }
            : { imagePublicId: verified.publicId }
        );
        if (referenced) return;
        await removeEbookUpload(verified.publicId, kind);
      })
    );

    return res.status(204).end();
  } catch (error) {
    console.error("Failed to clean up ebook uploads:", error);
    return sendEbookError(res, error, "Failed to clean up ebook uploads");
  }
};

const getEbooks = async (_req, res) => {
  try {
    const ebooks = await Ebook.find().sort({ createdAt: -1, title: 1 });
    res.status(200).json(ebooks);
  } catch (error) {
    console.error("Failed to fetch ebooks:", error);
    res.status(500).json({ message: "Failed to fetch ebooks" });
  }
};

const getEbookById = async (req, res) => {
  try {
    const ebook = await Ebook.findById(req.params.id);

    if (!ebook) {
      return res.status(404).json({ message: "Ebook not found" });
    }

    res.status(200).json(ebook);
  } catch (error) {
    console.error("Failed to fetch ebook:", error);
    res.status(500).json({ message: "Failed to fetch ebook" });
  }
};

const createEbook = async (req, res) => {
  let pdfAsset = null;
  let imageAsset = null;
  let persisted = false;

  try {
    const { title, description } = req.body;
    const authors = normalizeArray(req.body.authors);
    const tags = normalizeArray(req.body.tags);

    if (!title || !description) {
      return res.status(400).json({ message: "Title and description are required" });
    }

    const hasPdf = Boolean(getUploadedPdf(req) || getDirectAsset(req, "pdfAsset"));
    if (!hasPdf) {
      return res.status(400).json({ message: "PDF file is required" });
    }

    const hasImage = Boolean(getUploadedImage(req) || getDirectAsset(req, "imageAsset"));
    if (!hasImage) {
      return res.status(400).json({ message: "Banner image is required" });
    }

    ({ pdfAsset, imageAsset } = await resolveRequestedAssets(req));

    const ebook = await Ebook.create({
      title,
      description,
      authors,
      tags,
      pdfUrl: pdfAsset.pdfUrl,
      pdfDownloadUrl: pdfAsset.pdfDownloadUrl,
      pdfStorageProvider: pdfAsset.pdfStorageProvider,
      pdfStorageKey: pdfAsset.pdfStorageKey,
      cloudinaryId: pdfAsset.cloudinaryId,
      imageUrl: imageAsset.imageUrl,
      imagePublicId: imageAsset.imagePublicId,
    });
    persisted = true;

    return res.status(201).json(ebook);
  } catch (error) {
    if (!persisted) {
      await cleanupResolvedAssets(pdfAsset, imageAsset);
    }
    console.error("Failed to create ebook:", error);
    return sendEbookError(res, error, "Failed to create ebook");
  }
};

const updateEbook = async (req, res) => {
  let newPdfAsset = null;
  let newImageAsset = null;
  let persisted = false;

  try {
    const { title, description } = req.body;
    const authors = normalizeArray(req.body.authors);
    const tags = normalizeArray(req.body.tags);
    const ebook = await Ebook.findById(req.params.id);

    if (!ebook) {
      return res.status(404).json({ message: "Ebook not found" });
    }

    if (title) ebook.title = title;
    if (description) ebook.description = description;
    if (req.body.authors !== undefined) ebook.authors = authors;
    if (req.body.tags !== undefined) ebook.tags = tags;

    const oldPdfAsset = getStoredPdfAsset(ebook);
    const oldImageId = ebook.imagePublicId;
    const resolved = await resolveRequestedAssets(req);
    newPdfAsset = resolved.pdfAsset;
    newImageAsset = resolved.imageAsset;

    if (newPdfAsset) {
      ebook.pdfUrl = newPdfAsset.pdfUrl;
      ebook.pdfDownloadUrl = newPdfAsset.pdfDownloadUrl;
      ebook.pdfStorageProvider = newPdfAsset.pdfStorageProvider;
      ebook.pdfStorageKey = newPdfAsset.pdfStorageKey;
      ebook.cloudinaryId = newPdfAsset.cloudinaryId || null;
    }

    if (newImageAsset) {
      ebook.imageUrl = newImageAsset.imageUrl;
      ebook.imagePublicId = newImageAsset.imagePublicId;
    }

    await ebook.save();
    persisted = true;

    await Promise.all([
      newPdfAsset && oldPdfAsset.pdfStorageKey !== newPdfAsset.pdfStorageKey
        ? removePdfIfUnreferenced(oldPdfAsset)
        : null,
      newImageAsset && oldImageId !== newImageAsset.imagePublicId
        ? removeImageIfUnreferenced(oldImageId)
        : null,
    ]);

    return res.status(200).json(ebook);
  } catch (error) {
    if (!persisted) {
      await cleanupResolvedAssets(newPdfAsset, newImageAsset);
    }
    console.error("Failed to update ebook:", error);
    return sendEbookError(res, error, "Failed to update ebook");
  }
};

const deleteEbook = async (req, res) => {
  try {
    const ebook = await Ebook.findById(req.params.id);

    if (!ebook) {
      return res.status(404).json({ message: "Ebook not found" });
    }

    const storedPdfAsset = getStoredPdfAsset(ebook);
    const storedImageId = ebook.imagePublicId;
    await ebook.deleteOne();

    await Promise.all([
      removePdfIfUnreferenced(storedPdfAsset),
      removeImageIfUnreferenced(storedImageId),
    ]);
    res.status(200).json({ message: "Ebook deleted" });
  } catch (error) {
    console.error("Failed to delete ebook:", error);
    res.status(500).json({ message: "Failed to delete ebook" });
  }
};

const searchEbooks = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const regex = new RegExp(q.trim(), "i");
    const ebooks = await Ebook.find({
      $or: [{ title: regex }, { authors: regex }, { tags: regex }],
    }).sort({ createdAt: -1 });

    res.status(200).json(ebooks);
  } catch (error) {
    console.error("Failed to search ebooks:", error);
    res.status(500).json({ message: "Failed to search ebooks" });
  }
};

const downloadEbook = async (req, res) => {
  try {
    const ebook = await Ebook.findById(req.params.id);

    if (!ebook) {
      return res.status(404).json({ message: "Ebook not found" });
    }

    const isBlobPdf = ebook.pdfStorageProvider === BLOB_PROVIDER;
    const pdfUrl = isBlobPdf
      ? ebook.pdfDownloadUrl || ebook.pdfUrl
      : (ebook.cloudinaryId && getPdfDownloadUrl(ebook.cloudinaryId)) ||
        ebook.pdfDownloadUrl ||
        ebook.pdfUrl;

    if (pdfUrl && pdfUrl.startsWith("http")) {
      return res.redirect(pdfUrl);
    }

    return res.status(404).json({ message: "PDF file not found" });
  } catch (error) {
    console.error("Failed to download ebook:", error);
    res.status(500).json({ message: "Failed to download ebook" });
  }
};

module.exports = {
  getEbooks,
  getEbookById,
  getEbookUploadSignature,
  handleEbookBlobUpload,
  cleanupEbookUploads,
  createEbook,
  updateEbook,
  deleteEbook,
  searchEbooks,
  downloadEbook,
};
