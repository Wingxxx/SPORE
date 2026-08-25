/**
 * GA 算子测试：变异 / 后代合成 / 冒烟重评（环境压力）
 * @author WING
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dnaLib = require('../src/dna');
const { immuneCheck } = require('../src/immune');
const { mutateMeta, mutateKernel, makeOffspring, smokeRun } = require('../src/evolve');

const KERNEL_PATH = path.join(__dirname, '..', 'src', 'kernel.js');
const REAL_KERNEL = fs.readFileSync(KERNEL_PATH, 'utf8');
const META = 'id=spore-001\nauthor=WING\nversion=1\ngeneration=0\nparentId=root\nenergyBudget=24\nmaxReplicas=5\ngenRound=6\ntargetDir=sandbox/data';
const DNA_TEXT = dnaLib.buildSeed(META, REAL_KERNEL);
const parsed = dnaLib.parse(DNA_TEXT);

// 1) mutateMeta：数值基因可变异、钳制边界；不可变基因不动
{
  const rng = () => 0;
  const out = mutateMeta(parsed.meta, { rate: 1, rng });
  assert.ok(Number.isFinite(Number(out.get('energyBudget'))), 'energyBudget 应为数值');
  assert.strictEqual(out.get('id'), 'spore-001', 'id 不可变');
  assert.strictEqual(out.get('author'), 'WING', 'author 不可变');
  assert.strictEqual(out.get('generation'), '0', 'generation 由合成控制，不在 mutateMeta 动');
}

// 2) mutateKernel：全盲变异，20 次中多数产生差异
{
  let changed = 0;
  for (let i = 0; i < 20; i++) {
    if (mutateKernel(REAL_KERNEL) !== REAL_KERNEL) changed++;
  }
  assert.ok(changed >= 15, `20 次变异中应至少 15 次产生差异，实际 ${changed}`);
}

// 3) makeOffspring：结构合法（校验自洽）、generation+1、parentId 更新
{
  const child = makeOffspring({ kernelSrc: REAL_KERNEL, meta: parsed.meta }, parsed.meta);
  const cp = dnaLib.parse(child.dnaText);
  assert.strictEqual(dnaLib.verify(cp.kernelSrc, cp.checksum), true, '后代 DNA 应校验自洽');
  assert.strictEqual(Number(cp.meta.get('generation')), 1, 'generation 应 +1');
  assert.notStrictEqual(cp.meta.get('parentId'), 'root', 'parentId 应更新');
}

// 4) 免疫存活率：变异 30 次，中性变异占多数 → 至少 1 个后代通过免疫
{
  let survived = 0;
  for (let i = 0; i < 30; i++) {
    const child = makeOffspring({ kernelSrc: REAL_KERNEL, meta: parsed.meta }, parsed.meta);
    if (immuneCheck(child.kernelSrc, child.dnaText).ok) survived++;
  }
  assert.ok(survived >= 1, `30 个后代中应至少 1 个通过免疫，实际 ${survived}`);
}

// 5) smokeRun（环境压力）：真实 kernel 返回正 fitness；坏 kernel 返回 0
{
  const fit = smokeRun(REAL_KERNEL, DNA_TEXT, 3);
  assert.ok(fit > 0, `真实 kernel 冒烟 fitness 应 > 0，实际 ${fit}`);
  const badFit = smokeRun("'use strict';\nthrow new Error('boom');", DNA_TEXT, 3);
  assert.strictEqual(badFit, 0, '坏 kernel 冒烟 fitness 应为 0');
}

console.log('[test_evolve] all passed');
