/**
 * DNA 解析器测试：分段提取 / 构建往返 / 篡改检测
 * @author WING
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dnaLib = require('../src/dna');

const META = 'id=spore-001\nversion=1\nauthor=WING\nenergyBudget=8\nmaxReplicas=3\ntargetDir=sandbox/data';
const KERNEL_SRC = "'use strict';\nmodule.exports = { hello: 1 };\n";

// 1) parse：分段提取元信息 / kernel 源码 / 校验和
const dnaText = dnaLib.buildSeed(META, KERNEL_SRC);
const parsed = dnaLib.parse(dnaText);
assert.strictEqual(parsed.meta.get('id'), 'spore-001', 'meta id 解析失败');
assert.strictEqual(parsed.meta.get('energyBudget'), '8', 'meta energyBudget 解析失败');
assert.strictEqual(parsed.kernelSrc, KERNEL_SRC, 'kernel 段提取失败');
assert.strictEqual(parsed.checksum, dnaLib.sha256(KERNEL_SRC), '校验和提取失败');

// 2) 篡改检测：kernel 段改动一个字符 → 对篡改后的 kernel 段校验应失败
const tamperedDna = dnaText.replace('hello', 'hell0');
assert.strictEqual(dnaLib.verify(parsed.kernelSrc, parsed.checksum), true, '原样应通过校验');
assert.strictEqual(
  dnaLib.verify(dnaLib.parse(tamperedDna).kernelSrc, parsed.checksum),
  false,
  '篡改后的 kernel 段应校验失败'
);

// 3) --build CLI：生成真实 seed 文件
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spore-test-'));
try {
  const out = path.join(tmpDir, 'spore.dna');
  dnaLib.buildSeedToFile(META, KERNEL_SRC, out);
  const roundTrip = dnaLib.parse(fs.readFileSync(out, 'utf8'));
  assert.strictEqual(roundTrip.kernelSrc, KERNEL_SRC, '文件往返 kernel 不一致');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true }); // 环境洁癖：测试临时目录即用即删
}

console.log('[test_dna] all passed');
