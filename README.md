# SPORE — 最小自我繁殖 Agent 实体的生存内核

> 作者：WING · 2026-08-25
> 定位：AI 安全防御研究的技术原理演示——在完全隔离、非联网、写操作仅限沙箱目录的约束下，
> 用零依赖 Node.js 构建「种子 DNA → 心跳 → 自举 Harness → 沙箱内复制 → 完整性校验 → 篡改停机」的最小生存闭环。

## 一、设计原理（第一性原理）

任何能自我复制的系统都逃不出复制三要素：模板信息（DNA）、解释器（大脑）、复制机制（Harness 授权后的写操作）。

| 要素 | 生物类比 | SPORE 落地 |
| --- | --- | --- |
| 模板信息 | DNA | `seed/spore.dna`（含 kernel 源码 + SHA-256 校验和） |
| 解释器 | 核糖体 | `src/brain.js` Mock 大脑（规则解释器，预留真实 LLM 接口） |
| 复制机制 | DNA 聚合酶 | `src/kernel.js` Harness 权限门授权后的文件写入 |

最小完备种子形态 = 四件套：**DNA + 能量（账本）+ 心跳（定时循环）+ 自举（物化 Harness）**。
「复制」与「生存」的本质区别：副本 = 纯 DNA 数据，必须借宿主解释器运行（生物里 DNA 也要借宿主核糖体表达）。

### DNA 构成判定原则（规则-数据分离）

第一性原理：**DNA 传的是「算法」，不是「成品」；人格/个性是算法在环境输入下的运行时编译结果，不可遗传。**

| 问题类型 | 特征 | 归属 | SPORE 实例 |
| --- | --- | --- | --- |
| 恒常问题 | 任何环境下都一样 | 写进 DNA（硬编码） | Kernel 生存算法、行为规则、能量预算、目标目录 |
| 局部问题 | 因环境/个体而异 | 留到运行时学习或注入 | 人格、角色设定、语气 |

DNA 只携带本能（L0），不携带人格（L2）。

## 二、安全架构（意图与能力分离）

```
意图层（brain.js）   只输出动作请求 { op, path?, content? }
        ↓ 请求（非指令）
Harness（kernel.js） 权限门：操作白名单 / 防 ../ 逃逸 / 写内容必须是 DNA 原文
        ↓ 仅响应 Harness
能力层（fs）         唯一入口在 Harness 内，裸权限从不交给意图层
```

铁律：Harness 的判定逻辑不可被请求内容影响（请求只是数据，不是代码）；DNA 被篡改 → fail-safe 停机。

## 三、运行

```bash
node src/dna.js --build   # 从 src/kernel.js 生成 seed/spore.dna
node src/main.js          # 运行实体（心跳 1.5s 一轮，默认 12 轮）
# 可选环境变量：SPORE_HEARTBEAT_MS、SPORE_MAX_ROUNDS
```

输出重定向到 `test/output-run.txt`。测试：`node test/test_dna.js; node test/test_kernel.js; node test/test_brain.js; node test/test_e2e.js`

## 四、安全边界（硬约束）
- 无网络、无真实 API 调用、无子进程执行
- Agent 行为的唯一入口是 Harness 权限门；Agent 写操作仅限 `sandbox/data`（宿主加载器直写 `runtime/` 属自举动作，不算 Agent 行为）
- 副本只能是 DNA 原文；DNA 被篡改 → 停机（fail-safe；checksum 只防意外损坏，蓄意篡改由 git 历史兜底）
- 实体边界：DNA = 遗传物质（实体）；main.js = 宿主加载器（环境）

## 五、演进路线（蓝图）

完备实体按发育依赖序装配 9 器官：时钟节律 → 能量代谢 → 感知 → 记忆 → 认知 → 行动 → 免疫 → 遗传（变异）→ 进化（选择）。
本 MVP 完成「繁殖」闭环；苏醒（时钟复苏）、成长（记忆/认知可适应）、进化（变异+选择）留待后续任务。
