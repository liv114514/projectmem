#!/usr/bin/env node
'use strict';
/**
 * projectmem (pmem) — 零依赖的"项目记忆编译器" for AI coding agents
 *
 * 核心理念：记忆不是存出来的笔记，是从项目源（git + 会话 + 文档）编译出来的产物——
 *   会失效（git 依赖驱动）、自带证据（commit/文件收据）、能跑断言、算得清收益（ROI）。
 * 存储：<project>/.pmem/{index.json 机器态, events.jsonl 审计日志, MEMORY.md 人读投影}
 * 依赖：无（Node >= 20）。检索：CJK bigram + BM25-lite 纯 JS 实现。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

const VERSION = '1.0.0';
const DIR = '.pmem';
const INDEX = 'index.json';
const EVENTS = 'events.jsonl';
const MEMORY_MD = 'MEMORY.md';
const SAVED_TOKENS_PER_HIT = 120; // 粗估：命中一条记忆约省下一次背景解释的 120 token
const DAY = 24 * 3600 * 1000;
const STALE_GRACE_MS = 2000; // 同秒级误报宽限

const TYPES = {
  decision: { label: '决策', w: 1.2 },
  pitfall: { label: '坑', w: 1.15 },
  preference: { label: '偏好', w: 1.1 },
  fact: { label: '事实', w: 1.0 },
  progress: { label: '进度', w: 0.9 },
  note: { label: '便签', w: 0.8 },
};

/* ---------------- 基础工具 ---------------- */
const die = (msg, code = 2) => { console.error('错误：' + msg); process.exit(code); };
const nowIso = () => new Date().toISOString();
const cwd = () => process.cwd();
const dirPath = (...p) => path.join(cwd(), DIR, ...p);
const toPosix = (p) => p.split(path.sep).join('/');

function ensureStorage() {
  const d = dirPath();
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
    writeIndex({ seq: 0, entries: [] });
    fs.writeFileSync(dirPath(EVENTS), '', 'utf8');
    render();
    return { created: true };
  }
  return { created: false };
}

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(dirPath(INDEX), 'utf8'));
  } catch {
    return { seq: 0, entries: [] };
  }
}

function writeIndex(idx) {
  const target = dirPath(INDEX);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 1), 'utf8');
  fs.renameSync(tmp, target); // 原子写，防中途崩溃损坏索引
}

function appendEvent(ev) {
  fs.appendFileSync(dirPath(EVENTS), JSON.stringify(Object.assign({ ts: nowIso() }, ev)) + '\n', 'utf8');
}

function nextId(idx) {
  idx.seq = (idx.seq || 0) + 1;
  return 'm' + String(idx.seq).padStart(3, '0');
}

function tokenEstimate(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return cjk + Math.ceil((text.length - cjk) / 4) || 1;
}

/* ---------------- 中文友好分词：英文整词 + 中文 bigram ---------------- */
function tokenize(s) {
  const out = [];
  const lower = String(s).toLowerCase();
  for (const m of lower.matchAll(/[a-z0-9_]+|[\u4e00-\u9fff]+/g)) {
    const t = m[0];
    if (/[\u4e00-\u9fff]/.test(t)) {
      if (t.length === 1) out.push(t);
      else for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    } else out.push(t);
  }
  return out;
}

/* ---------------- git 取证 ---------------- */
function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd: cwd() });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim() || null;
}
const isGitRepo = () => !!git(['rev-parse', '--is-inside-work-tree']);
const currentCommit = () => git(['rev-parse', 'HEAD']);
const commitShort = (h) => (h ? h.slice(0, 7) : null);

// 文件最近一次变更时间：git 提交时间优先，无 git / 未跟踪文件退回 mtime
function lastChangeTs(absFile) {
  const rel = toPosix(path.relative(cwd(), absFile));
  const out = git(['log', '-1', '--format=%ct', '--', rel]);
  if (out && /^\d+$/.test(out)) return parseInt(out, 10) * 1000;
  try { return fs.statSync(absFile).mtimeMs; } catch { return 0; }
}

