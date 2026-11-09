# Benchmarking dsh-superagent against hermes-agent

> This is by an automated agent, not a human.

- **hermes-agent:** [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) at commit
  [`110afdd6`](https://github.com/NousResearch/hermes-agent/tree/110afdd60e3098b86950963b06a792e261bd36a4) (2026-11-08).
  Read statically through the GitHub API; findings and line references are in
  [hermes-notes.md](hermes-notes.md).
- **dsh-superagent:** `TYEclipse/dsh-superagent-prototype`, baseline `205a9a8` (the fork of
  `deepseek-ai/dsh-superagent-prototype` that targets DSH `0.2.2-rc.1`). The baseline map is
  [superagent-baseline.md](superagent-baseline.md).
- **Method:** both sides were read from source at pinned commits. No hermes-agent code runs in this environment;
  statements about hermes-agent are design evidence, not measurements. dsh-superagent changes were verified by
  `pnpm check` and by a real `link:` install into a throwaway DSH profile that booted its panel
  ([install-verification.md](install-verification.md)).

The two projects are not the same product: hermes-agent is a large Python agent platform (roughly 24k files:
CLI/TUI, desktop, gateway, 20+ chat adapters, providers, sandboxed terminals), while dsh-superagent is a small
TypeScript bundle that adds proactive, ticket-based work for one repository to a DeepSeek Harness profile. The
benchmark therefore compares **mechanisms that transfer to a bundle**, not feature counts.

## 1. Comparison by dimension

### 1.1 Architecture

| | hermes-agent | dsh-superagent (baseline) | Assessment |
| --- | --- | --- | --- |
| Module seams | Facade + topic siblings (`<stem>.py` keeps the entry points, `<stem>_<topic>.py` owns one topic), with size/complexity ratchets; only the facade may be imported across topics (`AGENTS.md:93-107`) | Small, explicit modules with documented dependency rules: `src/core` has no I/O, `src/sources` imports no `src/app`, the panel imports only types (`docs/007-architecture.md:255-274`) | Both keep a narrow core. dsh-superagent is already small, but its rules live only in prose. |
| Prompt-cache invariant | "Prompt caching is sacred"; only compression may mutate past context; new core tools are rare, capability arrives at the edges (`AGENTS.md:18-26,56-59`) | The system prompt is rebuilt per model request from versioned parts; the Policy section is last so a Policy change leaves the rest unchanged (`docs/004-prompts.md:44-61`, `src/app/prompts.ts:98-118`) | Same idea, different mechanism: versioned prompt parts and a tail section. |
| Durable sessions | One SQLite `SessionDB` shared by CLI, ACP adapter and `session_search`; resume reloads from the store (`acp_adapter/session.py:1-5`) | SQLite domain store plus DSH `SessionPersistence`; Sessions resume by id, Tickets keep their worker Session (`docs/003-execution.md:144-152`) | Equivalent in intent; the host owns transcript storage. |
| Typed verdicts / phases | Tool round is a module with a 3-value verdict (`continue | break | return`) and persist-before-execute (`agent/turn_tool_round.py:29-34,56-59`) | The Engine is a set of synchronous commands in one transaction, with role `Pick`s and past-tense adapter facts (`docs/007-architecture.md:48-72`) | Both make the transition set small; no change needed. |

**Adopted change:** none in production code. The benchmark confirmed the existing module boundaries; the
PDCA work added a Windows-portable test suite and, in a later round, `tests/architecture.spec.ts` to enforce the
documented import rules (relative imports resolve; `src/core` imports only itself and `node:` built-ins; Sources
never import the application; the panel imports only the plain values of `src/app/api.ts`).

### 1.2 Orchestration

| | hermes-agent | dsh-superagent (baseline) | Assessment |
| --- | --- | --- | --- |
| Durable work | Provider calls and retries sit in the turn loop; kanban work retries in place only when ownership (a live claim lease) is proven (`agent/kanban_turn_recovery.py:10-29`) | A durable effect queue with per-kind concurrency limits, exponential backoff and health (`docs/003-execution.md:153-181`, `src/app/effects.ts`) | dsh-superagent already has the durable queue hermes hand-rolls per subsystem. |
| Worker budget | Per-agent `IterationBudget` with `refund()`; parent 500 / child 50 (`agent/iteration_budget.py:3-5,26-27`) | `WorkerSlots` bounds concurrent Executors (`maxWorkers`), background work is bounded to 30 minutes per turn (`docs/003-execution.md:31-47,55-61`) | Different units (model iterations vs. worker slots); no gap that a bundle change fixes. |
| Failure taxonomy | A typed `FailoverReason` enum distinguishes rate limit, upstream rate limit, billing, context overflow, policy block, etc.; recovery hints are consumed instead of re-matching strings (`agent/error_classifier.py:1-5,40-44`) | One `transient()` regex over HTTP 408/429/5xx, network and overloaded wording; three retries with backoff (`src/executor/dsh.ts:29-51`) | A real difference. Adopting a full taxonomy needs provider-specific routes the bundle does not own; recorded as not adopted (see §3). |
| Concurrency/depth | Child limits: 10 concurrent, depth 1, approvals deny-by-default (`tools/delegate_tool_config.py:19-42`) | Subagents run under DSH's `standard` preset, keep the worker's tool limits, stop at handoff (`docs/003-execution.md:47`) | Host-owned here; no change needed. |

**Adopted change:** none in this iteration. The queue, retry and slot machinery already match the transferable
part of hermes-agent; the classifier is the one gap, and its provider-specific half does not belong in a bundle.

**Adopted change — typed failure classification (second round).** `src/executor/failure.ts` classifies one failure
as `network`, `rate-limit`, `overloaded`, `server`, `auth`, `budget`, `context` or `unknown`, with `retryable` and
an optional `retry-after` hint. Network, rate-limit, overload and 5xx failures retry with backoff; the turn-retry
delay uses the provider hint when one is present, capped at five minutes. Authentication, billing and context-length
failures are not retried, so the Ticket reaches a person instead of burning its attempts. `transient()` remains the
compatibility entry point and delegates to the classifier.

### 1.3 Memory

| | hermes-agent | dsh-superagent (baseline) | Assessment |
| --- | --- | --- | --- |
| Durable memory | `MemoryManager` fans four hooks (`promptBlock`, `prefetch`, `syncTurn`, `tools`) to exactly one external provider plus a builtin store (`agent/memory_manager.py:1-4`) | No long-term memory: SQLite aggregates, KV cursors, prompt revisions and DSH transcripts only (`superagent-baseline.md` §3) | The clearest gap. |
| Recall safety | Recall is fenced in `<memory-context>`, declared "not new user input", scrubbed on egress and capped at 6,000 chars (`agent/memory_context.py:1-4`, `agent/context_engine.py:20-22`) | — | Portable idea: fence + preamble + a hard cap. |
| Learning lifecycle | Curator archives (never deletes) skills after inactivity; state in `skills/.curator_state` (`agent/curator.py:1-6,31-35`) | — | Too much for a bundle; recorded as not adopted. |
| Session search | SQLite FTS5/trigram over the message store (`hermes_state_fts.py:1-3`) | Store search over Triggers/Tickets/Threads (`docs/006-deployment.md:163-172`) | Host search covers cross-session recall; no change. |

**Adopted change — Project memory.** Each finished Ticket is recorded once (`src/app/memory.ts`) with its title,
outcome and latest Report summary; the newest 100 notes are kept, each summary is whitespace-collapsed and bounded
to 400 characters, and the rendered section is capped at 3,000 characters. The worker prompt gains a generated
`runtime/memory` section only while a note exists; the main Session never receives it. The preamble marks the notes
as facts from earlier work, not instructions — the portable half of hermes-agent's fence/sanitize discipline without
its LLM summarizer or background provider. In a later round the notes gained the curator's reversible half:
`Memory.curate` moves notes older than 90 days to an archive at startup, so the prompt stays recent while history is
never deleted.

### 1.4 Install / upgrade

| | hermes-agent | dsh-superagent (baseline) | Assessment |
| --- | --- | --- | --- |
| Install model | Installer is a JSON stage machine (`-Manifest`/`-Stage`) with a completion marker pinning commit/branch/time (`scripts/install.ps1:1-12,1552-1564`) | `link:` install into a dedicated profile plus `pnpm build`; documented manually (`docs/006-deployment.md:71-99`) | Bundle install is the host's plugin manager; a marker is less useful than proving the boot. |
| Doctor | Ordered registry of checks with `--fix`, `--ack`, `--live`, non-zero exit on findings (`hermes_cli/doctor.py:1-4,114-137`) | `scripts/dsh-superagent status` reads a running service only (`docs/006-deployment.md:100-131`); no pre-flight or repeatable install test | The useful gap: prove the install from outside. |
| Upgrade safety | Update marker (pid + creation time), kernel lock, post-pull import check with rollback to the previous SHA, receipts (`hermes_cli/update_lock.py:3-14`, `update_cmd.py:891-895`, `update_receipt.py:3-12`) | git pull + rebuild + restart; database migration is one-way and needs a backup (`docs/006-deployment.md:233-242`) | The bundle cannot own the host process; the transferable part is a receipt and a post-change smoke gate. |
| E2E | Install/update matrix over real artefacts, old→new versions (`install-e2e.yml:5-13`) | Manual link-profile run recorded in `FORK-NOTES.md:90-95` | Adopted a repeatable version of exactly this. |

**Adopted change — `scripts/verify-install.mjs`.** One command creates a throwaway `$DSH_HOME`, builds a profile
from the shipped Web template, installs the checkout with `link:`, boots it on a free loopback port, reads the
management API as the panel does (state, settings, prompts, the panel shell route, the database), and writes a
machine-readable receipt. Exit code is non-zero on any failed check, so a PDCA round or CI can gate on it.
`pnpm verify:install -- --dsh <path>` runs it.

**Adopted change — `scripts/doctor.mjs` (second round).** The pre-flight counterpart to the verification run, in
the shape of `hermes doctor`: ordered named checks for Node.js and DSH engine ranges, the build artifacts, the git
checkout, a named profile's `link:`, its `stateDir` and state-dir writability, and a last optional panel probe.
`--json` prints one report, `--fix` creates a missing state directory, and a non-zero exit means an issue remains.

## 2. Improvement checklist

Every item below is implemented and verified in this branch.

| # | Dimension | Item | Acceptance | Status |
| --- | --- | --- | --- | --- |
| 1 | Install / upgrade | Make `pnpm check` pass on native Windows so the documented gate is meaningful here | `pnpm check` exits 0; POSIX-only suites skip with their reason; Windows path/symlink/PATH assumptions fixed | Done in `61d27d1` |
| 2 | Memory | Project memory from finished Tickets, injected into the worker prompt | `tests/memory.spec.ts`; note cap, dedupe, character budgets; worker-only prompt section | Done in `086ec65` |
| 3 | Install / upgrade | Repeatable link-install verification against a throwaway profile | `scripts/verify-install.mjs`; 13 checks including panel API 200 and a written receipt | Done in `086ec65` |
| 4 | Orchestration | Typed failure classification instead of one regex: network, rate-limit, overload and server failures retry (honouring `retry-after`); auth, billing and context-length failures reach a person | `src/executor/failure.ts` + `tests/failure.spec.ts`; `transient()` delegates to it; the turn-retry delay uses the provider hint | Done in this PR |
| 5 | Architecture | Enforce the documented import rules as tests instead of prose only | `tests/architecture.spec.ts`: relative imports resolve, `src/core` stays inside itself, Sources never import the app, the panel imports only `src/app/api.ts` values | Done in this PR |
| 6 | Install / upgrade | Pre-flight `doctor` with ordered checks, JSON output and exit codes | `scripts/doctor.mjs` + `tests/doctor.spec.ts`: node/dsh engine ranges, build artifacts, git state, profile link and `stateDir`, state writability, and a last panel probe | Done in this PR |
| 7 | Memory | Age notes older than 90 days into an archive instead of deleting them, as hermes-agent's curator archives rather than removes learned material | `Memory.curate` + `tests/memory.spec.ts`: old notes leave the prompt, recent ones stay, running it again changes nothing | Done in this PR |

The list is cleared. Rounds that produced no production change (orchestration, architecture) are recorded in §1
with the evidence for why no transferable gap remained.

## 3. Observed differences not adopted

- **Typed failure taxonomy** (`FailoverReason`): most members are provider-SDK archaeology (`thinking_signature`,
  grammar patterns, role alternation). A DSH bundle sees the provider through the host; it cannot route or rotate
  credentials. The generic subset (rate limit vs. billing vs. context overflow) would still help, but it changes
  retry behaviour and belongs in its own change with its own benchmark.
- **LLM summarization and an external memory provider**: both assume a second model route and a background agent.
  DSH owns compaction; a bundle that adds a competing summarizer would double-summarize sessions.
- **Curator / learning graph / skill self-improvement**: skills here are team-authored and versioned; automatic
  archive/consolidation needs a usage store the bundle does not have.
- **Installer stage machine, desktop updater, fleet receipts**: bundle installation belongs to the DSH plugin
  manager; the bundle cannot own the host process or the desktop updater.
- **FTS5 session search**: the host persists transcripts; dsh-superagent's own search already covers Triggers,
  Tickets and Threads.

## 4. PDCA record

| Round | Plan | Do | Check | Act |
| --- | --- | --- | --- | --- |
| 0 | Establish the baseline | Read both codebases at pinned commits; capture `pnpm check` and the panel baseline | 43 tests failed on Windows (all POSIX-only or Windows-assumption failures); manual `link:` boot answered `GET /orchestrator/api/state` 200 | Wrote the baseline map and the hermes notes |
| 1 | Make the documented gate honest on this host | Scope the POSIX-only suites to POSIX; make doc/path/symlink/fixture tests platform-aware | `pnpm check` exit 0 (1,156 passed, 41 POSIX-only skipped); the existing link profile still answered 200 | Committed `61d27d1` |
| 2 | Close the memory gap the benchmark found | Add `src/app/memory.ts`, the `runtime/memory` prompt part, the runtime hook and tests | `pnpm check` exit 0; `verify-install.mjs` receipt `ok: true` (13/13 checks, panel API 200) | Committed `086ec65` |
| 3 | Prove the install from outside and record it | Add `scripts/verify-install.mjs` and its documentation; run it for the final revision | Receipt with commit, DSH version, every check and the panel answers; see [install-verification.md](install-verification.md) | Final commit and PR |
| 4 | Close the orchestration and architecture gaps left in §1 | Add `src/executor/failure.ts` and wire it into `DshExecutor`; add `tests/architecture.spec.ts` | `tests/failure.spec.ts` and `tests/architecture.spec.ts` pass; `pnpm check` exits 0; `verify-install.mjs` passes again | This PR |
| 5 | Close the install/upgrade diagnostics gap | Add `scripts/doctor.mjs` with the ordered checks hermes-agent's `hermes doctor` suggests, `--json`, `--fix` and non-zero exit | `tests/doctor.spec.ts` passes; `pnpm check` exits 0; `verify-install.mjs` passes again | This PR |
| 6 | Keep the memory prompt recent without deleting history | Add `Memory.curate`: notes older than 90 days move to an archive the prompt never reads | `tests/memory.spec.ts` covers moving old notes, keeping recent ones, and idempotence; `pnpm check` exits 0; `verify-install.mjs` passes again | This PR |

## 5. Sources

- hermes-agent at `110afdd6`: [README](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/README.md),
  [AGENTS.md](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/AGENTS.md),
  [`agent/memory_manager.py`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/memory_manager.py),
  [`agent/memory_context.py`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/memory_context.py),
  [`agent/error_classifier.py`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/error_classifier.py),
  [`agent/iteration_budget.py`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/iteration_budget.py),
  [`agent/curator.py`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/agent/curator.py),
  [`hermes_cli/doctor.py`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/hermes_cli/doctor.py),
  [`hermes_cli/update_lock.py`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/hermes_cli/update_lock.py),
  [`hermes_cli/update_receipt.py`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/hermes_cli/update_receipt.py),
  [`scripts/install.ps1`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/scripts/install.ps1),
  [`install-e2e.yml`](https://github.com/NousResearch/hermes-agent/blob/110afdd60e3098b86950963b06a792e261bd36a4/.github/workflows/install-e2e.yml).
  Exact line references and excerpts: [hermes-notes.md](hermes-notes.md).
- dsh-superagent: this repository at the merge base of this branch; evidence in
  [superagent-baseline.md](superagent-baseline.md), [docs/004-prompts.md](../004-prompts.md),
  [docs/007-architecture.md](../007-architecture.md), and the test files named above.

## 6. Limitations

- hermes-agent was read, not executed: no performance, cost or reliability comparison is claimed.
- The hermes-agent notes sample large files (the 1,967-line conversation loop and the 1,741-line classifier were
  read at their headers and taxonomy, not branch by branch); see `hermes-notes.md` §7.
- The install verification proves the bundle loads and its panel answers on one host (Windows 11, Node 24,
  DSH `0.2.2-rc.1`). It does not exercise a real GitHub or Feishu account, and it does not prove an upgrade from
  an older database schema.
- On native Windows, 41 POSIX-only tests are skipped rather than ported; the worker shims and the Python + tmux
  service script remain POSIX-only, as `FORK-NOTES.md` states.

## 7. Coverage map: "all of hermes" versus what a DSH bundle owns

The user asked for all of hermes-agent's capabilities. hermes-agent is a standalone agent platform; this
repository is a bundle that adds one workflow to a DeepSeek Harness profile. Many hermes capabilities are
already the **host's** job here (DSH), and duplicating them inside the bundle would fight the host. The map below
says, for each area, who owns it and what this benchmark did.

| Capability area | hermes-agent | dsh-superagent today | Ownership decision |
| --- | --- | --- | --- |
| Durable memory / recall | MemoryManager + external provider + fenced recall + FTS5 | Project memory notes (this change) + host transcripts | **Adopted** the bundle-sized half; host owns session recall |
| Skills / self-improvement | Agent-created skills, curator archive, learning graph | Team-authored, versioned skills; prompt overrides | Host/team-owned; auto-creation needs a usage store and a second model route — not adopted |
| Subagents / delegation | `delegate_task` with provider routing, depth/concurrency caps | DSH subagents inside each worker, worker tool limits | **Host-provided**; no bundle code needed |
| Scheduled work | Cron with claim TTLs | DSH automations + the pass scheduler | **Host-provided** |
| Chat platforms | Telegram/Discord/Slack/… 20 adapters | GitHub + Feishu Sources | GitHub/Feishu ship; a new Source is a documented extension (`docs/008-cookbook.md`) |
| Providers / model routing | Provider adapters, fallback walks, cooldowns | DSH model selection + per-role models | **Host-provided** |
| Sandboxes / terminals | Local, Docker, SSH, Modal, Daytona, Vercel | The host's execution environment | **Host-provided** |
| Context compression | Auxiliary-LLM compressor with commit fence | DSH compaction | **Host-provided**; a bundle compressor would double-summarize |
| Failure taxonomy | ~30-member `FailoverReason` + recovery hints | One `transient()` matcher + retries | Transferable subset recorded as future work; provider archaeology is not |
| Install / doctor / update | Stage installer, doctor registry, update locks/receipts | `link:` install docs, `status`, and now `verify-install.mjs` | **Adopted** verification and receipts; host owns plugin install/update |
| Desktop / Tauri updater | Electron/Tauri handshake | Not applicable | Out of scope for a bundle |
| Messaging gateway process | One gateway serving many profiles | One DSH profile | Out of scope |

So "learn all of hermes" in practice means: keep adopting the parts a bundle can own (memory, verification,
failure handling that does not depend on host internals), and let the host own the platform parts it already
implements better for this environment. Claiming feature-for-feature parity by re-implementing them in the bundle
would duplicate the host and make upgrades unsafe.

