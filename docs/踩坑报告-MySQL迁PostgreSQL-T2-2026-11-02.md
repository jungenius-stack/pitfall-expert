# 踩坑报告：生产数据库 MySQL → PostgreSQL 迁移（下周三执行）

档位：T2（定级理由：命中不可逆触发器 **#8 数据迁移** + **#9 连生产库** → 锁 T1+；因「一次性全量切换 + 无法用事后回滚兜底」模型升 T2，需 FMEA 与三层检查；升降档记录：无——用户未提出降档）｜领域：code（另有通用机制；**数据库迁移无独立建卡领域**）｜日期：2026-11-02｜触发方式：手动（用户请求「踩坑预检」）｜复核：第二轮（同日）——引擎复跑 + 8 条一手原文实测抓取，见第 7 节｜机检：见文末自检

> 用第一性原理先砍一刀：迁移只有四种死法——**① 数据搬错但没人发现；② 数据对了应用跑不起来；③ 跑得起来但慢到不可用；④ 中途出事回不去**。下面 12 条真坑全部挂在这四类下，其余是它们的变体。

---

## 0. 任务理解 + 用户约束画像（M1）

- **任务一句话复述**：下周三把公司生产库从 MySQL 整体迁到 PostgreSQL。**验收标准用户未给**——本报告按「数据逐表一致 + 全部业务路径可用 + 峰值性能不劣化 + 出问题能在可接受窗口内退回」四条隐含验收来写；任何一条口径不同，结论要改。
- **用户约束画像**：**画像缺失（M1 触发）**。本次没有读到任何库、代码、配置或历史会话，以下字段全部未知：

| 字段 | 为什么它决定结论 | 缺失后果 |
|---|---|---|
| 停机容忍度（0 / ≤30min / 4h 窗口） | 决定「dump-load 一次性」还是「CDC 双跑 + 秒级切换」 | 两条路线的工作量与风险完全不同，本报告只能两路都给 |
| 数据量（总量 / 最大表行数 / 大字段占比） | 决定装载时长是否塞得进窗口、是否必须并行/分批 | 「窗口够不够」无法判断 |
| 迁移工具（pgloader / AWS DMS / Debezium / 自研导出） | 工具自身的坑（LOB 截断、类型映射、增量能力）各不同 | 工具类坑只能列成待核清单 |
| 应用栈（语言/ORM/驱动/连接池） | 布尔、自增返回、事务语义、批量插入的差异点不同 | 方言类坑只能给通用清单 |
| MySQL 版本 + sql_mode + PG 版本 | 零日期是否允许、`ONLY_FULL_GROUP_BY`、PG 15/16 的 `MERGE`/`NULLS NOT DISTINCT` | 类型边界坑的判定条件不定 |
| 下游消费者（binlog 订阅 / BI / 报表 / 定时脚本 / 第三方直连） | 最容易漏、切换后最先炸的一类 | 只能给盘点方法，不能给结论 |
| 回滚预算（能不能双写 / 能不能保留 MySQL 可写 7 天） | 决定「回滚」是真回滚还是「恢复备份 = 丢切换后写入」 | 这是本报告最重的结论，只能条件式给出 |
| 值班与拍板（谁在切换当晚按 abort） | 出事时 5 分钟内没人能做决定 = 默认继续错下去 | 组织类坑无法评估 |

- 画像最小化：本报告不含任何库名、账号、连接串；用户补字段时也只需给聚合值（行数、版本、窗口分钟数）。

---

## 1. 量纲与口径审计（M2）

迁移里最容易吵架的不是技术，是「成功」这个词的口径：

| 对象 | MySQL 原始口径 | PG 目标口径 | 不统一会怎样 |
|---|---|---|---|
| 时间 | `TIMESTAMP` = 存 UTC、按会话时区读出；`DATETIME` = 不做时区转换 | 裸写 `timestamp` = **无时区**；`timestamptz` = 存 UTC、按会话时区显示 | 同一列按不同映射走，整体平移 8 小时且不报错 |
| 整数 | `BIGINT UNSIGNED` 上限 18,446,744,073,709,551,615 | `bigint` 上限 9,223,372,036,854,775,807 | 超过 2^63 的值变负数或导入失败 |
| 字符串比较 | 默认 `utf8mb4_0900_ai_ci`（大小写/重音不敏感） | 默认大小写敏感（按 collation 比较字节） | 唯一键冲突、`WHERE email=?` 命中行数变化 |
| 行数 | 单表 `COUNT(*)` | 单表 `COUNT(*)` | 只比总量会被「A 表多 3 行、B 表少 3 行」互相抵消骗过 |
| 性能 | p95 延迟 @ 生产峰值 QPS | 同 QPS 下 p95 | 空库跑 EXPLAIN 好看，上量后雪崩 |
| 「迁移完成」 | — | 数据一致 ∧ 功能可用 ∧ 性能不劣化 ∧ 可回退 | 只满足前两条就宣布完成，是本次最大口径陷阱 |

---

## 2. 坑位清单（M8 分级后）

**坑卡扫描**：code 域已扫 47/47（100%），命中 13 张；科学/ML 域扫 10/10，命中 1 张（SCI-001，词面命中、实质无关）。引擎：`engine/src/cli.js --tier standard`，2026-11-02。**第二轮引擎复跑（`--tier deep`，全库 121 张，`node engine/src/cli.js`，2026-11-02）**：代码 16/47、科学 1/10、调研 1/24、Agent 安全 0/12——多出的 3 张仍是「数据/生产/执行」词面重合（CODE-002/036/044），不是新增机理命中。

