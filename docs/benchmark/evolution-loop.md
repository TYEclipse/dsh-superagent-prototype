# Continuous gap discovery and fix loop

> This is by an automated agent, not a human.

This document defines the loop that keeps closing the gap between **dsh-superagent** and
**hermes-agent** without a person re-prompting each round. It records the analysis requested on
2026-11-09, the refined design, and how the loop is deployed. The durable queue lives in
[gap-backlog.md](gap-backlog.md); the comparison evidence lives in
[benchmark-report.md](benchmark-report.md), [hermes-notes.md](hermes-notes.md) and
[superagent-baseline.md](superagent-baseline.md).

## 1. The proposed mechanism

The user proposed:

> One person continuously finds what the current super fat fish lacks compared with Hermes;
> another batch of people fixes what the first person raises; the cycle repeats.

The context matters. A `/goal` run had completed one PDCA round and stopped; the proposed
remedy was a six-hour automation that re-sends `/goal`. The user rejected the re-sent prompt as
the mechanism, not the idea of a schedule: discovery and repair should be separate roles that
feed each other.

The latent needs behind the request are:

| Need | What "good" looks like |
| --- | --- |
| Autonomy | Rounds happen without a person re-prompting. |
| Quality | Every change is evidence-based, tested, install-verified and reversible. |
| Progress | A person can see what was found, fixed, rejected and why. |
| Control | The loop can be paused; scope and cost are bounded; risky changes wait. |
| Focus | Effort goes to mechanisms a DSH bundle can own, not feature-count parity with a standalone platform. |

## 2. Is the proposed mechanism reasonable?

**Verdict: the direction is sound; the literal form is not yet a reliable mechanism.** Separating
discovery from repair is the right instinct, and it matches how the strongest published agent
loops are organized. But an immortal finder and an undefined "batch of fixers" leave the loop
without durable state, independent verification, concurrency control, or a stopping rule. The
design below keeps the user's two roles and adds the parts that make them reliable.

### 2.1 What is sound

