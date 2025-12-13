const mongoose = require("mongoose");

const countSchema = new mongoose.Schema(
  {
    membersCount: { type: Number, default: 300, min: 0 },
    citiesCount: { type: Number, default: 5, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Count", countSchema);
