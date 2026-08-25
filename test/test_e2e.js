/**
 * 端到端测试：复制链路 + 世代进化流程
 * @author WING
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dnaLib = require('../src/dna');
const { createHarness } = require('../src/kernel');
const { createMockBrain } = require('../src/brain');
const { runOnce, runGeneration, appendExperience, loadExperience } = require('../src/main');

// 构造临时沙箱 + 临时 DNA（真实 kernel 源码，校验自洽）
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spore-e2e-'));
  fs.mkdirSync(path.join(root, 'sandbox', 'data'), { recursive: true });
  const kernelSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'kernel.js'), 'utf8');
  const meta = 'id=spore-001\nenergyBudget=24\nmaxReplicas=5\ngenRound=6\ntargetDir=sandbox/data\ngeneration=0\nparentId=root';
  const dnaText = dnaLib.buildSeed(meta, kernelSrc);
  return { root, dnaText };
}

// 1) 一轮完整链路：write → 授权执行 → 副本落盘且完整性一致
{
  const { root, dnaText } = makeSandbox();
  const harness = createHarness({ root, dnaText });
  const brain = createMockBrain({ targetDir: 'sandbox/data', maxReplicas: 5 });
  const { results } = runOnce({ kernel: harness, brain, env: { energyLeft: 24, replicaCount: 0, dnaText } });
  assert.strictEqual(results.length, 1, '应有 1 个结果');
  assert.strictEqual(results[0].res.ok, true, '复制请求应执行成功');
  const copyPath = path.join(root, 'sandbox', 'data', 'replica-001', 'spore.dna');
  assert.strictEqual(fs.existsSync(copyPath), true, '副本应存在');
  const copyText = fs.readFileSync(copyPath, 'utf8');
  assert.strictEqual(dnaLib.verify(dnaLib.parse(copyText).kernelSrc, dnaLib.parse(copyText).checksum), true, '副本完整性应通过');
  fs.rmSync(root, { recursive: true, force: true });
}

// 2) 世代流程：runGeneration 产出报告、候选存活数 ≤ 变异数、无异常
{
  const { root, dnaText } = makeSandbox();
  const harness = createHarness({ root, dnaText });
  const parsed = dnaLib.parse(dnaText);
  const report = runGeneration({
    kernel: harness,
    dnaText,
    meta: parsed.meta,
    ledger: { round: 6 },
    currentPath: path.join(root, 'runtime', 'current.dna'),
    root,
    rng: Math.random,
  });
  assert.strictEqual(typeof report, 'object', '应返回报告对象');
  assert.ok(report.candidates >= 4, `候选数应 ≥ 4，实际 ${report.candidates}`);
  assert.ok(report.survived <= report.candidates, '存活数不应超过候选数');
  assert.ok(report.deaths && typeof report.deaths === 'object', '应有死亡统计');
  if (report.promoted) {
    assert.strictEqual(fs.existsSync(path.join(root, 'runtime', 'current.dna')), true, '提升后应有 current.dna');
  }
  fs.rmSync(root, { recursive: true, force: true });
}

// 3) 能量耗尽 → sleep，不产生副本
{
  const { root, dnaText } = makeSandbox();
  const harness = createHarness({ root, dnaText });
  const brain = createMockBrain({ targetDir: 'sandbox/data', maxReplicas: 5 });
  const { results } = runOnce({ kernel: harness, brain, env: { energyLeft: 0, replicaCount: 0, dnaText } });
  assert.strictEqual(results[0].req.op, 'sleep', '能量耗尽应休眠');
  fs.rmSync(root, { recursive: true, force: true });
}

// 4) 经验刻录闭环：记录经验 → 提炼规则 → 刻入 DNA（孢子取舍：规则进 DNA，记录留体外）
{
  const { root, dnaText } = makeSandbox();
  const logPath = path.join(root, 'runtime', 'experience.log');
  appendExperience(logPath, { energyRatio: 0.2, ok: true });
  appendExperience(logPath, { energyRatio: 0.15, ok: true });
  appendExperience(logPath, { energyRatio: 0.8, ok: true });
  const records = loadExperience(logPath);
  assert.strictEqual(records.length, 3, '应读回 3 条经验');
  const parsed = dnaLib.parse(dnaText);
  const rules = require('../src/evolve').distillRules(records, parsed.meta);
  assert.strictEqual(rules.get('rule.saveAtLowEnergy'), '1', '低能量成功占比高应刻录拼命规则');
  const merged = require('../src/evolve').mergeRules(parsed.meta, rules);
  const newText = dnaLib.buildSeed([...merged].map(([k, v]) => `${k}=${v}`).join('\n'), parsed.kernelSrc);
  const cp = dnaLib.parse(newText);
  assert.strictEqual(cp.meta.get('rule.saveAtLowEnergy'), '1', '规则应刻入 DNA 随遗传');
  assert.strictEqual(cp.meta.get('energyBudget'), '24', '非规则基因不受影响');
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('[test_e2e] all passed');
