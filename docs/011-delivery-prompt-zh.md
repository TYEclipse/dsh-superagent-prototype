# 011 Delivery requirements prompt, Chinese

> **语言说明.** 本仓库其余文档用英文；这一篇用中文，因为交付物是一段给中文团队用的提示词。第 5 节是成品，其余各节是它的依据、诊断与取舍记录。

The Delivery requirements section is the team's own text: it decides what evidence a pull request carries, when the Executor may enable auto-merge, and how commits are authored and credited ([004 Prompts](004-prompts.md)). This document records a Chinese rewrite grounded in published practice and makes it the built-in default. It replaces the 28-line English text that shipped before. The current deployment had already replaced that default with a 4-line text; this rewrite consolidates both and is applied to the deployment after review.

## 1. 结论

这一版把交付要求收成四个契约，而不是继续堆条件：**PR 是证据包、自动合并是窄门、作者与署名必须准确、重复工作要主动让路。**

- **PR 是证据包**：描述写清改了什么、为什么、实际跑过哪些检查；界面变化给修改前与修改后的真实截图或录屏；证据绑定当前 head commit，过期就重采；验证不了就不说完成。每个工单以自评审并验证过的 PR 结束，不是以「PR 已存在」结束。
- **自动合并是窄门**：只用品名点名的合并 CLI，并锁定 `--match-head-commit`；只有 PR 就绪、要求的检查全部通过、要求的评审覆盖该提交、证据未过期时才开；推送前或条件失效时先撤回；不直接合并，不批准或合并自己的 PR。
- **作者与署名必须准确**：按本段指定的作者提交，否则用代理账号的 no-reply 邮箱；人工评审者每人每个 PR 记一次 `Co-authored-by`，不改写已合并的 PR，不用空提交记名，不把 bot 或没评审的人写进去。
- **重复工作让路**：人的分支或 PR 已包含本工单的代码时，立即关闭自己的 PR 并留一句指向对方的话。
- **默认替换**：`prompts/team/delivery.md` 现在就是这段中文；评审后把它作为部署的 Delivery requirements 保存，面板版本历史可回滚。

体量：原版 27 行、4,102 字符；新版 25 行、1,919 字符。中文字符的信息密度不同，token 数不会按字符比例下降；减少的是重复的条件链和埋在长句里的规则。

判据没有变：评审者只看 PR 与证据就能理解并验证这次改动；交付不是「PR 已存在」，而是「可以被人接手或使用」。

## 2. 外部依据

