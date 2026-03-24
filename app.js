const express = require("express");
const app = express();
const morgan = require("morgan");
require("dotenv").config();
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const dbConfig = require("./api/config/db");
const helper = require("./api/helper/helper");
const swaggerUi = require("swagger-ui-express");
const basicAuth = require("express-basic-auth");
const { swaggerSpec } = require("./swagger");
var cors = require("cors");

// Basic Auth middleware for Swagger UI
const swaggerAuth = basicAuth({
  users: {
    [process.env.SWAGGER_USER || "admin"]:
      process.env.SWAGGER_PASSWORD || "admin@123",
  },
  challenge: true,
  realm: "TODO AI API Documentation",
});

// Serve Swagger documentation
app.use(
  "/api-docs",
  swaggerAuth,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "TODO AI API Documentation",
  })
);

// Routes imports
const userRoutes = require("./api/routes/userRoutes");
const todoRoutes = require("./api/routes/todoRoutes");
const commandRoutes = require("./api/routes/commandRoutes");
const aiAgentOptimalRoutes = require("./api/routes/aiAgentOptimal");

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Request logging middleware
app.use((req, res, next) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
  };
  console.log(JSON.stringify(logEntry));
  next();
});

// Routes
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/todo", todoRoutes);
app.use("/api/v1/agent", commandRoutes);
app.use("/api/v1/ai-agent-optimal", aiAgentOptimalRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  };

  console.error(JSON.stringify(errorLog));
  helper.logErrorInFile("Error_log", errorLog);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err : {},
  });
});

module.exports = app;