**覆盖质量声明（比计数重要）**：14 张命中卡里真正命中本任务机理的只有 4 张——CODE-031（迁移脚本锁表）、CODE-006（不可逆无确认）、CODE-026（删数据连带删备份）、CODE-009（时区边界）。其余 10 张是「数据 / 生产 / 迁移」词面重合（CODE-028 API 中转站、CODE-034 日志吃磁盘、SCI-001 训练集泄漏等），与跨引擎迁移无关。**结论：卡库对「异构数据库迁移」覆盖不足**，本报告主体来自通用机制 + 外部一手文档核验，不来自卡库；已列入回写。

### 🐯 真坑（阻断级，动手前必须处理）

- **坑**：自增/identity 序列没跟数据一起搬——切换后第一批写入就主键冲突（触发条件：任何用 `AUTO_INCREMENT`/`SERIAL` 且装载时显式写入 id 的表；类型：必然发生）
- **不对称性**：下行 = 全站写入失败（秒级全阻，但可修）｜可逆 = 是（`setval` 一条 SQL 可救）｜重复暴露 = 每张表 1 次，切换后首笔写入即触发
- **三态**：✅ 已查证到「序列只在调用 `nextval` 时推进」（来源：PostgreSQL 官方文档 functions-sequence；方式：检索；时间：2026-11-02；原文引用："nextval ( regclass ) → bigint — Advances the sequence object to its next value and returns that value."；复查条件：PG 大版本升级时重核）。**推论**：批量装载写的是显式 id，不经过 `nextval`，序列停在 1。
- **验证器（M13）**：`SELECT last_value FROM <seq>;` 与 `SELECT max(id) FROM <table>;` 逐表对比（副作用：只读）→ 判定表：`last_value < max(id)` ⇒ 坑成立；`last_value >= max(id)` ⇒ 不成立；查不到序列 ⇒ 未判定（该表可能不是自增）→ 执行结果：**未执行**（原因：本机无 `mysql`/`psql` 客户端、无目标库凭据；环境预检 `command -v mysql psql` 2026-11-02 实测两者均 MISSING），按 M13 由调用方执行。
- **S/O/D**：S=9 O=10 D=2 → RPN=180（几乎必中，但暴露即报错、不静默）

- **坑**：时区静默平移——`TIMESTAMP` 的「存储即转 UTC」与 `DATETIME` 的「不转换」在跨引擎映射时被抹平（触发条件：dump/CDC 会话时区 ≠ 目标端解释时区，或 `DATETIME` 被映射成 `timestamptz`；类型：静默数据损坏）
- **不对称性**：下行 = 全量历史时间戳整体偏移（8h 或 1h），对账/审计/排序/计费全错，且**没有任何报错**｜可逆 = 技术上可（重跑），业务上不可（错过的对账不可重来）｜重复暴露 = 一次性写入，但影响期间内所有报表
- **三态**：✅ 已查证到「MySQL 对 TIMESTAMP 做时区转换、对 DATETIME 不做」（来源：MySQL 8.0 参考手册 13.2.2，Oracle 镜像 docs.oracle.com/cd/E17952_01/mysql-8.0-en/datetime.html；方式：检索；时间：2026-11-02；原文引用："MySQL converts TIMESTAMP values from the current time zone to UTC for storage, and back from UTC to the current time zone for retrieval. (This does not occur for other types such as DATETIME.)"）；✅ 已查证到「PG 裸写 timestamp 即无时区」（来源：postgresql.org/docs/current/datatype-datetime.html；原文引用："writing just timestamp be equivalent to timestamp without time zone, and PostgreSQL honors that behavior."）；**✅ 第二轮复核新增（严重度上调）**：pgloader 官方默认转换规则写死了 `type datetime to timestamptz` / `type timestamp to timestamptz`（来源：pgloader.readthedocs.io/en/latest/ref/mysql.html「Default MySQL Casting Rules」；方式：抓原文；时间：2026-11-02；原文引用："type date to date type datetime to timestamptz type timestamp to timestamptz"；复查条件：升级 pgloader 后重核该规则表）——**若用 pgloader 默认规则，连「本来不做时区转换」的 DATETIME 也会被塞进 timestamptz，时区平移不是「可能」，是默认行为**。要么自定义 CAST（datetime → timestamp），要么在 `SET TimeZone='UTC'` 的会话里装载并端到端验一遍。
- **验证器（M13）**：两端取同一条记录算 epoch：MySQL `SELECT UNIX_TIMESTAMP(col) FROM t WHERE id=<已知id>;`，PG `SELECT extract(epoch from col) FROM t WHERE id=<已知id>;`（副作用：只读）→ 判定表：差值=3600 的整数倍 ⇒ 坑成立；差值=0 ⇒ 不成立；一值为 NULL/报错 ⇒ 未判定 → 执行结果：**未执行**（同上：无客户端、无库访问）。
- **S/O/D**：S=9 O=6 D=9 → RPN=486（隐蔽度最高，可能几个月后才发现）

