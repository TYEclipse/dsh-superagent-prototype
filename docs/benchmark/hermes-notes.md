# hermes-agent — technical notes for benchmarking a DSH bundle

- **Repo:** https://github.com/NousResearch/hermes-agent
- **Commit:** `110afdd60e3098b86950963b06a792e261bd36a4` (branch `main`, committer date `2026-11-08T11:17:03Z`)
- **Notes date:** 2026-11-08
- **Verification method:** commit pinned with `gh api repos/NousResearch/hermes-agent/commits/main --jq '.sha,.commit.committer.date'`; every file below was downloaded with `gh api "repos/NousResearch/hermes-agent/contents/<path>?ref=110afdd6…" --jq .content` and base64-decoded locally, then read. `raw.githubusercontent.com` was unreachable from this host (curl: connection reset), so all paths are repo-relative against the pinned SHA and every excerpt was copied from the decoded file at that SHA. Line numbers are from those files. Files inspected: 24 (listed under Sources).

---

## 1. Architecture

### 1.1 Facade + siblings module layout
Former god-files are split into a thin facade that keeps the public entry points and import-compatible names, plus one sibling module per topic (`<stem>_<topic>.py`). Siblings late-import the facade inside functions to avoid module-level cycles, and patch points are deliberately routed through the facade. This is the single most visible structural decision in the repo: `run_agent.py` → `agent/turn_*.py`, `hermes_state.py` → `hermes_state_*.py`, `cli.py` → `hermes_cli/cli_*_mixin.py`, and it is enforced by per-unit size/complexity ratchets.
- Evidence: `AGENTS.md:93-107` — “Every former god file is a **facade** (public entry points + the names other packages import) plus **siblings** `<stem>_<topic>.py`, each owning one topic”; ratchet rule at `AGENTS.md:102-104` (“new functions CC ≤ 20, ≤ 300 lines, nesting ≤ 6; files ≤ 2,000 lines; units already over may only go down”).
- Takeaway for a DSH bundle: adopt the *naming and seam* rule (`x.ts` facade + `x.y.ts` siblings, no cross-imports except through the facade) even at small size — it is what keeps a plugin from becoming one 3k-line `index.ts`.

### 1.2 Turn admission is a separate layer from the turn loop
`run_conversation` on the agent is a façade that does admission control before any model work: it takes a **durable cross-process session turn lease** (`admit_durable_turn_lease`), starts a lease refresher thread and liveness watchdog, opens relay/accounting/portal scopes, and only then calls the real loop. Early admission results (interrupted / timed out) return a result dict *and* re-attach the unadmitted user message so a cancelled turn still shows the prompt.
- Evidence: `agent/turn_facade.py:3-6` — “Turn admission around ``conversation_loop.run_conversation``: durable cross-process session turn lease + refresher thread and liveness watchdog”; the admission call at `agent/turn_facade.py:83-86`, early-result carry at `:87-96`.
- Takeaway for a DSH bundle: put “may this session run a turn at all” (single-flight per session, cancel-before-start) in a wrapper above the loop, not sprinkled inside it; that wrapper is also where you return a synthetic result to the UI.

### 1.3 The turn loop is a sequence of bound phase functions
The loop itself lives in `agent/conversation_loop.py` and reads as an ordering of phases, each imported and bound at module import time: preflight gate → request assembly → API call → response check → tool round → final response → finalizer. Phase helpers are bound at import specifically so a source-tree swap cannot load a skewed phase mid-turn.
- Evidence: `agent/conversation_loop.py:1-5` — “``run_conversation(agent, ...)`` drives one user turn (model call, tool dispatch, retries, fallbacks, compression, post-turn hooks)”; binding rationale at `:46-47` (“Phase helpers of the turn loop, bound at import so a source-tree swap cannot load a skewed phase mid-turn”).
- Takeaway for a DSH bundle: express the turn as an explicit ordered list of typed phases returning a verdict, not as nested `if`s inside one `while`; it makes “what happens on abort at phase N” answerable.

### 1.4 Tool round: validate → cap → dedupe → persist → execute
One tool round is its own module with a `ToolRoundVerdict` whose `action` is exactly `continue | break | return`, so the loop only has three transitions to handle. Tools are validated first (invalid names get synthetic error results rather than being silently dropped), delegate calls are capped, duplicates removed, and the assistant tool-call message is appended to the canonical history **before** any tool has side effects.
- Evidence: `agent/turn_tool_round.py:56-59` — “Execute one tool round in the exact original order. Persist-before-execute is a durability invariant: resume must see the executed block if a destructive tool restarts Hermes”; verdict enum at `:29-34`, persist at `:110-113`.
- Takeaway for a DSH bundle: persist the assistant tool-call block before running tools; on resume the harness then knows a side effect may already have happened instead of re-running it. A 3-value verdict type is enough.

