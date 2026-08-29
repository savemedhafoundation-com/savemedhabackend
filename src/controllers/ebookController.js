const { Readable } = require("stream");
const Ebook = require("../models/Ebook");
const cloudinary = require("../config/cloudinary");
const {
  createEbookUploadSignature: buildEbookUploadSignature,
  inspectEbookUpload,
  removeEbookUpload,
  verifyEbookUpload,
} = require("../services/ebookAssetService");

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
  };
};

const removeStoredPdf = async (filename) => {
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

const getDirectAsset = (req, fieldName) => {
  const asset = req.body?.[fieldName];
  return asset && typeof asset === "object" ? asset : null;
};

const resolvePdfAsset = async (req) => {
  const file = getUploadedPdf(req);
  if (file) return uploadPdf(file);

  const directAsset = getDirectAsset(req, "pdfAsset");
  if (!directAsset) return null;

  const verified = await inspectEbookUpload(directAsset, "pdf");
  return {
    pdfUrl: getPdfDownloadUrl(verified.publicId) || verified.secureUrl,
    cloudinaryId: verified.publicId,
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

const cleanupResolvedAssets = async (pdfAsset, imageAsset) => {
  await Promise.all([
    removeStoredPdf(pdfAsset?.cloudinaryId),
    removeStoredImage(imageAsset?.imagePublicId),
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

const cleanupEbookUploads = async (req, res) => {
  try {
    const assets = req.body?.assets;
    if (!Array.isArray(assets) || assets.length === 0 || assets.length > 2) {
      return res.status(400).json({ message: "One or two uploaded assets are required" });
    }

    await Promise.all(
      assets.map(async ({ asset, kind }) => {
        const verified = verifyEbookUpload(asset, kind);
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

    const oldPdfId = ebook.cloudinaryId;
    const oldImageId = ebook.imagePublicId;
    const resolved = await resolveRequestedAssets(req);
    newPdfAsset = resolved.pdfAsset;
    newImageAsset = resolved.imageAsset;

    if (newPdfAsset) {
      ebook.pdfUrl = newPdfAsset.pdfUrl;
      ebook.cloudinaryId = newPdfAsset.cloudinaryId;
    }

    if (newImageAsset) {
      ebook.imageUrl = newImageAsset.imageUrl;
      ebook.imagePublicId = newImageAsset.imagePublicId;
    }

    await ebook.save();
    persisted = true;

    await Promise.all([
      newPdfAsset && oldPdfId !== newPdfAsset.cloudinaryId ? removeStoredPdf(oldPdfId) : null,
      newImageAsset && oldImageId !== newImageAsset.imagePublicId ? removeStoredImage(oldImageId) : null,
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

    if (ebook.cloudinaryId) {
      await removeStoredPdf(ebook.cloudinaryId);
    }

    await removeStoredImage(ebook.imagePublicId);

    await ebook.deleteOne();
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

    const pdfUrl = (ebook.cloudinaryId && getPdfDownloadUrl(ebook.cloudinaryId)) || ebook.pdfUrl;

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
  cleanupEbookUploads,
  createEbook,
  updateEbook,
  deleteEbook,
  searchEbooks,
  downloadEbook,
};
