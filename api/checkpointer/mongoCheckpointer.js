const lruCacheModule = require("lru-cache");
const LRUCache = lruCacheModule.LRUCache || lruCacheModule;
const {
  copyCheckpoint,
  getCheckpointId,
  WRITES_IDX_MAP,
} = require("@langchain/langgraph-checkpoint");
const LangGraphCheckpoint = require("../models/LangGraphCheckpoint");
const logger = require("../helper/logger");

const FALLBACK_CACHE_MAX = 1000;
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * A MongoDB implementation for Checkpointer state synchronization.
 * Saves execution threads, restoring conversation history directly inside LangGraph.
 */
class MongoCheckpointer {
  constructor(options = {}) {
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this._fallbackStorage = new LRUCache({ max: options.maxFallback || FALLBACK_CACHE_MAX });
    this._fallbackWrites = new LRUCache({ max: options.maxFallback || FALLBACK_CACHE_MAX });
  }

  _isSystemMessageLike(message) {
    if (!message) return false;

    if (typeof message._getType === "function") {
      return message._getType() === "system";
    }

    if (typeof message.type === "string" && message.type.toLowerCase() === "system") {
      return true;
    }

    if (Array.isArray(message.id) && message.id.some((part) => String(part).includes("SystemMessage"))) {
      return true;
    }

    if (message.kwargs && typeof message.kwargs === "object") {
      if (typeof message.kwargs.type === "string" && message.kwargs.type.toLowerCase() === "system") {
        return true;
      }
      if (Array.isArray(message.kwargs.id) && message.kwargs.id.some((part) => String(part).includes("SystemMessage"))) {
        return true;
      }
    }

    return false;
  }

  _sanitizeMessagesArray(messages) {
    if (!Array.isArray(messages)) return messages;
    return messages.filter((message) => !this._isSystemMessageLike(message));
  }

  _sanitizeCheckpoint(checkpoint) {
    if (!checkpoint || typeof checkpoint !== "object") {
      return checkpoint;
    }

    const sanitized = { ...checkpoint };

    if (sanitized.channel_values && typeof sanitized.channel_values === "object") {
      sanitized.channel_values = { ...sanitized.channel_values };
      if (Array.isArray(sanitized.channel_values.messages)) {
        sanitized.channel_values.messages = this._sanitizeMessagesArray(sanitized.channel_values.messages);
      }
    }

    return sanitized;
  }

  _key(userId, threadId, checkpointNs, checkpointId) {
    return JSON.stringify([String(userId), String(threadId), String(checkpointNs || ""), String(checkpointId)]);
  }

  _resolveUserId(userId, threadId) {
    if (userId !== undefined && userId !== null && String(userId).trim()) {
      return String(userId);
    }

    if (threadId !== undefined && threadId !== null) {
      const [prefix] = String(threadId).split(":");
      if (prefix && prefix.trim()) return String(prefix);
    }

    return null;
  }

  _resolveIdsFromConfig(config) {
    const threadId = config?.configurable?.thread_id != null
      ? String(config.configurable.thread_id)
      : null;
    const userId = this._resolveUserId(config?.configurable?.user_id, threadId);
    const checkpointNs = config?.configurable?.checkpoint_ns != null
      ? String(config.configurable.checkpoint_ns)
      : "";
    const checkpointId = config?.configurable?.checkpoint_id != null
      ? String(config.configurable.checkpoint_id)
      : null;

    return {
      userId,
      threadId,
      checkpointNs,
      checkpointId,
    };
  }

  _toPendingWrites(pendingWrites = []) {
    if (!Array.isArray(pendingWrites)) return [];
    return pendingWrites.map((item) => [String(item.task_id), String(item.channel), item.value]);
  }

  _toPendingWriteDocs(writes = [], taskId) {
    const sanitizedWrites = writes.map(([channel, value]) => {
      if (channel === "messages" && Array.isArray(value)) {
        return [channel, this._sanitizeMessagesArray(value)];
      }
      return [channel, value];
    });

    return sanitizedWrites.map(([channel, value], idx) => {
      const writeIdx = WRITES_IDX_MAP[channel] ?? idx;
      return {
        write_key: `${String(taskId)}:${String(writeIdx)}`,
        task_id: String(taskId),
        channel: String(channel),
        value,
      };
    });
  }