### 1.5 “Narrow waist, capability at the edges” + prompt-cache as a hard invariant
Two stated invariants drive design and review: (a) every model tool is sent on every API call, so new *core* tools are rare and capability arrives as CLI+skill, service-gated tool, or plugin; (b) mutating past context, swapping toolsets, reloading memories or rebuilding the system prompt mid-conversation breaks the cached prefix — the only sanctioned exception is context compression. The footprint ladder is written down explicitly (extend existing code → CLI+skill → service-gated tool → plugin → MCP server → new core tool).
- Evidence: `AGENTS.md:18-26` — “**Per-conversation prompt caching is sacred.** … the ONE exception is context compression”; “**The core is a narrow waist; capability lives at the edges.**”; ladder at `AGENTS.md:56-59`.
- Takeaway for a DSH bundle: state the same two invariants in the bundle's own AGENTS.md and use them as review gates — for a TS plugin, “don't rebuild the system prompt mid-session” is the cheap, portable half of this.

### 1.6 Pluggable context engine behind a small ABC
Compaction is not hard-wired: a `ContextEngine` ABC owns token counters (`last_prompt_tokens`, `threshold_tokens`, `context_length`, `compression_count`), `update_from_response`, `should_compress`/`compress`, and a default no-op `prune_tool_results_only`. `context.engine` selects one plugin engine, `ContextCompressor` is the default, and host code reads those attributes directly — so the contract is attribute-shaped, not just method-shaped.
- Evidence: `agent/context_engine.py:4-8` — “ContextCompressor is the default; ``context.engine`` selects a plugin (``plugins/context_engine/<name>/``); one is active. Lifecycle: on_session_start() -> per API response update_from_response() -> per turn should_compress() / compress() -> on_session_end()”; defaults at `:68-73` (`threshold_percent = 0.75`, `protect_first_n = 3`, `protect_last_n = 6`).
- Takeaway for a DSH bundle: make compaction an interface with an explicit lifecycle and *readable* token state, and ship the simple compressor as the default implementation rather than as special-case code.

### 1.7 Sessions are durable rows in one SQLite store, shared by every surface
The ACP adapter (editor integration) does not keep sessions in memory: it maps ACP sessions onto `AIAgent` instances whose history lives in the shared `SessionDB` (`~/.hermes/state.db`), which is also what `session_search` queries. Reconnect/resume reload from there.
- Evidence: `acp_adapter/session.py:1-5` — “Sessions are persisted to the shared SessionDB (``~/.hermes/state.db``) so they survive process restarts and appear in ``session_search``; ``load_session`` / ``resume_session`` after an editor reconnect restore the full history from there.”
- Takeaway for a DSH bundle: one durable session store as the source of truth for every transport (CLI, web, IDE) beats per-UI conversation state; resume is then a read, not a reimplementation.

---

## 2. Orchestration

### 2.1 Per-agent iteration budget with refunds
Each agent (parent or subagent) owns an `IterationBudget`, a thread-safe consume/refund counter with its own cap: parent `max_iterations` (default 500), subagent `delegation.max_iterations` (default 50), so parent + children total can exceed the parent cap. `execute_code` (programmatic tool calling) iterations are refunded so batched tool work does not eat the budget.
- Evidence: `agent/iteration_budget.py:3-5` — “the parent's cap is ``max_iterations`` (default 500), each subagent's ``delegation.max_iterations`` (default 50), so total iterations across parent + subagents can exceed the parent's cap”; refund contract at `:26-27`.
- Takeaway for a DSH bundle: a per-agent counter with an explicit `refund()` is ~40 lines and removes the classic “subagent burned the parent's budget” bug; give children their own smaller cap instead of sharing one global counter.

### 2.2 Delegation: core owns the lifecycle, a provider only picks the route
`delegate_task` splits into (a) a core lifecycle (spawn, isolation, roles, depth, concurrency, background units, stop fan-out, results, `output_schema`, progress) and (b) a `DelegationProvider` whose single abstract method `route_task()` answers “which model/provider/endpoint/effort/profile does this child use”. Providers are plugins selected by `delegation.backend`; the default strategy is itself a bundled plugin. A provider that is configured but unavailable **fails closed** — the tool returns an error naming the backend instead of silently running on another route. Providers may add per-task schema parameters but may not redefine core ones (`RESERVED_TASK_PARAMETERS`), because the schema is part of the cached prompt prefix.
- Evidence: `agent/delegation_provider.py:8-10` — “Core keeps the whole lifecycle (spawn, isolation, roles, depth, concurrency, background units, stop fan-out, results, ``output_schema``, progress); a provider only answers ‘which route does this task take’.”; reserved list at `:45-48`; fail-closed at `agent/delegation_registry.py:8-10`.
- Takeaway for a DSH bundle: separate “what the child is allowed to be” (core) from “which model/tools it gets” (policy object). Fail closed on an unavailable policy — silent fallback is the expensive bug.

