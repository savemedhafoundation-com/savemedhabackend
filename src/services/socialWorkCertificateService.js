const crypto = require("crypto");
const SocialWorkAttendance = require("../models/SocialWorkAttendance");
const SocialWorkBatch = require("../models/SocialWorkBatch");
const SocialWorkCertificate = require("../models/SocialWorkCertificate");
const SocialWorkReport = require("../models/SocialWorkReport");
const { SocialWorkStudent } = require("../models/SocialWorkStudent");
const { generateCertificateId } = require("../utils/generateSocialWorkIds");

const CERTIFICATE_TEXT =
  "Successfully completed 30/50 hours of Social Work & Community Health Awareness Program under Save Medha Foundation.";
const CERTIFICATE_DISCLAIMER =
  "This certificate confirms completion of social work and community health awareness hours under Save Medha Foundation. It does not authorize medical diagnosis, treatment, or clinical practice.";

const getFrontendUrl = () =>
  (process.env.FRONTEND_URL || process.env.CLIENT_URL || "https://savemedha.com").replace(/\/$/, "");

const calculateAttendancePercentage = (verifiedCount, totalCount) => {
  if (!totalCount) return 0;
  return Math.round((verifiedCount / totalCount) * 100);
};

const refreshStudentProgress = async (studentId) => {
  const attendance = await SocialWorkAttendance.find({ student: studentId }).select(
    "hoursCompleted verificationStatus"
  );
  const verified = attendance.filter((item) => item.verificationStatus === "verified");
  const totalVerifiedHours = verified.reduce((sum, item) => sum + Number(item.hoursCompleted || 0), 0);
  const attendancePercentage = calculateAttendancePercentage(verified.length, attendance.length);

  const student = await SocialWorkStudent.findByIdAndUpdate(
    studentId,
    { totalVerifiedHours, attendancePercentage },
    { new: true }
  ).populate("assignedBatch");

  return { student, totalVerifiedHours, attendancePercentage };
};

const calculateCertificateEligibility = async (studentId) => {
  const { student, totalVerifiedHours, attendancePercentage } = await refreshStudentProgress(studentId);
  if (!student) {
    return { eligible: false, reasons: ["Student not found"] };
  }

  const approvedReport = await SocialWorkReport.findOne({
    student: student._id,
    reviewStatus: "approved",
  });

  const reasons = [];
  if (![30, 50].includes(Number(student.durationHours))) {
    reasons.push("Duration must be 30 or 50 hours");
  }
  if (totalVerifiedHours < Number(student.durationHours || 0)) {
    reasons.push("Verified attendance hours are below selected duration");
  }
  if (attendancePercentage < 80) {
    reasons.push("Attendance percentage is below 80%");
  }
  if (!approvedReport) {
    reasons.push("Final report is not approved");
  }
  if (student.conductStatus !== "satisfactory") {
    reasons.push("Conduct status is not satisfactory");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    durationHours: student.durationHours,
    totalVerifiedHours,
    attendancePercentage,
    finalReportApproved: Boolean(approvedReport),
    conductStatus: student.conductStatus,
    student,
  };
};

const buildVerificationUrl = (certificateId) =>
  `${getFrontendUrl()}/student-social-work/verify/${certificateId}`;

const buildQrCodeUrl = (certificateId) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    buildVerificationUrl(certificateId)
  )}`;

const issueSocialWorkCertificate = async ({ studentId, issuedBy }) => {
  const eligibility = await calculateCertificateEligibility(studentId);
  if (!eligibility.eligible) {
    const error = new Error("Student is not eligible for certificate issue");
    error.statusCode = 400;
    error.eligibility = eligibility;
    throw error;
  }

  const existing = await SocialWorkCertificate.findOne({
    student: studentId,
    certificateStatus: { $ne: "revoked" },
  });
  if (existing) {
    const error = new Error("Certificate already issued");
    error.statusCode = 409;
    error.certificate = existing;
    throw error;
  }

  const student = eligibility.student;
  const batch = student.assignedBatch
    ? await SocialWorkBatch.findById(student.assignedBatch)
    : null;
  const certificateId = await generateCertificateId(SocialWorkCertificate);
  const verificationToken = crypto
    .createHash("sha256")
    .update(`${certificateId}:${student._id}:${Date.now()}`)
    .digest("hex");

  const certificate = await SocialWorkCertificate.create({
    certificateId,
    student: student._id,
    batch: batch?._id || student.assignedBatch,
    durationHours: student.durationHours,
    verificationToken,
    certificatePdfUrl: buildVerificationUrl(certificateId),
    qrCodeUrl: buildQrCodeUrl(certificateId),
    issuedBy,
  });

  student.status = "certificate_issued";
  await student.save();

  return {
    certificate,
    certificateText: CERTIFICATE_TEXT.replace("30/50", String(student.durationHours)),
    certificateDisclaimer: CERTIFICATE_DISCLAIMER,
  };
};

module.exports = {
  CERTIFICATE_TEXT,
  CERTIFICATE_DISCLAIMER,
  calculateCertificateEligibility,
  refreshStudentProgress,
  issueSocialWorkCertificate,
  buildVerificationUrl,
  buildQrCodeUrl,
};
