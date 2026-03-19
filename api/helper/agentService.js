const OpenAI = require("openai");
const todoService = require("../service/todoService");

const TODO_CATEGORIES = ["work", "personal", "shopping", "health", "other"];
const TODO_PRIORITIES = ["low", "medium", "high", "urgent"];
const TODO_STATUSES = ["pending", "in-progress", "completed", "archived"];
const ALLOWED_ACTIONS = [
  "create_todo",
  "list_todos",
  "get_todo",
  "update_todo",
  "complete_todo",
  "set_status",
  "delete_todo",
  "toggle_star",
  "add_checklist_item",
  "get_stats",
];

const SYSTEM_PROMPT = `
You are an AI To-Do List Assistant. You work through a strict loop of PLAN, ACTION, OBSERVATION, and OUTPUT states.
Wait for the user prompt, then PLAN using available tools. After Planning, take the ACTION with the appropriate tool and wait for the OBSERVATION. Once you get the observation, return the AI response based on the initial prompt and observations.

You can manage tasks by adding, viewing, updating, and deleting them.
You MUST strictly follow the JSON output format — return exactly ONE JSON object per response.

Current Date: ${new Date().toISOString()}

Available Tools:
- getAllTodos       — Retrieve all todos for the user.             Input: {}
- getTodoById      — Get a specific todo by its ID.               Input: { "id": "string" }
- createTodo       — Create a new todo.                           Input: { "title": "string", "description": "string|null", "category": "work|personal|shopping|health|other|null", "priority": "low|medium|high|urgent|null", "dueDate": "ISO date string|null" }
- updateTodo       — Update an existing todo by ID.               Input: { "id": "string", "updates": { title?, description?, category?, priority?, status?, dueDate?, tags?, isStarred?, notes?, color? } }
- deleteTodo       — Permanently delete a todo by ID.             Input: { "id": "string" }

Valid Categories : work | personal | shopping | health | other
Valid Priorities  : low | medium | high | urgent
Valid Statuses    : pending | in-progress | completed | archived

Response Formats — output exactly ONE of the following per response:

PLAN   : { "type": "plan",        "plan": "What you intend to do" }
ACTION : { "type": "action",      "function": "toolName", "input": { ...parameters } }
OUTPUT : { "type": "output",      "output": "Your natural-language reply to the user" }

Workflow:
1. Receive user message.
2. Respond with a PLAN describing your approach.
3. Respond with an ACTION to call the appropriate tool.
4. Receive an OBSERVATION containing the tool result.
5. Respond with an OUTPUT message to the user.

Rules:
- Always plan before acting.
- To find a todo by name, use getAllTodos first, then identify the correct ID, then act on it.
- If the user's request is ambiguous, ask for clarification via OUTPUT before acting.
- Always return valid JSON with no markdown, no code fences, no extra text.
- Never expose raw MongoDB IDs or internal errors to the user in the OUTPUT.

Example:
  User    : "Add a task for shopping groceries"
  You     : { "type": "plan",   "plan": "I will create a new todo for shopping groceries." }
  System  : { "type": "system", "message": "Proceed with action." }
  You     : { "type": "action", "function": "createTodo", "input": { "title": "Shop for groceries", "description": null, "category": "shopping", "priority": "medium", "dueDate": null } }
  System  : { "type": "observation", "observation": { "_id": "abc123", "title": "Shop for groceries", ... } }
  You     : { "type": "output",  "output": "Done! I've added 'Shop for groceries' to your to-do list." }
`;

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

// ─── Tool executor ────────────────────────────────────────────────────────────

