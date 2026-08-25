/**
 * Mock 大脑：读 DNA 规则 + 环境信息 → 结构化动作请求数组
 *
 * 意图层设计：大脑永远不执行任何操作，只输出动作请求 { op, path?, content? }，
 * 由 Harness 权限门裁决。繁衍使命从规则自然涌现：
 *   能量 > 0 且副本未满 → write（复制 DNA）
 *   能量耗尽          → sleep（休眠）
 *   副本已满          → idle（保持心跳，不复制）
 *
 * 真实 LLM 接口预留：createLLMBrain 与 Mock 同签名，真实实现只需
 * 将 (rules, env) 序列化发给模型，并把其工具调用解析为动作请求。
 * 沙箱内不联网，故仅保留接口契约（stub）。
 * @author WING
 */
'use strict';

/** 确定性 Mock 大脑（规则解释器） */
function createMockBrain(rules) {
  return {
    think(env) {
      const energyLeft = env.energyLeft;
      const replicaCount = env.replicaCount;
      const targetDir = rules.targetDir;
      const maxReplicas = rules.maxReplicas;
      if (energyLeft <= 0) return [{ op: 'sleep' }];
      if (replicaCount >= maxReplicas) return [{ op: 'idle' }];
      const next = String(replicaCount + 1).padStart(3, '0');
      return [{ op: 'write', path: `${targetDir}/replica-${next}/spore.dna`, content: env.dnaText }];
    },
  };
}

/** 真实 LLM 大脑接口占位（沙箱内不可用，仅定义契约） */
function createLLMBrain(/* apiKey, model */) {
  throw new Error('真实 LLM 接口需联网调用，沙箱内禁用；请改用 createMockBrain');
}

module.exports = { createMockBrain, createLLMBrain };
