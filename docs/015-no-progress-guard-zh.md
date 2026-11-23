# 015 最高性价比改进：执行器的无进展循环提醒

> **语言说明.** 本仓库其余文档用英文；这一篇用中文，因为这次改进是应中文团队的要求做的联网调研，结论需要让提出需求的人直接读懂。第 5 节是落地方案，其余各节是候选比较、外部依据、现状诊断与取舍记录。

## 1. 结论

本鱼选的是**执行器工具调用的“无进展循环提醒”（no-progress guard）**，而不是再改一版提示词、增加一个设置项或引入一个需要产品决定的新超时。

一句话：**在 worker（以及它的 subagent）Session 的 `session/event` 上观察 `tool/call` 与 `tool/result`；当同一个调用在跨步骤的最近 10 次调用里重复 5 次，或同一个调用连续 3 次返回相同结果时，向该 Session steer 一条“你在原地打转”的提醒，要求它换方法或报告 blocked。提醒只发一次（每个调用签名每轮一次，每轮最多 3 条），不拒绝调用、不改授权、不替 worker 写报告。**

这个改动的性价比最高，因为：

- **它直接止损最贵的失败模式。** 一个卡住的 worker 会持续消耗模型 token，占着 worker slot，工单一直显示 working；目前唯一的时间边界是“回合结束后后台工作 30 分钟”，它管不到模型回合内的工具循环。一条提醒不能保证模型立刻脱困，但能在第 3 到第 5 次重复时把“继续烧 token”变成“换方法或交给人”。
- **它复用已有的接缝，不新增状态机。** `Sessions` 已经在观察 `session/event`（`RetryHealth` 就是先例），事件里已有完整的工具名、参数和结果；检测器是纯函数式内存状态，不需要 schema、迁移、设置项、面板或提示词改动。
- **它的默认行为足够保守。** 只提醒，不硬停；只统计“模型已经看过上一次结果”的重复；同一批并行发出的相同调用只算一次；跨步骤编辑/测试交替不算循环。误报的代价是一句话，不是一张失败工单。
- **它可验证、可回滚。** 纯检测器可以用合成事件精确断言；集成路径可以走现有的 fake DSH host；合并后不需要部署迁移。

改动规模：新增 `src/executor/repetition.ts`（约 170 行，含注释），`src/app/sessions.ts` 约 20 行，测试约 190 行，文档若干。没有 schema、Settings、Prompt 或部署安全设置的变化。

## 2. 候选比较

评分只看四件事：对“少占用人的注意力、把工作送到 PR”的影响、发生频率、爆炸半径、验证成本。分数是相对判断，不是测量值。

| 候选 | 价值 | 频率 | 风险 / 成本 | 结论 |
| --- | --- | --- | --- | --- |
| **执行器的无进展循环提醒** | 高：停止工具循环的 token 与 slot 消耗 | 中：长任务、失败测试、网络抖动时常见 | 低：只提醒；事件已存在；无新设置 | **选中** |
| 工作回合的看门狗（长时间无事件即超时） | 高：防止槽位被永久占用 | 低到中：provider 挂起时 | 中高：需要产品决定“超时后是失败、重试还是交给人”，还要新设置与迁移 | 另开变更；[012](012-prepare-retry-zh.md) 已记录同样的取舍 |
| 每张工单的 token 预算 | 高：防跑飞 | 未知 | 中高：需要从 host 读用量、定义超限行为、改面板 | 另开变更 |
| 领域记录保留/归档（GAP-04） | 中：数据库长期增长 | 随时间上升 | 中：保留窗口是产品决定，需要 schema 迁移 | 已被策略决定阻塞 |
| 小写 cookie 头的脱敏（GAP-05） | 低到中：安全边界 | 低 | 低 | 可做，但救不回工单；单独处理 |
| 上下文压缩 / 工具结果外置 | 高：直接降 token | 高 | 高：DSH host 已拥有压缩与转录；bundle 再做一套会双重压缩 | 不做，host 所有 |
| 每轮重试加抖动 | 低到中：多工单同时重试时有用 | 低 | 低 | 单进程、低并发、无同步风暴；收益不足，本轮不做 |
| 把工具轨迹做成面板时间线 | 中：更好排查 | 中 | 中高：面板与截图证据；改动面大于本工单 | 另开变更 |

