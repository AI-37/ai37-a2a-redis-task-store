import Redis from 'ioredis'
import type { Task } from '@a2a-js/sdk'
import type { TaskStore } from '@a2a-js/sdk/server'

/** Default key prefix (namespace within a shared Redis). */
export const DEFAULT_KEY_PREFIX = 'a2a:task:'
/** Default task snapshot TTL: 24h (multi-turn/HITL, resubscribe, replay). */
export const DEFAULT_TTL_SECONDS = 60 * 60 * 24

/**
 * Minimal Redis client contract used by the store. `ioredis` satisfies it — but you can pass
 * any compatible client (or a fake in tests).
 */
export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>
  del(...keys: string[]): Promise<number>
  quit(): Promise<unknown>
}

/** Logger (defaults to `console`) so the store stays framework-agnostic. */
export interface RedisTaskStoreLogger {
  warn(message: string): void
  error(message: string): void
}

export interface RedisTaskStoreOptions {
  /**
   * An existing Redis client (e.g. your application's shared `ioredis`). The store does **not**
   * close it in `close()` — ownership stays with the caller. Mutually exclusive with `url`.
   */
  client?: RedisLike
  /**
   * Connection URL (`redis://...`). The store creates its own `ioredis` client and closes it in
   * `close()`. Ignored when `client` is provided.
   */
  url?: string
  /** Key namespace prefix. Defaults to `'a2a:task:'`. */
  keyPrefix?: string
  /** Snapshot TTL in seconds. Defaults to 24h. `0` → no expiry. */
  ttlSeconds?: number
  /** Logger for warnings (corrupt snapshot, connection error). Defaults to `console`. */
  logger?: RedisTaskStoreLogger
}

/**
 * Redis-backed A2A `TaskStore` (a drop-in replacement for the in-memory default): `Task` snapshots
 * survive restarts and replicas — required for multi-turn (HITL), resubscribe and replay.
 * Framework-agnostic: pass a `url` (the store spins up its own client) or share your application's
 * `ioredis` instance via `client`.
 *
 * ```ts
 * import { DefaultRequestHandler } from '@a2a-js/sdk/server'
 * import { RedisTaskStore } from '@ai37/a2a-redis-task-store'
 *
 * const taskStore = new RedisTaskStore({ url: process.env.REDIS_URL })
 * const handler = new DefaultRequestHandler(agentCard, taskStore, executor)
 * ```
 */
export class RedisTaskStore implements TaskStore {
  private readonly redis: RedisLike
  private readonly ownsClient: boolean
  private readonly keyPrefix: string
  private readonly ttlSeconds: number
  private readonly logger: RedisTaskStoreLogger

  constructor(options: RedisTaskStoreOptions) {
    if (!options.client && !options.url) {
      throw new Error('RedisTaskStore: provide either `client` or `url`')
    }
    this.logger = options.logger ?? console
    if (options.client) {
      this.redis = options.client
      this.ownsClient = false
    } else {
      const client = new Redis(options.url!, { maxRetriesPerRequest: 3 })
      client.on('error', (e: Error) =>
        this.logger.error(`RedisTaskStore: connection error: ${e.message}`),
      )
      this.redis = client as unknown as RedisLike
      this.ownsClient = true
    }
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS
  }

  private key(taskId: string): string {
    return this.keyPrefix + taskId
  }

  async save(task: Task): Promise<void> {
    const payload = JSON.stringify(task)
    if (this.ttlSeconds > 0) {
      await this.redis.set(this.key(task.id), payload, 'EX', this.ttlSeconds)
    } else {
      await this.redis.set(this.key(task.id), payload)
    }
  }

  async load(taskId: string): Promise<Task | undefined> {
    const raw = await this.redis.get(this.key(taskId))
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as Task
    } catch {
      this.logger.warn(`RedisTaskStore: corrupt task snapshot: ${taskId}`)
      return undefined
    }
  }

  /** Delete a task snapshot (outside the `TaskStore` contract, but handy for cleanup/tests). */
  async delete(taskId: string): Promise<void> {
    await this.redis.del(this.key(taskId))
  }

  /** Close the connection IF the store owns the client (created from `url`); otherwise a no-op. */
  async close(): Promise<void> {
    if (this.ownsClient) await this.redis.quit()
  }
}
