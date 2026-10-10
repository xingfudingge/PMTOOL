import json, io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
d = json.load(io.open('D:/AISpace/PMTOOL/proj_data.json', encoding='utf-8'))
r = d['requirements']
print('requirements rows:', len(r))
for x in r:
    print(' -', x.get('req_code') or x.get('id'), '|', (x.get('summary') or '')[:40], '|', x.get('status'))
