import JSZip from 'jszip'
import fs from 'fs'
const zip = await JSZip.loadAsync(fs.readFileSync('src/assets/templates/pmtool_project_template.xlsx'))
const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string')
const wb = await zip.file('xl/workbook.xml').async('string')
const relT = new Map()
for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) relT.set(m[1], m[2])
const nameToPart = new Map()
for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)) { const t = relT.get(m[2]); if (t) nameToPart.set(m[1], t.replace(/^\..\//g, '').replace(/^\//g, '')) }
