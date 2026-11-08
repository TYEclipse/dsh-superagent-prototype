# dsh-superagent — baseline map for a hermes-agent benchmark

| | |
| --- | --- |
| Repository | `TYEclipse/dsh-superagent-prototype` (fork of `deepseek-ai/dsh-superagent-prototype`, upstream commit `8c32a9d`; see `FORK-NOTES.md:1-8`) |
| Commit | `205a9a89c132d307a89c5e5dd68ca70453fc8806` |
| Branch | `agent/pdca-hermes-benchmark-e9685ae6f6f0` |
| Date | 2026-11-08 |
| Package | `dsh-superagent` v0.2.0, `private: true`, `engines.dsh ^0.2.2-rc.1` (`package.json:2-7,53-56`) |

Inspected: `docs/000`–`008`, `README.md`, `FORK-NOTES.md`, `package.json`, `cordis.patch.yml`, `tsdown.config.ts`, `vitest.config.ts`, `examples/profile.cordis.patch.yml`, all of `src/app`, `src/core`, `src/executor`, `src/infra`, `src/deployment.ts`, `src/index.ts`, `src/policy.ts`, `src/kv.ts`, `src/client/locales.ts`, `src/app/views/*`, `tests/` (layout + `core-engine`, `effects`, `bundle-patch`), `scripts/`, `skills/`, `prompts/`, repo root. No `.github/` directory exists (no CI workflows).

---

## 1. Architecture

### Composition root and lifecycle

`Runtime` (`src/app/runtime.ts:59`) is the only composition root and holds no domain rules (`docs/007-architecture.md:31`). It is a Cordis `Service` published as `orchestrator` (`runtime.ts:88`), which is also the service Source plugins inject (`runtime.ts:50-51`).

Construction order (`runtime.ts:87-171`): lock `stateDir` with `proper-lockfile` (`runtime.ts:93`, stale 30 s) → open `Store` (`:98`) → `Setup` (`:99`) → `Prompts` (`:103`) → `masterId` from KV (`:104`) → `Commands` (`:106`) → `Effects` (`:108`) → `SourceRegistry` (`:109`) → `Sessions` (`:121`) → `Settings` (`:126`) → `DshExecutor` (`:128`) → `MasterAssessor` (`:131`) → `Outbox` (`:134`) → `Engine` (`:137`) → `Passes` (`:157`). Executor/Assessor receive `get engine()` getters to break the construction cycle (`docs/007-architecture.md:27`).

Startup `initialize()` (`runtime.ts:201-218`): register HTTP routes **before** setup so the operator can fix setup in the UI (`:203`) → `setup.run` (`:204`, on failure health `paused`/`setupPending` and return) → `sessions.install` + `executor.install` (`:208-209`) → `sessions.ensure(masterId, …, 'orchestrator')` (`:210`) → policy syncs (`:211`) → `executor.resume()` (`:214`) → `passes.start()` (`:215`) → `effects.start()` (`:216`) → runtime health `ready` (`:217`).

Shutdown (`runtime.ts:230-253`): flag closing, stop passes, abort the lifetime signal, stop assessor, cancel main+worker agents with `keepInbox` (`:236`), drain effects, `executor.shutdown()` (`:239`), dispose sessions, flush `sessionPersistence` (`:243`), restore environment, close the store, release the lock (`:246-251`).

### Domain core

`src/core` is pure: no I/O except Node hashing (`docs/007-architecture.md:258`). `Engine` (`src/core/engine.ts:24`) is the single writer of Triggers, Threads, Decisions, Tickets and Assignments (`docs/007-architecture.md:263`). Every command is synchronous and runs in one `repo.atomic` transaction (`engine.ts:48,100,135,160,166,255`; `docs/007-architecture.md:48`). The Engine delegates to five parts, each extending `EnginePart` (`src/core/part.ts`): `Intake` (`src/core/intake.ts`), `Evals` (`src/core/evals.ts`), `Tickets` (`src/core/tickets.ts:29`), `Assignments` (`src/core/assignments.ts`), `Replies` (`src/core/replies.ts`) — dependency direction is one-way `docs/007-architecture.md:52-60`.

