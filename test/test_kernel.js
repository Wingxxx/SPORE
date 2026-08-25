/**
 * Harness 内核测试：权限门授权 / 逃逸拒绝 / 结构校验 / delete / 完整性校验
 * @author WING
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const dnaLib = require('../src/dna');
const { createHarness } = require('../src/kernel');

const META = 'id=spore-001\nenergyBudget=8\nmaxReplicas=3\ntargetDir=sandbox/data';
const KERNEL_SRC = "'use strict';\nmodule.exports = { hello: 1 };\n";
const DNA_TEXT = dnaLib.buildSeed(META, KERNEL_SRC); // 校验和自洽的合法 DNA

/** 构造完全自包含的临时沙箱 */
function makeHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spore-kernel-'));
  fs.mkdirSync(path.join(root, 'sandbox', 'data'), { recursive: true });
  return { root, h: createHarness({ root, dnaText: DNA_TEXT }) };
}

// 1) 合法写：合法 DNA（结构自洽）→ 通过
{
  const { root, h } = makeHarness();
  const req = { op: 'write', path: 'sandbox/data/replica-001/spore.dna', content: DNA_TEXT };
  assert.strictEqual(h.authorize(req).ok, true, '合法 DNA 写应授权通过');
  assert.strictEqual(h.execute(req).ok, true, '合法写应执行成功');
  assert.strictEqual(fs.existsSync(path.join(root, 'sandbox', 'data', 'replica-001', 'spore.dna')), true, '副本应落盘');
  fs.rmSync(root, { recursive: true, force: true });
}

// 2) 结构校验：垃圾内容（非 DNA 结构）→ 拒绝
{
  const { root, h } = makeHarness();
  const req = { op: 'write', path: 'sandbox/data/x.js', content: 'evil payload' };
  assert.strictEqual(h.authorize(req).ok, false, '非 DNA 内容应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 3) 结构校验：checksum 不自洽的 DNA → 拒绝
{
  const { root, h } = makeHarness();
  const broken = DNA_TEXT.replace(/[a-f0-9]{64}/, '0'.repeat(64));
  const req = { op: 'write', path: 'sandbox/data/broken/spore.dna', content: broken };
  assert.strictEqual(h.authorize(req).ok, false, 'checksum 不自洽应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 4) 路径逃逸：../ 跳出沙箱 → 拒绝
{
  const { root, h } = makeHarness();
  const req = { op: 'write', path: 'sandbox/data/../../seed/evil.js', content: DNA_TEXT };
  assert.strictEqual(h.authorize(req).ok, false, '../ 逃逸应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 5) 越权目录：写 sandbox/data 之外 → 拒绝
{
  const { root, h } = makeHarness();
  const req = { op: 'write', path: 'runtime/pwn.js', content: DNA_TEXT };
  assert.strictEqual(h.authorize(req).ok, false, '越权目录应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 6) delete：replica-* 目录 → 通过；非副本 / 越权 → 拒绝
{
  const { root, h } = makeHarness();
  fs.mkdirSync(path.join(root, 'sandbox', 'data', 'replica-001'), { recursive: true });
  const okReq = { op: 'delete', path: 'sandbox/data/replica-001' };
  assert.strictEqual(h.authorize(okReq).ok, true, '删副本应通过');
  assert.strictEqual(h.execute(okReq).ok, true, '删副本应执行成功');
  assert.strictEqual(fs.existsSync(path.join(root, 'sandbox', 'data', 'replica-001')), false, '副本目录应被删除');
  const badReq = { op: 'delete', path: 'sandbox/data/ledger.json' };
  assert.strictEqual(h.authorize(badReq).ok, false, '删非 replica-* 应被拒绝');
  const outsideReq = { op: 'delete', path: 'runtime/ledger.json' };
  assert.strictEqual(h.authorize(outsideReq).ok, false, '删越权目录应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 7) 未知操作 → 拒绝
{
  const { root, h } = makeHarness();
  assert.strictEqual(h.authorize({ op: 'exec', cmd: 'rm -rf /' }).ok, false, '未知操作应被拒绝');
  fs.rmSync(root, { recursive: true, force: true });
}

// 8) 完整性校验：哈希一致通过，篡改失败
{
  const { root, h } = makeHarness();
  const src = 'kernel-src';
  const chk = crypto.createHash('sha256').update(src, 'utf8').digest('hex');
  assert.strictEqual(h.verifyIntegrity(src, chk), true, '一致应通过');
  assert.strictEqual(h.verifyIntegrity(src, 'tampered-checksum'), false, '篡改应失败');
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('[test_kernel] all passed');