### 2.3 Concurrency, depth and timeout defaults for children
Defaults: `max_concurrent_children = 10` (config or `DELEGATION_MAX_CONCURRENT_CHILDREN`, floor 1, with a cost advisory above 10), `MAX_DEPTH = 1` (flat parent→child unless `max_spawn_depth` raises it), and **no** default wall-clock child timeout — stuck children are detected by a heartbeat-staleness monitor instead, with `delegation.child_timeout_seconds` as an opt-in. Worker threads get a non-interactive approval callback that **denies by default** (`delegation.subagent_auto_approve` to allow), because worker threads do not inherit the TUI's prompt callback and `input()` would deadlock the parent.
- Evidence: `tools/delegate_tool_config.py:19` (`_DEFAULT_MAX_CONCURRENT_CHILDREN = 10`), `:23` (`MAX_DEPTH = 1  # flat by default`), `:27-29` (no default wall-clock cap), `:37-42` (auto-deny callback: “deny by default, approve when delegation.subagent_auto_approve is true”).
- Takeaway for a DSH bundle: cap fan-out, default to depth 1, and pre-wire the child's approval behaviour to *deny* — in a TS plugin an inherited interactive prompt is a hang, not an error.

### 2.4 Error classification is a typed enum, not string matching
A priority-ordered pipeline maps an API exception to a `ClassifiedError` carrying recovery hints (retry / rotate credential / fallback / compress / abort); the retry loop consults the hints instead of re-matching strings. The taxonomy is a large `FailoverReason` enum (~30 members) that distinguishes things a naive 429/500 handler conflates: `rate_limit` vs `upstream_rate_limit` (aggregator's upstream model 429 — the key is healthy) vs `upstream_blocked` (WAF/CDN 403 — key healthy) vs `billing` vs `model_entitlement` vs `context_overflow` vs `payload_too_large` vs `content_policy_blocked` (deterministic, don't retry unchanged) vs `role_alternation` (merge adjacent same-role messages and retry).
- Evidence: `agent/error_classifier.py:1-5` — “A priority-ordered pipeline maps an API exception to a ``ClassifiedError`` whose recovery hints (retry, rotate credential, fallback, compress, abort) the retry loop … consults instead of re-matching strings itself.”; representative members at `:40-44`.
- Takeaway for a DSH bundle: a ~15-case discriminated union plus a hint record is the highest-leverage piece to port; even without providers, `context_overflow ≠ rate_limit ≠ billing` changes behaviour on every long session.

### 2.5 Rate-limit cooldown: provider reset wins, else capped exponential
When leaving the primary on a rate-limit-ish reason, the code arms `_rate_limited_until` (monotonic) either until the provider-declared `reset_at`, or with exponential backoff `min(60 * 2**n, 14400)` (1 min → 4 h). If the provider reset is soon, an opt-in `fallback.min_switch_reset_seconds` (default 0 = off) suppresses the model switch entirely and lets the retry loop ride out the window, because switching costs more than waiting. Entitlement rejections (Codex account 400) mark a `(provider, model)` pair dead for the session so the fallback walk and `restore_primary_runtime` stop oscillating.
- Evidence: `agent/fallback_cooldown.py:69` — `backoff_seconds = min(60 * (2 ** backoff_count), 14400)`; `:25-28` — “Opt-in ``fallback.min_switch_reset_seconds`` … when the primary's rate limit reopens sooner than N seconds, switching model mid-task costs more than waiting”; `:79-88` dead-pair marking.
- Takeaway for a DSH bundle: keep the *ladder* (60s→…→4h cap), prefer a server-provided reset time, and remember rejected (provider, model) pairs for the session — three small maps, no infra.

### 2.6 Kanban worker: in-place turn recovery with lease proof
For long-running scheduled/board work, a worker turn that dies on a retryable failure is retried **in place** (same session, same history, bounded budget, explicit backoff, a continuation nudge telling the model to finish with a real terminal call) instead of letting the dispatcher respawn the card cold. Retry authority is positive and typed: only a `failed` turn whose classifier marked it `retryable`; interrupts and budget-exhausted settlements are never retried. Before every attempt the worker must prove it still owns the exact live run and unexpired claim lease from `HERMES_KANBAN_*`; any missing coordinate fails closed. Exhausting the budget exits non-zero so the run is booked honestly.
- Evidence: `agent/kanban_turn_recovery.py:10-11` — “This module retries such a turn IN PLACE: same session, same conversation history, bounded budget, explicit backoff”; authority/lease rule at `:16-29` (“only a ``failed`` turn whose classifier marked the failure ``retryable`` is eligible”; “the task/run ``claim_expires`` lease must be unexpired; any missing coordinate or expired lease means no proof, no retry”).
- Takeaway for a DSH bundle: for background/queued work, cold restart on the first transient error is the expensive default. Retry in place *if and only if* you can prove ownership — and make “gave up” a non-zero outcome.

