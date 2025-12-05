const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  deleteJob,
} = require("../controllers/jobController");
const { applyToJob } = require("../controllers/jobApplicationController");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "../../uploads/resumes");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "_");
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF resumes are allowed"));
    }
    cb(null, true);
  },
});

// Public endpoints
router.get("/", getJobs);
router.get("/:id", getJobById);

// Protected endpoints for job CRUD
router.post("/", authMiddleware, createJob);
router.put("/:id", authMiddleware, updateJob);
router.delete("/:id", authMiddleware, deleteJob);

// Public apply endpoint with resume upload (accepts "cv" or "file" field)
router.post(
  "/:id/apply",
  upload.fields([
    { name: "cv", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  applyToJob
);

module.exports = router;
