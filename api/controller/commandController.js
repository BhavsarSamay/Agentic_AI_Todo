const helper = require("../helper/helper");
const resMsg = require("../../res_msg.json");
const agentService = require("../helper/agentService");
const langGraphAgentService = require("../helper/langGraphAgentService");
const langGraphAgentServiceReflexion = require("../helper/langGraphAgentServiceReflexion");

exports.executeCommand = async (req, res) => {
  try {
    const { command } = req.body;

    if (!command || typeof command !== "string" || !command.trim()) {
      return res.status(400).json({
        success: false,
        message: "Command is required",
      });
    }

    const result = await agentService.runAgent(command.trim(), req.userId);

    return res.status(200).json({
      message: result.output,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "executeCommand",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

exports.executeLangGraphCommand = async (req, res) => {
  try {
    const { command } = req.body;

    if (!command || typeof command !== "string" || !command.trim()) {
      return res.status(400).json({
        success: false,
        message: "Command is required",
      });
    }

    const result = await langGraphAgentService.runLangGraphAgent(
      command.trim(),
      req.userId
    );

    return res.status(200).json({
      message: result.output,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "executeLangGraphCommand",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

exports.executeLangGraphCommandwithReflexion = async (req, res) => {
  try {
    const { command } = req.body;

    if (!command || typeof command !== "string" || !command.trim()) {
      return res.status(400).json({
        success: false,
        message: "Command is required",
      });
    }

    const result = await langGraphAgentServiceReflexion.runLangGraphAgent(
      command.trim(),
      req.userId
    );

    return res.status(200).json({
      message: result.output,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "langGraphAgentServiceWithReflexion",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