### 2.7 Fire-claim timing for scheduled jobs
Cron jobs use a claim record with a 300 s TTL `FIRE_CLAIM_TTL_SECONDS` (heartbeat cadence 60 s), a 60 s early-fire skew allowance, and TTLs derived from the run timeout with `CLAIM_TTL_INACTIVITY_HEADROOM = 3` because the timeout is an inactivity limit, not a wall clock. One value is shared by claiming, one-shot re-arm and stale-error recovery so they cannot disagree.
- Evidence: `cron/constants.py:8-16` — “A fire_claim younger than this is a live run (heartbeat cadence is 60 s). One value for claiming, one-shot re-arm, and stale-error recovery so they cannot disagree”; `FIRE_CLAIM_TTL_SECONDS = 300` at `:9`.
- Takeaway for a DSH bundle: if you ever run scheduled work, one shared claim-TTL constant + heartbeat beats per-call-site timeouts; the “skew allowance” idea (a job may fire slightly before its slot) applies to any lease-based scheduler.

### 2.8 Identity is carried in ContextVars, not env vars
A process may be a dispatcher worker while also hosting in-process delegate children and cron runs. Which identity gates apply is decided by `ContextVar`s (`_DELEGATED_CHILD_CONTEXT`, `_NON_DISPATCHER_OWNED_CONTEXT`) rather than by mutating `os.environ`, because the process-global env is shared with the worker's claim heartbeat and concurrent readers. One predicate, `is_dispatcher_owned_worker_context()`, is the only correct gate.
- Evidence: `agent/delegation_context.py:3-6` — “In-process delegate_task children and cron jobs … are NOT dispatcher-owned, so identity gates must fail closed for them without mutating the process-global environment”; `:71-73`.
- Takeaway for a DSH bundle: in Node the same trap exists with `process.env`; use `AsyncLocalStorage` for child/worker identity and keep env for configuration only.

---

## 3. Memory

### 3.1 MemoryManager fans hooks out to providers, exactly one external provider
`MemoryManager` owns the agent's memory *hooks* and dispatches them to registered providers: build the system-prompt block, prefetch per turn, sync the finished turn, expose provider tools, shut down. The builtin store is always allowed; only **one** external plugin provider may be registered at a time (tool-schema bloat, conflicting backends), selected by `memory.provider`.
- Evidence: `agent/memory_manager.py:1-4` — “MemoryManager — fans the agent's memory hooks out to registered providers. The builtin provider is always allowed; only ONE external plugin provider may be registered at a time (tool-schema bloat, conflicting backends).”; hook surface at `:350-360` (`build_system_prompt`, `prefetch_all`), `:459` (`sync_all`).
- Takeaway for a DSH bundle: define memory as 4 hooks (`promptBlock`, `prefetch`, `syncTurn`, `tools`) and allow exactly one backend — a “provider” abstraction with N backends multiplies prompt tokens and merge bugs.

### 3.2 Admission gate for slow/foreign memory backends
Because an external provider is arbitrary code, its calls are gated: a background call older than 30 s counts as stalled; each `(home, provider)` may have at most 4 stuck calls before new calls are refused; while the gate is closed one probe per 60 s is allowed so a recovered backend can prove itself; hard cap 16 in-flight calls including orphans. Shutdown drains for 5 s; threads are daemons so a wedged provider cannot block interpreter exit.
- Evidence: `agent/memory_manager.py:45-57` — “A background provider call … running longer than this is treated as stuck” (`_BACKGROUND_CALL_STALL_S = 30.0`), `_MAX_STUCK_CALLS = 4`, `_PROBE_INTERVAL_S = 60.0`, `_MAX_INFLIGHT_CALLS = 16`, `_SYNC_DRAIN_TIMEOUT_S = 5.0`.
- Takeaway for a DSH bundle: third-party memory/skill backends are untrusted latency. A closed-gate-with-probe pattern plus a hard in-flight cap is portable and prevents one dead backend from stalling every turn.

### 3.3 Provider lifecycle + per-profile instance isolation
`MemoryProvider` is an ABC with `initialize → system_prompt_block / prefetch / sync_turn → tool dispatch → shutdown` plus optional `on_*` hooks, and a written multiplexing contract: hand every load a NEW instance, bind every store/path/client from `initialize()`'s `hermes_home`, keep no profile-specific mutable state at module or class level. One gateway process serving several profiles would otherwise cross-wire memory.
- Evidence: `agent/memory_provider.py:1-5` — “Plugins ship in ``plugins/memory/<name>/``, activated via ``memory.provider`` (ONE external provider at a time). Lifecycle, driven by MemoryManager: initialize -> system_prompt_block / prefetch / sync_turn per turn -> tool dispatch -> shutdown”; multiplexing contract at `:87-95`.
- Takeaway for a DSH bundle: when a bundle is loaded into a shared host process, per-workspace instances are mandatory; “no module-level mutable state” is the one-line version of this rule.

### 3.4 Recall is fenced, sanitized, scrubbed and length-capped
Recalled memory is injected inside `<memory-context>…</memory-context>` with a `[System note: … recalled memory context, NOT new user input …]` preamble, and the agent strips both fences back out of anything leaving it — including a stateful `StreamingContextScrubber` that holds back partial tag tails between deltas so a fence split across chunks cannot leak to the UI. Before egress the text is redacted and elided to 6 000 chars (4 000 head + 1 500 tail).
- Evidence: `agent/memory_context.py:1-4` — “``build_memory_context_block`` fences prefetched recall for the prompt; ``sanitize_context`` and ``StreamingContextScrubber`` strip those fences … from text that leaves the agent”; `:30-35` on split spans; caps at `agent/context_engine.py:20-22` (`MEMORY_CONTEXT_MAX_CHARS = 6_000`, `_MEMORY_CONTEXT_HEAD_CHARS = 4_000`, `_MEMORY_CONTEXT_TAIL_CHARS = 1_500`).
- Takeaway for a DSH bundle: fence + scrub is the cheapest defence against “the model echoed its own memory block”. The streaming scrubber is ~60 lines and directly portable to TS.

