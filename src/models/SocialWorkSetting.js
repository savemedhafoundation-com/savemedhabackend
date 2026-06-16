const mongoose = require("mongoose");

const socialWorkSettingSchema = new mongoose.Schema(
  {
    programTitle: {
      type: String,
      default: "Save Medha Foundation Student Social Work Certificate Program",
      trim: true,
    },
    adminEmail: { type: String, trim: true, lowercase: true },
    fee30Hours: { type: Number, default: 0, min: 0 },
    fee50Hours: { type: Number, default: 0, min: 0 },
    showFee: { type: Boolean, default: false },
    certificateSignatureName: { type: String, trim: true },
    certificateSignatureDesignation: { type: String, trim: true },
    certificateFooterText: { type: String, trim: true },
    registrationOpen: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SocialWorkSetting", socialWorkSettingSchema);
