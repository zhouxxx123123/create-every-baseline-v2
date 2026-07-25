---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Spin up a **background agent** to do the research, so you keep working while it reads.

Before delegating, record:

- the originating workflow or `standalone`;
- the exact question the research must answer;
- the artifact, conversation, issue, or decision the caller must resume;
- the evidence needed for the caller to continue.

Its job:

1. Investigate the question against **primary sources** — official docs, source code, specs, first-party APIs — not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.
4. When the research informs a product decision, explain in plain language how well the evidence fits the user's actual needs, including important mismatches or limits.

Research is a bounded evidence-gathering detour, not a replacement main flow. When it finishes, report the findings file and return to the recorded caller and unresolved question. The caller decides whether to continue discussion, prototype, validate technically, or enter a downstream skill.

If invoked standalone, report the answer and recommend at most one explicit next workflow. Do not invoke it silently.
