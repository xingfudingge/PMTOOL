import zipfile, os, io, sys, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from xml.etree import ElementTree as ET

OUT = 'D:/AISpace/PMTOOL/summary'
files = sorted(f for f in os.listdir(OUT) if f.endswith('.docx'))
print('found', len(files))

bad_tokens = ['%%', '如：', '{{', '}}']

def paras(docx):
    with zipfile.ZipFile(docx) as z:
        xml = z.read('word/document.xml')
    ET.fromstring(xml)  # well-formed check
    ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    root = ET.fromstring(xml)
    out = []
    for p in root.iter(ns + 'p'):
        texts = [t.text or '' for t in p.iter(ns + 't')]
        s = ''.join(texts).strip()
        if s:
            out.append(s)
    return out

allok = True
for f in files:
    full = os.path.join(OUT, f)
    try:
        ps = paras(full)
    except Exception as e:
        print(f, 'ERROR', e)
        allok = False
        continue
    # forbidden
    joined = '\n'.join(ps)
    hits = [t for t in bad_tokens if t in joined]
    # dup-heading heuristic: count distinct H/heading-ish paragraphs
    firstlines = [p for p in ps if p.startswith('#')]
    # total paras
    status = 'OK'
    if not ps:
        status = 'EMPTY'
    if hits:
        status = 'BAD:' + ','.join(hits)
        allok = False
    if len(firstlines) != len(set(x.strip('#').strip() for x in firstlines)):
        status += ' DUPHEAD'
    print('%-40s paras=%3d heads=%2d %s' % (f, len(ps), len(firstlines), status))

print('ALL:', 'PASS' if allok else 'FAIL')
