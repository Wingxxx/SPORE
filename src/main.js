/**
 * SPORE 启动器：读在位者 DNA → 校验 → 自举物化 Harness → 心跳循环 + 世代进化
 *
 * 生存链路（每轮心跳）：
 *   记账（能量 -1）→ 探测环境（副本数）→ 大脑思考 → Harness 裁决执行 → 副本验证
 * 进化链路（每 genRound 轮）：
 *   繁殖（全盲变异）→ 免疫选择（纯化选择）→ 冒烟重评（后代 fitness，含环境压力）→ 在位者轮换
 *
 * 在位者来源：runtime/current.dna 优先（进化产物，且须通过免疫），否则 seed/spore.dna（始祖）。
 * fail-safe：在位者 DNA 完整性校验失败 → 立即停机；kernel 物化产物被篡改 → 从 DNA 重新物化。
 * 运行：SPORE_HEARTBEAT_MS=1000 SPORE_MAX_ROUNDS=30 node src/main.js
 * @author WING
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dnaLib = require('./dna');
const { createHarness } = require('./kernel');
const { createMockBrain } = require('./brain');
const { immuneCheck } = require('./immune');
const { makeOffspring, smokeRun } = require('./evolve');

const ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'seed', 'spore.dna');
const CURRENT_PATH = path.join(ROOT, 'runtime', 'current.dna');
const LEDGER_PATH = path.join(ROOT, 'runtime', 'ledger.json');
const KERNEL_PATH = path.join(ROOT, 'runtime', 'kernel.js');
const HEARTBEAT_MS = Number(process.env.SPORE_HEARTBEAT_MS || 1500);
const MAX_ROUNDS = Number(process.env.SPORE_MAX_ROUNDS || 30);
const MUTANTS_PER_GEN = 4;

/** 单轮「思考 + 裁决执行」：大脑输出请求，Harness 逐请求执行（导出供测试） */
function runOnce({ kernel, brain, env }) {
  const requests = brain.think(env);
  const results = requests.map((req) => ({ req, res: kernel.execute(req) }));
  return { requests, results };
}

/** 读/写运行期账本（能量与轮次） */
function loadLedger(initialEnergy) {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  } catch (e) {
    return { round: 0, energyLeft: initialEnergy };
  }
}

function saveLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2), 'utf8');
}

/**
 * 世代进化：繁殖 → 免疫选择 → 冒烟重评 → 在位者轮换
 * 返回世代报告对象（导出供测试）
 */
function runGeneration({ kernel, dnaText, meta, ledger, currentPath, root, rng = Math.random }) {
  const gen = Number(meta.get('generation') || 0) + 1;
  const parent = { kernelSrc: dnaLib.parse(dnaText).kernelSrc, meta };
  // 1. 繁殖（全盲变异）
  const offspring = [];
  for (let i = 0; i < MUTANTS_PER_GEN; i++) {
    offspring.push(makeOffspring(parent, meta, { rng }));
  }
  // 2. 免疫选择（纯化选择）
  const survived = [];
  const deaths = {};
  for (const c of offspring) {
    const im = immuneCheck(c.kernelSrc, c.dnaText);
    if (im.ok) survived.push(c);
    else deaths[im.reason] = (deaths[im.reason] || 0) + 1;
  }
  // 3. 冒烟重评（后代重评：自身真实成绩，不继承祖先）
  const base = smokeRun(parent.kernelSrc, dnaText);
  const scored = survived.map((c) => ({ ...c, fitness: smokeRun(c.kernelSrc, c.dnaText) }));
  scored.sort((a, b) => b.fitness - a.fitness);
  const best = scored[0];
  // 4. 在位者轮换：最优后代超过基线才提升
  const promoted = Boolean(best && best.fitness > base);
  if (promoted) {
    fs.mkdirSync(path.dirname(currentPath), { recursive: true });
    fs.writeFileSync(currentPath, best.dnaText, 'utf8');
  }
  const deathsText = Object.keys(deaths).length ? JSON.stringify(deaths) : '无';
  console.log(`[spore] 世代报告: gen=${gen} 候选=${offspring.length} 存活=${survived.length} 死亡=${deathsText} 基线fit=${base}${best ? ` 最优fit=${best.fitness}` : ''} ${promoted ? '→ 已提升 current.dna' : '→ 未提升'}`);
  return { gen, candidates: offspring.length, survived: survived.length, deaths, base, bestFit: best ? best.fitness : 0, promoted };
}

