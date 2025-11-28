const express = require("express");
const app = express();
const morgan = require("morgan");
const serviceRoutes = require("./src/routes/serviceRoutes");
const testimonialRoutes = require("./src/routes/testimonialRoutes");

app.use(express.json());
app.use(morgan("dev"));

app.use("/api/services", serviceRoutes);
app.use("/api/testimonials", testimonialRoutes);


module.exports = app;
