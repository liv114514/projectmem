# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

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
