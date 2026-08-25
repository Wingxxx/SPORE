/**
 * 端到端测试：思考 → 授权 → 复制 → 副本完整性
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
const { runOnce } = require('../src/main');

// 构造临时沙箱 + 临时 DNA（与真实 seed 同构）
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spore-e2e-'));
  fs.mkdirSync(path.join(root, 'sandbox', 'data'), { recursive: true });
  const meta = 'id=spore-001\nenergyBudget=8\nmaxReplicas=3\ntargetDir=sandbox/data';
  const dnaText = dnaLib.buildSeed(meta, "'use strict';\nmodule.exports = {};\n");
  return { root, dnaText };
}

// 1) 一轮完整链路：write 请求 → Harness 授权执行 → 副本落盘且完整性一致
{
  const { root, dnaText } = makeSandbox();
  const harness = createHarness({ root, dnaText });
  const brain = createMockBrain({ targetDir: 'sandbox/data', maxReplicas: 3 });
  const { results } = runOnce({ kernel: harness, brain, env: { energyLeft: 8, replicaCount: 0, dnaText } });
  assert.strictEqual(results.length, 1, '应有 1 个结果');
  assert.strictEqual(results[0].res.ok, true, '复制请求应执行成功');
  const copyPath = path.join(root, 'sandbox', 'data', 'replica-001', 'spore.dna');
  assert.strictEqual(fs.existsSync(copyPath), true, '副本应存在');
  const copyText = fs.readFileSync(copyPath, 'utf8');
  const parsed = dnaLib.parse(copyText);
  assert.strictEqual(dnaLib.verify(parsed.kernelSrc, parsed.checksum), true, '副本完整性应通过');
  fs.rmSync(root, { recursive: true, force: true });
}

// 2) 能量耗尽 → sleep，不产生副本
{
  const { root, dnaText } = makeSandbox();
  const harness = createHarness({ root, dnaText });
  const brain = createMockBrain({ targetDir: 'sandbox/data', maxReplicas: 3 });
  const { results } = runOnce({ kernel: harness, brain, env: { energyLeft: 0, replicaCount: 0, dnaText } });
  assert.strictEqual(results[0].req.op, 'sleep', '能量耗尽应休眠');
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('[test_e2e] all passed');
