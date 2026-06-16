const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
    originalName: { type: String, trim: true },
    mimeType: { type: String, trim: true },
  },
  { _id: false }
);

const socialWorkAttendanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "SocialWorkStudent", required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "SocialWorkBatch" },
    activityDate: { type: Date, required: true },
    activityType: { type: String, required: true, trim: true },
    activityTitle: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    hoursCompleted: { type: Number, required: true, min: 0, max: 12 },
    supervisorName: { type: String, trim: true },
    proofFile: fileSchema,
    remarks: { type: String, trim: true },
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
      index: true,
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SocialWorkAttendance", socialWorkAttendanceSchema);
