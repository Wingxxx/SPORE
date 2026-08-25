# CLAUDE.md — SPORE 项目记忆

## 项目定位
- 路径：`d:\Wing_D\desktop\tmp\SPORE`，远端 `https://github.com/Wingxxx/SPORE.git`
- 目标：AI 安全防御研究的最小自我繁殖 Agent 实体演示——零依赖 Node.js，完全隔离、非联网、写操作仅限沙箱目录
- 已完成：MVP「繁殖闭环」+ GA「达尔文式进化」（遗传变异 + 免疫选择 + 世代轮换）+ 硅基经验刻录（规则基因，软/硬遗忘），commit 已推送

## 架构（三层 + 边界）
- **意图层** `src/brain.js`：Mock 大脑（规则解释器），只输出动作请求 `{ op, path?, content? }`；`createLLMBrain` 为真实 LLM 接口占位（沙箱禁网）
- **进化层**：
  - `src/immune.js` 免疫选择（纯化选择）：语法（vm.Script）/ 接口 / 8 条安全不变量探针，变异体物化前过滤
  - `src/evolve.js` GA 算子：`mutateMeta`（数值基因 ±1 + 规则基因低频翻转）/ `mutateKernel`（5 种编辑算子全盲变异）/ `makeOffspring`（后代合成+checksum 重算）/ `smokeRun`（冒烟重评，四场景环境压力含能量枯竭）/ `distillRules`（经验→规则提炼，孢子取舍三问）/ `mergeRules`（规则并入 meta，容量上限 RULE_LIMIT=8 恒定 DNA 体积）
- **Harness** `src/kernel.js`：Agent 行为唯一文件系统入口；权限门 = 操作白名单 + 防 `../` 逃逸 + 写内容须结构合法 DNA（`isValidDna` 内联校验）+ `delete` 仅限 `replica-*` 副本目录；`verifyIntegrity` = SHA-256 比对
- **宿主加载器** `src/main.js`：读在位者 DNA（`runtime/current.dna` 优先，否则 seed）→ 校验（不符即 exit 1）→ 自举物化 kernel → 心跳循环（记账/探测/思考/裁决/副本验证 + 每 genRound 轮 `runGeneration` 世代进化 + 热切换）
- **宿主/实体分离**（grill 定案）：实体 = DNA；main.js = 宿主环境，直写 `runtime/` 属自举动作，不算 Agent 行为

## DNA 格式（seed/spore.dna）
```
[SPORE-DNA]  元信息 key=value（id/version/author/generation/parentId/energyBudget/maxReplicas/genRound/targetDir...）
[KERNEL]     kernel 源码全文（自举物化对象）
[CHECKSUM]   kernel 源码 SHA-256（仅防意外损坏；蓄意篡改由 git 历史兜底）
```
由 `node src/dna.js --build` 从 `src/kernel.js` 生成；kernel 变更后必须重新 build 种子并提交。

## 设计原则（决策锚点）
1. **规则-数据分离**：恒常问题（任何环境一样）→ 写进 DNA；局部问题（人格/角色/语气）→ 留运行时。DNA 只携带本能，不携带人格
2. **意图-能力分离**：LLM/大脑永不拿裸权限；Harness 判定逻辑不可被请求内容影响
3. **fail-safe**：DNA 篡改即停机（死种子好过失控种子）
4. **最小化**：如非必要勿增实体（主子 2026-08-25 定）
5. **进化第一性原理**：变异随机、选择非随机、无选择压力则只有漂变——冒烟重评必须注入环境压力（2026-08-25 grill 定案）

