# @ai37/a2a-redis-task-store

A Redis-backed [`TaskStore`](https://github.com/a2aproject/a2a-js) for the **A2A** protocol
(`@a2a-js/sdk`). `Task` snapshots are stored in Redis (with a TTL) and survive **restarts and
replicas** — required for multi-turn flows (HITL), resubscribe and replay. A drop-in replacement for
the in-memory `TaskStore` that ships with `@a2a-js/sdk`.

Framework-agnostic, built on [`ioredis`](https://github.com/redis/ioredis): pass a connection URL
(the store creates its own client) or share your application's existing `ioredis` instance.

> **Python?** For Python A2A servers there is a separate, unrelated project —
> [`a2a-redis`](https://github.com/redis-developer/a2a-redis) — implementing the same A2A `TaskStore`
> concept (`RedisTaskStore` / `RedisJSONTaskStore`).

## Install

```bash
npm i @ai37/a2a-redis-task-store
# peer dependency:
npm i @a2a-js/sdk
```

`@a2a-js/sdk` is a peer dependency; `ioredis` is installed transitively.

## Usage

Plug it into the A2A request handler instead of the in-memory store:

```ts
import { DefaultRequestHandler } from '@a2a-js/sdk/server'
import { RedisTaskStore } from '@ai37/a2a-redis-task-store'

const taskStore = new RedisTaskStore({ url: process.env.REDIS_URL })
const handler = new DefaultRequestHandler(agentCard, taskStore, executor)
```

Reuse a shared client (the store will **not** close it in `close()`):

```ts
import Redis from 'ioredis'
import { RedisTaskStore } from '@ai37/a2a-redis-task-store'

const redis = new Redis(process.env.REDIS_URL)
const taskStore = new RedisTaskStore({ client: redis, keyPrefix: 'myapp:a2a:task:' })
```

Any A2A server that accepts a `TaskStore` works the same way — just pass an instance.

## Options (`RedisTaskStoreOptions`)

| Option | Default | Description |
|---|---|---|
| `url` | — | Connection URL; the store creates its own `ioredis` client and closes it in `close()`. |
| `client` | — | An existing client (shared with your app); the store does **not** close it. Mutually exclusive with `url`. |
| `keyPrefix` | `'a2a:task:'` | Key namespace prefix. |
| `ttlSeconds` | `86400` (24h) | Snapshot TTL. `0` → no expiry. |
| `logger` | `console` | `{ warn, error }` used for warnings (corrupt snapshot, connection error). |

You must provide **either** `url` **or** `client` (otherwise the constructor throws).

## API

- `save(task)` / `load(taskId)` — the `@a2a-js/sdk` `TaskStore` contract.
- `delete(taskId)` — remove a snapshot (outside the contract; handy for cleanup/tests).
- `close()` — close the connection **if** the store owns the client (created from `url`); otherwise a no-op.

## License

MIT