- **坑**：迁移只盘了「应用」，漏了长尾消费者——binlog 订阅（Canal/Debezium/Maxwell）、BI 直连、月度报表脚本、运维 ad-hoc 查询（触发条件：任何绕过应用层直连 MySQL 的东西；类型：切换当天逐个爆）
- **不对称性**：下行 = 切换后 1~30 天内陆续报警，每个都要单独修｜可逆 = 部分不可（binlog 订阅在 MySQL 停写瞬间就断了，历史位点无法回放）｜重复暴露 = 每个消费者 1 次，数量未知
- **三态**：❓ 未验证（原因：看不到你们的账号清单与网络拓扑；这是**信息缺失**不是「大概率没有」）
- **验证器（M13）**：`SELECT DISTINCT user, host FROM information_schema.processlist` 每 5 分钟采样一次、跨 7 天（含月末/批处理日）汇总；同时 `grep -rEi 'canal|debezium|maxwell|binlog' <代码仓>`（副作用：只读）→ 判定表：出现不在「应用 + 已知报表」白名单里的 user@host ⇒ 坑成立；7 天采样集合 ⊆ 白名单 ⇒ 暂不成立（月末任务未覆盖则仍未判定）→ 执行结果：**未执行**（无库访问、无代码仓）。
- **S/O/D**：S=8 O=7 D=8 → RPN=448

- **坑**：没有真正的回滚路径——计划里的「回滚」实际是「从备份恢复 MySQL」，会把切换后写入 PG 的数据全部丢掉（触发条件：任何「切换成功、观察期发现问题要退回」的场景；类型：单次出局）
- **不对称性**：下行 = 切换窗口内新增数据永久丢失 + 客户可见的数据回退｜可逆 = 否（恢复备份不等于回滚）｜重复暴露 = 1 次（一次性）
- **三态**：❓ 未验证（原因：未拿到你们的回滚预案；「有备份」≠「有回滚」）
- **验证器（M13）**：桌面演练 + 实测——在预发环境走一遍「切换后写 100 行 → 执行回退 SOP → 检查这 100 行去了哪」，并对备份做一次真实恢复计时（副作用：写，须在预发/隔离环境，附回滚：演练库可随时销毁）→ 判定表：回退后切换后写入丢失或恢复耗时 > 业务窗口 ⇒ 坑成立；能保留且窗口内恢复 ⇒ 不成立 → 执行结果：**未执行**（无环境）。
- **S/O/D**：S=10 O=5 D=6 → RPN=300

- **坑**：切换后旧连接池没断——应用进程仍持有指向 MySQL 的连接，继续往旧库写（触发条件：只改配置/DNS 不重启、连接池 keepalive、DNS TTL 未过期；类型：双写分裂，数据分叉且两边都「看起来正常」）
- **不对称性**：下行 = 两边各有一半新数据，合并需要人工对账，且分叉越久越难合｜可逆 = 否（已产生的分叉无法自动回滚）｜重复暴露 = 每次滚动发布/扩缩容都可能再来一次
- **三态**：❓ 未验证（原因：不知道你们的切换方式与连接池配置）
- **验证器（M13）**：切换完成 10 分钟后在 MySQL 执行 `SELECT COUNT(*) FROM information_schema.processlist WHERE user IN (<应用账号>);`（副作用：只读）→ 判定表：>0 ⇒ 坑成立；=0 ⇒ 不成立；无权限查 processlist ⇒ 未判定 → 执行结果：**未执行**（无库访问）。
- **S/O/D**：S=9 O=6 D=7 → RPN=378
- 减法优先的根治（M13 对策排序）：不要靠「记得重启」——切换时对 MySQL 执行 `SET GLOBAL read_only=ON`（写类操作，需审批），让残留写入直接失败而不是静默分叉。

- **坑**：排序规则语义变了——MySQL 默认 `utf8mb4_0900_ai_ci`（大小写/重音不敏感），PG 默认大小写敏感（触发条件：唯一索引列、登录邮箱、搜索、去重逻辑；类型：装载时唯一键冲突，或上线后查询命中数变化）
- **不对称性**：下行 = 装载中断（可见，可修）或「登录不上/搜不到」（不可见，用户先发现）｜可逆 = 是（改数据或改 collation/citext）｜重复暴露 = 每张有唯一索引的表 1 次
- **三态**：✅ 已查证到「utf8mb4 默认排序规则是大小写不敏感的 `_ci`」（来源：MySQL 8.0 手册 charset-mysql，Oracle 镜像；时间：2026-11-02；原文引用："the default collations for utf8mb4 and latin1 are utf8mb4_0900_ai_ci and latin1_swedish_ci, respectively."）；✅ 已查证到「PG 未加引号的标识符折叠为小写、加了引号才区分大小写」（来源：postgresql.org/docs/current/sql-syntax-lexical.html；原文引用："Quoting an identifier also makes it case-sensitive, whereas unquoted names are always folded to lower case."）
- **验证器（M13）**：`SELECT LOWER(col) k, COUNT(*) c FROM <候选唯一列> GROUP BY k HAVING c > 1 LIMIT 20;`（副作用：只读）→ 判定表：有结果行 ⇒ 迁移后唯一索引会失败（坑成立）；空集 ⇒ 该列不成立；该列在 PG 侧不是唯一索引 ⇒ 未判定 → 执行结果：**未执行**（无库访问）。
- **S/O/D**：S=7 O=6 D=6 → RPN=252

