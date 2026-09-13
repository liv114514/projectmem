# projectmem：可行性调研与集成方案（大纲）

> 生成于 2026-09-13，同日增补"创新模式"一节（§5）。基于 GitHub 实地调研（联网检索 + 抓取项目 README + 逐条查新搜索）。
> star 数为网络口径（部分来自 agentmemory 项目自带的竞品对比表），未逐一核验，量级可信、个位数可能有出入。

---

## 0. 一句话结论

**可行，且推荐直接动手做。** 编程 agent 的"项目记忆"是被 28k+ star 项目验证过的真实需求，主流架构已经收敛（hooks 抓取 + SQLite/Markdown 存储 + 关键词检索 + MCP 接口 + 会话启动注入），不需要发明新东西、只需组合成熟模式。而"**零依赖、原生 Windows 友好、点一下就能用**"这个定位恰好是现有头部项目的空白区，也正好匹配本机条件（Node 22 + agent-forge 零依赖风格）。

**更重要的是差异化：projectmem 不做"又一个记忆工具"，而是换范式——把记忆当"编译产物"而不是"笔记仓库"**（详见 §5，五个 GitHub 查新基本为零的机制）。这条线让项目从"轻量替代品"升级成"没见过的东西"。

**推荐路线：自建轻量版，P0 用纯 Markdown/JSONL 文件起步（1-2 天见效），先不碰任何重依赖。**

---

## 1. projectmem 是什么（项目定义）

- 一句话：给 AI 编程 agent 用的**项目记忆层**——跨会话记住每个项目"做过什么、定了什么、踩过什么坑、下次从哪继续"，让 agent 开新会话时不用重新交代背景。
- 范式定位：**记忆编译器（Memory Compiler）**——记忆不是存出来的，是从项目源（git 历史 + 会话转录 + 文档）确定性编译出来的产物，会失效、能重编、自带证据、算得清收益（§5）。
- 形态：本地 CLI + MCP server + agent hooks 三层接口（见 §6）。
- 服务对象：
  - 自己日常用的 ZCode / Claude Code 等编程 agent；
  - agent-forge（projectmem 可直接作为它的记忆后端）。
- 非目标（第一版不做）：云同步、多人协作、浏览器插件、通用聊天机器人记忆。

## 2. 问题验证：为什么值得做

