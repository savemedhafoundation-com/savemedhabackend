const express = require("express");
const multer = require("multer");
const authMiddleware = require("../middlewares/authMiddleware");
const User = require("../models/User");
const {
  ADMIN_ROLES,
  createApplication,
  verifyCertificate,
  getStudentMe,
  submitReport,
  getStudentAttendance,
  getStudentCertificate,
  getAdminDashboard,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  approveStudent,
  getStudents,
  getStudentById,
  updateStudent,
  createBatch,
  getBatches,
  updateBatch,
  deleteBatch,
  assignStudentsToBatch,
  createAttendance,
  getAttendance,
  verifyAttendance,
  getReports,
  reviewReport,
  issueCertificate,
  getCertificates,
  revokeCertificate,
  exportApplications,
  exportStudents,
  exportCertificates,
} = require("../controllers/socialWorkController");

const router = express.Router();

const adminMiddleware = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("role");
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only PDF, JPG, JPEG, and PNG files are allowed"));
    }
    return cb(null, true);
  },
});

const applicationUploads = upload.fields([
  { name: "idProofFile", maxCount: 1 },
  { name: "collegeIdFile", maxCount: 1 },
  // Backward-compatible field names for existing public forms.
  { name: "idProof", maxCount: 1 },
  { name: "collegeIdProof", maxCount: 1 },
]);

const attendanceUploads = upload.fields([{ name: "proofFile", maxCount: 1 }]);
const reportUploads = upload.fields([
  { name: "reportFile", maxCount: 1 },
  { name: "report", maxCount: 1 },
]);

const adminOnly = [authMiddleware, adminMiddleware];

// Public
router.post("/applications", applicationUploads, createApplication);
router.get("/certificates/verify/:certificateId", verifyCertificate);

// Student protected
router.get("/student/me", authMiddleware, getStudentMe);
router.get("/students/me/dashboard", authMiddleware, getStudentMe);
router.post("/reports", authMiddleware, reportUploads, submitReport);
router.get("/student/attendance", authMiddleware, getStudentAttendance);
router.get("/student/certificate", authMiddleware, getStudentCertificate);

// Admin protected
router.get("/admin/dashboard", adminOnly, getAdminDashboard);
router.get("/applications", adminOnly, getApplications);
router.get("/applications/:id", adminOnly, getApplicationById);
router.patch("/applications/:id/status", adminOnly, updateApplicationStatus);
router.post("/students/approve/:applicationId", adminOnly, approveStudent);
router.get("/students", adminOnly, getStudents);
router.get("/students/export.csv", adminOnly, exportStudents);
router.get("/students/:id", adminOnly, getStudentById);
router.patch("/students/:id", adminOnly, updateStudent);
router.post("/batches", adminOnly, createBatch);
router.get("/batches", adminOnly, getBatches);
router.patch("/batches/:id", adminOnly, updateBatch);
router.delete("/batches/:id", adminOnly, deleteBatch);
router.post("/batches/:batchId/assign-students", adminOnly, assignStudentsToBatch);
router.post("/attendance", adminOnly, attendanceUploads, createAttendance);
router.get("/attendance", adminOnly, getAttendance);
router.get("/attendance/student/:studentId", adminOnly, (req, _res, next) => {
  req.query.student = req.params.studentId;
  next();
}, getAttendance);
router.patch("/attendance/:id/verify", adminOnly, verifyAttendance);
router.get("/reports", adminOnly, getReports);
router.patch("/reports/:id/review", adminOnly, reviewReport);
router.post("/certificates/issue/:studentId", adminOnly, issueCertificate);
router.get("/certificates", adminOnly, getCertificates);
router.patch("/certificates/:id/revoke", adminOnly, revokeCertificate);
router.get("/export/applications", adminOnly, exportApplications);
router.get("/export/students", adminOnly, exportStudents);
router.get("/export/certificates", adminOnly, exportCertificates);

module.exports = router;
