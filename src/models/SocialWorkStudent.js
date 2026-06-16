const mongoose = require("mongoose");

const STUDENT_STATUSES = [
  "approved",
  "enrolled",
  "active",
  "completed",
  "certificate_issued",
  "inactive",
];

const socialWorkStudentSchema = new mongoose.Schema(
  {
    studentCode: { type: String, required: true, unique: true, index: true },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocialWorkApplication",
      required: true,
      unique: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    mobile: { type: String, required: true, trim: true },
    collegeName: { type: String, required: true, trim: true },
    courseDepartment: { type: String, required: true, trim: true },
    semesterYear: { type: String, required: true, trim: true },
    durationHours: { type: Number, required: true, enum: [30, 50] },
    assignedBatch: { type: mongoose.Schema.Types.ObjectId, ref: "SocialWorkBatch" },
    workArea: { type: String, trim: true },
    status: {
      type: String,
      enum: STUDENT_STATUSES,
      default: "approved",
      index: true,
    },
    conductStatus: {
      type: String,
      enum: ["satisfactory", "unsatisfactory", "pending"],
      default: "pending",
    },
    totalVerifiedHours: { type: Number, default: 0, min: 0 },
    attendancePercentage: { type: Number, default: 0, min: 0, max: 100 },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = {
  SocialWorkStudent: mongoose.model("SocialWorkStudent", socialWorkStudentSchema),
  STUDENT_STATUSES,
};
