const mongoose = require("mongoose");

const COURSE_DURATIONS = [30, 50];
const APPLICATION_STATUSES = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "converted_to_student",
];

const fileSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
  },
  { _id: false }
);

const socialWorkApplicationSchema = new mongoose.Schema(
  {
    applicationId: { type: String, required: true, unique: true, index: true },
    salutation: { type: String, trim: true },
    fullName: { type: String, required: true, trim: true },
    dob: { type: Date, required: true },
    age: { type: Number, min: 0 },
    gender: { type: String, required: true, trim: true },
    collegeName: { type: String, required: true, trim: true },
    courseDepartment: { type: String, required: true, trim: true },
    semesterYear: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    address: { type: String, required: true, trim: true },
    guardianName: { type: String, trim: true },
    guardianContact: { type: String, trim: true },
    emergencyContact: { type: String, required: true, trim: true },
    preferredDuration: { type: Number, required: true, enum: COURSE_DURATIONS },
    preferredWorkArea: { type: String, required: true, trim: true },
    availability: { type: String, required: true, trim: true },
    idProofFile: fileSchema,
    collegeIdFile: fileSchema,
    consentAccepted: { type: Boolean, required: true, default: false },
    guardianConsentAccepted: { type: Boolean, default: false },
    status: {
      type: String,
      enum: APPLICATION_STATUSES,
      default: "submitted",
      index: true,
    },
    adminNotes: { type: String, trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = {
  SocialWorkApplication: mongoose.model("SocialWorkApplication", socialWorkApplicationSchema),
  COURSE_DURATIONS,
  APPLICATION_STATUSES,
};
