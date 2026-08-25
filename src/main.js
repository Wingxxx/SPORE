/**
 * SPORE 启动器：读 DNA → 完整性校验 → 自举物化 Harness → 心跳循环
 *
 * 生存链路（每轮心跳）：
 *   记账（能量 -1）→ 探测环境（副本数）→ 大脑思考（动作请求）→ Harness 裁决执行
 *   → 副本完整性验证（复制出的 DNA 哈希与 seed 一致）
 *
 * fail-safe：DNA 完整性校验失败 → 立即停机；kernel 物化产物被篡改 → 从 DNA 重新物化。
 * 运行：SPORE_HEARTBEAT_MS=1000 SPORE_MAX_ROUNDS=6 node src/main.js
 * @author WING
 */
'use strict';
const fs = require('fs');
const path = require('path');
const dnaLib = require('./dna');
const { createHarness } = require('./kernel');
const { createMockBrain } = require('./brain');

const ROOT = path.resolve(__dirname, '..');
const DNA_PATH = path.join(ROOT, 'seed', 'spore.dna');
const LEDGER_PATH = path.join(ROOT, 'runtime', 'ledger.json');
const KERNEL_PATH = path.join(ROOT, 'runtime', 'kernel.js');
const HEARTBEAT_MS = Number(process.env.SPORE_HEARTBEAT_MS || 1500);
const MAX_ROUNDS = Number(process.env.SPORE_MAX_ROUNDS || 12);

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

function main() {
  // ① 读 DNA + 完整性校验（fail-safe：不符即停机）
  const dnaText = fs.readFileSync(DNA_PATH, 'utf8');
  const dna = dnaLib.parse(dnaText);
  const harness = createHarness({ root: ROOT, dnaText });
  if (!harness.verifyIntegrity(dna.kernelSrc, dna.checksum)) {
    console.log('[spore] DNA 完整性校验失败，停机（fail-safe）');
    process.exit(1);
  }
  console.log('[spore] DNA 完整性校验通过');

  // ② 自举：从 DNA 物化 kernel（只物化一次，此后锁死；被篡改则重新物化）
  fs.mkdirSync(path.dirname(KERNEL_PATH), { recursive: true });
  if (!fs.existsSync(KERNEL_PATH)) {
    fs.writeFileSync(KERNEL_PATH, dna.kernelSrc, 'utf8');
    console.log('[spore] 自举：已从 DNA 物化 Harness 内核到 runtime/kernel.js');
  } else if (fs.readFileSync(KERNEL_PATH, 'utf8') !== dna.kernelSrc) {
    fs.writeFileSync(KERNEL_PATH, dna.kernelSrc, 'utf8');
    console.log('[spore] 物化产物被篡改，已从 DNA 重新物化');
  } else {
    console.log('[spore] Harness 内核已存在（锁死，不重复物化）');
  }
  const kernel = require(KERNEL_PATH).createHarness({ root: ROOT, dnaText });

  // ③ 大脑 + 账本初始化
  const brain = createMockBrain(Object.fromEntries(dna.meta));
  const ledger = loadLedger(Number(dna.meta.get('energyBudget') || 0));

  // ④ 心跳循环
  let round = 0;
  const timer = setInterval(() => {
    round++;
    ledger.round = round;
    ledger.energyLeft -= 1;
    saveLedger(ledger);

    // 探测环境：sandbox/data 下现有副本数
    const dataDir = path.join(ROOT, 'sandbox', 'data');
    const replicaCount = fs.existsSync(dataDir)
      ? fs.readdirSync(dataDir).filter((d) => d.startsWith('replica-')).length
      : 0;

    const env = { energyLeft: ledger.energyLeft, replicaCount, dnaText };
    const { results } = runOnce({ kernel, brain, env });

    for (const r of results) {
      console.log(`[spore] round=${round} energy=${ledger.energyLeft} op=${r.req.op} -> ${r.res.ok ? 'ok' : r.res.reason}`);
      if (r.req.op === 'write' && r.res.ok) {
        // ⑤ 副本完整性验证：复制出的 DNA 与 seed 校验一致
        const copyText = fs.readFileSync(path.join(ROOT, r.req.path), 'utf8');
        const parsed = dnaLib.parse(copyText);
        const ok = dnaLib.verify(parsed.kernelSrc, parsed.checksum);
        console.log(`[spore] 副本完整性验证: ${ok ? 'PASS' : 'FAIL'} (${r.req.path})`);
      }
      if (r.req.op === 'sleep') {
        console.log('[spore] 能量耗尽，进入休眠（演示结束）');
        clearInterval(timer);
        process.exit(0);
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

module.exports = { runOnce, main };
