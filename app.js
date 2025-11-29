const express = require("express");
const app = express();
const morgan = require("morgan");
const cors = require("cors");
const serviceRoutes = require("./src/routes/serviceRoutes");
const testimonialRoutes = require("./src/routes/testimonialRoutes");
const blogRoutes = require("./src/routes/blogRoutes");
const callbackRoutes = require("./src/routes/callbackRoutes");
const newsletterRoutes = require("./src/routes/newsletterRoutes");
const userRoutes = require("./src/routes/userRoutes");
const authMiddleware = require("./src/middlewares/authMiddleware");

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

// Auth routes (login/register) remain public
app.use("/api/users", userRoutes);

// Protected admin resources
app.use("/api/services", authMiddleware, serviceRoutes);
app.use("/api/testimonials", authMiddleware, testimonialRoutes);
app.use("/api/blogs", authMiddleware, blogRoutes);

// Public endpoints
app.use("/api/callbacks", callbackRoutes);
app.use("/api/newsletter", newsletterRoutes);


module.exports = app;
