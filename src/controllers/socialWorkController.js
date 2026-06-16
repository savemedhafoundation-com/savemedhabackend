const cloudinary = require("../config/cloudinary");
const sendEmail = require("../utils/sendEmail");
const User = require("../models/User");
const {
  SocialWorkApplication,
  COURSE_DURATIONS,
  APPLICATION_STATUSES,
} = require("../models/SocialWorkApplication");
const { SocialWorkStudent, STUDENT_STATUSES } = require("../models/SocialWorkStudent");
const SocialWorkBatch = require("../models/SocialWorkBatch");
const SocialWorkAttendance = require("../models/SocialWorkAttendance");
const SocialWorkReport = require("../models/SocialWorkReport");
const SocialWorkCertificate = require("../models/SocialWorkCertificate");
const SocialWorkSetting = require("../models/SocialWorkSetting");
const {
  generateApplicationId,
  generateStudentCode,
} = require("../utils/generateSocialWorkIds");
const {
  CERTIFICATE_DISCLAIMER,
  calculateCertificateEligibility,
  refreshStudentProgress,
  issueSocialWorkCertificate,
} = require("../services/socialWorkCertificateService");

const ADMIN_ROLES = ["admin", "superadmin", "administrator"];
const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeString = (value) =>
  typeof value === "string" ? value.trim().replace(/[<>]/g, "") : value;

const sanitizeBody = (body = {}) =>
  Object.fromEntries(Object.entries(body).map(([key, value]) => [key, sanitizeString(value)]));

const parseBoolean = (value) => value === true || `${value}`.toLowerCase() === "true";
const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const getFirstFile = (req, name) => req.files?.[name]?.[0] || null;

const handleControllerError = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, error);
  return res.status(error.statusCode || 500).json({
    message: error.message || fallbackMessage,
    eligibility: error.eligibility,
    certificate: error.certificate,
  });
};

const streamUpload = (file, folder) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (err, result) => {
        if (err) return reject(err);
        return resolve({
          url: result.secure_url,
          publicId: result.public_id,
          originalName: file.originalname,
          mimeType: file.mimetype,
        });
      }
    );
    uploadStream.end(file.buffer);
  });

const assertAdmin = async (req) => {
  const user = await User.findById(req.userId).select("role email firstName lastName");
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    const error = new Error("Admin access required");
    error.statusCode = 403;
    throw error;
  }
  return user;
};

const getAuthenticatedUser = async (req) => {
  const user = await User.findById(req.userId).select("email role firstName lastName");
  if (!user) {
    const error = new Error("Authenticated user not found");
    error.statusCode = 401;
    throw error;
  }
  return user;
};

const getStudentForUser = async (req) => {
  const user = await getAuthenticatedUser(req);
  const student = await SocialWorkStudent.findOne({
    $or: [{ userId: user._id }, { email: user.email }],
  }).populate("assignedBatch");

  if (!student) {
    const error = new Error("No social work student profile found for this login");
    error.statusCode = 404;
    throw error;
  }

  if (!student.userId) {
    student.userId = user._id;
    await student.save();
  }

  return student;
};

const ensureValidMobile = (value, fieldName) => {
  if (!MOBILE_RE.test(String(value || ""))) {
    const error = new Error(`${fieldName} must be a valid Indian 10-digit mobile number`);
    error.statusCode = 400;
    throw error;
  }
};

const ensureValidEmail = (value) => {
  if (!EMAIL_RE.test(String(value || ""))) {
    const error = new Error("Email must be valid");
    error.statusCode = 400;
    throw error;
  }
};

const calculateAge = (dob) => {
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
};