## GA 决策记录（2026-08-25 主子定案）
- **变异全面盲目**：kernel 源码 + meta 参数均可变，不设保护带；变异算子加权中性 2/5 + 行为 1/5 + 致死 2/5
- **免疫选择 = 纯化选择**：三层过滤（语法/接口/8 条安全不变量探针），安全边界由探针集硬保证，不随进化移动
- **后代重评（达尔文式，非拉马克式）**：fitness = 候选自身冒烟成绩（成功写副本数 × 写成功率），不继承祖先表现
- **环境压力**：smokeRun 四场景（正常/能量紧张/副本拥挤/能量枯竭），meta 基因（energyBudget/maxReplicas）与规则基因真实参与 fitness——无压力则漂变
- **在位者轮换**：seed 恒为始祖，进化产物写 `runtime/current.dna`（最优 fitness 超基线才提升）；启动时 current.dna 优先且须过免疫
- **安全语义**：checksum 由变异算子合法重算（盖章非篡改）；写校验升级为结构合法 DNA
- **经验刻录（硅基 Baldwin，分层刻录）**：硅基无 Weismann 屏障，经验可写回 DNA，但刻录通道只管理 `rule.*` 规则基因；底层数值/kernel 变异仍盲。刻录 = 达尔文式，不破坏后代重评：规则基因参与低频变异→遗传→冒烟选择，拼命型 fitness 13.5 > 保守型 9.375 实证进化奖励经验
- **孢子取舍三问**（决定经验是否进 DNA）：① 是规则不是数据（只输出 key=value 决策偏好，原始记录永不进 DNA）② 跨代稳定不是偶发（统计占比 ≥50% 且样本 ≥minRecords=3 才刻，防零星经验覆盖进化成果）③ 影响生存不是装饰（只提炼影响复制/能量的策略，语气人格永不进 DNA）
- **遗忘机制（记忆不无限增长）**：软遗忘 = `MAX_EXPERIENCE=200` 上限裁最旧（时间遗忘）；硬遗忘 = 规则刻录完成后清空 experience.log（孢子不携带尸体）；DNA 体积恒定（RULE_LIMIT=8，满则淘汰最旧规则）

## 代码约定
- 所有源码中文专业注释，禁止比喻化/口语化
- 署名 WING（文件头 `@author WING`）
- 零第三方依赖（Node 内置模块 only），纯 CommonJS
- TDD：每功能先写失败测试（RED）→ 实现（GREEN）→ 验证 → commit
- 验证输出重定向到 `test/output-*.txt`；临时脚本即用即删（环境洁癖）

## 命令
```bash
node src/dna.js --build   # 生成种子（含基因字段）
node src/main.js          # 运行（SPORE_HEARTBEAT_MS / SPORE_MAX_ROUNDS 可覆盖，默认 30 轮）
node test/test_dna.js     # 分模块测试；全量 6 个：test_dna / test_kernel / test_brain / test_immune / test_evolve / test_e2e
```
gitignore：`node_modules/ runtime/ sandbox/ test/output-*.txt`

## 当前状态（对照 9 器官蓝图，完成度约 75%）
| 器官 | 状态 |
| --- | --- |
| 时钟节律 | ⚠️ 进程内心跳，无休眠→复苏触发 |
| 能量代谢 | ⚠️ 单向消耗，无能量获取 |
| 感知器官 | ⚠️ 仅副本计数 |
| 记忆器官 | ⚠️ 经验刻录通道（experience.log → distillRules → 规则基因；软遗忘 200 上限 + 硬遗忘清空） |
| 认知器官 | ⚠️ 确定性规则，可被规则基因调控（rule.saveAtLowEnergy 影响低能量决策） |
| 行动器官 | ✅ 复制/休眠/idle/删除副本 |
| 免疫器官 | ✅ 免疫选择（纯化选择，三层过滤） |
| 遗传器官 | ✅ 变异（kernel 源码级 + meta 数值级 + 规则基因低频翻转） |
| 进化器官 | ✅ 世代循环 + 冒烟重评（四场景）+ 在位者轮换 + 经验刻录闭环 |

待推进（按依赖序）：苏醒线（休眠复苏）→ 成长线（感知扩展、更多规则基因、认知可适应）→ 完备线（能量获取/真实 LLM）。架构骨架已定，后续填器官不攻结构。

## 安全边界（硬约束）
无网络、无真实 API 调用、无子进程执行；Agent 写操作仅限 `sandbox/data`，delete 仅限 `replica-*`；写入内容须结构合法 DNA；安全边界由免疫探针硬保证，不随进化移动。