- 痛点：每个新会话都要重新粘贴项目背景；CLAUDE.md / MEMORY.md 这类自带记忆像"便利贴"——只增不减、会爆上下文、搜不了、跨 agent 不通用。
- 更深一层的痛点（竞品也没解决好）：**记忆会错还不自知**。所有现成方案用"时间衰减"猜测记忆过期，但记忆是否过期取决于**代码变没变**，不是过了几天。
- 佐证（需求真实且市场热）：
  - [agentmemory](https://github.com/rohitg00/agentmemory) 28.4k★，自称"#1 Persistent memory for AI coding agents"，README 开篇就在骂"内置记忆是便利贴"；
  - [claude-mem](https://github.com/thedotmack/claude-mem) 46k+★（文章口径，已更名 Grok Mem），专为 Claude Code 做会话记忆；
  - 通用层 [mem0](https://github.com/mem0ai/mem0) 63k★、[Zep/Graphiti](https://github.com/getzep/graphiti) 30k★——说明"记忆"本身是被充分验证的产品品类。
- 结论：做这个东西不用验证需求，只需要验证**差异化定位**（见 §4、§5）。

## 3. GitHub 竞品调研（四类玩家）

### 3.1 重型记忆引擎（通用 LLM 应用，Python 系）

| 项目 | stars | 说明 | 对 projectmem 的参考价值 |
|---|---|---|---|
| [mem0](https://github.com/mem0ai/mem0) | ~63k | 记忆 API 层，需向量库/托管服务 | 记忆的"提取→去重→更新"流程设计 |
| [Letta](https://github.com/letta-ai/letta)（原 MemGPT） | ~24k | 有状态的 agent 服务器，依赖 Postgres | 分层记忆（working/episodic…）思想 |
| [Zep/Graphiti](https://github.com/getzep/graphiti) | ~30k | 时序知识图谱，依赖 Neo4j | 双时间线失效思想（最接近 §5.1，但靠 LLM 抽取 + 图数据库，重） |
| [Cognee](https://github.com/topoteretes/cognee) | ~30k | 记忆管线（extract→cognify→load） | 管线分阶段思路 |

**判断**：这一类是给"造 AI 应用的开发者"用的运行时/服务，重依赖（Postgres、向量库、图数据库），与"本地零依赖"方向相反。不直接用，只抄思路。

### 3.2 编程 agent 专用（最直接的竞品/参考对象）

| 项目 | stars | 技术栈 | 亮点 | 本机（原生 Windows）的坑 |
|---|---|---|---|---|
| [agentmemory](https://github.com/rohitg00/agentmemory) | 28.4k | TypeScript，Node 20+，SQLite + 自带 iii 引擎（固定版本二进制） | 54 个 MCP 工具、12 个 hooks 自动抓取、BM25+向量+图混合检索、4 层记忆固化与**时间衰减**、隐私过滤层、实时 viewer(:3113)、支持 20+ agent | **原生 Windows 要手动安装 pinned iii.exe**（官方文档自己承认仅支持 1 个 agent 自动接线，其余靠手动），推荐 WSL2/Docker——对"点一下就能用"是硬伤 |
| [claude-mem](https://github.com/thedotmack/claude-mem)（Grok Mem） | 46k+★（文章口径） | Node 20 + Bun + SQLite(FTS5) + Chroma 向量库 + uv(Python) | 5 个 lifecycle hooks 全自动抓取压缩、MCP 搜索"三层渐进式披露"省 token、web viewer、支持 code--zh 中文模式 | 依赖 Bun + uv + Chroma 三件套，安装链长，且引导云注册（cmem.ai）——违背本地零依赖偏好 |

**判断**：两家验证了"hooks 抓取管线 + 混合检索 + MCP"这套架构是对的，但都**重**：agentmemory 绑定 pinned 二进制引擎，claude-mem 三件套依赖。零依赖/原生 Windows 是它们留下的空位。且两家都没有：依赖驱动的失效、证据链、断言、命中率遥测（§5）。

### 3.3 文件派（零依赖路线的先行者）

- **Cline Memory Bank 模式**：纯 Markdown 文件夹（projectbrief / activeContext / decisionLog…），每次会话全量读取。零依赖、人类可读，但靠手动维护、没有检索。方法论见 [Tweag 的 Agentic Coding Handbook](https://tweag.github.io/agentic-coding-handbook/WORKFLOW_MEMORY_BANK/)。
- [claude-code-memory-bank](https://github.com/hudrazine/claude-code-memory-bank)：Cline 方法论在 Claude Code 上的适配实验。
- [Basic Memory](https://github.com/basicmachines-co/basic-memory)：本地 Markdown 知识库 + MCP，主打"数据在自己手里"。
- **agent 自带记忆**：Claude Code 的 [CLAUDE.md / MEMORY.md 机制](https://code.claude.com/docs/en/memory)、ZCode 本地的 MEMORY.md 模式——便利贴式，无检索、会膨胀。

**判断**：文件派证明了"Markdown 优先"是可行且受欢迎的（可读、可 git、可备份），但都停在"手动维护"。**文件派 + 自动抓取 + 真检索 + 会自己过期的记忆 = 空位**，这就是 projectmem 的定位。

### 3.4 通用 MCP 记忆服务（可整体借用的中间件）

- 官方 [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) 的 memory server：知识图谱 JSON，太通用、无编程 agent 场景特化。
- [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service)（SQLite+向量、支持远程）、[simple-memory-mcp](https://github.com/chrisribe/simple-memory-mcp)（SQLite、无云无配置）、[memory-bank-mcp](https://github.com/alioshr/memory-bank-mcp)、[memory-keeper](https://github.com/mkreyman/mcp-memory-keeper)（专攻上下文压缩不丢关键信息）。
- [Mem0 官方的 Claude Code 接入指南](https://mem0.ai/blog/claude-code-memory)：走云托管 MCP——数据出境，不符合本机偏好。

**判断**：这一类证明"零依赖 MCP server"是常见且成熟的形态，protocol 本身很轻（stdio 上的 JSON-RPC），手写没有障碍。

## 4. 可行性分析

### 4.1 直接用现成的行不行？

| 方案 | 一键可用性（本机） | 主要顾虑 |
|---|---|---|
| agentmemory | ❌ 原生 Windows 手动装 iii.exe，推荐 WSL2/Docker | 依赖重、组件多（4 个端口）、出问题排查难 |
| claude-mem | ⚠️ 装得上但要 Bun+uv+Chroma | 依赖三件套 + 云注册引导 |
| Mem0 云版 | ✅ 但 | 数据出境，私有项目内容外泄风险 |
| 文件派 | ✅ | 无自动抓取、无检索，等于回到便利贴 |

结论：**"能跑"和"点一下就能用"之间有鸿沟**，现成方案对本机（原生 Windows + 零依赖偏好 + AI 小白）都不达标。

### 4.2 自建轻量版的技术依据（逐项验证过）

| 组件 | 可行性 | 依据 |
|---|---|---|
| 存储 | ✅ | P0 纯 Markdown/JSONL（零依赖）；P1 用 Node 22 内置 `node:sqlite`——注意 22.x 早期版本需 `--experimental-sqlite` 标志，**动手前先在本机实测**，不行就退化到纯 JSON 索引 |
| 检索 | ✅ | SQLite FTS5 内置 `bm25()` 排序；或纯 JS 手写 BM25（约百行）。不需要向量库也能覆盖 P0-P2 场景 |
| MCP server | ✅ | stdio 版 MCP 就是 JSON-RPC，零依赖手写无障碍；agent-forge 已有同风格基础 |
| 自动抓取 | ✅ | Claude Code / ZCode 均支持 hooks（会话启动/结束/压缩前后）；agentmemory 的 12 hooks 与 claude-mem 的 5 hooks 管线可直接抄思路 |
| git-diff 失效检查 | ✅ | `git diff --name-only` 就能驱动 §5.1 的依赖失效，零依赖、零 LLM |
| 上下文注入 | ✅ | SessionStart hook 注入项目记忆摘要 + token 预算控制（抄 claude-mem 的三层渐进式披露） |
| 隐私过滤 | ✅ | 抓取层做密钥/token 正则过滤（抄 agentmemory 的 privacy filter 层） |

### 4.3 差异化定位（为什么这个能成）

现有头部项目 vs projectmem：

| 维度 | agentmemory / claude-mem | projectmem（目标） |
|---|---|---|
| 依赖 | 引擎二进制 / Bun+uv+Chroma | **零依赖**（Node 22 自带能力） |
| 原生 Windows | ⚠️ 二等公民 | **一等公民**（本机就是 Windows） |
| 数据 | SQLite 黑盒为主（+云引导） | **Markdown/JSONL 优先**（人能直接看、能 git） |
| 记忆过期 | 时间衰减（猜） | **git 依赖驱动（算）+ 断言验证**（§5.1/5.3） |
| 记忆可信度 | 无出处 | **每条带证据收据**（§5.2） |
| 效果度量 | 无 | **命中率账本 + ROI 账本**（§5.4/5.5） |
| 中文 | claude-mem 有支持 | **默认中文场景**（检索分词按中文设计） |
| 上手 | 装环境半天 | **一个 js 文件 + 一条命令** |

## 5. 创新模式：GitHub 上查不到的玩法（项目的灵魂）

> 查新方法（2026-09-13）：用 GitHub 仓库搜索逐条验证，搜索词与结果数原样列出。诚实说明：这只证明"没有现成成熟实现"，不能证明全世界没人想到过；能找到的最接近先例都如实列出。整体判断：**单个机制有人零星想到过（0★ 实验），五个机制合成的架构 + 做到一键可用，GitHub 上没有。**

核心范式一句话：**别人把记忆当"笔记仓库"，projectmem 把记忆当"编译产物"——记忆是从项目源（git + 会话 + 文档）编译出来的，会失效、能重编、自带证据、算得清收益。**

### 5.1 依赖驱动失效：记忆过不过期，看 git，不看日历

- 现有做法：agentmemory 按时间衰减（猜）；claude-mem 不管；Graphiti 双时间线（对但要图数据库 + LLM 抽取）。
- 我们的：每条记忆登记**它管哪些文件**（依赖清单），`git diff --name-only` 一变就精确标旧；时间衰减只当兜底。
- 一句话：**记忆不怕旧，怕错了还不自知。**
- 查新：搜 `agent memory stale git invalidation` → **仅 1 个 0★ 单人实验仓库**（[junha6316/_memory_-_invalidation_](https://github.com/junha6316/_memory_-_invalidation_)，Python，描述正是"依赖变了记忆变馊"）——方向有人想到过，没有能用的实现。
- 为什么零依赖也能做：失效检查就是"读 git diff + 字符串比对"，一段 20 行的 JS。

### 5.2 证据链：每条记忆带"收据"

- 每条记忆强制记录出处：commit hash / 文件路径+行号 / 会话文件链接。agent 引用记忆时能回查原物，人也能点开看。
- 效果：① 防幻觉——没出处的记忆不许入库；② 可验证——"这事是谁在哪个 commit 定的"一查便知；③ §5.1 失效后顺着收据定位重验。
- 查新：搜 `agent memory evidence receipts provenance verifiable` → **0 仓库**。

### 5.3 断言式记忆：决策 = 会挂的测试

- 决策类记忆可带一条**机器可查的断言**。例：记了"本项目零依赖"，就附带检查 `package.json` 无 `dependencies`；记了"API 走 8080 端口"，就附带检查配置文件。
- 会话启动时像跑测试一样跑一遍：**断言挂了 = 记忆过期或决策被违反**，自动标出来提醒 agent。
- 本质：把软件工程界的 ADR（架构决策记录）+ 一致性测试（ArchUnit 那套）搬进 agent 记忆——两个半成品思想在 agent 记忆领域没人合过。
- 查新：`agent memory decision assertion check` 方向 **0 仓库**（软件工程界本身有 ADR/ArchUnit，但 agent 记忆里没有）。
- 防烦设计：断言只标注、不阻断，可一键关。

### 5.4 缓存式闭环：给记忆测命中率，不拍脑袋

- 把"会话启动注入记忆"当**缓存加载**：会话结束后比对"注入了什么" vs "会话里实际用到了什么"（记忆条目关键词是否在对话/工具调用中再现），算出每条记忆的**命中率**。
- 命中率高的记忆升权，连续 0 命中的降权、归档——**按实测效用升降，不按时间**。token 预算内装哪些记忆 = 一个小背包问题。
- 这是记忆系统的"缓存淘汰策略"——CPU 缓存、CDN 都这么做，agent 记忆领域没人做（agentmemory 的衰减是时间代理，不是效用实测）。
- 查新：搜 `agent memory hit rate eviction token budget` → **0 仓库**。
- 诚实备注：命中率是启发式测量，会有失真（agent 用了记忆但没留痕）。方向正确比数字精确重要，账本先记起来。

### 5.5 零 token 记账本：记忆系统第一次能证明自己值不值

- 抓取层**零 LLM 调用**：规则抽取（git log、任务清单、文件统计、正则），P0-P2 全程 0 API 成本——和竞品"LLM 压缩一切"正好相反，LLM 只是可选的最后一道润色。
- 每条记忆记账：它让 agent **省了多少**重新解释背景的 token，减去它注入占用的 token = **净收益**。`pmem roi` 一条命令看损益。
- 对"AI 小白"用户的价值：不用懂原理，看账就知道这玩意儿有没有用、该不该留。
- 查新：**0 仓库**。

### 5.6 合起来：记忆编译器架构

```
源材料            编译器（确定性，零LLM）     产物                     运行时                反馈
git 历史    ──┐                       ┌── 带证据链的记忆库 ──┐── 缓存注入(token预算) ──┐
会话转录    ──┼── 规则抽取/过滤 ──────►│  + 依赖清单          ││ 关键词比对→命中率      ├── 失效/升降权/归档
文档/清单   ──┘                       └── 决策断言          ┘└── git diff→失效检查   ──┘
```

- 这个闭环（派生 → 证据 → 失效 → 遥测 → 记账）是真正的差异点：每个环节都零依赖可实现，合起来 GitHub 上没见过。
- LLM 从"地基"降级为"可选润色"，成本、隐私、确定性三个问题一起解掉。

## 6. 集成方案（Integration）

- **三层接口**（由薄到厚，逐层叠加）：
  1. CLI：`pmem add / query / stale / roi`——点一下就能用，也是其他层的地基；
  2. MCP server（stdio）：接 ZCode、Claude Code 等一切支持 MCP 的 agent；
  3. Hooks：会话结束自动抓取摘要入库（隐私过滤）+ 会话启动注入 + 断言检查 + 失效扫描。
- **双层存储**：每个项目一个 `memory/` 目录（Markdown 人读版 + JSONL 事件日志机器版），都可 git 提交。
- **与 agent-forge 的关系**：projectmem 独立可用，同时作为 agent-forge 的记忆后端；agent-forge 网页控制台后续加一个"记忆面板"（顺便可视化命中率账本和 ROI）。

## 7. MVP 路线图

- **P0（1-2 天）**：单文件 CLI + JSONL 事件日志（append-only，天然可撤销/可重放）+ **证据链字段**（自动记 git commit/文件，成本几乎为零、事后最难补，所以从第一天就要）+ 关键词 grep 查询。验收：一条命令写、一条命令查，零依赖零 LLM。
- **P1（2-3 天）**：**依赖清单 + git-diff 失效扫描（§5.1）** + FTS5/自写 BM25 检索（中文分词实测）+ 零依赖 MCP stdio server。
- **P2（3-5 天）**：Claude Code / ZCode hooks 自动抓取 + SessionStart 注入（token 预算）+ **断言检查（§5.3）+ 缓存遥测与命中率账本（§5.4）+ ROI 账本（§5.5）**。
- **P3（可选）**：本地向量检索（openvino/MiniLM 走 GPU/NPU）、LLM 记忆润色、4 层记忆分层。

## 8. 风险与坑（提前摊开）

1. `node:sqlite` 在 Node 22.x 需要 `--experimental-sqlite` 标志（后续版本才去标志）——P1 动工前先花 10 分钟实测；退化方案：纯 JSON。
2. **中文检索**：FTS5 默认分词器不切中文词——备选 trigram / bigram 预切分，P1 必须实测。
3. token 成本：自动注入记忆会吃上下文预算——必须带预算上限 + 按相关性截断。
4. 隐私：hooks 会抓到会话里的密钥——抓取层先过滤再入库，宁可漏存不可泄密。
5. **创新机制的落地风险**（§5 特有）：
   - 命中率测量会失真（用了没留痕）——接受启发式精度，方向对就行；
   - 断言可能误报烦人——只标注不阻断、可一键关、报错时给出"改记忆还是改代码"的选择；
   - 零 LLM 抽取召回率有限——定位是"兜底层"，P3 的 LLM 润色做增强，不当前提；
   - 依赖清单靠人/规则维护会漏登记——失效扫描同时跑一个"全库模糊比对"兜底。
6. 维护成本：自建=长期自己养。P0/P1 极小（几百行），P2 起需持续跟进 agent 的 hook 规范变化。

## 9. 决策点与下一步

- ✅ 已定：做自建轻量版（理由见 §4）；差异化走"记忆编译器"范式（§5）。
- 待定（不阻塞开工）：P1 存储最终选 SQLite 还是 JSON（实测后定）；MCP server 是否复用 agent-forge 的既有代码。
- 下一步：直接开工 P0——建 `projectmem.js` 单文件 CLI，事件日志 + 证据链从第一天就进数据结构。

---

## 附录 A：调研来源

- 竞品主仓库：[agentmemory](https://github.com/rohitg00/agentmemory) · [claude-mem](https://github.com/thedotmack/claude-mem) · [mem0](https://github.com/mem0ai/mem0) · [Letta](https://github.com/letta-ai/letta) · [Graphiti](https://github.com/getzep/graphiti) · [Cognee](https://github.com/topoteretes/cognee) · [Basic Memory](https://github.com/basicmachines-co/basic-memory) · [claude-code-memory-bank](https://github.com/hudrazine/claude-code-memory-bank)
- MCP 记忆服务：[mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) · [simple-memory-mcp](https://github.com/chrisribe/simple-memory-mcp) · [memory-bank-mcp](https://github.com/alioshr/memory-bank-mcp) · [memory-keeper](https://github.com/mkreyman/mcp-memory-keeper)
- 方法论与文档：[Cline Memory Bank 模式（Tweag Handbook）](https://tweag.github.io/agentic-coding-handbook/WORKFLOW_MEMORY_BANK/) · [Claude Code 官方记忆文档](https://code.claude.com/docs/en/memory) · [Mem0 × Claude Code 指南](https://mem0.ai/blog/claude-code-memory)

## 附录 B：创新查新记录（2026-09-13，GitHub 仓库搜索）

| 查新词 | 结果 | 说明 |
|---|---|---|
| `agent memory stale git invalidation` | **1 个** | [junha6316/_memory_-_invalidation_](https://github.com/junha6316/_memory_-_invalidation_)，0★，单人 Python 实验——方向撞车但无可用品，反而是思路被独立验证的证据 |
| `agent memory hit rate eviction token budget` | **0 个** | §5.4 缓存式闭环无先例 |
| `agent memory evidence receipts provenance verifiable` | **0 个** | §5.2 证据链无先例 |
| §5.3 断言式记忆、§5.5 零 token 记账本 | 0 个（关键词多路搜索） | 无先例；最近亲是软件工程界的 ADR/ArchUnit，未进入 agent 记忆领域 |
