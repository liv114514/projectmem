# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [1.4.0] - 2026-10-09

### 增长：30 秒 aha moment
- **pmem demo**：临时目录自动跑通完整闭环（带证据写入 → 检索 → 代码一变记忆自动变旧 → 复核复活 → 断言红牌），每一幕都是真实命令真实输出，看完即删
- **pmem export --format claude-md**：把记忆编译成紧凑 Markdown 块（按类型分组、保状态标记），`pmem export >> AGENTS.md` 即完成手动接入
- README 快速开始新增 demo 入口；路线图 P2 更新

## [1.3.0] - 2026-10-09

### 并发与性能（P0）
- **写入并发锁**：MCP server 常驻 + CLI 临时进程并发写索引不再互相覆盖（`index.lock` 独占创建 + 抖动重试 + 陈旧锁自愈，finally 保证释放）
- **事件日志 O(1) 摊销**：appendEvent 不再全量重读 events.jsonl 取尾哈希，改为尾部扩窗读取 + 进程内缓存
- **修复：日志 <4KB 时尾哈希读取跳过导致哈希链断裂**（v1.2 遗留，security verify 可复现）

### 安全（P1）
- **脱敏误伤修复**：credential_assign 值做熵二次校验（短值/低熵/纯数字保留原文），key 含 budget/limit/timeout 等排除词跳过；宁漏存不泄密原则不变
- **MCP 坏断言不再杀 server**：parseAssert 改为抛错，CLI 层自行 die；坏 type/坏 assert 返回带正确示例的 isError 文案，坏 files 降级并提示

### 工程与可信度（P1）
- **CI 正式启用**：`.github/workflows/ci.yml`（Node 20/22 × ubuntu/windows 矩阵），README 加 CI 徽章
- README 竞品 star 数据更新并注明日期（agentmemory 29.2k★ / claude-mem 98k★，截至 2026-10-09 GitHub API 实查）
- keywords 优化（移除「中文」，补 agent-memory / context-management）
- 新增 4 个回归测试：并发不丢条目、小文件哈希链、脱敏熵校验、MCP 参数校验

## [1.2.0] - 2026-09-14

### 安全模块
- **密钥写入即脱敏**（默认开启）：GitHub/AWS/OpenAI/Anthropic/Slack/Google token、JWT、私钥块、Bearer、`password=` 类赋值 → `[REDACTED:<类型>]`，原值不落盘（`PMEM_NO_REDACT=1` 可关）
- **事件日志 SHA-256 哈希链**：`pmem security verify` 检测历史篡改并报告行号
- **注入检测**：`security scan` 标记疑似提示注入记忆（报告不阻断）
- **路径围栏**：文件依赖越出项目根拒绝登记（CLI exit 2 / MCP isError）

### 反馈与社区
- Issue 模板（bug/feature）+ Discussions 反馈渠道（含欢迎帖）
- 双语 README（中文/English 切换）
- GitHub Actions CI 待 workflow scope 授权后启用（文件备好在 `docs/ci-workflow.pending.yml`）

## [1.1.0] - 2026-09-14

### 一键安装与全自动接入
- `pmem setup`：全局 `pmem` 命令（cmd/bash 双垫片，cmd 自动 chcp 65001）+ 用户 PATH（保留原值）+ MCP/钩子/agent 约定三份即贴即用配置
- `install.cmd`：Windows 双击入口，自动探测系统/便携 Node
- `pmem hook session-start`：静默失效扫描 + 断言 + 按预算注入，一段输出
- `pmem agent-instructions`：可粘贴的 agent 自动记忆约定

## [1.1.1] - 2026-09-14

### 代码审查修复
- 事件日志升级为完整可重建源：index.json 损坏时自动重建，不再静默清空
- 只读命令不再悄悄创建 `.pmem`（防垃圾目录）
- git 子进程经济化（memo 缓存）+ 收据引用真正改动文件的 commit
- `cmdStale`/`cmdHook` 合并；多 `--assert` 从静默丢弃改为警告

## [1.0.0] - 2026-09-13

### 首个公开版本
- 单文件 CLI + JSONL 事件日志 + 证据链（commit/文件收据）
- git 依赖驱动失效（改动→标旧，撤销→自动复活）
- 断言式记忆（no-deps / has-file / no-file / contains）
- 中文友好检索（CJK bigram + BM25-lite）
- 预算注入 + 命中率遥测 + ROI 账本
- MCP stdio server（7 工具）