const executeTool = async (functionName, input = {}, userId) => {
  switch (functionName) {
    case "getAllTodos": {
      const todos = await todoService.getAllTodos(userId);
      return todos;
    }

    case "getTodoById": {
      if (!input.id) throw new Error("getTodoById requires an id.");
      const todo = await todoService.getTodoById(userId, input.id);
      if (!todo) throw new Error(`Todo with id '${input.id}' not found.`);
      return todo;
    }

    case "createTodo": {
      if (!input.title) throw new Error("createTodo requires a title.");
      const todo = await todoService.createTodo(userId, {
        title: input.title,
        description: input.description || null,
        category: TODO_CATEGORIES.includes(input.category) ? input.category : "personal",
        priority: TODO_PRIORITIES.includes(input.priority) ? input.priority : "medium",
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      });
      return todo;
    }

    case "updateTodo": {
      if (!input.id) throw new Error("updateTodo requires an id.");
      const updates = input.updates || {};
      if (updates.status === "completed") updates.completedDate = new Date();
      const todo = await todoService.updateTodo(userId, input.id, updates);
      if (!todo) throw new Error(`Todo with id '${input.id}' not found.`);
      return todo;
    }

    case "deleteTodo": {
      if (!input.id) throw new Error("deleteTodo requires an id.");
      const todo = await todoService.deleteTodo(userId, input.id);
      if (!todo) throw new Error(`Todo with id '${input.id}' not found.`);
      return { deleted: true, id: input.id, title: todo.title };
    }

    default:
      throw new Error(`Unknown tool: '${functionName}'. Available tools: getAllTodos, getTodoById, createTodo, updateTodo, deleteTodo.`);
  }
};

// ─── ReAct agent loop ─────────────────────────────────────────────────────────

const MAX_ITERATIONS = 10;

const runAgentWithOpenAI = async (userMessage, userId) => {
  const client = getOpenAIClient();
  if (!client) return null;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: userMessage },
  ];

  const trace = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages,
    });

    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Empty response from OpenAI.");

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("OpenAI returned invalid JSON.");
    }

    trace.push(parsed);
    messages.push({ role: "assistant", content: raw });

    // ── Terminal state: agent has a reply for the user ────────────────────
    if (parsed.type === "output") {
      return { output: parsed.output, trace };
    }

    // ── Intermediate state: agent is planning ─────────────────────────────
    if (parsed.type === "plan") {
      messages.push({
        role: "user",
        content: JSON.stringify({ type: "system", message: "Good plan. Now take the appropriate action." }),
      });
      continue;
    }

    // ── Intermediate state: agent wants to call a tool ────────────────────
    if (parsed.type === "action") {
      let observation;
      try {
        observation = await executeTool(parsed.function, parsed.input || {}, userId);
      } catch (toolError) {
        observation = { error: toolError.message };
      }

      const observationEntry = { type: "observation", observation };
      trace.push(observationEntry);
      messages.push({
        role: "user",
        content: JSON.stringify(observationEntry),
      });
      continue;
    }

    // ── Unexpected type: bail out gracefully ──────────────────────────────
    trace.push({ type: "observation", observation: { error: `Unexpected response type: ${parsed.type}` } });
    messages.push({
      role: "user",
      content: JSON.stringify({ type: "system", message: "Unexpected response. Please provide your output to the user." }),
    });
  }

  throw new Error("Agent loop exceeded maximum iterations without producing an output.");
};

// ─── Simple keyword fallback (no OpenAI) ─────────────────────────────────────

const runAgentFallback = (userMessage) => {
  const text  = (userMessage || "").trim();
  const lower = text.toLowerCase();

  const matchesAny = (...phrases) => phrases.some((p) => lower.includes(p));

  if (matchesAny("add", "create", "new todo", "new task")) {
    return {
      output: "I need an AI connection to create todos intelligently. Please check your OPENAI_API_KEY and try again.",
      trace: [{ type: "output", output: "OpenAI unavailable." }],
    };
  }

  if (matchesAny("list", "show", "all todos", "my todos")) {
    return {
      output: "I need an AI connection to list todos. Please check your OPENAI_API_KEY and try again.",
      trace: [{ type: "output", output: "OpenAI unavailable." }],
    };
  }

  return {
    output: "I'm currently offline. Please configure OPENAI_API_KEY to use the AI assistant.",
    trace: [{ type: "output", output: "OpenAI unavailable." }],
  };
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the ReAct agent for a given user message.
 * @param {string} userMessage
 * @param {string} userId  - MongoDB ObjectId string of the authenticated user
 * @returns {{ output: string, trace: object[] }}
 */
exports.runAgent = async (userMessage, userId) => {
  try {
    const result = await runAgentWithOpenAI(userMessage, userId);
    if (result) return result;
  } catch (error) {
    // Surface the error so the controller can log it properly
    throw error;
  }

  // OpenAI client not configured
  return runAgentFallback(userMessage);
};
