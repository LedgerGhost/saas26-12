const Redis = require('ioredis');

const ONE_DAY = 86400;

class ValkeyCache {
  /**
   * @param {string} url - Valkey connection URL (e.g. redis://valkey:6379)
   * @param {string} providerId - used as cache key prefix
   */
  constructor(url, providerId) {
    this.providerId = providerId;
    this.prefix = `provider:${providerId}:`;
    if (url) {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null // fail fast, don't retry
      });
      this.client.connect().catch(() => {});
    } else {
      this.client = null;
    }
  }

  /**
   * Read a cached value. Returns null on miss or if Valkey is down.
   */
  async get(key) {
    if (!this.client) return null;
    try {
      const val = await this.client.get(this.prefix + key);
      return val ? JSON.parse(val) : null;
    } catch (_err) {
      return null;
    }
  }

  /**
   * Store a value with TTL (default 1 day).
   */
  async set(key, value, ttl = ONE_DAY) {
    if (!this.client) return;
    try {
      await this.client.set(this.prefix + key, JSON.stringify(value), 'EX', ttl);
    } catch (_err) { /* fail silently */ }
  }

  /**
   * Delete a cached key.
   */
  async del(key) {
    if (!this.client) return;
    try {
      await this.client.del(this.prefix + key);
    } catch (_err) { /* fail silently */ }
  }
}

module.exports = { ValkeyCache };