  _checkpointProjection() {
    return {
      user_id: 1,
      thread_id: 1,
      checkpoint_ns: 1,
      checkpoint_id: 1,
      parent_checkpoint_id: 1,
      checkpoint: 1,
      metadata: 1,
      pending_writes: 1,
    };
  }

  async _safeDb(action, fallback, meta = {}) {
    try {
      return await action();
    } catch (error) {
      logger.warn({ error: error?.message || error, ...meta }, "Mongo checkpointer DB failure, using fallback cache");
      return fallback();
    }
  }

  async get(threadId, userId) {
    const normalizedThreadId = String(threadId);
    const normalizedUserId = this._resolveUserId(userId, normalizedThreadId);
    if (!normalizedUserId) return undefined;

    const tuple = await this.getTuple({
      configurable: {
        user_id: normalizedUserId,
        thread_id: normalizedThreadId,
      },
    });

    return tuple?.checkpoint;
  }

  async getTuple(config) {
    const { userId, threadId, checkpointNs } = this._resolveIdsFromConfig(config);
    if (!userId || !threadId) return undefined;

    const requestedCheckpointIdRaw = getCheckpointId(config);
    const requestedCheckpointId = requestedCheckpointIdRaw ? String(requestedCheckpointIdRaw) : null;

    return this._safeDb(
      async () => {
        const query = {
          user_id: userId,
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
        };

        if (requestedCheckpointId) query.checkpoint_id = requestedCheckpointId;

        const doc = await LangGraphCheckpoint.findOne(query)
          .select(this._checkpointProjection())
          .sort(requestedCheckpointId ? {} : { updatedAt: -1, checkpoint_id: -1 })
          .lean();

        if (!doc) return undefined;

        const tuple = {
          config: {
            configurable: {
              user_id: doc.user_id,
              thread_id: doc.thread_id,
              checkpoint_ns: doc.checkpoint_ns,
              checkpoint_id: doc.checkpoint_id,
            },
          },
          checkpoint: doc.checkpoint,
          metadata: doc.metadata || {},
          pendingWrites: this._toPendingWrites(doc.pending_writes),
        };

        if (doc.parent_checkpoint_id) {
          tuple.parentConfig = {
            configurable: {
              user_id: doc.user_id,
              thread_id: doc.thread_id,
              checkpoint_ns: doc.checkpoint_ns,
              checkpoint_id: doc.parent_checkpoint_id,
            },
          };
        }

        return tuple;
      },
      async () => {
        const key = requestedCheckpointId
          ? this._key(userId, threadId, checkpointNs, requestedCheckpointId)
          : [...this._fallbackStorage.keys()]
            .filter((cacheKey) => {
              const [savedUserId, savedThreadId, savedNs] = JSON.parse(cacheKey);
              return savedUserId === userId && savedThreadId === threadId && savedNs === checkpointNs;
            })
            .sort((a, b) => b.localeCompare(a))[0];

        if (!key) return undefined;

        const saved = this._fallbackStorage.get(key);
        if (!saved) return undefined;

        const [savedUserId, savedThreadId, savedNs, savedCheckpointId] = JSON.parse(key);
        const pendingWrites = this._fallbackWrites.get(key) || [];

        const tuple = {
          config: {
            configurable: {
              user_id: savedUserId,
              thread_id: savedThreadId,
              checkpoint_ns: savedNs,
              checkpoint_id: savedCheckpointId,
            },
          },
          checkpoint: saved.checkpoint,
          metadata: saved.metadata || {},
          pendingWrites,
        };

        if (saved.parentCheckpointId) {
          tuple.parentConfig = {
            configurable: {
              user_id: savedUserId,
              thread_id: savedThreadId,
              checkpoint_ns: savedNs,
              checkpoint_id: saved.parentCheckpointId,
            },
          };
        }

        return tuple;
      },
      { op: "getTuple", userId, threadId, checkpointNs }
    );
  }

