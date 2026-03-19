const express = require("express");
const router = express.Router();
const todoController = require("../controller/todoController");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * /api/v1/todo:
 *   post:
 *     summary: Create a new todo
 *     tags:
 *       - Todo
 *     security:
 *       - userAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: Buy groceries
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [work, personal, shopping, health, other]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Todo created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/", authMiddleware.verifyAuth, todoController.createTodo);

/**
 * @swagger
 * /api/v1/todo:
 *   get:
 *     summary: Get all todos
 *     tags:
 *       - Todo
 *     security:
 *       - userAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in-progress, completed, archived]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [work, personal, shopping, health, other]
 *     responses:
 *       200:
 *         description: Todos retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", authMiddleware.verifyAuth, todoController.getAllTodos);

/**
 * @swagger
 * /api/v1/todo/stats:
 *   get:
 *     summary: Get todo statistics
 *     tags:
 *       - Todo
 *     security:
 *       - userAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/stats", authMiddleware.verifyAuth, todoController.getTodoStats);

/**
 * @swagger
 * /api/v1/todo/{todoId}:
 *   get:
 *     summary: Get single todo
 *     tags:
 *       - Todo
 *     security:
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: todoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Todo retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Todo not found
 *       500:
 *         description: Internal server error
 */
router.get("/:todoId", authMiddleware.verifyAuth, todoController.getTodoById);

/**
 * @swagger
 * /api/v1/todo/{todoId}:
 *   put:
 *     summary: Update todo
 *     tags:
 *       - Todo
 *     security:
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: todoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [pending, in-progress, completed, archived]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Todo updated successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Todo not found
 *       500:
 *         description: Internal server error
 */
router.put("/:todoId", authMiddleware.verifyAuth, todoController.updateTodo);

/**
 * @swagger
 * /api/v1/todo/{todoId}/complete:
 *   patch:
 *     summary: Mark todo as completed
 *     tags:
 *       - Todo
 *     security:
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: todoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Todo marked as completed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Todo not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/:todoId/complete",
  authMiddleware.verifyAuth,
  todoController.markCompleted
);

/**
 * @swagger
 * /api/v1/todo/{todoId}:
 *   delete:
 *     summary: Delete todo
 *     tags:
 *       - Todo
 *     security:
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: todoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Todo deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Todo not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:todoId", authMiddleware.verifyAuth, todoController.deleteTodo);

/**
 * @swagger
 * /api/v1/todo/{todoId}/checklist:
 *   post:
 *     summary: Add checklist item to todo
 *     tags:
 *       - Todo
 *     security:
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: todoId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - item
 *             properties:
 *               item:
 *                 type: string
 *     responses:
 *       200:
 *         description: Checklist item added
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Todo not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:todoId/checklist",
  authMiddleware.verifyAuth,
  todoController.addChecklistItem
);

/**
 * @swagger
 * /api/v1/todo/{todoId}/star:
 *   patch:
 *     summary: Toggle star status of todo
 *     tags:
 *       - Todo
 *     security:
 *       - userAuth: []
 *     parameters:
 *       - in: path
 *         name: todoId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Star status updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Todo not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/:todoId/star",
  authMiddleware.verifyAuth,
  todoController.toggleStar
);

module.exports = router;