Callers get narrow role `Pick`s, not the Engine: `EngineForSources`, `EngineForMainSession`, `EngineForPeople`, `EngineForSettings`, `EngineForExecutor` (`engine.ts:261-270`). Ports are declared in `src/core/ports.ts` (`Repositories`, `Policy`, `SourceScope`, `Assessor`, `Executor`, `Outbox`, `DomainEvent`). Methods are imperative for requests and past-tense for adapter facts (`docs/007-architecture.md:62,272`).

Domain types live in `src/core/model.ts` (`Trigger:23`, `Thread:157`, `Decision:192`, `Mandate:126`, `Evaluation:136`, `Assignment:218`, `TicketInput:235`, `Ticket:277`). Ticket stage logic is `src/core/stage.ts` and the table in `docs/003-execution.md:7-17`.

### Adapters

| Concern | Module |
| --- | --- |
| SQLite persistence, settings versions, outbox receipts, KV | `src/app/store.ts:51` (+ read-only queries `src/app/store-read.ts:6`) |
| Durable effect queue | `src/app/effects.ts:46` |
| Domain-event notices and relays to the main Session | `src/app/notices.ts` |
| Outbound channel messages with receipts and ordering | `src/app/outbox.ts:22` |
| Periodic/on-demand pass scheduler (2 s interval) | `src/app/passes.ts:22,28` |
| Session creation, prompt/tool/skill decoration, `relay`/`notice` handlers | `src/app/sessions.ts:93` |
| Per-Ticket worker Sessions + directories + slots | `src/executor/dsh.ts:171,230,404` |
| Proactive assessment into the main Session | `src/app/assessment.ts:89` |
| Source plugin protocol and registry | `src/sources/kind.ts`, `src/sources/registry.ts` |
| CLI transport (`gh`, `lark-cli`, `git`) | `src/infra/commands.ts` |
| Health board (one writer per entry) | `src/infra/health.ts` (`docs/007-architecture.md:269`) |
| HTTP management API | `src/app/http.ts:156-212` |
| Panel views / API types | `src/app/views/*.ts`, `src/app/api.ts:20` |

### Panel and client packaging

Panel is a DSH **web client plugin**: `src/client/index.tsx` registers the sidebar entry and page; `src/client/app.tsx` renders tabs Overview / Source / Trigger / Eval / Execution / Settings (`docs/005-panel.md:15-24`). It imports only types from the host side (`docs/007-architecture.md:258`). Copy lives in one bilingual file, `src/client/locales.ts` (`en`/`zh` at `:752`, `GLOSSARY` at `:755`).

The client bundle is CJS wrapped for DSH's module loader (`tsdown.config.ts:11-13`): banner `window.__ModuleLoader__.load({ id: "dsh-superagent", factory: … })`. Injected DSH client packages are listed in `package.json:34-44`.

### Plugin packaging and bundle patch

`package.json` exports `.`, `./client`, `./github-watch`, `./feishu-watch`, `./locale/*.json` (`:11-21`) and declares `dsh.bundle.patch = ./cordis.patch.yml` (`:30-33`). `tsdown` builds three Node ESM entries (`index`, `github-watch`, `feishu-watch`) plus the browser CJS client, with `dts` for the Node build (`tsdown.config.ts:9-13`); `@deepseek-ai/*`, `zod`, `proper-lockfile` stay external (`:10`).

The bundle patch (`cordis.patch.yml`) inserts five rows: `dsh-superagent`, `dsh-superagent-github`, `dsh-superagent-feishu` (disabled), `dsh-superagent-worker-preset`, `dsh-superagent-router-preset` (`:4-12,20-26,125-131`). The worker preset is DSH `standard` minus ask-user/present/plan-mode/plugin-manager/market/schedule/goal/workflow/forked-subagent, with 5 s foreground-shell and job-wait limits; spawned subagents run under `standard` (`cordis.patch.yml:13-120`). The router preset has no subagents, web, file search or writes (`:121-193`). `tests/bundle-patch.spec.ts:10-21` parses the patch with DSH's own `entryListSchema`/`applyEntryPatches`, and asserts row ids and preset contents (`:29-51`).

### State store