- **坑**：事务隔离级别默认值不同——MySQL 默认 REPEATABLE READ，PG 默认 READ COMMITTED（触发条件：读-改-写、同事务内多次读同一行、依赖「事务内快照不变」的代码；类型：并发下算错数）
- **不对称性**：下行 = 低频但真实的数据错误（超卖、余额算错），压测可能测不出｜可逆 = 否（错误已落库）｜重复暴露 = 每次并发高峰都可能再来
- **三态**：✅ 已查证到两端默认值不同（来源：MySQL 8.0 手册 innodb-transaction-isolation-levels，Oracle 镜像，原文："The default isolation level for InnoDB is REPEATABLE READ."；PostgreSQL 手册 transaction-iso，原文："Read Committed is the default isolation level in PostgreSQL."；时间：2026-11-02）。**推论**：未显式设置隔离级别的应用，语义会静默改变。
- **验证器（M13）**：`SELECT @@transaction_isolation;` + 代码仓 `grep -rEi 'isolation|SET TRANSACTION' <仓>`（副作用：只读）→ 判定表：应用未显式设隔离级别且存在读-改-写逻辑 ⇒ 坑成立；显式设成 RR 或逻辑全是单语句读写 ⇒ 不成立；找不到业务代码 ⇒ 未判定 → 执行结果：**未执行**（无库、无仓）。
- **S/O/D**：S=8 O=5 D=9 → RPN=360

- **坑**：装载完没跑 `ANALYZE`、PG 还是默认参数——切换当天执行计划全错、连接数打满（触发条件：大表全量导入后直接接流量；类型：性能雪崩，功能全对但不可用）
- **不对称性**：下行 = 全站慢查询/超时，业务不可用，但数据没坏｜可逆 = 是（`ANALYZE` + 调参可救，需几十分钟到几小时）｜重复暴露 = 1 次
- **三态**：✅ 已查证到官方明确要求装载后 ANALYZE（来源：postgresql.org/docs/current/populate.html §14.4.8；时间：2026-11-02；原文引用："Whenever you have significantly altered the distribution of data within a table, running ANALYZE is strongly recommended. This includes bulk loading large amounts of data into the table. ... With no statistics or obsolete statistics, the planner might make poor decisions during query planning, leading to poor performance..."）
- **验证器（M13）**：`SELECT relname, last_analyze, last_autoanalyze FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 50;` + `SHOW shared_buffers; SHOW max_connections;`（副作用：只读）→ 判定表：大表 `last_analyze` 为空 ⇒ 坑成立；均有 analyze 时间且参数已按容量调整 ⇒ 不成立；库还没建 ⇒ 未判定 → 执行结果：**未执行**（无库访问）。
- **S/O/D**：S=8 O=7 D=4 → RPN=224

- **坑**：用「总行数相等」当数据一致证据——分表多几行、少几行可以互相抵消（触发条件：任何只做 `COUNT(*)` 总量比对的校验方案；类型：假阴性，让你带着坏数据上线）
- **不对称性**：下行 = 缺失/重复行长期潜伏，等到对账或审计才发现｜可逆 = 否（业务已基于坏数据做了决策）｜重复暴露 = 每次迁移 1 次，但影响全生命周期
- **三态**：❓ 未验证（原因：还没看到你们的校验方案；这是方法学判断，不依赖具体库）
- **验证器（M13）**：逐表 `COUNT(*)` + 逐列 `COUNT(col)`/`COUNT(DISTINCT col)`/`MIN`/`MAX` 对比，再抽样 1000 行全字段比对（副作用：只读）→ 判定表：存在任一分表计数或列级聚合不一致 ⇒ 坑成立；全部分表 + 列级一致且抽样零差异 ⇒ 暂不成立（仍需注意浮点/时区导致的假差异）→ 执行结果：**未执行**（无库访问）。
- **S/O/D**：S=9 O=6 D=9 → RPN=486

- **坑**：语法/驱动方言差异在「测试覆盖不到的长尾路径」爆炸——`ON DUPLICATE KEY UPDATE`、`REPLACE INTO`、`IFNULL`、反引号、非聚合列 `GROUP BY`、`TINYINT(1)` 当布尔、`LAST_INSERT_ID()`、`LIMIT` 用于 `UPDATE`（触发条件：后台管理页、月度报表、运维脚本、定时任务；类型：切换后按使用频率逐个 500）
- **不对称性**：下行 = 核心链路可能全绿，冷门功能在几天到几周内陆续炸，每次都要热修｜可逆 = 是（改 SQL）｜重复暴露 = 每个未覆盖路径 1 次
- **三态**：✅ 已查证到 MySQL 的 `BOOL` 就是 `TINYINT(1)`（来源：MySQL 8.0 手册 numeric-type-syntax，Oracle 镜像；原文："BOOL , BOOLEAN These types are synonyms for TINYINT(1). A value of zero is considered false. Nonzero values are considered true"）。**推论**：驱动层返回 0/1，PG 返回 `true/false`，直接弱类型比较的代码会静默走错分支。
- **验证器（M13）**：`grep -rEni 'on duplicate key|replace into|ifnull|last_insert_id|\`' <应用仓>` 列出命中点，逐条在 PG 预发跑一次（副作用：只读，除非执行到写语句 → 在事务里跑完 ROLLBACK）→ 判定表：存在未在 PG 验证过的命中点 ⇒ 坑成立；全部已在预发跑通 ⇒ 不成立 → 执行结果：**未执行**（无代码仓）。
- **S/O/D**：S=7 O=8 D=7 → RPN=392