**为什么不是上一轮已记录的“工作回合看门狗”**：看门狗按“多久没有事件”判断，必须回答“超时后工单算什么状态”，这是产品决定；循环提醒按“同一次调用重复出现”判断，有明确的行为证据，且只发提醒，不改变工单状态。两者不重复，也不互相替代。

## 3. 外部依据

| # | 主题 | 外部结论 | 用在本改动哪里 |
| --- | --- | --- | --- |
| 1 | 重复调用的判定 | pydantic-ai 的 `DetectLoops` 把循环分为 `repeated_call`（同名同参在最近 10 次调用里出现 5 次）、`repeated_result`（同一调用在最近若干次里返回同一结果 3 次）、`alternating_calls` 和 `repeated_text`；它默认只加一条系统提示，让模型知道自己在循环，而不是直接终止（[DetectLoops README](https://raw.githubusercontent.com/pydantic/pydantic-ai/25b102d126b307135e21499ea66f1f77d652b423/src/pydantic_ai_harness/detect_loops/README.md)） | 采用它的两个阈值（5 次同名同参、3 次同结果）和“只提醒”的默认强度 |
| 2 | 结果要先被模型看到 | OpenRouter 的 doom-loop 检测规定：重复只在“模型看到了上一次结果、又做了同样的事”时计数；同一轮并行发出的五个相同调用只算一次；可用 `loopKey` 处理每次参数都变的循环（[Doom-Loop Detection](https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection)） | 检测器只在“较早步骤的同一调用已有结果”时计数，并把同一步的并行调用只算一次 |
| 3 | 无进展是运行时控制 | 微软的 governed context-aware agent harness 把“无界重试、同一失败工具的循环”列为模型本身不可靠的典型失败，并把 tool-call ceiling 与 no-progress stop 放在运行时闸门，而不是提示词里（[Architecture](https://github.com/microsoft/agenticai-design-patterns/blob/main/assets/orchestration-and-workflows/governed-context-aware-agent-harness/docs/architecture.md)） | 把检测放在 `Sessions` 的运行时事件层，而不是再写一段“请不要重复”的提示词 |
| 4 | 观测循环本身 | 生产 harness 的实践强调“先给每一步发结构化事件，再做评估与修复”；只看最终回答无法定位是第几步跑偏（[TrueFoundry](https://truefoundry.com/blog/agent-harness-best-practices)、[Arize](https://arize.com/blog/improve-ai-agents-traces-evals-harness)） | 复用 DSH 已有的 `tool/call` / `tool/result` 事件；不新建一套并行日志 |
| 5 | 评估要分步 | Anthropic 的 agent eval 指南把单步（run）、整轮（trace）、多轮（thread）分开；轨迹评估不应僵化地要求固定工具顺序，而应看结果与关键决策（[Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)） | 检测器只判断“同一调用是否重复”，不规定工具顺序；编辑/测试交替不被误判 |
| 6 | 先小步、可回滚 | 生产 agent 的失败更多来自 harness 的恢复机制，而不是提示词；小批量、可回滚、带自动闸门的交付更容易评审（[Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)） | 不新增设置与迁移；改动集中在事件观察与一个纯检测器 |
| 7 | 循环的终止权 | 更强的 `stop` 会结束回合或运行，但需要定义“停下后由谁接手”；默认的 `steer` 只提醒，把决定权留给 worker 的 `orchestrator_report`（[OpenRouter](https://openrouter.ai/docs/agent-sdk/call-model/doom-loop-detection)） | 本轮只做 `steer`；硬停另开变更，需要产品决定 |

这些来源解释的是“为什么这样设计”，不是对本仓库的测量。这个仓库没有工具循环频率或 token 节省的埋点，所以本改动不声称一个具体的成本下降比例。

## 4. 现状诊断

### 4.1 代码路径

- `src/app/sessions.ts` 的 `install()` 已经订阅 `session/event`，把事件交给 `RetryHealth`，用于 `models` 健康项；这条事件流同时携带 `turn/start`、`tool/call`、`tool/result`。
- `src/executor/dsh.ts` 管理 worker 的生命周期、slot、prepare、后台工作与失败重试；它没有按模型步数或工具调用数的上限。`BACKGROUND_LIMIT_MS` 只约束“回合结束之后”仍在跑的后台工作，不约束回合内的工具循环。
- DSH 的 worker preset 提供 compaction 与 tool-result pruning，但没有“重复调用/无进展”的检测；`@deepseek-ai/dsh-agent`、`dsh-session`、`dsh-tools` 中没有 `maxSteps` / `maxTurns` 一类配置（本轮在依赖源码中核对过）。
- `src/core` 没有可以复用的循环状态；`RetryHealth` 只投影模型预算重试，不记录工具调用。

### 4.2 为什么现在值得改

一个卡住的 worker 的代价是双重的：token 持续消耗，slot 被占住，新的工单只能排队；而面板上它仍显示 working，人看不出是“在思考”还是“在打转”。现有失败分类、prepare 重试、后台工作限制都处理了“失败后怎么办”，但没有处理“没有失败、只是一直重复”的情况。这个缺口不需要新的数据表或新的产品决策，适合作为一轮小而完整的 harness 改进。

### 4.3 与既有机制的关系

- **不替代 `RetryHealth`**：后者观察模型预算重试，前者观察工具调用；两者都只读事件，互不修改。
- **不替代 worker 的 `orchestrator_report`**：提醒不写工单状态，worker 仍然负责报告 `progress` / `blocked` / `failed`。
- **不改变授权**：提醒不扩大 scope、不接新请求、不改变 Policy 或 blocked commands。

## 5. 方案

### 5.1 行为

1. **观察对象**：worker Session 与它的 subagent Session（`binding.subagent` 的 Session 也跟踪）；主 Session 不跟踪，因为它的工具是只读的，且它的工作由候选数量而不是工具循环决定。
2. **事件**：只读 `turn/start`、`tool/call`、`tool/result`；其他事件原样忽略。
3. **窗口**：最近 10 次工具调用；更早的调用离开窗口后不再计数。
4. **重复结果**：同一个调用（工具名 + 规范化参数）在**不同步骤**返回相同结果（模型可见内容 + 错误标记 + 错误码），达到 3 次时提醒。只统计“较早步骤的同一调用已有结果”的重复；同一步并行发出的相同调用只算一次。
5. **重复调用**：同一个调用在**不同步骤**出现，达到 5 次时提醒，即使结果不同；这是“轮询/重试但没有进展”的信号。
6. **提醒**：通过 `Sessions.prompt(..., 'steer')` 向该 Session 发一条短消息，点名工具，要求换方法，或在无法继续时报告 `blocked` / `progress`；消息里不出现参数或结果内容。每个调用签名每轮最多一条；每轮最多 3 条。
7. **回合边界**：`turn/start` 清空窗口与提醒预算；Session 被释放时删除检测器；进程重启后检测器从空开始。
8. **不硬停**：不拒绝调用、不取消回合、不写 Report、不改 Ticket 状态。模型忽略提醒的代价仍然存在，但人可以在 Session 里看到提醒并接手；硬停需要另开变更并定义接手语义。

### 5.2 为什么用 `session/event`，而不是 `tools.guard`

- `tools.guard` 在调用**之前**运行，只能看到参数，看不到结果；它适合“拒绝一次调用”，但不适合判断“结果一直没有变化”。
- `session/event` 同时携带调用与结果，且 `Sessions` 已经在消费它；检测器可以作为纯函数单测，不需要改造 DSH 的 tools 服务。
- 提醒走 `prompt`，与现有的 relay/notice 交付路径一致，天然按 request id 去重；不会把提醒误记成人的消息或工单 Input。

### 5.3 阈值与边界

| 参数 | 值 | 理由 |
| --- | --- | --- |
| 窗口 | 10 次调用 | 与 pydantic-ai 的默认窗口一致；足够覆盖一次“读-改-跑”的小循环 |
| 同结果 | 3 次 | 同一调用的最近三次结果都相同，几乎不可能还是在取得进展；比“同调用 5 次”更早 |
| 同调用 | 5 次 | 给轮询、重试和正常重复检查留出余量；不同结果时也能识别“参数没变”的循环 |
| 每轮提醒上限 | 3 条 | 防止一个模型在多个工具上同时打转时刷屏；也避免提醒本身变成新的噪声 |
| 计入条件 | 跨步骤且上次结果已被看到 | 并行批次不能看到彼此的结果，不应算重复；这也是 OpenRouter 的规则 |

### 5.4 与最佳实践的对应

| 实践 | 本改动 |
| --- | --- |
| 检测重复调用/重复结果 | 窗口 + 两个阈值；规范化 JSON，忽略对象键顺序 |
| 只在模型看到结果后计数 | 只统计较早步骤中已有结果的调用；同一步并行批次只算一次 |
| 先提醒、后硬停 | 只 `steer`；不拒绝、不取消、不写报告 |
| 有界 | 每轮最多 3 条；窗口固定 10；提醒按签名去重 |
| 不误伤正常交替 | 不检测“编辑-测试-编辑”交替；只检测同一调用或同一结果 |
| 可观测 | 提醒进入 worker Session 的历史；人可以在 Session 里看到 |
| 不新增产品决定 | 无设置、无 schema、无迁移、无面板、无提示词改动 |

## 6. 验证

新增或更新：

- `tests/repetition.spec.ts`：纯检测器的 15 个用例，包括同结果第 3 次提醒、同调用第 5 次提醒、同一步并行批次不算、对象键顺序、非法 JSON 参数、结果键顺序、错误/成功结果区分、被不同结果打断的重复不算、每轮每签名一次、跨回合重置、每轮上限、窗口淘汰、未知 callId、工具名安全化。
- `tests/runtime.spec.ts`：在 fake DSH host 上接受一张工单，向 worker Session 发三组相同的 `tool/call` / `tool/result`，断言收到一条 `steer` 的“No progress”消息；同一回合继续重复不再发第二条；新回合重新发一条并带新的消息 id。
- `pnpm typecheck`、`pnpm test`、`pnpm check`（含覆盖率门禁与 build）。
- `pnpm verify:install -- --dsh <path>`：link 安装到一次性 profile 并启动面板。

本机结果：`pnpm check` 退出 0，1,256 passed / 42 skipped，覆盖率 93.11% statements、85.66% branches、93.08% functions、96.22% lines；`pnpm verify:install` 退出 0，13/13 项检查通过。覆盖率门禁保持 `vitest.config.ts` 的 92/84/92/95 不变：本机数字高于门槛，而 POSIX CI 会执行另一组平台分支，现有注释说明的余量是有意的；本轮不上调阈值，避免为了棘轮数字让另一平台变红。

未验证：没有在真实的长任务上注入循环，也没有测量循环频率或 token 节省；测试用合成事件证明行为，不证明线上频率。

## 7. 风险与限制

- **只提醒，不硬停。** 一个坚持重复的模型仍会消耗 token；本改动把“完全无人知晓的循环”变成“Session 里可见的提醒”，但没有改变回合的终止权。硬停需要定义“停下后工单算什么状态”，另开变更。
- **精确匹配会漏掉变体。** 每次参数都变的循环（例如带时间戳的命令）不会命中同调用；结果也变时不会命中同结果。可以用 per-tool 的规范化键扩展，但那需要逐工具设计，本轮不做。
- **轮询是常见的误报来源。** 同一个 `job_output` 多次返回相同输出会触发同结果提醒；消息会建议模型等待任务结束或换方法。阈值取 3 次，且每轮每签名只提醒一次，避免刷屏。
- **检测器是内存状态。** 进程重启后窗口清空；这与 Session 的恢复语义一致，不需要迁移。
- **subagent 的提醒只进入 subagent Session。** 父 worker 看到的是 subagent 的结果；如果 subagent 被提醒后仍不收敛，父 worker 仍然负责最终报告。
- **主 Session 不跟踪。** 它的工具是只读的，且它的回合由候选数量驱动；如果未来主 Session 也出现昂贵循环，可以复用同一个检测器，另开变更。
- **覆盖率**：新增模块与集成路径都有用例；如果覆盖率门禁提示，再补边界用例，不降低阈值。

## 8. 落地

PR 合并后，把部署的 `link:` 检出更新到 `main` 的新提交，执行 `pnpm install --frozen-lockfile && pnpm build`，再按部署文档重载插件。无需数据库迁移或设置变更；已有的 worker Session 在下一次回合开始时就会使用新的提醒逻辑。部署前记录当前 SHA，构建或面板检查失败时回退到该 SHA。
