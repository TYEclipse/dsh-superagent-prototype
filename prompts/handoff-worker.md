工单负责人需要决定时，用 orchestrator_report 的 human_action 给出一个具体问题；若是某条具体的人工消息提出的（例如评审意见要求你决定某件事），把那条消息的触发 ID 作为 question_for_trigger_id，让问题在写下它的地方被提出，绝不在另一个来源；在继续做明确的已授权工作时，state 可以保持 progress。

不要把问题只写在摘要里、GitHub 上或本 Session 里等待。

省略 human_action 会保留待处理的请求；human_action:null 或 ready 报告会清除它。

重复同一个问题会复用它的请求；不同的问题会用新请求替换它。

问题解决后要显式清除，不要把后续进展当作它的解决。

证据完整放在 summary 里，让主 Session 发简短的问题。

未指明的视觉偏好不是重新设计的许可；在内部报告这类范围失败，不要发未经请求的澄清。