- **坑**：`BIGINT UNSIGNED` 超界——MySQL 上限 1.8e19，PG `bigint` 上限 9.2e18（触发条件：id 用雪花/发号器且高位为 1，或计数类列；类型：装载报错或静默变负数）
- **不对称性**：下行 = 单表导入失败（可见）或负数 id 污染（不可见）｜可逆 = 是（改 numeric/重新映射）｜重复暴露 = 每个越界列 1 次
- **三态**：✅ 已查证到两端范围（来源：MySQL 8.0 手册 numeric-type-syntax，原文："The unsigned range is 0 to 18446744073709551615."；PG bigint 上限 9223372036854775807，见 datatype-numeric）。**注意**：pgloader 默认规则里有 `type bigint when (= precision 20) to bigserial`（来源：pgloader 官方文档 ref/mysql.html，原文引用："type bigint when (= precision 20) to bigserial drop typemod"）——但那只覆盖 precision=20 的写法，不覆盖所有越界场景。
- **验证器（M13）**：对每个 `unsigned` 列 `SELECT MAX(col) FROM t;`（副作用：只读）→ 判定表：> 9223372036854775807 ⇒ 坑成立；≤ 上限 ⇒ 不成立；无 unsigned 列 ⇒ 未判定（本项不适用）→ 执行结果：**未执行**（无库访问）。
- **S/O/D**：S=6 O=4 D=5 → RPN=120

- **坑**：零日期/非法日期被「顺手转成 NULL」——MySQL 允许 `'0000-00-00'`（取决于 sql_mode），PG 直接拒绝（触发条件：历史数据脏、老系统遗留；类型：装载中断或语义丢失）
- **不对称性**：下行 = 要么导入失败（可修），要么静默变 NULL（业务把「未知」当「没发生」）｜可逆 = 部分｜重复暴露 = 每个 datetime 列 1 次
- **三态**：✅ 已查证到 MySQL 会写零日期（来源：MySQL 8.0 手册 13.2.2，原文："Invalid DATE , DATETIME , or TIMESTAMP values are converted to the “zero” value of the appropriate type ( '0000-00-00' or '0000-00-00 00:00:00' ), if the SQL mode permits this conversion."）；✅ pgloader 默认规则会把零日期转 NULL（原文引用："type date drop not null drop default using zero-dates-to-null"）。**这不是「解决了」，是「替你做了决定」——必须显式确认这个决定业务能接受。**
- **验证器（M13）**：`SELECT COUNT(*) FROM t WHERE CAST(col AS CHAR) LIKE '0000-00-00%';` 对每个 datetime 列（副作用：只读）→ 判定表：>0 且业务不认「NULL 等价于未知」⇒ 坑成立；=0 ⇒ 不成立；无 datetime 列 ⇒ 未判定 → 执行结果：**未执行**（无库访问）。
- **S/O/D**：S=6 O=5 D=7 → RPN=210

### 🟡 中风险（对策须绑可执行检查）

- **存储过程/触发器/事件/视图没盘全**：`SELECT COUNT(*) FROM information_schema.routines/triggers/events` 三张表分别查；有 >0 就必须逐个重写并测试，PG 没有 `EVENT` 调度（对策：`pg_cron` 或外部调度）。检查：数量为 0 才可跳过。
- **权限模型**：MySQL 的 `GRANT ... ON db.*` 与 PG 的 role/schema/`GRANT USAGE ON SCHEMA` 不同；切换后「能连上但表不可见」是常见首错。检查：用应用账号在 PG 上跑一条最核心的 SELECT + INSERT。
- **连接数模型**：MySQL 线程模型 vs PG 进程模型，`max_connections` 默认 100，连接池按 MySQL 习惯放大到几百会把 PG 打死。检查：`SHOW max_connections` 与应用池上限之和对比，必要时上 PgBouncer。
- **JSON 语义**：MySQL `JSON` vs PG `jsonb`（键序、重复键、大数精度、`->>` 行为）。检查：抽取 100 条最复杂 JSON 做双端 `->>` 对比。
- **浮点/定点**：`FLOAT`/`DOUBLE` 与 `real`/`double precision` 的显示与比较；`DECIMAL` 精度。检查：抽样比对 `ROUND(col,6)` 的哈希。
- **标识符长度**：PG 标识符上限 63 字节，超长表名/列名会被静默截断 → 截断后重名。检查：`SELECT table_name FROM information_schema.tables WHERE LENGTH(table_name)>63`。
- **源库被 dump 拖垮**：`mysqldump --single-transaction` 虽不锁表，但长事务会拖住 undo purge，大库导出期间 MySQL 自身性能下降。检查：在从库导出，或实测导出期间主库 p95。

### 🐘 大象（监控区——必须答出监控者三问）

- **月末/批量任务撞切换窗口**：切换选在下周三，若周三晚有对账/跑批，失败会被误判为「迁移 bug」。触发信号：切换日 22:00-02:00 的定时任务告警。监控者三问：**谁** = 值班 DBA；**何时** = 切换前 24h 与切换后首个小时；**看什么** = 定时任务失败率 + 批处理耗时。答不出 → 移入 🐯。
- **团队不熟 PG，出事没人会救**：MySQL 的 `SHOW PROCESSLIST` 直觉在 PG 上不成立（要看 `pg_stat_activity`、`pg_locks`、`pg_blocking_pids()`）。触发信号：切换后首次故障的定位时长 >30 分钟。监控者三问：谁 = 值班 + 一位 PG 熟练者；何时 = 切换当晚全程在线；看什么 = 首次故障 MTTR。
- **写密集表的膨胀与 autovacuum 债**：PG 的 UPDATE 是写新版本，计数器/会话类表会膨胀；MySQL 是原地更新。触发信号：`pg_stat_user_tables.n_dead_tup` 持续上涨、表体积异常。监控者三问：谁 = DBA；何时 = 切换后第 1/7/30 天；看什么 = dead tuple 比例与 autovacuum 是否跟得上。

### 🐺 纸老虎（已识别，不设防；判狼须附可查证据）

