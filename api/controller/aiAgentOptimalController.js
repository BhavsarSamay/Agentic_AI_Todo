const helper = require("../helper/helper");
const resMsg = require("../../res_msg.json");
const { randomUUID } = require("crypto");
const { runOptimalAgent } = require("../helper/langGraphOptimal");

exports.executeOptimalAgent = async (req, res) => {
  const requestId = randomUUID();

  try {
    const { command, sessionId, threadId } = req.body || {};

    if (!command || typeof command !== "string" || !command.trim()) {
      return res.status(400).json({
        success: false,
        message: "Command is required",
        requestId,
      });
    }

    if (command.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Command is too long",
        requestId,
      });
    }

    if (sessionId !== undefined && typeof sessionId !== "string") {
      return res.status(400).json({
        success: false,
        message: "sessionId must be a string",
        requestId,
      });
    }

    if (threadId !== undefined && typeof threadId !== "string") {
      return res.status(400).json({
        success: false,
        message: "threadId must be a string",
        requestId,
      });
    }

    const result = await runOptimalAgent(command.trim(), req.userId, {
      sessionId,
      threadId,
      traceId: requestId,
    });

    return res.status(200).json({
      success: true,
      data: {
        response: result.response,
        route: result.route,
        latency: result.latency,
        requestId,
      },
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "executeOptimalAgent",
      requestId,
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      requestId,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