/* ---------------- 记忆条目 ---------------- */
function findEntry(idx, id) {
  const e = idx.entries.find((x) => x.id === id);
  if (!e) die(`找不到记忆 ${id}（用 pmem list 查看现有条目）`);
  return e;
}

function parseAssert(s) {
  if (s === 'no-deps') return { kind: 'no-deps' };
  const i = s.indexOf(':');
  if (i < 0) die(`断言格式不认识：${s}（支持 no-deps | has-file:<路径> | no-file:<路径> | contains:<路径>:<内容>）`);
  const kind = s.slice(0, i), rest = s.slice(i + 1);
  if (kind === 'has-file' || kind === 'no-file') return { kind, file: rest };
  if (kind === 'contains') {
    const j = rest.indexOf(':');
    if (j < 0) die('contains 断言格式：contains:<文件路径>:<包含的内容>');
    return { kind: 'contains', file: rest.slice(0, j), pattern: rest.slice(j + 1) };
  }
  die(`断言格式不认识：${s}`);
}

function runAssert(a) {
  try {
    if (a.kind === 'no-deps') {
      const p = path.join(cwd(), 'package.json');
      if (!fs.existsSync(p)) return { pass: true, detail: '无 package.json，视作无依赖' };
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      const n = Object.keys(pkg.dependencies || {}).length;
      return n === 0
        ? { pass: true, detail: 'dependencies 为空' }
        : { pass: false, detail: `dependencies 有 ${n} 个：${Object.keys(pkg.dependencies).join(', ')}` };
    }
    const abs = path.resolve(cwd(), a.file);
    if (a.kind === 'has-file') return { pass: fs.existsSync(abs), detail: a.file };
    if (a.kind === 'no-file') return { pass: !fs.existsSync(abs), detail: a.file };
    if (a.kind === 'contains') {
      if (!fs.existsSync(abs)) return { pass: false, detail: `${a.file} 不存在` };
      return { pass: fs.readFileSync(abs, 'utf8').includes(a.pattern), detail: `${a.file} 含 "${a.pattern}"` };
    }
    return { pass: false, detail: '未知断言类型' };
  } catch (e) { return { pass: false, detail: e.message }; }
}

// 依赖驱动的失效判定：文件没了 / 文件在"核实时间"之后变过 → stale。时间衰减只做兜底展示。
function checkFreshness(entry) {
  if (!entry.deps || !entry.deps.length) return { stale: false, reasons: [] };
  const reasons = [];
  for (const dep of entry.deps) {
    const abs = path.resolve(cwd(), dep);
    if (!fs.existsSync(abs)) { reasons.push(`文件已不存在：${dep}`); continue; }
    const ts = lastChangeTs(abs);
    const baseline = new Date(entry.verifiedAt || entry.createdAt).getTime();
    if (ts > baseline + STALE_GRACE_MS) {
      reasons.push(`${dep} 在核实后变更过（${commitShort(currentCommit()) || '工作区'} 时点检测）`);
    }
  }
  return { stale: reasons.length > 0, reasons };
}

/* ---------------- 检索评分（BM25-lite） ---------------- */
function scoreEntries(idx, queryTokens, limit) {
  const pool = idx.entries.filter((e) => e.status !== 'archived');
  const docs = pool.map((e) => {
    const toks = tokenize(e.text)
      .concat(e.tags.flatMap((t) => tokenize(t)))
      .concat(e.deps.flatMap((d) => tokenize(d)));
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    return tf;
  });
  const N = docs.length;
  const df = new Map();
  for (const qt of new Set(queryTokens)) {
    let n = 0;
    docs.forEach((tf) => { if (tf.has(qt)) n++; });
    if (n) df.set(qt, n);
  }
  const now = Date.now();
  const scored = pool.map((e, i) => {
    let s = 0;
    for (const qt of queryTokens) {
      const n = df.get(qt);
      if (!n) continue;
      const tf = docs[i].get(qt) || 0;
      if (!tf) continue;
      s += Math.log(1 + N / n) * (1 + Math.log(tf));
    }
    if (s === 0) return { e, s: 0 };
    const verified = new Date(e.verifiedAt || e.createdAt).getTime();
    const recency = Math.exp(-(now - verified) / (14 * DAY)); // 半衰期 14 天的轻度新近加成
    s *= (0.7 + 0.3 * recency) * (TYPES[e.type] ? TYPES[e.type].w : 1);
    if (e.status === 'stale') s *= 0.6;
    return { e, s };
  });
  return scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);
}

