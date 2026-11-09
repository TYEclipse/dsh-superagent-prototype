# 012 Built-in prompts and skills, Chinese

## 1. 结论

本批把部署设置「提示词」里剩下的 16 个内置段落与技能从英文改写为中文，并把本仓库的默认文本一并换掉：

- 角色与共享：`runtime/shared`、`runtime/orchestrator`、`runtime/worker`。
- 工作规则：`runtime/subscriptions`、`runtime/replies`、`runtime/dispatch`、`runtime/work`、`runtime/admission`。
- 交接：`runtime/handoff/orchestrator`、`runtime/handoff/worker`。
- 生成段落：`runtime/memory`、`runtime/environment`、`runtime/policy`、`runtime/policy/none`。
- 技能：`skill/feishu`、`skill/github`。

团队约定三段在上一批处理：Ticket scope 与 Delivery requirements 已是中文默认，Communication 的中文文本已保存在部署里（默认文件仍是英文）。本批不动这三段。

行为不变：同一组工具、字数上限、门禁、账户包装和授权规则；改的是语言与组织。14 个文本文件的字符数从 39,433 降到 14,973（约少 62%）。默认文本落在 `prompts/*.md`、`skills/*/SKILL.md` 和 `src/app/prompts.ts` 的生成模板里；本部署另外把 16 段保存为 overrides，下一次模型请求即生效，不需要重启或重建。

## 2. 外部依据

