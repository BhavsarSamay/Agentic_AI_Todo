const lruCacheModule = require("lru-cache");
const LRUCache = lruCacheModule.LRUCache || lruCacheModule;

class ToolCache {
  constructor(options = {}) {
    this.cache = new LRUCache({
      max: options.max || 2000,
      ttl: options.ttl || 1000 * 20,
    });
  }

  key({ userId, toolName, input }) {
    return `${String(userId)}:${toolName}:${JSON.stringify(input || {})}`;
  }

  get(params) {
    return this.cache.get(this.key(params));
  }

  set(params, value) {
    this.cache.set(this.key(params), value);
  }

  del(params) {
    this.cache.delete(this.key(params));
  }

  clearUser(userId) {
    const prefix = `${String(userId)}:`;
    for (const key of this.cache.keys()) {
      if (String(key).startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

module.exports = ToolCache;
