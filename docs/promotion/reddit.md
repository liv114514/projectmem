# Reddit 推广草稿（r/vibecoding、r/ClaudeAI、r/mcp 各发一份，标题微调）

**发帖前注意**：Reddit 反感营销腔。用"我做了解决自己痛点的工具，求反馈"的姿态；别刷小号；回复评论要快。

---

## r/vibecoding 版

**标题**：I built a zero-dependency project memory tool that expires memories by git, not by time (feedback wanted)

**正文**：

Every vibe coding session starts the same way for me: re-explaining my project to the agent, again. I tried the built-in MEMORY.md / CLAUDE.md thing — it's a sticky note that only grows. I tried agentmemory and claude-mem — genuinely impressive, but I'm on native Windows and didn't want a pinned binary engine or a Bun+uv+Chroma stack just to remember things.

So I built projectmem: one JS file, zero npm dependencies, Node 20+. The design bet I haven't seen elsewhere:

1. **Memory expires by git, not by time.** Each memory registers which files it's about. When those files change (git log), the memory goes stale. Revert the change → it auto-revives. Time-decay is only a fallback.
2. **Every memory carries receipts** — the commit hash and file paths that justify it. No provenance, no entry.
3. **Decisions can carry assertions** — I recorded "this project stays zero-dep" and attached a check on package.json. If anyone actually adds a dependency, `pmem check` fails like a test.
4. **It measures itself** — hit-rate tracking per memory + an ROI ledger in tokens. `pmem roi` tells me if the thing is actually worth it.
5. **Secrets get redacted on write** (github/openai/aws tokens, JWTs, `password=...`), and the event log has a SHA-256 hash chain so tampering with memory history is detectable.

It works over MCP (Claude Code, Cursor, anything that speaks MCP) and there's a SessionStart hook that silently scans staleness and injects memories under a token budget.

Repo: https://github.com/liv114514/projectmem (MIT, Chinese+English README)

Honest caveats: it's v1.2.0, single maintainer, session-transcript auto-capture isn't done yet (capture is manual or via MCP tools for now), and search is BM25-lite over bigrams — no vectors, deliberately, up to ~2000 memories per project.

What would make this a keeper for you? What's the first thing you'd want changed?

---

## r/ClaudeAI 版

**标题**：Stop re-explaining your project every session — I made a zero-dep memory layer for Claude Code (MCP + hooks, feedback wanted)

正文要点在 r/vibecoding 版基础上调整：
- 第一段换成 Claude Code 场景（CLAUDE.md 膨胀、/clear 后失忆、compaction 丢上下文）
- 强调接入只有两条粘贴：MCP 注册 + SessionStart hook（`pmem hook session-start`）
- 结尾问：你们的 CLAUDE.md 现在多大了？多久修剪一次？

---

## r/mcp 版

**标题**：projectmem — an MCP memory server where memories expire by git diff and carry commit receipts (zero deps)

正文要点：突出 7 个 MCP 工具（pmem_add/query/inject/stale/check/show/roi）+ 工具描述里内置了"何时该记"的约定 + stdio 零依赖部署（一行 claude mcp add）。结尾问 MCP 客户端兼容性问题。