const normalizeApplicationPayload = (body) => {
  const clean = sanitizeBody(body);
  return {
    salutation: clean.salutation,
    fullName: clean.fullName || clean.studentName,
    dob: clean.dob || clean.dateOfBirth,
    age: clean.age ? Number(clean.age) : undefined,
    gender: clean.gender,
    collegeName: clean.collegeName,
    courseDepartment: clean.courseDepartment || clean.courseName,
    semesterYear: clean.semesterYear,
    mobile: clean.mobile || clean.phone,
    whatsapp: clean.whatsapp,
    email: clean.email,
    address: clean.address,
    guardianName: clean.guardianName,
    guardianContact: clean.guardianContact || clean.guardianPhone,
    emergencyContact: clean.emergencyContact || clean.guardianContact || clean.guardianPhone,
    preferredDuration: Number(clean.preferredDuration || clean.selectedDuration),
    preferredWorkArea:
      clean.preferredWorkArea ||
      clean.workArea ||
      toArray(clean.preferredWorkAreas)[0],
    availability: clean.availability || "To be discussed",
    consentAccepted: parseBoolean(clean.consentAccepted ?? clean.complianceAccepted),
    guardianConsentAccepted: parseBoolean(clean.guardianConsentAccepted),
  };
};

const validateApplicationPayload = (payload) => {
  const required = [
    "fullName",
    "dob",
    "gender",
    "collegeName",
    "courseDepartment",
    "semesterYear",
    "mobile",
    "email",
    "address",
    "emergencyContact",
    "preferredWorkArea",
    "availability",
  ];
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  ensureValidMobile(payload.mobile, "mobile");
  if (payload.whatsapp) ensureValidMobile(payload.whatsapp, "whatsapp");
  if (payload.guardianContact) ensureValidMobile(payload.guardianContact, "guardianContact");
  ensureValidMobile(payload.emergencyContact, "emergencyContact");
  ensureValidEmail(payload.email);

  if (!COURSE_DURATIONS.includes(payload.preferredDuration)) {
    const error = new Error("preferredDuration must be 30 or 50");
    error.statusCode = 400;
    throw error;
  }

  if (!payload.consentAccepted) {
    const error = new Error("consentAccepted must be true");
    error.statusCode = 400;
    throw error;
  }

  const age = payload.age ?? calculateAge(payload.dob);
  if (age === null || age < 0) {
    const error = new Error("dob must be valid");
    error.statusCode = 400;
    throw error;
  }
  payload.age = age;

  if (age < 18 && !payload.guardianConsentAccepted) {
    const error = new Error("guardianConsentAccepted is required for students below 18");
    error.statusCode = 400;
    throw error;
  }
};

const notify = (to, subject, html) => {
  if (!to) return;
  sendEmail(to, subject, html);
};

const getSettings = async () => {
  let settings = await SocialWorkSetting.findOne().sort({ createdAt: 1 });
  if (!settings) settings = await SocialWorkSetting.create({});
  return settings;
};

const createApplication = async (req, res) => {
  try {
    const settings = await getSettings();
    if (!settings.registrationOpen) {
      return res.status(403).json({ message: "Registration is currently closed" });
    }

    const payload = normalizeApplicationPayload(req.body);
    validateApplicationPayload(payload);

    const idProofRequestFile = getFirstFile(req, "idProofFile") || getFirstFile(req, "idProof");
    const collegeIdRequestFile = getFirstFile(req, "collegeIdFile") || getFirstFile(req, "collegeIdProof");
    const [idProofFile, collegeIdFile] = await Promise.all([
      idProofRequestFile
        ? streamUpload(idProofRequestFile, "savemedha/social-work/applications")
        : null,
      collegeIdRequestFile
        ? streamUpload(collegeIdRequestFile, "savemedha/social-work/applications")
        : null,
    ]);

    const application = await SocialWorkApplication.create({
      applicationId: await generateApplicationId(SocialWorkApplication),
      ...payload,
      idProofFile,
      collegeIdFile,
    });

    notify(
      application.email,
      "Save Medha Social Work application submitted",
      `<p>Dear ${application.fullName},</p><p>Your application ${application.applicationId} has been submitted.</p>`
    );
    notify(
      settings.adminEmail,
      "New Student Social Work application",
      `<p>New application received: <strong>${application.applicationId}</strong></p><p>${application.fullName} - ${application.email}</p>`
    );

    return res.status(201).json({
      message: "Application submitted successfully",
      applicationId: application.applicationId,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to create social work application");
  }
};

const getApplications = async (req, res) => {
  try {
    await assertAdmin(req);
    const applications = await SocialWorkApplication.find().sort({ createdAt: -1 });
    return res.json(applications);
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch applications");
  }
};

const getApplicationById = async (req, res) => {
  try {
    await assertAdmin(req);
    const application = await SocialWorkApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ message: "Application not found" });
    return res.json(application);
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch application");
  }
};

