# 016 最高性价比改进：宿主重启恢复的次数上限

> **语言说明.** 本仓库其余文档用英文；这一篇用中文，因为这次改进是应中文团队的要求做的联网调研，结论需要让提出需求的人直接读懂。第 5 节是落地方案，其余各节是候选比较、外部依据、现状诊断与取舍记录。

## 1. 结论

本鱼选的是**宿主重启后自动恢复的次数上限**，而不是再改一版提示词、增加一个设置项或引入一个新的超时状态机。

一句话：**同一张工单在 worker 没有任何报告的情况下，被宿主重启连续打断三次后，第四次不再自动重启；核心记为 `failed`，Executor 把这条失败中继给主 Session，人可以在面板上一键 Retry。worker 的任何报告、人的 Retry、以及被消息恢复的工单都会把计数清零。**

这个改动的性价比最高，因为：

- **它直接止损一个无上限的循环。** 插件的配置保存、HMR 重载、升级、监控恢复都会重启宿主；每次重启都会通过 `DshExecutor.resume()` → `assignmentInterrupted` 把运行中的 Assignment 结束并立即换一个新的。当前实现没有上限：一个持续重启的宿主会让同一张工单无限地“重启—丢 turn—再重启”，每次都烧一轮 token、占一个 worker slot、往 `ticket.inputs` 里堆一条恢复说明，而面板上它一直只是 `working`，主 Session 收不到任何信号。
- **它复用已有的失败与重试语义。** 不新增状态、不新增设置、不加 schema：失败走既有的 `failed` 报告，模板已经支持 `canRetry` 和 Retry 按钮；人点 Retry 就是现有的新 Assignment 路径。
- **它的默认行为足够保守。** 只有“连续重启且 worker 一直没有报告”才计数；worker 报告一次进度就清零；第 4 次才停，前三次仍然按原逻辑恢复。停下来的代价是一张可见的失败工单，而不是无限烧钱。
- **它可验证、可回滚。** 计数和失败升级都是 core 的同步命令，可以用内存仓库精确断言；Executor 的中继走现有的 `resultRelay`；数据库只多一个可选的 Ticket 字段，旧数据照常读取，没有迁移。

改动规模：`src/core` 约 40 行、`src/executor/dsh.ts` 约 5 行、测试约 100 行、文档若干。没有 schema 迁移、Settings、Prompt、Policy、授权或部署安全设置的变化。

## 2. 候选比较

评分只看四件事：对“少占用人的注意力、把工作送到 PR”的影响、发生频率、爆炸半径、验证成本。分数是相对判断，不是测量值。

| 候选 | 价值 | 频率 | 风险 / 成本 | 结论 |
| --- | --- | --- | --- | --- |
| **宿主重启恢复的次数上限** | 高：终止“重启—丢 turn—再重启”的无上限循环 | 中：配置保存、HMR、升级、监控恢复都会重启 | 低：计数 + 既有 failed/Retry；无 schema、无设置 | **选中** |
| 工作回合的静默看门狗（长时间无事件即取消） | 高：释放挂死 worker 的 slot | 低到中：provider 挂起时 | 中高：需要定义取消后的状态、阈值误杀风险；另开变更 | 未选；本轮不引入新状态机 |
| 每张工单的 token / 费用账本 | 中高：成本可见、可告警 | 高：所有长任务 | 中：面板/卡片展示与写放大；本轮无 UI 证据要求 | 另开变更 |
| `orchestrator_report` 带验证证据并在 ready 时校验 | 中高：把“跑过测试”从口号变成字段 | 高 | 中：属于报告契约/策略行为，且声明仍可被编造 | 不选：避免改策略与报告契约 |
| worker Session 被删除后的自动重建 | 中：防止工单永久 working | 低 | 中：`agent/disposed` 在正常关闭时也会出现，误判风险高 | 另开变更 |
| 小写 cookie 头的脱敏（GAP-05） | 低到中：安全边界 | 低 | 低 | 可做，但救不回工单；单独处理 |

**为什么不是静默看门狗**：看门狗按“多久没有事件”判断，必须回答“取消后工单算什么”；本轮的恢复上限按“已经连续重启了几次且没有报告”判断，有明确的行为证据，并且完全复用既有的 `failed` 和 Retry 路径。两者不重复，也不互相替代；看门狗可以在后续轮次单独做。

**为什么不是 token 账本**：它需要新增面板/卡片展示或至少一个新的可见面，而本轮的验收重点是“恢复循环 + 安装重载”，不适合把 UI 证据和部署验证混在一起。账本已记录在后续候选里。

## 3. 外部依据