### 3.5 Trivial-prompt gate saves a recall round-trip
Prefetch is skipped for empty input, slash commands, and bare acknowledgements/greetings (“hi”, “thanks”, “continue”, “lgtm”, “k”), via one anchored regex that is the single source of truth for both the core gate and provider-side classifiers — deliberately not matching “k8s”, “yolo” or “note”.
- Evidence: `agent/memory_provider.py:63-72` — “Prompts with no semantic signal; single source of truth for the core prefetch gate and provider-side classifiers. Anchored and followed only by whitespace/punctuation, so ‘k8s’/‘yolo’/‘note’ do NOT match”; `is_trivial_prompt` at `:75-81`.
- Takeaway for a DSH bundle: a 12-line regex removes one round-trip on a large share of real turns; put it in the shared layer so every backend agrees.

### 3.6 Curator: inactivity-triggered skill lifecycle, never deletion
Skill maintenance runs without a cron daemon: when the agent is idle and the last run is older than `interval_hours`, `maybe_run_curator()` transitions lifecycle states from activity timestamps and may fork an auxiliary agent that can pin/archive/consolidate/patch skills through `skill_manage`. Defaults: interval 7 days, min idle 2 h, stale after 14 days, archive after 30 days; the LLM consolidation pass is opt-in (`DEFAULT_CONSOLIDATE = False`) while the deterministic inactivity prune always runs when enabled. State persists in `<hermes_home>/skills/.curator_state`; usage counters (`use_count`, `view_count`, `patch_count`, `last_activity_at`, `state`, `pinned`) live in `skills/.usage.json`. Invariants: only `created_by: "agent"` skills, never delete (archive is the maximum), pinned skills exempt from every auto-transition, archives restorable from `skills/.archive/`.
- Evidence: `agent/curator.py:1-6` — “Inactivity-triggered (no cron daemon) … never delete, only archive (recoverable); pinned skills bypass all auto-transitions”; `:31-35` for the four defaults; `skills/AGENTS.md:64-81` for state/usage files and the invariant list.
- Takeaway for a DSH bundle: “learned capability” needs a garbage collector with a *reversible* maximum action; archive-not-delete plus a pinned escape hatch is the part worth copying, and it needs no scheduler — just an idle check.

### 3.7 Learning graph makes memory + skills inspectable
A separate assembler turns “what the user actually learned” into a graph: non-base, agent-created or agent-used skills plus `MEMORY.md`/`USER.md` chunks as first-class nodes; skill→skill links come from declared `related_skills`, memory→skill links from lexical overlap; skills mounted from `skills.external_dirs` are tagged so a configured mount is not counted as a learning milestone.
- Evidence: `agent/learning_graph.py:1-7` — “Scoped to what a user actually learns over time: non-base, learned/profile skills (agent-created or used) plus ``MEMORY.md`` / ``USER.md`` chunks as first-class nodes”; external-mount exclusion at `:85-89`.
- Takeaway for a DSH bundle: an inspectable “what did it learn” view is cheap if memory and skills are already files; the design constraint is that only *learned* artefacts count, not shipped ones.

### 3.8 Session search = SQLite FTS5 (+ trigram) over the message store
Search is not a separate index service: `SessionDB` maintains FTS5 virtual tables plus a trigram variant, with per-table schema ensure, tokenizer-capability fallback, FTS-scoped corruption detection, and an atomic fail-open trigger detach. This is the same store the ACP adapter and `session_search` read.
- Evidence: `hermes_state_fts.py:1-3` — “FTS5 index setup for SessionDB: per-table schema ensure with tokenizer-capability fallback, FTS-scoped corruption detection and the atomic fail-open trigger detach”; tables at `:13` (`_FTS_DDL_TABLES = ("messages_fts", "messages_fts_trigram")`).
- Takeaway for a DSH bundle: FTS over the session store is enough for “search my history”; a bundle should not add a vector DB for this, and the trigram table is what makes substring/prefix queries usable.

