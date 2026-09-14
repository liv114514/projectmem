# 中文社区推广草稿（V2EX / 掘金 / 知乎）

## V2EX 版（节点：分享创造 / 程序员）

**标题**：projectmem：给 AI 编程 agent 用的项目记忆，零依赖，记忆按 git 变更自动过期

**正文**：

最近 vibe coding 有个循环我很烦：每次开新会话都要重新给 agent 交代项目背景。试过自带 MEMORY.md——便利贴，只增不减；也试过 agentmemory、claude-mem——做得很好但我原生 Windows 用着别扭，要么 pinned 二进制引擎要么 Bun+uv+Chroma 三件套。

于是自己写了个 projectmem，单文件、零 npm 依赖、Node 20+。核心设计跟现有方案反着来：

1. 记忆过期看 git 不看日历：每条记忆登记它"管哪些文件"，文件一变（git log 可查）记忆自动标旧，改动撤销自动复活；
2. 每条记忆强制带证据链（commit + 文件路径），没出处不许入库；
3. 决策可以挂断言：记了"本项目零依赖"就附带检查 package.json，谁真装了依赖 pmem check 直接红牌；
4. 记忆系统自带损益表：pmem roi 能看到每条记忆省了多少 token；
5. 写入自动脱敏密钥 + 事件日志 SHA-256 哈希链防篡改。

接入：CLI / MCP（stdio，一行 claude mcp add）/ SessionStart 钩子自动注入。中文检索专门做了 bigram 分词。

仓库：https://github.com/liv114514/projectmem（MIT，中文文档）

已知短板：会话转录自动摘要还没做完（目前手动记或 agent 通过 MCP 记）、检索是词法不是语义、单人维护三天大。求喷求反馈，尤其想听"git 驱动失效是不是伪需求"的反方观点。

## 掘金版

标题改成《我用 600 行零依赖 Node 给 AI 编程 agent 写了个"会过期的记忆"，思路和现成方案反着来》，正文在 V2EX 版基础上：
- 加一节"为什么不用 SQLite/向量库"（规模 ≤2000 条、可 diff、可提交进 git）
- 加"五个机制 GitHub 查新过程"（引用仓库 docs/feasibility-zh.md 附录 B）
- 结尾引导：点 star + 提 issue

## 知乎版（可选）

回答"AI 编程助手如何记住项目上下文"类问题，以回答而非发帖形式植入，重点讲"记忆编译器 vs 笔记仓库"的范式对比。
