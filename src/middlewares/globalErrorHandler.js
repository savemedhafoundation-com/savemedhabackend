const globalErrorHandler = (err, req, res, next) => {
  console.error("Global Error Handler:", err);

  // Default values
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    status: statusCode,
    message,
    // Only show stack in development
    // stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    stack : err.stack
  });
};

module.exports = globalErrorHandler;