| # | 主题 | 外部结论 | 用在本改动哪里 |
| --- | --- | --- | --- |
| 1 | 恢复必须有总预算 | Temporal 把每次尝试的 Start-To-Close 与跨重试的 Schedule-To-Close 分开：总预算到点就停止重试，而不是让每次尝试各自重试到天荒地老（[Timers, timeouts, and the art of waiting in Temporal](https://temporal.io/blog/timers-timeouts-and-the-art-of-waiting-in-temporal)） | 用 `MAX_RECOVERIES` 给“宿主重启恢复”一个总次数，而不是每次重启都独立决定 |
| 2 | 自动恢复应在失败后交给人 | OpenAI 的持久执行/幂等实践强调：恢复要有稳定的键和边界，不能把副作用无限重放（[Idempotency and durable execution](https://temporal.io/blog/idempotency-and-durable-execution)） | 失败升级为既有 `failed` 报告，Retry 由人触发；不自动再开新 Assignment |
| 3 | 循环要有显式上界 | OpenAI Agents SDK 默认 `max_turns=10`，超出抛 `MaxTurnsExceeded`（[Running agents](https://openai.github.io/openai-agents-python/running_agents)）；Claude Agent SDK 把 `error_max_turns` / `error_max_budget_usd` 当作可恢复的暂停点（[How the agent loop works](https://platform.claude.com/docs/en/agent-sdk/agent-loop)） | 本改动是同一思想在“宿主重启”这一维度的实现：有界、可见、可恢复 |
| 4 | 反复失败应进入退避/停止 | Kubernetes 的 CrashLoopBackOff 对反复崩溃的容器做指数退避并最终停止重启，让人看到问题（[CrashLoopBackOff](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)） | 连续重启到上限后不再自动重启，把问题交给面板上的人 |
| 5 | 恢复的状态要能被人看见 | 生产 harness 强调把失败和恢复做成可查询的状态，而不是只留在日志里（[OpenTelemetry GenAI observability](https://opentelemetry.io/blog/2026/genai-observability)） | `failed` 报告进入 Ticket、面板与主 Session 中继；计数清零规则可预期 |

这些来源解释的是“为什么这样设计”，不是对本仓库的测量。这个仓库没有宿主重启频率的埋点，所以本改动不声称一个具体的节省比例。

## 4. 现状诊断

### 4.1 代码路径

- `src/executor/dsh.ts` 的 `resume()` 在每次插件启动时遍历 open Ticket；对 `runningAssignment` 调用 `assignmentInterrupted`。
- `src/core/assignments.ts` 的 `interrupted()` 只要发现 Assignment 不是 `waiting/ready/blocked/failed`（或报告之后又有 Input），就调用 `Tickets.restart`：结束旧 Assignment、创建新 Assignment、往 `inputs` 推一条 recovery note，并 `executor.start`。
- `src/core/model.ts` 的 `Ticket` 没有恢复次数；`Assignment` 也没有。于是每次重启都从零开始，没有上限。
- 重启是常规运维动作：`docs/006-deployment.md` 的升级、保存配置后的重启、HMR 重载、监控自动恢复都会走到 `resume()`。这不是一个只在崩溃时才会出现的边缘路径。

### 4.2 为什么现在值得改

一个反复重启的宿主，代价是双重的：每次重启都丢掉正在进行的 turn，烧 token、占 worker slot；worker 还没机会报告，所以面板上一直是 `working`，`canRetry` 也为假，人看不出该不该介入。现有失败分类、prepare 重试、瞬时 turn 重试都处理了“一次失败之后怎么办”，但没有处理“同一张工单被反复重启”的情况。这个缺口不需要新的数据表、新的产品设置或新的交互，适合作为一轮小而完整的 harness 改进。

### 4.3 与既有机制的关系

- **不替代瞬时重试**：`transient()` / `classifyFailure` 处理模型或网络的单次失败；本改动处理宿主重启这一维度，两者计数独立。
- **不替代 worker 报告**：worker 仍然负责 `progress` / `ready` / `blocked` / `failed`；本改动只在没有报告时把无限循环截断。
- **不改变授权**：没有动 Policy、Mandate、admission、permission preset 或任何部署账户设置；失败工单仍然需要人 Retry。
- **不改变面板**：`failed` 是既有阶段，面板已有 Retry 按钮；本轮没有 UI 改动。

## 5. 方案

### 5.1 行为

1. **计数**：`Ticket.recoveries` 是可选整数；第一次“无报告的宿主重启”把它设为 1，之后累加。
2. **计数清零**：worker 的任何 `orchestrator_report`（包括 `progress`）、人的 Retry、以及被人的消息恢复的工单，都删除这个字段。新工单没有该字段。
3. **上限**：`MAX_RECOVERIES = 3`。第 1 到第 3 次仍按原逻辑 `restart`；第 4 次 `count > MAX_RECOVERIES` 时：
   - 先在 Assignment 仍为 running 时记录一条 `failed` 报告，摘要写明“连续重启了 N 次、没有 worker 报告，因此不再自动重启；检查宿主为什么重启后 Retry”。这与普通的 `failed` 报告一致：Assignment 仍保持 running，人可以直接给它发消息继续，也可以用 Retry 换一个新的 Assignment；不会为这次重启创建新 Assignment。
4. **中继**：`Assignments.interrupted` 返回失败后的 Ticket；`DshExecutor.resume()` 用既有的 `resultRelay` 把这条 `failed` 报告中继给主 Session。这样主 Session 不必轮询面板。
5. **已结束/等待的 Assignment 不变**：`waiting/ready/blocked/failed` 且报告后没有新 Input 的，仍保持原逻辑；只有“忙”的 Assignment 才计数。
6. **没有 schema 迁移**：Ticket 是 JSON 列；新增可选字段不需要 `SCHEMA_VERSION` 变化，旧行照常读取。

### 5.2 为什么在 core 里做

- 计数的判决需要看 Ticket 的 Assignment 报告与 `deliveredAt`；这些是 core 的领域状态，放在 `Assignments` 里能用现有的 `running()`/`settled` 规则，不需要 Executor 复制一套。
- 失败升级要写 `failed` 报告；这是 core 的现有命令（`Assignments.report`），不需要新的状态或写者，也不结束 Assignment。
- Executor 只负责它本来就会做的两件事：在 `resume` 时报告 interrupted，以及把 `failed` 中继给主 Session。

### 5.3 边界与取舍

| 边界 | 行为 | 理由 |
| --- | --- | --- |
| 计数什么时候开始 | 第一次 `interrupted` 且未 settled | 只有真正需要恢复的 Assignment 才消耗预算 |
| 报告后立刻又重启 | 计数从 1 开始 | 报告是进展，应该给新的预算 |
| 人的 Retry | 清零 | 人已经介入，应该重新获得自动恢复的余量 |
| 人的消息恢复已结束工单 | 清零 | 同上；恢复的工单是新尝试 |
| 第 4 次失败后宿主再重启 | 不再计数/重启（最新报告已是 failed，且报告后没有新 Input） | 失败工单等待人的消息或 Retry，不自动恢复 |
| 并发/事务 | `Engine.assignmentInterrupted` 仍在一个 `repo.atomic` 中 | “写 failed 报告 + 删除计数”要么都发生，要么都不发生 |
| 错误文案 | 英文，与其他报告一致；包含次数与 Retry 指引 | 主 Session、面板和 IM 都按同一段文字工作 |

## 6. 验证

新增或更新：

- `tests/core-engine.spec.ts` 的 `interrupted assignments`：
  - 连续 3 次中断后，第 4 次返回失败的 Ticket；最新报告为 `failed` 且含次数，Assignment 仍为 running（与普通 failed 一致，人的消息可继续它）；`ticketStage` 是 `person/failed`，`canRetry` 为真；`executor.start` 只在前 3 次被调用。
  - 中途来一条 `progress` 报告后计数清零，下一次中断从 1 开始。
- `tests/runtime.spec.ts`：
  - 连续 3 次 `DshExecutor.resume()` 后第 4 次不再启动新 Assignment；`failed` 报告被中继到主 Session，摘要含次数。
- 全套 `pnpm test`、`pnpm check`（含覆盖率门禁与 build）、`pnpm verify:install`。

本机结果（2026-11-24）：

- `pnpm check`：exit 0；1,259 passed / 42 skipped（64 个测试文件通过，POSIX-only 的 service-script 跳过）；覆盖率 93.13% statements、85.68% branches、93.08% functions、96.22% lines；`lib/index.js` 468.58 kB。
- 覆盖率门禁保持 `vitest.config.ts` 的 92 / 84 / 92 / 95 不变；本轮不为了棘轮数字让另一平台变红。
- `pnpm verify:install`：link 安装到一次性 profile 并启动面板，13/13 项检查通过；receipt 在 `.artifacts/install-verification.json`。

未验证：没有在真实宿主上反复制造重启来测量节省的 token 或 slot 时间；测试用内存仓库和 fake host 证明行为，不证明线上频率。

## 7. 风险与限制

- **阈值是经验值。** `MAX_RECOVERIES = 3` 允许三次自动恢复，足够覆盖一次正常的配置保存/重载；如果团队的重启更频繁，可以后续把它提成设置（另开变更，不在本轮）。
- **报告清零意味着“卡住但还在报告 progress”的工单不受此上限保护。** 这是有意的：报告是进展；真正长期无进展的 worker 由后续的静默看门狗处理。
- **失败会打断一张本可恢复的工单。** 但人一键 Retry 即可，且失败报告写明了原因与次数；这比无限重启、静默烧钱更可审计。
- **只覆盖宿主重启。** 进程内重复失败、工具循环、provider 挂起分别由已有的失败分类、重复调用守卫和后续看门狗覆盖。
- **没有 UI 改动。** `recoveries` 字段不展示在面板；失败报告与 Retry 走既有阶段。若后续要把次数做成可读字段，另开变更。
- **旧数据库。** 旧 Ticket 没有 `recoveries`，按 0 处理；没有迁移风险。

## 8. 落地

PR 合并后，把部署的 `link:` 检出更新到 `main` 的新提交，执行 `pnpm install --frozen-lockfile && pnpm build`，再按部署文档重载插件。无需数据库迁移或设置变更；已有的 worker Session 在下一次回合开始时使用新的恢复逻辑。部署前记录当前 SHA，构建或面板检查失败时回退到该 SHA。