  async *list(config, options = {}) {
    const { userId, threadId, checkpointNs, checkpointId } = this._resolveIdsFromConfig(config);
    if (!userId || !threadId) return;

    const beforeId = options?.before?.configurable?.checkpoint_id
      ? String(options.before.configurable.checkpoint_id)
      : null;
    const limit = typeof options?.limit === "number" ? options.limit : 50;
    const filter = options?.filter || null;

    const tuples = await this._safeDb(
      async () => {
        const query = {
          user_id: userId,
          thread_id: threadId,
        };

        if (checkpointNs !== undefined) query.checkpoint_ns = checkpointNs;
        if (checkpointId !== undefined) query.checkpoint_id = checkpointId;
        if (beforeId) query.checkpoint_id = { $lt: beforeId };

        const docs = await LangGraphCheckpoint.find(query)
          .select(this._checkpointProjection())
          .sort({ updatedAt: -1, checkpoint_id: -1 })
          .limit(limit)
          .lean();

        return docs
          .filter((doc) => {
            if (!filter) return true;
            return Object.entries(filter).every(([k, v]) => doc.metadata?.[k] === v);
          })
          .map((doc) => {
            const tuple = {
              config: {
                configurable: {
                  user_id: doc.user_id,
                  thread_id: doc.thread_id,
                  checkpoint_ns: doc.checkpoint_ns,
                  checkpoint_id: doc.checkpoint_id,
                },
              },
              checkpoint: doc.checkpoint,
              metadata: doc.metadata || {},
              pendingWrites: this._toPendingWrites(doc.pending_writes),
            };

            if (doc.parent_checkpoint_id) {
              tuple.parentConfig = {
                configurable: {
                  user_id: doc.user_id,
                  thread_id: doc.thread_id,
                  checkpoint_ns: doc.checkpoint_ns,
                  checkpoint_id: doc.parent_checkpoint_id,
                },
              };
            }

            return tuple;
          });
      },
      async () => {
        const tuples = [];

        for (const [key, saved] of this._fallbackStorage.entries()) {
          const [savedUserId, savedThreadId, savedNs, savedCheckpointId] = JSON.parse(key);
          if (savedUserId !== userId) continue;
          if (savedThreadId !== threadId) continue;
          if (checkpointNs !== undefined && checkpointNs !== savedNs) continue;
          if (checkpointId !== undefined && checkpointId !== savedCheckpointId) continue;
          if (beforeId && savedCheckpointId >= beforeId) continue;
          if (filter && !Object.entries(filter).every(([k, v]) => saved.metadata?.[k] === v)) continue;

          const tuple = {
            config: {
              configurable: {
                user_id: savedUserId,
                thread_id: savedThreadId,
                checkpoint_ns: savedNs,
                checkpoint_id: savedCheckpointId,
              },
            },
            checkpoint: saved.checkpoint,
            metadata: saved.metadata || {},
            pendingWrites: this._fallbackWrites.get(key) || [],
          };

          if (saved.parentCheckpointId) {
            tuple.parentConfig = {
              configurable: {
                user_id: savedUserId,
                thread_id: savedThreadId,
                checkpoint_ns: savedNs,
                checkpoint_id: saved.parentCheckpointId,
              },
            };
          }

          tuples.push(tuple);
        }

        return tuples
          .sort((a, b) => String(b.config.configurable.checkpoint_id).localeCompare(String(a.config.configurable.checkpoint_id)))
          .slice(0, limit);
      },
      { op: "list", userId, threadId, checkpointNs }
    );

    for (const tuple of tuples) {
      yield tuple;
    }
  }

