---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Always include:

- originating workflow or `standalone`;
- exact unresolved question;
- purpose of the next session;
- authoritative artifacts to read by path or URL;
- return target;
- condition that ends the detour or permits the next workflow;
- suggested skills.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

When the handoff starts a bounded detour such as `prototype`, `research`, or `technical-spike`, the receiving session must preserve the return target. Its closing handoff must state the answer or verdict, link the evidence, and return to the originating workflow and unresolved question. A handoff transfers context; it does not authorize a downstream transition.