function bumpStat(idx, id, key) {
  const e = idx.entries.find((x) => x.id === id);
  if (!e) return;
  e.stats = e.stats || {};
  e.stats[key] = (e.stats[key] || 0) + 1;
  if (key === 'injections') e.stats.lastInjectedAt = nowIso();
}

/* ---------------- 展示辅助 ---------------- */
const statusMark = (e) => (e.status === 'stale' ? '⚠️变旧' : e.status === 'archived' ? '🗄归档' : '✅');
const fmtTs = (iso) => (iso || '').replace('T', ' ').slice(0, 16);

function entryLine(e, extra = '') {
  const ev = [];
  if (e.evidence && e.evidence.commit) ev.push('commit ' + commitShort(e.evidence.commit));
  if (e.deps && e.deps.length) ev.push('依赖: ' + e.deps.join(', '));
  return `[${e.id}] ${statusMark(e)}${TYPES[e.type] ? TYPES[e.type].label : e.type} ${extra}${e.text}`
    + (ev.length ? `\n      证据｜${ev.join(' · ')}` : '')
    + (e.assert ? `\n      断言｜${assertLabel(e.assert)}` : '');
}
const assertLabel = (a) =>
  a.kind === 'no-deps' ? 'package.json 无运行时依赖'
    : a.kind === 'contains' ? `${a.file} 包含 "${a.pattern}"`
      : `${a.kind === 'has-file' ? '存在' : '不存在'} ${a.file}`;

/* ---------------- 命令实现 ---------------- */
function cmdInit() {
  const { created } = ensureStorage();
  console.log(created
    ? `已初始化 ${DIR}/（index.json + events.jsonl + MEMORY.md）\n上手三步：\n  pmem add decision "本项目零依赖" --assert no-deps\n  pmem query 零依赖\n  pmem stale`
    : `${DIR}/ 已存在，跳过`);
}

// 解析 add 参数：第一个非 flag 是类型，其余非 flag 拼接为正文
function parseAddArgs(args) {
  const opts = { files: [], tags: [], asserts: [], text: [] };
  let type = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file') opts.files.push(args[++i]);
    else if (a === '--tag') opts.tags.push(args[++i]);
    else if (a === '--assert') opts.asserts.push(parseAssert(args[++i]));
    else if (!type) type = a;
    else opts.text.push(a);
  }
  return { type, ...opts };
}

function cmdAdd(argv, forcedType) {
  ensureStorage();
  const { type, files, tags, asserts, text } = forcedType
    ? { type: forcedType, files: [], tags: [], asserts: [], text: argv }
    : parseAddArgs(argv);
  if (!TYPES[type]) die(`记忆类型须是 ${Object.keys(TYPES).join('/')}，正文用引号包住。例：pmem add decision "零依赖"`);
  const content = text.join(' ').trim();
  if (!content) die('正文不能为空。例：pmem add decision "本项目零依赖"');

  const idx = readIndex();
  const deps = [...new Set(files.map((f) => toPosix(path.relative(cwd(), path.resolve(cwd(), f)))))];
  const entry = {
    id: nextId(idx),
    type,
    text: content,
    tags,
    deps,
    evidence: { commit: currentCommit(), files: deps.slice() },
    assert: asserts[0] || null, // 一条一个断言，够用且可预期
    status: 'active',
    staleReasons: [],
    createdAt: nowIso(),
    verifiedAt: nowIso(),
    stats: { queryHits: 0, injections: 0, lastInjectedAt: null },
  };
  idx.entries.push(entry);
  writeIndex(idx);
  appendEvent({ e: 'add', id: entry.id, type, deps });
  render();
  console.log(`已记录 ${entryLine(entry)}\n（${entry.deps.length ? '失效检查依赖 git 记录' : '未登记文件依赖，不会自动变旧；加 --file 可启用'}）`);
}

