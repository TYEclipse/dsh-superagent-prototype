# 012 最高性价比改进：执行准备阶段的瞬时失败重试

> **语言说明.** 本仓库其余文档用英文；这一篇用中文，因为这次改进是应中文团队的要求做的联网调研，结论需要让提出需求的人直接读懂。第 5 节是落地方案，其余各节是候选比较、外部依据、现状诊断与取舍记录。

## 1. 结论

本鱼选的是**执行器准备阶段（prepare command）的瞬时失败重试**，而不是再改一版提示词或增加一个新功能。

一句话：**准备命令只在“失败可恢复、且这次尝试没有留下目录”时，按现有 launch 退避再试两次；认证、计费、上下文和未知失败立即交给人，重试次数与失败分类写进工单报告。**

这个改动的性价比最高，因为：

- **它守住整张工单**。准备命令是工单执行的第一道真实外部 I/O（通常是 `git worktree` 或 `gh`）。一次 DNS 抖动、TLS 重置或 5xx 就让整张工单直接进入“等人”状态，前面已经完成的接单、授权、排队、上下文都白费；重试两次的成本远低于让人重新处理一张失败工单。
- **它是最后一个未分类的失败接缝**。模型回合、launch、Source 读取都已接入 `classifyFailure`，只有 prepare 仍是“失败即终局”。补上它不需要新的调度器或新的数据表。
- **它可以安全回放**。准备命令不是幂等的，但失败后目录是否为空可以判定：空目录（或不存在）才重试，留下文件的目录立即失败并说明原因。这避免了“把半成品 worktree 当成已准备”的旧风险。
- **它可验证、可回滚**。两条路径都能用现有假 subprocess 精确断言；不增 schema、不改 Settings、不改提示词、不改 PR 交付规则。

改动规模：`src/executor/dsh.ts` 约 30 行、`src/executor/failure.ts` 一条失败形态扩展，测试约 60 行，文档两处。

## 2. 候选比较

评分只看四件事：对“少占用人的注意力、把工作送到 PR”的影响、发生频率、爆炸半径、验证成本。分数是相对判断，不是测量值。

| 候选 | 价值 | 频率 | 风险 / 成本 | 结论 |
| --- | --- | --- | --- | --- |
| **准备命令的瞬时失败重试** | 高：救回整张工单 | 中高：网络受限或 GitHub 抖动时常见 | 低：有目录洁净度守卫，上限两次 | **选中** |
| 工作回合的看门狗（长时间无事件即超时） | 高：防止槽位被永久占用 | 低到中：provider 挂起时 | 中高：需要产品决定“超时后是失败、重试还是交给人”，还要新设置与迁移 | 另开变更 |
| 领域记录保留/归档（GAP-04） | 中：数据库长期增长 | 随时间上升 | 中：保留窗口是产品决定，需要 schema 迁移 | 已被策略决定阻塞 |
| 上下文压缩 / 工具结果外置 | 高：直接降 token | 高 | 高：DSH host 已拥有压缩与转录；bundle 再做一套会双重压缩 | 不做，host 所有 |
| 每张工单的 token 预算 | 高：防跑飞 | 未知 | 中高：需要从 host 读用量、定义超限行为、改面板 | 另开变更 |
| 小写 cookie 头的脱敏（GAP-05） | 低到中：安全边界 | 低 | 低 | 可做，但救不回工单；单独处理 |
| 等待 CI / 自动合并的提示词调整 | 中：减少“等人” | 中 | 低，但属于提示词与部署规则，最近已连续重写 009–011 | 不在本轮重复 |

选 prepare 重试的另一个理由是它符合产品哲学：**先修“系统自己制造的人工中断”，再谈新能力。** 一张本可自动恢复的工单被送到人面前，正是“用一个人的注意力换一次网络抖动”，与 [000 Philosophy](000-philosophy.md) 的方向相反。

## 3. 外部依据

