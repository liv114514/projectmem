import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, utimesSync } from 'node:fs';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PMEM = path.join(__dirname, '..', 'pmem.js');

const mktmp = () => mkdtempSync(path.join(tmpdir(), 'pmem-test-'));
const run = (args, cwd) => spawnSync(process.execPath, [PMEM, ...args], { encoding: 'utf8', cwd });

function gitInit(dir) {
  const r = spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) return false;
  spawnSync('git', ['config', 'user.email', 't@t.local'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 't'], { cwd: dir });
  return true;
}

test('init + add + list + show：证据链落地', () => {
  const tmp = mktmp();
  writeFileSync(path.join(tmp, 'package.json'), '{"name":"x","version":"1.0.0"}');
  let r = run(['init'], tmp);
  assert.ok(r.stdout.includes('已初始化'));
  r = run(['add', 'decision', '本项目零依赖', '--file', 'package.json', '--assert', 'no-deps'], tmp);
  assert.ok(r.stdout.includes('m001'));
  run(['note', 'hello 世界'], tmp);
  r = run(['list'], tmp);
  assert.ok(r.stdout.includes('m001') && r.stdout.includes('m002'));
  const shown = JSON.parse(run(['show', 'm001'], tmp).stdout);
  assert.equal(shown.evidence.files[0], 'package.json');
  assert.equal(shown.deps[0], 'package.json');
  assert.equal(shown.assert.kind, 'no-deps');
});

test('query：中文 bigram 命中并计入效用', () => {
  const tmp = mktmp();
  run(['init'], tmp);
  run(['add', 'decision', 'Windows 下 git push 必须走代理 127.0.0.1:7890'], tmp);
  run(['note', '今天天气不错'], tmp);
  const r = run(['query', '代理'], tmp);
  assert.ok(r.stdout.includes('m001'));
  assert.ok(!r.stdout.includes('天气'));
  const shown = JSON.parse(run(['show', 'm001'], tmp).stdout);
  assert.equal(shown.stats.queryHits, 1);
});

test('query：英文单词命中', () => {
  const tmp = mktmp();
  run(['init'], tmp);
  run(['add', 'fact', 'runtime uses zero dependency policy'], tmp);
  const r = run(['query', 'dependency'], tmp);
  assert.ok(r.stdout.includes('m001'));
});

test('query：--limit 的参数不会被当成关键词（回归）', () => {
  const tmp = mktmp();
  run(['init'], tmp);
  run(['add', 'pitfall', '代理 127.0.0.1:7890'], tmp);
  const r = run(['query', '代理', '--limit', '3'], tmp);
  assert.ok(r.stdout.includes('m001'), '--limit 3 不应污染关键词');
});

test('check：断言通过与失败（失败退出码 1）', () => {
  const tmp = mktmp();
  writeFileSync(path.join(tmp, 'package.json'), '{"name":"x","dependencies":{"left-pad":"1.0.0"}}');
  writeFileSync(path.join(tmp, 'config.js'), 'PORT=8080');
  run(['init'], tmp);
  run(['add', 'decision', ' supposed zero dep ', '--assert', 'no-deps'], tmp);
  run(['add', 'fact', '端口是 8080', '--assert', 'contains:config.js:PORT=8080'], tmp);
  let r = run(['check'], tmp);
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('❌'));
  assert.ok(r.stdout.includes('✅'));
  // 修好之后应该全绿
  writeFileSync(path.join(tmp, 'package.json'), '{"name":"x"}');
  r = run(['check'], tmp);
  assert.equal(r.status, 0);
});

test('stale：文件删除与未来 mtime 都触发变旧，fresh 复活', () => {
  const tmp = mktmp();
  writeFileSync(path.join(tmp, 'a.txt'), 'hello');
  writeFileSync(path.join(tmp, 'b.txt'), 'world');
  run(['init'], tmp);
  run(['add', 'fact', 'a 文件是关键', '--file', 'a.txt'], tmp);
  run(['add', 'fact', 'b 文件是关键', '--file', 'b.txt'], tmp);
  // a：删除；b：把 mtime 推到未来（免睡眠的确定性测试）
  rmSync(path.join(tmp, 'a.txt'));
  const future = new Date(Date.now() + 60_000);
  utimesSync(path.join(tmp, 'b.txt'), future, future);
  let r = run(['stale'], tmp);
  assert.ok(r.stdout.includes('m001') && r.stdout.includes('m002'));
  const shown = JSON.parse(run(['show', 'm001'], tmp).stdout);
  assert.equal(shown.status, 'stale');
  assert.ok(shown.staleReasons[0].includes('不存在'));
  // b 的内容没真的变，人工复核 → fresh
  r = run(['fresh', 'm002'], tmp);
  assert.ok(r.stdout.includes('m002'));
  const b = JSON.parse(run(['show', 'm002'], tmp).stdout);
  assert.equal(b.status, 'active');
  // 没有依赖的条目不参与失效
  run(['note', '无依赖'], tmp);
  r = run(['stale'], tmp);
  assert.ok(r.stdout.includes('检查'));
});