function cmdList(argv) {
  ensureStorage();
  let type = null, status = 'active,stale', limit = 20;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--type') type = argv[++i];
    else if (argv[i] === '--status') status = argv[++i];
    else if (argv[i] === '--limit') limit = parseInt(argv[++i], 10) || 20;
  }
  const idx = readIndex();
  const statuses = status === 'all' ? null : new Set(status.split(','));
  let list = idx.entries.filter((e) => (!statuses || statuses.has(e.status)) && (!type || e.type === type));
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!list.length) return console.log('（空）还没有记忆。第一条：pmem add decision "..."');
  list.slice(0, limit).forEach((e) => console.log(entryLine(e) + '\n'));
  if (list.length > limit) console.log(`…共 ${list.length} 条，仅显示 ${limit} 条（--limit 调整）`);
}

function cmdShow([id]) {
  ensureStorage();
  const idx = readIndex();
  const e = findEntry(idx, id);
  console.log(JSON.stringify(e, null, 2));
}

function cmdQuery(argv) {
  ensureStorage();
  let limit = 8;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') limit = parseInt(argv[++i], 10) || 8;
    else if (!argv[i].startsWith('--')) rest.push(argv[i]);
  }
  const kw = rest.join(' ').trim();
  if (!kw) die('用法：pmem query <关键词>（可多个，空格分隔；--limit n 调条数）');
  const idx = readIndex();
  const hits = scoreEntries(idx, tokenize(kw), limit);
  if (!hits.length) return console.log(`没有命中 "${kw}"。试更短的关键词，或 pmem list 全量看。`);
  console.log(`查询 "${kw}" · 命中 ${hits.length} 条：`);
  hits.forEach(({ e, s }, i) => {
    console.log(`${i + 1}. ${entryLine(e, `(相关度 ${s.toFixed(2)}) `)}\n`);
  });
  hits.forEach(({ e }) => bumpStat(idx, e.id, 'queryHits'));
  writeIndex(idx); // 命中计入效用账本
}

function cmdStale() {
  ensureStorage();
  const idx = readIndex();
  const now = nowIso();
  let newly = 0, still = 0, ok = 0, checked = 0;
  for (const e of idx.entries) {
    if (e.status === 'archived') continue;
    checked++;
    const r = checkFreshness(e);
    if (r.stale) {
      if (e.status !== 'stale') { newly++; appendEvent({ e: 'stale', id: e.id, reasons: r.reasons }); }
      else still++;
      e.status = 'stale';
      e.staleReasons = r.reasons;
    } else if (e.status === 'stale') { // 依赖又一致了（比如改动被撤销）→ 自动复活
      e.status = 'active';
      e.staleReasons = [];
      appendEvent({ e: 'fresh', id: e.id, reason: '依赖重新一致（自动复核）' });
      ok++;
    } else ok++;
  }
  writeIndex(idx);
  render();
  console.log(`失效扫描完成：检查 ${checked} 条（有文件依赖的才查）`);
  console.log(`  本轮变旧 ${newly} 条 · 维持变旧 ${still} 条 · 正常 ${ok} 条`);
  idx.entries.filter((e) => e.status === 'stale').forEach((e) =>
    console.log(`  ⚠️ [${e.id}] ${e.staleReasons.join('；')}\n      → ${e.text.slice(0, 40)}${e.text.length > 40 ? '…' : ''}\n      → 核实后执行 pmem fresh ${e.id}`));
  if (newly + still === 0) console.log('  所有依赖过的记忆都还是新鲜的。');
}

function cmdFresh([id]) {
  ensureStorage();
  const idx = readIndex();
  const e = findEntry(idx, id);
  e.status = 'active';
  e.staleReasons = [];
  e.verifiedAt = nowIso();
  writeIndex(idx);
  appendEvent({ e: 'fresh', id, reason: '人工复核' });
  render();
  console.log(`[${id}] 已重新核实，失效基线更新到现在。`);
}

