const summarizeOlderMessages = (messages = [], keepRecent = 12) => {
  if (!Array.isArray(messages) || messages.length <= keepRecent) {
    return null;
  }

  const older = messages.slice(0, Math.max(0, messages.length - keepRecent));

  const lines = older
    .map((message) => {
      if (!message || !message._getType || typeof message._getType !== "function") {
        return null;
      }

      const type = message._getType();
      const role = type === "human" ? "User" : type === "ai" ? "Assistant" : type;
      const content = typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content.map((part) => (typeof part === "string" ? part : part?.text || "")).join(" ")
          : "";

      if (!content.trim()) {
        return null;
      }

      return `${role}: ${content.trim().slice(0, 180)}`;
    })
    .filter(Boolean)
    .slice(-8);

  if (!lines.length) {
    return null;
  }

  return `Conversation summary (older context):\n${lines.join("\n")}`;
};

const selectContextMessages = ({ messages = [], HumanMessage, AIMessage, ToolMessage, maxMessages = 12 }) => {
  if (!Array.isArray(messages) || !messages.length) {
    return [];
  }

  const recent = messages.slice(-maxMessages);

  let lastUser = null;
  let lastAssistant = null;
  let lastTool = null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!lastUser && HumanMessage.isInstance(message)) lastUser = message;
    if (!lastAssistant && AIMessage.isInstance(message)) lastAssistant = message;
    if (!lastTool && ToolMessage.isInstance(message)) lastTool = message;
    if (lastUser && lastAssistant && lastTool) break;
  }

  const selected = [...recent];

  [lastUser, lastTool, lastAssistant]
    .filter(Boolean)
    .forEach((message) => {
      if (!selected.includes(message)) {
        selected.push(message);
      }
    });

  return selected;
};

module.exports = {
  summarizeOlderMessages,
  selectContextMessages,
};
