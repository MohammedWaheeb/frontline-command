"""Read-only authored height topology inventory; no gameplay/path certification."""
import hashlib
import json
from collections import Counter
from pathlib import Path
repo=Path(__file__).resolve().parents[3]
passable=lambda tile:tile['terrain'] not in ('water','cliff','blocked')
maps={}
reports=[]
for path in sorted((repo/'content/maps').glob('*.json')):
    m=json.loads(path.read_text());maps[m['id']]=m
    w,h,tiles=m['width'],m['height'],m['tiles']
    heights=Counter(t['height'] for t in tiles)
    edges=Counter();max_delta=0
    for i,t in enumerate(tiles):
        x,y=i%w,i//w
        for dx,dy in ((1,0),(0,1)):
            if x+dx>=w or y+dy>=h:continue
            v=tiles[i+dx+dy*w]
            if passable(t) and passable(v) and t['height']!=v['height']:
                edges['with_ramp' if 'ramp' in (t['terrain'],v['terrain']) else 'without_ramp']+=1
                max_delta=max(max_delta,abs(t['height']-v['height']))
    seen=set();components=[]
    for start,t in enumerate(tiles):
        if t['terrain']!='ramp' or start in seen:continue
        seen.add(start);q=[start];boundary=Counter()
        for i in q:
            x,y=i%w,i//w
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx,ny=x+dx,y+dy
                if not(0<=nx<w and 0<=ny<h):continue
                j=ny*w+nx
                if tiles[j]['terrain']=='ramp':
                    if j not in seen:seen.add(j);q.append(j)
                else:boundary[(tiles[j]['terrain'],tiles[j]['height'])]+=1
        components.append({'tiles':len(q),'box':[min(i%w for i in q),min(i//w for i in q),max(i%w for i in q),max(i//w for i in q)],
                           'levels':sorted(set(tiles[i]['height'] for i in q)),
                           'boundary':dict((str(k),v) for k,v in boundary.items())})
    reports.append({'id':m['id'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'heights':dict(heights),
                    'passable_different_height_edges':dict(edges),'max_passable_height_delta':max_delta,
                    'zero_height_cliff_tiles':sum(t['terrain']=='cliff' and t['height']==0 for t in tiles),
                    'ramp_components':components})
rules=json.loads((repo/'pkg/content/rules.json').read_text());buildings={b['id']:b for b in rules['buildings']}
mixed=[];count=0
for path in sorted((repo/'content/missions').glob('*.json')):
    mission=json.loads(path.read_text());m=maps[mission['map_id']]
    for actor in mission.get('initial',[]):
        if actor['type'] not in buildings:continue
        count+=1;b=buildings[actor['type']];p=actor['position']
        x0=(p['x']-b['width']*500)//1000;y0=(p['y']-b['height']*500)//1000
        x1=(p['x']+b['width']*500-1)//1000;y1=(p['y']+b['height']*500-1)//1000
        levels=sorted(set(m['tiles'][y*m['width']+x]['height'] for y in range(y0,y1+1) for x in range(x0,x1+1)))
        if len(levels)>1:mixed.append({'mission':mission['id'],'tag':actor['tag'],'type':actor['type'],'position':p,'levels':levels})
summary={'maps':len(reports),'maps_with_raised_tiles':sum(any(int(h)>0 for h in r['heights']) for r in reports),
         'maps_with_passable_height_changes':sum(bool(r['passable_different_height_edges']) for r in reports),
         'passable_edges_with_ramp':sum(r['passable_different_height_edges'].get('with_ramp',0) for r in reports),
         'passable_edges_without_ramp':sum(r['passable_different_height_edges'].get('without_ramp',0) for r in reports),
         'ramp_components':sum(len(r['ramp_components']) for r in reports),
         'zero_height_cliff_tiles':sum(r['zero_height_cliff_tiles'] for r in reports),
         'initial_building_declarations':count,'mixed_height_initial_buildings':len(mixed)}
out={'scope':'Public authored tile data and default mission initial building footprints only; no path/economy/fairness or future construction validation',
     'summary':summary,'mixed_initial_footprints':mixed,'maps':reports}
(repo/'work/evidence/terrain-height/authored-topology.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(summary,indent=2));print('Mixed initial footprints:',json.dumps(mixed))