test('stale：git 仓库里提交后改动驱动失效（有 git 则验证证据链）', () => {
  const tmp = mktmp();
  const hasGit = gitInit(tmp);
  writeFileSync(path.join(tmp, 'doc.md'), 'v1');
  if (hasGit) {
    spawnSync('git', ['add', '.'], { cwd: tmp });
    spawnSync('git', ['commit', '-m', 'init', '--no-gpg-sign'], { cwd: tmp });
  }
  run(['init'], tmp);
  let r = run(['add', 'decision', '文档 v1 是基准', '--file', 'doc.md'], tmp);
  if (hasGit) {
    const shown = JSON.parse(run(['show', 'm001'], tmp).stdout);
    assert.ok(shown.evidence.commit, '应自动记录 commit 收据');
    // 提交一次变更（显式把提交时间推到未来，规避 git 1 秒粒度 + 与记忆同秒的误判）
    writeFileSync(path.join(tmp, 'doc.md'), 'v2');
    const futureDate = new Date(Date.now() + 86_400_000).toISOString().replace(/\.\d{3}Z$/, '+00:00');
    const env = { ...process.env, GIT_AUTHOR_DATE: futureDate, GIT_COMMITTER_DATE: futureDate };
    spawnSync('git', ['add', '.'], { cwd: tmp });
    spawnSync('git', ['commit', '-m', 'update doc', '--no-gpg-sign'], { cwd: tmp, env });
    r = run(['stale'], tmp);
    const after = JSON.parse(run(['show', 'm001'], tmp).stdout);
    assert.equal(after.status, 'stale');
    assert.ok(after.staleReasons[0].includes('变更过'));
  } else {
    assert.ok(r.stdout.includes('m001'));
  }
});

test('inject：token 预算装箱 + 计入账本', () => {
  const tmp = mktmp();
  run(['init'], tmp);
  for (let i = 0; i < 5; i++) run(['note', '这是一条用于注入测试的比较长的记忆内容'.repeat(3) + i], tmp);
  const r = run(['inject', '--budget', '400'], tmp);
  assert.ok(r.stdout.includes('projectmem 项目记忆'));
  assert.ok(r.stdout.includes('预算 400'));
  const roi = run(['roi'], tmp);
  assert.ok(roi.stdout.includes('合计'));
});

test('render：MEMORY.md 投影生成', () => {
  const tmp = mktmp();
  run(['init'], tmp);
  run(['add', 'pitfall', '代理坑'], tmp);
  const md = readFileSync(path.join(tmp, '.pmem', 'MEMORY.md'), 'utf8');
  assert.ok(md.includes('自动生成') && md.includes('代理坑') && md.includes('m001'));
});

test('archive：归档后检索不再命中', () => {
  const tmp = mktmp();
  run(['init'], tmp);
  run(['add', 'note', '过时的想法 abcxyz'], tmp);
  run(['archive', 'm001'], tmp);
  const r = run(['query', 'abcxyz'], tmp);
  assert.ok(r.stdout.includes('没有命中'));
});

test('hook session-start：静默扫描+注入一段输出', () => {
  const tmp = mktmp();
  writeFileSync(path.join(tmp, 'a.txt'), 'x');
  run(['init'], tmp);
  run(['add', 'decision', 'a 文件是关键约定', '--file', 'a.txt'], tmp);
  rmSync(path.join(tmp, 'a.txt')); // 触发失效
  const r = run(['hook', 'session-start'], tmp);
  assert.ok(r.stdout.includes('projectmem 项目记忆'), '应输出注入块');
  assert.ok(r.stdout.includes('变旧'), '应提醒有记忆变旧');
  const shown = JSON.parse(run(['show', 'm001'], tmp).stdout);
  assert.equal(shown.status, 'stale');
});