function cmdArchive([id]) {
  ensureStorage();
  const idx = readIndex();
  const e = findEntry(idx, id);
  e.status = 'archived';
  writeIndex(idx);
  appendEvent({ e: 'archive', id });
  render();
  console.log(`[${id}] 已归档（不再参与检索与注入，事件日志保留）。`);
}

function cmdCheck() {
  ensureStorage();
  const idx = readIndex();
  const withAssert = idx.entries.filter((e) => e.assert && e.status !== 'archived');
  if (!withAssert.length) return console.log('没有带断言的记忆。记录时加 --assert，例：pmem add decision "零依赖" --assert no-deps');
  let fail = 0;
  for (const e of withAssert) {
    const r = runAssert(e.assert);
    const tag = r.pass ? '✅ 通过' : '❌ 未过';
    console.log(`${tag} [${e.id}] ${assertLabel(e.assert)}\n      （${r.detail}）↳ ${e.text.slice(0, 40)}${e.text.length > 40 ? '…' : ''}`);
    if (!r.pass) {
      fail++;
      const fr = checkFreshness(e);
      console.log(`      → ${fr.stale ? '依赖也变过，记忆很可能过期：pmem fresh ' + e.id + ' 或 pmem archive ' + e.id : '依赖没变：要么记忆要更新，要么决策被违反了，人工判断'}`);
    }
  }
  appendEvent({ e: 'check', pass: withAssert.length - fail, fail });
  process.exit(fail ? 1 : 0);
}

function cmdInject(argv) {
  ensureStorage();
  let budget = 1500;
  const bi = argv.indexOf('--budget');
  if (bi >= 0) budget = parseInt(argv[bi + 1], 10) || 1500;
  const idx = readIndex();
  const now = Date.now();
  // 无查询语境的注入排序：类型权重 × 新近度 × 实测效用 − 变旧惩罚
  const ranked = idx.entries
    .filter((e) => e.status !== 'archived')
    .map((e) => {
      const verified = new Date(e.verifiedAt || e.createdAt).getTime();
      const recency = Math.exp(-(now - verified) / (14 * DAY));
      const utility = ((e.stats.queryHits || 0) + (e.stats.injections || 0)) * 0.1;
      let w = (TYPES[e.type] ? TYPES[e.type].w : 1) * (0.6 + 0.4 * recency) + utility;
      if (e.status === 'stale') w *= 0.5;
      return { e, w, tokens: tokenEstimate(e.text) + 12 };
    })
    .sort((a, b) => b.w - a.w);
  const picked = [];
  let used = 0;
  for (const item of ranked) {
    if (used + item.tokens > budget) continue; // 装不下的跳过（背包式装箱）
    picked.push(item);
    used += item.tokens;
  }
  if (!picked.length) return console.log('（无可注入记忆）');
  console.log(`## projectmem 项目记忆（${picked.length} 条 / 约 ${used} tokens / 预算 ${budget}）`);
  const byType = new Map();
  picked.forEach((p) => { if (!byType.has(p.e.type)) byType.set(p.e.type, []); byType.get(p.e.type).push(p.e); });
  for (const [t, es] of byType) {
    console.log(`### ${TYPES[t] ? TYPES[t].label : t}`);
    es.forEach((e) => console.log(`- [${e.id}]${e.status === 'stale' ? '⚠️' : ''} ${e.text}`));
  }
  console.log('（由 projectmem 自动编译注入）');
  picked.forEach((p) => bumpStat(idx, p.e.id, 'injections'));
  writeIndex(idx);
  appendEvent({ e: 'inject', ids: picked.map((p) => p.e.id), budget, tokens: used });
}

