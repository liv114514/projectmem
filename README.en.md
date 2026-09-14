# projectmem (pmem)

> **[中文](README.md) | English**

<!-- CI 徽章待 workflow scope 授权后启用（见 docs/ci-workflow.pending.yml） -->
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Node](https://img.shields.io/node/v/projectmem)

**Zero-dependency project memory for AI coding agents.** One JS file, no install, no cloud, no vector DB. Memory that *expires by git*, carries *evidence receipts*, runs *assertions*, and shows its own *ROI*.

The vibe-coding loop has a hole: every new session starts from amnesia. Built-in `CLAUDE.md` / `MEMORY.md` files are sticky notes — they only grow, can't be searched, and go stale silently. Heavy memory frameworks (agentmemory, claude-mem, mem0…) validate the need but drag in pinned binaries, Bun+uv+Chroma, or a Postgres.

projectmem takes a different paradigm: **memory is a build artifact, not a note pile.**

| | Note piles (existing tools) | Memory compiler (projectmem) |
|---|---|---|
| Where memory comes from | LLM-compressed sessions / hand-written | **Deterministically compiled** from git + sessions + docs; LLM optional |
| When it expires | Time-based decay (guessing) | **git-driven (computed)**: registered file changed → memory goes stale, revert → auto-revives |
| Trustworthiness | No provenance | **Evidence receipts**: commit hash / file paths on every entry |
| Self-check | None | **Assertions**: decisions carry executable checks that can *fail* like tests |
| Measured value | Vibes | **Hit-rate telemetry + ROI ledger** in tokens |

All five mechanisms were novelty-checked against GitHub (2026-09): dependency-driven invalidation had exactly one 0★ experiment; the rest — evidence receipts, assertions, hit-rate telemetry, ROI ledger — zero results. Details in [docs/feasibility-zh.md](docs/feasibility-zh.md) (Chinese).

## Quick start

```bash
git clone https://github.com/liv114514/projectmem && cd projectmem
node pmem.js setup        # installs global `pmem` + prints MCP/hooks/agent configs
```

Then, in any project:

```bash
pmem init
pmem add decision "zero runtime deps allowed" --assert no-deps --file package.json
pmem query dependency
```

That first memory already has the full paradigm: **evidence** (commit + file receipt), **staleness source** (touch `package.json` and it goes stale), **assertion** (anyone actually adds a dependency, `pmem check` flags it).

**Go full-auto (2 pastes):**

1. Paste `pmem agent-instructions` output into `CLAUDE.md` / `AGENTS.md` → your agent reads memory at session start, records decisions/pitfalls as it works, checks staleness when done.
2. Paste the SessionStart hook from `pmem setup` into your agent's `settings.json` → even a lazy agent gets memory force-injected (silent staleness scan + assertions + budgeted injection).

**MCP** (Claude Code / Cursor / any MCP client):

```
claude mcp add projectmem --scope user -- node /path/to/pmem.js mcp
```

## Commands

| Command | What it does |
|---|---|
| `pmem setup` | one-shot install: global command + PATH + paste-ready configs |
| `pmem add <type> <text> [--file p] [--tag t] [--assert check]` | write memory (decision/progress/pitfall/preference/fact/note) |
| `pmem query <keywords>` | CJK-friendly relevance search (bigram + BM25-lite, no vector DB) |
| `pmem stale` | git-driven staleness scan: changed deps → stale; reverted → auto-revive |
| `pmem check` | run all assertions; exit 1 on failure → CI gate |
| `pmem inject [--budget 1500]` | knapsack-pack top memories under a token budget |
| `pmem roi` | ledger: tokens saved vs spent, per memory |
| `pmem hook session-start` | silent scan + assert + inject in one block (for hooks) |
| `pmem security scan [--fix]` / `security verify` | secret redaction scan / event-log tamper detection |
| `pmem mcp` | MCP stdio server (7 tools) |

## Safety

Memory goes into git and possibly onto GitHub, so safety is default-on:

- **Secret redaction on write**: GitHub/AWS/OpenAI/Anthropic/Slack/Google tokens, JWTs, private key blocks, `password=…` assignments → `[REDACTED:<type>]`, original never stored.
- **Tamper-evident event log**: SHA-256 hash chain; `pmem security verify` pinpoints tampered lines.
- **Path fence**: file deps escaping the project root are rejected.
- CI gates: `pmem check`, `pmem security scan`, `pmem security verify` all exit non-zero on findings.

## Storage (git-committable)

```
.pmem/
├── events.jsonl   append-only audit log with hash chain
├── index.json     machine state (atomic writes, self-heals from events)
└── MEMORY.md      human-readable projection (auto-rendered)
```

Deliberately **no SQLite, no vector DB**: target scale is ≤ 2000 entries per project; pure JSON + BM25-lite wins on zero-install, zero black-box, diffable-in-git.

## Roadmap

- ✅ P0/P1: CLI, event log + evidence, staleness, assertions, search, MCP server
- 🔶 P2 (mostly done): telemetry, ROI ledger, one-click setup, session-start hook, agent conventions; session-transcript auto-capture in progress
- ⬜ P3: local vector search, optional LLM polish, memory tiers

Feedback: [Issues](https://github.com/liv114514/projectmem/issues) · [Discussions](https://github.com/liv114514/projectmem/discussions) · If it saves you re-explaining your project, a ⭐ is the whole marketing budget.

MIT © [liv114514](https://github.com/liv114514)
