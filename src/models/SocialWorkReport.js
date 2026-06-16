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

const socialWorkReportSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "SocialWorkStudent", required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "SocialWorkBatch" },
    reportTitle: { type: String, required: true, trim: true },
    reportFile: fileSchema,
    submittedAt: { type: Date, default: Date.now },
    reviewStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewNotes: { type: String, trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SocialWorkReport", socialWorkReportSchema);