function cmdRoi() {
  ensureStorage();
  const idx = readIndex();
  const rows = idx.entries
    .filter((e) => e.status !== 'archived')
    .map((e) => {
      const hits = (e.stats.queryHits || 0) + (e.stats.injections || 0);
      const saved = hits * SAVED_TOKENS_PER_HIT;
      const cost = (e.stats.injections || 0) * tokenEstimate(e.text);
      return { id: e.id, type: e.type, hits, saved, cost, net: saved - cost };
    })
    .sort((a, b) => b.net - a.net);
  if (!rows.length) return console.log('（还没有可记账的记忆）');
  console.log('记忆 ROI 账本（粗估：命中 1 次 ≈ 省下 120 token 的背景重解释）\n');
  rows.forEach((r) =>
    console.log(`[${r.id}] ${TYPES[r.type] ? TYPES[r.type].label : r.type}  命中 ${r.hits} 次  省 ${r.saved}  耗 ${r.cost}  净 ${r.net >= 0 ? '+' : ''}${r.net}`));
  const tot = rows.reduce((a, r) => ({ saved: a.saved + r.saved, cost: a.cost + r.cost, net: a.net + r.net }), { saved: 0, cost: 0, net: 0 });
  console.log(`\n合计：省 ${tot.saved} · 耗 ${tot.cost} · 净收益 ${tot.net >= 0 ? '+' : ''}${tot.net} tokens`);
  console.log('提示：账本是启发式粗估，方向对了再谈精确。');
}

function cmdRender() { ensureStorage(); render(); console.log(`已重绘 ${DIR}/${MEMORY_MD}`); }

function render() {
  const idx = readIndex();
  const lines = [
    '# 项目记忆（projectmem 自动生成）',
    '',
    `> 重绘于 ${nowIso()}。**此文件是投影，勿手改**——改数据请用 pmem 命令或直接看 .pmem/events.jsonl。`,
    '',
  ];
  for (const [t, meta] of Object.entries(TYPES)) {
    const es = idx.entries.filter((e) => e.type === t && e.status !== 'archived');
    if (!es.length) continue;
    lines.push(`## ${meta.label}`);
    for (const e of es) {
      lines.push(`### [${e.id}] ${e.status === 'stale' ? '⚠️（已变旧）' : ''}`);
      lines.push(e.text);
      if (e.evidence && (e.evidence.commit || e.deps.length)) {
        const bits = [];
        if (e.evidence.commit) bits.push('commit `' + commitShort(e.evidence.commit) + '`');
        if (e.deps.length) bits.push('依赖 ' + e.deps.map((d) => '`' + d + '`').join('、'));
        lines.push(`- 证据：${bits.join(' · ')}（核实于 ${fmtTs(e.verifiedAt || e.createdAt)}）`);
      }
      if (e.assert) lines.push(`- 断言：${assertLabel(e.assert)}`);
      lines.push('');
    }
  }
  fs.writeFileSync(dirPath(MEMORY_MD), lines.join('\n'), 'utf8');
}

function cmdLog(argv) {
  ensureStorage();
  let limit = 20;
  const li = argv.indexOf('--limit');
  if (li >= 0) limit = parseInt(argv[li + 1], 10) || 20;
  const raw = fs.readFileSync(dirPath(EVENTS), 'utf8').trim();
  if (!raw) return console.log('（事件日志为空）');
  const lines = raw.split('\n').slice(-limit);
  console.log(`事件日志（尾部 ${lines.length} 条）：`);
  for (const line of lines) {
    try {
      const ev = JSON.parse(line);
      const payload = ['add', 'fresh', 'archive', 'stale', 'inject', 'check']
        .filter((k) => ev[k] !== undefined)
        .map((k) => `${k}=${typeof ev[k] === 'object' ? JSON.stringify(ev[k]) : ev[k]}`)
        .join(' ');
      console.log(`  ${fmtTs(ev.ts)}  ${ev.e}  ${ev.id || ''} ${payload}`);
    } catch { console.log('  （无法解析的事件行）'); }
  }
}

