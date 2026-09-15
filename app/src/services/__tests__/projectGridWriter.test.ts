/**
 * 回归测试：导出项目管理模板时，甘特图范围必须覆盖到「项目最晚日期所在周的周日」。
 *
 * 模板甘特范围由两个头部汇总公式决定：
 *   C2  = MINIFS(D6:D34, D6:D34, ">0")   （最早计划启动日期所在周一 → 甘特起点）
 *   AQ1 = INT((MAX($E$6:$E$53) - 起点)/7)+1  （项目持续周数 → 甘特终点 = 最晚日期所在周日）
 * 旧实现只按模板预留的固定行区间 34/53 计算；当任务树展开超过 53 行时，最晚任务日期落在区间外，
 * MAX 算不到 → 甘特图在(最晚任务之前)提前截断。本测试锁定 rebuildProjectRows 会按实际最大行动态扩展这两个区间。
 */
import { describe, it, expect } from 'vitest'
import { rebuildProjectRows } from '../projectGridWriter'
import type { ProjectGridLayout } from '../templateWriter'

function makeLayout(maxRow: number): ProjectGridLayout {
  const rows = []
  for (let r = 6; r <= maxRow; r++) {
    rows.push({
      row: r,
      kind: 'task',
      serial: String(r - 5),
      name: 'task' + (r - 5),
      owner: 'x',
      startSerial: 46000 + (r - 6),
      natural: 1,
      progress: 1,
      remark: '',
      childRows: [],
    })
  }
  return { dataStartRow: 6, rows }
}

function makeXml(): string {
  // 精简模板骨架：row1 含 AQ1 汇总公式、row2 含 C2 最早启动公式、row4 甘特表头、row6 起数据区
  return (
    '<worksheet><sheetData>' +
    '<row r="1" s="1"><c r="A1" t="s"><v>0</v></c>' +
    '<c r="AQ1" s="2"><f>INT((MAX($E$6:$E$53)-(C2-WEEKDAY(C2,2)+1))/7)+1</f><v>1</v></c></row>' +
    '<row r="2" s="1"><c r="C2" s="3"><f>_xlfn.MINIFS(D6:D34,D6:D34,&quot;&gt;0&quot;)</f><v>0</v></c></row>' +
    '<row r="4" s="1"><c r="J4" s="4"><f>IF(P4=&quot;&quot;,&quot;&quot;,IF((P4+1)&gt;(C2-WEEKDAY(C2,2)+1+AR1*7-1),&quot;&quot;,P4+1))</f></c></row>' +
    '<row r="6" s="1"><c r="A6" s="1"/><c r="D6" s="2"/></row>' +
    '</sheetData></worksheet>'
  )
}

describe('rebuildProjectRows 甘特范围', () => {
  it('按实际最大行扩展 C2/AQ1 的固定区间，覆盖最晚任务日期', () => {
    const xml = makeXml()
    // 任务树展开到第 74 行（超过模板预留 53 行）
    const out = rebuildProjectRows(xml, makeLayout(74))
    expect(out).toContain('D6:D74')
    expect(out).toContain('$E$6:$E$74')
    // 不再残留旧的固定 53/34 区间
    expect(out).not.toContain('D6:D34')
    expect(out).not.toContain('$E$6:$E$53')
    // 数据行重建到 74
    expect(out).toContain('<row r="74"')
  })

  it('任务行数未超限(<=34)时保持不变，不误伤模板公式', () => {
    const out = rebuildProjectRows(makeXml(), makeLayout(20))
    expect(out).toContain('D6:D34')
    expect(out).toContain('$E$6:$E$53')
  })
})
