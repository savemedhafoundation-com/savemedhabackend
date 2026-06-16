const mongoose = require("mongoose");

const socialWorkBatchSchema = new mongoose.Schema(
  {
    batchCode: { type: String, required: true, unique: true, trim: true, index: true },
    batchName: { type: String, required: true, trim: true },
    durationHours: { type: Number, required: true, enum: [30, 50] },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    mode: { type: String, enum: ["offline", "online", "hybrid"], default: "offline" },
    venue: { type: String, trim: true },
    coordinatorName: { type: String, trim: true },
    coordinatorContact: { type: String, trim: true },
    maxStudents: { type: Number, default: 0, min: 0 },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "SocialWorkStudent" }],
    status: {
      type: String,
      enum: ["upcoming", "active", "completed", "cancelled"],
      default: "upcoming",
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SocialWorkBatch", socialWorkBatchSchema);
