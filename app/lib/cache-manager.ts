/**
 * Client-side cache manager for events
 * Caches event data for 10 minutes with eventId as the primary key
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes in milliseconds

class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map()

  /**
   * Set a value in cache
   */
  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * Get a value from cache if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    const isExpired = Date.now() - entry.timestamp > CACHE_DURATION

    if (isExpired) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Check if a key exists in cache and is still valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)

    if (!entry) {
      return false
    }

    const isExpired = Date.now() - entry.timestamp > CACHE_DURATION

    if (isExpired) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get remaining time until expiration in milliseconds
   */
  getRemainingTime(key: string): number {
    const entry = this.cache.get(key)

    if (!entry) {
      return 0
    }

    const elapsed = Date.now() - entry.timestamp
    const remaining = Math.max(0, CACHE_DURATION - elapsed)

    return remaining
  }
}

// Create singleton instance
export const eventCacheManager = new CacheManager()
