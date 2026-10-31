#!/usr/bin/env node
'use strict';
/**
 * pitfall-expert-engine — MCP server 入口（stdio）
 * 工具：scan_task —— AI 任务执行前的系统性风险预判
 * 架构位置：混合三层中的“核”（MCP server 为核，skill 为壳，hook 为闸）
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');
const { scan, DOMAINS } = require('./scanner');
const { buildReport } = require('./report');

const server = new Server(
  { name: 'pitfall-expert-engine', version: '0.2.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: 'scan_task',
    // 能力注解（MCP 2025-06 规范）：客户端据此决定调用前是否需确认。
    // 逐条与实现对齐（2026-10-21 实测，非推定）：
    //   readOnlyHint    —— true：工具路径只 readdirSync/readFileSync 读 cards/*.yaml，
    //                      grep writeFile|appendFile|mkdir|unlink|rename 零命中
    //   destructiveHint —— false：无删除/覆盖/不可逆副作用
    //   idempotentHint  —— true：同输入连调两次 buildReport 输出逐字节相同（实测 ===）
    //   openWorldHint   —— false：依赖只有 fs/path/js-yaml，无 fetch/http/net/dns
    // 注意：这些是机器读的安全契约，不是注释。值写错 = 让下游客户端按错误前提自动放行。
    annotations: {
      title: '任务前风险扫描（踩坑预检）',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    description: '踩坑专家扫描引擎：在 AI 执行任务之前，对该任务做系统性风险预判。' +
      '按领域坑卡库逐条对照，输出三区诚实报告（✅已查证 / ❓未验证 / 🚫盲区声明）+ 验证器清单。' +
      '卡库覆盖七域：代码、数学、调研/决策、Agent 安全、科学/ML、创意写作、战略；' +
      '未建卡领域（decision/meta）会在盲区显式声明。' +
      '当用户要求“踩坑/避坑/预判风险/动手前先查坑/premortem”，或任何任务执行前的风险审查场景时使用。',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: '待执行任务的自然语言描述（越具体，坑卡匹配越准）'
        },
        domain: {
          type: 'string',
          enum: ['auto', ...Object.keys(DOMAINS)],
          default: 'auto',
          description: '任务领域；auto = 自动判定。已建卡七域：code/math/research-decision/agent-security/' +
            'science/creative/strategy。未建卡领域（decision/meta）也可指定，' +
            '此时本域无卡可对照，盲区将显式声明'
        },
        tier: {
          type: 'string',
          enum: ['quick', 'standard', 'deep'],
          default: 'standard',
          description: '服务档位：quick=⚡快扫（只报告不验证）；standard=🛡️标准（报告+验证器清单）；deep=🔬深审（+RPN排序+对抗追问）'
        },
        cards_dir: {
          type: 'string',
          description: '坑卡目录路径，默认为仓库 cards/ 目录'
        },
        lang: {
          type: 'string',
          enum: ['zh', 'en'],
          default: 'zh',
          description: 'Report language hint. zh (default) = header as-is. en = prepend an ' +
            'English field-glossary so non-Chinese speakers can locate the verified / ' +
            'unverified / blind-spot sections. Card bodies stay Chinese because the ' +
            '119-card library is written in Chinese.'
        }
      },
      required: ['task']
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params && req.params.arguments) || {};
  const { task, domain = 'auto', tier = 'standard', cards_dir, lang = 'zh' } = args;

  // grill-me：需求是糊的 → 立刻退回（方法论 SOP 第 1 步）
  if (!task || typeof task !== 'string' || task.trim().length < 4) {
    return {
      content: [{ type: 'text', text: '错误：task 为空或过短——需求是糊的，按方法论 SOP 第 1 步退回：请补充任务的具体内容、验收标准与边界条件。' }],
      isError: true
    };
  }

  try {
    const result = scan(task.trim(), { domain, tier, cardsDir: cards_dir });
    result.lang = lang === 'en' ? 'en' : 'zh';
    return { content: [{ type: 'text', text: buildReport(result) }] };
  } catch (e) {
    // 诚实架构：引擎故障本身必须显式披露，不得静默放行
    return {
      content: [{ type: 'text', text: `扫描失败：${e.message}\n\n按诚实架构披露：本次未产出任何风险报告，故障原因如上。不得将此失败理解为“没有坑”。` }],
      isError: true
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[pitfall-expert] engine v0.2.0 ready (stdio)');
}

main().catch(e => {
  console.error('[pitfall-expert] fatal:', e);
  process.exit(1);
});
