const serverless = require("serverless-http");
const app = require("../app");
const connectDB = require("../src/config/db");

// Ensure DB connection is initialized once per cold start
connectDB();

module.exports = (req, res) => {
  const handler = serverless(app);
  return handler(req, res);
};
