# 第 1 轮：让进化本身可累积、可回滚

> **本文件由自动化代理撰写，不是人类。**

- **日期：** 2026-11-24（Asia/Shanghai）
- **分支：** `agent/self-evolve-loop-60b58299770e`
- **起点：** `main` `d6ffbd2`（v0.2.1）
- **状态：** 实现与本地闸门已通过；PR、合并、release 与重载见 §8，按轮次对账补齐。

## 1. 结论

本轮不加新的运行时能力，而是先修「进化循环本身」：仓库有严格的一次性闸门（测试、静态覆盖率阈值、安装验证、CI、自动发版），但没有**累积性**——覆盖率阈值固定，离实测值还有 1 个点以上的余量；没有任何 `docs/evolution` 轮次记录；旧的 gap 队列已经和代码脱节。于是「自回归进化」可以被执行成一串互不衔接的改动，下一轮无法机械地确认上一轮验证过什么，也无法阻止它悄悄降低质量标准。

本轮加入**每平台覆盖率棘轮**、**进化轮次记录合同**和**失败/回滚/停止规则**，并把旧队列中对不上代码的状态改正。它没有任何运行时行为、schema、Settings、Prompt、Policy、授权或部署安全设置的变化。

## 2. 调研

调研问题：在「一个 harness 连续多轮自我改进」这个场景里，哪些机制能让每轮改动可累积、可回滚、可审计，而不是只优化眼前这一轮？

查询（2026-11-24）：`self-improving coding agent loop best practices 2026`、`continual harness self-evolution forgetting`、`coverage ratchet CI`、`trustworthy recursive self-improvement`。

