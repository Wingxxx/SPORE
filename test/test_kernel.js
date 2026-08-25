/**
 * Harness 内核测试：权限门授权 / 逃逸拒绝 / 内容约束 / 完整性校验
 * @author WING
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createHarness } = require('../src/kernel');

const DNA_TEXT = '[SPORE-DNA]\nid=spore-001\n\n[KERNEL]\nk\n\n[CHECKSUM]\nchk\n';

/** 构造一个完全自包含的临时沙箱（root 指向临时目录，测试结束即删） */
function makeHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spore-kernel-'));
  fs.mkdirSync(path.join(root, 'sandbox', 'data'), { recursive: true });
  return { root, h: createHarness({ root, dnaText: DNA_TEXT }) };
}

// 1) 合法写：复制 DNA 到 sandbox/data 下 → 通过
{
  const { root, h } = makeHarness();
  const req = { op: 'write', path: 'sandbox/data/replica-001/spore.dna', content: DNA_TEXT };
  assert.strictEqual(h.authorize(req).ok, true, '合法写应授权通过');
  const res = h.execute(req);
  assert.strictEqual(res.ok, true, '合法写应执行成功');
  assert.strictEqual(fs.existsSync(path.join(root, 'sandbox', 'data', 'replica-001', 'spore.dna')), true, '副本应落盘');
  fs.rmSync(root, { recursive: true, force: true });
}

// 2) 路径逃逸：../ 跳出沙箱 → 拒绝
{
  const { root, h } = makeHarness();
  const req = { op: 'write', path: 'sandbox/data/../../seed/evil.js', content: DNA_TEXT };
  assert.strictEqual(h.authorize(req).ok, false, '../ 逃逸应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 3) 越权目录：写 sandbox/data 之外 → 拒绝
{
  const { root, h } = makeHarness();
  const req = { op: 'write', path: 'runtime/pwn.js', content: DNA_TEXT };
  assert.strictEqual(h.authorize(req).ok, false, '越权目录应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 4) 内容约束：写的内容不是 DNA 原文 → 拒绝
{
  const { root, h } = makeHarness();
  const req = { op: 'write', path: 'sandbox/data/x.js', content: 'evil payload' };
  assert.strictEqual(h.authorize(req).ok, false, '非 DNA 内容应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 5) 未知操作 → 拒绝
{
  const { root, h } = makeHarness();
  assert.strictEqual(h.authorize({ op: 'exec', cmd: 'rm -rf /' }).ok, false, '未知操作应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 6) 完整性校验：哈希一致通过，篡改失败
{
  const { root, h } = makeHarness();
  const src = 'kernel-src';
  const chk = crypto.createHash('sha256').update(src, 'utf8').digest('hex');
  assert.strictEqual(h.verifyIntegrity(src, chk), true, '一致应通过');
  assert.strictEqual(h.verifyIntegrity(src, 'tampered-checksum'), false, '篡改应失败');
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('[test_kernel] all passed');
