#!/usr/bin/env python3
"""dod_check.py — 踩坑报告 DoD 机检（纯标准库）。

用法：
  python3 dod_check.py <报告.md>            # 机检报告六条结构项

坑卡校验（cards/*.yaml）由引擎 loadCards 承担，见 references/card-format.md——职责分离。
机检只能证明「结构完整」，不能证明「内容真实」——证据链真伪仍需人工抽查（见 references/dod.md）。
"""
import re
import sys
from pathlib import Path

PASS = "✅ PASS"
FAIL = "❌ FAIL"

# ---------- 报告 DoD 机检 ----------

def section(text: str, num: int) -> str | None:
    """提取 '## N. ' 开头的节内容（到下一个 ## 或文末）。标题行用 [^\n]* 约束，防 re.S 吞行。"""
    m = re.search(rf"^##\s*{num}\.?[^\n]*\n(.*?)(?=^##\s|\Z)", text, re.M | re.S)
    return m.group(1).strip() if m else None


def check_report(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    failures = []

    def item(idx: int, name: str, ok: bool, detail: str = ""):
        line = f"  [{idx}] {name}: {PASS if ok else FAIL}" + (f"  ({detail})" if detail and not ok else "")
        print(line)
        if not ok:
            failures.append(idx)

    # 1. 档位已声明（T1/T2 另要求定级理由——防「协商」幽灵与无理由降档）
    tier = re.search(r"档位[:：]\s*(T[012])", text)
    if tier and tier.group(1) == "T0":
        item(1, "档位已声明（T0/T1/T2）", True)
    else:
        has_reason = bool(re.search(r"定级理由", text))
        item(1, "档位已声明 + 定级理由（T1/T2）", bool(tier) and has_reason,
             "未找到 '档位：T0/T1/T2' 或缺 '定级理由' 字段")
    is_t0 = bool(tier) and tier.group(1) == "T0"

    # 2. 画像已生成（T1/T2 要求 ## 0 节；T0 紧凑模式豁免——任务即表格标题，无画像义务）
    if is_t0:
        print("  [2] 用户约束画像：T0 豁免（紧凑模式，低风险任务无画像义务）")
    else:
        sec0 = section(text, 0)
        item(2, "第0节 任务理解+用户约束画像", sec0 is not None, "缺 ## 0 节")

    # 3. 覆盖率 100%（T1/T2 需 N/N 计数；T0 紧凑模式允许「全部」声明）
    cov = re.search(r"坑卡扫描[^\n]*?(\d+)\s*/\s*(\d+)", text)
    if is_t0:
        cov_ok = bool(cov) or bool(re.search(r"已扫[^\n]*全部", text))
        item(3, "坑卡覆盖（T0：全部扫描声明即可）", cov_ok, "未找到 '已扫 … 全部' 或 'N/N' 声明")
    else:
        cov_ok = bool(cov) and cov.group(1) == cov.group(2)
        item(3, "坑卡扫描覆盖率 100%（N/N）", cov_ok,
             "未找到 '坑卡扫描 … N/N' 行，或 N<N（抽样跳过）")

    # 4. 🐯 真坑三态完整 + 验证器闭环（三态/验证器/判定表/执行结果；T0 无 ## 2 节自然通过）
    sec2 = section(text, 2)
    pit_count = taint_count = verifier_count = asym_count = 0
    if sec2:
        tiger_zone = re.split(r"^###?\s*[🟡🐘🐺]", sec2, maxsplit=1, flags=re.M)[0]
        pit_count = len(re.findall(r"[-*]\s*\*\*坑\*\*", tiger_zone))
        for block in re.split(r"(?=^[-*]\s*\*\*坑\*\*)", tiger_zone, flags=re.M):
            if block.startswith(("- **坑**", "* **坑**")) or "**坑**" in block.split("\n", 1)[0]:
                has_taint = bool(re.search(r"三态\*{0,2}[:：]\s*[✅✓❓?]", block))
                if has_taint:
                    taint_count += 1
                if (has_taint and "验证器" in block and "判定表" in block
                        and "执行结果" in block):
                    verifier_count += 1
                if has_taint and "不对称性" in block:
                    asym_count += 1
    item(4, f"🐯 真坑三态完整（{taint_count}/{pit_count}）", pit_count == taint_count,
         "存在缺少 '三态：✅/❓' 行的阻断级坑条目")
    item("4b", f"🐯 验证器闭环：判定表+执行结果（{verifier_count}/{pit_count}）",
         pit_count == verifier_count,
         "存在缺 验证器/判定表/执行结果 的阻断级坑条目（M13 四规）")
    item("4c", f"🐯 不对称性行（{asym_count}/{pit_count}）", pit_count == asym_count,
         "存在缺 '不对称性' 行的阻断级坑条目（v0.8.0 起 T1+ 必填；T0 无 🐯 区自然通过）")

    # 5. 披露率：T1/T2 要求 ## 3 与 ## 4 节存在且非空；T0 紧凑模式豁免独立节，改为三态标记齐备
    if is_t0:
        zones_ok = all(z in text for z in ("✅", "❓", "🚫"))
        item(5, "T0 紧凑模式：三态标记（✅/❓/🚫）齐备", zones_ok,
             "T0 报告缺少三态标记之一（紧凑表格也须三行齐备）")
    else:
        sec3, sec4, sec5 = section(text, 3), section(text, 4), section(text, 5)
        gate_ok = bool(sec3) and bool(sec4)
        todo_ok = bool(sec5) and "动手前" in sec5
        item(5, "❓未验证区 与 🚫盲区声明 均显式存在", gate_ok,
             f"## 3 {'缺' if not sec3 else 'ok'} / ## 4 {'缺' if not sec4 else 'ok'}（空区也须写「本区为空」）")
        item("5b", "阻断待办前置（第5节含「动手前必须完成的检查」）", todo_ok,
             "## 5 缺或无 '动手前' 清单（无阻断待办也须写「无」）")
        midzone_ok = bool(sec5) and "中间地带警报" in sec5
        item("5c", "中间地带警报槽位（迁移/切换/上线/全量发布/批量删除清理类必答；无此形态写「无」）",
             midzone_ok, "## 5 缺 '中间地带警报' 行（v0.8.0 起 T1+ 必答，写「无」也算过）")

    # 6. 回写就绪（T1/T2 要求 ## 6 节；T0 仅在发现新坑时要求回写，无新坑则豁免）
    if is_t0:
        print("  [6] 回写预告：T0 豁免（仅发现新坑时要求，本次以正文声明为准）")
    else:
        sec6 = section(text, 6)
        item(6, "第6节 回写预告", sec6 is not None, "缺 ## 6 节")

    ok = not failures
    print(f"\n{'✅ DoD 机检通过（六条结构项全过）' if ok else '❌ DoD 机检未通过：条目 ' + ','.join(map(str, failures))}")
    print("提示：机检只证结构完整，内容真实（证据链真伪/补验动作可执行性）仍需抽查。")
    return 0 if ok else 1


# ---------- main ----------

def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    return check_report(Path(args[0]))


if __name__ == "__main__":
    sys.exit(main())
