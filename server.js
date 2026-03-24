const app = require("./app");
const http = require("http");
require("dotenv").config();
const { preload } = require("./api/helper/langGraphOptimal");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const startServer = async () => {
  try {
    await preload();
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("LangGraph optimal preload failed:", error?.message || error);
    }
  }

  server.listen(PORT, () => {
    console.log(`🚀 TODO AI Server is running on port ${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
    console.log(`💚 Health Check: http://localhost:${PORT}/health`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`📅 Started at: ${new Date().toISOString()}`);
  });
};

startServer();

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