| # | 来源 | 结论 | 用在本轮哪里 |
| --- | --- | --- | --- |
| 1 | [Trustworthy Recursive Self-Improvement in the Era of Large Models](https://arxiv.org/html/2610.35193)（2026） | 递归自我改进的可信性取决于三件事：改进证据的有效性、约束的保持、有效的监督。被改写的改进机制会让旧验证失效，自评也可能被污染。 | 为什么每轮要留下独立证据、为什么授权/策略/部署安全设置不在可改范围、为什么不能只靠自评。 |
| 2 | [Can Coding Agents Sustain Continual Evolution without Forgetting?](https://arxiv.org/html/2611.03219)（2026） | 在后续数据集上继续进化会显著破坏先前数据集上的表现：论文报告的例子里，SWE-Bench 从 94.0% 在第 5 轮后跌到 32.0%。持续进化需要显式的保留条件。 | 为什么每轮都要跑全套测试与覆盖率棘轮，而不是只跑本轮目标测试；为什么轮次记录要能对账。 |
| 3 | [Evaluation-Free Recursive Self-Improvement for Coding Agents](https://arxiv.org/abs/2611.21056)（2026） | 不依赖下游任务评测的进化仍然需要结构性与可运行性检查；把互补改动整合成一个可运行的后代，比单纯挑选候选更稳。 | 本仓库没有任务级 benchmark，所以本轮只声称「结构与运行有效性」的闸门，不声称能力提升。 |
| 4 | [NVIDIA NemoClaw #554：add test coverage ratchet](https://github.com/NVIDIA/NemoClaw/issues/554)（2026） | 覆盖率棘轮的实用形态：仓库内阈值文件、容差吸收平台差异、低于阈值即失败、提高后抬高阈值；阈值文件是唯一真相。 | 脚本的每平台基线、0.10 点容差、`--update` 只升不降、`--allow-decrease` 需要显式理由。 |
| 5 | [Self-Improving Coding Agents](https://addyosmani.com/blog/self-improving-agents)（2026） | 长循环需要持久任务状态、进度日志、自动停止条件和周期性重新聚焦；只靠一条超长提示会漂移。 | `docs/evolution` 的轮次索引与记录、每轮对账、停止条件、一次只做一个变更。 |
| 6 | [DORA：The four keys](https://dora.dev/guides/dora-metrics-four-keys/) | 小批量、自动化闸门、可回滚的交付更容易被评审和恢复。 | 一轮一个 PR、失败回滚、合并后安装验证与部署回退。 |

这些来源解释的是**为什么这样设计**，不是对本仓库的测量。本仓库目前没有任务级成功率、token 成本或长周期退化数据，所以本轮不声称一个具体的改进百分比；覆盖率也不是能力指标。

## 3. 候选比较

评分只看四件事：对「少占用人的注意力、把工作送到可验证 PR」的价值、发生频率、爆炸半径、验证成本。分数是相对判断，不是测量值。

| 候选 | 价值 | 频率 / 风险 | 结论 |
| --- | --- | --- | --- |
| **覆盖率棘轮 + 轮次记录 + 对账** | 高：让后续每一轮都有单调质量底线和可读证据；正是请求里点名但仓库缺失的部分 | 每轮都用；风险低，只加脚本、基线、文档与测试 | **选中** |
| 工作回合的静默看门狗 | 高：释放 provider 挂起时被占住的 slot | 低到中；需要先决定「超时后是失败、重试还是交给人」，属于产品决定 | 未选；按范围规则停下，另开变更 |
| 每张工单的 token / 费用账本 | 中高：成本可见、可告警 | 高；需要 host 用量来源与面板/卡片展示，本轮没有 UI 证据预算 | 另开变更 |
| 领域记录保留/归档（GAP-04） | 中：数据库长期增长 | 随时间上升；保留窗口是产品决定，且要 schema 迁移 | 仍被策略决定阻塞 |
| 小写 cookie 头的脱敏（GAP-05） | 低到中：安全边界 | 低；改动小，但救不回工单，也不是本轮「进化循环最大短板」 | 后续轮次候选 |
| 宿主 automation 连续调度 | 高：无人重新提示也能继续 | 部署相关，不是仓库内可移植的改动；旧设计已把它归为操作者的显式部署动作 | 不在本轮；不创建、不恢复任何 automation |

选中棘轮而不是看门狗的另一个原因：它是请求原文的一部分（「过全部测试与覆盖率棘轮」），不需要新的产品决定，而且它的失败模式是「拒绝合并」，可回滚、可验证。

## 4. 现状诊断

### 4.1 质量闸门是一次性的

`vitest.config.ts:16` 的阈值是固定的 `92 / 84 / 92 / 95`；本轮基线实测（`coverage/coverage-summary.json`）是 `93.13 / 85.68 / 93.08 / 96.22`。两者之间分别有 `1.13 / 1.68 / 1.08 / 1.22` 个点的余量，后续任何一轮都可以在这个余量内降低覆盖率而不触发失败。CI 只跑 `pnpm check`，没有高水位比较。

### 4.2 轮次证据没有家

仓库没有 `docs/evolution/`。已有的三轮自我改进证据分散在 `docs/012-prepare-retry-zh.md`、`docs/015-no-progress-guard-zh.md`、`docs/016-bounded-host-restart-zh.md` 和 PR 描述里；没有任何索引或机器可读状态。一个新 Session 无法从仓库本身回答「上一轮改了什么、验证到哪、release 是哪个、部署重载了吗」。

### 4.3 旧队列已经与代码脱节

`docs/benchmark/gap-backlog.md` 是上一套 hermes 差距循环的持久队列。它仍把 GAP-01（凭据脱敏）和 GAP-02（doctor 构建校验）写成 `review (round 1)`，把 GAP-03（prepare 重试）写成 `proposed`；但：

- GAP-01 随 PR #8 合并（`7b6655d`，合并提交 `6f4b8e9`）；
- GAP-02 随 PR #8 合并（`a53b2a1`）；
- GAP-03 随 PR #17 合并（`5e3c8c8`，2026-11-10）。

只有 GAP-05（小写 cookie 头）仍然是真正开放的候选，GAP-04 仍被策略决定阻塞。队列不更新，下一轮的「对账」步骤就会重复工作或误判已完成项。

### 4.4 为什么现在值得改

请求要求「每轮自动完成调研→最大短板→实现→全部测试与覆盖率棘轮→安装验证并重载→PR 合并→自动发版，然后立即下一轮」。这条链路里，测试、安装验证、发版、重载都已经有实现（`pnpm check`、`scripts/verify-install.mjs`、`.github/workflows/ci.yml`、HMR 重载）；缺的是让第 N 轮与第 N+1 轮之间的质量与证据**不下降**。先把这一层补上，后续的功能轮才有可比性。

## 5. 方案

### 5.1 覆盖率棘轮

新增 `scripts/coverage-ratchet.mjs`：

- 读取 v8 的 `coverage/coverage-summary.json` 的 `total.{statements,branches,functions,lines}.pct`；
- 读取仓库根的 `coverage-baseline.json`，按 `process.platform-process.arch` 选择该平台的高水位；
- 任一指标低于「高水位 − 容差（默认 0.10 点）」即退出 1；高水位以内、容差以内的浮动通过；
- `--update` 只升不降；确有理由降低时，必须再加 `--allow-decrease`，并在本轮记录里写明原因；
- 平台没有基线时，首次运行以提示方式通过，用 `--update` 记录；基线文件缺失是配置错误，不静默跳过；
- `--json` 输出机器可读结果，便于后续轮次或 CI 采集。

`coverage-baseline.json` 初始记录本机（`win32-x64`）的 `93.13 / 85.68 / 93.08 / 96.22`，对应 `d6ffbd2`。`package.json` 的 `check` 在 `test:coverage` 之后、`build` 之前运行棘轮；新增 `coverage:ratchet` 与 `coverage:update` 两个脚本。

### 5.2 轮次记录与合同

新增 `docs/evolution/README.md`：一轮的步骤、闸门、记录必填小节、失败/回滚/停止规则、授权边界。新增本文件作为第 1 轮记录。README 的 Development 段与 `docs/007-architecture.md` 的 Tests 表同步更新。

### 5.3 旧队列对账

更新 `docs/benchmark/gap-backlog.md`：GAP-01/02 → `fixed`（PR #8，合并提交 `6f4b8e9`）；GAP-03 → `fixed`（PR #17，`5e3c8c8`）；GAP-05 保持 `proposed`；GAP-04 保持 `blocked`；Round log 增加一条 2026-11-24 的对账记录，说明这三项已在后续 PR 完成，不重复实现。

### 5.4 为什么放在脚本与文档层

- 棘轮是 CI/本地质量闸门，不是运行时行为；它不需要进入 `src/`，不改变 bundle 的加载、Prompt、Policy 或部署配置。
- 每平台基线解决了 Windows 上 42 个 POSIX-only 测试跳过造成的平台差异；不把 Linux 的数字硬编码成 Windows 的数字。
- 记录放在 `docs/evolution`，与编号文档的「一篇一个主题」分开，避免把每轮流水账塞进 000–016 的阅读顺序。

## 6. 验证

本机（Windows 11，Node 24.13.0，pnpm 11.7.0，DSH 0.2.2-rc.1）：

- 基线（改动前）`pnpm check`：exit 0；1,263 passed / 42 skipped；覆盖率 93.13 / 85.68 / 93.08 / 96.22；`lib/index.js` 468.58 kB。
- `pnpm vitest run tests/coverage-ratchet.spec.ts`：7/7 passed（缺失基线、低于高水位、容差内下降不降低高水位、平台无基线、记录新平台、拒绝无理由降低、坏 summary）。
- 改动后 `pnpm check`：exit 0；1,270 passed / 42 skipped；覆盖率 93.13 / 85.68 / 93.08 / 96.22；`coverage ratchet: ok`；`lib/index.js` 468.58 kB。
- `node scripts/verify-install.mjs --dsh C:/Users/tyecl/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js`：13/13 项通过；receipt `.artifacts/install-verification.json`，commit 见 PR。
- `tests/docs.spec.ts`、`tests/class-docs.spec.ts`、`tests/model-surface.spec.ts`：随全套通过。
- PR CI、release、部署重载：见 §8 的对账（合并后补齐）。

未验证：Linux 平台的覆盖率数字尚未进入基线；第一次 Linux CI 会以「该平台暂无基线」提示通过，随后用 CI artifact 记录 Linux 高水位。没有任务级成功率、token 成本或长周期退化测量，因此本轮不声称能力提升。

## 7. 风险与限制

- **棘轮不是行为测试。** 覆盖率可以因测试写法变化而波动；真正的行为闸门仍是全套测试、安装验证和 PR 评审。棘轮只防止「悄悄把质量底线往下挪」。
- **每平台基线需要维护。** 新增平台（例如 macOS）第一次会提示通过；必须用 `--update` 记录后再依赖它。Linux 的高水位在第一次 CI artifact 之后补入。
- **故意的降低需要理由。** 删除大量代码或测试时，`--update --allow-decrease` 是唯一出口；本轮把「必须写进记录」写进了合同，但脚本本身无法验证理由是否充分。
- **文档合同依赖执行者遵守。** 脚本只能检查覆盖率；轮次记录、失败回滚、停止条件靠流程与 PR 评审。后续可以用脚本校验记录小节，但不在本轮。
- **重载会中断当前 Assignment。** 按 PR #19 的恢复上限，一次重载在三次自动恢复预算内；连续两轮重载仍可能消耗预算，所以每轮最多触发一次。
- **不改变授权边界。** 本轮没有改 Policy、Mandate、admission、permission preset、部署账户或密钥设置；下一轮也不得改。

## 8. 落地与下一轮

- **PR：** 待创建（本轮分支 `agent/self-evolve-loop-60b58299770e`）。
- **合并提交 / release：** 合并后由 release job 自动发 patch 版本；下一轮对账时补上 tag 与 release URL。
- **部署与重载：** 合并后把部署的 `link:` 检出更新到 release 提交，`pnpm install --frozen-lockfile && pnpm build`，写新的 `# Reload trigger` 注释触发 HMR，并用管理 API 验证 `health.runtime.state`、`setup.problem`、parts 与 HEAD；证据写进下一轮对账。
- **下一轮：** 先完成本轮对账；然后按新的调研重新排序候选。当前候选：GAP-05（小写 cookie 头脱敏，安全边界，改动小）；静默看门狗（需要产品决定超时语义，若无决定则不做）；token/费用账本（需要 host 用量来源与展示面）。不得为了「有东西可做」而降低闸门或跨范围。