| # | 主题 | 外部结论 | 用在本改动哪里 |
| --- | --- | --- | --- |
| 1 | 重试的五个组成部分 | 生产级重试需要错误分类、尝试上限、指数退避、抖动和总时限；只重试超时、连接重置、限流和 5xx，绝不重试鉴权、校验和明确的 4xx（[Retry Policies](https://systemoverflow.com/learn/distributed-primitives/idempotency/retry-policies-exponential-backoff-jitter-and-budgets)） | 复用 `classifyFailure`；只对 network/rate-limit/overloaded/server 重试；`auth`/`budget`/`context`/`unknown` 立即失败 |
| 2 | 可回放才可重试 | 重试是“再发一次请求”，写操作可能重复执行；必须用幂等键、条件请求或应用层去重，并确认剩余时限还够一次尝试（[Exponential Backoff and Jitter](https://throttle.com/guides/exponential-backoff-and-jitter)） | 准备命令不幂等，所以只在目录为空/不存在时重试；非空目录立即失败并请人清理 |
| 3 | 尝试次数与退避要可见 | 记录尝试、等待、最终成功或失败，区分“重试后被恢复”和“最终失败”；不要只限制单次延迟，还要限制总尝试（[Exponential Backoff and Jitter](https://throttle.com/guides/exponential-backoff-and-jitter)） | 最终报告写 `(server, 3 attempts)`；中间重试不写失败报告，工单保持工作态 |
| 4 | 生产 Agent 的失败分类 | 真实批量 Agent 的可靠性更多取决于“区分瞬时与非瞬时失败、每次尝试的时限、检查点、恢复计数”，而不是提示词（[SciPy Proceedings](https://proceedings.scipy.org/articles/019ede12-b77a-76db-987b-fba1b14e6a7c)） | 把 prepare 纳入同一套瞬时/非瞬时语义；保留 10 分钟尝试时限；不新建检查点，因为工单本身已是持久状态 |
| 5 | 有副作用的 Agent 流水线 | 长任务需要 checkpoint、幂等、带抖动的退避与补偿，且这些机制要组合使用；朴素重启会重复副作用（[Fault-Tolerant Agent Pipelines](https://towardsai.com/p/machine-learning/fault-tolerant-agent-pipelines-checkpoint-retry-and-compensate)） | 不重启整张工单，只重跑失败的准备命令；目录洁净度就是这里的“幂等门” |
| 6 | 后台编码 Agent 的验证环 | Spotify 把后台 Agent 的失败分为“没产出 PR”“PR 过不了 CI”“PR 过了但功能错”，并用确定性 verifier + LLM judge 在开 PR 前拦截（[Spotify Engineering](https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3)） | 说明“先把工单送到可验证的 PR”比增加新能力更值钱；prepare 失败正是连 PR 都到不了的路径 |
| 7 | Harness 才是成本与可靠性的杠杆 | 同一模型下，上下文策略、工具加载、压缩与恢复机制可造成数倍 token 与成功率差异；“先修 harness，再怪模型”（[Stack Overflow](https://stackoverflow.blog/2026/10/07/part-6-an-operating-system-for-coding-agents-the-disciplined-build)、[TrueFoundry](https://truefoundry.com/blog/agent-harness-best-practices)） | 选择修执行 harness 的接缝，而不是再写一段“请更努力重试”的提示词 |
| 8 | 上下文工程属于 host | 大型工具结果外置、结构化压缩、子代理干净上下文能显著降本，但这些是 harness/host 的职责（[AWS Builder Center](https://builder.aws.com/content/3J36U47bvNh8qnt6KgNPUVP08q1/quit-tokenmaxxing-4-tips-for-context-engineering-with-code-samples)） | 明确不把上下文压缩塞进 bundle，避免与 DSH 的 compaction 双重处理 |
| 9 | 重试要有预算与停止条件 | 重试预算、总 deadline 和“剩余预算不够就不要再试”可防止故障时的重试放大（[Retry Policies](https://systemoverflow.com/learn/distributed-primitives/idempotency/retry-policies-exponential-backoff-jitter-and-budgets)） | 上限两次重试；每次尝试仍有 10 分钟上限；不叠加第二层重试 |
| 10 | 先有小而可回滚的变更 | 小批量、可回滚、带自动闸门的交付更容易被评审和回退（DORA 的四键与 small batches） | 不新增设置项与迁移；改动集中在执行器的一个 catch 分支 |

这些来源解释的是“为什么这样设计”，不是对本仓库的测量。这个仓库没有 prepare 失败率的埋点，所以本改动不声称一个具体的成功率提升。

## 4. 现状诊断

### 4.1 代码路径

- `src/executor/dsh.ts` 的 `prepareDirectory` 只运行一次准备命令；失败时删除空目录，然后把错误包成 `PrepareFailed`。
- `launchQueued` 明确排除 `PrepareFailed`：`if (!(error instanceof PrepareFailed) && this.retries(...)) throw error`，所以准备失败直接 `launchFailed`。
- `retries` 的上限是 `TRANSIENT_TRIES = 3`，退避由 launch effect 的 `[5000, 300_000]` 提供；模型回合另有 15 秒起、指数增长的退避。
- `classifyFailure` 已识别 Node 的 `ECONNRESET`/`ENOTFOUND` 等，但**不识别 git/curl 的 `Could not resolve host`、`Failed to connect to … port`、`The remote end hung up unexpectedly`**；也就是说，即使把 prepare 接进分类器，最常见的 git 网络措辞仍会被判成 `unknown`。本改动一并补上这些传输层措辞。

### 4.2 旧测试与旧文档

- `tests/runtime.spec.ts` 的“runs a launch that fails for a passing reason…”用例明确断言：prepare 输出 503 时只运行一次并立即失败。
- `docs/003-execution.md` 的“Preparing a Ticket directory”和“Executor blocked or failed”两处都写着准备失败不自动重试。
- `docs/007-architecture.md` 的 launch 行写着“any other failure, and a failed prepare command, fails its Ticket”。

这些不是遗漏，而是上一轮的明确选择：当时的理由是“已存在的目录会被当成已准备”。本改动保留这个理由，用目录洁净度判定来消解它，而不是简单地把 `PrepareFailed` 从排除列表里拿掉。

### 4.3 为什么现在值得改

本部署的 GitHub 与 Feishu 都经公网访问，`git worktree`/`gh` 的 DNS、TLS 和 5xx 抖动是现实故障；而工单的准备失败会立刻占用一个人的注意力。准备命令也是最容易在“一次点击之后”自动恢复的一步：它没有外部副作用（不像 push、merge 或发消息），重跑一次是安全的——前提是目录干净。

## 5. 方案

### 5.1 行为

1. **分类**：准备命令失败时调用 `classifyFailure`，得到 `kind` 与 `retryable`。
2. **洁净度守卫**：删除失败尝试留下的空目录；删除成功或目录本就不存在（`ENOENT`）才算 `clean`。非空目录保留，不重试。
3. **上限**：`PREPARE_RETRIES = 2`，即最多三次尝试（首次 + 两次重试）。重试沿用 launch effect 的既有退避（5 秒、10 秒），不新增计时器。
4. **不重试中止**：`signal.aborted` 为真（host 停止，或 10 分钟尝试超时）时不重试。host 停止仍走原有的“排队等下次启动”路径。
5. **可见性**：最终失败报告包含分类与尝试次数，例如
   `The prepare command failed: … (server, 3 attempts).`
   非空目录另加一句：`The command left files in the ticket directory, so it was not retried; remove them and retry.`
6. **不重试的失败立即交给人**：`auth`/`budget`/`context`/`unknown` 与旧行为一致，只多了一个分类标签。

### 5.2 为什么用 launch effect 的退避，而不是在执行器里 `sleep`

- 现有 effect 队列已经持久化 `due`、有 `[5000, 300_000]` 的退避、在重启后仍然保留行；在 `prepareDirectory` 里 `sleep` 会占着 worker slot，也让进程重启后的恢复更复杂。
- 重试用同一个 `launch` handler，因此不需要新的状态机；每次重试前 `launch` 都会重新检查工单是否仍存活、是否仍是同一个 Assignment。
- 上限由 `prepares` 计数控制，而不是依赖 effect 的 `attempts`，这样“两次重试”是产品语义，不被队列的其他重试路径影响。

### 5.3 与最佳实践的对应

| 实践 | 本改动 |
| --- | --- |
| 只重试可恢复错误 | `classifyFailure` 的 `retryable`；补充 git/curl 传输措辞 |
| 有界 | 2 次重试，3 次尝试 |
| 退避 | 复用 launch effect 的 5 秒 → 10 秒 |
| 可回放 | 目录洁净度守卫；非空即不重试 |
| 尊重中止 | `signal.aborted` 不重试；host 停止走原恢复路径 |
| 可见 | 报告写分类与尝试次数 |
| 不放大 | 不在 prepare 内部再套一层重试；不加抖动，因为单进程、低并发、无同步重试风暴，且保持现有测试可确定性 |
| 不做产品决定 | 不引入新超时、新设置、新 schema |

## 6. 验证

新增或更新：

- `tests/failure.spec.ts`：识别 `Could not resolve host`、`Temporary failure in name resolution`、`Failed to connect to … port`、`Connection was reset`、`The remote end hung up unexpectedly`。
- `tests/runtime.spec.ts`：
  - 既有 launch/prepare 用例改为：503 准备失败重试两次、第三次仍失败时报告 `(server, 3 attempts)`；`resume()` 不重启失败 launch；人工 retry 再运行一次。
  - 两次瞬时失败后成功：准备命令共运行三次，工单进入 running。
  - 401：只运行一次，报告含 `(auth)`。
  - 失败后留下文件：只运行一次，报告含 `left files`，说明未重试。
- `pnpm typecheck` 通过；`pnpm vitest run tests/runtime.spec.ts tests/failure.spec.ts` 通过；`pnpm check`（含 v8 覆盖率门禁与 build）通过。

未验证：没有在真实公网故障下注入 DNS/TLS 错误；没有测量 prepare 失败率或节省的人工时间。测试用假 subprocess 精确控制失败形态，证明的是行为，不是线上频率。

## 7. 风险与限制

- **准备命令可能不是幂等的**。洁净度守卫只能证明“目录为空”，不能证明命令没有外部副作用（例如它在别处创建了 worktree 记录）。这是有意的取舍：只重试最常见的“命令在写目录前就失败”的形态；留下任何文件的尝试都不重试。
- **分类依赖错误文本**。`classifyFailure` 是正则分类器，不是结构化错误码；新增的措辞来自 git/curl 的常见输出，未知措辞仍会立即失败，这是“宁可交给人也不循环”的方向。
- **两次是策略，不是测量**。没有本仓库的失败率数据；两次重试覆盖一次短时抖动，同时把最坏延迟限制在两次退避加一次 10 分钟尝试。需要更多时可以改常量，但应另开变更并补测试。
- **没有抖动**。effect 队列的退避是确定性的；单进程、少量工单时不存在同步重试风暴。若未来并发显著上升，应在 effect 队列层统一加抖动，而不是只给 prepare 加。
- **覆盖率**：新增分支已由上述用例覆盖；`signal.aborted` 的“停止”分支没有单独的集成用例（需要模拟 host 停止或 10 分钟超时），由代码路径与类型检查保证，若覆盖率门禁提示再补。

## 8. 落地

PR 合并后，把本地部署的 `link:` 检出更新到 `main` 的新提交，执行 `pnpm install --frozen-lockfile && pnpm build`，再按部署文档重载插件。部署前记录当前 SHA，构建失败或面板检查失败时回退到该 SHA。
