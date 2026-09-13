# 项目记忆（projectmem 自动生成）

> 重绘于 2026-09-13T23:56:25.613Z。**此文件是投影，勿手改**——改数据请用 pmem 命令或直接看 .pmem/events.jsonl。

## 决策
### [m001] 
零依赖纯 JSONL：单项目≤2000条规模下，刻意不用 SQLite/向量库，换零编译零黑盒
- 证据：commit `f3dfafe` · 依赖 `package.json`（核实于 2026-09-13 16:26）
- 断言：package.json 无运行时依赖

### [m002] 
范式=记忆编译器：git 依赖驱动失效+证据链+断言+ROI账本，五机制查新记录在 docs/feasibility-zh.md 附录B
- 证据：commit `f3dfafe` · 依赖 `docs/feasibility-zh.md`（核实于 2026-09-13 23:56）

## 坑
### [m003] 
本机 Windows：GitHub 惯例走代理 127.0.0.1:7890（须手动开启），但 2026-09-14 实测直连 github.com/api 均通；nodejs.org 直连可通
- 证据：commit `f3dfafe`（核实于 2026-09-13 16:26）

### [m006] 
git push 到 github.com 上传流会卡死（GET 通 POST 卡），备用通道：node /d/Zcode work/.tools/push-via-api.js 走 api.github.com 的 Git Data API；注意 GitHub 会把提交时间归一为 UTC(+0000)
- 证据：commit `2df89f0`（核实于 2026-09-13 16:54）

## 偏好
### [m005] 
交付纪律：先给点一下就能用的形态，原理放后面；对外动作拿不准先问一句
- 证据：commit `f3dfafe`（核实于 2026-09-13 16:26）

## 进度
### [m007] 
仓库已开源：github.com/liv114514/projectmem，含 9 个 topics；README/调研文档/测试/自食用记忆全部上线
- 证据：commit `2df89f0` · 依赖 `README.md`（核实于 2026-09-13 16:54）

### [m008] 
v1.0.0+：P0+P1 全量 + P2 部分（遥测/ROI 账本），11 测试全绿，已开源 github.com/liv114514/projectmem（9 topics）
- 证据：commit `1ec9f3d` · 依赖 `pmem.js`（核实于 2026-09-13 23:56）
