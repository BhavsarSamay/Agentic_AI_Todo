require("dotenv").config();
const { randomUUID } = require("crypto");
const lruCacheModule = require("lru-cache");
const LRUCache = lruCacheModule.LRUCache || lruCacheModule;
const todoService = require("../service/todoService");
const chatHistoryService = require("../service/chatHistoryService");
const logger = require("./logger");
const MongoCheckpointer = require("../checkpointer/mongoCheckpointer");
const ToolCache = require("./toolCache");
const { formatToolResult } = require("./toolResponseFormatter");
const { summarizeOlderMessages, selectContextMessages } = require("./contextSelector");

const TODO_CATEGORIES = ["work", "personal", "shopping", "health", "other"];
const TODO_PRIORITIES = ["low", "medium", "high", "urgent"];
const MAX_RETRIES = 3;
const MAX_MESSAGES = 10;
const TOOL_CACHE_TTL_MS = 1000 * 30;

const SYSTEM_PROMPT = `
You are an AI To-Do List Assistant.
You can manage tasks by adding, viewing, updating, and deleting them.

Rules:
- Use tools for data operations whenever needed.
- Never expose internal errors.
- Keep responses short, clear, and user-friendly.
- If a request is ambiguous, ask a concise clarification question.
- Ask for confirmation before destructive actions like delete.
- Current Date: ${new Date().toISOString()}
`;

let langGraphModulesPromise;
const userAgentCache = new LRUCache({
  max: 1000,
  ttl: 1000 * 60 * 60 * 2,
});
const toolCache = new ToolCache({ max: 3000, ttl: TOOL_CACHE_TTL_MS });
const globalCheckpointer = new MongoCheckpointer();

const resolveThreadId = (userId, options = {}) => {
  const rawSessionId = options.sessionId || options.threadId || "default";
  const effectiveSessionId = options.resetMemory
    ? `${String(rawSessionId)}:${Date.now()}`
    : String(rawSessionId);

  return `${String(userId)}:${effectiveSessionId}`;
};

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
      START: langgraphMod.START,
      END: langgraphMod.END,
      z: zodMod.z,
    }));
  }

  return langGraphModulesPromise;
};

const withRetry = async (fn, retries = 2) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
};

const withSafeFallback = async (fn, fallbackValue, logPayload = {}) => {
  try {
    return await fn();
  } catch (error) {
    logger.error({ error: error?.message || error, ...logPayload }, "Agent operation failed");
    return fallbackValue;
  }
};

