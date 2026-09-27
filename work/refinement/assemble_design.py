from pathlib import Path
import re
import json
from design_data import ROSTERS, WEAPONS, roster_md, weapons_md
from balance_audit import run

ROOT=Path('/Users/mohammedkalouti/Documents/Codex/2026-09-27/i')
WORK=ROOT/'work/refinement'
source=(WORK/'game-design-v2.template.md').read_text()
remaining=(WORK/'remaining-sections.md').read_text()
report,probes=run()
text=source.replace('<!-- REMAINING_SECTIONS -->',remaining)
for faction in ROSTERS:
    text=text.replace('{{'+faction+'_ROSTER}}',roster_md(faction))
text=text.replace('{{WEAPON_TABLE}}',weapons_md()).replace('{{BALANCE_REPORT}}',report)
assert not re.search(r'\{\{[^}]+\}\}|<!--',text),'Unexpanded marker'
assert len(re.findall(r'^## \d+\.',text,re.M))==28
assert not re.search(r'\b(?:TODO|TBD|lorem ipsum)\b',text,re.I)
target=ROOT/'outputs/frontline-command-game-design.md'
target.write_text(text)
(WORK/'balance-results.json').write_text(json.dumps({'rosters':ROSTERS,'weapons':WEAPONS,'counter_probes':probes},indent=2))
print(f'Wrote {target}: {len(text.split())} words, {len(text.splitlines())} lines, {sum(map(len,ROSTERS.values()))} unit entries.')
print(json.dumps(probes,indent=2))
