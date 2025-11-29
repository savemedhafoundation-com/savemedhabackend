const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cloudinary = require("../config/cloudinary");
const User = require("../models/User");

const { JWT_SECRET } = process.env;

const ensureJwtConfigured = () => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET not configured");
  }
};

const generateToken = (userId) => {
  ensureJwtConfigured();
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
};

const uploadUserImage = async (file) => {
  const base64Image = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  const uploadResult = await cloudinary.uploader.upload(base64Image, {
    folder: "savemedha/users",
    resource_type: "auto",
  });

  return {
    imageUrl: uploadResult.secure_url,
    imagePublicId: uploadResult.public_id,
  };
};

const registerUser = async (req, res) => {
  try {
    ensureJwtConfigured();

    const {
      firstName,
      lastName,
      phoneNumber,
      email,
      address,
      designation,
      password,
    } = req.body;

    if (!firstName || !lastName || !phoneNumber || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    let uploadedImage;
    if (req.file) {
      uploadedImage = await uploadUserImage(req.file);
    }

    const user = await User.create({
      firstName,
      lastName,
      phoneNumber,
      email,
      address,
      designation,
      userImage: uploadedImage?.imageUrl,
      userImagePublicId: uploadedImage?.imagePublicId,
      password,
    });

    const token = generateToken(user._id);
    return res.status(201).json({ user, token });
  } catch (error) {
    console.error("Failed to register user:", error);
    return res.status(500).json({ message: "Failed to register user" });
  }
};

const loginUser = async (req, res) => {
  try {
    ensureJwtConfigured();

    const { email, password } = req.body;
    console.log("dfvnfvk",email,password);
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user._id);
    return res.status(200).json({ user, token });
  } catch (error) {
    console.error("Failed to login:", error);
    return res.status(500).json({ message: "Failed to login" });
  }
};

const getUsers = async (_req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    return res.status(200).json(users);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return res.status(500).json({ message: "Failed to fetch users" });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.status(200).json(user);
  } catch (error) {
    console.error("Failed to fetch user:", error);
    return res.status(500).json({ message: "Failed to fetch user" });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.file) {
      if (user.userImagePublicId) {
        await cloudinary.uploader.destroy(user.userImagePublicId).catch(() => {});
      }
      const uploaded = await uploadUserImage(req.file);
      user.userImage = uploaded.imageUrl;
      user.userImagePublicId = uploaded.imagePublicId;
    }

    if (password) {
      user.password = password;
    }

    await user.save();
    const safeUser = user.toJSON();
    return res.status(200).json(safeUser);
  } catch (error) {
    console.error("Failed to update user:", error);
    return res.status(500).json({ message: "Failed to update user" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUsers,
  getUserById,
  updateUser,
};
