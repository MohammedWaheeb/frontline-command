from pathlib import Path
import re
import unicodedata
from design_data import ROSTERS, WEAPONS

p=Path('/Users/mohammedkalouti/Documents/Codex/2026-09-27/i/outputs/frontline-command-game-design.md')
s=p.read_text()
headings=re.findall(r'^#{1,6}\s+(.+)$',s,re.M)
def slug(h):
    return ''.join(c for c in h.lower() if c in '_- ' or not unicodedata.category(c).startswith(('P','S'))).replace(' ','-')
anchors={slug(h) for h in headings}
links=re.findall(r'\]\(#([^)]*)\)',s)
assert len(links)==28
assert all(a in anchors for a in links),[a for a in links if a not in anchors]
assert not re.search(r'\{\{[^}]*\}\}|<!--|\bTODO\b|\bTBD\b',s)
assert 'SY.fighter' not in s and 'SY.gunship' not in s
for f,rs in ROSTERS.items():
    for k in rs:
        assert s.count('`'+f+'.'+k+'`')==1,(f,k)
for k in WEAPONS:
    assert '| `'+k+'` |' in s,k
tables=[];table=[]
for line in s.splitlines()+['']:
    if line.startswith('|'):
        table.append(line)
    elif table:
        count=table[0].count('|')
        assert all(row.count('|')==count for row in table),table
        tables.append(table);table=[]
assert len(re.findall(r'^\| [1-6]\. ',s,re.M))==24
assert len(re.findall(r'^## \d+\.',s,re.M))==28
print(f'Validated {len(links)} contents links, {len(tables)} tables, 75 unit IDs, {len(WEAPONS)} weapons, 24 campaign entries, and 28 major sections.')
print(f'Deliverable: {p.name} ({p.stat().st_size:,} bytes).')
