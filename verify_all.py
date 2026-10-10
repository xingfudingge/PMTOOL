import zipfile, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from xml.etree import ElementTree as ET
ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
d = 'C:/Users/example/Downloads/pmtool/PMToolData/ai/documents'
files = sorted(f for f in os.listdir(d) if f.endswith('.docx') and '晨曦' in f)
def paras(path):
    z = zipfile.ZipFile(path)
    xml = z.read('word/document.xml')
    ET.fromstring(xml)
    root = ET.fromstring(xml)
    return [''.join((t.text or '') for t in p.iter(ns+'t')).strip() for p in root.iter(ns+'p')]
bad = ['%%', '{{', '}}']
ok = True
for f in files:
    ps = [p for p in paras(os.path.join(d, f)) if p]
    j = chr(10).join(ps)
    hits = [t for t in bad if t in j]
    st = 'OK' if ps and not hits else ('EMPTY' if not ps else 'BAD:' + ','.join(hits))
    if st != 'OK':
        ok = False
    print('%-70s paras=%3d %s' % (f[:68], len(ps), st))
print('ALL:', 'PASS' if ok else 'CHECK')