### 3.9 Compression: cheap-model middle summary, protected head/tail, prune before summarize
Compaction keeps the head (system + `protect_first_n = 3`) and tail (`protect_last_n = 6`) verbatim and summarizes the middle with a *cheap auxiliary* model. Budgets are scaled: summary target `_SUMMARY_RATIO = 0.20` of input with `_MIN_SUMMARY_TOKENS = 2000` and `_SUMMARY_TOKENS_CEILING = 10_000`; tool-result pruning runs on its own lower trigger without an LLM call (`_PRUNE_MIN_CHARS = 200`); summary-failure cooldowns follow a 60/300/900 s ladder. The whole pass runs on a pooled daemon thread with a **commit fence**: the message list is a private snapshot and state is published only on an admitted commit, so a host timeout discards in-flight work instead of half-applying it.
- Evidence: `agent/context_compressor.py:1` — “a cheap auxiliary model summarizes middle turns while head and tail are protected (iterative summaries, token-budget tail, tool-output pruning first, scaled budgets)”; budgets at `:825-828`, prune floor at `:847`, cooldown ladder at `:800`; commit-fence contract at `agent/conversation_compression.py:3-8` (“state is published ONLY on an admitted :class:`CompressionCommitFence` commit … one pass per session at a time (durable lock) but sessions run concurrently”).
- Takeaway for a DSH bundle: prune-before-summarize, protect-first/last-N, and “publish only on commit” are three independently portable ideas; the commit fence is what makes compaction safe to run off the main turn.

---

## 4. Install / upgrade

### 4.1 Installer is a stage machine, not a linear script
The Windows installer exposes a stage protocol: `-Manifest` prints the stage list as JSON, `-Stage NAME [-Json]` runs exactly one stage, `-NonInteractive` skips input-needing stages, `-ProtocolVersion` reports the protocol version. Stages: `prerequisites → repository → venv → python-deps → config → [products] → setup → gateway → complete`, each tagged `category` (runtime/configuration) and `needs_user_input`. That is what lets a GUI (Tauri `Hermes-Setup`) drive progress, resume, and skip.
- Evidence: `scripts/install.ps1:1-12` — “Stage protocol kept for Hermes-Setup: `-Manifest` print the stage list as JSON; `-Stage NAME [-Json]` run one stage”; stage table at `:880-893`.
- Takeaway for a DSH bundle: if an installer will ever be driven by a UI, expose stages as data (`{name,title,category,needsUserInput}`) and make each stage idempotent/re-runnable; a monolithic `install()` cannot show progress or resume.

### 4.2 Completion marker pins exactly what was installed
The final stage writes `.hermes-bootstrap-complete` next to the checkout: `schemaVersion`, `pinnedCommit`, `pinnedBranch`, `completedAt`. The commit is `rev-parse HEAD` unless the run was pinned, so “what is installed” is answerable without trusting a version string.
- Evidence: `scripts/install.ps1:1552-1564` — marker object with `schemaVersion = 1`, `pinnedCommit`, `pinnedBranch`, `completedAt`, written to `(Join-Path $InstallDir ".hermes-bootstrap-complete")`.
- Takeaway for a DSH bundle: write a small JSON “install receipt” (schema version, commit/version, channel, timestamp) at the end of install; `doctor` and `update` both get a cheap ground truth.

### 4.3 `hermes doctor` = ordered check registry with `--fix`, `--ack`, `--live`
Doctor is a tuple of `(section title, check)` entries — a user-visible ordering — where each check is a `@doctor_check()`-decorated function returning a `Finding` that the runner merges. Checks cover security advisories, MCP server security, Python environment, CA certs, required packages, config file/drift, retired features, auth provider status (refresh-free by design), directory structure, state DB, cron store, checkpoint store, gateway supervision, external tools, API connectivity (parallel probes), tool availability, skills hub, memory provider, plugin lists, profiles. `--fix` lets checks repair, `--ack <id>` persists a security-advisory acknowledgement, `--live` runs opt-in network probes **after** all static checks. Exit code is non-zero iff issues remain.
- Evidence: `hermes_cli/doctor.py:1-4` — “``run_doctor`` walks ``DOCTOR_CHECKS`` in order; each check prints its own rows and returns a ``Finding``. Check bodies live in the ``doctor_*`` siblings.”; ordered tuple at `:114-137`; `--live` placement and exit code at `:190-197`.
- Takeaway for a DSH bundle: make diagnostics a registry of small named checks with a shared `Finding` merge, static-before-network, and a non-zero exit code — the same file then serves CI and `/doctor`.

### 4.4 Update safety: two independent locks with different authorities
`hermes update` takes (a) an **update marker** `<root home>/.hermes-update-in-progress` whose body is `<pid>\n<started_at>\nct:<creation time>` — a marker is “live” only while its pid is alive *and* creation time matches, never by age (the 20-minute ceiling only ages out legacy v1 markers) — and (b) a **checkout kernel lock** `<git common dir>/hermes-update.lock` (flock/msvcrt) held for the whole process tree, so two updates of one checkout from different homes exclude each other and a killed updater's completion child keeps the lock until it exits. The lock lives in the git dir so no `git status`/autostash ever sees it.
- Evidence: `hermes_cli/update_lock.py:3-14` — “An owner is live while its pid is alive and its creation time still matches: never by age”; “a kernel lock (flock / msvcrt) that ``hermes update`` holds for its whole process tree”; `UPDATE_MARKER_MAX_AGE_SECONDS = 20 * 60` at `:44`.
- Takeaway for a DSH bundle: pid-reuse is the classic bug in “is another update running” checks — store a start timestamp/creation time alongside the pid. Separating “advisory marker for other tools/UI” from “authoritative kernel lock” is also worth copying.

