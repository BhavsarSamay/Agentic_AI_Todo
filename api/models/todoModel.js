const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    title: {
      type: String,
      required: [true, "Todo title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      default: null,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    category: {
      type: String,
      enum: ["work", "personal", "shopping", "health", "other"],
      default: "personal",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed", "archived"],
      default: "pending",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    completedDate: {
      type: Date,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrencePattern: {
      type: String,
      enum: ["daily", "weekly", "monthly", "yearly", null],
      default: null,
    },
    attachments: [
      {
        filename: String,
        url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    checklist: [
      {
        item: String,
        completed: {
          type: Boolean,
          default: false,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    reminders: [
      {
        type: Date,
      },
    ],
    collaborators: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        email: String,
        role: {
          type: String,
          enum: ["viewer", "editor", "owner"],
          default: "viewer",
        },
      },
    ],
    notes: {
      type: String,
      default: null,
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
      default: "#ffffff",
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
todoSchema.index({ userId: 1, createdAt: -1 });
todoSchema.index({ userId: 1, status: 1 });
todoSchema.index({ userId: 1, priority: 1 });
todoSchema.index({ dueDate: 1 });
todoSchema.index({ isStarred: 1 });

// Mark as completed method
todoSchema.methods.markCompleted = function () {
  this.status = "completed";
  this.completedDate = new Date();
  return this.save();
};

// Mark as archived method
todoSchema.methods.archive = function () {
  this.status = "archived";
  return this.save();
};

const Todo = mongoose.model("Todo", todoSchema);

module.exports = Todo;
