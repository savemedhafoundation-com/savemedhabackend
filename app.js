const express = require("express");
const app = express();
const morgan = require("morgan");
const serviceRoutes = require("./src/routes/serviceRoutes");
const testimonialRoutes = require("./src/routes/testimonialRoutes");
const blogRoutes = require("./src/routes/blogRoutes");
const callbackRoutes = require("./src/routes/callbackRoutes");
const newsletterRoutes = require("./src/routes/newsletterRoutes");

app.use(express.json());
app.use(morgan("dev"));

app.use("/api/services", serviceRoutes);
app.use("/api/testimonials", testimonialRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/callbacks", callbackRoutes);
app.use("/api/newsletter", newsletterRoutes);


module.exports = app;
