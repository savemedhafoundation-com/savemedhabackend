const app = require("../app");
const connectDB = require("../src/config/db");

module.exports = async (req, res) => {
  try {
    await connectDB();
    return app(req, res);
  } catch (err) {
    console.error("Request failed before handler:", err);
    res.statusCode = err.statusCode || 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ message: err.message || "Database unavailable" }));
  }
};
