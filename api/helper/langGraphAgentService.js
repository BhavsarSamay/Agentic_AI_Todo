require("dotenv").config();
const todoService = require("../service/todoService");

const TODO_CATEGORIES = ["work", "personal", "shopping", "health", "other"];
const TODO_PRIORITIES = ["low", "medium", "high", "urgent"];

const SYSTEM_PROMPT = `
You are an AI To-Do List Assistant.
You can manage tasks by adding, viewing, updating, and deleting them.

Rules:
- Use tools for data operations whenever needed.
- Never expose internal errors.
- Keep responses short, clear, and user-friendly.
- If a request is ambiguous, ask a concise clarification question.
- Current Date: ${new Date().toISOString()}
`;

let langGraphModulesPromise;
const userAgentCache = new Map();

const loadLangGraphModules = async () => {
  if (!langGraphModulesPromise) {
    langGraphModulesPromise = Promise.all([
      import("@langchain/core/tools"),
      import("@langchain/core/messages"),
      import("@langchain/openai"),
      import("@langchain/langgraph"),
      import("zod"),
    ]).then(([toolsMod, messagesMod, openaiMod, langgraphMod, zodMod]) => ({
      tool: toolsMod.tool,
      HumanMessage: messagesMod.HumanMessage,
      SystemMessage: messagesMod.SystemMessage,
      AIMessage: messagesMod.AIMessage,
      ToolMessage: messagesMod.ToolMessage,
      ChatOpenAI: openaiMod.ChatOpenAI,
      StateGraph: langgraphMod.StateGraph,
      StateSchema: langgraphMod.StateSchema,
      MessagesValue: langgraphMod.MessagesValue,
      ReducedValue: langgraphMod.ReducedValue,
      MemorySaver: langgraphMod.MemorySaver,
      START: langgraphMod.START,
      END: langgraphMod.END,
      z: zodMod.z,
    }));
  }

  return langGraphModulesPromise;
};

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
      throw new Error(
        `Unknown tool: '${functionName}'. Available tools: getAllTodos, getTodoById, createTodo, updateTodo, deleteTodo.`
      );
  }
};

