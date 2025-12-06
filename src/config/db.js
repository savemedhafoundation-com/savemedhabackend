const mongoose = require("mongoose");

// Fail fast instead of buffering queries when disconnected
mongoose.set("bufferCommands", false);

let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined");
  }

  try {
    if (cached.conn) return cached.conn;

    if (!cached.promise) {
      console.log("Connecting to Mongo...");
      cached.promise = mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 20000,
      });
    }

    cached.conn = await cached.promise;
    console.log("MongoDB Connected");
    return cached.conn;
  } catch (error) {
    // Clear cached promise so subsequent invocations can retry
    cached.promise = null;
    console.error("DB Error:", error);
    throw error;
  }
};

module.exports = connectDB;
