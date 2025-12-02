const Treatment = require("../models/Treatment");
const cloudinary = require("../config/cloudinary");

const uploadImage = async (file) => {
  const base64Image = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

  const uploadResult = await cloudinary.uploader.upload(base64Image, {
    folder: "savemedha/treatments",
    resource_type: "auto",
  });

  return {
    imageUrl: uploadResult.secure_url,
    imagePublicId: uploadResult.public_id,
  };
};

const getTreatments = async (_req, res) => {
  try {
    const treatments = await Treatment.find().sort({ createdAt: -1 });
    res.status(200).json(treatments);
  } catch (error) {
    console.error("Failed to fetch treatments:", error);
    res.status(500).json({ message: "Failed to fetch treatments" });
  }
};

const getTreatmentById = async (req, res) => {
  try {
    const treatment = await Treatment.findById(req.params.id);

    if (!treatment) {
      return res.status(404).json({ message: "Treatment not found" });
    }

    res.status(200).json(treatment);
  } catch (error) {
    console.error("Failed to fetch treatment:", error);
    res.status(500).json({ message: "Failed to fetch treatment" });
  }
};

const createTreatment = async (req, res) => {
  try {
    const title = req.body.title?.trim();
    const colorCode = req.body.colorCode?.trim();

    if (!title || !colorCode) {
      return res.status(400).json({ message: "Title and colorCode are required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const { imageUrl, imagePublicId } = await uploadImage(req.file);

    const treatment = await Treatment.create({
      title,
      colorCode,
      image: imageUrl,
      imagePublicId,
    });

    res.status(201).json(treatment);
  } catch (error) {
    console.error("Failed to create treatment:", error);
    res.status(500).json({ message: "Failed to create treatment" });
  }
};

const updateTreatment = async (req, res) => {
  try {
    const treatment = await Treatment.findById(req.params.id);

    if (!treatment) {
      return res.status(404).json({ message: "Treatment not found" });
    }

    const title = req.body.title?.trim();
    const colorCode = req.body.colorCode?.trim();

    if (title !== undefined) {
      if (!title) {
        return res.status(400).json({ message: "Title cannot be empty" });
      }
      treatment.title = title;
    }

    if (colorCode !== undefined) {
      if (!colorCode) {
        return res.status(400).json({ message: "colorCode cannot be empty" });
      }
      treatment.colorCode = colorCode;
    }

    if (req.file) {
      const { imageUrl, imagePublicId } = await uploadImage(req.file);

      if (treatment.imagePublicId) {
        await cloudinary.uploader.destroy(treatment.imagePublicId);
      }

      treatment.image = imageUrl;
      treatment.imagePublicId = imagePublicId;
    }

    await treatment.save();
    res.status(200).json(treatment);
  } catch (error) {
    console.error("Failed to update treatment:", error);
    res.status(500).json({ message: "Failed to update treatment" });
  }
};

const deleteTreatment = async (req, res) => {
  try {
    const treatment = await Treatment.findById(req.params.id);

    if (!treatment) {
      return res.status(404).json({ message: "Treatment not found" });
    }

    if (treatment.imagePublicId) {
      await cloudinary.uploader.destroy(treatment.imagePublicId);
    }

    await treatment.deleteOne();
    res.status(200).json({ message: "Treatment deleted" });
  } catch (error) {
    console.error("Failed to delete treatment:", error);
    res.status(500).json({ message: "Failed to delete treatment" });
  }
};

module.exports = {
  getTreatments,
  getTreatmentById,
  createTreatment,
  updateTreatment,
  deleteTreatment,
};
