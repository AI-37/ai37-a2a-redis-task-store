# Changelog — @ai37/a2a-redis-task-store

Format: [Keep a Changelog](https://keepachangelog.com/). The version is the one in this package's
`package.json`.

## [0.1.0] - 2026-06-18

### Added
- `RedisTaskStore` — a Redis-backed implementation of the A2A `TaskStore` (`@a2a-js/sdk`) built on
  `ioredis`: durable `Task` snapshots with a TTL (multi-turn/HITL, resubscribe, replay).
  Framework-agnostic constructor: `url` (owns the client, closed in `close()`) or a shared `client`
  (not closed). Options: `keyPrefix`, `ttlSeconds`, `logger`. Methods: `save`/`load` (the `TaskStore`
  contract) plus `delete`/`close`.
