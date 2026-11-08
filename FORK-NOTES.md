# Fork notes — DSH 0.2.2-rc.1 compatibility

This repository is a fork of
[`deepseek-ai/dsh-superagent-prototype`](https://github.com/deepseek-ai/dsh-superagent-prototype)
(upstream import commit `8c32a9d`, 2026-11-03). The upstream README still
describes the prototype as research code, not an official DeepSeek product;
this fork keeps that status and only adapts the bundle to a newer DeepSeek
Harness release line.

## Target

| Component | Version |
| --- | --- |
| `@deepseek-ai/dsh` | `0.2.2-rc.1` (npm `latest` / `next` at the time of the fork) |
| `@deepseek-ai/cordis` | `~4.1.0` |
| `@deepseek-ai/schemastery` | `~3.19.0` |
| Node.js | `^22.19.0 || >=24.0.0` |

`engines.dsh`, `peerDependencies` and `devDependencies` were moved from the
`^0.2.1-alpha.2` line to `^0.2.2-rc.1`. DSH 0.2.1 hosts are no longer accepted
by this fork; use the upstream repository for those.

## Changes

- `feat: target the latest DeepSeek Harness 0.2.2-rc.1 release line` —
  version metadata only.
- `feat: adapt the bundle to DeepSeek Harness 0.2.2-rc.1`
  - Executor transcripts are read through `SessionPersistence`
    (`ctx.sessionPersistence.open(id, 'read').read().events`).
    `SessionController.inspect` was removed in 0.2.2, and the replacement
    history pages (`SessionController.events`) return wire-form records rather
    than typed `SessionEvent`s.
  - The management route returns 503 while `webServer.port` is still
    `undefined`; 0.2.2 types the listening port as optional.
  - The Deployment page reads read-only state from `ConfigFormSnapshot.writable`;
    the removed `mode` field is no longer used.
  - `tests/role-models.spec.ts` builds its route from the 0.2.2
    `AgentModel` + `modelSelection` projection; `installModelSelection` now
    takes only the Agent context.
- `fix(windows): accept Windows absolute paths in machine configuration` —
  `stateDir`, the Executor directory, and CLI paths accept drive-letter and
  UNC paths. Without this the plugin refuses to start on native Windows even
  when the profile supplies a valid `C:\...` path.
- `docs: record the fork scope, verification and known limits` (this file).

## Install on DSH 0.2.2-rc.1

macOS / Linux (upstream-supported route):

```sh
npm install -g @deepseek-ai/dsh@0.2.2-rc.1 pnpm@11.7.0
git clone <this fork> dsh-superagent && cd dsh-superagent
pnpm install --frozen-lockfile && pnpm build
dsh superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
cp examples/profile.cordis.patch.yml ~/.dsh/profiles/superagent/cordis.patch.yml
# edit stateDir and the panel port, then:
scripts/dsh-superagent start
```

Windows: the upstream service script is Python + tmux and stays POSIX-only, so
start the profile directly (the plugin itself runs):

```powershell
npm install -g @deepseek-ai/dsh@0.2.2-rc.1 pnpm@11.7.0
git clone <this fork> dsh-superagent; cd dsh-superagent
pnpm install --frozen-lockfile; pnpm build
dsh superagent --from-default-profile web --dump-config > NUL
dsh plugin --profile superagent add "link:$PWD"
# copy examples/profile.cordis.patch.yml to %USERPROFILE%\.dsh\profiles\superagent\cordis.patch.yml
# set stateDir (for example C:/Users/<you>/.dsh/state/superagent) and the port
dsh --profile superagent --no-open
```

The first start is expected to report `repositoryUnset` / exit 3 style
"waiting for setup" until a GitHub repository and the agent CLI are configured.

## Verification performed on this fork

Environment: Windows 11, Node 24.13.0, pnpm 11.7.0, DSH 0.2.2-rc.1.

- `pnpm typecheck`: passes.
- `pnpm build`: produces `lib/` (11 files).
- `pnpm test`: 1,153 of 1,197 tests pass. The 44 failures are POSIX-only
  tests that cannot run on native Windows (they spawn `sh`/`sleep`, create
  symlinks, assert POSIX file modes, or exercise the Python + tmux service
  script and `#!/bin/sh` worker shims). They are not 0.2.2 regressions; a
  POSIX runner should run the full suite.
- `tests/bundle-patch.spec.ts` passes, so every row in `cordis.patch.yml`
  resolves against the 0.2.2-rc.1 packages.
- Runtime: the bundle was linked into a fresh `superagent022` profile mounted
  with DSH 0.2.2-rc.1, started on `127.0.0.1:3083`; the panel answered HTTP 200
  and `GET /orchestrator/api/state` returned 200 with the normal
  `repositoryUnset` setup state. The state directory created
  `orchestrator.sqlite`.

## Known limits

- GitHub and Feishu Sources still rely on POSIX worker shims (`worker-bin/gh`
  etc.) and the POSIX service script; they are not ported to native Windows by
  this fork.
- The prototype remains research code with the upstream safety posture: its
  Executor presets run with `danger-full-access` as the starting OS user. Use a
  dedicated OS account and a dedicated agent GitHub account.
- The package keeps `"private": true` from upstream; install it with `link:` or
  from git, not from npm.