const executeTool = async (functionName, input = {}, userId, trace) => {
  const cacheKeyPayload = { userId, toolName: functionName, input };

  const isReadTool = functionName === "getAllTodos" || functionName === "getTodoById";
  if (isReadTool) {
    const cached = toolCache.get(cacheKeyPayload);
    if (cached !== undefined) {
      logger.debug({ traceId: trace.traceId, functionName }, "Tool cache hit");
      return cached;
    }
  }

  let response;

  switch (functionName) {
    case "getAllTodos": {
      response = await todoService.getAllTodos(userId);
      break;
    }

    case "getTodoById": {
      if (!input.id) throw new Error("getTodoById requires an id.");
      response = await todoService.getTodoById(userId, input.id);
      if (!response) throw new Error(`Todo with id '${input.id}' not found.`);
      break;
    }

    case "createTodo": {
      if (!input.title) throw new Error("createTodo requires a title.");
      response = await todoService.createTodo(userId, {
        title: input.title,
        description: input.description || null,
        category: TODO_CATEGORIES.includes(input.category) ? input.category : "personal",
        priority: TODO_PRIORITIES.includes(input.priority) ? input.priority : "medium",
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      });
      toolCache.clearUser(userId);
      break;
    }

    case "updateTodo": {
      if (!input.id) throw new Error("updateTodo requires an id.");
      const updates = input.updates || {};
      if (updates.status === "completed") updates.completedDate = new Date();
      response = await todoService.updateTodo(userId, input.id, updates);
      if (!response) throw new Error(`Todo with id '${input.id}' not found.`);
      toolCache.clearUser(userId);
      break;
    }

    case "deleteTodo": {
      if (!input.id) throw new Error("deleteTodo requires an id.");
      if (input.confirm !== true) {
        throw new Error("Delete requires confirmation. Ask the user to confirm and then call deleteTodo with confirm=true.");
      }
      const deleted = await todoService.deleteTodo(userId, input.id);
      if (!deleted) throw new Error(`Todo with id '${input.id}' not found.`);
      response = { deleted: true, id: input.id, title: deleted.title };
      toolCache.clearUser(userId);
      break;
    }

    default:
      throw new Error(
        `Unknown tool: '${functionName}'. Available tools: getAllTodos, getTodoById, createTodo, updateTodo, deleteTodo.`
      );
  }

  if (isReadTool) {
    toolCache.set(cacheKeyPayload, response);
  }

  return response;
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
    async () => executeTool("getAllTodos", {}, userId, {}),
    {
      name: "getAllTodos",
      description: "Retrieve all todos for the authenticated user",
      schema: z.object({}),
    }
  );

  const getTodoByIdTool = tool(
    async ({ id }) => executeTool("getTodoById", { id }, userId, {}),
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
      executeTool("createTodo", { title, description, category, priority, dueDate }, userId, {}),
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
    async ({ id, updates }) => executeTool("updateTodo", { id, updates }, userId, {}),
    {
      name: "updateTodo",
      description: "Update an existing todo by id",
      schema: z.object({
        id: z.string().describe("Todo id"),
        updates: z
          .object({
            title: z.string().optional(),
            description: z.string().nullable().optional(),
            category: z.enum(["work", "personal", "shopping", "health", "other"]).optional(),
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
    async ({ id, confirm }) => executeTool("deleteTodo", { id, confirm }, userId, {}),
    {
      name: "deleteTodo",
      description: "Delete a todo by id. Requires confirm=true.",
      schema: z.object({
        id: z.string().describe("Todo id"),
        confirm: z.boolean().optional(),
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
    route: new ReducedValue(
      z.enum(["direct", "tool", "clarify", "full"]).default("full"),
      { reducer: (_x, y) => y }
    ),
    retryCount: new ReducedValue(z.number().default(0), {
      reducer: (_x, y) => y,
    }),
    reflection: new ReducedValue(
      z
        .object({
          isGood: z.boolean(),
          feedback: z.string(),
        })
        .nullable()
        .default(null),
      { reducer: (_x, y) => y }
    ),
    reflectionParseFailed: new ReducedValue(z.boolean().default(false), {
      reducer: (_x, y) => y,
    }),
    toolOutputText: new ReducedValue(z.string().default(""), {
      reducer: (_x, y) => y,
    }),
    stopAfterTool: new ReducedValue(z.boolean().default(false), {
      reducer: (_x, y) => y,
    }),
  });

  const normalizeText = (content) => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && typeof item.text === "string") {
            return item.text;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return "";
  };

  const parseReflectionJson = (content) => {
    const raw = normalizeText(content).trim();
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.isGood !== "boolean" || typeof parsed?.feedback !== "string") {
        return null;
      }
      return parsed;
    } catch (_error) {
      return null;
    }
  };

  const parseDecisionJson = (content) => {
    const raw = normalizeText(content).trim();
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && ["direct", "tool", "clarify", "full"].includes(parsed.route)) {
        return parsed.route;
      }
      return null;
    } catch (_error) {
      return null;
    }
  };

  const getLatestHumanInput = (messages) => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message && HumanMessage.isInstance(message)) {
        return normalizeText(message.content).trim();
      }
    }
    return "";
  };

  const shouldSkipReflection = (content) => {
    const text = normalizeText(content).trim();
    if (!text) return true;
    if (text.length <= 25) return true;
    return /^(ok|okay|done|sure|got it|completed|updated|deleted|created)[.!]?$/i.test(text);
  };

  /**
   * The Decision Node acts as an intent router in the LangGraph chain.
   * It analyzes the user input locally using basic RegExp, 
   * or a fast, single-invocation LLM call to classify the intent.
   * Based on intent ("direct", "tool", "clarify", "full"), it sets graph execution logic limits,
   * bypassing full LLM tool reasoning cycles for simple queries.
   * 
   * @param {Object} state LangGraph messages and retry scopes
   * @returns {Object} Adjusted state denoting chosen `route` mode
   */
  const decisionNode = async (state) => {
    const latestQuery = getLatestHumanInput(state.messages);
    const normalizedQuery = latestQuery.trim();

    if (!normalizedQuery) {
      return {
        route: "clarify",
        reflection: null,
        reflectionParseFailed: false,
        retryCount: 0,
      };
    }

    if (/^(hi|hello|hey|thanks|thank you|bye)[.!?]?$/i.test(normalizedQuery)) {
      return {
        route: "direct",
        reflection: null,
        reflectionParseFailed: false,
        retryCount: 0,
      };
    }

    const decisionResponse = await withRetry(
      () => model.invoke([
        new SystemMessage(
          "Classify user intent for a TODO assistant. Return STRICT JSON only: {\"route\": \"direct\" | \"tool\" | \"clarify\" | \"full\"}. direct: simple conversation/help, tool: concrete CRUD action possible now, clarify: missing required details, full: complex reasoning task."
        ),
        new HumanMessage(`User query: ${latestQuery}`),
      ]),
      2
    );

    const route = parseDecisionJson(decisionResponse?.content) || "full";

    return {
      route,
      reflection: null,
      reflectionParseFailed: false,
      retryCount: 0,
      stopAfterTool: false,
      toolOutputText: "",
    };
  };

  const routeFromDecision = (state) => {
    if (state.route === "direct") return "directNode";
    if (state.route === "clarify") return "clarifyNode";
    return "llmCall";
  };

  /**
   * The Direct Node intercepts basic conversations and returns immediate, 
   * LLM-generated conversational output without inspecting available CRUD tools.
   * Useful for "hello" / "goodbye" queries to keep execution cost optimal.
   * 
   * @param {Object} state Expected to have simple unstructured user input
   * @returns {Object} Directly appended AIMessage ignoring tools processing
   */
  const directNode = async (state) => {
    const response = await withRetry(
      () => model.invoke([new SystemMessage(SYSTEM_PROMPT), ...state.messages]),
      2
    );

    return { messages: [response], llmCalls: 1 };
  };

  /**
   * The Clarify Node intentionally limits the AI processing capability solely asking the user
   * a single necessary follow up question before initiating execution. 
   * This is helpful for ambiguous queries missing required data objects.
   * 
   * @param {Object} state Expected to lack required CRUD info inputs
   * @returns {Object} Follow-up conversational AI response prompting clarification
   */
  const clarifyNode = async (state) => {
    const response = await withRetry(
      () => model.invoke([
        new SystemMessage(
          "Ask exactly one concise clarification question to gather missing required details before performing the request."
        ),
        ...state.messages,
      ]),
      2
    );

    return { messages: [response], llmCalls: 1 };
  };

  /**
   * Main complex reasoning and AI invocation Node utilizing OpenAI bound with tools.
   * Compiles summarized conversation history ensuring optimal context size.
   * Handles re-evaluating the feedback object from internal Critic `reflectorNode`
   * and subsequently prompting the main LLM to revise errors.
   * 
   * @param {Object} state LangGraph messages history including reflexion feedback
   * @returns {Object} Response object containing populated AIMessages, Tool Calls and state syncs
   */
  const llmCall = async (state) => {
    const reflectionFeedback = state.reflection;
    const hasFeedback =
      reflectionFeedback
      && reflectionFeedback.isGood === false
      && typeof reflectionFeedback.feedback === "string"
      && reflectionFeedback.feedback.trim().length;

    const selectedMessages = selectContextMessages({
      messages: state.messages,
      HumanMessage,
      AIMessage,
      ToolMessage,
      maxMessages: MAX_MESSAGES,
    });

    const summary = summarizeOlderMessages(state.messages, MAX_MESSAGES);

    const promptMessages = [new SystemMessage(SYSTEM_PROMPT)];
    if (summary) {
      promptMessages.push(new SystemMessage(summary));
    }
    promptMessages.push(...selectedMessages);

    if (hasFeedback) {
      promptMessages.push(
        new SystemMessage(
          "Revise your previous answer using critic feedback. Improve correctness and keep it concise."
        ),
        new HumanMessage(`Critic feedback: ${reflectionFeedback.feedback}`)
      );
    }

    const response = await withRetry(() => modelWithTools.invoke(promptMessages), 2);

    return {
      messages: [response],
      llmCalls: 1,
      reflection: null,
      reflectionParseFailed: false,
      stopAfterTool: false,
      toolOutputText: "",
    };
  };

  /**
   * Action executing toolNode handles safe execution of functions requested.
   * Isolates error boundaries, ensuring missing/broken tools return context stringified natively, 
   * enabling `llmCall` subsequent reflection capabilities without halting execution.
   * If intent route restricts deep traversal, `stopAfterTool` flags the final stage node.
   * 
   * @param {Object} state Pre-populated state where the most recent AIMessage has tool_calls
   * @returns {Object} ToolMessages appended encapsulating successful or errored API operation contexts
   */
  const toolNode = async (state) => {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
      return { messages: [], stopAfterTool: false, toolOutputText: "" };
    }

    const resultMessages = [];
    const formattedParts = [];
    let hasUnknownTool = false;
    let hasError = false;

    for (const toolCall of lastMessage.tool_calls ?? []) {
      const selectedTool = toolsByName[toolCall.name];

      if (!selectedTool) {
        hasUnknownTool = true;
        hasError = true;
        const strictError = {
          error: `Unknown tool call '${toolCall.name}'. Allowed: ${Object.keys(toolsByName).join(", ")}`,
        };
        resultMessages.push(
          new ToolMessage({
            content: JSON.stringify(strictError),
            tool_call_id: toolCall.id,
          })
        );
        formattedParts.push(formatToolResult({ toolName: toolCall.name, observation: strictError }));
        continue;
      }

      const observation = await withSafeFallback(
        async () => selectedTool.invoke(toolCall.args || {}),
        { error: "Tool execution failed." },
        { toolName: toolCall.name }
      );

      if (observation?.error) {
        hasError = true;
      }

      resultMessages.push(
        new ToolMessage({
          content: JSON.stringify(observation),
          tool_call_id: toolCall.id,
        })
      );
      formattedParts.push(formatToolResult({ toolName: toolCall.name, observation }));
    }

    const canEarlyExit = state.route === "tool" && !hasError && !hasUnknownTool && formattedParts.length > 0;

    return {
      messages: resultMessages,
      stopAfterTool: canEarlyExit,
      toolOutputText: formattedParts.join("\n"),
    };
  };

  const toolRoute = (state) => {
    if (state.stopAfterTool) return "toolResponseNode";
    return "llmCall";
  };

  const toolResponseNode = async (state) => {
    const text = state.toolOutputText?.trim() || "Done.";
    return {
      messages: [new AIMessage({ content: text })],
      stopAfterTool: false,
      toolOutputText: "",
    };
  };

  const shouldContinue = (state) => {
    const lastMessage = state.messages.at(-1);
    if (!lastMessage || !AIMessage.isInstance(lastMessage)) return END;
    if (lastMessage.tool_calls?.length) return "toolNode";
    return "reflectorNode";
  };

  /**
   * Reflector Critic Node. Takes the previously calculated unstructured response of AIMessage 
   * and provides rigorous programmatic critique. Re-prompts the core logic node (`llmCall`) 
   * upon identifying hallucinated data, lacking conciseness, or poorly formatted objects.
   * 
   * @param {Object} state Recent state objects evaluated from user facing perspective
   * @returns {Object} JSON formatted reflexion metadata with pass/fail boolean flag and textual feedback reason
   */
  const reflectorNode = async (state) => {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
      return { reflection: { isGood: true, feedback: "No assistant output to reflect." } };
    }

    if (shouldSkipReflection(lastMessage.content)) {
      return { reflection: { isGood: true, feedback: "Reflection skipped for simple response." } };
    }

    const criticResponse = await withRetry(
      () => model.invoke([
        new SystemMessage(
          "You are a strict AI critic. Return STRICT JSON only: {\"isGood\": true/false, \"feedback\": \"string\"}."
        ),
        new HumanMessage(`Assistant response to evaluate:\n${normalizeText(lastMessage.content)}`),
      ]),
      2
    );

    const parsedReflection = parseReflectionJson(criticResponse?.content);

    if (!parsedReflection) {
      return {
        reflection: { isGood: true, feedback: "Reflection parse failed. Ending safely." },
        reflectionParseFailed: true,
      };
    }
    
    return {
      reflection: parsedReflection,
      retryCount: parsedReflection.isGood ? state.retryCount : state.retryCount + 1,
    };
  };

  const shouldRetry = (state) => {
    if (state.reflectionParseFailed) return END;
    if (!state.reflection || state.reflection.isGood) return END;
    if (state.retryCount >= MAX_RETRIES) return END;
    return "llmCall";
  };

  /**
   * Final assembled StateGraph configuring explicit conditional edges defining execution patterns.
   * `decisionNode` maps route outcomes into `directNode`, `clarifyNode`, or `llmCall`.
   * Feedback reflection iterates between `reflectorNode` and `llmCall` optimizing correctness before exiting graph.
   * Global memory enables asynchronous checkpointers synchronization.
   */
  const agent = new StateGraph(MessagesState)
    .addNode("decisionNode", decisionNode)
    .addNode("directNode", directNode)
    .addNode("clarifyNode", clarifyNode)
    .addNode("llmCall", llmCall)
    .addNode("toolNode", toolNode)
    .addNode("toolResponseNode", toolResponseNode)
    .addNode("reflectorNode", reflectorNode)
    .addEdge(START, "decisionNode")
    .addConditionalEdges("decisionNode", routeFromDecision, [
      "directNode",
      "clarifyNode",
      "llmCall",
    ])
    .addEdge("directNode", END)
    .addEdge("clarifyNode", END)
    .addConditionalEdges("llmCall", shouldContinue, ["toolNode", "reflectorNode", END])
    .addConditionalEdges("toolNode", toolRoute, ["toolResponseNode", "llmCall"])
    .addEdge("toolResponseNode", END)
    .addConditionalEdges("reflectorNode", shouldRetry, ["llmCall", END])
    .compile({ checkpointer: globalCheckpointer });

  return {
    run: async (command, options = {}) => {
      const traceId = options.traceId || randomUUID();
      let effectiveThreadId = resolveThreadId(userId, options);
      const requestLogger = logger.child({ traceId, userId: String(userId), threadId: effectiveThreadId });

      requestLogger.info({ commandPreview: String(command).slice(0, 120) }, "Agent request started");

      await withSafeFallback(
        async () => chatHistoryService.saveMessage({
          userId: String(userId),
          threadId: effectiveThreadId,
          role: 1,
          message: String(command),
        }),
        null,
        { traceId, stage: "save_user_message" }
      );

      const invokeAgent = async (threadIdToUse) => agent.invoke(
        {
          messages: [new HumanMessage(command)],
        },
        {
          configurable: {
            thread_id: String(threadIdToUse),
            user_id: String(userId),
          },
          runName: "todo-ai-langgraph-agent",
          tags: ["todo-ai", "langgraph", "agent-command"],
          metadata: {
            traceId,
            userId: String(userId),
            threadId: String(threadIdToUse),
            endpoint: "/api/v1/agent/command/langgraph",
          },
        }
      );

      let result;

      try {
        result = await invokeAgent(effectiveThreadId);
      } catch (error) {
        const errorMessage = error?.message || "";
        const hasCorruptedHistoryShape = errorMessage.includes("Missing required parameter:")
          && errorMessage.includes("messages[")
          && errorMessage.includes("content[0].type");

        if (!hasCorruptedHistoryShape) {
          requestLogger.error({ error: errorMessage }, "Agent invocation failed");
          return {
            output: "I couldn’t process that request right now. Please try again.",
            trace: [],
          };
        }

        const recoveredThreadId = `${String(userId)}:recovered:${Date.now()}`;
        effectiveThreadId = recoveredThreadId;

        await withSafeFallback(
          async () => chatHistoryService.saveMessage({
            userId: String(userId),
            threadId: effectiveThreadId,
            role: 1,
            message: String(command),
          }),
          null,
          { traceId, stage: "save_recovered_user_message" }
        );

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

      await withSafeFallback(
        async () => chatHistoryService.saveMessage({
          userId: String(userId),
          threadId: effectiveThreadId,
          role: 2,
          message: output,
        }),
        null,
        { traceId, stage: "save_assistant_message" }
      );

      requestLogger.info({ llmCalls: result.llmCalls }, "Agent request completed");

      return {
        output,
        trace: result.messages,
      };
    },
  };
};

exports.runLangGraphAgent = async (userMessage, userId, options = {}) => {
  const sessionScope = options.sessionId || options.threadId || "default";
  const cacheKey = `${String(userId)}:${String(sessionScope)}`;
  let agent = userAgentCache.get(cacheKey);

  if (!agent) {
    agent = await buildAgent(userId);
    userAgentCache.set(cacheKey, agent);
  }

  return agent.run(userMessage, options);
};

exports.clearLangGraphMemory = (userId) => {
  const prefix = `${String(userId)}:`;
  let deleted = false;

  for (const key of userAgentCache.keys()) {
    if (String(key).startsWith(prefix)) {
      userAgentCache.delete(key);
      deleted = true;
    }
  }

  toolCache.clearUser(userId);
  return deleted;
};
