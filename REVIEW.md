<!-- Maintained for the AI-37 doc-bot PR reviewer. Repo-specific overlay; the common review
     contract (three lenses, false-positive rules, autonomy) is the bot's built-in prompt —
     canonical text in AI-37/docs plans/doc-bot-pr-review/reviews/_common.md. -->

# REVIEW.md — ai37-a2a-redis-task-store
> Inherits the common contract: reviews/_common.md (the bot loads it as the global default). This file covers only the repo-specific specifics.

**Role / stack / deploy:** the private npm library `@ai37/a2a-redis-task-store` — a Redis-backed `TaskStore` for the A2A protocol (`@a2a-js/sdk`), durable `Task` snapshots for multi-turn/HITL, resubscribe, replay. Stack: TypeScript (ESM+CJS via tsup), `ioredis`. Deploy: publishing to the private Verdaccio `npm.app.sp-ai.ru` (`.github/workflows/publish.yml`); consumers pull it by version — this is a published-package public API.

**Test command:** `npm test` (= `vitest run`). Full verification: `npm run verify` (= `tsc --noEmit` + `vitest run` + `tsup build`; also `prepublishOnly`). Unit tests run against an in-memory ioredis fake (`test/redis-task-store.test.ts`, `RedisLike`); a live Redis is not needed.

**Key invariants (what the reviewer must know):**
- **A drop-in replacement for the in-memory `TaskStore` from `@a2a-js/sdk`.** The `RedisTaskStore` class implements `TaskStore` (`save`/`load`). Changing the `save(task)`/`load(taskId)` signatures breaks the consumer contract (agent-host). `delete`/`close` are outside the contract but public.
- **Key = `keyPrefix + task.id`** (`private key()`), default prefix `a2a:task:` (`DEFAULT_KEY_PREFIX`). Changing the key scheme orphans snapshots after deploy (loss of multi-turn state in prod).
- **TTL is the safeguard against OOM.** Default `ttlSeconds=86400` (`DEFAULT_TTL_SECONDS`, 24h); `save` issues `SET ... EX`. `ttlSeconds=0` deliberately writes WITHOUT `EX` (eternal keys) — this is the "Redis without TTL → OOM → CrashLoop" class of bugs (see MEMORY: RedisSaver without TTL). Any change to the TTL/`EX` paths is under special scrutiny; removing or disabling TTL by default is not allowed without an explicit justification.
- **Client ownership:** `url` → the store creates its own `ioredis` and closes it in `close()` (`ownsClient=true`); `client` → an injected external instance, `close()` = no-op (do not `quit()` someone else's client). The invariant "don't close an injected client" is covered by a test — don't break it.
- **Resilience to data corruption:** `load` on broken JSON → `warn` + `undefined`, NOT throw (otherwise one broken key crashes the handler). Likewise missing → `undefined`. Don't turn these branches into exceptions.
- **`@a2a-js/sdk` is a peerDependency `>=0.3.0`** (in dev `^0.3.13`). `Task`/`TaskStore` come from the peer. Bumping/narrowing the peer range = a potential build break for consumers.

**Lens 2 — what to check against (docs/ecosystem):** `ecosystem/v2.2/04-state-storage-postgres.md` (this store is named there as the current A2A task-store; the strategy is to ADD a PostgreSQL implementation, Redis remains permissible but ceases to be the only one — don't rip out the Redis path under the guise of a "migration"); `ecosystem/v2.2/02-agent-host-unification.md` (the run's durable state lives server-side in `task.metadata`, the host persists via the task-store — the `save`/`load` semantics must serve it); `ecosystem/v2/04-a2a-conventions.md` (the `Task`/`status`/`contextId` contract). The library is product-neutral and framework-agnostic — no domain/billing/persona/product hardcodes should flow in here.

**Sensitive paths (in addition to the default):** `src/index.ts` (the public barrel — any added/removed export = a public-API change); `src/redis-task-store.ts` (the `TaskStore` signatures, the key scheme, the TTL/`EX` paths, client ownership); the `package.json` fields `version`, `exports`, `main`/`module`/`types`, `peerDependencies`, `publishConfig`; `.github/workflows/publish.yml`; `tsup.config.ts`, `tsconfig.json` (the dist artifact format).

**Autonomy threshold (refinement):** this is a published library — **never auto-approve** (a) any breaking change to the public API (the `save`/`load`/`delete`/`close` signatures, the `index.ts` exports, the shape of `RedisTaskStoreOptions`), (b) a `version` bump in package.json, (c) narrowing/bumping `peerDependencies`, (d) a change to the key scheme or the TTL semantics. Such PRs → `comment` + escalate to the owners (a small ripple → all task-store consumers). New logic without a meaningful test on the fake ioredis (happy+edge+failure: TTL=0, corrupt JSON, missing, injected-client-close) → `request_changes`.

_(Not a fork — the fork lens does not apply.)_

Write the review summary and all inline comments in RUSSIAN (the developers read Russian); these instructions are in English only for your understanding.