test('agent-instructions：输出可粘贴约定', () => {
  const tmp = mktmp();
  const r = run(['agent-instructions'], tmp);
  assert.ok(r.stdout.includes('projectmem 使用约定') && r.stdout.includes('pmem_add'));
});

test('setup：装垫片到隔离 HOME（不动注册表）', () => {
  const tmp = mktmp();
  fs.mkdirSync(path.join(tmp, 'home'), { recursive: true });
  const env = { ...process.env, PMEM_NO_PATH: '1', USERPROFILE: path.join(tmp, 'home'), HOME: path.join(tmp, 'home') };
  const r = spawnSync(process.execPath, [PMEM, 'setup', '--yes'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, 'setup 应成功: ' + r.stdout + r.stderr);
  const bin = path.join(tmp, 'home', 'bin');
  assert.ok(existsSync(path.join(bin, 'pmem.js')), 'pmem.js 应复制到位');
  assert.ok(existsSync(path.join(bin, 'pmem.cmd')) || !process.platform.startsWith('win') === false, 'Windows 应有 pmem.cmd');
  const shim = readFileSync(path.join(bin, 'pmem.cmd'), 'utf8');
  assert.ok(shim.includes('pmem.js'), '垫片应指向安装目录');
  const r2 = spawnSync(process.execPath, [path.join(bin, 'pmem.js'), 'roi'], { encoding: 'utf8', cwd: tmp });
  assert.ok(r2.stdout.includes('还没有 projectmem 存储'), '安装副本应可独立运行（无存储时给提示）');
});

test('index.json 损坏时从事件日志自动重建', () => {
  const tmp = mktmp();
  run(['init'], tmp);
  run(['add', 'decision', '零依赖约定', '--file', 'package.json'], tmp);
  run(['note', '随手便签'], tmp);
  run(['archive', 'm002'], tmp);
  writeFileSync(path.join(tmp, '.pmem', 'index.json'), '{broken!!', 'utf8');
  const r = run(['list', '--status', 'all'], tmp);
  assert.ok(r.stderr.includes('重建'), '应提示已重建');
  assert.ok(r.stdout.includes('m001') && r.stdout.includes('零依赖约定'), '正文应完整恢复');
  const idx = JSON.parse(readFileSync(path.join(tmp, '.pmem', 'index.json'), 'utf8'));
  assert.equal(idx.entries.length, 2);
  assert.equal(idx.entries.find((e) => e.id === 'm002').status, 'archived', '归档状态应回放保留');
});

test('只读命令不创建存储（不在无关目录留 .pmem）', () => {
  const tmp = mktmp();
  const r = run(['query', '什么'], tmp);
  assert.ok(r.stdout.includes('还没有 projectmem 存储'));
  assert.ok(!existsSync(path.join(tmp, '.pmem')), '不应悄悄创建 .pmem');
  const r2 = run(['check'], tmp);
  assert.ok(r2.stdout.includes('还没有 projectmem 存储'));
  assert.equal(r2.status, 0, '无存储时 check 不应报失败');
  const r3 = run(['hook', 'session-start'], tmp);
  assert.equal(r3.stdout, '', 'hook 在无存储项目应静默');
  assert.ok(!existsSync(path.join(tmp, '.pmem')));
});

test('MCP stdio server 往返', async () => {
  const tmp = mktmp();
  const child = spawn(process.execPath, [PMEM, 'mcp'], { cwd: tmp });
  const msgs = [];
  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (l) => { if (l.trim()) msgs.push(JSON.parse(l)); });
  const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'pmem_add', arguments: { type: 'decision', text: 'MCP 写入的中文记忆', files: ['x.txt'] } } });
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'pmem_query', arguments: { keywords: '中文 记忆' } } });
  await new Promise((res, rej) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (msgs.length >= 4) { clearInterval(iv); res(); }
      else if (Date.now() - t0 > 15000) { clearInterval(iv); rej(new Error('MCP 超时，仅收到 ' + msgs.length + ' 条响应')); }
    }, 50);
  });
  child.kill();
  assert.equal(msgs[0].id, 1);
  assert.equal(msgs[0].result.serverInfo.name, 'projectmem');
  assert.equal(msgs[1].result.tools.length, 7);
  assert.ok(msgs[2].result.content[0].text.includes('m001'));
  assert.ok(msgs[3].result.content[0].text.includes('m001'), 'query 应命中刚写入的条目');
});
