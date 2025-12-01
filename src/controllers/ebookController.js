const fs = require("fs");
const path = require("path");
const Ebook = require("../models/Ebook");

const UPLOAD_DIR = path.join(__dirname, "../../uploads/ebooks");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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

const uploadPdf = (file) => {
  return {
    pdfUrl: `/uploads/ebooks/${file.filename}`,
    cloudinaryId: file.filename,
  };
};

const removeStoredPdf = async (filename) => {
  if (!filename) return;
  const fullPath = path.join(UPLOAD_DIR, filename);
  try {
    await fs.promises.unlink(fullPath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Failed to delete PDF file:", err);
    }
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
  try {
    const { title, description } = req.body;
    const authors = normalizeArray(req.body.authors);
    const tags = normalizeArray(req.body.tags);

    if (!title || !description) {
      return res.status(400).json({ message: "Title and description are required" });
    }

    const pdfFile = getUploadedPdf(req);
    if (!pdfFile) {
      return res.status(400).json({ message: "PDF file is required" });
    }

    const { pdfUrl, cloudinaryId } = uploadPdf(pdfFile);

    const ebook = await Ebook.create({
      title,
      description,
      authors,
      tags,
      pdfUrl,
      cloudinaryId,
    });

    res.status(201).json(ebook);
  } catch (error) {
    console.error("Failed to create ebook:", error);
    res.status(500).json({ message: "Failed to create ebook" });
  }
};

const updateEbook = async (req, res) => {
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

    const pdfFile = getUploadedPdf(req);
    if (pdfFile) {
      const { pdfUrl, cloudinaryId } = uploadPdf(pdfFile);

      if (ebook.cloudinaryId) {
        await removeStoredPdf(ebook.cloudinaryId);
      }

      ebook.pdfUrl = pdfUrl;
      ebook.cloudinaryId = cloudinaryId;
    }

    await ebook.save();
    res.status(200).json(ebook);
  } catch (error) {
    console.error("Failed to update ebook:", error);
    res.status(500).json({ message: "Failed to update ebook" });
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

    const fileName = ebook.cloudinaryId;
    const filePath = path.join(UPLOAD_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "PDF file not found" });
    }

    const downloadName = ebook.title ? `${ebook.title}.pdf` : fileName;
    return res.download(filePath, downloadName);
  } catch (error) {
    console.error("Failed to download ebook:", error);
    res.status(500).json({ message: "Failed to download ebook" });
  }
};

module.exports = {
  getEbooks,
  getEbookById,
  createEbook,
  updateEbook,
  deleteEbook,
  searchEbooks,
  downloadEbook,
};
