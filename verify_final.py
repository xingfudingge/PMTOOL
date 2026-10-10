import zipfile, io, sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from xml.etree import ElementTree as ET
ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def paras(f):
    z = zipfile.ZipFile(f)
    xml = z.read('word/document.xml')
    ET.fromstring(xml)
    root = ET.fromstring(xml)
    return [''.join((t.text or '') for t in p.iter(ns + 't')).strip() for p in root.iter(ns + 'p')]

f = 'C:/Users/example/Downloads/pmtool/PMToolData/ai/documents/晨曦智能印章项目-项目进展汇报.docx'
ps = [p for p in paras(f) if p]
print('deep project docx paragraphs:', len(ps))
heads = [p for p in ps if p.startswith(('一、','二、','三、','四、','五、','六、','七、','八、','九、'))]
print('chapters:', len(heads))
for h in heads:
    print('  -', h)
bad = [t for t in ['%%','{{','}}','\\n','\\u'] if t in '\n'.join(ps)]
print('corruption:', bad if bad else 'NONE')
print('--- sample lines ---')
for x in ps[:8]:
    print('  ', x[:70])
