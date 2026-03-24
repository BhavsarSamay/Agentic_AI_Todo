const ChatHistory = require("../models/ChatHistory");

const DEFAULT_LIMIT = 50;

exports.saveMessage = async ({ userId, threadId, role, message }) => {
  return ChatHistory.create({
    userId: String(userId),
    threadId: String(threadId),
    role,
    message,
  });
};

exports.getMessages = async ({
  userId,
  threadId,
  limit = DEFAULT_LIMIT,
  page = 1,
  offset,
}) => {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 200));
  const normalizedPage = Math.max(1, Number(page) || 1);
  const skip = Number.isInteger(offset)
    ? Math.max(0, offset)
    : (normalizedPage - 1) * normalizedLimit;

  return ChatHistory.find({
    userId: String(userId),
    threadId: String(threadId),
  })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(normalizedLimit)
    .lean();
};

exports.getLatestMessages = async ({ userId, threadId, limit = 20 }) => {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 20, 200));

  const latest = await ChatHistory.find({
    userId: String(userId),
    threadId: String(threadId),
  })
    .sort({ createdAt: -1 })
    .limit(normalizedLimit)
    .lean();

  return latest.reverse();
};

exports.clearThread = async ({ userId, threadId }) => {
  return ChatHistory.deleteMany({
    userId: String(userId),
    threadId: String(threadId),
  });
};
