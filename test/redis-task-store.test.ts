import { describe, it, expect } from 'vitest'
import type { Task } from '@a2a-js/sdk'
import { RedisTaskStore, type RedisLike } from '../src/index'

/** In-memory ioredis fake: enough to exercise the store contract without a live Redis. */
function fakeRedis() {
  const store = new Map<string, string>()
  const setCalls: Array<{ key: string; args: unknown[] }> = []
  let quit = 0
  const client: RedisLike = {
    async get(key) {
      return store.has(key) ? store.get(key)! : null
    },
    async set(key, value, ...args) {
      setCalls.push({ key, args })
      store.set(key, value)
      return 'OK'
    },
    async del(...keys) {
      let n = 0
      for (const k of keys) if (store.delete(k)) n++
      return n
    },
    async quit() {
      quit++
      return 'OK'
    },
  }
  return { client, store, setCalls, quitCount: () => quit }
}

const task = (id: string, state: Record<string, unknown>): Task => ({
  kind: 'task',
  id,
  contextId: id,
  status: { state: 'input-required', timestamp: '2026-06-18T00:00:00.000Z' },
  metadata: { state },
})

describe('RedisTaskStore', () => {
  it('requires either client or url', () => {
    expect(() => new RedisTaskStore({})).toThrow(/client.*url/)
  })

  it('save → load round-trip with prefix and TTL', async () => {
    const fake = fakeRedis()
    const ts = new RedisTaskStore({ client: fake.client, keyPrefix: 'p:', ttlSeconds: 100 })
    await ts.save(task('t1', { step: 1 }))

    expect([...fake.store.keys()]).toEqual(['p:t1'])
    expect(fake.setCalls[0].args).toEqual(['EX', 100])

    const loaded = await ts.load('t1')
    expect(loaded?.metadata?.state).toEqual({ step: 1 })
  })

  it('does not set EX when ttl is 0', async () => {
    const fake = fakeRedis()
    const ts = new RedisTaskStore({ client: fake.client, ttlSeconds: 0 })
    await ts.save(task('t2', {}))
    expect(fake.setCalls[0].args).toEqual([])
  })

  it('load of a missing task → undefined', async () => {
    const fake = fakeRedis()
    const ts = new RedisTaskStore({ client: fake.client })
    expect(await ts.load('nope')).toBeUndefined()
  })

  it('corrupt snapshot → undefined (no throw)', async () => {
    const fake = fakeRedis()
    fake.store.set('a2a:task:bad', '{not-json')
    const warnings: string[] = []
    const ts = new RedisTaskStore({
      client: fake.client,
      logger: { warn: (m) => warnings.push(m), error: () => {} },
    })
    expect(await ts.load('bad')).toBeUndefined()
    expect(warnings).toHaveLength(1)
  })

  it('delete removes the snapshot', async () => {
    const fake = fakeRedis()
    const ts = new RedisTaskStore({ client: fake.client })
    await ts.save(task('t3', {}))
    await ts.delete('t3')
    expect(await ts.load('t3')).toBeUndefined()
  })

  it('close() does not close an injected client', async () => {
    const fake = fakeRedis()
    const ts = new RedisTaskStore({ client: fake.client })
    await ts.close()
    expect(fake.quitCount()).toBe(0)
  })
})
