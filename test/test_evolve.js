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
const { mutateMeta, mutateKernel, makeOffspring, smokeRun, distillRules, mergeRules } = require('../src/evolve');

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

// 2) mutateKernel：全盲变异，选定算子必然产生差异；随机变异也会产生差异
{
  // 确定性 rng：始终选中注释插入算子（必变）
  const rng = () => 0.05; // Math.floor(0.05*5)=0 → editInsertComment
  assert.notStrictEqual(mutateKernel(REAL_KERNEL, { rng }), REAL_KERNEL, '注释插入应产生差异');
  // 随机变异 20 次：全盲变异整体应至少 1 次产生差异
  let changed = 0;
  for (let i = 0; i < 20; i++) {
    if (mutateKernel(REAL_KERNEL) !== REAL_KERNEL) changed++;
  }
  assert.ok(changed >= 1, `20 次随机变异应至少 1 次产生差异，实际 ${changed}`);
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

// 6) distillRules：低能量成功占比高 → 刻录拼命规则；无低能量成功 → 保守规则
{
  const meta = new Map(dnaLib.parse(DNA_TEXT).meta);
  const records1 = [
    { energyRatio: 0.2, ok: true },
    { energyRatio: 0.15, ok: true },
    { energyRatio: 0.8, ok: true },
  ];
  const rules1 = distillRules(records1, meta);
  assert.strictEqual(rules1.get('rule.saveAtLowEnergy'), '1', '低能量成功占比高应刻录拼命规则');
  const records0 = [
    { energyRatio: 0.9, ok: true },
    { energyRatio: 0.8, ok: true },
    { energyRatio: 0.85, ok: true },
  ];
  const rules0 = distillRules(records0, meta);
  assert.strictEqual(rules0.get('rule.saveAtLowEnergy'), '0', '无低能量成功应刻录保守规则');
}

// 7) makeOffspring 保留规则基因（rule.* 由刻录通道管理；低频变异不破坏既有规则）
{
  const meta = new Map(dnaLib.parse(DNA_TEXT).meta);
  meta.set('rule.saveAtLowEnergy', '1');
  const child = makeOffspring({ kernelSrc: REAL_KERNEL, meta }, meta, { rng: () => 0.5 }); // 确定性 rng：不触发规则翻转
  const cp = dnaLib.parse(child.dnaText);
  assert.strictEqual(cp.meta.get('rule.saveAtLowEnergy'), '1', '规则基因应随后代遗传');
}

// 8) mergeRules：规则并入 meta（不碰非规则基因），容量超限淘汰最旧
{
  const meta = new Map(dnaLib.parse(DNA_TEXT).meta);
  const rules = new Map([
    ['rule.saveAtLowEnergy', '1'],
    ['rule.replicateUnderCrowd', '0'],
  ]);
  const merged = mergeRules(meta, rules);
  assert.strictEqual(merged.get('rule.saveAtLowEnergy'), '1', '新规则应并入');
  assert.strictEqual(merged.get('rule.replicateUnderCrowd'), '0', '新规则应并入');
  assert.strictEqual(merged.get('energyBudget'), '24', '非规则基因不受影响');
}

console.log('[test_evolve] all passed');