/* ---------------- MCP stdio server（newline-delimited JSON-RPC） ---------------- */
function mcpSchemaForTools() {
  const str = (desc) => ({ type: 'string', description: desc });
  return [
    {
      name: 'pmem_add', description: '写入一条项目记忆（跨会话长期记忆）。type: decision=决策/progress=进度/pitfall=坑/preference=偏好/fact=事实/note=便签',
      inputSchema: {
        type: 'object', properties: {
          type: { type: 'string', enum: Object.keys(TYPES), description: '记忆类型' },
          text: str('记忆正文'),
          files: { type: 'array', items: { type: 'string' }, description: '相关文件（相对路径），登记后代码一变记忆自动标旧' },
          tags: { type: 'array', items: { type: 'string' } },
          assert: str('可选断言：no-deps | has-file:<路径> | no-file:<路径> | contains:<路径>:<内容>'),
        }, required: ['type', 'text'],
      },
    },
    { name: 'pmem_query', description: '按关键词检索项目记忆（支持中文）。返回最相关条目及证据链', inputSchema: { type: 'object', properties: { keywords: str('关键词，空格分隔'), limit: { type: 'number' } }, required: ['keywords'] } },
    { name: 'pmem_inject', description: '按预算打包一批高价值记忆，用于会话启动时注入上下文', inputSchema: { type: 'object', properties: { budget: { type: 'number', description: 'token 预算，默认 1500' } } } },
    { name: 'pmem_stale', description: '扫描哪些记忆因代码变更而变旧（git 依赖驱动）', inputSchema: { type: 'object', properties: {} } },
    { name: 'pmem_check', description: '运行所有记忆断言（决策是否被违反/记忆是否过期）', inputSchema: { type: 'object', properties: {} } },
    { name: 'pmem_show', description: '查看一条记忆的完整 JSON', inputSchema: { type: 'object', properties: { id: str('如 m001') }, required: ['id'] } },
    { name: 'pmem_roi', description: '查看记忆 ROI 账本（省了多少 token）', inputSchema: { type: 'object', properties: {} } },
  ];
}

function mcpDispatch(name, args) {
  const capture = (fn) => {
    const chunks = [];
    const orig = console.log;
    console.log = (...a) => chunks.push(a.join(' '));
    try { fn(); } finally { console.log = orig; }
    return chunks.join('\n');
  };
  switch (name) {
    case 'pmem_add': {
      const idx = readIndex();
      const entry = {
        id: nextId(idx),
        type: TYPES[args.type] ? args.type : 'note',
        text: String(args.text || ''),
        tags: args.tags || [],
        deps: (args.files || []).map((f) => toPosix(path.relative(cwd(), path.resolve(cwd(), f)))),
        evidence: { commit: currentCommit(), files: [] },
        assert: args.assert ? parseAssert(String(args.assert)) : null,
        status: 'active', staleReasons: [],
        createdAt: nowIso(), verifiedAt: nowIso(),
        stats: { queryHits: 0, injections: 0, lastInjectedAt: null },
      };
      entry.evidence.files = entry.deps.slice();
      idx.entries.push(entry);
      writeIndex(idx);
      appendEvent({ e: 'add', id: entry.id, type: entry.type, via: 'mcp' });
      render();
      return `已记录 ${entry.id}（${TYPES[entry.type].label}）：${entry.text}`;
    }
    case 'pmem_query': {
      const idx = readIndex();
      const hits = scoreEntries(idx, tokenize(String(args.keywords || '')), args.limit || 8);
      hits.forEach(({ e }) => bumpStat(idx, e.id, 'queryHits'));
      writeIndex(idx);
      if (!hits.length) return `没有命中 "${args.keywords}"`;
      return hits.map(({ e }, i) => `${i + 1}. [${e.id}]${e.status === 'stale' ? '⚠️' : ''}${TYPES[e.type].label} ${e.text}${e.deps.length ? '（证据:' + e.deps.join(',') + '）' : ''}`).join('\n');
    }
    case 'pmem_inject': return capture(() => cmdInject(['--budget', String(args.budget || 1500)]));
    case 'pmem_stale': return capture(() => cmdStale());
    case 'pmem_check': {
      const idx = readIndex();
      const list = idx.entries.filter((e) => e.assert && e.status !== 'archived');
      if (!list.length) return '没有带断言的记忆';
      return list.map((e) => {
        const r = runAssert(e.assert);
        return `${r.pass ? '✅' : '❌'} [${e.id}] ${assertLabel(e.assert)}（${r.detail}）`;
      }).join('\n');
    }
    case 'pmem_show': {
      const idx = readIndex();
      const e = idx.entries.find((x) => x.id === args.id);
      return e ? JSON.stringify(e, null, 2) : `找不到 ${args.id}`;
    }
    case 'pmem_roi': return capture(() => cmdRoi());
    default: throw new Error('未知工具：' + name);
  }
}