One SQLite file, `<stateDir>/orchestrator.sqlite`, opened only by `Store` (`runtime.ts:98`; `docs/007-architecture.md:452`). `node:sqlite` `DatabaseSync`, `chmod 0600`, `journal_mode=WAL`, `synchronous=FULL` (`store.ts:2,60-64`). Tables: `trigger`, `disposition`, `thread`, `ticket`, `decision`, `outbox`, `trigger_thread`, `effect` (`store.ts:71-87`). Generated columns + partial indexes define working sets (`open`, `active`, `subscribed`, `dropped`, `pending`) (`store.ts:30-44,103-119`). `SCHEMA_VERSION = 11`, `OLDEST_SCHEMA = 10` (`src/app/migration.ts:20-22`); a newer DB refuses to start, an older-than-10 DB refuses too (`migration.ts:24-25`; `store.ts:65-68`). Table-by-table description: `docs/007-architecture.md:454-466`.

### Session model

* Main Session id: `orchestrator-<hash(stateDir)>`, persisted in `KV.runtime.masterId` (`runtime.ts:104-105`).
* One worker Session per Ticket: `worker-<ticketId>` (`src/executor/dsh.ts:24`), plus one directory per Ticket (`executor/dsh.ts` `ticketExecution`, `:97-111`; root defaults to `<stateDir>/work`).
* Presets: `dsh-superagent-router` for the main Session, `dsh-superagent-worker` for workers (`src/app/sessions.ts:48`), restored if the Web UI selected another before the first turn (`sessions.ts:127`; `docs/007-architecture.md:511`).
* Tool surface: worker allowlist `WORK_TOOLS` (`sessions.ts:61-62`); subagents inherit only worker tools (`sessions.ts:292`). `noWait` guard refuses `sleep`, shell `timeoutMs > 30 s`, and job waits `> 5 s` in the main Session (`sessions.ts:77-86`).

### Prompt composition

`Prompts` (`src/app/prompts.ts:135`) stores immutable numbered versions (`PromptVersion` `:39`) plus overrides keyed by `base` (the built-in text they came from, `:29-31`; `KV.prompts.builtIn` `src/kv.ts:30-31`).

* Editable team sections: `communication`, `scope`, `delivery` (`prompts.ts:14-17`).
* Overridable built-in part keys: `runtime/*`, `runtime/handoff/*`, `runtime/environment`, `runtime/policy`, `runtime/policy/none`, `skill/feishu`, `skill/github` (`prompts.ts:24-26`).
* Assembly order: shared → role → team sections → subscriptions/replies → dispatch|work → admission (main only) → handoff → generated environment → generated policy (main only) (`prompts.ts:102-115`; `docs/004-prompts.md:44-59`).
* Generated sections: `environmentSection` (`prompts.ts:83`) and `policySection` (`prompts.ts:92`), regenerated per model request so a Policy change does not invalidate other text (`docs/004-prompts.md:59`).
* Built-in prose lives in `prompts/*.md` and `skills/dsh-superagent-*/SKILL.md`, joined by `promptFile` (`docs/007-architecture.md:600`; `src/app/skill-files.ts`).

### Dependency rules

`docs/007-architecture.md:255-274`: `src/core` imports nothing outside itself; `src/sources` imports nothing from `src/app`; the panel imports only types and a short allowlist of plain-value modules; each state has exactly one writer; refusals are `UserError(code, values)` (`src/core/errors.ts`), setup problems `SetupError` (`src/setup.ts`), health codes `HealthCode` (`src/sources/host.ts`).

---

## 2. Orchestration

### Ticket lifecycle

`Trigger → Thread → Eval → Decision → Ticket + Mandate + Assignment → Report → end/resume` (`docs/001-domain.md:5-19`). Engine entry points (`src/core/engine.ts`): `receive:48`, `bindThread:54`, `threadClosed:62`, `evaluateDue:75`, `candidate:90`, `decide:100`, `attach:109`, `requestStatus:127`, `reply:135`, `candidateDelivered:140`, `reevaluate:145`, `dismiss:150`, `unsubscribe:155`, `stopTicket:160`, `retryTicket:166`, adapter facts `assignmentStarted:174` … `assignmentInterrupted:245`, `policyChanged:255`.

A Ticket is open while `ended` is unset; stage is derived (`docs/003-execution.md:7-17`), with `canRetry`/`ticketStage` in `src/core/stage.ts`. Ending is by executor outcome or human stop; a human message on a followed Thread resumes an ended Ticket under the same Mandate unless a person stopped it (`docs/002-authorization.md:125-141`).

### Effects queue

