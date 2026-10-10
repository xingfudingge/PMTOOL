# -*- coding: utf-8 -*-
import io
NL = chr(10)
tpl = io.open('D:/AISpace/PMTOOL/app/src-tauri/src/document/template.rs', encoding='utf-8').read()

KINDS = ['project','weekly','monthly','phase','blueprint','summary','requirements','manual',
         'focus','progress','charter','kickoff','scope','plan','wbs','schedule','riskplan',
         'commplan','minutes','change','milestone','acceptance','lessons']

lines = []
lines.append('// 模板正文。每类模板指向 templates/<kind>.md 专业级撰写脚手架；AI 按 spec 逐节填数据。')
for k in KINDS:
    const = k.upper() + '_BODY'
    lines.append('const %s: &str = include_str!("templates/%s.md");' % (const, k))

start = tpl.find('const PROJECT_BODY: &str = r#')
end = tpl.find('fn meta() -> Vec<TplMeta>')
print('start', start, 'end', end)
if start < 0 or end < 0:
    raise SystemExit('markers not found')
result = tpl[:start] + NL.join(lines) + NL + NL + tpl[end:]
io.open('D:/AISpace/PMTOOL/app/src-tauri/src/document/template.rs', 'w', encoding='utf-8', newline=NL).write(result)
print('spliced include_str ok, new len', len(result))
