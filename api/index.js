const serverless = require("serverless-http");
const app = require("../app");
const connectDB = require("../src/config/db");

const handler = serverless(app);

module.exports = async (req, res) => {
  try {
    await connectDB();
    return handler(req, res);
  } catch (err) {
    console.error("Request failed before handler:", err);
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ message: "Database unavailable" }));
  }
};
