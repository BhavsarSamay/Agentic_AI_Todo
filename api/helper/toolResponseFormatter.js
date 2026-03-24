const normalizeTodo = (todo = {}) => {
  const title = todo.title || "Untitled";
  const status = todo.status || "pending";
  const priority = todo.priority || "medium";
  const dueDate = todo.dueDate ? new Date(todo.dueDate).toISOString().split("T")[0] : "No due date";
  return `- ${title} | status: ${status} | priority: ${priority} | due: ${dueDate}`;
};

const formatToolResult = ({ toolName, observation }) => {
  if (observation && observation.error) {
    return `I couldn’t complete ${toolName}: ${observation.error}`;
  }

  if (toolName === "getAllTodos") {
    const todos = Array.isArray(observation) ? observation : [];
    if (!todos.length) {
      return "You don’t have any todos yet.";
    }

    return `Here are your todos:\n${todos.slice(0, 20).map(normalizeTodo).join("\n")}`;
  }

  if (toolName === "getTodoById") {
    return `Todo details:\n${normalizeTodo(observation || {})}`;
  }

  if (toolName === "createTodo") {
    return `Done. I created your todo:\n${normalizeTodo(observation || {})}`;
  }

  if (toolName === "updateTodo") {
    return `Done. I updated the todo:\n${normalizeTodo(observation || {})}`;
  }

  if (toolName === "deleteTodo") {
    return `Done. I deleted the todo "${observation?.title || "item"}".`;
  }

  if (typeof observation === "string") {
    return observation;
  }

  return "Action completed successfully.";
};

module.exports = {
  formatToolResult,
};
