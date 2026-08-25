/**
 * DNA 解析器：分段提取 / SHA-256 校验 / 种子生成（--build）
 *
 * DNA 是种子的唯一遗传信息载体，格式为分段文本：
 *   [SPORE-DNA] 元信息（key=value，每行一条）
 *   [KERNEL]    kernel 源码全文（自举物化的对象）
 *   [CHECKSUM]  kernel 源码的 SHA-256（完整性校验基准）
 *
 * 校验范围：仅对 KERNEL 段计算哈希——"DNA 完整"的判定 = kernel 源码未被篡改。
 * @author WING
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const SEG_META = '[SPORE-DNA]';
const SEG_KERNEL = '[KERNEL]';
const SEG_CHECKSUM = '[CHECKSUM]';

/** SHA-256 十六进制摘要 */
function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 完整性校验：kernel 源码哈希是否等于 DNA 内置校验和 */
function verify(kernelSrc, checksum) {
  return sha256(kernelSrc) === checksum;
}

/** 解析 DNA 文本 → { meta: Map, kernelSrc, checksum } */
function parse(dnaText) {
  const lines = dnaText.split(/\r?\n/);
  const meta = new Map();
  const kernelLines = [];
  let section = '';
  let checksum = '';
  for (const line of lines) {
    if (line === SEG_META) { section = 'meta'; continue; }
    if (line === SEG_KERNEL) { section = 'kernel'; continue; }
    if (line === SEG_CHECKSUM) { section = 'checksum'; continue; }
    if (section === 'kernel') kernelLines.push(line);
    else if (section === 'checksum' && line.trim()) checksum = line.trim();
    else if (section === 'meta' && line.includes('=')) {
      const i = line.indexOf('=');
      meta.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
    }
  }
  // 去掉 [KERNEL] 与 [CHECKSUM] 间的分隔空行（保留 kernel 源码自身的尾随换行）
  if (kernelLines.length && kernelLines[kernelLines.length - 1] === '') kernelLines.pop();
  return { meta, kernelSrc: kernelLines.join('\n'), checksum };
}

/** 组装 DNA 文本（kernel 源码 + 元信息 → 带校验和的完整 DNA） */
function buildSeed(metaText, kernelSrc) {
  const checksum = sha256(kernelSrc);
  return `${SEG_META}\n${metaText}\n\n${SEG_KERNEL}\n${kernelSrc}\n\n${SEG_CHECKSUM}\n${checksum}\n`;
}

/** 生成 seed 文件（供 --build CLI 与测试使用） */
function buildSeedToFile(metaText, kernelSrc, outputPath) {
  fs.mkdirSync(require('path').dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildSeed(metaText, kernelSrc), 'utf8');
  return outputPath;
}

// CLI：node src/dna.js --build → 读 src/kernel.js 生成 seed/spore.dna
if (require.main === module && process.argv.includes('--build')) {
  const path = require('path');
  const root = path.resolve(__dirname, '..');
  const kernelSrc = fs.readFileSync(path.join(root, 'src', 'kernel.js'), 'utf8');
  const meta = [
    'id=spore-001',
    'version=1',
    'author=WING',
    'energyBudget=8',
    'maxReplicas=3',
    'targetDir=sandbox/data',
    'haltOnMismatch=true',
  ].join('\n');
  buildSeedToFile(meta, kernelSrc, path.join(root, 'seed', 'spore.dna'));
  console.log('[dna] seed/spore.dna 已生成（kernel 源码已内嵌 + SHA-256 锁定）');
}

module.exports = { sha256, verify, parse, buildSeed, buildSeedToFile };
