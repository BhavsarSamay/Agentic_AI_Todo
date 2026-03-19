const mongoose = require("mongoose");
const Todo = require("../models/todoModel");

const getAllTodos = async (userId, options = {}) => {
  const { filter = {}, page, limit } = options;

  const queryFilter = {
    userId,
    ...filter,
  };

  let query = Todo.find(queryFilter).sort({ createdAt: -1 });

  if (typeof page === "number" && typeof limit === "number") {
    query = query.limit(limit).skip((page - 1) * limit);
  }

  return query.exec();
};

const countTodos = async (userId, filter = {}) => {
  return Todo.countDocuments({ userId, ...filter });
};

const getTodoById = async (userId, todoId) => {
  return Todo.findOne({ _id: todoId, userId });
};

const createTodo = async (userId, payload) => {
  const todo = new Todo({
    userId,
    ...payload,
    tags: payload?.tags || [],
  });

  await todo.save();
  return todo;
};

const updateTodo = async (userId, todoId, updates) => {
  return Todo.findOneAndUpdate(
    { _id: todoId, userId },
    { $set: updates },
    { new: true, runValidators: true }
  );
};

const deleteTodo = async (userId, todoId) => {
  return Todo.findOneAndDelete({
    _id: todoId,
    userId,
  });
};

const markTodoCompleted = async (userId, todoId) => {
  const todo = await getTodoById(userId, todoId);
  if (!todo) return null;

  todo.status = "completed";
  todo.completedDate = new Date();
  await todo.save();
  return todo;
};

const addChecklistItem = async (userId, todoId, item) => {
  const todo = await getTodoById(userId, todoId);
  if (!todo) return null;

  todo.checklist.push({ item, completed: false });
  await todo.save();
  return todo;
};

const toggleStar = async (userId, todoId) => {
  const todo = await getTodoById(userId, todoId);
  if (!todo) return null;

  todo.isStarred = !todo.isStarred;
  await todo.save();
  return todo;
};

const getTodoStats = async (userId) => {
  const [total, completed, pending, inProgress, byPriority, byCategory] =
    await Promise.all([
      countTodos(userId),
      countTodos(userId, { status: "completed" }),
      countTodos(userId, { status: "pending" }),
      countTodos(userId, { status: "in-progress" }),
      Todo.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),
      Todo.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

  return {
    total,
    completed,
    pending,
    inProgress,
    byPriority,
    byCategory,
  };
};

module.exports = {
  getAllTodos,
  countTodos,
  getTodoById,
  createTodo,
  updateTodo,
  deleteTodo,
  markTodoCompleted,
  addChecklistItem,
  toggleStar,
  getTodoStats,
};