Durable, SQLite-backed, enqueued **inside** the command transaction and dispatched after commit (`src/app/effects.ts:42-45`; `store.ts:80-82`). Kinds and payloads: `assessment`, `launch`, `delivery`, `relay`, `notice`, `reply` (`effects.ts:11-25`). Per-kind behaviour: `limit`, `retry: [initial, max]`, `ordered`, `quiet` (`effects.ts:26-36`); one row per `(kind, key)`, a newer payload replaces a waiting one and becomes due immediately without changing queue order (`docs/007-architecture.md:168`). `Later` defers without counting a failure (`effects.ts:1-5`). Three consecutive failures mark the kind's health entry (`FAILURES_BEFORE_ERROR = 3`, `effects.ts:7`). Concrete limits/backoffs: `docs/007-architecture.md:172-181` (assessment/delivery/relay/notice 2 s→60 s; launch 5 s→300 s, 3 transient tries; reply 5 s→300 s, ordered, 1 at a time — also `outbox.ts:24`).

### Worker slots and concurrency

`WorkerSlots` (`src/executor/dsh.ts:171`) reserves before a launch or a wake (`reserve(ticketId, 'launch'|'wake'|'person')`, `:192`), sizes from `settings.executor.maxWorkers` (`:230`, default 3 at `src/policy.ts:93`), and exposes `activeCount()` for panel load (`:404`). One extra slot is available for a person's message or a status request, and wakes take priority over launches (`docs/003-execution.md:57-61`). A Ticket holds its slot from launch (including prepare) through the active turn (`docs/003-execution.md:57`).

### Retries and backoff

* Transient provider/network failures: `TRANSIENT_TRIES = 3`, `TRANSIENT_BACKOFF_MS = 15_000` (`executor/dsh.ts:29-30`), classifier `transient()` (`:44-55`; HTTP 408/429/5xx, ECONNRESET/REFUSED/TIMEDOUT/…). Failed turns receive continuation messages after 15/30/60 s (`docs/007-architecture.md:205`).
* Prepare command: one attempt, 10 min limit, failure fails the Ticket (`PREPARE_TIMEOUT_MS`, `executor/dsh.ts:28`; `docs/003-execution.md:49-53`).
* Effect backoff per kind (above); failed input delivery shows on the Ticket, not health (`docs/007-architecture.md:181`).
* Source poll failures: error after three consecutive failed polls by default (`docs/003-execution.md:162-174`).

### Model routing

Two role models in settings: `eval.model` (`src/policy.ts:83-87`) and `executor.model` (`:91-98`), both `RoleModelSchema` = `{provider, model, reasoningEffort?}` (`:70`). `resolveRoleModel` goes through `ctx.llm.resolveCallConfig` (`src/app/role-models.ts:8-12`); `initializeRoleModel` injects a `model/selection` event for the **first** request only (`:15-21`), so an existing Session keeps its model (`docs/003-execution.md:143`). Eval fallback is the profile default when `null` (`docs/006-deployment.md:26`).

### Pause / resume

A single `paused` flag in settings (`src/policy.ts:101`) surfaced as `Runtime.paused()` = `!setup.configured() || settings.paused` (`runtime.ts:200`). It stops dispatch, new Evals, Eval timeouts, input delivery and replies; a launch already under way waits; Sources keep recording Triggers and a running turn is not interrupted (`docs/003-execution.md:192-200`). Eval deadlines shift by the pause length (`engine.ts` `evaluateDue`; `docs/007-architecture.md:93`).

### Background jobs and subagents

`src/executor/background.ts` wraps DSH's `ctx.jobs` and `ctx.subagents`: `runningJobs:61`, `untilQuiet:96`, `killJobs:110`, `collectJob:125`, `stopSubagents:141`, `stopBackground:159`, `cancelled` WeakSet `:46`. A turn ending with background work keeps the slot and stays `working`; after 30 min jobs are killed and the Ticket reported waiting (`BACKGROUND_LIMIT_MS`, `executor/dsh.ts:32`); shutdown waits 10 s per worker (`SHUTDOWN_STOP_MS`, `:34`). Rules: `docs/003-execution.md:31-47`.

### Health board

