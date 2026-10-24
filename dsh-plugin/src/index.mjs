/**
 * pitfall-expert dsh 插件（Cordis 函数形式）
 *
 * API 依据（2026-10-14 拉取 deepseek-ai/deepseek-harness 官方仓库文档核验）：
 *   - 插件 = 导出 apply(ctx) 的模块（官方示例为 TS；此处用 .mjs，任何 Node loader 均可加载）
 *   - ctx.on('tools/pre-execute', async (exec, next) => ({ kind:'deny', reason }) | next())
 *   - ctx.tools.register(defineTool({...})) 注册面向模型的工具
 *   - cordis.yml 以 insert 覆盖层注册，插件路径必须绝对路径
 *
 * 注意：dsh 为 developer preview（官方明示会有破坏性变更），本插件对 API 形状做防御式读取，
 * 官方 API 变更时优先坏在"放行+告警"，不坏在"误拦"。
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decide, resolveEngineDir } from './decide.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const name = 'pitfall-expert';

export async function apply(ctx, config) {
  // 配置优先级：cordis config（常驻注册用，见 cordis.patch.yml）> 环境变量 > 默认
  const cfg = (config && typeof config === 'object') ? config : {};
  const mode = cfg.mode || process.env.PITFALL_HOOK_MODE || 'report';
  const tier = cfg.tier || process.env.PITFALL_HOOK_TIER || 'quick';
  const log = cfg.log === true;
  const logger = (ctx.logger && typeof ctx.logger.info === 'function') ? ctx.logger : console;

  logger.info(`[pitfall-expert] dsh 插件加载（mode=${mode}, tier=${tier}${log ? ', log=on' : ''}）`);

  const engineDir = resolveEngineDir();
  if (!engineDir) {
    // 引擎缺失：告警但继续注册门禁——fail-open 的正确形态是"门禁在场但放行"，
    // 不是"门禁缺席"（方法论 5.5：门控失效必须显式，且不得被理解为没有坑）
    logger.warn('[pitfall-expert] 未找到引擎（engine/src/scanner.js）——按诚实架构披露：本插件不产出风险扫描，不得理解为没有坑。可用 PITFALL_ENGINE_DIR 指定引擎目录。');
  }

  // ---- 1. 门禁：tools/pre-execute 瀑布式拦截（官方核验形状）----
  if (typeof ctx.on === 'function') {
    ctx.on('tools/pre-execute', async (exec, next) => {
      let d;
      try {
        d = await decide(exec, { mode, tier, log });
      } catch (e) {
        // fail-open：门控自身故障不阻塞工作流，但显式披露（方法论 5.5）
        logger.warn(`[pitfall-expert] 扫描异常，fail-open 放行：${e && e.message}`);
        return typeof next === 'function' ? next() : { kind: 'allow' };
      }
      if (d.action === 'deny') {
        return { kind: 'deny', reason: `${d.reason}\n\n${d.report || ''}` };
      }
      if (d.warn) {
        logger.warn(`[pitfall-expert] ${d.warn}`);
      }
      if (d.report) {
        logger.info(`[pitfall-expert] 预报告（mode=${mode}）：\n${d.report}`);
      }
      if (d.degraded) {
        logger.warn(`[pitfall-expert] ${d.reason}`);
      }
      return typeof next === 'function' ? next() : { kind: 'allow' };
    });
    logger.info('[pitfall-expert] 已注册 tools/pre-execute 门禁');
  } else {
    logger.warn('[pitfall-expert] 当前 dsh 版本无 ctx.on 拦截点——请改用 hooks 桥接路径（见 dsh-plugin/hooks-bridge/README.md）');
  }

  // ---- 2. 工具：pitfall_scan（面向模型的显式扫描；defineTool 动态加载，缺失则跳过）----
  if (ctx.tools && typeof ctx.tools.register === 'function') {
    try {
      const toolsMod = await import('@deepseek-ai/dsh-tools');
      const defineTool = toolsMod.defineTool || (toolsMod.default && toolsMod.default.defineTool);
      if (typeof defineTool === 'function') {
        ctx.tools.register(defineTool({
          name: 'pitfall_scan',
          description: '踩坑专家：对给定任务描述执行系统性风险预判，输出三区诚实报告（✅已查证/❓未验证/🚫盲区声明）与验证器清单。在动手执行任务前调用。',
          parameters: {
            task: { type: 'string', required: true, description: '待执行任务的自然语言描述' },
            tier: { type: 'string', description: '服务档位：quick/standard/deep，默认 quick' }
          },
          output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }]
          },
          async execute(args) {
            const { scan } = await import(pathToFileURL(path.join(engineDir, 'src', 'scanner.js')).href);
            const { buildReport } = await import(pathToFileURL(path.join(engineDir, 'src', 'report.js')).href);
            const tierArg = ['quick', 'standard', 'deep'].includes(args.tier) ? args.tier : tier;
            return buildReport(scan(String(args.task || ''), { tier: tierArg, domain: 'auto' }));
          }
        }));
        logger.info('[pitfall-expert] 已注册工具 pitfall_scan');
      }
    } catch (e) {
      // dsh-tools 不可用（如在仓库外单独测试）——门禁仍然有效，工具跳过
      logger.info(`[pitfall-expert] 未注册 pitfall_scan 工具（@deepseek-ai/dsh-tools 不可用：${e && e.message}）；门禁不受影响`);
    }
  }
}

export default { name, apply };
