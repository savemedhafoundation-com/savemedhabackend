const mongoose = require("mongoose");

const socialWorkCertificateSchema = new mongoose.Schema(
  {
    certificateId: { type: String, required: true, unique: true, trim: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "SocialWorkStudent", required: true, unique: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "SocialWorkBatch" },
    durationHours: { type: Number, required: true, enum: [30, 50] },
    issueDate: { type: Date, default: Date.now },
    certificateStatus: {
      type: String,
      enum: ["issued", "revoked"],
      default: "issued",
      index: true,
    },
    verificationToken: { type: String, required: true, unique: true, index: true },
    certificatePdfUrl: { type: String, trim: true },
    qrCodeUrl: { type: String, trim: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    revokedAt: { type: Date },
    revokeReason: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SocialWorkCertificate", socialWorkCertificateSchema);
