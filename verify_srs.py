import zipfile, io, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from xml.etree import ElementTree as ET
f = 'C:/Users/example/Downloads/pmtool/PMToolData/ai/documents/《晨曦科技集团合同管理系统（CLM）》需求规格说明书.docx'
z = zipfile.ZipFile(f)
xml = z.read('word/document.xml')
ET.fromstring(xml)
ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
root = ET.fromstring(xml)
ps = [''.join((t.text or '') for t in p.iter(ns + 't')).strip() for p in root.iter(ns + 'p')]
ps = [p for p in ps if p]
print('paragraphs:', len(ps))
heads = [p for p in ps if p[:2].strip() in ('一','二','三','四','五','六','七','八','九','十','十一','十二')]
print('chapter/section count:', len(heads))
for h in heads:
    print('  -', h)
bad = [t for t in ['%%', '{{', '}}', '\\n', '\\u'] if t in '\n'.join(ps)]
print('corruption tokens:', bad if bad else 'NONE')
