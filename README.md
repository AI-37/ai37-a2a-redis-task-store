# @ai37/a2a-redis-task-store

<!-- ai37:card:start (managed by doc-bot — do not edit inside) -->
# ai37-a2a-redis-task-store

## Описание
Приватная npm-библиотека `@ai37/a2a-redis-task-store` — Redis-реализация `TaskStore` для A2A-протокола (`@a2a-js/sdk`). Хранит долговечные (durable) снапшоты `Task` для multi-turn/HITL-сценариев, resubscribe и replay, выступая drop-in заменой in-memory `TaskStore` из SDK.

## Стек
TypeScript (ESM + CJS, сборка через tsup), `ioredis`; peer-зависимость `@a2a-js/sdk >=0.3.0` (в dev `^0.3.13`). Менеджер пакетов — npm; тесты — Vitest.

## Схема работы
Класс `RedisTaskStore` реализует контракт `TaskStore` из `@a2a-js/sdk`.
- `save(task)` — сериализует `Task` в JSON и пишет по ключу `keyPrefix + task.id` с TTL (`SET ... EX`); при `ttlSeconds=0` пишет без `EX` (вечные ключи).
- `load(taskId)` — читает ключ; при отсутствии ключа или повреждённом JSON возвращает `undefined` (warn, а не исключение).
- `delete`/`close` — вне контракта `TaskStore`, но публичны; `close()` закрывает только собственный `ioredis` (созданный из `url`) и ничего не делает для инжектированного `client`.

## Структура каталогов
- `src/` — исходники библиотеки: `index.ts` (публичный barrel), `redis-task-store.ts` (реализация `RedisTaskStore`).
- `test/` — unit-тесты на in-memory fake ioredis (`redis-task-store.test.ts`, `RedisLike`); живой Redis не нужен.
- `.github/workflows/` — `ci.yml` (PR-CI: `npm ci` + `npm run verify`, выбор раннера по канону AI-37) и `publish.yml` (публикация пакета).
- `tsup.config.ts`, `tsconfig.json`, `package.json` — конфигурация сборки и публикации.

## Публичные интерфейсы
- npm-пакет: `@ai37/a2a-redis-task-store`.
- API класса `RedisTaskStore` (реализует `TaskStore`): `save(task)`, `load(taskId)`, `delete`, `close`.
- Опции конструктора (`RedisTaskStoreOptions`): `url`, `client`, `keyPrefix`, `ttlSeconds`.
- HTTP/REST-эндпоинтов, A2A Agent Card, MCP, AG-UI и CLI нет — это библиотека, а не сервис.

## Зависимости в экосистеме
### Зависит от
- `@a2a-js/sdk` (peerDependency `>=0.3.0`) — типы `Task`/`TaskStore`.
- `ioredis` — клиент Redis.
- Node.js — рантайм для сборки/тестов; для unit-тестов достаточно in-memory fake.

### От него зависят
- Потребители пакета, в первую очередь agent-host (контракт `save`/`load`), подключающие библиотеку по версии из приватного Verdaccio. Точный список потребителей в предоставленных материалах не зафиксирован.

## Конфигурация
Параметры задаются через `RedisTaskStoreOptions` (отдельного `.env` в материалах нет):
- `url` — строка подключения Redis: store сам создаёт `ioredis` и закрывает его в `close()`.
- `client` — инжектированный внешний `ioredis`; `close()` становится no-op.
- `keyPrefix` — префикс ключей, по умолчанию `a2a:task:`.
- `ttlSeconds` — TTL при `SET ... EX`, по умолчанию `86400` (24 часа); `0` — запись без TTL.

Переменные окружения CI (GitHub Actions, переменные организации):
- `CI_RUNNER` — JSON-массив меток раннера для CI-работ (напр. `["self-hosted","ai37-local-1"]`); если не задана, используется `ubuntu-latest`.
- `CD_RUNNER` — аналогичный выбор раннера для деплой-workflow (канон AI-37).

## Данные и хранилища
- Redis: снапшоты `Task`, ключ `keyPrefix + task.id`, TTL по умолчанию 24 часа (защита от OOM).
- Миграции и отдельные БД отсутствуют.

## Быстрый старт (локально)
```bash
npm ci
npm run verify
```
`npm run verify` выполняет `tsc --noEmit` + `vitest run` + `tsup build`. Health/smoke-эндпоинтов нет; unit-тесты работают на in-memory fake ioredis без живого Redis.

## Как запускать тесты
```bash
npm test        # = vitest run
npm run verify  # полная проверка: tsc --noEmit + vitest run + tsup build
```

## Деплой
Публикация npm-пакета в приватный Verdaccio `npm.app-sp-ai.ru` через `.github/workflows/publish.yml` (раннер деплоя выбирается переменной `CD_RUNNER` — канон AI-37); потребители подключают пакет по версии. CI: GitHub Actions `.github/workflows/ci.yml` — на каждый PR выполняются `npm ci` и `npm run verify`, затем агрегатный гейт `ci-green` с единым именем.

Выбор раннера (канон AI-37, применяется к джобам `verify` и `ci-green`):
- автозапуск (PR) и режим `auto` при ручном запуске → переменная организации `CI_RUNNER` (JSON-массив меток, напр. `["self-hosted","ai37-local-1"]`), при её отсутствии — `ubuntu-latest`;
- ручной запуск (`workflow_dispatch`) позволяет явно выбрать вход `runner`: `auto`, `ubuntu-latest` или `ai37-self-hosted`.

## Связанные документы
- `ecosystem/v2.2/04-state-storage-postgres.md` — текущее место Redis-task-store и стратегия добавления PostgreSQL-реализации.
- `ecosystem/v2.2/02-agent-host-unification.md` — durable-состояние в `task.metadata` и семантика `save`/`load`.
- `ecosystem/v2/04-a2a-conventions.md` — контракт `Task`/`status`/`contextId`.
- `docs/plans/doc-bot-pr-review.md` — общий CI/ревью-контракт.
<!-- ai37:card:end -->

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
