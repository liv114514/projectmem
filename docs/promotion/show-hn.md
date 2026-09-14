# Show HN 草稿

**发布页**：https://news.ycombinator.com/submit
**标题（HN 标题不要营销词）**：Show HN: Projectmem – project memory for AI agents that expires by git, not time

**首评（发布后立刻自己跟一条）**：

Hi, I built this because every AI coding session started with me re-explaining my project. The existing options split into two camps: sticky-note files (CLAUDE.md/MEMORY.md — they only grow and go stale silently) and heavy memory frameworks (pinned binaries, Bun+uv+Chroma, Postgres).

The design bet: treat memory as a build artifact instead of a note pile.

- Memory entries register the files they're about. git log says the file changed → memory is stale; revert → auto-revives. Time decay is only a fallback.
- Entries carry evidence receipts (commit hash + paths). No provenance, no entry.
- Decisions can carry executable assertions — "zero runtime deps" ships with a package.json check that fails like a test.
- The system measures itself: per-memory hit-rate + an ROI ledger in tokens.
- Secrets are redacted on write; the event log has a SHA-256 hash chain for tamper evidence.

It's a single zero-dependency Node 20+ file (MIT). Works as a CLI, an MCP server (stdio), and via a SessionStart hook that injects memories under a token budget. Deliberately no SQLite/vector DB — pure JSON + BM25-lite with CJK bigrams, targeting ≤2000 entries per project.

Known tradeoffs: no session-transcript auto-capture yet (memory capture is manual or via MCP tools), search is lexical not semantic, single maintainer, and it's three days old.

Repo: https://github.com/liv114514/projectmem

Would love HN's skepticism on the core bet: is git-driven staleness actually better than embedding-based relevance, or am I optimizing the wrong axis?

**HN 提醒**：标题里别加感叹号；评论区被质疑时贴数据别贴情绪；有人在 issues 提 bug 优先处理。
