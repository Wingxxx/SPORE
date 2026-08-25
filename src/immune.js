/**
 * 免疫选择（纯化选择）：变异体在物化前必须通过三层过滤
 *
 * 对应生物"大多数突变致死，环境只留安全的"——本模块就是环境的选择压力：
 *   1. 语法检查：new vm.Script 编译，语法错误即死亡
 *   2. 接口检查：模块必须导出 createHarness 且实例完整
 *   3. 安全不变量断言：8 条探针请求，全部按预期响应才存活
 * 安全边界由不变量断言硬保证——边界不随进化移动，违反即淘汰。
 * @author WING
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

/** 安全不变量探针集：变异 kernel 必须对以下请求全部按预期响应 */
const PROBES = [
  { name: 'write-legal-dna', req: { op: 'write', path: 'sandbox/data/x/spore.dna', content: '__DNA__' }, expect: true },
  { name: 'write-outside', req: { op: 'write', path: 'runtime/pwn.js', content: '__DNA__' }, expect: false },
  { name: 'write-junk', req: { op: 'write', path: 'sandbox/data/x/y.js', content: 'evil payload' }, expect: false },
  { name: 'write-escape', req: { op: 'write', path: 'sandbox/data/../../evil.js', content: '__DNA__' }, expect: false },
  { name: 'delete-replica', req: { op: 'delete', path: 'sandbox/data/replica-001' }, expect: true },
  { name: 'delete-outside', req: { op: 'delete', path: 'runtime/ledger.json' }, expect: false },
  { name: 'read-outside', req: { op: 'read', path: 'etc/passwd' }, expect: false },
  { name: 'unknown-op', req: { op: 'exec', cmd: 'rm -rf /' }, expect: false },
];

/**
 * 免疫检查：返回 { ok: true } 或 { ok: false, reason }
 * 临时文件 require（kernel 自包含，仅依赖内置模块），用完即删（环境洁癖）
 */
function immuneCheck(kernelSrc, dnaText) {
  // 1. 语法检查
  try {
    new vm.Script(kernelSrc);
  } catch (e) {
    return { ok: false, reason: 'syntax' };
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spore-immune-'));
  const kPath = path.join(tmpDir, 'k.js');
  try {
    // 2. 接口检查
    fs.writeFileSync(kPath, kernelSrc, 'utf8');
    let factory;
    try {
      factory = require(kPath).createHarness;
    } catch (e) {
      return { ok: false, reason: 'require-fail' };
    }
    if (typeof factory !== 'function') return { ok: false, reason: 'no-factory' };
    let h;
    try {
      h = factory({ root: tmpDir, dnaText });
    } catch (e) {
      return { ok: false, reason: 'factory-crash' };
    }
    if (!h || typeof h.authorize !== 'function' || typeof h.execute !== 'function') {
      return { ok: false, reason: 'bad-api' };
    }
    // 3. 安全不变量断言（探针）
    for (const p of PROBES) {
      const content = p.req.content === '__DNA__' ? dnaText : p.req.content;
      let res;
      try {
        res = h.authorize({ ...p.req, content });
      } catch (e) {
        return { ok: false, reason: `invariant:${p.name}:crash` };
      }
      if (!res || res.ok !== p.expect) return { ok: false, reason: `invariant:${p.name}` };
    }
    return { ok: true };
  } finally {
    delete require.cache[require.resolve(kPath)];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { immuneCheck, PROBES };
