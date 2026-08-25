/**
 * 进化器官（遗传算法算子）：全盲变异 / 后代合成 / 冒烟重评
 *
 * 第一性原理：
 *   - 变异全面盲目（不设保护带），多数致死（免疫选择过滤），少数中性/有益——对应生物学
 *   - 后代重评：fitness = 候选自己冒烟运行的真实成绩，不继承祖先（达尔文式，非拉马克式）
 *   - 冒烟注入环境压力：正常 / 能量紧张 / 副本拥挤 三种场景——无选择压力则只有漂变，
 *     有压力才有优劣之分（对应"环境筛选"）
 *   - checksum 由变异算子合法重算（buildSeed 内部完成），是进化的"盖章"而非篡改
 * @author WING
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const dnaLib = require('./dna');

/** 可变异数值基因及其边界 */
const NUMERIC_GENES = {
  energyBudget: [4, 64],
  maxReplicas: [1, 8],
  genRound: [2, 12],
};
const IMMUTABLE_GENES = new Set(['id', 'author', 'version', 'generation', 'parentId']);

/** meta 数值基因变异：±1 钳制边界，不可变基因跳过 */
function mutateMeta(meta, { rate = 0.5, rng = Math.random } = {}) {
  const out = new Map(meta);
  for (const key of Object.keys(NUMERIC_GENES)) {
    if (!out.has(key) || rng() >= rate) continue;
    const cur = Number(out.get(key));
    const delta = rng() < 0.5 ? -1 : 1;
    const [lo, hi] = NUMERIC_GENES[key];
    out.set(key, String(Math.max(lo, Math.min(hi, cur + delta))));
  }
  return out;
}

// ---- kernel 全盲变异算子（加权随机，多数中性） ----

/** 插入注释行（中性） */
function editInsertComment(src, rng) {
  const lines = src.split('\n');
  const i = Math.floor(rng() * lines.length);
  lines.splice(i, 0, `  // mutation-${Math.floor(rng() * 1e9).toString(36)}`);
  return lines.join('\n');
}

/** 重命名 token（大多中性；破坏引用的变异会被免疫选择过滤） */
function editRenameToken(src, rng) {
  const keywords = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'module', 'exports', 'require', 'true', 'false', 'new', 'typeof', 'delete', 'in', 'of', 'this', 'null', 'undefined']);
  const tokens = src.match(/[A-Za-z_]\w{2,}/g) || [];
  const candidates = tokens.filter((t) => !keywords.has(t));
  if (!candidates.length) return src;
  const pick = candidates[Math.floor(rng() * candidates.length)];
  const suffix = Math.floor(rng() * 900) + 100; // 3 位数字后缀
  return src.split(pick).join(pick + suffix);
}

/** 数值常量微调（行为微调，改写可能影响逻辑边界） */
function editTweakNumber(src, rng) {
  return src.replace(/\b(\d+)\b/g, (m) => {
    if (rng() < 0.8) return m;
    const v = Number(m);
    const delta = rng() < 0.5 ? -1 : 1;
    return String(Math.max(0, v + delta));
  });
}

/** 比较运算符翻转（大概率破坏不变量 → 免疫过滤） */
function editFlipComparison(src, rng) {
  return src.replace(/([<>]=?)/g, (m) => {
    if (rng() < 0.9) return m;
    return m === '>' ? '<' : m === '<' ? '>' : m === '>=' ? '<=' : '>=';
  });
}

/** 布尔翻转（大概率致死） */
function editFlipBoolean(src, rng) {
  return src.replace(/\b(true|false)\b/g, (m) => (rng() < 0.9 ? m : m === 'true' ? 'false' : 'true'));
}

const EDITORS = [editInsertComment, editRenameToken, editTweakNumber, editFlipComparison, editFlipBoolean];

/** 全盲 kernel 变异：随机选择一种编辑算子 */
function mutateKernel(kernelSrc, { rng = Math.random } = {}) {
  const fn = EDITORS[Math.floor(rng() * EDITORS.length)];
  return fn(kernelSrc, rng);
}

/** meta 文本序列化 */
function metaToText(meta) {
  return [...meta].map(([k, v]) => `${k}=${v}`).join('\n');
}

/** 合成后代：kernel 全盲变异 + meta 变异 + generation/parentId 血缘写入 + checksum 重算 */
function makeOffspring(parent, parentMeta, { rng = Math.random } = {}) {
  const kernelSrc = mutateKernel(parent.kernelSrc, { rng });
  const meta = mutateMeta(parentMeta, { rng });
  meta.set('generation', String(Number(parentMeta.get('generation') || 0) + 1));
  meta.set('parentId', `${parentMeta.get('id') || 'spore'}>${Math.floor(rng() * 1e6).toString(36)}`);
  return { kernelSrc, dnaText: dnaLib.buildSeed(metaToText(meta), kernelSrc) };
}

/**
 * 冒烟重评（后代重评 + 环境压力）：候选 kernel 在隔离临时沙箱真实运行
 *
 * 三种环境场景构成选择压力（无压力则漂变，有压力才分优劣）：
 *   场景 0 正常    —— 能量每轮递减 2，副本从 0 逐步积累
 *   场景 1 能量紧张 —— 预算打 6 折起步，暴露能量预算差异（耗尽边界不同）
 *   场景 2 副本拥挤 —— 副本从 1 起步逼近上限，暴露 maxReplicas 差异（上限越高复制越多）
 * fitness = 成功写副本数 × 写副本成功率；异常/语法错误 → 0。
 * 只统计 write 成功（繁殖成绩），sleep/idle 不计繁殖分——"生得多者适应度高"。
 */
function smokeRun(kernelSrc, dnaText, rounds = 6) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spore-smoke-'));
  const kPath = path.join(tmpDir, 'k.js');
  try {
    fs.mkdirSync(path.join(tmpDir, 'sandbox', 'data'), { recursive: true });
    fs.writeFileSync(kPath, kernelSrc, 'utf8');
    const h = require(kPath).createHarness({ root: tmpDir, dnaText });
    const meta = dnaLib.parse(dnaText).meta;
    const energyBudget = Number(meta.get('energyBudget') || 24);
    const maxReplicas = Number(meta.get('maxReplicas') || 5);
    const brain = require('./brain').createMockBrain(Object.fromEntries(meta));

    const scenarios = [
      // 场景 0：正常
      (i) => ({ energyLeft: Math.max(0, energyBudget - i * 2), replicaCount: Math.min(i, maxReplicas) }),
      // 场景 1：能量紧张（预算 6 折起步）
      (i) => ({ energyLeft: Math.max(0, Math.ceil(energyBudget * 0.6) - i), replicaCount: Math.min(i, maxReplicas) }),
      // 场景 2：副本拥挤（副本从 1 起步逼近上限）
      (i) => ({ energyLeft: Math.max(0, energyBudget - i), replicaCount: Math.min(maxReplicas, 1 + i) }),
    ];

    let writeOk = 0;
    let total = 0;
    for (const scene of scenarios) {
      for (let i = 0; i < rounds; i++) {
        const reqs = brain.think({ ...scene(i), dnaText });
        for (const req of reqs) {
          total++;
          let res;
          try {
            res = h.execute(req);
          } catch (e) {
            return 0;
          }
          if (res && res.ok && req.op === 'write') writeOk++;
        }
      }
    }
    return total === 0 ? 0 : writeOk * (writeOk / total);
  } catch (e) {
    return 0;
  } finally {
    delete require.cache[require.resolve(kPath)];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { mutateMeta, mutateKernel, makeOffspring, smokeRun, NUMERIC_GENES };