const updateApplicationStatus = async (req, res) => {
  try {
    const admin = await assertAdmin(req);
    const { status, adminNotes } = sanitizeBody(req.body);
    if (!APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid application status" });
    }
    const application = await SocialWorkApplication.findByIdAndUpdate(
      req.params.id,
      { status, adminNotes, reviewedBy: admin._id, reviewedAt: new Date() },
      { new: true }
    );
    if (!application) return res.status(404).json({ message: "Application not found" });
    return res.json(application);
  } catch (error) {
    return handleControllerError(res, error, "Failed to update application");
  }
};

const approveStudent = async (req, res) => {
  try {
    const admin = await assertAdmin(req);
    const application = await SocialWorkApplication.findById(req.params.applicationId);
    if (!application) return res.status(404).json({ message: "Application not found" });

    const existing = await SocialWorkStudent.findOne({ applicationId: application._id });
    if (existing) return res.status(409).json({ message: "Student already approved", student: existing });

    const student = await SocialWorkStudent.create({
      studentCode: await generateStudentCode(SocialWorkStudent),
      applicationId: application._id,
      fullName: application.fullName,
      email: application.email,
      mobile: application.mobile,
      collegeName: application.collegeName,
      courseDepartment: application.courseDepartment,
      semesterYear: application.semesterYear,
      durationHours: application.preferredDuration,
      workArea: application.preferredWorkArea,
      status: "approved",
      approvedBy: admin._id,
    });

    application.status = "converted_to_student";
    application.reviewedBy = admin._id;
    application.reviewedAt = new Date();
    await application.save();

    notify(
      student.email,
      "Save Medha Social Work application approved",
      `<p>Dear ${student.fullName},</p><p>Your application has been approved. Student Code: <strong>${student.studentCode}</strong>.</p>`
    );

    return res.status(201).json(student);
  } catch (error) {
    return handleControllerError(res, error, "Failed to approve student");
  }
};

const getStudents = async (req, res) => {
  try {
    await assertAdmin(req);
    const students = await SocialWorkStudent.find()
      .populate("assignedBatch", "batchCode batchName durationHours status")
      .sort({ createdAt: -1 });
    return res.json(students);
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch students");
  }
};

const getStudentById = async (req, res) => {
  try {
    await assertAdmin(req);
    await refreshStudentProgress(req.params.id);
    const [student, eligibility] = await Promise.all([
      SocialWorkStudent.findById(req.params.id).populate("assignedBatch"),
      calculateCertificateEligibility(req.params.id),
    ]);
    if (!student) return res.status(404).json({ message: "Student not found" });
    return res.json({ student, eligibility });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch student");
  }
};

