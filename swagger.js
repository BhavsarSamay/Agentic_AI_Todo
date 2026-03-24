const swaggerJsdoc = require("swagger-jsdoc");
require("dotenv").config();

const baseUrl = process.env.SITE_URL || "http://localhost:5000";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TODO AI Application API Documentation",
      version: "1.0.0",
      description:
        "A full-fledged TODO AI application built with Node.js, Express, and MongoDB. This API provides comprehensive todo management features with user authentication.",
      contact: {
        name: "SaturnCube",
        url: "https://github.com/",
        email: "saturncube@example.com",
      },
    },
    servers: [
      {
        url: `${baseUrl}`,
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        userAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "User JWT token in the format: Bearer <token>",
        },
        adminAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Admin JWT token in the format: Bearer <token>",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "User ID (MongoDB ObjectId)",
            },
            firstName: {
              type: "string",
              description: "User first name",
            },
            lastName: {
              type: "string",
              description: "User last name",
            },
            email: {
              type: "string",
              format: "email",
              description: "User email",
            },
            phone: {
              type: "string",
              description: "User phone number",
            },
            profilePicture: {
              type: "string",
              description: "User profile picture URL",
            },
            bio: {
              type: "string",
              description: "User bio",
            },
            role: {
              type: "string",
              enum: ["user", "admin"],
              description: "User role",
            },
            isActive: {
              type: "boolean",
              description: "User active status",
            },
            lastLogin: {
              type: "string",
              format: "date-time",
              description: "Last login timestamp",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Account creation timestamp",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        Todo: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description: "Todo ID (MongoDB ObjectId)",
            },
            userId: {
              type: "string",
              description: "User ID who owns this todo",
            },
            title: {
              type: "string",
              description: "Todo title",
            },
            description: {
              type: "string",
              description: "Todo description",
            },
            category: {
              type: "string",
              enum: ["work", "personal", "shopping", "health", "other"],
              description: "Todo category",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"],
              description: "Todo priority level",
            },
            status: {
              type: "string",
              enum: ["pending", "in-progress", "completed", "archived"],
              description: "Todo current status",
            },
            dueDate: {
              type: "string",
              format: "date-time",
              description: "Todo due date",
            },
            completedDate: {
              type: "string",
              format: "date-time",
              description: "When todo was completed",
            },
            tags: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Todo tags",
            },
            isStarred: {
              type: "boolean",
              description: "Whether todo is starred",
            },
            createdAt: {
              type: "string",
              format: "date-time",
              description: "Todo creation timestamp",
            },
            updatedAt: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              description: "Error message",
            },
            error: {
              type: "string",
              description: "Error details (only in development)",
            },
          },
        },
      },
    },
  },
  apis: [
    "./api/routes/userRoutes.js",
    "./api/routes/todoRoutes.js",
    "./api/routes/commandRoutes.js",
    "./api/routes/aiAgentOptimal.js",

  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerSpec };
