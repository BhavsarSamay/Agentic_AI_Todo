require("dotenv").config();
const { randomUUID } = require("crypto");
const todoService = require("../service/todoService");
const chatHistoryService = require("../service/chatHistoryService");
const MongoCheckpointer = require("../checkpointer/mongoCheckpointer");
const { executeTool } = require("./agentService");

const SYSTEM_PROMPT =
	"You are a concise TODO assistant. Keep replies short and practical. Do not expose internal errors.";

const MAX_CONTEXT_MESSAGES = 6;
const CACHE_TTL_MS = 1000 * 45;
const CACHE_MAX = 1000;
const MAX_RETRIES = 1;
const LLM_TIMEOUT_MS = 3000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const GENERIC_TASK_REGEX = /^(create\s*(a\s*)?(todo|task)?|add\s*(a\s*)?(todo|task)?|todo|task|new\s*(todo|task))$/i;
const FILLER_REGEX = /\b(i\s+want\s+to|please|kindly|can\s+you|could\s+you|would\s+you|for\s+me|to\s+do|todo|task|create|add|a|an|the)\b/gi;

// const GREETING_REGEX = /^(hi|hello|hey|thanks|thank you|bye)[.!?]?$/i;
const GREETING_REGEX = /^(hi+|hello+|hey+|hii+|heyy+|thanks+|thank you+|bye+)[.!?]*$/i;
const CRUD_REGEX = /\b(create|add|update|delete|get|list|show|mark|complete|star|unstar)\b/i;

const FAST_RESPONSES = {
	hi: "Hi! What would you like to do with your todos?",
	hello: "Hello! How can I help with your todo list?",
	hey: "Hey! Ready to manage your tasks?",
	thanks: "You're welcome.",
	"thank you": "You're welcome.",
	bye: "Bye! Have a productive day.",
};

let langGraphModulesPromise;
let checkpointer;
const agentByMode = new Map();
const rateLimitStore = new Map();

class SimpleTTLCache {
	constructor({ max = CACHE_MAX, ttl = CACHE_TTL_MS } = {}) {
		this.max = max;
		this.ttl = ttl;
		this.map = new Map();
	}

	get(key) {
		const entry = this.map.get(key);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.map.delete(key);
			return null;
		}

		this.map.delete(key);
		this.map.set(key, entry);
		return entry.value;
	}

	set(key, value) {
		if (this.map.size >= this.max) {
			const oldest = this.map.keys().next().value;
			if (oldest) this.map.delete(oldest);
		}

		this.map.set(key, {
			value,
			expiresAt: Date.now() + this.ttl,
		});
	}
}

const responseCache = new SimpleTTLCache();

const isDev = () => process.env.NODE_ENV === "development";

const debugLog = (...args) => {
	if (isDev()) {
		console.log(...args);
	}
};

const withTimeout = async (promise, timeoutMs, timeoutMessage = "LLM_TIMEOUT") => {
	let timeoutHandle;

	const timeoutPromise = new Promise((_, reject) => {
		timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		clearTimeout(timeoutHandle);
	}
};

const toText = (content) => {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (typeof item === "string") return item;
				if (item && typeof item === "object" && typeof item.text === "string") return item.text;
				return "";
			})
			.filter(Boolean)
			.join("\n");
	}
	return "";
};

const withRetry = async (fn, retries = MAX_RETRIES) => {
	let lastError;
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (attempt >= retries) break;
		}
	}
	throw lastError;
};

const fireAndForgetHistory = ({ userId, threadId, role, message }) => {
	chatHistoryService
		.saveMessage({
			userId: String(userId),
			threadId: String(threadId),
			role,
			message,
		})
		.catch(() => {});
};

const sanitizeMessagesForGemini = (messages = [], SystemMessage) => {
	return (Array.isArray(messages) ? messages : []).filter((msg) => !(msg instanceof SystemMessage));
};

const safeInvoke = async (model, messages, systemPrompt, SystemMessage) => {
	const cleanedMessages = sanitizeMessagesForGemini(messages, SystemMessage);
	debugLog(cleanedMessages.map((m) => (m && typeof m._getType === "function" ? m._getType() : typeof m)));

	return model.invoke([new SystemMessage(systemPrompt), ...cleanedMessages]);
};

const isRateLimited = (userId) => {
	const key = String(userId);
	const now = Date.now();
	const existing = rateLimitStore.get(key) || [];
	const activeWindow = existing.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

	if (activeWindow.length >= RATE_LIMIT_MAX_REQUESTS) {
		rateLimitStore.set(key, activeWindow);
		return true;
	}

	activeWindow.push(now);
	rateLimitStore.set(key, activeWindow);
	return false;
};

const logExecution = ({ requestId, intent, route, latency }) => {
	if (isDev() || process.env.AI_AGENT_OPTIMAL_LOGS === "true") {
		console.info(
			JSON.stringify({
				requestId,
				intent,
				route,
				latency,
				ts: new Date().toISOString(),
			})
		);
	}
};

const normalizeInput = (text = "") => {
	return text
		.toLowerCase()
		.trim()
		.replace(/(.)\1{2,}/g, "$1") // "hiiii" -> "hi"
		.replace(/[^\w\s]/g, ""); // remove punctuation
};

const classifyIntent = (input = "") => {
	const normalized = normalizeInput(input);
	const compact = normalized.replace(/\s+/g, " ").trim();

	if (!compact) return "unclear";
	if (GREETING_REGEX.test(compact)) return "greeting";

	if (/\b(create|add|new)\b/.test(compact) && /\b(todo|task)\b/.test(compact)) {
		return "create_todo";
	}
	if (/\b(create|add)\b/.test(compact)) return "create_todo";
	if (/\b(update|edit|change|rename|set)\b/.test(compact)) return "update_todo";
	if (/\b(delete|remove)\b/.test(compact)) return "delete_todo";
	if (/\b(get|list|show|find|search|all todos|my todos|what should i do)\b/.test(compact)) return "query_todo";

	if (compact.length < 5 || compact.split(/\s+/).length <= 2) return "unclear";
	return "unclear";
};

const extractTask = (input = "") => {
	if (!input || typeof input !== "string") return null;

	let cleaned = String(input)
		.replace(/^(hi+|hello+|hey+|hii+|heyy+)[\s,!.-]*/i, "")
		.replace(/^(i\s+want\s+to\s+)?(create|add)\s+(a\s+)?(todo|task)\s*(to|for)?\s*/i, "")
		.replace(FILLER_REGEX, " ")
		.replace(/\s{2,}/g, " ")
		.trim();

	cleaned = cleaned
		.replace(/^(to\s+|for\s+)/i, "")
		.replace(/\s+(today|tomorrow)$/i, "")
		.trim();

	if (!cleaned) return null;

	if (/^gym(\s|$)/i.test(cleaned)) {
		cleaned = cleaned.replace(/^gym/i, "go to gym");
	}

	const finalTask = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	return finalTask || null;
};

const validateTask = (task) => {
	if (!task || typeof task !== "string") return false;
	const trimmed = task.trim();
	if (trimmed.length < 3) return false;
	if (GENERIC_TASK_REGEX.test(trimmed)) return false;
	if (/^(create|add|todo|task)\b/i.test(trimmed) && trimmed.split(/\s+/).length <= 2) return false;
	return true;
};

const detectCategoryFromTask = (task = "") => {
	const normalized = normalizeInput(task);
	if (/\b(buy|shop|grocery|market)\b/.test(normalized)) return "shopping";
	if (/\b(gym|run|exercise|doctor|health|workout)\b/.test(normalized)) return "health";
	if (/\b(meeting|office|client|report|project|work)\b/.test(normalized)) return "work";
	return "personal";
};

const persistConversationState = ({
	userId,
	sessionId,
	threadId,
	lastIntent,
	lastTask,
	lastResponse,
}) => {
	const memoryPayload = {
		userId: String(userId),
		sessionId: String(sessionId || "default"),
		threadId: String(threadId),
		lastIntent,
		lastTask,
		lastResponse,
		timestamp: new Date().toISOString(),
	};

	chatHistoryService
		.saveMessage({
			userId: String(userId),
			threadId: String(threadId),
			role: 2,
			message: JSON.stringify(memoryPayload),
		})
		.catch(() => {});
};

// const routeByRegex = (command = "") => {
// 	const text = String(command || "").trim();
// 	const normalized = text.toLowerCase();

// 	if (GREETING_REGEX.test(normalized)) return "fast";
// 	if (!normalized || normalized.length < 5) return "clarify";
// 	if (CRUD_REGEX.test(normalized)) return "tool";
// 	return "direct";
// };
const routeByRegex = (command = "") => {
	const normalized = normalizeInput(command);

	if (GREETING_REGEX.test(normalized)) return "fast";

	// treat very short inputs as greeting-like instead of clarify
	if (normalized.length <= 4) return "fast";

	if (CRUD_REGEX.test(normalized)) return "tool";

	return "direct";
};

const isComplexQuery = (command = "") => {
	const text = String(command || "").trim();
	if (text.length > 180) return true;
	const connectors = (text.match(/\b(and|then|also|after that|while)\b/gi) || []).length;
	return connectors >= 2;
};

const parseCreatePayload = (command) => {
	const cleaned = String(command)
		.replace(/^(create|add)\s+(a\s+)?(todo|task)?\s*(to)?\s*/i, "")
		.trim();

	const priorityMatch = cleaned.match(/\b(low|medium|high|urgent)\b/i);
	const categoryMatch = cleaned.match(/\b(work|personal|shopping|health|other)\b/i);
	const dueDateMatch = cleaned.match(/\bby\s+([\w\s,\-/]+)$/i);

	const title = cleaned
		.replace(/\b(low|medium|high|urgent)\b/gi, "")
		.replace(/\b(work|personal|shopping|health|other)\b/gi, "")
		.replace(/\bby\s+[\w\s,\-/]+$/i, "")
		.replace(/\s{2,}/g, " ")
		.trim();

	return {
		title: title || "Untitled task",
		priority: priorityMatch ? priorityMatch[1].toLowerCase() : "medium",
		category: categoryMatch ? categoryMatch[1].toLowerCase() : "personal",
		dueDate: dueDateMatch ? new Date(dueDateMatch[1]) : null,
	};
};

const parseObjectId = (command) => {
	const match = String(command).match(/\b[a-f\d]{24}\b/i);
	return match ? match[0] : null;
};

const executeToolRoute = async ({ command, userId }) => {
	const text = String(command).trim();
	const normalized = text.toLowerCase();

	if (/\b(create|add)\b/.test(normalized)) {
		const payload = parseCreatePayload(text);
		const todo = await executeTool(
			"createTodo",
			{
				title: payload.title,
				description: null,
				category: payload.category || "personal",
				priority: payload.priority || "medium",
				dueDate: payload.dueDate || null,
			},
			userId
		);
		return { output: `✅ Todo created: ${todo.title}`, route: "tool" };
	}

	if (/\b(list|show|get all|all todos)\b/.test(normalized)) {
		const todos = await todoService.getAllTodos(userId, { limit: 10, page: 1 });
		if (!todos.length) return { output: "You have no todos yet.", route: "tool" };
		const summary = todos
			.slice(0, 5)
			.map((todo, idx) => `${idx + 1}. ${todo.title} [${todo.status}]`)
			.join("\n");
		return { output: summary, route: "tool" };
	}

	if (/\b(delete|remove)\b/.test(normalized)) {
		const todoId = parseObjectId(text);
		if (!todoId) return { output: "Please provide the todo id to delete.", route: "clarify" };
		const deleted = await todoService.deleteTodo(userId, todoId);
		if (!deleted) return { output: "Todo not found.", route: "tool" };
		return { output: `Deleted todo: ${deleted.title}`, route: "tool" };
	}

	if (/\b(complete|mark)\b/.test(normalized)) {
		const todoId = parseObjectId(text);
		if (!todoId) return { output: "Please provide the todo id to mark completed.", route: "clarify" };
		const completed = await todoService.markTodoCompleted(userId, todoId);
		if (!completed) return { output: "Todo not found.", route: "tool" };
		return { output: `Marked as completed: ${completed.title}`, route: "tool" };
	}

	if (/\b(update|edit)\b/.test(normalized)) {
		const todoId = parseObjectId(text);
		if (!todoId) return { output: "Please provide the todo id to update.", route: "clarify" };

		const updates = {};
		const statusMatch = text.match(/\b(pending|in-progress|completed|archived)\b/i);
		const priorityMatch = text.match(/\b(low|medium|high|urgent)\b/i);
		if (statusMatch) updates.status = statusMatch[1].toLowerCase();
		if (priorityMatch) updates.priority = priorityMatch[1].toLowerCase();

		if (!Object.keys(updates).length) {
			return { output: "Tell me what to update (status or priority).", route: "clarify" };
		}

		const updated = await todoService.updateTodo(userId, todoId, updates);
		if (!updated) return { output: "Todo not found.", route: "tool" };
		return { output: `Updated todo: ${updated.title}`, route: "tool" };
	}

	if (/\b(get|show)\b/.test(normalized)) {
		const todoId = parseObjectId(text);
		if (!todoId) return { output: "Please provide the todo id.", route: "clarify" };
		const todo = await todoService.getTodoById(userId, todoId);
		if (!todo) return { output: "Todo not found.", route: "tool" };
		return {
			output: `${todo.title}\nStatus: ${todo.status}\nPriority: ${todo.priority}\nCategory: ${todo.category}`,
			route: "tool",
		};
	}

	return { output: "I can help with create, list, get, update, complete, and delete actions.", route: "clarify" };
};

const loadLangGraphModules = async () => {
	if (!langGraphModulesPromise) {
		langGraphModulesPromise = Promise.all([
			import("@langchain/core/messages"),
			import("@langchain/google-genai"),
			import("@langchain/langgraph"),
			import("zod"),
		]).then(([messagesMod, googleMod, langgraphMod, zodMod]) => ({
			HumanMessage: messagesMod.HumanMessage,
			SystemMessage: messagesMod.SystemMessage,
			AIMessage: messagesMod.AIMessage,
			ChatGoogleGenerativeAI: googleMod.ChatGoogleGenerativeAI,
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

const preload = async () => {
	await loadLangGraphModules();

	if (process.env.GEMINI_API_KEY) {
		await Promise.all([
			getAgent({ useCheckpointer: false }),
			getAgent({ useCheckpointer: true }),
		]);
	}
};

const buildAgent = async ({ useCheckpointer = false } = {}) => {
	const {
		HumanMessage,
		SystemMessage,
		AIMessage,
		ChatGoogleGenerativeAI,
		StateGraph,
		StateSchema,
		MessagesValue,
		ReducedValue,
		START,
		END,
		z,
	} = await loadLangGraphModules();

	if (!process.env.GEMINI_API_KEY) {
		return {
			run: async () => ({
				output: "I'm currently offline. Please configure GEMINI_API_KEY to use the AI assistant.",
				route: "direct",
				llmCalls: 0,
			}),
		};
	}

	const model = new ChatGoogleGenerativeAI({
		apiKey: process.env.GEMINI_API_KEY,
		model: "models/gemini-2.5-flash",
		temperature: 0.3,
		// maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 160),
	});

	const invokeModelWithFallback = async ({
		messages,
		systemPrompt = SYSTEM_PROMPT,
		fallbackText = "Something went wrong, please try again.",
	}) => {
		try {
			const response = await withRetry(
				() => withTimeout(safeInvoke(model, messages, systemPrompt, SystemMessage), LLM_TIMEOUT_MS),
				MAX_RETRIES
			);

			return {
				response,
				text: toText(response.content).trim() || fallbackText,
				ok: true,
			};
		} catch (_error) {
			return {
				response: new AIMessage({ content: fallbackText }),
				text: fallbackText,
				ok: false,
			};
		}
	};

	const MessagesState = new StateSchema({
		messages: MessagesValue,
		route: new ReducedValue(z.enum(["fast", "direct", "tool", "clarify"]).default("direct"), {
			reducer: (_x, y) => y,
		}),
		output: new ReducedValue(z.string().default(""), {
			reducer: (_x, y) => y,
		}),
		llmCalls: new ReducedValue(z.number().default(0), {
			reducer: (x, y) => x + y,
		}),
		userId: new ReducedValue(z.string().default(""), {
			reducer: (_x, y) => y,
		}),
		command: new ReducedValue(z.string().default(""), {
			reducer: (_x, y) => y,
		}),
		isComplex: new ReducedValue(z.boolean().default(false), {
			reducer: (_x, y) => y,
		}),
		enableReflection: new ReducedValue(z.boolean().default(false), {
			reducer: (_x, y) => y,
		}),
	});

	const decisionNode = async (state) => {
		const latestMessage = state.messages.at(-1);
		const text = latestMessage ? toText(latestMessage.content) : state.command;
		const route = routeByRegex(text);

		return { route };
	};

	const directNode = async (state) => {
		const selected = sanitizeMessagesForGemini(state.messages.slice(-MAX_CONTEXT_MESSAGES), SystemMessage);
		const primary = await invokeModelWithFallback({
			messages: selected,
			systemPrompt: SYSTEM_PROMPT,
			fallbackText: "Something went wrong, please try again.",
		});
		let response = primary.response;
		let output = primary.text;
		let llmCalls = 1;

		if (state.enableReflection === true && state.isComplex === true && llmCalls === 1) {
			const revised = await invokeModelWithFallback({
				messages: [
					...selected,
					new AIMessage({ content: output }),
					new HumanMessage("Revise the previous response for clarity and correctness in under 4 lines."),
				],
				systemPrompt: SYSTEM_PROMPT,
				fallbackText: output,
			});

			if (revised.text && revised.text !== output) {
				output = revised.text;
				response = revised.response;
			}
			llmCalls = 2;
		}

		return {
			messages: [response],
			output,
			llmCalls,
			route: "direct",
		};
	};

	const clarifyNode = async (state) => {
		const selected = sanitizeMessagesForGemini(state.messages.slice(-MAX_CONTEXT_MESSAGES), SystemMessage);
		const responseResult = await invokeModelWithFallback({
			messages: [
				...selected,
				new HumanMessage("Ask one concise clarification question to proceed with the todo request."),
			],
			systemPrompt: SYSTEM_PROMPT,
			fallbackText: "Could you share a bit more detail?",
		});

		return {
			messages: [responseResult.response],
			output: responseResult.text,
			llmCalls: 1,
			route: "clarify",
		};
	};

	const toolNode = async (state) => {
		const result = await executeToolRoute({ command: state.command, userId: state.userId });
		return {
			output: result.output,
			route: result.route,
			llmCalls: 0,
		};
	};

	const routeFromDecision = (state) => {
		if (state.route === "tool") return "toolNode";
		if (state.route === "clarify") return "clarifyNode";
		return "directNode";
	};

	const compileOptions = {};
	if (useCheckpointer) {
		if (!checkpointer) {
			checkpointer = new MongoCheckpointer();
		}
		compileOptions.checkpointer = checkpointer;
	}

	const graph = new StateGraph(MessagesState)
		.addNode("decisionNode", decisionNode)
		.addNode("directNode", directNode)
		.addNode("clarifyNode", clarifyNode)
		.addNode("toolNode", toolNode)
		.addEdge(START, "decisionNode")
		.addConditionalEdges("decisionNode", routeFromDecision, ["directNode", "clarifyNode", "toolNode"])
		.addEdge("directNode", END)
		.addEdge("clarifyNode", END)
		.addEdge("toolNode", END)
		.compile(compileOptions);

	return {
		run: async ({ command, userId, threadId, traceId, enableReflection }) => {
			const result = await graph.invoke(
				{
					messages: [new HumanMessage(command)],
					command,
					userId: String(userId),
					isComplex: isComplexQuery(command),
					enableReflection: Boolean(enableReflection),
				},
				{
					configurable: {
						user_id: String(userId),
						thread_id: String(threadId),
					},
					runName: "todo-ai-optimal-agent",
					tags: ["todo-ai", "langgraph", "optimal", process.env.LANGSMITH_TRACING === "true" ? "tracing" : "no-tracing"],
					metadata: {
						traceId,
						endpoint: "/api/v1/ai-agent-optimal",
						userId: String(userId),
					},
				}
			);

			return {
				output: result.output || "I couldn't process that request right now.",
				route: result.route || "direct",
				llmCalls: result.llmCalls || 0,
			};
		},
	};
};

const getAgent = async ({ useCheckpointer }) => {
	const key = useCheckpointer ? "with-checkpointer" : "without-checkpointer";
	if (!agentByMode.has(key)) {
		const agent = await buildAgent({ useCheckpointer });
		agentByMode.set(key, agent);
	}
	return agentByMode.get(key);
};

const runOptimalAgent = async (command, userId, options = {}) => {
	const startedAt = Date.now();

	try {
		const message = String(command || "").trim();
        const normalized = normalizeInput(message);
		const routeHint = routeByRegex(message);
		const intent = classifyIntent(message);
		const requestId = options.traceId || randomUUID();

        if (!message || normalizeInput(message).length === 0) {			
            logExecution({ requestId, intent: "unclear", route: "clarify", latency: `${Date.now() - startedAt}ms` });
            return {
				response: "Please provide a command.",
				route: "clarify",
				latency: `${Date.now() - startedAt}ms`,
				llmCalls: 0,
			};
		}

		// if (isRateLimited(userId)) {
		// 	return {
		// 		response: "Too many requests, please slow down.",
		// 		route: "clarify",
		// 		latency: `${Date.now() - startedAt}ms`,
		// 		llmCalls: 0,
		// 	};
		// }

		if (routeHint === "fast") {
            const key = normalized.split(" ")[0]; // handle "hi there"

            const response =
	        FAST_RESPONSES[key] ||
	        "Hi! What would you like to do with your todos?";
			logExecution({ requestId, intent: "greeting", route: "fast", latency: `${Date.now() - startedAt}ms` });
			return {
				response,
				route: "fast",
				latency: `${Date.now() - startedAt}ms`,
				llmCalls: 0,
			};
		}

        	if (isRateLimited(userId)) {
				logExecution({ requestId, intent, route: "clarify", latency: `${Date.now() - startedAt}ms` });
			return {
				response: "Too many requests, please slow down.",
				route: "clarify",
				latency: `${Date.now() - startedAt}ms`,
				llmCalls: 0,
			};
		}


		const cacheKey = `${String(userId)}:${routeHint}:${normalized.slice(0, 100)}`;
		const cached = responseCache.get(cacheKey);
		if (cached) {
			return {
				...cached,
				latency: `${Date.now() - startedAt}ms`,
			};
		}

		const sessionId = options.sessionId || "default";
		const threadId = options.threadId || `${String(userId)}:optimal:${String(sessionId)}`;
		const traceId = requestId;

		fireAndForgetHistory({
			userId,
			threadId,
			role: 1,
			message,
		});

		if (intent === "unclear") {
			const clarifyResponse = "Could you clarify what you want to do with your todo?";

			fireAndForgetHistory({
				userId,
				threadId,
				role: 2,
				message: clarifyResponse,
			});

			persistConversationState({
				userId,
				sessionId,
				threadId,
				lastIntent: intent,
				lastTask: null,
				lastResponse: clarifyResponse,
			});

			logExecution({ requestId, intent, route: "clarify", latency: `${Date.now() - startedAt}ms` });

			return {
				response: clarifyResponse,
				route: "clarify",
				latency: `${Date.now() - startedAt}ms`,
				llmCalls: 0,
			};
		}

		if (intent === "create_todo") {
			const task = extractTask(message);

			if (!validateTask(task)) {
				const clarifyResponse = "What task should I add? Please provide a clear todo title.";

				fireAndForgetHistory({
					userId,
					threadId,
					role: 2,
					message: clarifyResponse,
				});

				persistConversationState({
					userId,
					sessionId,
					threadId,
					lastIntent: intent,
					lastTask: task,
					lastResponse: clarifyResponse,
				});

				logExecution({ requestId, intent, route: "clarify", latency: `${Date.now() - startedAt}ms` });

				return {
					response: clarifyResponse,
					route: "clarify",
					latency: `${Date.now() - startedAt}ms`,
					llmCalls: 0,
				};
			}

			const structuredInput = {
				title: task,
				description: null,
				category: detectCategoryFromTask(task),
				priority: "medium",
			};

			const createdTodo = await executeTool("createTodo", structuredInput, userId);
			const response = `✅ Todo created: ${createdTodo.title}`;

			fireAndForgetHistory({
				userId,
				threadId,
				role: 2,
				message: response,
			});

			persistConversationState({
				userId,
				sessionId,
				threadId,
				lastIntent: intent,
				lastTask: task,
				lastResponse: response,
			});

			const payload = {
				response,
				route: "tool",
				llmCalls: 0,
			};

			responseCache.set(cacheKey, payload);
			logExecution({ requestId, intent, route: "tool", latency: `${Date.now() - startedAt}ms` });

			return {
				...payload,
				latency: `${Date.now() - startedAt}ms`,
			};
		}

		if (routeHint === "tool" || intent === "update_todo" || intent === "delete_todo" || intent === "query_todo") {
			const toolResult = await executeToolRoute({ command: message, userId });
			const payload = {
				response: toolResult.output || "Something went wrong, please try again.",
				route: toolResult.route || "tool",
				llmCalls: 0,
			};

			fireAndForgetHistory({
				userId,
				threadId,
				role: 2,
				message: payload.response,
			});

			responseCache.set(cacheKey, payload);

			persistConversationState({
				userId,
				sessionId,
				threadId,
				lastIntent: intent,
				lastTask: null,
				lastResponse: payload.response,
			});

			logExecution({ requestId, intent, route: payload.route, latency: `${Date.now() - startedAt}ms` });

			return {
				...payload,
				latency: `${Date.now() - startedAt}ms`,
			};
		}

		const shouldUseCheckpointer =
			options.useCheckpointer === true
			|| (process.env.AI_AGENT_OPTIMAL_CHECKPOINTER === "true" && isComplexQuery(message));

		const agent = await getAgent({ useCheckpointer: shouldUseCheckpointer });
		const result = await agent.run({
			command: message,
			userId,
			threadId,
			traceId,
			enableReflection:
				options.enableReflection === true
				|| (process.env.AI_AGENT_OPTIMAL_ENABLE_REFLECTION === "true" && isComplexQuery(message)),
		});

		const response = result.output || "Something went wrong, please try again.";

		fireAndForgetHistory({
			userId,
			threadId,
			role: 2,
			message: response,
		});

		const payload = {
			response,
			route: result.route || routeHint,
			llmCalls: result.llmCalls || 0,
		};

		responseCache.set(cacheKey, payload);

		persistConversationState({
			userId,
			sessionId,
			threadId,
			lastIntent: intent,
			lastTask: null,
			lastResponse: response,
		});

		logExecution({ requestId, intent, route: payload.route, latency: `${Date.now() - startedAt}ms` });

		return {
			...payload,
			latency: `${Date.now() - startedAt}ms`,
		};
	} catch (_error) {
		logExecution({ requestId: options.traceId || "unknown", intent: "unclear", route: "direct", latency: `${Date.now() - startedAt}ms` });
		return {
			response: "Something went wrong, please try again.",
			route: "direct",
			latency: `${Date.now() - startedAt}ms`,
			llmCalls: 0,
		};
	}
};

module.exports = {
	runOptimalAgent,
	preload,
	classifyIntent,
	extractTask,
	validateTask,
};