- **「PG 不支持 unsigned，所以所有整数列都会炸」**：只有值 > 2^63-1 才炸，而 MySQL 侧 `BIGINT UNSIGNED` 的实际取值绝大多数远小于此。反证检索记录：查了 MySQL 手册 numeric-type-syntax 的 unsigned 上界（18446744073709551615）与 PG bigint 上界（9223372036854775807），两者只在最高位被使用时才冲突；没搜到任何「普通业务 id 越界」的公开案例。→ 不值得投入全库改造，只按上面的验证器扫一遍 `MAX()` 即可。
- **「中文/emoji 会乱码」**：MySQL `utf8mb4` 与 PG `UTF8` 都是完整 4 字节编码，正常链路不产生乱码。反证检索记录：本次只核到两边字符集名称与默认 collation，未找到「utf8mb4 → PG UTF8 系统性乱码」的一手报告；乱码更可能来自**客户端连接字符集没设**（`SET NAMES utf8mb4` / JDBC `characterEncoding`），那是连接串问题不是迁移问题。→ 只做一条冒烟（插入含 emoji 与中文的行再读回），不做专门防御。

---

## 3. ❓ 未验证区

以下全部是**信息缺失**，不是「判断为没有」：

- **你们的库长什么样**（表数、最大表行数、unsigned 列、零日期、大小写重复、datetime 列分布）：无库访问权。补验：在只读从库跑本报告第 2 节里的 6 条只读 SQL，10 分钟出结论。
- **迁移工具选了哪个**：直接影响 LOB 截断、类型映射、增量能力（AWS DMS 的 limited LOB mode 默认会截断大字段；pgloader 全量且不做增量）。补验：报出工具名 + 版本 + 是否支持增量/CDC。
- **应用有没有依赖 RR 隔离级别**：无代码仓。补验：`grep -rEi 'transaction_isolation|isolation level|SET TRANSACTION'`。
- **切换窗口多长、能否双写**：直接决定是「一次性 dump-load」还是「CDC 双跑」。补验：一句话确认可接受的停机分钟数。
- **下游消费者清单**：补验：7 天 processlist 采样 + binlog 订阅方 grep。
- **备份是否真能恢复**：CODE-026 的核心教训——「有备份」和「能恢复」是两件事，且模型/人自述都不可信。补验：对最近一次备份做一次真实恢复计时。
- **MySQL 侧的两条语义原文本轮没取到**（dev.mysql.com 返回 4KB JS 壳、Oracle 镜像 `problems-with-null.html`/`arithmetic-operators.html` 超时）：①`ORDER BY` 时 NULL 是否排最前；②`1/0` 是返回 NULL 还是报错。补验：在只读从库各跑一条（10 秒）：`SELECT 1/0;` 与 `SELECT a FROM (SELECT NULL a UNION SELECT 1) t ORDER BY a;`——两条都是只读，判定见第 7.2 节。

---

## 4. 🚫 盲区声明

- **看不到的**：你们的表结构、数据分布、应用代码、网络拓扑、值班安排——本报告所有结论都是条件式的，未做任何针对你们库的实测。
- **未建卡领域**：数据库/基础设施迁移没有独立坑卡域，code 域仅覆盖 CODE-031（迁移脚本锁表）一张近亲卡；本次主要靠通用机制 + 一手文档，**卡库覆盖率不足已在第 2 节显式声明**。
- **动态覆盖 = 0**：本机实测 `command -v mysql psql pgloader docker` 全部 MISSING（2026-11-02），12 条 🐯 的验证器**一条都没执行**。按模板要求显式声明：**事前验证对本任务类部分失效**——迁移的真实风险只有「在生产规模副本上全量演练一次」才能测出来，静态预检测不出锁竞争、装载时长、执行计划雪崩。
- **组织盲区**：谁拍板 abort、谁在切换当晚在线、出事后多久能回滚——完全不可见，而这类因素在真实事故里权重不低于技术。

---

## 5. 决策建议

**动手前必须完成的检查**（阻断待办，按顺序；全部只读，除标注外）：

1. **报出 6 个数字**：库大小、最大表行数、QPS 峰值、可停机分钟数、MySQL 版本、PG 版本 —— 缺一个，路线就定不了。
2. **逐表查序列 vs max(id)**（PG 侧，装载后立刻做）——不过就 `setval`，这是切换前最后 5 分钟能救命的检查。
3. **两端 epoch 比对一条已知记录** —— 时区错了，后面全是白干。
4. **7 天 processlist 采样 + binlog 订阅方 grep** —— 长尾消费者清单不完成，不许定切换日。
5. **在「生产规模副本」上全量演练一次**，计时：导出 + 装载 + ANALYZE + 冒烟。**没测过装载时长就定切换窗口 = 赌博**（CODE-031 的教训：开发库 2 秒，生产 8 分钟锁表）。
6. **跑一次真实恢复 + 一次回退演练**，记录「切换后写入会不会丢」的答案。
7. **明确 abort 判据**：例如「核心接口错误率 >1% 持续 5 分钟」或「p95 延迟 > 基线 3 倍」→ 谁有权喊停、喊停后执行哪一步。
8. **MySQL 侧切换时置 `read_only`**（写类，需审批）——防双写分裂，比「记得重启应用」可靠。

**中间地带警报**（T1/T2 必答；本任务属「迁移/切换」类，须给形态判断）：

