const mongoose = require("mongoose");

const chatHistorySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    trim: true,
  },
  threadId: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: Number,
    enum: [1, 2],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

chatHistorySchema.index({ userId: 1, threadId: 1 });
chatHistorySchema.index({ createdAt: 1 });

const ChatHistory = mongoose.model("ChatHistory", chatHistorySchema);

module.exports = ChatHistory;
