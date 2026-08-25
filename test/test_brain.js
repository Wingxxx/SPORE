/**
 * Mock 大脑测试：规则 + 环境 → 动作请求
 * @author WING
 */
'use strict';
const assert = require('assert');
const { createMockBrain } = require('../src/brain');

const RULES = {
  targetDir: 'sandbox/data',
  maxReplicas: 3,
};

// 1) 能量充足 + 副本未满 → 发 write 请求（复制 DNA）
{
  const brain = createMockBrain(RULES);
  const reqs = brain.think({ energyLeft: 5, replicaCount: 0, dnaText: 'DNA' });
  assert.strictEqual(reqs.length, 1, '应有 1 个动作请求');
  assert.strictEqual(reqs[0].op, 'write', '应为 write');
  assert.strictEqual(reqs[0].path, 'sandbox/data/replica-001/spore.dna', '副本路径应递增');
  assert.strictEqual(reqs[0].content, 'DNA', '内容应为 DNA 原文');
}

// 2) 能量耗尽 → sleep
{
  const brain = createMockBrain(RULES);
  const reqs = brain.think({ energyLeft: 0, replicaCount: 0, dnaText: 'DNA' });
  assert.strictEqual(reqs[0].op, 'sleep', '能量耗尽应休眠');
}

// 3) 副本已满 → idle（保持心跳，不再复制）
{
  const brain = createMockBrain(RULES);
  const reqs = brain.think({ energyLeft: 5, replicaCount: 3, dnaText: 'DNA' });
  assert.strictEqual(reqs[0].op, 'idle', '副本满应 idle');
}

// 4) 真实 LLM 接口预留：同签名 stub 存在且明确拒绝在沙箱内调用
{
  const llm = require('../src/brain').createLLMBrain;
  assert.strictEqual(typeof llm, 'function', '应预留 createLLMBrain 接口');
}

// 5) 低能量 + 规则刻录=1（拼命型，经验证明低能量可复制）→ 仍 write
{
  const brain = createMockBrain({ ...RULES, energyBudget: 24, 'rule.saveAtLowEnergy': '1' });
  const reqs = brain.think({ energyLeft: 5, replicaCount: 0, dnaText: 'DNA' }); // 5 < ceil(24*0.3)=8
  assert.strictEqual(reqs[0].op, 'write', '刻录拼命规则应低能量仍复制');
}

// 6) 低能量 + 规则刻录=0（保守型）→ sleep
{
  const brain = createMockBrain({ ...RULES, energyBudget: 24, 'rule.saveAtLowEnergy': '0' });
  const reqs = brain.think({ energyLeft: 5, replicaCount: 0, dnaText: 'DNA' });
  assert.strictEqual(reqs[0].op, 'sleep', '刻录保守规则应低能量休眠');
}

// 7) 能量充足 + 规则=0 → 仍 write（保守规则不抑制正常复制）
{
  const brain = createMockBrain({ ...RULES, energyBudget: 24, 'rule.saveAtLowEnergy': '0' });
  const reqs = brain.think({ energyLeft: 20, replicaCount: 0, dnaText: 'DNA' });
  assert.strictEqual(reqs[0].op, 'write', '能量充足应不受保守规则影响');
}

// 8) 低能量 + 未刻录规则 → 默认保守（省能休眠）
{
  const brain = createMockBrain({ ...RULES, energyBudget: 24 });
  const reqs = brain.think({ energyLeft: 5, replicaCount: 0, dnaText: 'DNA' });
  assert.strictEqual(reqs[0].op, 'sleep', '未刻录规则默认保守休眠');
}

console.log('[test_brain] all passed');