`HealthBoard` in `src/infra/health.ts`; one claim per entry, each cleared by its own next success (`docs/007-architecture.md:269`). Entries: `runtime`, `models`, `evals`, `assessment`, `launch`, `delivery`, `relay`, `notice`, `reply`, `worker`, `github`, `feishu`, `history`, `sync:<source id>` (`docs/006-deployment.md:183-191`). `evals` counts unresolved `unavailable` Decisions from the last hour (`src/app/views/overview.ts:26`; `runtime.ts:154-156`).

### Notices and relay

`src/app/notices.ts` builds `[name, value, summary]` tuples where `name` is the effects coalescing key (`:10-14`): `settingsNotice:22`, `promptsNotice:16`, `receiptNotice:39`, plus `eventNotice`, `reportRelay`, `followupRelay`, `resultRelay` (`docs/007-architecture.md:42`). `Runtime` suppresses self-caused notices while a main-Session tool runs (`quiet` counter, `runtime.ts:85,140`) and also emits pull-request end notices (`runtime.ts:147-152`). `relay` is ordered and limited to 1; `notice` likewise but does not wake the Session (`docs/007-architecture.md:177-178`). Messages are steered in at the Session's next step; kinds and payloads: `docs/007-architecture.md:581-594`.

---

## 3. Memory (what persists, what does not)

### Persisted today

*Domain aggregates (SQLite tables, written by the Engine):* `trigger` (immutable events, ISO `at`), `disposition` (filtered/eval/decision/fan-out/requeue/hand-back/ack), `trigger_thread`, `thread` (subscriptions, queued triggers, running eval, expiry count, Source `meta`), `ticket` (Mandate, origin, execution, assignments, channels, inputs, follows), `decision` (`store.ts:71-87`; `docs/007-architecture.md:454-465`).

*Queue and delivery:* `effect` (durable work), `outbox` (receipt per message id + drop reason) (`store.ts:80-87`).

*Key-value records* (`src/kv.ts:21-58`): `schema`; settings revisions and per-block revisions/snapshots (`:25-27`); prompt revisions and `prompt-built-in:<base>` (`:29-31`); `master-id` (`:33`); `session-prompts:<session id>` — prompt revisions each Session worked under, last entry = active (`:34-35`); schema-11 legacy queues (`:37-38`); `source-labels:<source>` (`:40`); GitHub cursors/retries/stream ETags/branch-CI/PR-CI (`:46-50`); Feishu chats/history cursors/topics/seen/initialized (`:55-57`). Every key is spelled once here (`docs/007-architecture.md:468`).

*Session history:* owned by DSH session persistence, not this plugin — `ctx.sessionPersistence.flush()` on shutdown (`runtime.ts:243`) and transcript reads through `sessionPersistence.open(id,'read')` (`FORK-NOTES.md:28-32`). Executor transcripts are readable by the main Session through `ticket/<id>/transcript` resources (`docs/007-architecture.md:561`).

*Execution artifacts:* one directory per Ticket under the execution root, plus `<stateDir>/worker-bin` shims and `<stateDir>/worker-gitconfig` (`src/infra/environment.ts:19-20`; `docs/006-deployment.md:222-227`).

### Ephemeral only

Bounded in-memory `TextCache` instances for source links, resources and Feishu page reads (`runtime.ts:77,118`; `src/app/cache.ts`), lost on restart (`docs/007-architecture.md:482`). MasterAssessor keeps per-Eval state in memory and releases it when the Eval ends (`assessment.ts:108`).

### Cross-ticket "knowledge"

There is **no shared memory store**. The only cross-Ticket channels are:
1. `orchestrator_ticket_note` — a fact from another Ticket as a text Input, ≤100 words, grants no authority (`docs/004-prompts.md:81`; `src/core/tickets.ts:395`).
2. `orchestrator_thread_follow` — subscribe another Thread for context only, no authority, no resume (`engine.ts:214`; `docs/002-authorization.md:40-44`).
3. The main Session's routing card, which lists `related_tickets` (open first) and `tickets_total` for a candidate (`docs/007-architecture.md:543`).

### Prompt context

Assembled per request from built-in parts + team sections + generated environment/policy (`prompts.ts:102-118`). Sizes are capped deliberately: assignment 1,500 chars and trigger 600 chars inline (`executor/dsh.ts:113`), assessment thread window = first 5 messages + 5 either side, 400/1,200 chars, other messages as 50-char stubs (`docs/007-architecture.md:545-546`).

