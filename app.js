const express = require("express");
const path = require("path");
const app = express();
const morgan = require("morgan");
const cors = require("cors");
const serviceRoutes = require("./src/routes/serviceRoutes");
const testimonialRoutes = require("./src/routes/testimonialRoutes");
const blogRoutes = require("./src/routes/blogRoutes");
const ebookRoutes = require("./src/routes/ebookRoutes");
const upcomingEventRoutes = require("./src/routes/upcomingEventRoutes");
const ongoingEventRoutes = require("./src/routes/ongoingEventRoutes");
const callbackRoutes = require("./src/routes/callbackRoutes");
const newsletterRoutes = require("./src/routes/newsletterRoutes");
const treatmentRoutes = require("./src/routes/treatmentRoutes");
const treatmentSubCategoryRoutes = require("./src/routes/treatmentSubCategoryRoutes");
const treatmentDetailRoutes = require("./src/routes/treatmentDetailRoutes");
const addressRoutes = require("./src/routes/addressRoutes");
const contactUsRoutes = require("./src/routes/contactUsRoutes");
const jobRoutes = require("./src/routes/jobRoutes");
const applicationRoutes = require("./src/routes/applicationRoutes");
const userRoutes = require("./src/routes/userRoutes");
const countRoutes = require("./src/routes/countRoutes");
const authMiddleware = require("./src/middlewares/authMiddleware");
const globalErrorHandler = require("./src/middlewares/globalErrorHandler");

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Quick responses to keep serverless invocations short
app.get("/", (_req, res) => res.json({ ok: true, message: "API is running" }));
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// Lightweight health check (no DB call)
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime(), ts: Date.now() })
);

// Auth routes (login/register) remain public
app.use("/api/users", userRoutes);

// Protected admin resources
app.use("/api/services", serviceRoutes);
app.use("/api/testimonials", testimonialRoutes);
app.use("/api/blogs", blogRoutes);
// Ebooks: router handles auth for writes; reads remain public
app.use("/api/ebooks", ebookRoutes);
// Upcoming events: router handles auth for writes; reads remain public
app.use("/api/upcoming-events", upcomingEventRoutes);
// Ongoing events: router handles auth for writes; reads remain public
app.use("/api/ongoing-events", ongoingEventRoutes);
  

// Treatments: router handles auth for writes; reads remain public
app.use("/api/treatments", treatmentRoutes);
// Treatment sub-categories: router handles auth for writes; reads remain public
app.use("/api/treatment-sub-categories", treatmentSubCategoryRoutes);
// Treatment details: router handles auth for writes; reads remain public
app.use("/api/treatment-details", treatmentDetailRoutes);
// Addresses: router handles auth for writes; reads remain public
app.use("/api/addresses", addressRoutes);
// Contact submissions: router handles auth for writes; reads remain public
app.use("/api/contact-us", contactUsRoutes);
// Careers and applications
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);

// Public endpoints
app.use("/api/callbacks", callbackRoutes);
app.use("/api/newsletter", newsletterRoutes);

// count for cities and Members
app.use("/api/cities", countRoutes);
// 404 handler for any unmatched routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

// Global error handler must be last
app.use(globalErrorHandler);


module.exports = app;