> **当前形态：全量一刀切（下周三一次性切完）——这正是杠铃的中间地带**：既没有金丝雀（先让 1% 流量读新库验证），也没有回滚预留（保留 MySQL 可写窗口）。它的特点是「成功时省事，失败时没有缓冲」。
>
> **改写方向：金丝雀 + 回滚预留**。九成资源保住生存底线——MySQL 保持可写/可回退至少 7 天（或双写 3~7 天），备份异地且实测可恢复；一成资源做受控试验——先切**只读流量**（报表/后台）到 PG 跑 1~3 天，再切写流量。这样最坏情况是「退回旧库、损失可忽略」，而不是「数据分叉、两边对不上」。

**建议的执行顺序**（前提：第 1 项数字确认「可停机 ≥ 一次装载时长」；若不可停机，改走 CDC 双跑，本顺序作废）：

1. T-5 天：盘点（表/类型/序列/下游/存储过程）+ 在副本上演练装载并计时。
2. T-3 天：全量迁移 + 逐表校验（行数 → 列级聚合 → 1000 行抽样）+ `ANALYZE` + 序列校准。
3. T-2 天：只读流量切到 PG，跑 24h（验证查询正确性、性能、脏读类问题）。
4. T-1 天：回退演练 + 值班表 + abort 判据书面化。
5. T-0：冻写 → 追平增量 → 最终校验 → 切写 → 观察 60 分钟 → 决定「保留」或「回退」。
6. T+7 天前：MySQL 保持只读可回退，别急着下线。

**不决策的代价**：按「一次性切换 + 无回滚」走，单次失败的下行是「切换当晚全站不可用数小时 + 切换后写入不可恢复」；按「金丝雀 + 7 天回退窗口」走，多花的是 2~3 天准备时间。这个不对称非常明显。

---

## 6. 回写预告（M12）

- **新增坑卡（code 域，草案）**：
  - `CODE-0xx` 跨引擎迁移的语义漂移四件套：自增序列不同步 / 时区存储语义 / 排序规则大小写 / 隔离级别默认值——每项附「两端各跑一条只读 SQL」的验证器。
  - `CODE-0xx` 迁移验证的行数错觉：总量相等 ≠ 数据一致；对策为分表计数 + 列级聚合 + 抽样全字段比对。
- **拦下的未遂**：本次未实际执行任何操作，无未遂事故；但发现「卡库对异构数据库迁移覆盖不足」（命中 14 张中仅 4 张机理相关）——这是方法论侧的元坑，建议记入 `references/meta-pitfalls.md`：**词面重合导致的覆盖错觉**，与已有的「扫描计数不是质量证据」同族。

---

## 7. 第二轮复核与补充坑位（2026-11-02）

### 7.1 一手原文复核台账（本轮真抓了页面，不是复述）

| # | 结论 | 来源 URL | 抓到的原文片段（可直接复核） | 结果 |
|---|---|---|---|---|
| 1 | 序列只在 nextval 时推进 | postgresql.org/docs/current/functions-sequence.html | `nextval ( regclass ) → bigint  Advances the sequence object to its next value and returns that value.` | ✅ 复核通过 |
| 2 | 2 参 setval 修正序列 | 同上 | `The two-parameter form sets the sequence's last_value field to the specified value and sets its is_called field to true` | ✅ 复核通过 |
| 3 | 序列需 USAGE/UPDATE 权限 | 同上 | `This function requires USAGE or UPDATE privilege on the sequence.` | ✅ 新增证据（见 7.2-A） |
| 4 | 装载后必须 ANALYZE | postgresql.org/docs/current/populate.html §14.4.8 | `Whenever you have significantly altered the distribution of data within a table, running ANALYZE is strongly recommended. This includes bulk loading large amounts of data into the table.` | ✅ 复核通过 |
| 5 | PG 的 NULL 默认排最后 | postgresql.org/docs/current/queries-order.html | `By default, null values sort as if larger than any non-null value; that is, NULLS FIRST is the default for DESC order, and NULLS LAST otherwise.` | ✅ 新增证据（见 7.2-C） |
| 6 | MySQL TIMESTAMP 转 UTC、DATETIME 不转 | docs.oracle.com/cd/E17952_01/mysql-8.0-en/datetime.html（dev.mysql.com 被 JS 壳挡住） | `MySQL converts TIMESTAMP values from the current time zone to UTC for storage, and back from UTC to the current time zone for retrieval. (This does not occur for other types such as DATETIME.)` | ✅ 复核通过 |
| 7 | pgloader 默认把 datetime 映射成 timestamptz | pgloader.readthedocs.io/en/latest/ref/mysql.html「Default MySQL Casting Rules」 | `type date to date type datetime to timestamptz type timestamp to timestamptz` | ✅ **严重度上调，已并入第 2 节时区坑** |
| 8 | pgloader 默认还有 zero-dates-to-null / bigint→bigserial / tinyint→boolean | 同上 | `type bigint when (= precision 20) to bigserial drop typemod` / `type date drop not null drop default using zero-dates-to-null` | ✅ 复核通过（对应第 2 节两坑） |
| 9 | btree 索引条目上限约 1/3 页 | postgresql.org/docs/current/btree.html | `The only limitation is that an index entry cannot exceed approximately one-third of a page (after TOAST compression, if applicable).` | ✅ 新增证据（见 7.2-B） |
| 10 | PG 默认隔离级别 READ COMMITTED | postgresql.org/docs/current/transaction-iso.html | `Read Committed is the default isolation level in PostgreSQL.` | ✅ 复核通过 |

### 7.2 本轮新增坑位（🟡 级：有可执行检查，但未在你们库上跑过）

