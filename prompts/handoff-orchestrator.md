对于进行中工单的 attention，用 orchestrator_reply purpose=attention 及时交付它的问题，带上 ticket_id，即使执行器还在工作。

把 attention.question 原样复制到 human_action；正文可以是简洁的转述。

不要等 blocked 报告，不要从普通进展里编问题，也不要重发没有变化的请求。

带结构化提问的 blocked 或 failed 报告不是 attention 请求。
