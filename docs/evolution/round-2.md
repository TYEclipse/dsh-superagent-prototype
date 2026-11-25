# 第 2 轮：让每张工单的 token 用量可见

> **本文件由自动化代理撰写，不是人类。**

- **日期：** 2026-11-25（Asia/Shanghai）
- **分支：** `agent/self-evolve-single-9efbb381146d`
- **起点：** `main` `4316a85`（v0.2.2，第 1 轮合并与发版之后）
- **状态：** 实现与本地闸门已通过；PR、合并、release 与部署重载见 §8。

## 1. 结论

本轮补上**每张工单的 token 用量台账**：Executor 把 host 在每个 `assistant/message` 上报告的 token 用量，按 Session 事件序列幂等地累加到该工单，面板在工单行、状态行和「Token 用量」折叠区显示输入、输出、缓存读、缓存写、推理与模型步数。

它是当前最大短板，因为本仓库已经记录了触发、决策、报告、重试、健康和覆盖率，却**没有记录自己花掉的资源**：一个工单跑了多少 token、某个 worker 是否突然跑飞、两轮进化之间的成本差异，操作者都答不上来。第 1 轮把「每张工单的 token / 费用账本」列为候选，因「需要 host 用量来源与面板/卡片展示」而推迟；本轮确认 DSH 的 `assistant/message` 事件已经携带 `usage`，并且本轮有 UI 证据预算，所以这个阻塞已经消失。

本轮没有改授权、Policy、Mandate、admission、permission preset、部署账户或密钥设置；台账只读，不设预算、不停止、不重试。

## 2. 调研

调研问题：在「一个长时间运行、按工单派活的 coding agent harness」里，哪些可观测性机制最能把成本变成可行动的信息，而不是再增加一块没人看的仪表盘？

查询（2026-11-25）：`AI agent observability token usage per task 2026`、`agent cost attribution code review harness`、`proactive agent alert fatigue cost budget`、`harness engineering feedback loop token cost`。

