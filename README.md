# projectmem（pmem）

**[中文](README.md) | [English](README.en.md)**

<!-- CI 徽章待 workflow scope 授权后启用（见 docs/ci-workflow.pending.yml） -->
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Node](https://img.shields.io/node/v/projectmem)

> 零依赖的**项目记忆编译器**——让 AI 编程 agent 跨会话记住你的项目：做过什么、定了什么、踩过什么坑，代码一变记忆自动变旧。
>
> **Zero-dependency project memory compiler for AI coding agents.** Memory that expires by git, carries receipts, runs assertions, and shows its own ROI.

`一个 js 文件 · 0 依赖 · Node ≥ 20 · Windows/macOS/Linux · 中文友好`

---

## 为什么

每个 AI 编程 agent 都有同一个病：**新会话失忆**。你要重新粘贴项目背景；agent 自带的 CLAUDE.md / MEMORY.md 像便利贴——只增不减、搜不了、过期了也不知道。

现有方案（[agentmemory](https://github.com/rohitg00/agentmemory)、[claude-mem](https://github.com/thedotmack/claude-mem) 等）验证了需求，但它们依赖重（固定版本二进制引擎 / Bun+uv+Chroma）、原生 Windows 是二等公民、数据进 SQLite 黑盒。

## 核心理念：记忆是编译产物，不是笔记仓库

| | 笔记仓库（现有方案） | 记忆编译器（projectmem） |
|---|---|---|
| 记忆从哪来 | LLM 压缩会话 / 手写 | **从项目源确定性编译**：git + 会话 + 文档，LLM 只是可选润色 |
| 何时过期 | 按时间衰减（猜） | **git 依赖驱动（算）**：登记的文件一变，记忆精确标旧 |
| 可信度 | 无出处 | **每条带证据收据**：commit hash / 文件路径 |
| 对错自证 | 不能 | **断言式记忆**：决策挂上可执行的检查，像测试一样会"挂" |
| 效果度量 | 拍脑袋 | **命中率遥测 + ROI 账本**：省了多少 token，账上见 |

五个机制在 GitHub 上逐条查新（2026-09，详见 [docs/feasibility-zh.md](docs/feasibility-zh.md) 附录 B）：依赖驱动失效仅 1 个 0★ 实验仓库撞过方向，其余为 0 结果。

## 快速开始

**Windows：下载/克隆仓库 → 双击 `install.cmd` → 完事。**（没有 Node 也没关系，脚本会指路）

**任何系统**：`node pmem.js setup`——自动装好全局 `pmem` 命令并配置 PATH，然后打印三份"即贴即用"配置：MCP 接入、SessionStart 自动注入钩子、**agent 自动记忆约定**。

**极简党**：不装也行，就地用——

```bash
node pmem.js init
node pmem.js add decision "本项目零依赖，不许引入 npm 运行时依赖" --assert no-deps --file package.json
node pmem.js query 零依赖
```

第一条记忆就带上了完整范式：**证据**（自动记录 commit + 依赖文件）、**失效源**（package.json 一变它就变旧）、**断言**（谁真装了依赖，`pmem check` 当场红牌）。

### 想要"全自动"？两步做完上面的事

1. **把 `pmem agent-instructions` 输出的约定块贴进 CLAUDE.md / AGENTS.md**——从此 agent 每次会话开始自动读记忆、过程中自动记决策/进度/坑、结束前自动查失效；
2. **把 `pmem setup` 打印的 SessionStart 钩子粘进 agent 的 settings.json**——即使 agent 偷懒，会话启动也会强制注入记忆（静默跑失效扫描 + 断言 + 按预算注入）。

## 命令总览

| 命令 | 作用 |
|---|---|
| `pmem add <类型> <正文> [--file 路径] [--tag 标签] [--assert 检查]` | 写入记忆（decision/progress/pitfall/preference/fact/note） |
| `pmem note <正文>` | 快捷便签 |
| `pmem query <关键词...>` | 中文友好相关度检索（CJK bigram + BM25-lite） |
| `pmem stale` | 失效扫描：登记文件删除/变更 → 记忆标旧，改动撤销自动复活 |
| `pmem fresh <id>` | 人工复核后刷新失效基线 |
| `pmem check` | 跑所有断言；有失败退出码 1，可直接挂 CI |
| `pmem inject [--budget 1500]` | 按 token 预算装箱高价值记忆（给 hooks 用） |
| `pmem roi` | ROI 账本：每条记忆省/耗/净收益（粗估） |
| `pmem list / show / archive / render / log` | 日常管理 |
| `pmem mcp` | 启动 MCP stdio server |

## 接进你的 agent

**MCP**（Claude Code / ZCode / Cursor 等通用，server 以启动时的工作目录为项目根）：

```bash
# Claude Code
claude mcp add projectmem -- node /path/to/pmem.js mcp
```

```jsonc
// 其他客户端的 mcpServers 配置
{ "projectmem": { "command": "node", "args": ["/path/to/pmem.js", "mcp"] } }
```

工具集：`pmem_add`（带证据写入）、`pmem_query`（检索）、`pmem_inject`（预算注入）、`pmem_stale`（失效扫描）、`pmem_check`（断言）、`pmem_show`、`pmem_roi`。

**会话启动自动注入**（以 Claude Code hooks 为例，加进 settings.json；或直接跑 `pmem setup` 让它帮你生成）：

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node /path/to/pmem.js hook session-start" }] }]
  }
}
```

`pmem hook session-start` 一段输出做完三件事：静默失效扫描（git 驱动）→ 静默断言检查 → 按 1500 token 预算注入记忆，末尾附提醒行。

**CI 卡口**：`pmem check` 退出码非 0 即失败——决策被违反或记忆过期，构建直接红。

## 安全

记忆要进 git、可能推上 GitHub——所以安全不是可选项，是默认行为：

- **密钥防泄漏（写入即脱敏，默认开启）**：GitHub/OpenAI/AWS/Slack/Google 的 token、JWT、私钥块、`password=…` 类赋值，写入前自动替换为 `[REDACTED:<类型>]`，**原值不落盘**。宁可漏存，不可泄密。
- **完整性哈希链**：事件日志每条带 SHA-256 链式哈希，`pmem security verify` 可检测历史记录被篡改（谁改过、第几行）。
- **注入检测**：`pmem security scan` 会标记疑似提示注入的记忆（"ignore previous instructions" 类），报告不阻断。
- **路径围栏**：登记文件依赖越出项目根（`../`、绝对路径外逃）直接拒绝。
- **CI 卡口**：`pmem security scan`（有发现退出码 1）与 `pmem check`、`pmem security verify` 都可挂 CI。

## 存储布局（全部可提交进 git）

```
.pmem/
├── events.jsonl   事件日志（append-only 审计流：add/fresh/archive/stale/inject/check）
├── index.json     机器态（原子写）
└── MEMORY.md      人读投影（自动重绘，勿手改）
```

- 记忆数据在你手里：纯文本、可 diff、可备份、可跨机器同步。
- 设计取舍：**刻意不用 SQLite / 向量库**。目标规模是单项目 ≤ 2000 条，纯 JSON + BM25-lite 完全够，换来零依赖、零编译、零黑盒。超了再升级（见路线图）。

## 与现成项目对比

| 维度 | agentmemory (28.4k★) | claude-mem (46k+★) | projectmem |
|---|---|---|---|
| 依赖 | 固定版本 iii 引擎二进制 | Bun + uv + Chroma | **0** |
| 原生 Windows | 需手动装引擎，推荐 WSL2 | 安装链长 | **一等公民** |
| 记忆过期 | 时间衰减 | — | **git 依赖驱动 + 断言验证** |
| 记忆出处 | 无 | 无 | **commit/文件收据** |
| 效果度量 | 无 | 无 | **命中率 + ROI 账本** |
| 抓取成本 | LLM 压缩 | LLM 压缩 | **0 token（规则抽取）** |

## 路线图

- ✅ **P0**：单文件 CLI + JSONL 事件日志 + 证据链 + 中文检索
- ✅ **P1**：git 依赖失效扫描 + 断言 + 预算注入 + MCP stdio server
- 🔶 **P2**（大半完成）：命中率遥测、ROI 账本、SessionStart 自动注入钩子（`hook session-start`）、agent 自动记忆约定、一键安装（`setup` / `install.cmd`）已上线；会话转录自动摘要抓取进行中
- ⬜ **P3**：本地向量检索（openvino/MiniLM）、LLM 记忆润色（可选层）、4 层记忆分层

## 开发

```bash
npm test        # node --test test/（含 MCP stdio 往返测试）
```

调研、查新与可行性论证全文：[docs/feasibility-zh.md](docs/feasibility-zh.md)。

## 反馈与共建

- **报 bug / 提需求**：[Issues](https://github.com/liv114514/projectmem/issues)（模板会引导你贴诊断信息；先跑 `pmem security scan` 确认不带密钥）
- **用法讨论 / 晒你的玩法**：[Discussions](https://github.com/liv114514/projectmem/discussions)
- 觉得省下了重新交代背景的时间，就点个 ⭐——这是独立开发者的全部推广预算
- 版本变更见 [CHANGELOG.md](CHANGELOG.md)

## License

MIT © [liv114514](https://github.com/liv114514)
