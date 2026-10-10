import json, io, sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
c = sqlite3.connect('C:/Users/example/Downloads/pmtool/pmtool.db')
c.row_factory = sqlite3.Row
out = {}
out['project'] = dict(c.execute('SELECT * FROM projects WHERE id=1').fetchone())
out['tasks'] = [dict(r) for r in c.execute('SELECT * FROM project_tasks WHERE project_id=1 ORDER BY id')]
out['issues'] = [dict(r) for r in c.execute('SELECT * FROM project_issues WHERE project_id=1')]
out['requirements'] = [dict(r) for r in c.execute('SELECT * FROM project_requirements WHERE project_id=1')]
out['todos'] = [dict(r) for r in c.execute('SELECT * FROM project_todo_items WHERE project_id=1')]
json.dump(out, io.open('D:/AISpace/PMTOOL/proj_data.json','w',encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
print('project:', out['project']['project_name'], '| tasks:', len(out['tasks']), '| issues:', len(out['issues']), '| reqs:', len(out['requirements']))