| # | 主题 | 外部结论 | 用在新提示词的哪里 |
| --- | --- | --- | --- |
| 1 | PR 描述要回答什么 | PR 描述应包含变更摘要、相关 issue、适用的截图或 gif、测试步骤和已知限制（[Graphite](https://graphite.com/guides/github-pr-description-best-practices)） | `PR 证据` 第一条：改了什么、为什么、实际检查及结果、相关链接 |
| 2 | 修改前后对比 | 可评审的 PR 模板把 Before / After 截图或 gif 放在一起，并写清怎么复核；交互流程用 gif 比单张截图更能暴露问题（[DockYard](https://dockyard.com/blog/2019/12/06/writing-digestible-pull-requests)） | 界面变化必须同时给修改前与修改后，并保持相同场景、视口、主题与状态 |
| 3 | 代理要自己看证据 | 让代理为每个可见改动截图或录屏，并在上传前自己打开检查；文本截断、元素重叠、状态错误或报错时先修再重拍；不要上传客户数据或秘密（[Pixelhop](https://pixelhop.io/writing/agentic-coding-workflow-visual-verification)） | 「真实截图或录屏」「不能用设计稿冒充旧实现」「不要暴露私密内容、凭据或用户数据」 |
| 4 | 证据不替代评审 | 让代理把截图、录屏或端到端结果和代码一起交付，评审者先看可观察证据，再在可疑处读代码；证据不替代代码评审（[Forbes](https://forbes.com/councils/forbestechcouncil/2026/10/26/code-verification-in-the-agentic-era)） | 证据与评审分开写；`reviewed, validated` 不再是一句空话 |
| 5 | 大小是启发式，不是授权边界 | 合适的大小是「一个自包含的变更」：只解决一件事、带相关测试、评审者只看它就能理解；100 行通常合适、1000 行通常过大，但这是评审判断，不是硬阈值（[Google Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)） | 「改动大或风险高时拆成能一次评审完的 PR，或交给人合并」；默认不再用 200 行当硬门槛 |
| 6 | 自动合并的语义 | GitHub 的 auto-merge 在仓库要求的评审与状态检查都通过后自动合并；它只在 PR 当下不能立即合并时才出现（[GitHub Docs](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request)） | 开启条件直接写「检查全部通过」「要求的评审覆盖该提交」 |
| 7 | 真正的闸门在分支保护 | 分支保护可以要求评审、状态检查、会话解决、merge queue 等；merge queue 会在最新目标分支上重跑必需检查（[GitHub Docs](https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)） | 提示词只写代理的时机与偏好；需要强制时在分支保护里设，而不是只靠提示词 |
| 8 | 跳过的检查会显示成功 | 被跳过的 job 状态报告为 Success，不会阻止合并，即使它是必需检查（[GitHub Docs](https://docs.github.com/en/pull-requests/reference/status-checks)） | 要求写「实际跑过哪些检查及结果」，不把「有检查条目」当成「检查真的跑了」 |
| 9 | 锁定 head commit | `gh pr merge --match-head-commit <sha>` 只在 PR 当前 head 与给定 SHA 一致时才合并（[gh manual](https://cli.github.com/manual/gh_pr_merge)） | 自动合并命令保留这个参数；推送后先撤回、在新 head 上重新评估 |
| 10 | 多作者署名 | 用 `Co-authored-by: name <email>` trailer 把提交归因给多位作者；对方不愿公开邮箱时用 GitHub 的 no-reply 地址（[GitHub Docs](https://help.github.com/articles/creating-a-commit-with-multiple-authors)） | 评审者记名的 trailer 格式与 no-reply 邮箱 |
| 11 | AI 署名的准确性 | VS Code 的 Copilot 共同作者功能引发争议后改为：默认关闭、提交前征得同意、只标注确实由 AI 参与的代码，并考虑改用 assisted-by（[vscode#314311](https://github.com/microsoft/vscode/issues/314311)） | 「不得伪造人类作者」「不记 bot、PR 作者、代理账号、已指定的提交作者」 |
| 12 | 代理提交的签名是可选的 | 对 783 万次提交的分析发现，代理提交常靠 bot 账号或 Co-authored-by 识别，但这些签名可以缺失或移除，因此记录下来的归因比事后猜测可靠（[arXiv](https://arxiv.org/abs/2610.36229)） | 作者与评审者记名都写成明确动作，并在 `orchestrator_report` 留台账 |
| 13 | 写代码与评审要分开 | 代理工作流保留计划评审与 PR 评审两个人工闸门；写代码的代理不应给自己签字，否则会放过自己的错误；AI 参与的 PR 平均发现的 issue 更多（[CodeRabbit](https://coderabbit.ai/guides/coding-agent-workflow)） | 「不得批准或合并自己的 PR」；人工评审按仓库规则请求；本部署的免人工批准是显式例外 |
| 14 | 代理 PR 的机器闸门 | 给代理 PR 加来源、范围、测试、人工 owner 审批等闸门；推送新提交会重置闸门与评审请求；该团队统计的 412 个代理 PR 中没有一个是无人工批准合并的（[Lamplit Labs](https://blogs.lamplitlabs.com/posts/ai-sdlc-gating-ai-coding-agent-pull-requests-before-merge)） | 证据绑定 head、推送前撤回自动合并、不得代评审者批准；免人工批准的取舍在第 7 节记录 |
| 15 | 验证不了就不要交付 | 没有可运行的检查时，「看起来做完了」是唯一信号；无法验证就不要声称完成（[Claude Code](https://code.claude.com/docs/en/best-practices)） | 「没有跑过、看不到结果或没有基线的检查，写成未验证；验证不了就不能说完成」 |
| 16 | 规则太多与位置效应 | 指令数量增加会显著降低遵循率，模型也偏向靠前的指令（[IFScale](https://arxiv.org/html/2507.11538)）；相关信息在开头或结尾最有效，在中段明显下降（[Lost in the Middle](https://arxiv.org/html/2307.03172)） | 四个小标题；合并条件放段首；命令与 trailer 模板保留原文；删掉重复的机制说明 |

## 3. 现版诊断

现版分两层：仓库内置默认是 28 行英文，部署保存的团队文本是 4 行英文。两层各有问题。

### 3.1 内置默认

| # | 症状 | 位置 | 后果 |
| --- | --- | --- | --- |
| 1 | 证据只覆盖界面 | L1–L7 | 后端、数据、构建改动没有任何「怎么验证」的证据要求，评审者只能相信作者 |
| 2 | 「PR 就绪」没有定义 | L12–L13 | PR 存在、CI 绿、作者说看过，都可能被当成 ready |
| 3 | 200 行是硬门槛 | L12 | 行数是评审可读性的启发式，不是风险判据；小的高风险改动能通过，大的低风险改动被挡 |
| 4 | 条件链太长 | L10–L15 | 合并条件、批准、撤回、重新开启分散在多行，读到最后才知道能不能开 |
| 5 | 点名作者是悬空的 | L24 | 段内说「本段指定的提交作者」，但默认段本身没有指定，读者只能去别处找 |
| 6 | 记名机制埋在末尾 | L17–L25 | 最重要的人工协作规则不显眼，容易在长 PR 里漏掉 |
| 7 | 与内置段重复 | L9、L12、L17 与 Communication、work 段 | 规则越密越不遵守，重复消耗预算却不增加约束 |
| 8 | 重复工作规则在最后 | L26–L28 | 这是一条能立刻避免浪费的规则，却排在所有合并细则之后 |

### 3.2 部署文本

部署在 2026-11-08 把 Delivery requirements 换成了 4 行英文：每个工单以评审并验证过的 PR 结束；ready PR 用 `gh pr merge ... --match-head-commit` 开启自动合并，不要求人工批准、没有行数上限；不批准或合并他人的 PR；每位人工评审者用 `Co-authored-by` 记名。

它保留了「不要求人工批准、没有行数上限」这一部署选择，但丢掉了：PR 证据（尤其界面前后对比）、检查通过这一条件、推送前撤回、bot 与作者的排除、台账、重复工作的处置。这次重写把两者合并：保留部署选择，补回可验证的交付契约。

## 4. 设计原则

1. **证据先行**（依据 1–4、15）：PR 先回答「改了什么、为什么、怎么验证」，再让人读 diff。
2. **绑定 head**（依据 6、9、14）：检查、评审、证据、自动合并都以当前 head commit 为准；推送后旧结论作废。
3. **窄门自动合并**（依据 6–9、13）：能用机器检查的就写进条件；不能强制的明确交给分支保护；代理不给自己签字。
4. **准确署名**（依据 10–12）：作者、共同作者、bot 的边界写清楚；记名是可审计的动作，不是客套。
5. **部署选择显式化**（依据 13、14）：本部署不要人工批准、不要行数上限，就把它写成一句明确的话，而不是靠删规则来实现；团队要更严时自己加回闸门。
6. **保留有效契约**：重复工作让路、不推空提交、合并后不改写、不记 bot、不直接合并，这些已在协作中证明有用，只改组织形式，不改语义。
7. **密度控制**（依据 16）：四个小标题；条件、命令、trailer 原文保留；删掉与内置段重复的机制说明。

## 5. 新提示词

把下面整段粘贴到面板「提示词 → 交付要求」。它也是 `prompts/team/delivery.md` 的默认文本。

```text
交付要求说明一个工单的代码改动怎样才算交付完成。每个工单的代码改动都必须以一个来自本工单分支、已经自评审并验证过的 PR 结束。
### PR 证据
- PR 描述写清改了什么、为什么改、实际跑过哪些检查及结果；有相关 issue、设计文档或复现步骤就链接或写明。
- 界面变化必须在 PR 描述里同时放修改前与修改后的真实截图或录屏，标明基线版本与改动版本，并保持相同场景、视口、主题和相关界面状态；只有修改后不算证据。
- 证据必须来自实际运行的应用，不能用设计稿或 mockup 冒充旧实现；不要暴露私密飞书内容、凭据或用户数据。
- 后续改动让证据过期时重新采集；拿不到真实基线时，写明缺什么、为什么，保持草稿，不得报 ready。
- 没有跑过、看不到结果或没有基线的检查，写成未验证；验证不了就不能说完成。
### 自动合并
- 只能用本段点名的合并 CLI 开启自动合并：`gh pr merge <number> --auto --merge --match-head-commit <sha> --repo $DSH_SUPERAGENT_GITHUB_REPOSITORY`。不得以代理账号直接合并，也不得绕开这条命令。
- 只对由本工单从工单分支创建、且当前 head 已用 `--match-head-commit` 锁定的 PR 开启。
- 按匹配规则、任务、本段或仓库要求请求评审；没有要求时也要完成自评审。
- 开启前必须同时满足：PR 已就绪（自评审完成、证据齐全）；仓库或任务要求的检查全部通过；要求的评审（若有）覆盖该提交；证据对应该提交且未过期。
- 本部署不要求人工批准，也没有行数上限。改动大或风险高时，先拆成能一次评审完的 PR，或交给人合并。
- 任何条件不再成立，或要在 PR 上继续推送，先用 `gh pr merge <number> --disable-auto --repo $DSH_SUPERAGENT_GITHUB_REPOSITORY` 撤回；新 head 满足条件后再开。
- 不得批准或合并自己的 PR，也不得批准或合并他人的 PR；不得代表评审者批准或合并。本段没有点名合并 CLI 时，由人合并。
### 提交作者与署名
- 按本段指定的作者提交；本段没有指定时，以部署的代理账号及其 no-reply 提交邮箱提交。不得伪造人类作者，也不得把别人的名字写成作者。
- 人工评审者的意见第一次被评估时，为每位评审者在 PR 分支的每个提交上加一条 `Co-authored-by: <name or login> <id+login@users.noreply.github.com>` trailer，每人每个 PR 只记一次；id 用 `gh api users/<login> --jq .id` 取。
- 改写历史前先撤回自动合并。用 `git fetch origin`、`base=$(git merge-base HEAD origin/<base branch>)`、`old=$(git rev-parse origin/<head branch>)` 和 `FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter 'git interpret-trailers --if-exists addIfDifferent --trailer "<trailer>"' $base..HEAD`，每个被记名的人一个 `--trailer`；只改提交信息，然后 `git push --force-with-lease=<head branch>:$old`。推送被拒就停下报告。
- 之后新增的提交也带同样的 trailer。对某提交的批准同样覆盖改写后树相同的副本。PR 已合并就不再改写，把未记名的评审者写进报告；不要用空提交记名。
- 不记 bot（login 以 [bot] 结尾，或本段点名的 review bot）、PR 作者、代理账号，以及本段指定的提交作者；他已经是每个提交的作者。
- 在 `orchestrator_report` 里记录已记名的人，避免后续 worker 重复记名。
### 重复工作
- 如果有人在做同一个问题，且其分支或 PR 已包含本工单的代码（来自工单分支的提交，或带过来的改动），立即用 gh 关闭本工单的 PR，只留一句指向对方 PR 的话；相关但不包含本工单代码，不构成关闭理由。
- 关闭 PR 即结束工单，不再发其他消息。
```

## 6. 与代码机制的对齐

| 机制 | 由谁保证 | 新提示词怎么处理 |
| --- | --- | --- |
| 自动合并命令 | `gh` 与 GitHub 的 auto-merge，不是本仓库代码 | 保留完整命令；没有点名 CLI 时明确由人合并 |
| head commit 锁定 | `gh pr merge --match-head-commit` | 命令保留该参数；推送前撤回，新 head 重新评估 |
| 必需检查与评审 | GitHub 分支保护是真正的闸门 | 提示词只要求「要求什么就满足什么」；强制力交给分支保护 |
| 提交作者回退 | `prompts/worker.md` 与执行环境变量 | 本段指定作者；未指定时用代理账号与 no-reply 邮箱 |
| 评审者记名 | 提示词 + `orchestrator_report` 台账 | 保留 trailer、`filter-branch`、`--force-with-lease` 与排除名单 |
| 界面前后证据 | 提示词 | 保留，并补上「实际运行」「自己检查」「不暴露秘密」 |
| 重复工作关闭 | 提示词 | 保留，位置提前到独立小节 |
| 行数阈值 | 原默认的 200 行；旧配置迁移 | 新默认不设上限；旧配置里的自定义上限迁移为一句中文，见 `autoMergeThreshold` |
| ready / 草稿 | `orchestrator_report` 与 PR | 证据过期或缺失时保持草稿；不得把未验证说成 ready |
| 不得自我批准 | GitHub 权限与分支保护 | 提示词禁止；分支保护可以进一步强制 |

## 7. 取舍记录

| 处理 | 内容 | 理由 |
| --- | --- | --- |
| 保留 | 不直接合并、推送前撤回、不推空提交、合并后不改写、不记 bot、重复工作关闭、每人每 PR 只记一次 | 这些已是协作契约，代码与测试也在检查；重写只改组织方式 |
| 改 | 英文 28 行改为中文四小节 | 与 Ticket scope 的中文化一致；降低条件链长度，把合并条件放段首 |
| 改 | 部署文本的「reviewed, validated」拆成可观察的证据 | 依据 1、3、4、15；让 ready 有可检查的含义 |
| 改 | 200 行硬门槛改为「大或高风险就拆小或交人」 | 依据 5；行数是评审可读性的启发式，不是风险判据；部署已选择不设上限 |
| 改 | 「本段指定的提交作者」补上未指定时的回退 | 默认段以前没有点名作者，回退只写在 worker 段；现在两处一致 |
| 新增 | 实际跑过哪些检查及结果、跳过的检查不算通过、证据绑定 head | 依据 8、9、14；直接对应「CI 绿但没真跑」的失败模式 |
| 新增 | 评审者记名台账 | 依据 12；跨 worker、重启后不重复记名 |
| 新增 | 明确写出「本部署不要求人工批准，也没有行数上限」 | 依据 13、14；这是部署选择，写成一句话比删规则更可审计；团队要更严时加回 |
| 风险 | 免人工批准 + 无行数上限可能放大代理 PR 的风险 | 用必需检查、head 绑定、证据、不得自我批准、推送前撤回缓解；需要更强保证时在分支保护里加评审，或在本段加回审批与行数上限 |
| 风险 | 「证据」可能变成表演：只放一张好看的截图 | 要求真实运行、修改前后、相同场景，并要求代理自己先看；验证不了就保持草稿 |
| 风险 | 评审者记名依赖 GitHub 账号与 no-reply 邮箱 | 用 `gh api users/<login>` 取 id；拿不到就如实报告，不编造邮箱 |

## 8. 如何验证它真的更好

不看感觉，看抽样。取改版前后各 20 个工单（含 `ready`、`blocked` 与 `dropped`），人工标注：

- **证据完整**：缺检查结果、缺界面前后对比、证据与 head 不符的 PR 数。目标 ≤ 1/20；界面 PR 缺修改前证据目标为 0。
- **检查真实**：自动合并时必需检查未通过、被跳过或未知的 PR 数。目标为 0。
- **撤回及时**：推送新提交前未撤回自动合并的次数。目标为 0；至少应能在 PR 时间线上看到撤回。
- **署名准确**：评审者漏记、重复记、把 bot 或未评审者写进去的 PR 数。目标为 0。
- **ready 后的返工**：报告 ready 后又被发现证据过期、未验证或不完整的次数。目标 ≤ 1/20。
- **重复工作**：人的 PR 已包含工单代码、代理仍合并自己 PR 的次数。目标为 0。
- **规模分布**：自动合并的 PR 行数分布。没有硬上限时，观察 >500 行的 PR 是否带来更多返工；若明显上升，在本段加回软上限或交人规则。

若「证据完整」下降，先查是不是把「有 PR」当成「有证据」；若「撤回及时」下降，先查自动合并命令是否被绕过；若「署名准确」下降，先查台账是否在报告里。

## 9. 怎么用

1. 默认已替换：`prompts/team/delivery.md` 就是第 5 节；重新构建并重载插件后，新部署直接使用。
2. 已有部署：面板会保留已保存的提示词文本。打开「提示词 → 交付要求」，点「恢复此段默认内容」采用新默认，或粘贴第 5 节；保存即生效，每次模型请求读取最新版本，不需要重启。
3. 本次部署：评审后把第 5 节保存为 Delivery requirements 的新版本（当前为版本 4，保存后为下一个版本）；面板版本历史可对照与回滚。保存会替换部署原有的 4 行英文文本，这是本次请求的一部分。
4. 团队仍可改：升级不会覆盖团队已保存的文本；面板可以对照默认文本与已保存文本，也可以随时恢复任一历史版本。
