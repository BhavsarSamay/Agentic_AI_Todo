const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const aiAgentOptimalController = require("../controller/aiAgentOptimalController");

/**
 * @swagger
 * /api/v1/ai-agent-optimal:
 *   post:
 *     summary: Execute low-latency AI todo agent
 *     description: Fast-path + regex routing + optional LangGraph execution with Gemini.
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
 *                 example: create todo to submit report by friday high priority
 *               sessionId:
 *                 type: string
 *               threadId:
 *                 type: string
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
router.post("/", authMiddleware.verifyAuth, aiAgentOptimalController.executeOptimalAgent);

module.exports = router;