- **Separation of duties.** A finder that does not fix, and fixers that do not grade their own
  work, avoid the conflict of interest that makes self-review weak. Anthropic's production
  research system uses a lead agent that plans and delegates to subagents, then evaluates and
  synthesizes their output rather than doing the research itself
  ([Anthropic, 2025](https://www.anthropic.com/engineering/multi-agent-research-system)).
- **A continuing improvement cycle.** PDCA/kaizen and continuous delivery both assume small,
  recurring changes with feedback, not one large burst
  ([DORA](https://dora.dev/guides/dora-metrics-four-keys/)).
- **Parallel repair.** Once the queue is well defined, independent fixers can work in parallel on
  disjoint scopes, which is the one place multi-agent parallelism pays for its token cost
  ([Anthropic, 2025](https://www.anthropic.com/engineering/multi-agent-research-system)).
- **A scheduler.** A loop needs an outer driver. DeepSeek Harness already documents host
  automations as the right place for scheduled work, outside the agent service
  ([006 Deployment](../006-deployment.md#L133-L141)).

### 2.2 Where the literal proposal is insufficient

| As stated | Why it fails | Correction |
| --- | --- | --- |
| "One person continuously finds" | A single immortal session accumulates context, drifts, and pays for tokens on every turn. Long loop runs drift and develop tunnel vision; periodic fresh starts are a known remedy ([Cursor](https://cursor.com/blog/scaling-agents), [Osmani](https://addyosmani.com/blog/self-improving-agents)). | A *fresh, bounded discovery run* reads a pinned reference and writes to a durable queue. "Continuous" is the schedule plus the queue, not an always-open chat. |
| "Another batch fixes what the first raises" | If the findings live only in chat, fixers duplicate, lose, or reinterpret them; there is no shared definition of done. | The queue stores one item per gap with evidence, acceptance criteria, verification command and status. One writer (the round Lead) owns it. |
| The finder's list is trusted | A model grading its own work or its own plan is a weak signal; LLM judges measurably prefer their own style, and self-correction without external feedback is unreliable ([Zheng et al.](https://arxiv.org/abs/2306.05685), [Huang et al.](https://arxiv.org/abs/2310.01798)). | An independent verifier reproduces the acceptance, plus automated checks. "Tests pass" requires the command output, not a claim. |
| "The cycle repeats" with no stop rule | Endless rounds produce low-value gaps and unbounded cost. | A quality bar, a queue buffer, at most two fixes per round, dry-round detection, and an explicit pause. |
| Fixers working at the same time | Concurrent agents reading and writing shared state cause stale reads, lost updates and inconsistent outcomes; concurrency control should be a first-class concern ([Position paper](https://arxiv.org/html/2608.18092)). | One round at a time; a single backlog writer; fixers on disjoint branches/worktrees; the Lead integrates. |
| Fix, then push | Unreviewed changes on the main line are not reversible and give the person no decision point. | PR delivery, small diffs, automated gates, and a strict auto-merge guardrail; larger or risky changes wait for a person. |
| "Compare with Hermes" without a filter | hermes-agent is a standalone platform; re-implementing host-owned features would fight DSH and make upgrades unsafe. | Apply the ownership map from [benchmark-report.md](benchmark-report.md) §7 and require a transferability argument per item. |
| A single scheduled prompt | A prompt that re-runs "do everything" has no role separation, no queue and no definition of done. | The scheduler starts one **round**; the round has the roles, artifacts and gates defined here. |

### 2.3 What the evidence does and does not support

- Multi-agent work helps with breadth and parallelism, but a production research system cost
  roughly 15× the tokens of a chat interaction; it is a deliberate trade, not a free win
  ([Anthropic, 2025](https://www.anthropic.com/engineering/multi-agent-research-system)).
- Evaluator-optimizer loops work when the evaluation criteria are explicit and the task has a
  clear stopping point; they are not a substitute for a real external signal
  ([Anthropic, 2024](https://www.anthropic.com/engineering/building-effective-agents)).
- A durable plan on disk plus a fresh context per iteration is the reliability mechanism in the
  Ralph approach: one task per loop, tests as backpressure, and stop conditions
  ([Ralph playbook](https://github.com/ClaytonFarr/ralph-playbook),
  [Huntley](https://ghuntley.com/ralph/)).
- Delivery evidence cautions against unattended release. DORA's 2024 report associates a rise in
  AI adoption with lower delivery stability and throughput, and OpenAI's agent guide recommends
  human intervention for high-risk or irreversible actions
  ([DORA 2024](https://cloud.google.com/blog/products/devops-sre/announcing-the-2024-dora-report),
  [OpenAI](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)).
  That is correlational, but it is a reason to keep every change PR-based, start with low-risk
  gaps, and make auto-merge a narrow exception rather than the default.
- Comparing against a moving branch creates a moving target. Discovery pins the reference commit
  and every item names that SHA, so a fixer never implements a gap against a version the finder
  did not read.
- None of these sources measured this repository. They justify the shape of the loop; the loop's
  own round log is the measurement that matters.

## 3. Best-practice design

### 3.1 Roles

| Role | Owns | Must not |
| --- | --- | --- |
| **Round Lead** (one fresh session per round) | Syncing the checkout, reconciling the queue with PR state, running or skipping discovery, selecting at most two items, assigning fixers, integrating, verifying, writing the queue, opening the PR, applying the auto-merge guardrail. | Implement a fix itself, merge outside the guardrail, change the Policy, or touch the deployed checkout. |
| **Gap Finder** (fresh agent per discovery run) | Reading the reference at a pinned commit, comparing with the local main, writing ranked gap items with evidence and acceptance, deduplicating. | Edit code, commit, open PRs, or edit the queue directly. |
| **Fixer** (one per item, parallel only when scopes are disjoint) | Implementing one item on its own branch/worktree, adding tests, running targeted checks, reporting changed files and command output. | Touch another item, edit the queue, merge, or expand scope. |
| **Verifier** (independent agent) | Re-reading the item's acceptance, reproducing the gate on the integrated candidate, reviewing the diff for scope and quality, reporting pass/fail with evidence. | Edit code, accept a claim without output, or verify its own fix. |
| **Host scheduler** (DSH automation) | Starting one round on a cadence, with one concurrent run and a durable run history. | Merge, edit code, or resume a loop a person paused. |

**Role output contracts.** The round Lead writes these into each spawned agent's brief; a round
that cannot produce them stops instead of improvising.

- *Finder:* the pinned reference SHA, the item list with every field below, the items it
  rejected and why, the dedupe check against the queue, and what it did not verify.
- *Fixer:* the item ID, changed files, the commands it ran with exit codes and the key output,
  new or changed tests and why they fail before the fix, and residual risks.
- *Verifier:* pass/fail per acceptance criterion, the commands it ran with exit codes, a
  test-integrity check (no weakened, skipped or deleted tests to make the gate pass), diff scope,
  and residual risks. A pass without command output is not a pass.

### 3.2 Durable state

`docs/benchmark/gap-backlog.md` is the only queue. Each item records:

- an ID, a content fingerprint for deduplication, the dimension and a one-line gap;
- the hermes-agent commit and exact reference locations (`path:line`);
- the current local state (`path:line`), so "already implemented" is checked;
- why the gap transfers to a DSH bundle (or a recorded `dropped` reason);
- observable acceptance criteria and the command or test that verifies them;
- status (`proposed` → `selected` → `fixing` → `verify` → `review` → `fixed`, or `blocked` /
  `dropped`), the round and the PR/merge commit.

The round Lead is the only writer. A fixer's branch never edits the queue, which removes the
shared-file conflict that would otherwise make parallel rounds unsafe
([Position paper](https://arxiv.org/html/2608.18092)). Dropped items stay in the file with their
reason; silence is not a decision.

### 3.3 One round

A round is one scheduled session with a hard boundary. It runs these steps in order:

1. **Sync.** In the dedicated clone: `git fetch origin`, reset to `origin/main`, remove stale
   worktrees, confirm the queue exists. If the queue is missing (the mechanism has not merged
   yet), stop without changes. If the previous round's full gate is still failing on `main`, or
   more than three loop PRs are open, stop and report instead of adding work.
2. **Reconcile.** For every `review` item, read its PR: merged → `fixed` (with merge commit);
   closed unmerged → `proposed` or `blocked` with the reason. This is how the queue survives a
   crashed or skipped round.
3. **Discovery.** If fewer than three `proposed` items remain, spawn one Gap Finder. Pin
   `NousResearch/hermes-agent` at the current `main` SHA, read the queue and the prior benchmark
   report, and return up to three items above the bar. The Lead deduplicates and appends. If
   the finder returns nothing above the bar, count a dry discovery. If three or more `proposed`
   items remain, skip discovery — fixing is the bottleneck.
4. **Select.** Rank by impact × transferability ÷ risk after a fingerprint check against every
   open, fixed and dropped item. Take at most two items; record the round id and set them to
   `selected`/`fixing`.
5. **Fix.** One fixer per item, each in its own worktree and branch from `main`, with disjoint
   files. If two items must touch the same file, run them sequentially. Each fixer runs the
   targeted tests and reports the command output. The Lead does not fix.
6. **Verify.** An independent verifier re-reads the acceptance, reproduces it on the integrated
   candidate, checks that no test was weakened, skipped or deleted to make the gate pass, and
   reviews the diff. A failure goes back once as a repair; a second failure marks the item
   `blocked` and leaves it out of the PR.
7. **Integrate.** The Lead merges the item branches into one round branch, resolves only trivial
   conflicts, and reruns the full gate on that commit.
8. **Deliver.** Update the queue, add the round log, commit, push, and open **one PR per round**
   (items + queue + docs). The PR body lists the items, the evidence, the gates and the
   limitations. Apply the auto-merge guardrail (below); otherwise leave the PR open for a person.
9. **Close.** Write the round result into the queue and the automation run summary. Two
   consecutive dry discoveries, or two consecutive rounds with no merged change, pause the loop
   and state why.

### 3.4 Gates and delivery policy

A round is ready only when all of these hold:

- The targeted tests for each changed behavior pass, and `pnpm check` (typecheck, full test
  suite under the coverage gate, build) exits 0 on the integrated commit. The coverage gate is
  `pnpm test:coverage`: statements, branches, functions and lines must stay above the thresholds
  in `vitest.config.ts`. On native Windows the POSIX-only suites skip by design; the skip is
  recorded, not hidden.
- `node scripts/verify-install.mjs` exits 0 when the change can affect loading or the panel
  (`src/`, `cordis.patch.yml`, `package.json`, `scripts/`); a docs-only round may record why it
  skipped the link-install run.
- `tests/docs.spec.ts`, `tests/class-docs.spec.ts` and `tests/model-surface.spec.ts` pass; a new
  test file is listed in the `Tests` table of [007 Architecture](../007-architecture.md); a new
  module is listed in its `Modules` table.
- The verifier reports pass with the commands it ran and confirms that no test was weakened,
  skipped or deleted to make the gate pass.
- The PR starts with the automated-agent disclosure line, uses the configured commit author, and
  contains no unrelated files, no secrets and no private Feishu content.

**Auto-merge guardrail.** The round Lead enables auto-merge only when the PR is at most 200
changed lines, touches no database schema migration, no Policy/authorization behavior and no
deployment account settings, and every gate above passed. Anything larger or riskier stays open
for a person; the queue marks it `review` and the next round does not duplicate it. This mirrors
the default rule in [003 Execution](../003-execution.md#L82-L90) and keeps the fast path fast
without making an autonomous agent the sole reviewer of a risky change.

### 3.5 Scheduling, budget and stop conditions

- **Scheduler.** A DSH automation in the operator's normal profile (not in the `superagent`
  profile) starts one round every six hours, with `maxConcurrentRuns: 1`. The dedicated clone,
  not the deployed checkout, is the workspace. The run history is the audit log.
- **Budget.** At most two fixes and one discovery per round; at most five spawned agents
  (finder, two fixers, verifier, one repair); discovery is time-boxed to about 45 minutes and a
  round to about three hours. A round that exceeds its budget stops and records what it
  completed rather than opening a partial PR.
- **Dry / stalled detection.** Two consecutive dry discoveries, or two consecutive rounds with
  no merged change, pause the automation and record the reason. Three `review` items waiting
  for a person for more than two rounds also pause it: continuing would only pile up unreviewed
  work.
- **Hard stops.** A red `main`, more than three open loop PRs, the same fingerprint failing
  verification twice, or three items blocked on a decision pause the round and record why. The
  loop does not widen scope to stay busy.
- **Maturity.** A new loop earns auto-merge; it does not start with it. The operator can leave
  auto-merge off for the first rounds and merge the small PRs by hand, then enable it once the
  round log shows the loop is producing verified, low-risk changes. The guardrail above is the
  maximum, not a requirement to use it on every round.
- **A person's stop is final.** The loop never resumes an automation a person paused, and never
  overrides a stop to "finish the queue".

### 3.6 Failure handling

- A failed gate is a normal outcome: report it, keep the item `proposed` or `blocked` with the
  command output. Do not reduce the gate to make it pass.
- A crashed round leaves the clone dirty. The next round's sync step resets it and removes stale
  worktrees; the queue's statuses and the PRs are the source of truth.
- A blocked item names the decision or credential it needs. It is reported once; later rounds do
  not re-ask.
- The loop never force-pushes a shared branch, rewrites `main`, deletes unrelated branches, or
  edits the deployed checkout.

### 3.7 Human oversight and visibility

The loop minimizes human attention but does not hide: every change is a PR, every round is in
the queue's round log, and every scheduled run is in the automation history. A person can pause
the automation, merge or close a `review` PR, or add an item by hand. The loop does not send
routine progress messages; it surfaces a result where it can be used (a PR) and a decision where
one is required (a `blocked` item or a PR outside the auto-merge guardrail).

## 4. Deployment in this environment

- **Workspace.** A git clone registered as a DSH workspace, with its own `node_modules`. In this
  deployment the existing benchmark clone (`<stateDir>/work/pdca-hermes-benchmark-…`) is reused
  and reset to `origin/main` at the start of each round; a future migration can register a
  separate clone. The deployed `dsh-superagent-fork` checkout is never the loop's working tree.
- **Automation.** A DSH automation in the desktop profile, named
  "dsh-superagent 差距发现→修复循环", every 360 minutes, `maxConcurrentRuns: 1`, the `cordis`
  preset, `danger-full-access`, model inherited from the profile, workspace = the registered
  loop clone. Its prompt is a thin contract: read this document and
  [gap-backlog.md](gap-backlog.md); if the queue is absent, stop; run one round; use isolated
  agents for the finder, fixers and verifier; open the PR; apply the guardrail; write the round
  summary. The exact prompt lives in the automation, not in the repository, so changing it is a
  deliberate deployment action, not a silent doc edit.
- **Pause / resume.** Pause by setting the automation to `paused`; resume deliberately. No other
  mechanism is allowed to resume it.
- **Bootstrap.** The first round is the Ticket that introduced this document and the queue. It
  validates the protocol once by hand; the scheduled loop starts from the merged `main`, and its
  first run exits quietly if the queue is not there yet.

The loop is a **host-level maintenance job**, not a dsh-superagent Ticket factory. Scheduled work
belongs to the host ([006 Deployment](../006-deployment.md#L133-L141)), and self-triggered
Tickets would bypass the admission Policy that every person-originated request goes through.

## 5. How the design meets the latent needs

| Need | Mechanism |
| --- | --- |
| Autonomy | A host schedule starts each round; the queue carries the work between sessions. |
| Quality | Evidence at a pinned commit; acceptance and a verify command per item; independent verifier; `pnpm check` and link-install gates; small reversible PRs. |
| Progress | The queue's statuses, PR links, round log and automation history answer "what was found/fixed/rejected and why". |
| Control | One round at a time, two fixes per round, an explicit auto-merge guardrail, dry/stalled pause, and a person's pause is final. |
| Focus | The ownership map and a transferability argument per item keep the loop on bundle-sized gaps. |

## 6. Sources

- Anthropic, *How we built our multi-agent research system* (2025) — orchestrator + parallel
  subagents; evaluation; ~15× token cost; 90.2% improvement over a single agent on their
  internal research eval. <https://www.anthropic.com/engineering/multi-agent-research-system>
- Anthropic, *Building effective agents* (2024) — workflows vs agents; the
  evaluator-optimizer loop and when a simpler workflow suffices.
  <https://www.anthropic.com/engineering/building-effective-agents>
- Geoffrey Huntley, *Ralph* — run the agent in an outer loop with a fresh context and a durable
  plan; one task per iteration; tests as backpressure; stop conditions; sandbox the blast
  radius. <https://ghuntley.com/ralph/>
- Clayton Farr, *Ralph playbook* — plan/build modes, a single plan file, subagents as memory
  extension, stop conditions and periodic replanning.
  <https://github.com/ClaytonFarr/ralph-playbook>
- Addy Osmani, *Self-improving coding agents* (2026) — persistent context files, a progress log,
  task state, automated stop conditions, periodic refocusing.
  <https://addyosmani.com/blog/self-improving-agents>
- Cursor, *Scaling long-running autonomous coding* — long runs drift; periodic fresh starts;
  lock-based shared-file coordination limits throughput; planner/worker/judge roles.
  <https://cursor.com/blog/scaling-agents>
- snarktank, *compound-product* — a daily report selects one priority and opens a PR; a
  `prd.json`-style boolean state file records what passed; learnings persist between runs.
  <https://github.com/snarktank/compound-product>
- OpenAI, *A practical guide to building agents* — layered guardrails, exit conditions and human
  intervention for high-risk or irreversible actions.
  <https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf>
- *Position: Multi-Agent Systems Should Prioritize Concurrency Control* (2026) — shared-state
  reads/writes, stale reads and lost updates; concurrency control as a first-class concern.
  <https://arxiv.org/html/2608.18092>
- Cemri et al., *Why Do Multi-Agent LLM Systems Fail?* (2025) — specification, misalignment and
  verification failure modes; verification is a dominant failure category.
  <https://arxiv.org/abs/2503.13657>
- Huang et al., *Large Language Models Cannot Self-Correct Reasoning Yet* (2023) — intrinsic
  self-correction is unreliable without external feedback. <https://arxiv.org/abs/2310.01798>
- Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena* (2023) — position,
  verbosity and self-enhancement biases in LLM judges. <https://arxiv.org/abs/2306.05685>
- DORA, *The four keys* and *Working in small batches* — small, frequent, reversible changes,
  automated delivery gates and smoke tests.
  <https://dora.dev/guides/dora-metrics-four-keys/>,
  <https://dora.dev/devops-capabilities/process/working-in-small-batches>
- DORA, *2024 Accelerate State of DevOps report* — AI adoption was associated with lower delivery
  stability and throughput; correlational, not causal.
  <https://cloud.google.com/blog/products/devops-sre/announcing-the-2024-dora-report>

## 7. Limitations

- The hermes-agent side is read statically at a pinned commit, not executed; the comparison is
  design evidence, not a measurement of either system.
- The general sources above justify the loop's shape; they do not prove it will find valuable
  gaps in this particular product. The round log is the evidence that must accumulate.
- The auto-merge guardrail is a prompt-level rule plus an independent verifier; it is not yet
  enforced by GitHub branch protection or CI. A later gap can add those enforcement layers.
- A finder can still propose a plausible but low-value gap. The quality bar and the independent
  verifier reduce this, but the first rounds should be watched and the bar tuned.
- The recommended evidence is mostly from vendor engineering posts and practitioner reports;
  DORA is correlational and the concurrency-control paper is a position paper. No source
  measures this exact loop, so the design is an inference that the round log has to validate.
- The loop's first rounds may produce noisy or low-value PRs. That is expected; the design
  treats the queue and the round log as the tuning surface, not the individual round.