const updateStudent = async (req, res) => {
  try {
    await assertAdmin(req);
    const body = sanitizeBody(req.body);
    const update = {};
    [
      "fullName",
      "email",
      "mobile",
      "collegeName",
      "courseDepartment",
      "semesterYear",
      "durationHours",
      "assignedBatch",
      "workArea",
      "status",
      "conductStatus",
    ].forEach((field) => {
      if (body[field] !== undefined) update[field] = body[field];
    });

    if (update.mobile) ensureValidMobile(update.mobile, "mobile");
    if (update.email) ensureValidEmail(update.email);
    if (update.durationHours) update.durationHours = Number(update.durationHours);
    if (update.durationHours && !COURSE_DURATIONS.includes(update.durationHours)) {
      return res.status(400).json({ message: "durationHours must be 30 or 50" });
    }
    if (update.status && !STUDENT_STATUSES.includes(update.status)) {
      return res.status(400).json({ message: "Invalid student status" });
    }

    const student = await SocialWorkStudent.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!student) return res.status(404).json({ message: "Student not found" });
    return res.json(student);
  } catch (error) {
    return handleControllerError(res, error, "Failed to update student");
  }
};

const createBatch = async (req, res) => {
  try {
    const admin = await assertAdmin(req);
    const body = sanitizeBody(req.body);
    const required = ["batchCode", "batchName", "durationHours", "startDate"];
    const missing = required.filter((field) => !body[field]);
    if (missing.length) return res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });

    if (body.coordinatorContact) ensureValidMobile(body.coordinatorContact, "coordinatorContact");
    const batch = await SocialWorkBatch.create({
      batchCode: body.batchCode,
      batchName: body.batchName,
      durationHours: Number(body.durationHours),
      startDate: body.startDate,
      endDate: body.endDate,
      mode: body.mode,
      venue: body.venue,
      coordinatorName: body.coordinatorName,
      coordinatorContact: body.coordinatorContact,
      maxStudents: body.maxStudents ? Number(body.maxStudents) : 0,
      status: body.status,
      createdBy: admin._id,
    });
    return res.status(201).json(batch);
  } catch (error) {
    return handleControllerError(res, error, "Failed to create batch");
  }
};

const getBatches = async (req, res) => {
  try {
    await assertAdmin(req);
    const batches = await SocialWorkBatch.find()
      .populate("students", "studentCode fullName email mobile")
      .sort({ createdAt: -1 });
    return res.json(batches);
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch batches");
  }
};

const updateBatch = async (req, res) => {
  try {
    await assertAdmin(req);
    const body = sanitizeBody(req.body);
    if (body.durationHours) body.durationHours = Number(body.durationHours);
    if (body.maxStudents) body.maxStudents = Number(body.maxStudents);
    const batch = await SocialWorkBatch.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    return res.json(batch);
  } catch (error) {
    return handleControllerError(res, error, "Failed to update batch");
  }
};

const deleteBatch = async (req, res) => {
  try {
    await assertAdmin(req);
    const batch = await SocialWorkBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    await SocialWorkStudent.updateMany({ assignedBatch: batch._id }, { $unset: { assignedBatch: "" } });
    await batch.deleteOne();
    return res.json({ message: "Batch deleted" });
  } catch (error) {
    return handleControllerError(res, error, "Failed to delete batch");
  }
};

const assignStudentsToBatch = async (req, res) => {
  try {
    await assertAdmin(req);
    const studentIds = toArray(req.body.studentIds);
    const batch = await SocialWorkBatch.findById(req.params.batchId);
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    if (batch.maxStudents && batch.students.length + studentIds.length > batch.maxStudents) {
      return res.status(400).json({ message: "Batch maximum student limit exceeded" });
    }

    await SocialWorkStudent.updateMany(
      { _id: { $in: studentIds } },
      { assignedBatch: batch._id, status: "enrolled" }
    );
    batch.students = Array.from(new Set([...batch.students.map(String), ...studentIds]));
    await batch.save();

    const students = await SocialWorkStudent.find({ _id: { $in: studentIds } });
    students.forEach((student) =>
      notify(
        student.email,
        "Save Medha Social Work batch assigned",
        `<p>Dear ${student.fullName},</p><p>You have been assigned to batch ${batch.batchCode}.</p>`
      )
    );

    return res.json(batch);
  } catch (error) {
    return handleControllerError(res, error, "Failed to assign students");
  }
};

