import io
p = 'D:/AISpace/PMTOOL/gen_summary_demo.py'
s = io.open(p, encoding='utf-8').read()
s = s.replace("P['start_date']", "(P.get('start_date') or '\u672a\u63d0\u4f9b')")
s = s.replace("P['end_date']", "(P.get('end_date') or '\u672a\u63d0\u4f9b')")
io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