### Search APIs

`store.read.search(query, limit)` over Trigger text (`src/app/store-read.ts:54`), exposed as `GET search` (`http.ts:159`) and panel header search (`src/app/views/threads.ts:59`; `docs/005-panel.md:44-48`), plus `threadTriggers` timeline paging (`store-read.ts:34`) and the model-facing `orchestrator_read` resource catalogue (`src/app/resources.ts`; `docs/007-architecture.md:550-571`).

### Explicit absence

* No vector store, embeddings, semantic recall, or knowledge graph — no such dependency in `package.json:58-124` and no module under `src/`.
* No long-term memory across Tickets/Sessions beyond the aggregate tables above; a new worker Session starts from its assignment plus inputs (`docs/007-architecture.md:594`).
* No learning loop: Decisions and Reports are recorded but never aggregated into Policy or prompt text automatically; Policy changes only from a person's save or a Source sync (`docs/002-authorization.md:107-117`; `docs/004-prompts.md:91-96`).
* No retention/GC: `trigger`, `disposition`, `decision`, ended Tickets, outbox receipts, every settings/prompt revision and per-Thread Source records grow without bound (`docs/007-architecture.md:484`).
* No benchmark/trajectory scoring surface: tests are unit/integration only; the only durable trajectory is the DSH session history.

---

## 4. Install / upgrade

### Build

`pnpm build` → `tsdown` (`package.json:48`; `tsdown.config.ts:9-13`) producing `lib/index.js`, `lib/github-watch.js`, `lib/feishu-watch.js` (ESM, dts) and `lib/client.js` (browser CJS wrapped for `window.__ModuleLoader__`). `pnpm check` = typecheck + test + build (`package.json:51`). Node `^22.19.0 || >=24.0.0` (`:54`).

### Install

The package is `private: true` and is installed by linking a checkout into a dedicated DSH profile (`docs/006-deployment.md:73-87`):

```sh
npm install -g @deepseek-ai/dsh@<version>
git clone <repo> dsh-superagent && cd dsh-superagent
pnpm install && pnpm build
dsh superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
```

Profile creation must run only once (it overwrites `cordis.patch.yml`) (`docs/006-deployment.md:87`). Windows variant in `FORK-NOTES.md:64-73` (start `dsh --profile superagent --no-open` directly because the service script is POSIX-only).

### Profile configuration

`examples/profile.cordis.patch.yml:1-12`: sets `webserver.host/port` and `dsh-superagent.stateDir`, optionally enables `dsh-superagent-feishu`. Plugin `Config` (`src/deployment.ts:17-25`): `stateDir` (absolute, required) plus volatile `promptMaxChars`, `admissionContextMaxPages`, `admissionContextTimeoutMs`; `machineOf` narrows it to `Machine` (`:40-45`). Every key except `stateDir` is volatile and re-read on use (`docs/007-architecture.md:606`). `stateDir` holds the DB, lock, `worker-bin`, `worker-gitconfig` and default Ticket directories (`docs/006-deployment.md:95`).

### Setup probes

`Setup` (`src/app/setup.ts:24`) runs `resolveDeployment`/`resolveFeishuBot` with a probe that runs CLIs **the way worker shells run them** (`deployment.ts:76-88,90-116,117`), writes the worker environment, and keeps a `SetupProblem` (`src/setup.ts`). `setupChanged` compares only `SETUP_FIELDS` (github account fields + feishu `cli`, `deployment.ts:47-53`; `setup.ts:17-18`), and a save touching them restarts the plugin (`settings.ts:176`; `docs/007-architecture.md:608`).

Environment writing (`src/infra/environment.ts`): `WORKER_COMMANDS = ['gh','git','lark-cli']` (`:18`), shims in `<stateDir>/worker-bin` (`:19`), git config in `<stateDir>/worker-gitconfig` (`:20`), credential helper from the agent CLI (`:23`), `writeEnvironment` (`:79`), `applyEnvironment` (`:119`), `runAsWorker` (`:128`), `verifyEnvironment` (checks git credential config, `:138`), `verifyDirectory` (rejects repo-level credential overrides, `:149`). Setup also strips env vars whose names contain KEY/PASSWORD/SECRET/TOKEN (`docs/006-deployment.md:218`).

### Deployment page and API

