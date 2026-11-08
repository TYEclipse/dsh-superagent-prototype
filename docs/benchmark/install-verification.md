# Install verification record

> This is by an automated agent, not a human.

`scripts/verify-install.mjs` proves that this checkout installs into a DeepSeek Harness profile with `link:` and
that the plugin loads and serves its panel. This file records the runs used by the PDCA rounds in
[benchmark-report.md](benchmark-report.md).

## Final run (this branch)

| | |
| --- | --- |
| Date | 2026-11-09 07:08 CST (2026-11-08T23:08Z) |
| Host | Windows 11, Node.js 24.13.0, pnpm 11.7.0 |
| DSH | `@deepseek-ai/dsh` **0.2.2-rc.1** (local install at `C:\Users\tyecl\.dsh\tmp\dsh-022`) |
| Checkout | commit `086ec65d855ae6461b44ebb0ec91ad541c6d05e8` |
| Command | `node scripts/verify-install.mjs --dsh <…>/node_modules/@deepseek-ai/dsh/lib/bin.js --receipt .artifacts/final-install.json` |
| Result | **exit 0 — 13/13 checks passed** |
| Receipt | `.artifacts/final-install.json` (git-ignored; contents below) |

### Checks

| Check | Result |
| --- | --- |
| The shipped Web template composes with this DSH | ✅ 1,244 config lines |
| The bundle installs with `link:` | ✅ `dsh-superagent link:C:/…/pdca-hermes-benchmark-e9685ae6f6f0` |
| The profile depends on this checkout | ✅ |
| `GET /orchestrator/api/state` answers | ✅ HTTP 200 |
| The state carries `setup`, `health`, `load`, `masterId`, `paused` | ✅ |
| The runtime reports ready or waiting for setup | ✅ `paused (setupPending)` — expected on a fresh profile |
| The state names the profile's state directory | ✅ throwaway `%TEMP%` path |
| The setup state is the expected fresh-profile state | ✅ `repositoryUnset` |
| `GET /orchestrator/api/settings` answers | ✅ HTTP 200 |
| `GET /orchestrator/api/prompts` serves this build | ✅ HTTP 200 |
| The Web server answers the panel shell route | ✅ HTTP 401 (the shell is token-gated; the server serves) |
| The state directory holds `orchestrator.sqlite` | ✅ |
| The worker and router presets are mounted | ✅ |

The run created its own `$DSH_HOME` under `%TEMP%`, installed this checkout with `link:`, booted
`dsh --profile superagent-verify --no-open` on an OS-chosen loopback port, polled the management API, stopped the
process and removed the throwaway home. Nothing in the operator's `~/.dsh` profile is modified.

## Earlier runs

- **Round 1 (baseline boot, 2026-11-08 19:47 CST):** the bundle was linked into a throwaway profile on
  `127.0.0.1:3099` with DSH 0.2.2-rc.1; `GET /orchestrator/api/state` returned 200 with the normal
  `repositoryUnset` setup state and the runtime health `paused (setupPending)`.
- **Round 2 (`086ec65`'s predecessor `61d27d1`, 19:58 CST):** `verify-install.mjs` passed 13/13 checks while the
  script still asserted the panel's `/` route returned 200; DSH serves that route as 401 without the browser's
  boot token, so the check now accepts any non-5xx answer and records the status.

## What this proves, and what it does not

Proves: the package installs from this checkout through the real DSH plugin manager; DSH 0.2.2-rc.1 loads the
bundle and its client plugin; the runtime starts, creates its SQLite state and serves the management API the panel
uses; the shipped presets and prompt configuration are present.

Does not prove: a real GitHub or Feishu account flow (no credentials are used); an upgrade from an older database
schema; the POSIX-only worker shims or the Python + tmux service script on native Windows; the browser's rendered
panel (the run checks the API and that the server answers the shell route).

## Reproduce

```sh
pnpm install && pnpm build
pnpm verify:install -- --dsh <path to @deepseek-ai/dsh/lib/bin.js>
# or
node scripts/verify-install.mjs --dsh <path> --keep   # keep the throwaway DSH_HOME for inspection
```

Exit code is 0 only when every check passes; the receipt is written even on failure, with the failing check and
the profile log tail.