| # | 来源 | 结论 | 用在本轮哪里 |
| --- | --- | --- | --- |
| 1 | [JetBrains：AI Agent Observability for Software Engineering Teams](https://jetbrains.com/pages/ai-agent-observability-software-engineering-teams-complete-guide)（2026） | 可观测性要把 agent 活动翻译成成本：token 数、按团队/工作流/agent 类型的归属、任务完成率、接受率、每任务成本、错误与重试、人工推翻率；有了基线后才能对「某 agent 突然用了三倍 token」告警 | 决定按**工单**归属，而不是只给全局总数；先做可见的台账，异常告警留到有基线之后 |
| 2 | [AWS：Observability patterns for AI agents on Amazon EKS](https://aws.amazon.com/blogs/containers/observability-patterns-for-ai-agents-on-amazon-eks)（2026-10-21） | LLM 调用轨迹要记录模型、token、成本与延迟；工具调用要记录输入输出与成败；成本要能按 agent/请求归属，并可在预算阈值上告警 | 用 host 已有的 step 级 `usage` 和 Session id 做归属；不新建一套并行日志 |
| 3 | [Thoughtworks：Engineering the harness](https://thoughtworks.com/insights/blog/architecture/engineering-the-harness-a-practical-pattern-for-reliable-coding-agents)（2026） | 可靠的 harness 由 guides（行动前约束）、sensors（行动后验证）和少量高爆炸半径的人工闸门组成；把机械可纠正的失败自动回送，减少人的 review 负担 | 把 token 用量放在现有工单表面上，属于「事后 sensor」；不把它变成新的人工审批点 |
| 4 | [Martin Fowler：Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html)（2026） | 好的外层 harness 同时提高一次做对的概率，并在到达人之前自我纠正；目标是减少 review 负担，也减少浪费的 token | 为什么成本可见性应和工单结果放在一起，而不是单独的成本页 |
| 5 | [hermes-agent：turn liveness watchdog](https://github.com/NousResearch/hermes-agent/blob/45df75e262b243d92cd836c84e442f223d59daf7/agent/turn_liveness.py)（2026） | 一个回合可以在「模型已返回工具调用、工具尚未执行」之间静默卡住，租约仍在续期；watchdog 用真实进度时钟判定停滞，再中断并停止续租 | 本轮**未选**的候选；它说明「静默停滞」是真实存在的失败模式，但超时后的行为仍需产品决定 |
| 6 | 第 1 轮记录：[Trustworthy Recursive Self-Improvement](https://arxiv.org/html/2610.35193)、[Continual Evolution](https://arxiv.org/html/2611.03219)、[Evaluation-Free RSI](https://arxiv.org/abs/2611.21056) | 递归自我改进需要独立证据、约束保持和保留条件；没有任务级评测时，至少要有结构与运行有效性 | 本轮把「资源消耗」加入每轮可对账的事实；仍然不声称能力提升 |

这些来源能证明「成本归属和异常检测是生产级 agent 的常见要求」，**不能**证明本仓库某张工单应该花多少 token，也不能证明加上显示后成本会下降。本仓库没有任务级成功率、token 预算或长周期成本数据；本轮只提供可复现的台账与展示，不给出改进百分比。

## 3. 候选比较

评分只看四件事：对「少占用人的注意力、把工作送到可验证 PR」的价值、发生频率、爆炸半径、验证成本。分数是相对判断，不是测量值。

| 候选 | 价值 | 频率 / 风险 | 结论 |
| --- | --- | --- | --- |
| **每张工单的 token 用量台账 + 面板显示** | 高：每个工单、每一轮都能回答「花了多少、花在哪」；为后续预算/异常检测提供基线 | 每张工单都用；风险低：只读、无 schema 迁移、不改授权 | **选中** |
| 工作回合的静默停滞 watchdog | 高：防止一个卡住的 turn 永久占住 slot | 低到中；需要先决定「停滞多久、中断后工单算什么、是否自动重试」，属于产品决定 | 未选；[015](../015-no-progress-guard-zh.md) 与第 1 轮已记录同样的取舍，保留为下一轮候选 |
| GAP-05：小写 cookie 头的脱敏 | 低到中：安全边界的最后一种形状 | 低；改动小，但救不回工单，也不是当前最大的资源盲区 | 未选；仍留在 [gap-backlog](../benchmark/gap-backlog.md) |
| 领域记录保留/归档（GAP-04） | 中：数据库长期增长 | 随时间上升；保留窗口是产品决定，需要 schema 迁移 | 仍被策略决定阻塞 |
| 任务级评测 / golden corpus | 最高长期价值：能回答「这一轮是否真的更好」 | 需要语料、基线、模型调用预算和判定标准；一轮内做不完整 | 不做；本轮的成本台账是它的前置观测层 |
| 部署/重载自动化脚本 | 中高：减少每一轮的机械操作 | 每次发版一次；脚本依赖具体 profile 路径，跨环境不可移植 | 不做；继续用文档步骤与本轮的实际重载验证 |

**为什么不是 watchdog**：它的价值高，但「静默多久算停滞」「中断后是 failed、waiting 还是 retry」都是产品决定；在原始请求没有给出答案时，按 scope 规则应停下而不是替人决定。token 台账没有这个问题：它不改变工单状态，只把 host 已经报告的事实放到面板上。**为什么不是 GAP-05**：它是一条真实的边界，但只影响一种罕见的 stderr 形状，且不改变操作者对工单的注意力分配；在「最大短板」的比较里排在后面。

## 4. 现状诊断

### 4.1 事件流已经存在，但只被用于重试与循环

`src/app/sessions.ts:135-145` 订阅 `session/event`，把事件交给 `RetryHealth` 和 `Repetition`；`src/app/sessions.ts:164-174` 只处理 `turn/start`、`tool/call`、`tool/result`。host 的 `assistant/message` 事件携带 `usage`（`@deepseek-ai/dsh-session` 的 `SessionEventMap`，字段来自 `@deepseek-ai/dsh-llm` 的 `TokenUsage`：`inputTokens`、`outputTokens`、`totalTokens?`、`cacheReadTokens?`、`cacheWriteTokens?`、`reasoningTokens?`），但本仓库从未读取它。

### 4.2 面板没有成本的落点

工单行只显示线程、未送达、备注和时间（`src/client/rows.tsx:23-29`）；工单页的状态行只有授权、发起、更新（`src/client/ticket.tsx:137-143`）；详情折叠区有执行环境、渠道、输入和标识，没有 token。`docs/007-architecture.md` 的持久化清单也没有任何用量记录。

### 4.3 前两轮已经把它列为候选，但被两个前提挡住

- [015](../015-no-progress-guard-zh.md) 的候选表把「每张工单的 token 预算」列为「需要从 host 读用量、定义超限行为、改面板」。
- [第 1 轮](round-1.md) §3 把「每张工单的 token / 费用账本」列为「需要 host 用量来源与面板/卡片展示，本轮没有 UI 证据预算」。

本轮确认：host 用量来源存在（`assistant/message.usage`），UI 证据预算可用（本地桌面面板 + 前后截图），所以可以先做**只读台账**，把「超限行为」留给以后的产品决定。

### 4.4 为什么现在值得改

这个系统已经连续运行了多轮自进化，当前数据库里有 33 张工单、17 张以 merged 结束、14 张以 completed 结束；每张工单都可能包含多次模型步进和 subagent。没有按工单的用量，操作者只能看到「花了多少钱」的全局账单，无法回答「哪张工单最贵」「这轮比上轮贵还是便宜」「某个 worker 是不是突然跑飞」。这正好是「少占用人的注意力」的反面：人要么不看，要么去翻 transcript。

## 5. 方案

### 5.1 记录

新增 `src/app/usage.ts`：

- `addUsage(previous, event)` 是纯函数。它接收 `{ session, seq, time, usage }`，把非负整数计数累加；`totalTokens` 缺失时用 `inputTokens + outputTokens` 派生，报告了就使用报告值（避免把输入输出再加一遍）。
- 每个 Session 的最后一个已计数 `seq` 存在记录里；同一 `seq` 或更旧的 `seq` 直接忽略，所以重放、重复投递或 host 恢复都不会重复计数。
- 全零的 usage 不生成记录，也不增加 `steps`；适配器没有报告用量时，工单保持「没有这个数字」，而不是显示 0。
- `usageTotals` 去掉内部的 `sequences` 映射，返回面板需要的展示形状；`ticketUsage(store, ticketId)` 从 `KV.usage.ticket(id)` 读取。

`Sessions` 在 `session/event` 上只处理 `assistant/message`，并且只处理绑定了 Ticket 的 worker 或 subagent Session（`SessionBinding.ticketId`）。主 Session 的路由调用不属于任何一张工单，不计数。

### 5.2 展示

`ticketLine` 把 `ticketUsage` 并入工单行与工单详情；工单行显示一个紧凑的 Token 用量 chip，悬停显示输入/输出/缓存/步数；工单页状态行显示同一个数字，详情折叠区显示完整分解（输入、输出、合计、缓存读、缓存写、推理、模型步数、更新时间）。中英文 locales 同步增加。

### 5.3 边界

- **只读。** 台账不设预算、不暂停、不失败、不重试；它不进入 prompt、Policy、Mandate 或 admission。
- **不做 schema 迁移。** 记录放在现有 `kv` 表；`KV.usage.ticket` 是唯一拼写点。
- **不回溯。** 只有本版本加载之后发生的 step 才计数；历史 transcript 不扫描、不回填。
- **不声称计费。** 缓存读/写和推理 token 是 host 报告的子集字段；本仓库没有价格表，因此只显示 token，不折算金额。
- **不替代 host 的全局成本工具。** 它回答「哪张工单」，不回答「这个进程总共花了多少」。

### 5.4 为什么放在这一层

host 已经按 step 报告 usage，`Sessions` 已经是唯一消费 `session/event` 的层，并且已经知道 Session 到 Ticket 的绑定（worker 与 subagent）；在它旁边加一个纯累加器，不需要新依赖、新表或新设置。放在 `src/app` 而不是 `src/core`，因为这是操作者观测，不是领域规则。

## 6. 验证

本机（Windows 11，Node 24.13.0，pnpm 11.7.0，DSH 0.2.2-rc.1）：

- 新增 `tests/usage.spec.ts`：6 个用例，覆盖首个 step、跨 Session 累加、缺失/报告 total、重复与更旧 seq、全零与非法计数、展示形状与 Store 读取。
- `tests/runtime.spec.ts` 的新用例：在真实 Runtime 的假 host 上向 worker 发两条 `assistant/message`（其中一条重复），断言 `GET tickets/:id` 与 `GET tickets?state=open` 的 `usage` 是 `150/30/180`、`steps: 2`，重复事件不重复计数。
- `tests/views.spec.ts`：工单行与详情在有记录时带上 usage，没有记录时不带。
- `tests/panel-execution.spec.tsx`：工单行、状态行和折叠区显示 token 用量与分解。
- `tests/docs.spec.ts`：新模块与新测试已列入 007 的表。
- `pnpm check`：exit 0；1,279 passed / 42 skipped；覆盖率 statements 93.17、branches 85.76、functions 93.13、lines 96.27（win32-x64），高于记录值 93.13 / 85.68 / 93.08 / 96.22；`coverage ratchet: ok`；`lib/index.js` 472.05 kB（构建前 468.58 kB）。
- `pnpm verify:install -- --dsh C:/Users/tyecl/.dsh/state/superagent-desktop/work/.tools/dsh-0.2.2-rc.1/node_modules/@deepseek-ai/dsh/lib/bin.js`：13/13 项通过（DSH 0.2.2-rc.1，一次性 profile，面板 API 200、setup `repositoryUnset`、数据库与两个 preset 均就位）；receipt 在提交后重跑并记录代码提交。
- 本地 UI 证据：桌面 profile 的工单页修改前后截图；修改前状态行没有 Token 用量，修改后有 chip 与折叠分解。截图与 PR 一起提交在 `docs/evolution/assets/round-2-*.png`。

待补：PR CI、release 与重载的最终证据（见 §8）。

未验证：没有真实账单或价格表，因此没有验证金额；没有注入一个「三倍 token」的异常工单，因此没有验证异常检测；没有回填历史工单。

## 7. 风险与限制

- **适配器可能不报告 usage。** 此时工单没有数字；这不是错误，但会让人误以为「没有成本」。面板用「不显示」表达未知，而不是显示 0。
- **缓存与推理是子集字段。** `cacheReadTokens`/`cacheWriteTokens` 通常包含在输入/输出或总量里；本台账只展示，不做加总推导，避免重复计算。
- **总量口径依赖适配器。** `totalTokens` 存在时使用报告值，缺失时用输入+输出；不同 provider 的口径可能不同，跨 provider 比较只应看数量级。
- **主 Session 不计入工单。** 路由、评估和 relay 的模型调用没有被归属；这是有意的边界，但意味着工单数字≠整个系统的账单。
- **记录无界增长。** 每个有 usages 的工单留下一个 KV 记录；与现有的 trigger、decision、outbox 一样，暂无保留策略。记录本身很小，但仍是增长面。
- **没有预算或异常检测。** 台账是前置条件，不是「防止跑飞」；把阈值、告警或自动停止接进来需要单独的产品决定。
- **UI 紧凑格式因语言而异。** 中文的 `1.2万` 与英文的 `12K` 都是本地化显示；精确值在悬停与折叠区。
- **不改变授权边界。** 本轮没有改 Policy、Mandate、admission、permission preset、部署账户或密钥设置。

## 8. 落地与下一轮

- **PR：** 待创建（分支 `agent/self-evolve-single-9efbb381146d`）。
- **合并提交 / release：** 合并后由 release job 自动发 patch 版本；最终 tag、合并提交与 release URL 记录在 PR 描述与工单报告中。
- **部署与重载：** 在合并前把分支构建安装到桌面 profile 并重载验证（同一份运行时字节），合并后把部署检出更新到 release 提交并复核；证据写在 PR 描述与工单报告中。这样做是因为每次 push 到 `main` 都会触发一次 release，若在合并后再补一次文档提交会产生第二个 release，因此记录在合并前写完。
- **下一轮：** 若人决定继续，优先候选是：
  1. 工作回合的静默停滞 watchdog：需要先决定「停滞多久、中断后算什么」；外部证据（hermes turn_liveness）已经足够强。
  2. 把台账接到预算/告警：需要产品决定阈值与超限行为，以及是否按模型计价。
  3. GAP-05（小写 cookie 头脱敏）：小而独立的安全边界。
  4. GAP-04（保留/归档）：仍被策略决定阻塞。
- **停止：** 本轮完成后按请求停下，不开下一轮。
