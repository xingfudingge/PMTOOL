# -*- coding: utf-8 -*-
import json, io
NL = chr(10)
D = json.load(io.open('D:/AISpace/PMTOOL/proj_data.json', encoding='utf-8'))
P = D['project']
TASKS = D['tasks']
ISSUES = D['issues']
REQS = D['requirements']
TODOS = D['todos']
NAME = P['project_name']
CODE = P['project_code']

def n(x, fallback=''):
    x = '' if x is None else x
    return x

def st_cn(s):
    return {'COMPLETED': '已完成', 'IN_PROGRESS': '进行中', 'PENDING': '待开始', 'EXECUTING': '执行中'}.get(s, n(s))

def lv_cn(s):
    return {'HIGH': '高', 'MEDIUM': '中', 'LOW': '低', 'CRITICAL': '严重'}.get(s, n(s))

def is_cn(s):
    return {'OPEN': '未解决', 'CLOSED': '已关闭', 'PENDING': '待处理'}.get(s, n(s))

def rows(items):
    # items: list of str header + list of list
    out = ['| ' + ' | '.join(items[0]) + ' |', '|' + '---|' * len(items[0])]
    for r in items[1]:
        out.append('| ' + ' | '.join(str(c) for c in r) + ' |')
    return out

def md(lines):
    return NL.join(lines)