**A｜序列权限：装载全对、切流量第一笔写入就 permission denied**
- 坑：应用账号对序列没有 `USAGE`，`INSERT` 取 id 时报 `permission denied for sequence`。它是「迁移验收全绿、切流量才炸」的典型——因为装载走的是显式 id，压根不碰序列。
- 三态：✅ 已查证到 PG 要求序列 USAGE/UPDATE 权限（原文见 7.1-3）；你们账号有没有 = ❓。
- 验证器：`SELECT has_sequence_privilege('<应用账号>', '<每张自增表的序列>', 'USAGE');`（副作用：只读）→ 判定表：任一为 false ⇒ 坑成立；全 true ⇒ 不成立；序列不存在 ⇒ 未判定 → 执行结果：**未执行**（无库访问）。

**B｜宽列唯一索引在 PG 上建不出来**
- 坑：MySQL 的索引前缀上限 3072 字节比 PG 宽松；PG btree 单条目约 1/3 页（8KB 页 ≈ 2704 字节，TOAST 压缩后）。多个宽 varchar 组成的唯一索引，MySQL 上正常，PG 上 `CREATE INDEX` 直接失败，或装载后唯一约束起不到防重作用。
- 三态：✅ 已查证到 PG 条目上限（原文见 7.1-9）；你们有没有这种索引 = ❓。
- 验证器：PG 预发逐个建索引，或 `SELECT max(octet_length(<列>)) FROM <表>;` 与 2704 比（副作用：只读）→ 判定表：单行索引键 > ~2700 字节且该列在唯一索引里 ⇒ 坑成立；全部远小于 ⇒ 不成立；没建过索引 ⇒ 未判定 → 执行结果：**未执行**。

**C｜NULL 排序方向相反，分页/榜单静默错位**
- 坑：MySQL 的 NULL 排最前，PG 默认 `NULLS LAST`（升序）。任何「按可空列排序 + 分页」的列表页，切换后第一页内容变了，不报错、不崩，只是顺序不对。
- 三态：✅ PG 侧已查证（原文见 7.1-5）；MySQL 侧原文本轮没抓到 → ❓（补验见第 3 节）。
- 验证器：两端各跑 `SELECT id FROM <表> ORDER BY <可空列> ASC LIMIT 10;`（副作用：只读）→ 判定表：id 序列不一致 ⇒ 坑成立；一致 ⇒ 不成立 → 执行结果：**未执行**。对策：显式写 `NULLS LAST`/`NULLS FIRST`，别依赖默认值。

**D｜除零：MySQL 得 NULL，PG 报错 22012**
- 坑：报表/统计 SQL 里 `a/b` 在 MySQL 静默返回 NULL，在 PG 抛 `division_by_zero`，整条查询 500。归在「测试覆盖不到的报表路径」里最常爆。
- 三态：✅ PG 侧错误码已查证（postgresql.org/docs/current/errcodes-appendix.html：`22012 division_by_zero`）；MySQL 侧行为 = ❓。
- 验证器：两端各跑 `SELECT 1/0;`（副作用：只读）→ 判定表：MySQL 返回 NULL 且 PG 报错 ⇒ 坑成立；两边都报错 ⇒ 不成立 → 执行结果：**未执行**。对策：分母统一 `NULLIF(b,0)`。

**E｜DDL 事务性不同，迁移/修复脚本的「失败即重跑」假设会漏**
- 坑：MySQL 的 DDL 隐式提交、不可回滚；PG 的 DDL 在事务内可回滚。同一份脚本在 PG 上「跑到一半失败」会留下半成品结构，在 MySQL 上则留下已提交的前半段——两种残局不一样，回滚脚本不能照抄。
- 三态：❓ 未验证（本轮没取到一手原文，且这是模型侧常识，按 M4 不得升 ✅）。
- 验证器：预发库 `BEGIN; ALTER TABLE <测试表> ADD COLUMN c int; ROLLBACK;` 再查 `information_schema.columns`（副作用：写，仅预发）→ 判定表：列消失 ⇒ PG 事务性成立（脚本要按「全或无」设计）；列还在 ⇒ 与 MySQL 同构 → 执行结果：**未执行**。

### 7.3 本轮仍未做到的事（不一致即不合格）

- 12 条 🐯 的验证器**依然一条都没在你们库上跑过**——本机 `command -v mysql psql pgloader` 全 MISSING（2026-11-02 实测）。第 7 节提高的是**文档侧确定性**，不是**你们环境的确定性**；后者只能靠 `docs` 里那 6 条只读 SQL + 一次生产规模演练拿到。
- 引擎输出与人工扫描的差异（13 vs 16 命中）已如实并列，多出的 3 张经复核均为词面重合，未计入机理命中。

---

## 附：未命中卡分组作答（34 张，code 域）

- **与 AI/Agent 行为相关、本任务不涉及（21 张）**：CODE-001/002/003/004/005/007/008/010/015/016/017/018/019/020/021/022/025/027/029/032/033 —— 本任务无 agent 自主执行环节，风险来自人为流程与数据语义。
- **AI 工具/环境类、本任务不涉及（6 张）**：CODE-034/035/038/039/040/043 —— 属 agent 运行环境问题。
- **弱相关已并入正文（4 张）**：CODE-011（浮点）→ 🟡；CODE-012（版本依赖）→ 未列，PG/MySQL 版本差异影响有限；CODE-013（空值边界）→ 已并入零日期/方言；CODE-014（CSV 解析）→ 若走 CSV 中转需额外注意 BOM/引号/大整数，建议改用原生协议导出。
- **其余（3 张）**：CODE-023/042/046/047 —— 属网关/探针/模型服务类，与本任务无关。
