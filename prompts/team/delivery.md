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
