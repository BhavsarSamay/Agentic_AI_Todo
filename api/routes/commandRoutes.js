const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const commandController = require("../controller/commandController");

/**
 * @swagger
 * /api/v1/agent/command:
 *   post:
 *     summary: Execute natural language todo commands
 *     description: Supports create, list, get, update, complete, set status, delete, star/unstar, checklist add, and stats.
 *     tags:
 *       - Agent
 *     security:
 *       - userAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - command
 *             properties:
 *               command:
 *                 type: string
 *                 example: update todo buy groceries set priority high and status in-progress
 *     responses:
 *       201:
 *         description: Command executed and resource created (create command)
 *       200:
 *         description: Command executed successfully
 *       400:
 *         description: Invalid or unsupported command
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/command", authMiddleware.verifyAuth, commandController.executeCommand);

/**
 * @swagger
 * /api/v1/agent/command/langgraph:
 *   post:
 *     summary: Execute natural language todo commands using LangGraph
 *     description: Runs the todo command workflow using a LangGraph-based agent with tool-calling.
 *     tags:
 *       - Agent
 *     security:
 *       - userAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - command
 *             properties:
 *               command:
 *                 type: string
 *                 example: create a todo to prepare project report by friday with high priority
 *     responses:
 *       200:
 *         description: Command executed successfully
 *       400:
 *         description: Invalid or missing command
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
	"/command/langgraph",
	authMiddleware.verifyAuth,
	commandController.executeLangGraphCommand
);



/**
 * @swagger
 * /api/v1/agent/command/langgraphwithreflexion:
 *   post:
 *     summary: Execute natural language todo commands using LangGraph
 *     description: Runs the todo command workflow using a LangGraph-based agent with tool-calling.
 *     tags:
 *       - Agent
 *     security:
 *       - userAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - command
 *             properties:
 *               command:
 *                 type: string
 *                 example: create a todo to prepare project report by friday with high priority
 *     responses:
 *       200:
 *         description: Command executed successfully
 *       400:
 *         description: Invalid or missing command
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
	"/command/langgraphwithreflexion",
	authMiddleware.verifyAuth,
	commandController.executeLangGraphCommandwithReflexion
);

module.exports = router;
