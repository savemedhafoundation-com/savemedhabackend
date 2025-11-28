const mongoose = require("mongoose");

const VALID_CATEGORIES = ["cancer", "kidney", "heart", "nerve", "spinal", "other"];

const commentSchema = new mongoose.Schema(
  {
    comment: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    imagePublicId: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: VALID_CATEGORIES,
    },
    writtenBy: {
      type: String,
      required: true,
      trim: true,
    },
    comments: [commentSchema],
  },
  { timestamps: true }
);

blogSchema.index({ title: "text", metadata: "text" });

module.exports = mongoose.model("Blog", blogSchema);