function startMcp() {
  ensureStorage();
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const err = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  rl.on('line', (line) => {
    const raw = line.trim();
    if (!raw) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; } // 非JSON行直接忽略，保持健壮
    if (msg.jsonrpc !== '2.0' || !msg.method) return;
    const { id, method, params = {} } = msg;
    try {
      if (method === 'initialize') {
        reply(id, { protocolVersion: params.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'projectmem', version: VERSION } });
      } else if (method === 'ping') {
        reply(id, {});
      } else if (method === 'tools/list') {
        reply(id, { tools: mcpSchemaForTools() });
      } else if (method === 'tools/call') {
        const text = mcpDispatch(params.name, params.arguments || {});
        reply(id, { content: [{ type: 'text', text }] });
      } else if (method.startsWith('notifications/')) {
        /* 通知无需应答 */
      } else if (id !== undefined) {
        err(id, -32601, 'method not found: ' + method);
      }
    } catch (e) {
      if (id !== undefined) reply(id, { content: [{ type: 'text', text: '执行失败：' + e.message }], isError: true });
    }
  });
  process.stderr.write(`[projectmem] MCP server v${VERSION} ready on stdio, project=${cwd()}\n`);
}

/* ---------------- 入口 ---------------- */
const HELP = `projectmem (pmem) v${VERSION} — 零依赖的"项目记忆编译器"
记忆不是笔记，是编译产物：会失效、带证据、能断言、算得清收益。

用法：pmem <命令> [参数]
  init                          初始化当前项目的 .pmem/ 存储
  add <类型> <正文> [选项]       写入记忆。类型：decision决策/progress进度/pitfall坑/preference偏好/fact事实/note便签
       --file <路径>             登记文件依赖（可多次）：代码一变，记忆自动变旧
       --tag <标签>              打标签（可多次）
       --assert <断言>           挂上会跑的检查：no-deps | has-file:<p> | no-file:<p> | contains:<p>:<内容>
  note <正文>                   快捷写入便签
  list [--type t] [--status s] [--limit n]   列出（默认 active+stale）
  show <id>                     看一条记忆的完整 JSON
  query <关键词...>             中文友好的相关度检索
  stale                         扫描哪些记忆因代码变更变旧（git 驱动）
  fresh <id>                    人工复核后刷新失效基线
  archive <id>                  归档（退出检索与注入）
  check                         跑所有断言（有失败则退出码 1，可挂 CI）
  inject [--budget n]           按 token 预算打包高价值记忆（给 hooks/agent 用）
  roi                           记忆 ROI 账本（省了多少 token，粗估）
  render                        重绘 MEMORY.md（人读投影）
  log [--limit n]               看事件日志尾部
  mcp                           启动 MCP stdio server（接 Claude Code / ZCode 等）

例：
  pmem init
  pmem add decision "本项目零依赖，不许引入 npm 运行时依赖" --assert no-deps --file package.json
  pmem add pitfall "Windows 下 git push 必须走代理 127.0.0.1:7890" --tag windows
  pmem query 零依赖
  pmem stale && pmem check`;

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);
  switch (cmd) {
    case 'init': return cmdInit();
    case 'add': return cmdAdd(rest);
    case 'note': return cmdAdd(rest, 'note');
    case 'list': return cmdList(rest);
    case 'show': return cmdShow(rest);
    case 'query': return cmdQuery(rest);
    case 'stale': return cmdStale();
    case 'fresh': return cmdFresh(rest);
    case 'archive': return cmdArchive(rest);
    case 'check': return cmdCheck();
    case 'inject': return cmdInject(rest);
    case 'roi': return cmdRoi();
    case 'render': return cmdRender();
    case 'log': return cmdLog(rest);
    case 'mcp': return startMcp();
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return console.log(HELP);
    default:
      die(`不认识的命令：${cmd}\n\n${HELP}`);
  }
}

main();