const createAttendance = async (req, res) => {
  try {
    const admin = await assertAdmin(req);
    const body = sanitizeBody(req.body);
    const studentId = body.student || body.studentId;
    const student = await SocialWorkStudent.findById(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const proofUpload = getFirstFile(req, "proofFile")
      ? await streamUpload(getFirstFile(req, "proofFile"), "savemedha/social-work/attendance")
      : null;
    const verificationStatus = body.verificationStatus || "verified";
    const attendance = await SocialWorkAttendance.create({
      student: student._id,
      batch: body.batch || student.assignedBatch,
      activityDate: body.activityDate,
      activityType: body.activityType,
      activityTitle: body.activityTitle,
      location: body.location,
      hoursCompleted: Number(body.hoursCompleted),
      supervisorName: body.supervisorName,
      proofFile: proofUpload,
      remarks: body.remarks,
      verificationStatus,
      verifiedBy: verificationStatus === "verified" ? admin._id : undefined,
      verifiedAt: verificationStatus === "verified" ? new Date() : undefined,
    });
    await refreshStudentProgress(student._id);
    return res.status(201).json(attendance);
  } catch (error) {
    return handleControllerError(res, error, "Failed to create attendance");
  }
};

const getAttendance = async (req, res) => {
  try {
    await assertAdmin(req);
    const filter = {};
    if (req.query.student) filter.student = req.query.student;
    if (req.query.batch) filter.batch = req.query.batch;
    const attendance = await SocialWorkAttendance.find(filter)
      .populate("student", "studentCode fullName email")
      .populate("batch", "batchCode batchName")
      .sort({ activityDate: -1 });
    return res.json(attendance);
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch attendance");
  }
};

const verifyAttendance = async (req, res) => {
  try {
    const admin = await assertAdmin(req);
    const { verificationStatus = "verified", remarks } = sanitizeBody(req.body);
    if (!["verified", "rejected"].includes(verificationStatus)) {
      return res.status(400).json({ message: "verificationStatus must be verified or rejected" });
    }
    const attendance = await SocialWorkAttendance.findByIdAndUpdate(
      req.params.id,
      { verificationStatus, remarks, verifiedBy: admin._id, verifiedAt: new Date() },
      { new: true }
    );
    if (!attendance) return res.status(404).json({ message: "Attendance not found" });
    await refreshStudentProgress(attendance.student);
    return res.json(attendance);
  } catch (error) {
    return handleControllerError(res, error, "Failed to verify attendance");
  }
};

const submitReport = async (req, res) => {
  try {
    const student = await getStudentForUser(req);
    const body = sanitizeBody(req.body);
    if (!body.reportTitle && !body.title) return res.status(400).json({ message: "reportTitle is required" });

    const reportRequestFile = getFirstFile(req, "reportFile") || getFirstFile(req, "report");
    const reportUpload = reportRequestFile
      ? await streamUpload(reportRequestFile, "savemedha/social-work/reports")
      : null;

    const report = await SocialWorkReport.create({
      student: student._id,
      batch: student.assignedBatch,
      reportTitle: body.reportTitle || body.title,
      reportFile: reportUpload,
      submittedAt: new Date(),
    });
    return res.status(201).json(report);
  } catch (error) {
    return handleControllerError(res, error, "Failed to submit report");
  }
};

const getReports = async (req, res) => {
  try {
    await assertAdmin(req);
    const reports = await SocialWorkReport.find()
      .populate("student", "studentCode fullName email")
      .populate("batch", "batchCode batchName")
      .sort({ createdAt: -1 });
    return res.json(reports);
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch reports");
  }
};

const reviewReport = async (req, res) => {
  try {
    const admin = await assertAdmin(req);
    const { reviewStatus, reviewNotes } = sanitizeBody(req.body);
    if (!["approved", "rejected"].includes(reviewStatus)) {
      return res.status(400).json({ message: "reviewStatus must be approved or rejected" });
    }
    const report = await SocialWorkReport.findByIdAndUpdate(
      req.params.id,
      { reviewStatus, reviewNotes, reviewedBy: admin._id, reviewedAt: new Date() },
      { new: true }
    ).populate("student");
    if (!report) return res.status(404).json({ message: "Report not found" });

    notify(
      report.student?.email,
      `Save Medha Social Work report ${reviewStatus}`,
      `<p>Dear ${report.student?.fullName || "Student"},</p><p>Your final report has been ${reviewStatus}.</p>`
    );

    return res.json(report);
  } catch (error) {
    return handleControllerError(res, error, "Failed to review report");
  }
};

const issueCertificate = async (req, res) => {
  try {
    const admin = await assertAdmin(req);
    const result = await issueSocialWorkCertificate({
      studentId: req.params.studentId,
      issuedBy: admin._id,
    });
    const student = await SocialWorkStudent.findById(req.params.studentId);
    notify(
      student?.email,
      "Save Medha Social Work certificate issued",
      `<p>Dear ${student?.fullName || "Student"},</p><p>Your certificate has been issued: <strong>${result.certificate.certificateId}</strong>.</p><p>${CERTIFICATE_DISCLAIMER}</p>`
    );
    return res.status(201).json(result);
  } catch (error) {
    return handleControllerError(res, error, "Failed to issue certificate");
  }
};

const getCertificates = async (req, res) => {
  try {
    await assertAdmin(req);
    const certificates = await SocialWorkCertificate.find()
      .populate("student", "studentCode fullName email mobile collegeName")
      .populate("batch", "batchCode batchName")
      .sort({ issueDate: -1 });
    return res.json(certificates);
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch certificates");
  }
};

const revokeCertificate = async (req, res) => {
  try {
    const admin = await assertAdmin(req);
    const certificate = await SocialWorkCertificate.findByIdAndUpdate(
      req.params.id,
      {
        certificateStatus: "revoked",
        revokedBy: admin._id,
        revokedAt: new Date(),
        revokeReason: sanitizeString(req.body.revokeReason),
      },
      { new: true }
    );
    if (!certificate) return res.status(404).json({ message: "Certificate not found" });
    return res.json(certificate);
  } catch (error) {
    return handleControllerError(res, error, "Failed to revoke certificate");
  }
};

const verifyCertificate = async (req, res) => {
  try {
    const certificate = await SocialWorkCertificate.findOne({
      certificateId: req.params.certificateId,
      certificateStatus: "issued",
    })
      .populate("student", "fullName")
      .populate("batch", "batchCode batchName");

    if (!certificate) {
      return res.status(404).json({ verified: false, message: "Certificate not verified" });
    }

    return res.json({
      verified: true,
      studentName: certificate.student?.fullName,
      certificateId: certificate.certificateId,
      programName: "Save Medha Foundation Student Social Work Certificate Program",
      duration: `${certificate.durationHours} Hours`,
      batchCode: certificate.batch?.batchCode,
      issueDate: certificate.issueDate,
      organization: "Save Medha Foundation",
      disclaimer: CERTIFICATE_DISCLAIMER,
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to verify certificate");
  }
};

const getStudentMe = async (req, res) => {
  try {
    const student = await getStudentForUser(req);
    const [attendance, reports, certificate, eligibility] = await Promise.all([
      SocialWorkAttendance.find({ student: student._id }).sort({ activityDate: -1 }),
      SocialWorkReport.find({ student: student._id }).sort({ createdAt: -1 }),
      SocialWorkCertificate.findOne({ student: student._id, certificateStatus: "issued" }),
      calculateCertificateEligibility(student._id),
    ]);
    return res.json({ student, attendance, reports, certificate, eligibility });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch student profile");
  }
};

const getStudentAttendance = async (req, res) => {
  try {
    const student = await getStudentForUser(req);
    const attendance = await SocialWorkAttendance.find({ student: student._id }).sort({ activityDate: -1 });
    return res.json(attendance);
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch student attendance");
  }
};

const getStudentCertificate = async (req, res) => {
  try {
    const student = await getStudentForUser(req);
    const certificate = await SocialWorkCertificate.findOne({
      student: student._id,
      certificateStatus: "issued",
    }).populate("batch", "batchCode batchName");
    if (!certificate) return res.status(404).json({ message: "Certificate not issued" });
    return res.json(certificate);
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch student certificate");
  }
};

const getAdminDashboard = async (req, res) => {
  try {
    await assertAdmin(req);
    const [
      applications,
      underReviewApplications,
      students,
      batches,
      pendingReports,
      issuedCertificates,
      verifiedAttendance,
    ] = await Promise.all([
      SocialWorkApplication.countDocuments(),
      SocialWorkApplication.countDocuments({ status: "under_review" }),
      SocialWorkStudent.countDocuments(),
      SocialWorkBatch.countDocuments(),
      SocialWorkReport.countDocuments({ reviewStatus: "pending" }),
      SocialWorkCertificate.countDocuments({ certificateStatus: "issued" }),
      SocialWorkAttendance.find({ verificationStatus: "verified" }).select("hoursCompleted"),
    ]);
    return res.json({
      applications,
      underReviewApplications,
      students,
      batches,
      pendingReports,
      issuedCertificates,
      verifiedHours: verifiedAttendance.reduce((sum, item) => sum + Number(item.hoursCompleted || 0), 0),
    });
  } catch (error) {
    return handleControllerError(res, error, "Failed to fetch dashboard");
  }
};

const sendCsv = (res, filename, rows) => {
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  return res.send(csv);
};

const exportApplications = async (req, res) => {
  try {
    await assertAdmin(req);
    const applications = await SocialWorkApplication.find().sort({ createdAt: -1 });
    return sendCsv(res, "social-work-applications.csv", [
      ["Application ID", "Full Name", "Email", "Mobile", "College", "Duration", "Status", "Created At"],
      ...applications.map((item) => [
        item.applicationId,
        item.fullName,
        item.email,
        item.mobile,
        item.collegeName,
        item.preferredDuration,
        item.status,
        item.createdAt,
      ]),
    ]);
  } catch (error) {
    return handleControllerError(res, error, "Failed to export applications");
  }
};

const exportStudents = async (req, res) => {
  try {
    await assertAdmin(req);
    const students = await SocialWorkStudent.find().populate("assignedBatch", "batchCode").sort({ createdAt: -1 });
    return sendCsv(res, "social-work-students.csv", [
      ["Student Code", "Full Name", "Email", "Mobile", "College", "Duration", "Batch", "Status", "Verified Hours", "Attendance %"],
      ...students.map((item) => [
        item.studentCode,
        item.fullName,
        item.email,
        item.mobile,
        item.collegeName,
        item.durationHours,
        item.assignedBatch?.batchCode,
        item.status,
        item.totalVerifiedHours,
        item.attendancePercentage,
      ]),
    ]);
  } catch (error) {
    return handleControllerError(res, error, "Failed to export students");
  }
};

const exportCertificates = async (req, res) => {
  try {
    await assertAdmin(req);
    const certificates = await SocialWorkCertificate.find()
      .populate("student", "fullName email")
      .populate("batch", "batchCode")
      .sort({ issueDate: -1 });
    return sendCsv(res, "social-work-certificates.csv", [
      ["Certificate ID", "Student", "Email", "Duration", "Batch", "Status", "Issue Date"],
      ...certificates.map((item) => [
        item.certificateId,
        item.student?.fullName,
        item.student?.email,
        item.durationHours,
        item.batch?.batchCode,
        item.certificateStatus,
        item.issueDate,
      ]),
    ]);
  } catch (error) {
    return handleControllerError(res, error, "Failed to export certificates");
  }
};

module.exports = {
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
};