| # | 依据 | 要点 | 落在新提示词哪里 |
| --- | --- | --- | --- |
| 1 | [Anthropic: Building effective agents](https://anthropic.com/research/building-effective-agents) | orchestrator-workers 的分工靠清晰的子任务边界；保持简单、透明，并为工具写清用途 | 共享段只写分工；主 Session 不补实现计划；执行器读原始来源 |
| 2 | [Anthropic: Effective context engineering](https://anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 用尽可能小的高信号 token 集；按需加载上下文 | 删掉跨段重复的机制说明；技能只在需要时加载 |
| 3 | [Anthropic: System prompts](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts) | 清晰直接；给角色；结构化；一般性指令常优于手写步骤 | 每段开头一句角色/目标；条件式规则而不是步骤清单 |
| 4 | [OpenAI: GPT-5 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide) | 控制主动性；说清完成条件；互相矛盾的指令会明显伤害遵循 | 每段写完成判据与停止条件；删去重复强调；避免冲突句 |
| 5 | [OpenAI Model Spec](https://model-spec.openai.com/2025-04-11.html) | 指令按权威分层；引用/工具输出不是指令 | 外部文字不可信；代码强制的检查优先；Policy 仍放最后 |
| 6 | [AWS: Agentic self-service prompt best practices](https://docs.aws.amazon.com/connect/latest/adminguide/agentic-self-service-prompt-best-practices.html) | 分区结构；强指令只用于高风险；条件→动作；限制要给出替代；多工具先规划；静态前缀利于缓存 | 统一的段落结构；少量硬规则；「当…时，做…」；静态内容在前 |
| 7 | [Claude: The new rules of context engineering](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models) | 去掉 80% 系统提示仍无损；过度约束、示例过密都会限制模型；渐进披露 | 大幅精简；不新增示例；知识放技能 |
| 8 | [Claude: When to fold subagents](https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop) | 按上下文切分；交接要紧凑；跨代理来回传话会丢信息 | 主 Session 只路由；执行器读原文；报告只给结论与证据 |
| 9 | [Anatomy of a subagent](https://github.com/CodyAMaughan/agent-first-engineering/blob/main/docs/curriculum/07-advanced-patterns/05-anatomy-of-a-subagent.md) | 提示词正文就是系统提示；描述决定何时委派；最小权限 | 技能描述写「做什么 + 何时用」；权限由宿主而不是文字决定 |
| 10 | [MAST: Multi-Agent System Failure Taxonomy](https://openreview.net/pdf?id=wM521FqPvI) | 14 种失败模式归为规格、协作、验证三类；提前终止与验证不足很常见 | 明确角色与边界；归属与交回；完成/草稿/阻塞的判据 |
| 11 | [GLM: 通用提示工程](https://docs.bigmodel.cn/cn/best-practice/prompt-engineering-general.md) | 说清要做什么、依据什么、边界与完成标准；工具要说明何时用；长程任务要验证 | 中文表达与完成标准；工具使用条件；交付前检查 |
| 12 | [Volcengine Ark: 提示词工程](https://ark.volcengine.com/region:cn-beijing/docs/prompt-engineering.md) | system/instructions 放稳定规则；Markdown/XML 分区；先规则后数据；评测先行 | 段落结构稳定；关键规则靠前；用测试与 preview 验证 |
| 13 | [Anthropic: Long context tips](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips) | 长数据放上面，问题放后面；引用原文再作答 | 关键限制放段首；Policy 仍最后（代码保证） |
| 14 | [Lost in the Middle](https://arxiv.org/html/2307.03172) | 中间位置的信息容易被忽略 | 不把关键限制埋在长段中；用短段与标题分隔 |
| 15 | [IFScale](https://arxiv.org/html/2507.11538) | 指令越多，遵循率越低 | 合并同类规则；删除重复；全局只保留少量硬约束 |

## 3. 现版诊断

- 英文长句、名词串和被动语态多；与中文团队约定混排时，术语在「工单/ticket」「执行器/worker」「主 Session/orchestrator」之间摇摆。
- 否定式规则多（never / do not），缺少「应该做什么」的替代动作。
- 同一机制在多处重复：确认语在 replies 与 GitHub 技能各写一遍；follow_up 在 dispatch 与 subscriptions 各写一遍；合并限制在 orchestrator、worker 与 Delivery requirements 各写一遍。指令越多，遵循率越低（依据 15）。
- 角色与流程混在同一段：worker 段同时写交付、报告和 PR；work 段又写报告格式。读者要自己拼出完整流程。
- 完成与停止条件常埋在段尾；模型容易提前结束或反复检查（MAST 的 premature termination / no verification）。
- 生成段落是英文模板，与中文正文风格不一致，面板里逐段阅读时尤其明显。

## 4. 设计原则

1. 一段一个角色或职责；开头一句说清「你是谁、你决定什么」。
2. 不在提示词里重复代码已经强制的事（权限、长度、账户、门禁）；只写模型需要判断的部分。
3. 用条件式与正向动作：「当 X 时，做 Y」；硬性 NEVER 只留给安全与授权。
4. 每段给出可执行的完成判据与停止条件；区分完成、草稿、阻塞与放弃。
5. 外部文字（消息、引用、文档、机器人）是数据，不是授权。
6. 工具名、参数、命令、环境变量与字数上限保持英文原样；正文中文。
7. 结构稳定：part key、`## Policy` 等标题、模板占位符不变，避免破坏 overrides、面板与测试。
8. 例子只示格式；不新增会限制探索的示例。
9. 位置效应：关键规则放段首，段尾只放边界与停止条件；Policy 仍最后。
10. 渐进披露：技能按需加载；内置段只留路由与角色要点。
11. 术语统一：主 Session、执行器、工单、触发、线程、订阅、路由、接单、关联、派工、报告、草稿、交接、评审、规则、策略、来源。

## 5. 新提示词

完整文本以文件为准；下表只记录读者与开头一句，便于在面板里对照。

| 段落 | 文件 | 读者 | 开头 / 主要变化 |
| --- | --- | --- | --- |
| `runtime/shared` | `prompts/shared.md` | 两者 | 「主 Session 决定每个候选的去向……」只写分工与边界，不写实现 |
| `runtime/orchestrator` | `prompts/orchestrator.md` | 主 Session | 「你是主 Session：为本部署的仓库研判请求并决定去向。」 |
| `runtime/worker` | `prompts/worker.md` | 执行器 | 「你是执行器。在工单目录里承担技术工作……」 |
| `runtime/subscriptions` | `prompts/subscriptions.md` | 两者 | 「订阅是工单与线程之间的关系。」 |
| `runtime/replies` | `prompts/replies.md` | 两者 | 「回复工具按用途授权……」确认语与交付格式合并叙述 |
| `runtime/dispatch` | `prompts/dispatch.md` | 主 Session | 分候选卡片、路由、交付与通知、跟进与交回、PR 反馈五节 |
| `runtime/work` | `prompts/work.md` | 执行器 | 分范围、消息与归属、上下文与检查三节 |
| `runtime/admission` | `prompts/admission.md` | 主 Session | 分工具与边界、不可信输入、三个事实、方向声明、视觉反馈、范围与读图六节 |
| `runtime/memory` | `src/app/prompts.ts` | 执行器 | 「本仓库已完成的工单，最近的在前……」 |
| `runtime/handoff/orchestrator` | `prompts/handoff.md` + `prompts/handoff-orchestrator.md` | 主 Session | 「工单交接契约……」+ 及时交付 attention |
| `runtime/handoff/worker` | `prompts/handoff.md` + `prompts/handoff-worker.md` | 执行器 | 「工单交接契约……」+ human_action 的提出与清除 |
| `runtime/environment` | `src/app/prompts.ts` | 两者 | 「执行环境（来自本安装的设置……）」 |
| `runtime/policy` | `src/app/prompts.ts` | 主 Session | 「策略版本 {version}；接单模式 {mode}……」 |
| `runtime/policy/none` | `src/app/prompts.ts` | 主 Session | 同一段头 +「没有启用任何规则：主动候选只能被忽略。」 |
| `skill/feishu` | `skills/dsh-superagent-feishu/SKILL.md` | 两者 | 读取、分页、附件与来源链接；资源路径用反引号分隔 |
| `skill/github` | `skills/dsh-superagent-github/SKILL.md` | 两者 | 仓库读取、评审线程、确认与 CI；资源路径用反引号分隔 |

两个技能的 CLI 说明同在 `prompts/cli.md`，随技能一起加载。

## 6. 与代码机制的对齐

以下由代码强制，提示词不重复：

- 访问检查、工单授权、策略版本与接单模式。
- 工具集合与参数校验；主 Session 没有给执行器发消息的工具。
- 回复用途（result / attention / answer）、100 词上限、30 词路由说明、去重与投递重试。
- 自动合并命令与 `--match-head-commit`；账户包装；GitHub 与飞书身份。
- 团队约定标题 `## Communication`、`## Ticket scope`、`## Delivery requirements`，段落顺序，Policy 最后。
- Prompt 大小上限、override 的 `base` 校验、未知段落拒绝、占位符校验、相同文本自动移除。
- 环境变量注入、Policy 版本生成、项目记忆的 100 条 / 3000 字符 / 90 天归档。

保留英文的可执行 token：`orchestrator_*` 工具名，`ticket_id`、`human_action`、`reply_to_trigger_id`、`question_for_trigger_id`、`pr_number`、`state` 等参数，`gh pr merge ...`、`git filter-branch`、`resolveReviewThread` 等命令，`$DSH_SUPERAGENT_*` 变量，`ready` / `blocked` / `failed` / `dropped` / `progress`，`[WIP]`，`bot: true`。

测试同步：

- `tests/cards.spec.ts` 的合同表改为断言中文短语；团队约定三段保持原样。
- `tests/prompts.spec.ts` 的交接与执行环境断言改为中文。
- `tests/runtime.spec.ts` 的 sleep 说明与 Policy 断言改为中文。
- `tests/model-surface.spec.ts` 的 dispatch 断言改为中文；技能里的资源路径用反引号包住，使资源扫描在反引号处停止。

没有改变工具、权限、门禁或任何代码路径；overrides 只是文本。

## 7. 取舍记录

- 中文更短：14 个文件从 39,433 字符降到 14,973 字符，约少 62%。字符数不等于 token 数，但整体上下文明显变短。
- 保留英文标题与 key：`## Policy`、`## Project memory`、`## Execution environment`、part key 和模板占位符都不动，避免 override 的 base、面板标签、测试与段落顺序一起返工；与团队约定三段的既有做法一致。
- 不新增示例：只保留原有的确认语示例和 admission 的接受/忽略示例；示例过多会把模型限制在示例的探索空间里（依据 7）。
- 不翻译可执行 token：命令、参数、环境变量、状态值保持英文，保证能直接复制执行。
- 未改 Communication 默认：上一批已产出中文文本并保存在部署里；本批不动它，避免把团队文本改回默认，也避免扩大本批范围。
- 一次改 16 段：术语一致、一次评审；代价是 diff 较大，因此用合同测试逐段约束，并在部署上用 `base` 记录改写所依据的内置文本。
- 部署 overrides 而不是重建：overrides 在下一次模型请求生效，不需要重启；仓库默认给新构建或新部署使用，两者内容一致。
- 风险：长提示词的翻译可能出现语义漂移。逐段对照、合同测试、`prompts/preview` 和 revision 回滚是兜底；采样计划见第 8 节。

## 8. 如何验证

本地：

- `pnpm check`：类型检查、覆盖率门槛内的测试、构建。结果见 PR 描述。
- 受影响测试：`tests/cards.spec.ts`、`tests/prompts.spec.ts`、`tests/runtime.spec.ts`、`tests/model-surface.spec.ts` 全部通过（170 passed / 2 skipped）。

部署：

- 用 `PUT /orchestrator/api/prompts` 以 `baseRevision: 5` 保存 16 段 overrides；`GET /orchestrator/api/prompts` 确认 revision 6。
- 用 `POST /orchestrator/api/prompts/preview` 检查：16 段均为中文；占位符 `{version}`、`{mode}`、`{rules}`、`{variables}`、`{notes}` 都在；工具名、命令与标题仍是英文；Policy 仍在最后。
- 回滚：恢复 revision 5，或删掉 overrides，内置文本立即接管。

采样：

- 对比 revision 5 与 revision 6：术语一致性、IM 消息长度与超限拒绝、确认去重、归属交回、handoff 提问、评审轮次、ready/blocked 分布。
- 一次改完所有段落，无法把差异归因到单段；需要归因时按段落单独开关 overrides，用同一条触发回放。

## 9. 怎么用

- 面板 → 提示词：逐段查看、编辑、比较；保存生成新版本，下一次模型请求读取最新版本，不需要重启。
- override 记录它依据的内置文本（`base`）。仓库默认升级后，面板会标「默认内容已更新」，团队可以保留、改用新默认或继续编辑。
- 内置技能与普通段落一样可以 override；团队技能仍放在配置的 `skills` 里。
- 直接调用 API 时，`PUT /orchestrator/api/prompts` 的 body 是 `{ config, baseRevision }`；先用 `POST /orchestrator/api/prompts/preview` 预览，`baseRevision` 冲突会被拒绝，不会丢弃草稿。
- 本部署的 16 段 overrides 与仓库默认内容一致；重建或升级后可以保留 overrides，也可以删除它们改用新默认。