### 4.5 Post-pull guard: syntax/import check, then automatic rollback
Immediately after the checkout moves, the updater compiles the critical startup files (`_validate_python_files_syntax`, bytecode directed into a temp dir so the tree stays clean) and *imports* the modules loaded on every startup, because a file can be syntactically perfect and still fail on a removed sibling name. On failure it restores the checkout to `pre_pull_sha` and exits 1 — “a bad admin-merge past CI must not brick the CLI.”
- Evidence: `hermes_cli/update_cmd.py:329-331` — “Compile *relpaths* under *root* without writing bytecode into the tree.”; `:891-895` — “Post-pull syntax guard: roll back to *pre_pull_sha* and ``sys.exit(1)`` when a startup file the pulled tree declares is missing or no longer compiles”.
- Takeaway for a DSH bundle: a post-update smoke gate (parse/bundle + one import) with automatic rollback to the recorded previous SHA converts “broken release” into “failed update”. The previous SHA must be captured *before* the pull.

### 4.6 Update receipts + fleet version matrix
Every update writes a machine-readable JSON receipt recording what the run discovered, did, and skipped (with reasons), into the **root** home's `logs/update_receipts/` (never a sticky profile home), keeping the last 20. After the restart phase it reads every profile's `gateway_state.json`, compares each live gateway's stamped `code_sha` against the updated checkout's HEAD, and prints a version matrix so mixed-version fleets become a loud report. Every receipt entry point is exception-swallowing: a failure inside the receipt must never break an update.
- Evidence: `hermes_cli/update_receipt.py:3-12` — “the updater must *prove* its outcome instead of assuming it” … “compare each live gateway's stamped ``code_sha`` … against the freshly-updated checkout's HEAD”; `_RECEIPT_KEEP = 20` at `:49`.
- Takeaway for a DSH bundle: “prove the outcome” — write a receipt with planned/ran/skipped and a final verification step, and never let receipt-writing throw. This is the cheapest way to kill “update said success but nothing restarted”.

