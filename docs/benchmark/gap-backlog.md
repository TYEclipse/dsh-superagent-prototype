# Gap backlog — hermes-agent → dsh-superagent

> This is by an automated agent, not a human.

This is the durable queue for the [gap discovery and fix loop](evolution-loop.md). It is the only
source of truth for what the loop works on; a chat message, a PR comment or a finder's private
note is not a queue entry. The design, roles, gates and stop conditions are in
[evolution-loop.md](evolution-loop.md).

- **Reference:** `NousResearch/hermes-agent`, pinned at the commit named in each item. Round 1:
  [`e9b858799366f5ec386f600419c93d67d701ba32`](https://github.com/NousResearch/hermes-agent/tree/e9b858799366f5ec386f600419c93d67d701ba32)
  (2026-11-09).
- **Local baseline:** `TYEclipse/dsh-superagent-prototype` `main` at the start of the round. Round 1:
  `1163f59`.
- **Status machine:** `proposed` → `selected` → `fixing` → `verify` → `review` → `fixed`; or
  `blocked` (needs a person's decision or a credential) / `dropped` (not adopted, with a reason).
- **Writer:** the round Lead is the only writer. Finders and fixers never edit this file.
- A `dropped` item stays here with its reason; it is never deleted. A fingerprint prevents the
  same gap from being filed again.

## Queue at a glance

| ID | Priority | Dimension | Gap | Status | PR |
| --- | --- | --- | --- | --- | --- |
| GAP-01 | P0 | Architecture (security boundary) | Redact credentials from subprocess output before it becomes Ticket state | fixing (round 1) | — |
| GAP-02 | P1 | Install / upgrade | `doctor` must prove the built `lib/` matches the checkout | fixing (round 1) | — |
| GAP-03 | P1 | Orchestration | Classify and bound prepare-command failures | proposed | — |
| GAP-04 | P2 | Memory / state | Bounded, reversible retention for domain records | blocked (needs a policy decision) | — |

## Items

### GAP-01 — Redact credentials from subprocess output before it becomes Ticket state

- **Status:** fixing (round 1)
- **Fingerprint:** `redact-subprocess-output`
- **Dimension:** architecture (the boundary between `src/infra` I/O and `src/core` state)
- **Reference:** `agent/redact.py:1474-1479` (`redact_sensitive_text`), `:1780-1783`
  (`redact_for_egress`, fails closed), `:1795-1799` (`redact_terminal_output`);
  `agent/redact_headers.py:1-6,13,166-204`; `hermes_cli/debug_redaction.py`;
  `gateway/platforms/base_log_safety.py`.
- **Local:** `src/infra/commands.ts:10-13` deliberately does not echo argv, but `:17-29`
  (`commandError`) returns raw `stderr` as the message; `src/infra/environment.ts:134` does the
  same for the worker spawn. The text then becomes a `PrepareFailed`
  (`src/executor/dsh.ts:247-255`), a Ticket Report summary and a relay to the main Session
  (`dsh.ts:414-418`), a worker continuation (`dsh.ts:552-554`), a health detail
  (`effects.ts:149`, `passes.ts:45`, `settings.ts:248`) and an HTTP 500 body (`http.ts:90`).
  There is no redaction anywhere in `src/`.
- **Why it transfers:** the host never sees the CLI's stderr; the bundle persists it. One pure
  redactor at the subprocess seam covers every listed surface.
- **Acceptance:** `src/infra/redact.ts` exports `redactSecrets(text)`; masks GitHub tokens
  (`ghp_`, `gho_`, `ghs_`, `github_pat_`), `Authorization: Bearer …`, `x-api-key:`/`api-key:`,
  `Cookie:`/`Set-Cookie:`, URL userinfo and `token=`/`access_token=` values, `AKIA…`, and PEM
  private-key blocks; keeps a short visible prefix/suffix; idempotent; leaves prose such as
  "token expired" and "the cookie: …" alone. Apply it in `commandError` (both stderr branches),
  `src/infra/environment.ts:134`, and the `PrepareFailed` wrap; health and HTTP inherit it.
  `docs/007-architecture.md` states the rule.
- **Verify:** `tests/redact.spec.ts` (table, idempotence, false positives) plus a
  `tests/commands.spec.ts` case where stderr contains a token and the `CliError.message` does
  not; `pnpm vitest run tests/redact.spec.ts tests/commands.spec.ts`; `pnpm check`.
  Expected diff: ~120 source + ~150 test lines. Risk: regex false positives; keep masks visible.
  No schema, settings or prompt change.

### GAP-02 — `doctor` must prove the built `lib/` matches the checkout

- **Status:** fixing (round 1)
- **Fingerprint:** `doctor-build-current`
- **Dimension:** install / upgrade
- **Reference:** `scripts/verify-bootstrap-version-stamp.py:1-8,9-18` (the stamp "must tell the
  truth about the bytes actually checked out"; exit 1 with one `FAIL:` line per check);
  `scripts/write_install_stamp.py:1-9`; prior evidence `hermes_cli/update_receipt.py:3-12`.
- **Local:** `scripts/doctor.mjs:102-104` only checks that `lib/index.js` and `lib/client.js`
  exist; `:106-112` prints git state without comparing it to the build.
  `scripts/verify-install.mjs:29-30,47,63-66` writes a commit-bearing receipt that nothing reads
  back. After `git pull` + `pnpm build` is the documented upgrade path
  (`docs/006-deployment.md:233-242`); a forgotten build is silent.
- **Why it transfers:** this is the bundle-shaped half of the stamp: compare the artefact with the
  source it claims to be and fail closed. It reuses the receipt the repo already writes.
- **Acceptance:** add an ordered `build` check after `bundle`: if any of `src/`, `prompts/`,
  `skills/`, `tsdown.config.ts`, `cordis.patch.yml` is newer than the oldest of
  `lib/{index,client,github-watch,feishu-watch}.js`, fail naming the newest source file, its
  mtime, the oldest artefact and `run pnpm build`. A source tree absent (tarball) is a
  non-failing skip, like the git check. If `.artifacts/install-verification.json` exists and its
  `commit` differs from `git rev-parse HEAD`, add a warning naming both SHAs (no failure).
  `--json` carries the check; exit code stays non-zero iff a check failed.
- **Verify:** `tests/doctor.spec.ts` cases: stale `lib/` → fail with `pnpm build` in the detail;
  fresh → pass; no source tree → skip; receipt commit mismatch → warning. Run
  `pnpm vitest run tests/doctor.spec.ts`. Expected diff: ~40 source + ~50 test lines. Risk: mtime
  is a heuristic; word the failure as "the build is older than the source".

### GAP-03 — Classify and bound prepare-command failures

- **Status:** proposed
- **Fingerprint:** `prepare-typed-retry`
- **Dimension:** orchestration
- **Reference:** `agent/kanban_turn_recovery.py:10-14` (retry in place, bounded, non-zero on
  exhaustion), `:16-19` (retry authority is positive and typed); the classifier already adopted
  as prior item 4.
- **Local:** `src/executor/dsh.ts:238-259` runs the prepare command once; `:241` documents "not
  retried automatically"; `:544-550` already consults the classifier for turns.
  `docs/003-execution.md:53` says any failed prepare fails the Ticket. One transient
  `git fetch`/`gh` failure sends the Ticket to a person.
- **Why it transfers:** prepare is the most failure-prone subprocess and the only seam without
  classification; the classifier and backoff already exist locally.
- **Acceptance:** classify with `classifyFailure`; retry `network`/`rate-limit`/`overloaded`/
  `server` up to `PREPARE_TRIES = 2` with the existing backoff, keeping the Ticket working and
  the attempts visible; fail `auth`/`budget`/`context`/`unknown` at once with the kind in the
  summary; never retry an abort; keep the empty-directory cleanup between attempts.
- **Verify:** new `tests/executor-prepare.spec.ts` with a scripted `ctx.subprocess`: transient
  twice then success → three calls; 401 → one call and failure kind `auth`; abort → one call.
  `pnpm check`. Expected diff: ~60 source + ~120 test lines. Risk: a non-idempotent prepare
  command; cap at two and retry only after the empty-directory cleanup.
- **Note:** this extends prior item 4; if item 4 is read as covering prepare, drop it with a
  reason. Current docs still state the unclassified policy, so keep it.

### GAP-04 — Bounded, reversible retention for domain records

- **Status:** blocked (needs a policy decision)
- **Fingerprint:** `domain-retention`
- **Dimension:** memory / state
- **Reference:** `agent/curator.py:1-7` — never delete, only archive (recoverable); pinned
  artefacts bypass transitions.
- **Local:** `docs/007-architecture.md:490` says trigger/disposition/decision rows, ended
  Tickets/Threads, outbox receipts and every settings/prompt revision grow without bound; no
  retention code exists.
- **Why it transfers:** the rule (reversible maximum action, a no-touch list) is bundle-sized; the
  scheduler is not.
- **Blocked on:** the product decision — retention window, what may move, archive as a table
  (schema v12 + migration) or a file, what the panel reports. Draft acceptance: a `Retention`
  pass moves (never deletes) rows older than `retentionDays` (default 180) into an archive;
  nothing referenced by an open Ticket, queued trigger, pending effect or live outbox receipt is
  touched; idempotent; panel counts; transactional v12 migration. Verify with
  `tests/retention.spec.ts` and a v11→v12 `tests/migration.spec.ts` case. Expected ~200 lines +
  migration + tests.

## Round log

| Round | Date | Reference | Found | Fixed | Gates | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (bootstrap) | 2026-11-09 | `e9b8587` | 4 ranked + 8 rejected | GAP-01, GAP-02 (this PR) | `pnpm check`; `verify:install` — _pending_ | This Ticket validates the protocol once; future rounds are driven by the host automation. |

## Not adopted

These were considered in round 1 and rejected with a reason. They stay here so a later finder
does not re-propose them without new evidence.

| Candidate (hermes evidence) | Why not |
| --- | --- |
| CJK table re-alignment `agent/markdown_tables.py:1-11` (+57 this window) | Fixes terminal rendering with `wcwidth`; Feishu (`--markdown`) and GitHub render their own tables. No local surface to fix. |
| Per-route rejection verdicts `agent/route_verdicts.py:1-11` | The verdict is about a provider endpoint; DSH owns provider routing and the bundle sees it through `src/app/role-models.ts:8-12`. |
| Adaptive gateway start deadline `hermes_cli/gateway_runtime_progress.py:1-15` | Host owns process startup; a plugin cannot observe or extend DSH's boot. |
| Skills index / freshness `scripts/build_skills_index.py` + workflow | Two shipped skills, covered by `tests/model-surface.spec.ts`; a generated index is ceremony at this size. |
| Repository guards `repo-guards.yml` + Windows/case/boundary lints | No `.github/` and not verifiable from here; the honest local form is one more `tests/architecture.spec.ts` assertion, overlapping done item 5. |
| `agent/redact_headers.py` verbatim (262 lines) | Over-engineered for `execFile`+JSON I/O; GAP-01 ports only the credential shapes. |
| `hermes_cli/debug_redaction.py` | Same mechanism as GAP-01; a separate debug surface has no consumer in a bundle. |
| `cron/scheduler_delivery.py`, `hermes_cli/kanban_db_notify.py` | Scheduled delivery/kanban are host-owned. |
