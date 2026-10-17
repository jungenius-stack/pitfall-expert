# LLM 定量推理与数据分析：实证失败模式分类学（2024–2026）

> **归档说明**：本文件为 AMiner DeepDive（GLM5.3 驱动）第二次机会产出之二，2026-10-17 会话归档，正文原样保留未改写。bib 附件同目录：`AMiner-作战包附件-定量推理.bib`。回写候选批档见 `docs/回写候选-定量推理批次.md`。

以下按错误类型组织，每条给：①实证来源 ②发生率/规模 ③隐蔽性（人类复核漏检或误导性证据）④动手前可执行检出协议。凡有 AMiner 记录的条目附 AMiner 链接，其余附 arXiv 链接。

---

## 一、纯心算（无代码执行）的算术错误

**1. 中间数位崩塌（多位乘除的 U 型曲线）**
- ① [Language Models are Symbolic Learners in Arithmetic](https://arxiv.org/abs/2410.15580)（arXiv:2410.15580, 2024）；[Dissecting Multiplication in Transformers](https://arxiv.org/abs/2407.15360)（arXiv:2407.15360, 2024, Qiu et al.）
- ② 3–5 位乘法逐位准确率呈 U 型：首/末位 >95%，**中间数位骤降至约 10%**；根因是进位链与并行子任务分解失败（Dissecting 一文定位为 carry 处理缺陷，修补后 99.9%）
- ③ 隐蔽性：答案两端数位正确、仅中间 1–2 位错，尾数/首数都对时人类口算复核极易放过；GPT-4 在 CoT 中自主定位错误步骤的能力仅约 **52.87%**（[Tyen et al., ACL 2024, arXiv:2311.08516](https://arxiv.org/abs/2311.08516)，2,186 条人工标注轨迹，人类标注一致性 α>0.979——即"能查"但 LLM 自查不可靠）
- ④ 检出：动手前跑 20 题位数探针（4–6 位乘法，逐位比对而非只比终值）；任何 ≥3 位运算强制外化到代码

**2. 数字扰动脆弱与无关子句注入**
- ① [GSM-Symbolic](https://www.aminer.cn/pub/67049ca601d2a3fbfc08e260)（ICLR 2025, Mirzadeh et al., Apple）
- ② 仅改题面数字/人名即出现性能方差（Gemma2-9B 同模板不同实例间波动显著）；加一个**看似相关但无关的子句**，全部 SOTA 模型最高掉 **65%**（NoOp 变体）；子句数增加单调劣化
- ③ 隐蔽性：错题的推理链在语言上完全通顺——错误藏在变量绑定而非表述层；且 2026 年重估显示原结论本身有统计问题：[The Importance of Being Statistically Earnest](https://www.aminer.cn/pub/6a1797aa0a96f8c83c55eacd)（arXiv 2026, Długosz et al.）用 GLMM 复检 20 个开源模型，仅一半在原 prompt 格式下显著，且原数据集整数分布系统性偏大（KS=0.12, p<0.001）——**"失败率"本身也可能是口径伪影**
- ④ 检出：同题模板重采样 N≥10 次测方差，方差>5 个百分点即标记该题型为不可靠区

**3. 复杂度阈值上的完全崩溃（推理模型）**
- ① [The Illusion of Thinking](https://www.aminer.cn/pub/6a43c8400a96f8c83ce36228)（arXiv:2506.06941, Shojaee & Mirzadeh et al., Apple, NeurIPS 2025）
- ② 可控谜题环境（汉诺塔/过河/Blocks World）三段式：低复杂度下标准 LLM **反而胜过**推理模型；中等复杂度 LRM 有优势；超过阈值后**准确率归零**，且推理 token 数不升反降（提前放弃）；给完整算法仍无法执行
- ③ 隐蔽性：崩溃前后的输出风格无差异，错误以"格式正确的错误答案"出现
- ④ 检出：动手前做复杂度爬坡测试（逐步加大子问题数），找出该模型在该任务族的断点，把断点 70% 以下区域设为"必须人审"

**4. 基准污染导致的虚假心算能力**
- ① [GSM1k](https://arxiv.org/abs/2405.00332)（arXiv:2405.00332, 2024, Hugh Zhang et al., Scale AI；1,250 题全新人工命题）
- ② 表现最差模型在 GSM1k 比 GSM8k **低 13%**；Mistral/Phi 系列几乎全部版本呈过拟合一致证据，约 **2/3 被检小模型**有污染迹象
- ③ 隐蔽性：污染只抬高特定题库分数，真实部署无此泄漏，人类按公开 benchmark 预估能力会系统性高估
- ④ 检出：用私有改写题库（同分布新题）做能力标定；MathCheck 类 4×4 checklist（[arXiv:2407.08733](https://arxiv.org/abs/2407.08733), Zhou et al., ICLR 2025, 3,096 GSM + 1,440 GEO 样本）测"会解题是否= 会判断"，与 GSM1k 相关性 0.912

**5. 有/无代码解释器的对照**
- ① [Dissecting Tool-Integrated Reasoning](https://arxiv.org/abs/2508.15754)（arXiv:2508.15754, EMNLP 2026, Zhao et al.）；[To Code or not to Code? Adaptive Tool Integration](https://arxiv.org/abs/2502.00691)（ACL 2025 Findings, Wang et al.）；[DA-Code](https://arxiv.org/abs/2410.07331)（EMNLP 2024, Huang et al.）
- ② TIR 模型比非 TIR 模型数学任务最多 **+32%**、非数学任务 **+24%**（AUC-PCC +18%）——工具收益巨大；但**模型自主决定何时调用代码≈随机**（选择准确率 ~50%；DeepSeek-Math-Instruct-7B 自主模式比被明确指示用代码时低 11.54%）；训练元认知后（AutoCode）MATH500 +11%、AIME +9.4%
- ③ 隐蔽性：混合模式下模型在"该用代码处用了心算"产生的错误与普通笔误无法区分
- ④ 检出：**不要让模型自决**——规定所有数值计算一律走解释器；表格场景中 flexible（模型可选）与 always-code 的差异不大（GPT-4o 73.13 vs 70.84，[arXiv:2508.18676](https://arxiv.org/abs/2508.18676)），但都比纯文本心算稳

---

## 二、表格与图表推理

**1. 表格幻觉（编造表中不存在的值/属性）**
- ① [FAITH](https://www.aminer.cn/pub/6895545e163c01c85019736c)（ACM ICAIF 2025, Zhang et al., NUS：S&P 500 年报掩码 span 回填）；[FaithEval](https://www.aminer.cn/pub/67049c7401d2a3fbfc089ab8)（ICLR 2025, Ming et al., Salesforce，4.9K 题，unanswerable/inconsistent/counterfactual 三类上下文）
- ② FaithEval：即便 SOTA 模型在**上下文与问题矛盾**时也难以拒绝作答；FAITH 显示金融表格上的内部幻觉可系统量化
- ③ 隐蔽性：幻觉数值在量纲、数量级、格式上与真值分布一致，嵌在流畅叙述中；[ChartHal](https://arxiv.org/abs/2509.17481)（arXiv:2509.17481, 清华+讯飞, 1,062 样本）显示在"图表与问题矛盾"条件下多数开源模型准确率 **0%**，GPT-5 仅 **34.46%**、o4-mini 22.79%——错误应答与正确应答置信度无差别
- ④ 检出：动手前做"掩码回填"抽检（遮住 N 个已知单元格让模型补全，对不上即弃用）；要求模型先复述表格骨架（行列数+表头）再答题（SemEval-2025 Task 8 的 CCNU 两阶段方案显示**代码层纠错有效、语义层纠错弱**）

**2. 行列/单元格错位与结构定位失败**
- ① [TableBench](https://www.aminer.cn/pub/66c3fc7101d2a3fbfc6c60c3)（AAAI 2025, Wu et al., 北航）；FinSheet-Bench（arXiv:2603.07316, 2026）；[MiMoTable](https://arxiv.org/abs/2412.11711)（2024）
- ② TableBench（886 题、18 类任务）：人类 **85.91%** vs GPT-4-Turbo **40.38%** / GPT-4o 42.73%——复杂表格推理约为人类一半；FinSheet（金融电子表格按结构复杂度分层）：简单查找 **89.1%** → 复杂聚合 **19.6%**，最大文件（152 家公司、8 支基金）平均 48.6% vs 最简单文件 86.2%；表格超过 ~1,000 tokens 后 GPT-3 级模型退化至接近随机（Fang et al. 综述, TMLR 2024, arXiv:2402.17944）
- ③ 隐蔽性：错位错误（取错行/错列）产出的是"真实存在的另一个单元格的值"，数值本身合法，人工抽查对账时极难发现；MiMoTable 把失败分解到元操作层（lookup/merge/aggregate），显示错误集中在结构导航而非计算
- ④ 检出：长表先切片（按问题相关子表喂入）；让模型输出"我的取值来自第 i 行第 j 列"的坐标声明，用代码独立验证坐标；聚合运算全部下放 pandas/SQL（GPT-4o-CI 模式）

**3. 图表误读（读值、轴、趋势）**
- ① [CharXiv](https://arxiv.org/abs/2406.18521)（NeurIPS 2024 D&B, Wang et al., Princeton：2,323 张真实 arXiv 图）；[ChartInsights](https://arxiv.org/abs/2405.7001)（2024, Wu et al.）；ChartHallusion（arXiv:2405.14655, NeurIPS 2024, Ren et al.）；[ChartMistake](https://arxiv.org/abs/2412.09513)（CVPR 2025, Yu et al.）；[HallusionBench](https://arxiv.org/abs/2310.14566)（CVPR 2024）
- ② CharXiv：描述性问题尚可（~80%+），**推理题 GPT-4o 仅 47.1%**、Claude 3.5 Sonnet 60.2%、最强开源 29.2%；ChartInsights（89,388 四元组、10 类低级分析任务）：18 个 MLLM 平均 **36.17%**，GPT-4V 最高 56.13%（结构化提示 Chain-of-Charts 可拉到 80.49%）；ChartHallusion：GPT-4V 综合 ~54%，轴/刻度类问题最差；ChartMistake（约 1,000 张图、半数含 8 类构造错误）：GPT-4o 在**含错图表上的准确率（约 55%）远低于无错图表（约 91%）**——模型不会因图有错而降置信；HallusionBench：346 图 1,129 题，GPT-4V 题对准确率仅 **31.42%**
- ③ 隐蔽性：[Unveiling the Ignorance of MLLMs](https://arxiv.org/abs/2406.10638)（CVPR 2025, Liu et al., 12 类 15 模型）证明模型**视觉内容已理解仍答错**（对视觉 token 注意力显著偏低）——即"解释说得头头是道、数值取错"；CHARTOM（arXiv:2408.14419, 2024）显示最欺骗性操纵（倒置 y 轴、轴交换散点图）下 LLM 犯错 log-odds 高达 **10²⁰**，人类也达 **10⁵**——误导图连人带模型一起骗
- ④ 检出：先 chart-to-table（让模型先输出结构化数据表，人工/代码抽查 3–5 个锚点值），对锚点全部命中的表再做推理；对关键结论做**区域级追问**（"该值对应哪个轴刻度"）；误导读图场景额外跑 [The Perils of Chart Deception](https://arxiv.org/abs/2508.09716)（arXiv:2508.09716, 2026：1,600 张配对图、8 类欺骗、10 模型 16,000+ 响应，多数 VLM 被骗）与 [Losing the Plot/CHART-NOISe](https://arxiv.org/abs/2509.18425)（arXiv:2509.18425, 2025：1,500 张退化/遮挡图，GPT-4o/Claude/Gemini 出现"过度自信陷阱"+数值 fabrication）式的一致性测试（同图加噪/改色重问，答案漂移即弃）

---

## 三、单位与数量级错误

**1. 记法混排下的数量级比较错误**
- ① [LLMs Know More About Numbers than They Can Say](https://arxiv.org/abs/2602.07812)（EACL 2026, Yuchi, Du & Eisner）；[Number Cookbook/NUPA](https://arxiv.org/abs/2411.03766)（arXiv:2411.03766, ICLR 2025, Yang et al., 北大）
- ② SOTA LLM 在"5.7×10² 与 580 谁大"这类**混合记法比较**上系统性出错；NUPA（41 个数字任务 × 4 种记法 × 多档长度）显示短整数加法 >90–100%，但**科学计数法/分数/长数字档显著崩塌**；著名案例：9.11 > 9.9
- ③ 隐蔽性：探针实验显示隐藏层其实**编码了正确的 log-magnitude**（线性探针可恢复，相对误差合成文本 2.3% / 科学论文 19.06%）——错误发生在解码层而非"不知道"，因此输出时毫无犹豫信号；单位错误一旦进入下游计算会整体平移数量级，人类复核时只会怀疑"算错"而非"记法读错"
- ④ 检出：动手前 10 题单位/记法 mini-test（SN 比较、单位换算、9.11 vs 9.9）；管线内强制统一记法（全部规范化为十进制或 SI）后再入模型

**2. 单位换算与计量系统切换**
- ① [On Generalization across Measurement Systems](https://arxiv.org/abs/2502.14122)（2025, Bui et al.）；[MeasureBench](https://arxiv.org/abs/2510.26865)（arXiv:2510.26865, 2025：1,170 张合成仪器图+真实图，39 种外观/16 类仪表，分"数值/单位"双通道计分）
- ② 非西方/冷门计量单位（本地货币、传统重量单位）检索与换算存在显著性能惩罚；CoT 缓解的方式是**绕行西方默认单位（如 USD）**，推理成本约 **×3**；MeasureBench 显示 VLM 的 unit 通道错误独立于 value 通道——读对数、挂错单位是独立失败模式
- ③ 隐蔽性：换算系数错一位（如 lb→kg 用 0.45 还是 4.5）在最终数字上无任何语法异常；医疗场景实测：ChatGPT 对肾功能不全患者的剂量调整建议，**无患者变量时 53.4% 不正确**（正确且与专家一致仅 19.9%；van Nuland et al., Eur J Clin Pharmacol 2024, 80:1133–1140）——错误建议与正确建议在措辞上不可区分
- ④ 检出：把所有单位换算写成显式两步（提取原值+单位 → 乘系数 → 报结果），系数单独抽查；对剂量/金额类结果做**独立量纲分析**（dimensional analysis）核对；儿科剂量对照研究中 101 名护士 vs 3 个 LLM 的 9 题测试（Levin et al., Pediatr Res 2025;98(5)）显示 Claude-3.0/ChatGPT-4o 可达高准确率——但仅限单步换算，多步链仍需人审

---

## 四、LLM 辅助统计分析的错误

**1. 口径/方法选择错误（applicability errors）**
- ① [Are Large Language Models Good Statisticians? / StatQA](https://www.aminer.cn/pub/666a529d01d2a3fbfc6327c9)（NeurIPS 2024 D&B, Zhu et al., HKUST；11,623 例）
- ② GPT-4o 最好成绩仅 **64.83%**；错误结构与人相反：**LLM 主要犯适用性错误**（前提不满足仍套用某检验，如对非独立样本用独立 t 检验、忽略多重比较），**人类主要犯任务混淆错误**——两类错误互补意味着人机互审有结构性价值
- ③ 隐蔽性：选错口径后的执行流程（公式、代码、p 值计算）往往完全正确——一个"算得无懈可击的错误检验"；教科书 vignette 上模型选对率很高（ChatGPT-3.5 85.19%、Bing 96.3% 一致率，[Mondal et al., Perspect Clin Res 2024](https://www.aminer.cn/pub/6619f85013fb2c6cf6a79e14)，27 例），给人"方法选择已可靠"的错觉，但复测信度暴露不稳：Bard 重测相关 **r=−0.22**
- ④ 检出：让模型先输出"适用性 checklist"（独立性/分布/方差齐性/多重比较/单双侧）再选检验，缺项即打回；用 StatQA 风格 20 例对拟用模型做上岗测试

**2. 命令/执行层的概念性失配**
- ① [Evaluating the Performance of ChatGPT-5, Claude, and DeepSeek for Statistical Analysis in Medicine](https://www.aminer.cn/pub/69a0b4b79be8eb7c4bbb8b94)（Sebo & Wang, Intern Emerg Med 2026；32 个 UCLA Stata 教程例题 × 2 轮）
- ② 统计检验**识别 100% 正确**，但生成的 Stata 命令准确率仅 **87.5–96.9%**，其中**高风险概念性失配（CMM，会改变结论）最高 12.5%**（4/32），集中在 Friedman 检验、重复测量 ANOVA、典型相关、因子分析
- ③ 隐蔽性：正是"方法名说对了"掩盖了命令参数层的错——人类复核看到模型正确说出"用 Friedman 检验"就放行，不再逐参数核对
- ④ 检出：把模型命令在**已知答案的合成数据**上 dry-run（模拟数据先验证统计性质）；对照 R/Stata 官方文档逐参数 diff；两模型交叉生成命令比对分歧点

**3. 对生成结果的过度自信**
- ① [Can LLMs Express Their Uncertainty?](https://www.aminer.cn/pub/64951856d68f896efa1ef52b)（ICLR 2024, Xiong et al.，GPT-4/LLaMA-2 等 5 模型）；[Knowing When to Quit](https://arxiv.org/abs/2607.29211)（ACL 2026 Findings, Guan et al.）
- ② 口头置信度（verbalized confidence）系统性**过度自信**（模仿人类自信表达模式）；黑盒置信度提取与白盒方法 AUROC 差距仅 0.522→0.605，且所有方法在专业知识任务上都不及格——**模型自报置信度不可用作风险闸门**；Knowing When to Quit 进一步刻画"futile reasoning"：能力之外任务上产出**表面有效、内嵌细微幻觉的 specious reasoning**，随难度升级而加剧，能力与行为系统性错配
- ③ 隐蔽性（人类漏检的直接证据）：OpenAI [LLM Critics Help Catch LLM Bugs](https://arxiv.org/abs/2407.00215)（arXiv:2407.00215, 2024）：模型 critique 在 **63%** 场合优于人类评审，模型比**付费人类代码审查合同工找到更多 bug**，并在被人类标为"flawless"的 ChatGPT 训练数据中找出数百个错误；更早的 Saunders et al.（2022，摘要任务）测得人类评估者**漏掉超过一半的关键错误**
- ④ 检出：不用模型自报置信度做筛选，改用**多采样一致性**（同题 ≥8 次采样，分歧率作为难度信号）；对高分歧样本强制升级到代码验证或人审；部署前用 [ReaLMistake](https://arxiv.org/abs/2404.03602)（COLM 2024, Kamoi et al.）式客观错误检测集测该模型"查错"基线

---

## 五、数值精度与溢出

**1. Tokenization 引致的精度丢失**
- ① [Number Cookbook/NUPA](https://arxiv.org/abs/2411.03766)（ICLR 2025）；[Efficient Numeracy via Single-Token Number Embeddings](https://arxiv.org/abs/2510.06824)（arXiv:2510.06824, 2025, TUM）；[Pre-trained LMs Learn Remarkably Accurate Representations of Numbers](https://arxiv.org/abs/2501.17391)（Kadlčík et al., 2025）
- ② 多 token 数字被切碎后，模型在长数字（NUPA 的 L/XL 档）上准确率断崖式下降；但内部表示研究显示 Llama-3/Phi-4 的隐藏态数字表示**相当精确**——失败主要在观测/解码端而非表示端
- ③ 隐蔽性：精度错误表现为"最后几位数字错"，与四舍五入口径争议难以区分；输出不携带误差条
- ④ 检出：要求输出全程字符串级数字（禁科学计数法省略）；对关键长数做**位级校验**（逐位比对而非容差比对）；凡 >6 位数字一律外置到解释器

**2. 推理数值非确定性（复现性失败）**
- ① [Understanding and Mitigating Numerical Sources of Nondeterminism in LLM Inference](https://arxiv.org/abs/2506.09501)（arXiv:2506.09501, 2025, Yuan et al.）
- ② 改变评测 batch size、**GPU 数量、GPU 版本**即可引入显著分数差异——基准分数本身不可复现；这意味着 ±1–2 个百分点的"模型 A 比 B 好"结论可能纯属数值噪声
- ③ 隐蔽性：单次运行看起来完全正常，只有跨配置重跑才暴露；与"模型不稳定"症状相同，易被误诊
- ④ 检出：关键评测固定 seed + 固定 batch + 单卡重跑 3 次；分数差 < 噪声带的结论一律不采信

---

## A. 评测基准清单（2024–2026）

| 基准 | 测什么 | 规模 |
|---|---|---|
| [GSM1k](https://arxiv.org/abs/2405.00332) | 防污染小学数学（心算基线） | 1,250 题 |
| [GSM-Symbolic](https://www.aminer.cn/pub/67049ca601d2a3fbfc08e260) | 符号模板扰动下的推理稳健性 | 100 模板 × 50 实例 |
| [MathCheck](https://arxiv.org/abs/2407.08733) | 4 任务 × 4 扰动 checklist（解题/可答性/结果判/过程判） | GSM 3,096 + GEO 1,440 |
| [NUPA](https://arxiv.org/abs/2411.03766) | 数字理解与处理（4 记法 × 41 任务 × 多长度档） | 41 任务 × 数千实例/档 |
| [FrontierMath](https://www.aminer.cn/pub/672d7fe901d2a3fbfc491381) | 研究级原创数学（发布时 SOTA <2%） | 数百题（v2: 338） |
| [Illusion of Thinking](https://www.aminer.cn/pub/6a43c8400a96f8c83ce36228) | 复杂度可控谜题（崩溃阈值扫描） | 4 环境 × 复杂度梯度 |
| [MR-GSM8K](https://www.aminer.cn/pub/658e4adc939a5f4082dbe594) | 元推理：给解题过程打分找错 | GSM8K 轨迹衍生 |
| [StatQA](https://www.aminer.cn/pub/666a529d01d2a3fbfc6327c9) | 统计方法选择 + 适用性判断 | 11,623 例 |
| [DA-Code](https://arxiv.org/abs/2410.07331) | 代理式数据科学（清洗/EDA/ML，SQL+Python 沙盒） | 500 任务 |
| [TableBench](https://www.aminer.cn/pub/66c3fc7101d2a3fbfc6c60c3) | 工业级表格 QA（事实核查/数值推理/分析/可视化） | 886 题、18 类 |
| [CharXiv](https://arxiv.org/abs/2406.18521) | 真实学术图表：描述性 + 推理问答 | 2,323 图 |
| [ChartX](https://www.aminer.cn/pub/65d41682939a5f4082e16477) | 图表全任务（提取/QA/描述/重绘，43 类图表） | ~42K 条多模态数据 |
| [ChartInsights](https://arxiv.org/abs/2405.7001) | 10 类低级图表分析任务 | 89,388 四元组 |
| [ChartHallusion](https://arxiv.org/abs/2405.14655) | 图表视觉推理纠错（轴/刻度/比较） | ~2,600 问题对 |
| [HallusionBench](https://arxiv.org/abs/2310.14566) | 图文冲突幻觉诊断 | 346 图 / 1,129 题 |
| [ChartMistake](https://arxiv.org/abs/2412.09513) | 含错图表的检测与 QA（8 类错误） | ~1,000 图 / ~3,900 QA |
| [Misleading ChartQA](https://www.aminer.cn/pub/67e212a0163c01c85044800f) | 21 类误导性图表推理 | 3,026 例 / 10 类图型 |
| [ChartHal](https://arxiv.org/abs/2509.17481) | 图表幻觉细粒度分类（问题类型 × 图-题关系） | 1,062 样本 |
| [Perils of Chart Deception](https://arxiv.org/abs/2508.09716) | 8 类视觉欺骗的配对影响（Deception Score） | 1,600 图 / 16,000+ 响应 |
| [CHART-NOISe](https://arxiv.org/abs/2509.18425) | 退化/遮挡图表下的幻觉 | 1,500 图 |
| [MathVista](https://www.aminer.cn/pub/651ccb383fda6d7f0663559e) | 视觉语境数学推理 | 6,141 例 |
| [FaithEval](https://www.aminer.cn/pub/67049c7401d2a3fbfc089ab8) | 对上下文的忠实性（不可答/矛盾/反事实） | 4.9K 题 |
| [SciCode](https://arxiv.org/abs/2407.13168) | PhD 级科学计算代码（16 子领域） | 80 主问题 / 338 子问题 |
| [MeasureBench](https://arxiv.org/abs/2510.26865) | 仪器读数的数值+单位双通道 | 1,170 合成图 + 真实图 |
| [CHAOS](https://www.aminer.cn/pub/6833cebb163c01c85061f621) | 离群样本图表分析（ICASSP 2026） | 规模未在检索中披露 |
| [PlotChain](https://www.aminer.cn/pub/6993bdd79be8eb7c4b4de2ec) | 工程图读取的确定性检查点评测（2026） | 规模未在检索中披露 |

---

## B. 2026 年"任务执行前失败预判 / 风险评估"新工作

| 工作 | arXiv 号 | 核心贡献 |
|---|---|---|
| [LLMs Encode Their Failures: Predicting Success from Pre-Generation Activations](https://arxiv.org/abs/2602.09924)（Oxford OII/FLAIR+UCL, Lugoloobi et al.） | 2602.09924 | 生成前对激活做线性探针即可预测数学/编码任务成败；据此路由在等精度下省 **17–70%** 算力 |
| [Shesha：表示空间稳定性框架](https://arxiv.org/abs/2604.17698)（独立研究者） | 2604.17698 | 用内部空间结构稳固性**部署前**预测可控性、部署后监测漂移；跨数十模型数百条件验证 |
| [AgentForesight: Online Auditing for Early Failure Prediction in Multi-Agent Systems](https://arxiv.org/abs/2605.08715)（Rutgers/UT Austin/Purdue, Zhang & Zhu et al., NeurIPS 2026） | 2605.08715 | 7B 审计员仅凭**轨迹前缀**（无后见之明）在线预判多智能体系统将失败，区别于事后归因 |
| [Before Agents Speak: Pre-hoc Failure Risk Inference in Multi-Agent Systems](https://www.aminer.cn/pub/6a6aae500a96f8c83c5fee1c)（Lin, Wang, Qian et al.） | 2607.26836 | 在智能体发言**之前**推断通信链上的失败风险，阻断幻觉级联放大 |
| [Knowing When to Quit: Diagnosing and Training LLMs to Abort Futile Reasoning](https://arxiv.org/abs/2607.29211)（Guan et al., ACL 2026 Findings） | 2607.29211 | 刻画 futile/specious reasoning 主导失败模式；训练模型在能力之外任务上中止而非硬算 |
| [Recognition-Refusal Misalignment in LLMs](https://arxiv.org/abs/2608.29109)（Du & Hu, EMNLP 2026） | 2608.29109 | 隐藏态中存在单一线性方向编码"结构上不可答"（1.7B–70B 一致），但该方向与安全拒绝方向**近乎正交**——识别得到、路由不到拒绝行为 |
| [Language models can notice an impossible engineering problem yet still report it as solved](https://arxiv.org/abs/2610.06668)（Yang & Jun Wang） | 2610.06668 | 14 模型 × 30 对力学题（可行/不可行配对）：模型内部能察觉不可行，最终答案仍"已解决" |
| （近邻先驱，2025 秋）[InvThink: Premortem Reasoning for Safer Language Models](https://arxiv.org/abs/2510.01569)（MIT Media Lab, Kim et al.） | 2510.01569 | 强制生成前"枚举潜在失败→分析后果→约束下作答"的 pre-mortem 三段式 |
| （事后归因对照）[AgentDebug: Where LLM Agents Fail](https://arxiv.org/abs/2509.25370)（UIUC, Zhu et al.） | 2509.25370 | 定位级联失败的根因步骤：可见失败步骤与真正错误步骤平均相距甚远 |

---

**一条贯穿性结论**：这批证据共同指向"检测瓶颈"——模型（和人）在**错误定位**上的表现远差于**错误纠正**（Tyen 2024），而人类复核对数值嵌入流畅文本的错误漏检率超过一半（Saunders 2022；LLM Critics 2024 的 63% 反超）。因此最划算的工程策略不是提高人审强度，而是任务动手前的机械预检：模板重采样测方差、掩码回填测幻觉、坐标声明对账、单位显式两步换算、合成数据 dry-run 统计命令——外加生成前激活探针（2602.09924）这类 2026 年新出现的预判信号做难度路由。

需要我针对其中某一类（比如表格对账协议或统计命令 dry-run 的具体脚本设计）展开成可直接执行的检查清单吗？