Panel page `src/client/deployment.tsx` (also exposed in DSH's Plugin Manager), server view `src/app/views/settings.ts:23`, routes `PUT settings/:block` and `POST setup/check` (`src/app/http.ts:196,205`). Route table and documented agent-facing subset: `docs/006-deployment.md:159-214`. Health/setup state is `GET state` (`http.ts:156`, shape at `docs/006-deployment.md:171`).

### Service script

`scripts/dsh-superagent` — Python 3 + tmux (`:1-7`), `start`/`stop`/`restart`/`status`, control files under `.artifacts/control/profiles/<profile>/`, newest 20 logs kept (`:24-27`), exit codes 0/1/2/3 (`docs/006-deployment.md:113-124`). POSIX-only; not ported to Windows (`FORK-NOTES.md:61,99-101`).

### Upgrade and migration

1. Stop mid-turn work, back up `orchestrator.sqlite`, `git pull && pnpm install && pnpm build`, `scripts/dsh-superagent restart` (`docs/006-deployment.md:233-242`).
2. Schema: `SCHEMA_VERSION = 11`; `migrateTo11` runs once in a transaction at open and leaves the file unchanged on failure (`store.ts:69-96`; `migration.ts:36`). Older-than-10 or newer-than-11 refuses to start (`store.ts:65-68`). Downgrade requires the pre-upgrade backup (`docs/006-deployment.md:242`).
3. Prompt overrides survive upgrades: each override records `base`; a changed default is reported as **Default updated** and can be kept or dropped (`docs/004-prompts.md:40-42`; `KV.prompts.builtIn` `kv.ts:30-31`).
4. Preset rows must stay in `cordis.patch.yml` while Sessions exist, or resume fails with `agent-preset/not-found` (`docs/006-deployment.md:244-246`).
5. Migrated databases are not backward compatible (`docs/006-deployment.md:242`).

### Verification tooling

* `vitest` with `include: ['tests/**/*.spec.{ts,tsx}']` and React dedupe for panel tests (`vitest.config.ts:3`). ~1,197 tests; 1,153 pass on native Windows, 44 POSIX-only failures (`FORK-NOTES.md:84-88`).
* `tests/bundle-patch.spec.ts` is the install-integrity test: it applies the real patch with Cordis's include plugin and asserts presets (`:10-21,29-51`).
* `tests/runtime.spec.ts` runs the whole application on a simulated DSH host through tools and HTTP (`docs/007-architecture.md:426`); `tests/index.spec.ts` covers the plugin entry (`:438`).
* Doc/consistency gates: `tests/docs.spec.ts` (numbered docs link only backwards; module and test tables complete), `tests/class-docs.spec.ts` (JSDoc per class), `tests/model-surface.spec.ts` (tools/prompts/skills/inputs vs schemas and size budgets) (`docs/007-architecture.md:437,445-446`).
* Manual end-to-end: `FORK-NOTES.md:90-95` (link into a fresh profile, start, `GET /orchestrator/api/state` 200, DB created).
* **No CI**: no `.github/` directory, no workflow or pipeline config in the repo.

---

## 5. Constraints and extension points

| Need | Where to hook |
| --- | --- |
| New persisted state | add table SQL in `store.ts:71-87` + generated columns in `SETS` (`:30-44`); bump `SCHEMA_VERSION` and extend `migrateTo11`/add `migrateTo12` (`migration.ts:20,36`); declare keys in `src/kv.ts:21` |
| New prompt section | add a `PartKey` (`prompts.ts:24-26`), text file under `prompts/`, role list in `builtInParts` (`:55`), and position in `promptParts` (`:107-115`) |
| New team-editable section | must extend `TEAM_SECTIONS` (`prompts.ts:14`) **and** `PromptConfigSchema` (`:35`) — currently fixed at three |
| New panel page/route | `src/app/api.ts:20` (type), `http.ts:156-212` (handler), `src/app/views/*.ts` (projection), `src/client/route.ts` (tab), `src/client/locales.ts` (both languages) |
| New model tool | `src/app/tools/main.ts` / `executor.ts`, picked per role at `runtime.ts:124`; tool descriptions are code, not prompts (`docs/007-architecture.md:600`) |
| New effect kind | `EffectPayloads` (`effects.ts:11-25`) + a `handle()` registration with `limit`/`retry`/`ordered` |
| New settings block | `src/policy.ts:100-107` schema + `BLOCKS` in `settings.ts:32` + settings view + panel form + history (`settings-history.ts`) |
| New Source | implement `SourceKind` (`src/sources/kind.ts`) and register with `SourceRegistry` (`registry.ts`); see module table `docs/007-architecture.md:361-376` |
| New i18n copy | `src/client/locales.ts` only (`en`/`zh` parallel arrays; `:750-762`) |

**Test conventions:** `vitest`; domain tests use `MemoryRepositories` from `src/core/memory.ts` with an in-memory `Policy`/`Executor`/`Outbox` harness (`tests/core-engine.spec.ts:15-45`); app/infra tests use a real temp SQLite `Store` and `HealthBoard` (`tests/effects.spec.ts:17-26`); panel tests use jsdom + `tests/fixtures/panel-server.ts` (fake management API) and `tests/fixtures/host.ts` (simulated DSH host); time is injected (`now`/clock) rather than slept.

---

## 6. Gaps relevant to a hermes-agent benchmark

1. **No long-term memory layer at all.** Persistence is per-aggregate SQLite plus KV cursors; there is no vector store, embedding, recall API, or cross-Ticket knowledge base (`store.ts:71-87`; `kv.ts:21-58`; no such dependency in `package.json:58-124`). A "remember this for later tickets" capability has to be built from scratch.
2. **No learning from outcomes.** Decisions, reasons and Reports are stored (`store.ts:75-77`; `src/core/model.ts:192-233`) but nothing aggregates them; Policy/prompts change only through a person's save or a Source sync (`settings.ts:141`; `docs/002-authorization.md:107-117`). Benchmarking "does the agent improve over N tasks" currently has no mechanism to hook into.
3. **No memory tools for the model.** The main Session's 14 tools are routing/ticket/settings tools (`docs/007-architecture.md:490-507`, `src/app/tools/main.ts`); workers get 6 (`docs/007-architecture.md:519-529`). There is no `remember`/`recall`/`search memory` and no tool that writes durable knowledge.
4. **Context is aggressively truncated.** Assignment 1,500 chars, trigger 600 chars (`executor/dsh.ts:113`); assessment window 5+5 messages with 400/1,200-char caps and 50-char stubs (`docs/007-architecture.md:545-546`); cards and notices cap summaries (`docs/007-architecture.md:589-594`). Long-horizon tasks rely on DSH compaction (`cordis.patch.yml:79-95`), not on plugin-level summarization.
5. **No evaluation/benchmark harness in-repo.** Tests are unit/integration; there is no golden-task corpus, scoring, replay or trajectory export (whole `tests/` tree; `vitest.config.ts:3`), and no CI to run one (no `.github/`).
6. **Single-repository, single-tenant assumption.** `resolveDeployment` resolves exactly one `owner/name` repository and one agent account (`deployment.ts:90-116`); Policy sources are an open record but the shipped blocks are `github`/`feishu` (`policy.ts:77,102`; `docs/006-deployment.md:169-205`). Multi-repo or multi-team routing is not modelled.
7. **Single-process concurrency ceiling.** A `proper-lockfile` lock on `stateDir` prevents a second process (`runtime.ts:93`), worker parallelism is bounded by `maxWorkers` (default 3, `policy.ts:93`) in one process over one SQLite file; there is no queue broker or distributed worker pool.
8. **No retention or compaction of domain records.** Explicitly documented as unbounded growth for triggers, dispositions, decisions, ended Tickets, outbox receipts and every settings/prompt revision (`docs/007-architecture.md:484`); no archival or TTL code exists.
9. **Tool surface is deliberately narrow and non-extensible at runtime.** Both presets omit plugin manager, market, scheduling, goals and workflows (`cordis.patch.yml:20-120,125-193`; asserted in `tests/bundle-patch.spec.ts:44-51`), and workers cannot ask a person, present UI, or message other Sessions (`docs/007-architecture.md:532`). Skill extensibility is limited to team skills under a fixed name prefix (`prompts.ts:18-22`).
10. **Platform gaps on Windows.** The service script and worker shims are POSIX-only, and 44 tests fail on native Windows (`FORK-NOTES.md:61,84-88,99-101`), so a benchmark harness that shells out to `scripts/dsh-superagent` will not run as-is on the Windows checkout used here.
