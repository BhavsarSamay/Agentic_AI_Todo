const mongoose = require("mongoose");
require("dotenv").config();

mongoose.set("strictQuery", false);

// For local MongoDB connection
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/todo_ai_db";

mongoose
  .connect(MONGO_URL)
  .then((res) => {
    console.log("✅ MongoDB Connected Successfully");
    console.log(`📍 Database: ${MONGO_URL}`);
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
    console.error("Please make sure MongoDB is running on your local machine");
    process.exit(1);
  });

// Connection events
mongoose.connection.on("connected", () => {
  console.log("📡 Mongoose connected to database");
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  Mongoose disconnected from database");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

exports.mongoose;