  async put(config, checkpoint, metadata = {}, _newVersions = {}) {
    const normalizedCheckpoint = this._sanitizeCheckpoint(copyCheckpoint(checkpoint));
    const { userId, threadId, checkpointNs } = this._resolveIdsFromConfig(config);

    if (!userId || !threadId) {
      throw new Error("Failed to put checkpoint. Missing required configurable.user_id or configurable.thread_id.");
    }

    const checkpointId = normalizedCheckpoint?.id ? String(normalizedCheckpoint.id) : null;
    if (!checkpointId) {
      throw new Error("Failed to put checkpoint. Missing checkpoint.id.");
    }

    const parentCheckpointId = config?.configurable?.checkpoint_id
      ? String(config.configurable.checkpoint_id)
      : null;

    const expiresAt = new Date(Date.now() + this.ttlMs);

    return this._safeDb(
      async () => {
        await LangGraphCheckpoint.findOneAndUpdate(
          {
            user_id: userId,
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: checkpointId,
          },
          {
            $set: {
              user_id: userId,
              thread_id: threadId,
              checkpoint_ns: checkpointNs,
              checkpoint_id: checkpointId,
              parent_checkpoint_id: parentCheckpointId,
              checkpoint: normalizedCheckpoint,
              metadata,
              expiresAt,
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

        return {
          configurable: {
            user_id: userId,
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: checkpointId,
          },
        };
      },
      async () => {
        const key = this._key(userId, threadId, checkpointNs, checkpointId);
        this._fallbackStorage.set(key, {
          checkpoint: normalizedCheckpoint,
          metadata,
          parentCheckpointId,
        });

        return {
          configurable: {
            user_id: userId,
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: checkpointId,
          },
        };
      },
      { op: "put", userId, threadId, checkpointNs, checkpointId }
    );
  }

  async putWrites(config, writes, taskId) {
    const { userId, threadId, checkpointNs, checkpointId } = this._resolveIdsFromConfig(config);
    if (!userId || !threadId || !checkpointId) return;

    return this._safeDb(
      async () => {
        const writeDocs = this._toPendingWriteDocs(writes, taskId);

        await LangGraphCheckpoint.updateOne(
          {
            user_id: userId,
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: checkpointId,
          },
          {
            $set: {
              expiresAt: new Date(Date.now() + this.ttlMs),
            },
            $addToSet: {
              pending_writes: {
                $each: writeDocs,
              },
            },
          }
        );
      },
      async () => {
        const key = this._key(userId, threadId, checkpointNs, checkpointId);
        const existing = this._fallbackWrites.get(key) || [];
        const existingMap = new Map(existing.map((item, idx) => [`${item[0]}:${item[1]}:${idx}`, item]));

        this._toPendingWriteDocs(writes, taskId).forEach((write) => {
          existingMap.set(write.write_key, [write.task_id, write.channel, write.value]);
        });

        this._fallbackWrites.set(key, [...existingMap.values()]);
      },
      { op: "putWrites", userId, threadId, checkpointNs, checkpointId }
    );
  }

  async delete(threadId, userId) {
    return this.deleteThread(threadId, userId);
  }

  getNextVersion(current) {
    if (current === undefined || current === null) return 1;
    if (typeof current === "number") return current + 1;

    const parsed = Number(current);
    if (Number.isFinite(parsed)) return parsed + 1;

    return Date.now();
  }

  async deleteThread(threadId, userId) {
    const normalizedThreadId = String(threadId);
    const normalizedUserId = this._resolveUserId(userId, normalizedThreadId);
    if (!normalizedUserId) return;

    return this._safeDb(
      async () => {
        await LangGraphCheckpoint.deleteMany({
          user_id: normalizedUserId,
          thread_id: normalizedThreadId,
          checkpoint_ns: { $exists: true },
        });
      },
      async () => {
        const keys = [...this._fallbackStorage.keys()].filter((key) => {
          const [savedUserId, savedThreadId] = JSON.parse(key);
          return savedUserId === normalizedUserId && savedThreadId === normalizedThreadId;
        });

        keys.forEach((key) => {
          this._fallbackStorage.delete(key);
          this._fallbackWrites.delete(key);
        });
      },
      { op: "deleteThread", userId: normalizedUserId, threadId: normalizedThreadId }
    );
  }
}

module.exports = MongoCheckpointer;
