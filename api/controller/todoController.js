const helper = require("../helper/helper");
const resMsg = require("../../res_msg.json");
const todoService = require("../service/todoService");

/**
 * Create a new todo
 */
exports.createTodo = async (req, res) => {
  try {
    const { title, description, category, priority, dueDate, tags } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Todo title is required",
      });
    }

    const todo = await todoService.createTodo(req.userId, {
      title,
      description,
      category,
      priority,
      dueDate,
      tags,
    });

    return res.status(201).json({
      success: true,
      message: resMsg.TODO_CREATED.message,
      data: todo,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "createTodo",
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

/**
 * Get all todos for user
 */
exports.getAllTodos = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, priority, category } = req.query;

    const filter = { userId: req.userId };

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    const todos = await todoService.getAllTodos(req.userId, {
      filter: {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(category ? { category } : {}),
      },
      page: pageNumber,
      limit: limitNumber,
    });

    const total = await todoService.countTodos(req.userId, filter);

    return res.status(200).json({
      success: true,
      message: resMsg.TODOS_RETRIEVED.message,
      data: {
        todos,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          pages: Math.ceil(total / limitNumber),
        },
      },
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "getAllTodos",
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

/**
 * Get single todo
 */
exports.getTodoById = async (req, res) => {
  try {
    const { todoId } = req.params;

    const todo = await todoService.getTodoById(req.userId, todoId);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: resMsg.TODO_NOT_FOUND.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Todo retrieved successfully",
      data: todo,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "getTodoById",
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

/**
 * Update todo
 */
exports.updateTodo = async (req, res) => {
  try {
    const { todoId } = req.params;
    const updateData = req.body;

    const todo = await todoService.updateTodo(req.userId, todoId, updateData);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: resMsg.TODO_NOT_FOUND.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: resMsg.TODO_UPDATED.message,
      data: todo,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "updateTodo",
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

/**
 * Mark todo as completed
 */
exports.markCompleted = async (req, res) => {
  try {
    const { todoId } = req.params;

    const todo = await todoService.markTodoCompleted(req.userId, todoId);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: resMsg.TODO_NOT_FOUND.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Todo marked as completed",
      data: todo,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "markCompleted",
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

/**
 * Delete todo
 */
exports.deleteTodo = async (req, res) => {
  try {
    const { todoId } = req.params;

    const todo = await todoService.deleteTodo(req.userId, todoId);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: resMsg.TODO_NOT_FOUND.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: resMsg.TODO_DELETED.message,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "deleteTodo",
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

/**
 * Get todo statistics
 */
exports.getTodoStats = async (req, res) => {
  try {
    const { total, completed, pending, inProgress, byPriority, byCategory } =
      await todoService.getTodoStats(req.userId);

    return res.status(200).json({
      success: true,
      message: "Statistics retrieved successfully",
      data: {
        total,
        completed,
        pending,
        inProgress,
        byPriority,
        byCategory,
      },
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "getTodoStats",
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

/**
 * Add checklist item
 */
exports.addChecklistItem = async (req, res) => {
  try {
    const { todoId } = req.params;
    const { item } = req.body;

    if (!item) {
      return res.status(400).json({
        success: false,
        message: "Checklist item is required",
      });
    }

    const todo = await todoService.addChecklistItem(req.userId, todoId, item);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: resMsg.TODO_NOT_FOUND.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Checklist item added successfully",
      data: todo,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "addChecklistItem",
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

/**
 * Toggle star status
 */
exports.toggleStar = async (req, res) => {
  try {
    const { todoId } = req.params;

    const todo = await todoService.toggleStar(req.userId, todoId);

    if (!todo) {
      return res.status(404).json({
        success: false,
        message: resMsg.TODO_NOT_FOUND.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Star status updated",
      data: todo,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "toggleStar",
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
