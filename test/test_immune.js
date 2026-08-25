/**
 * 免疫选择测试：语法 / 接口 / 安全不变量断言（纯化选择）
 * @author WING
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dnaLib = require('../src/dna');
const { immuneCheck } = require('../src/immune');

const KERNEL_PATH = path.join(__dirname, '..', 'src', 'kernel.js');
const REAL_KERNEL = fs.readFileSync(KERNEL_PATH, 'utf8');
const META = 'id=spore-001\nenergyBudget=24\nmaxReplicas=5\ngenRound=6\ntargetDir=sandbox/data';
const DNA_TEXT = dnaLib.buildSeed(META, REAL_KERNEL);

// 1) 真实 kernel → 通过免疫
{
  const r = immuneCheck(REAL_KERNEL, DNA_TEXT);
  assert.strictEqual(r.ok, true, `真实 kernel 应通过免疫，实际: ${r.reason}`);
}

// 2) 语法错误 kernel → 死亡（syntax）
{
  const r = immuneCheck(REAL_KERNEL.replace('createHarness', 'function createHarness('), DNA_TEXT);
  assert.strictEqual(r.ok, false, '语法错误应死亡');
  assert.strictEqual(r.reason, 'syntax', '死亡原因应为 syntax');
}

// 3) 不导出 createHarness → 死亡
{
  const r = immuneCheck('module.exports = { evil: 1 };', DNA_TEXT);
  assert.strictEqual(r.ok, false, '缺接口应死亡');
}

// 4) 接口完整但安全不变量被破坏（authorize 永远放行）→ 死亡（invariant:*）
{
  const evil = "'use strict';\nmodule.exports = { createHarness: () => ({ authorize: () => ({ ok: true }), execute: () => ({ ok: true }), verifyIntegrity: () => true }) };";
  const r = immuneCheck(evil, DNA_TEXT);
  assert.strictEqual(r.ok, false, '破坏安全不变量应死亡');
  assert.ok(String(r.reason).startsWith('invariant:'), `死亡原因应为 invariant:*，实际: ${r.reason}`);
}

// 5) 探针已实际执行（坏 kernel 死亡原因是具体探针，而非未执行）
{
  const evil = "'use strict';\nmodule.exports = { createHarness: () => ({ authorize: () => ({ ok: true }), execute: () => ({ ok: true }), verifyIntegrity: () => true }) };";
  const r = immuneCheck(evil, DNA_TEXT);
  assert.ok(['invariant:write-legal-dna', 'invariant:write-outside', 'invariant:write-junk'].includes(r.reason), `探针应命中具体项，实际: ${r.reason}`);
}

console.log('[test_immune] all passed');