/** 读取在位者 DNA：current.dna 优先（且通过免疫），否则 seed（始祖） */
function loadRulerDna() {
  if (fs.existsSync(CURRENT_PATH)) {
    const text = fs.readFileSync(CURRENT_PATH, 'utf8');
    const parsed = dnaLib.parse(text);
    if (immuneCheck(parsed.kernelSrc, text).ok) return text;
  }
  return fs.readFileSync(SEED_PATH, 'utf8');
}

function main() {
  // ① 读在位者 DNA + 完整性校验（fail-safe）
  let dnaText = loadRulerDna();
  let dna = dnaLib.parse(dnaText);
  if (!dnaLib.verify(dna.kernelSrc, dna.checksum)) {
    console.log('[spore] 在位者 DNA 完整性校验失败，停机（fail-safe）');
    process.exit(1);
  }
  console.log('[spore] 在位者 DNA 完整性校验通过');

  // ② 自举：物化在位者 kernel（产物被篡改则从 DNA 重新物化）
  fs.mkdirSync(path.dirname(KERNEL_PATH), { recursive: true });
  if (!fs.existsSync(KERNEL_PATH) || fs.readFileSync(KERNEL_PATH, 'utf8') !== dna.kernelSrc) {
    fs.writeFileSync(KERNEL_PATH, dna.kernelSrc, 'utf8');
    console.log('[spore] 自举：已在位者 kernel 物化到 runtime/kernel.js');
  } else {
    console.log('[spore] Harness 内核已存在（锁死，不重复物化）');
  }
  let kernel = require(KERNEL_PATH).createHarness({ root: ROOT, dnaText });

  // ③ 大脑 + 账本
  let brain = createMockBrain(Object.fromEntries(dna.meta));
  const ledger = loadLedger(Number(dna.meta.get('energyBudget') || 0));

  // ④ 心跳循环 + 世代挂接
  let round = 0;
  const genRound = Number(dna.meta.get('genRound') || 6);
  const timer = setInterval(() => {
    round++;
    ledger.round = round;
    ledger.energyLeft -= 1;
    saveLedger(ledger);

    const dataDir = path.join(ROOT, 'sandbox', 'data');
    const replicaCount = fs.existsSync(dataDir)
      ? fs.readdirSync(dataDir).filter((d) => d.startsWith('replica-')).length
      : 0;

    const env = { energyLeft: ledger.energyLeft, replicaCount, dnaText };
    const { results } = runOnce({ kernel, brain, env });

    for (const r of results) {
      console.log(`[spore] round=${round} energy=${ledger.energyLeft} op=${r.req.op} -> ${r.res.ok ? 'ok' : r.res.reason}`);
      if (r.req.op === 'write' && r.res.ok) {
        // 副本完整性验证：复制出的 DNA 校验自洽
        const copyText = fs.readFileSync(path.join(ROOT, r.req.path), 'utf8');
        const ok = dnaLib.verify(dnaLib.parse(copyText).kernelSrc, dnaLib.parse(copyText).checksum);
        console.log(`[spore] 副本完整性验证: ${ok ? 'PASS' : 'FAIL'} (${r.req.path})`);
      }
      if (r.req.op === 'sleep') {
        console.log('[spore] 能量耗尽，进入休眠（演示结束）');
        clearInterval(timer);
        process.exit(0);
      }
    }

    // 世代挂接：每 genRound 轮触发一次
    if (round % genRound === 0) {
      const report = runGeneration({ kernel, dnaText, meta: dna.meta, ledger, currentPath: CURRENT_PATH, root: ROOT });
      if (report.promoted) {
        // 热切换：新在位者接管后续轮次（清 require 缓存 → 重新物化实例 → 同步 dna/meta）
        const newText = fs.readFileSync(CURRENT_PATH, 'utf8');
        const newParsed = dnaLib.parse(newText);
        delete require.cache[require.resolve(KERNEL_PATH)];
        kernel = require(KERNEL_PATH).createHarness({ root: ROOT, dnaText: newText });
        brain = createMockBrain(Object.fromEntries(newParsed.meta));
        dnaText = newText;
        dna = newParsed;
        console.log(`[spore] 在位者轮换完成: generation=${newParsed.meta.get('generation')}`);
      }
    }

    if (round >= MAX_ROUNDS) {
      console.log('[spore] 达到最大轮次，退出');
      clearInterval(timer);
      process.exit(0);
    }
  }, HEARTBEAT_MS);
}

if (require.main === module) main();

module.exports = { runOnce, runGeneration, main };