const buildAgent = async (userId) => {
  const {
    tool,
    HumanMessage,
    SystemMessage,
    AIMessage,
    ToolMessage,
    ChatOpenAI,
    StateGraph,
    StateSchema,
    MessagesValue,
    ReducedValue,
    MemorySaver,
    START,
    END,
    z,
  } = await loadLangGraphModules();

  if (!process.env.OPENAI_API_KEY) {
    return {
      run: async () => ({
        output:
          "I'm currently offline. Please configure OPENAI_API_KEY to use the AI assistant.",
        trace: [{ type: "output", output: "OpenAI unavailable." }],
      }),
    };
  }

  const model = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o",
    temperature: 0,
  });

  const getAllTodosTool = tool(
    async () => executeTool("getAllTodos", {}, userId),
    {
      name: "getAllTodos",
      description: "Retrieve all todos for the authenticated user",
      schema: z.object({}),
    }
  );

  const getTodoByIdTool = tool(
    async ({ id }) => executeTool("getTodoById", { id }, userId),
    {
      name: "getTodoById",
      description: "Get a specific todo by id",
      schema: z.object({
        id: z.string().describe("Todo id"),
      }),
    }
  );

  const createTodoTool = tool(
    async ({ title, description, category, priority, dueDate }) =>
      executeTool(
        "createTodo",
        { title, description, category, priority, dueDate },
        userId
      ),
    {
      name: "createTodo",
      description: "Create a new todo",
      schema: z.object({
        title: z.string().describe("Todo title"),
        description: z.string().nullable().optional(),
        category: z
          .enum(["work", "personal", "shopping", "health", "other"])
          .nullable()
          .optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).nullable().optional(),
        dueDate: z.string().nullable().optional(),
      }),
    }
  );

  const updateTodoTool = tool(
    async ({ id, updates }) => executeTool("updateTodo", { id, updates }, userId),
    {
      name: "updateTodo",
      description: "Update an existing todo by id",
      schema: z.object({
        id: z.string().describe("Todo id"),
        updates: z
          .object({
            title: z.string().optional(),
            description: z.string().nullable().optional(),
            category: z
              .enum(["work", "personal", "shopping", "health", "other"])
              .optional(),
            priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
            status: z.enum(["pending", "in-progress", "completed", "archived"]).optional(),
            dueDate: z.string().nullable().optional(),
            tags: z.array(z.string()).optional(),
            isStarred: z.boolean().optional(),
            notes: z.string().nullable().optional(),
            color: z.string().optional(),
          })
          .describe("Fields to update"),
      }),
    }
  );

  const deleteTodoTool = tool(
    async ({ id }) => executeTool("deleteTodo", { id }, userId),
    {
      name: "deleteTodo",
      description: "Delete a todo by id",
      schema: z.object({
        id: z.string().describe("Todo id"),
      }),
    }
  );

  const toolsByName = {
    [getAllTodosTool.name]: getAllTodosTool,
    [getTodoByIdTool.name]: getTodoByIdTool,
    [createTodoTool.name]: createTodoTool,
    [updateTodoTool.name]: updateTodoTool,
    [deleteTodoTool.name]: deleteTodoTool,
  };

  const tools = Object.values(toolsByName);
  const modelWithTools = model.bindTools(tools);

  const MessagesState = new StateSchema({
    messages: MessagesValue,
    llmCalls: new ReducedValue(z.number().default(0), {
      reducer: (x, y) => x + y,
    }),
  });

  const llmCall = async (state) => {
    const response = await modelWithTools.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      ...state.messages,
    ]);

    return {
      messages: [response],
      llmCalls: 1,
    };
  };

  const toolNode = async (state) => {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
      return { messages: [] };
    }

    const result = [];

    for (const toolCall of lastMessage.tool_calls ?? []) {
      const selectedTool = toolsByName[toolCall.name];

      if (!selectedTool) {
        continue;
      }

      try {
        const observation = await selectedTool.invoke(toolCall.args || {});
        const toolMessage = new ToolMessage({
          content: JSON.stringify(observation),
          tool_call_id: toolCall.id,
        });
        result.push(toolMessage);
      } catch (toolError) {
        const errorToolMessage = new ToolMessage({
          content: JSON.stringify({ error: toolError.message }),
          tool_call_id: toolCall.id,
        });
        result.push(errorToolMessage);
      }
    }

    return { messages: result };
  };

  const shouldContinue = (state) => {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
      return END;
    }

    if (lastMessage.tool_calls?.length) {
      return "toolNode";
    }

    return END;
  };

  const agent = new StateGraph(MessagesState)
    .addNode("llmCall", llmCall)
    .addNode("toolNode", toolNode)
    .addEdge(START, "llmCall")
    .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
    .addEdge("toolNode", "llmCall")
    .compile({ checkpointer: new MemorySaver() });

  return {
    run: async (command, options = {}) => {
      const {
        sessionId,
        threadId,
        resetMemory = false,
      } = options;

      const resolvedThreadId = threadId
        || (sessionId ? `${String(userId)}:${String(sessionId)}` : String(userId));
      const effectiveThreadId = resetMemory
        ? `${resolvedThreadId}:${Date.now()}`
        : resolvedThreadId;

      const invokeAgent = async (threadIdToUse) => {
        return agent.invoke(
          {
            messages: [new HumanMessage(command)],
          },
          {
            configurable: {
              thread_id: threadIdToUse,
            },
            runName: "todo-ai-langgraph-agent",
            tags: ["todo-ai", "langgraph", "agent-command"],
            metadata: {
              userId: String(userId),
              threadId: threadIdToUse,
              endpoint: "/api/v1/agent/command/langgraph",
            },
          }
        );
      };

      let result;

      try {
        result = await invokeAgent(effectiveThreadId);
      } catch (error) {
        const errorMessage = error?.message || "";
        const hasCorruptedHistoryShape = errorMessage.includes("Missing required parameter:")
          && errorMessage.includes("messages[")
          && errorMessage.includes("content[0].type");

        if (!hasCorruptedHistoryShape) {
          throw error;
        }

        const recoveredThreadId = `${String(userId)}:recovered:${Date.now()}`;
        result = await invokeAgent(recoveredThreadId);
      }

      const lastMessage = result.messages.at(-1);
      const content = lastMessage?.content;

      let output = "I could not process that request right now.";
      if (typeof content === "string" && content.trim()) {
        output = content;
      } else if (Array.isArray(content)) {
        const textParts = content
          .map((item) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object" && typeof item.text === "string") {
              return item.text;
            }
            return "";
          })
          .filter(Boolean);

        if (textParts.length) {
          output = textParts.join("\n");
        }
      }

      return {
        output,
        trace: result.messages,
      };
    },
  };
};

exports.runLangGraphAgent = async (userMessage, userId, options = {}) => {
  const cacheKey = String(userId);
  let agent = userAgentCache.get(cacheKey);

  if (!agent) {
    agent = await buildAgent(userId);
    userAgentCache.set(cacheKey, agent);
  }

  return agent.run(userMessage, options);
};

exports.clearLangGraphMemory = (userId) => {
  const cacheKey = String(userId);
  return userAgentCache.delete(cacheKey);
};
