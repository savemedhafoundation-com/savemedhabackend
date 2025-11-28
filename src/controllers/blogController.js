const Blog = require("../models/Blog");
const cloudinary = require("../config/cloudinary");

const VALID_CATEGORIES = ["cancer", "kidney", "heart", "nerve", "spinal", "other"];
const SEARCH_DEBOUNCE_MS = 600;
const lastSearchByClient = new Map();

const uploadImage = async (file) => {
  const base64Image = `data:${file.mimetype};base64,${file.buffer.toString(
    "base64"
  )}`;

  const uploadResult = await cloudinary.uploader.upload(base64Image, {
    folder: "savemedha/blogs",
    resource_type: "auto",
  });

  return {
    imageUrl: uploadResult.secure_url,
    imagePublicId: uploadResult.public_id,
  };
};

const normalizeMetadata = (metadata) => {
  if (!metadata) return [];
  if (Array.isArray(metadata)) return metadata.map((item) => `${item}`.trim()).filter(Boolean);
  return [`${metadata}`.trim()].filter(Boolean);
};

const debounceSearch = (req, res, next) => {
  const key = req.ip || "global";
  const now = Date.now();
  const last = lastSearchByClient.get(key) || 0;

  if (now - last < SEARCH_DEBOUNCE_MS) {
    return res
      .status(429)
      .json({ message: `Please wait ${SEARCH_DEBOUNCE_MS}ms between search requests` });
  }

  lastSearchByClient.set(key, now);
  next();
};

const getBlogs = async (req, res) => {
  try {
    const { category } = req.query;
    const filter = {};

    if (category) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res
          .status(400)
          .json({ message: "Invalid category. Use one of cancer, kidney, heart, nerve, spinal, other." });
      }
      filter.category = category;
    }

    const blogs = await Blog.find(filter).sort({ createdAt: -1 });
    res.status(200).json(blogs);
  } catch (error) {
    console.error("Failed to fetch blogs:", error);
    res.status(500).json({ message: "Failed to fetch blogs" });
  }
};

const getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    res.status(200).json(blog);
  } catch (error) {
    console.error("Failed to fetch blog:", error);
    res.status(500).json({ message: "Failed to fetch blog" });
  }
};

const createBlog = async (req, res) => {
  try {
    const { title, description, category, writtenBy } = req.body;
    const metadata = normalizeMetadata(req.body.metadata);

    if (!title || !description || !category || !writtenBy) {
      return res
        .status(400)
        .json({ message: "Title, description, category, and writtenBy are required" });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ message: "Invalid category. Use one of cancer, kidney, heart, nerve, spinal, other." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const { imageUrl, imagePublicId } = await uploadImage(req.file);

    const blog = await Blog.create({
      title,
      description,
      category,
      writtenBy,
      metadata,
      imageUrl,
      imagePublicId,
    });

    res.status(201).json(blog);
  } catch (error) {
    console.error("Failed to create blog:", error);
    res.status(500).json({ message: "Failed to create blog" });
  }
};

const updateBlog = async (req, res) => {
  try {
    const { title, description, category, writtenBy } = req.body;
    const metadata = normalizeMetadata(req.body.metadata);
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ message: "Invalid category. Use one of cancer, kidney, heart, nerve, spinal, other." });
    }

    if (title) blog.title = title;
    if (description) blog.description = description;
    if (category) blog.category = category;
    if (writtenBy) blog.writtenBy = writtenBy;
    if (metadata.length) blog.metadata = metadata;

    if (req.file) {
      const { imageUrl, imagePublicId } = await uploadImage(req.file);

      if (blog.imagePublicId) {
        await cloudinary.uploader.destroy(blog.imagePublicId);
      }

      blog.imageUrl = imageUrl;
      blog.imagePublicId = imagePublicId;
    }

    await blog.save();
    res.status(200).json(blog);
  } catch (error) {
    console.error("Failed to update blog:", error);
    res.status(500).json({ message: "Failed to update blog" });
  }
};

const deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    if (blog.imagePublicId) {
      await cloudinary.uploader.destroy(blog.imagePublicId);
    }

    await blog.deleteOne();
    res.status(200).json({ message: "Blog deleted" });
  } catch (error) {
    console.error("Failed to delete blog:", error);
    res.status(500).json({ message: "Failed to delete blog" });
  }
};

const searchBlogs = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const regex = new RegExp(q.trim(), "i");
    const blogs = await Blog.find({
      $or: [{ title: regex }, { metadata: regex }],
    }).sort({ createdAt: -1 });

    res.status(200).json(blogs);
  } catch (error) {
    console.error("Failed to search blogs:", error);
    res.status(500).json({ message: "Failed to search blogs" });
  }
};

const getBlogsByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    if (!VALID_CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ message: "Invalid category. Use one of cancer, kidney, heart, nerve, spinal, other." });
    }

    const blogs = await Blog.find({ category }).sort({ createdAt: -1, title: 1 });
    res.status(200).json(blogs);
  } catch (error) {
    console.error("Failed to fetch blogs by category:", error);
    res.status(500).json({ message: "Failed to fetch blogs by category" });
  }
};

const addComment = async (req, res) => {
  try {
    const { comment, name, phoneNumber } = req.body;
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: "Blog not found" });
    }

    if (!comment || !name || !phoneNumber) {
      return res
        .status(400)
        .json({ message: "Comment, name, and phone number are required" });
    }

    blog.comments.unshift({ comment, name, phoneNumber });
    await blog.save();

    res.status(201).json(blog);
  } catch (error) {
    console.error("Failed to add comment:", error);
    res.status(500).json({ message: "Failed to add comment" });
  }
};

module.exports = {
  getBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
  searchBlogs,
  getBlogsByCategory,
  addComment,
  debounceSearch,
};