### 4.7 Update self-heals its own debris before doing anything
At the start of an update the code refuses when a Git operation is in progress, then removes `.git/index.lock`, dead fetch refs, shallow locks and aborted-transfer pack temps left by a killed previous run — otherwise every later fetch fails with “reference already exists” until a human intervenes. The sweep is idempotent and skips everything while a git process holds the tree.
- Evidence: `hermes_cli/update_cmd.py:1788-1800` — “Self-heal abandoned .git/*.lock files (a crashed fetch) and aborted-transfer pack temps before anything else touches the checkout”; `release_dead_fetch_locks` / `release_dead_index_lock` calls at `:1796-1800`.
- Takeaway for a DSH bundle: a crashed updater leaves a poisoned lock that blocks every future update; start the updater with “detect and clear *provably dead* leftovers” rather than telling the user to delete a file by hand.

### 4.8 Install/update E2E is a matrix over user journeys, not unit tests
The “Install & Update E2E” workflow expands `{os, install-method, update-method}` against release tags picked at runtime (newest, oldest, a spread between) into one leg per `{combination, tag}`: Linux runs the real `curl | bash` one-liner isolated by a git-URL redirect to a local bare clone; Windows clicks the real `Hermes-Setup.exe` with AutoHotkey and updates via the app with Playwright; macOS mounts the real `.dmg`. Triggers: release builds and manual dispatch only — never on PRs, pushes, or schedule.
- Evidence: `.github/workflows/install-e2e.yml:5-13` — “The support matrix -- every {os, install-method, update-method} combination a user could be on -- lives in scripts/sandbox/generate-e2e-matrix.mjs”; “Matrix: linux  the real curl|bash install one-liner, isolated by a git URL redirect to a local bare clone”; trigger rule at `:35-40` (“never runs on pull requests, pushes to main, or a schedule”, `on: workflow_dispatch`).
- Takeaway for a DSH bundle: test the *user journey* (published artefact → install → update → still runs) from an old released version, not just “installer functions return 0”. Picking start tags at runtime is what stops the matrix rotting.

---

## 5. What is NOT applicable

These depend on Python/desktop/multi-platform assumptions and should not be transplanted into a small TypeScript DSH bundle:

- **Process/thread-level admission and watches** (`turn_facade.py` lease + refresher thread + liveness watchdog; `_StuckCallGate`; `ctx_bound`/`spawn_context_thread`). The problem they solve is “a wedged Python thread cannot be killed”. In Node the analogue is a `Promise.race` + `AbortSignal` timeout; port the *policy* (bounded in-flight, probe on recovery), not the thread machinery.
- **`ContextVar`-based profile identity** (`delegation_context.py`, `memory_provider.py` multiplexing contract). It exists because one process serves many `HERMES_HOME` profiles — a DSH bundle does not own the process; it has one workspace/host.
- **Durable cross-process turn leases and `flock`/`msvcrt` checkout locks** (`update_lock.py`, `turn_facade_lease`). A JS plugin cannot hold a kernel lock over a process tree, and the host already owns process lifetime.
- **`py_compile`-based post-pull guard, venv/`uv`/`pm` environment management, `pip`/`pm lock`, `hermes pm install`, termux/WSL path translation, `.git/*.lock` sweeping.** Bundle install is npm/host-provided; the portable kernel is only “record previous version → smoke test → roll back”.
- **Tauri/Electron desktop updater protocol** (`update_stage.py` status-file handshake with `scripts/desktop-update/posix.sh`, `osascript` status panel, `apps/bootstrap-installer` Rust markers). macOS-only code paths and process-spawning in `ensure_panel` are explicitly non-transferable.
- **Multi-platform gateway adapters** (Telegram/Discord/Slack, ~20 platforms), `gateway/platforms/ADDING_A_PLATFORM.md`, and profile multiplexing in one gateway process.
- **SQLite FTS5/trigram virtual tables** (`hermes_state_fts.py`) — the *idea* (FTS over the session store) transfers, the DDL/tokenizer-fallback/corruption-detach engineering does not; a TS bundle should use the host's search or a tiny in-memory index.
- **Python-specific failure taxonomy entries** (`thinking_signature`, `llama_cpp_grammar_pattern`, `role_alternation` for strict chat templates) and the ~30-member `FailoverReason` enum: keep the 8–12 categories that describe *any* HTTP LLM API and drop provider-SDK archaeology.
- **The curator's `skill_manage` LLM fork** and **compression via an auxiliary LLM call**: both assume a second model route and a background agent. A bundle can keep the deterministic half (inactivity → stale → archive, prune tool results), and leave summarisation to the host.

---

## 6. Sources

All at commit `110afdd60e3098b86950963b06a792e261bd36a4`; blob URLs shown for readability, content fetched via the contents API at that SHA.

- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/README.md
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/AGENTS.md
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/skills/AGENTS.md
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/turn_facade.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/conversation_loop.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/turn_tool_round.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/context_engine.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/context_compressor.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/conversation_compression.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/iteration_budget.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/delegation_provider.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/delegation_registry.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/delegation_context.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/error_classifier.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/fallback_cooldown.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/kanban_turn_recovery.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/memory_manager.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/memory_provider.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/memory_context.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/curator.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/learning_graph.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/acp_adapter/session.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/tools/delegate_tool_config.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/cron/constants.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/hermes_state_fts.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/scripts/install.ps1
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/hermes_cli/doctor.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/hermes_cli/update_cmd.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/hermes_cli/update_lock.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/hermes_cli/update_receipt.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/hermes_cli/update_stage.py
- https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/.github/workflows/install-e2e.yml

## 7. Confidence and gaps

**High confidence** (read directly, line numbers verified): turn façade/admission, tool-round ordering, `ContextEngine` contract and defaults, `IterationBudget`, delegation provider/registry split and child limits, `FailoverReason` taxonomy, cooldown ladder, memory manager gate constants, memory-context fencing/caps, curator defaults, compression budgets, doctor check list, update lock/receipt design, installer stages and completion marker, install-E2E matrix intent.

**Not verified / thinner than it looks:**
- `agent/conversation_loop.py` is 1 967 lines; I read its header, its import block and the phase-helper binding, plus the tool-round sibling. I did **not** trace the retry/fallback branch logic inside the loop, so statements about *ordering* of retries vs. compression come from module docstrings, not from the branch code.
- `agent/error_classifier.py` is 1 741 lines; I read the taxonomy and docstrings, not the per-provider matchers. The claim “priority-ordered pipeline” is from its docstring; I did not read the matcher table.
- `agent/memory_manager.py` (962 lines) and `agent/curator.py` (1 218 lines) were sampled (headers, constants, API list); individual hook implementations (e.g. exact `sync_all` timing semantics) were not read.
- `scripts/install.ps1` is 1 734 lines; I read the parameter block, the stage table and `Stage-Complete`, not the individual stage bodies — so per-stage idempotency is inferred from the protocol, not proven per stage.
- `hermes_cli/update_cmd.py` is 1 954 lines and delegates to ~15 `update_cmd_*` siblings (fleet, windows, zip, drain…); I read the entry point, the syntax guard and the debris sweep. The full pre-update backup/snapshot→rollback path (`_begin_update_receipt_and_plan` and the `update_cmd_fleet*` modules) was **not** followed.
- No test run, no install executed, no CI result inspected — everything here is static reading of one commit. Thresholds could change on `main` after `110afdd6`.
- I did not read `hermes_cli/doctor_*.py` check bodies, so the doctor section describes the *registry shape*, not what individual checks assert.
- Not examined at all: `gateway/` (20 platform adapters), `plugins/` plugin API, `ui-tui/`, `apps/desktop/`, `web/`, `hermes_state_*.py` beyond the FTS module, `tools/skill_usage.py`, and the actual `delegate_task` tool schema (`tools/delegate_tool.py`, 100s of lines across 12 siblings).
