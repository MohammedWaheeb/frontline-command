"""Generate the exhaustive asset manifest from the authoritative design document.

Source of truth: outputs/frontline-command-game-design.md (read-only). Rosters,
buildings, weapons, abilities, research, maps, missions and tutorials are parsed
from its tables so the inventory cannot silently drift from the rules. Every
deliverable becomes one manifest entry with source, licence, editable origin,
output, state/frame/direction/dimension requirements and completeness.

Completeness is computed, never asserted: an entry is `sample` only if the
pipeline spec exists and its packed sprite sidecar exists on disk.

Usage: work/art/.venv/bin/python assets/pipeline/manifest/gen_manifest.py
Outputs: assets/manifest/asset-manifest.json, assets/manifest/summary.md
"""
import json
import hashlib
import os
import re
import sys
from collections import Counter, OrderedDict

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
DESIGN = os.path.join(REPO, 'outputs', 'frontline-command-game-design.md')
OUT = os.path.join(REPO, 'assets', 'manifest')

LIC_ORIGINAL = 'Project-original work created for Frontline Command in this repository; all rights held by the project owner.'
LIC_OFL = 'SIL Open Font License 1.1 (licence text bundled beside the font files).'
SRC_BLENDER = 'blender-procedural (Blender 5.2.2 LTS, Python model script, Cycles; operated by Claude Code claude-opus-5-5)'
SRC_NUMPY = 'numpy-procedural (periodic spectral synthesis; assets/pipeline/terrain)'
SRC_CODE_UI = 'code-native vector (SVG/CSS authored in repository, rendered by client)'
SRC_VO_BLOCKED = 'human voice performance or licensed synthetic voice — BLOCKED: no licensed voice source available in this environment'
SRC_MUSIC_BLOCKED = 'original composition — BLOCKED: no composition/production toolchain or composer engaged'
SRC_SFX_PLANNED = 'original sound design (recorded/synthesised foley layered in a DAW) — toolchain not yet installed'
FACTIONS = OrderedDict([('US', 'United States'), ('IR', 'Iran'), ('SY', 'Syrian Rebels'), ('SA', 'Saudi Arabia')])

# --------------------------------------------------------------------------- parse design
def read_design():
    with open(DESIGN, encoding='utf-8') as f:
        return f.read()


ROW = re.compile(r'^\| (?P<name>[^|]+?) \(`(?P<fac>US|IR|SY|SA)\.(?P<role>[a-z_]+)`\) \| (?P<cost>\d+) / (?P<build>\d+) \| '
                 r'(?P<hp>\d+) / (?P<armor>\w+) \| (?P<supply>\d+) / T(?P<tier>\d) \| (?P<move>[\d.]+) \| '
                 r'(?P<weapon>\w+) \| (?P<producer>\w+) \|$')


def parse_units(md):
    units = []
    for line in md.splitlines():
        m = ROW.match(line.strip())
        if m:
            d = m.groupdict()
            units.append({'role_id': f"{d['fac']}.{d['role']}", 'faction': d['fac'], 'role': d['role'],
                          'name': d['name'].strip(), 'armor': d['armor'], 'weapon': d['weapon'],
                          'producer': d['producer'], 'tier': int(d['tier'])})
    return units


def table_after(md, heading):
    i = md.index(heading)
    rows = []
    started = False
    for line in md[i:].splitlines()[1:]:
        if line.startswith('|'):
            started = True
            cells = [c.strip() for c in line.strip('|').split('|')]
            if set(''.join(cells)) <= set('-: '):
                continue
            rows.append(cells)
        elif started:
            break
    return rows[1:]


def parse_buildings(md):
    return [r[0] for r in table_after(md, '### 4.2 Building catalog')]


def parse_weapons(md):
    return [(r[0].strip('`'), r[1]) for r in table_after(md, '### 6.2 Weapon catalog')]


def parse_named(md, heading, col=0):
    return [r[col] for r in table_after(md, heading)]


# --------------------------------------------------------------------------- classify units
INFANTRY = {'rifle', 'at', 'recon', 'elite', 'engineer', 'medic', 'portable_aa'}
FIXED_WING = {'US.fighter', 'US.strike', 'SA.fighter', 'SA.strike'}
ROTOR = {'US.gunship', 'SA.gunship', 'US.airlift'}
DRONE = {'IR.fighter', 'IR.strike', 'IR.gunship', 'IR.isr', 'SY.scout_drone'}
TURRETED = {'tank', 'car', 'aa', 'apc', 'buggy'}
TURRETED_ARTILLERY = {'US.artillery', 'SA.artillery'}


def unit_class(u):
    if u['role'] in INFANTRY:
        return 'infantry'
    if u['role_id'] in FIXED_WING:
        return 'aircraft_fixed_wing'
    if u['role_id'] in ROTOR:
        return 'aircraft_rotor'
    if u['role_id'] in DRONE:
        return 'aircraft_drone'
    if u['armor'] == 'heavy' and u['role'] == 'tank':
        return 'vehicle_tracked_turret'
    if u['role'] in TURRETED or u['role_id'] in TURRETED_ARTILLERY:
        return 'vehicle_turret'
    return 'vehicle'


def S(name, dirs, frames, fps=0, loop=True, part='body', layers=('beauty', 'team', 'shadow'), **kw):
    d = {'name': name, 'part': part, 'directions': dirs, 'frames': frames, 'fps': fps, 'loop': loop,
         'layers': list(layers)}
    d.update(kw)
    return d


NOTEAM = ('beauty', 'shadow')


def unit_states(u):
    c = unit_class(u)
    r, rid = u['role'], u['role_id']
    st = []
    if c == 'infantry':
        st = [S('idle', 8, 4, 4), S('move', 8, 8, 14), S('aim', 8, 1), S('fire', 8, 4, 16, False),
              S('cover', 8, 2, 2), S('death', 8, 6, 12, False, layers=NOTEAM)]
        if u['weapon'] == 'Unarmed':
            st = [s for s in st if s['name'] not in ('aim', 'fire')]
        if r == 'engineer':
            st += [S('work_capture', 8, 6, 10, channel=True), S('work_repair', 8, 6, 10, channel=True)]
        if r == 'medic':
            st += [S('work_heal', 8, 6, 10, channel=True)]
        if r == 'recon':
            st += [S('channel', 8, 4, 8, channel=True,
                     purpose={'US': 'Pathfinder designation', 'IR': 'forward beacon placement',
                              'SY': 'scouting/conceal reveal', 'SA': 'recon'}[u['faction']])]
        if r == 'elite':
            st += [S('work_sabotage', 8, 6, 10, channel=True)]
        if u['faction'] == 'SY' and r in ('rifle', 'recon', 'elite'):
            st += [S('concealed_idle', 8, 2, 2, note='rendered with concealment treatment fx.unit.concealed')]
        return c, st
    hull = 'hull' if c in ('vehicle_turret', 'vehicle_tracked_turret') else 'body'
    if c.startswith('vehicle'):
        st = [S('idle', 16, 1, part=hull), S('move', 16, 4, 12, part=hull), S('damaged', 16, 1, part=hull),
              S('wreck', 16, 1, loop=False, part='whole', layers=NOTEAM)]
        if hull == 'hull':
            st += [S('aim', 32, 1, part='turret', layers=('beauty', 'team')),
                   S('fire', 32, 3, 15, False, part='turret', layers=('beauty', 'team'))]
        elif u['weapon'] not in ('Unarmed',):
            st += [S('fire', 16, 4, 12, False)]
        if r == 'rig':
            st += [S('deploy_build', 16, 8, 0, False, progress_driven=True), S('work_build', 16, 6, 8)]
        if r == 'hauler':
            st += [S('work_load', 16, 6, 8), S('work_unload', 16, 6, 8), S('move_loaded', 16, 4, 12)]
        if r == 'repair':
            st += [S('work_repair', 16, 6, 8)]
            if rid == 'SA.repair':
                st += [S('deploy', 16, 8, 0, False, progress_driven=True), S('deployed_work', 16, 6, 8)]
            if rid == 'SY.repair':
                st += [S('work_salvage', 16, 6, 8, channel=True)]
        if r == 'launcher':
            st += [S('deploy', 16, 10, 0, False, progress_driven=True), S('ready', 16, 1),
                   S('launch', 16, 4, 12, False)]
            if rid == 'IR.launcher':
                st += [S('ready_two_charges', 16, 1), S('volley', 16, 6, 12, False)]
        if r == 'artillery':
            if rid == 'IR.artillery':
                st += [S('deploy', 16, 6, 0, False, progress_driven=True), S('volley', 16, 8, 10, False)]
            if rid == 'SY.artillery':
                st += [S('mortar_fire', 16, 4, 10, False)]
        if r == 'apc':
            st += [S('doors_open', 16, 4, 10, False, note='board/unload')]
        if rid == 'SA.tank':
            st += [S('hulldown', 16, 6, 0, False, progress_driven=True), S('hulldown_idle', 16, 1)]
        if rid == 'SA.mobile_abm':
            st = [S('idle', 16, 1), S('move', 16, 4, 12), S('deploy', 16, 8, 0, False, progress_driven=True),
                  S('deployed', 16, 6, 6), S('launch', 16, 4, 12, False), S('damaged', 16, 1),
                  S('wreck', 16, 1, loop=False, layers=NOTEAM)]
        return c, st
    # aircraft
    if c == 'aircraft_fixed_wing':
        st = [S('fly', 16, 2, 20), S('bank_left', 16, 2, 20), S('bank_right', 16, 2, 20), S('fire', 16, 2, 10, False),
              S('empty', 16, 2, 20), S('parked', 16, 1), S('takeoff', 16, 6, 10, False), S('landing', 16, 6, 10, False),
              S('damaged', 16, 1), S('crash', 16, 4, 10, False, layers=NOTEAM)]
    elif c == 'aircraft_rotor':
        st = [S('hover', 16, 4, 24), S('move', 16, 4, 24), S('fire', 16, 3, 12, False), S('parked', 16, 2, 6),
              S('takeoff', 16, 6, 10, False), S('landing', 16, 6, 10, False), S('damaged', 16, 4, 24),
              S('crash', 16, 6, 10, False, layers=NOTEAM)]
        if u['weapon'] == 'Unarmed':
            st = [s for s in st if s['name'] != 'fire'] + [S('hover_low_board', 16, 4, 24)]
    else:  # drone
        st = [S('fly', 16, 3, 24), S('bank_left', 16, 3, 24), S('bank_right', 16, 3, 24), S('parked', 16, 1),
              S('launch', 16, 4, 10, False), S('recover', 16, 4, 10, False), S('damaged', 16, 1),
              S('crash', 16, 4, 10, False, layers=NOTEAM)]
        if u['weapon'] != 'Unarmed':
            st += [S('fire', 16, 2, 8, False), S('empty', 16, 3, 24)]
        if rid == 'IR.isr':
            st += [S('orbit', 16, 3, 24, note='Survey orbit; relay boost effect overlay')]
    # Keep the approved eleven-aircraft source contract reproducible. The
    # preserved legacy IR.strike still needs a separate service-state completion.
    if rid != 'IR.strike':
        st += [S('rearm', 16, 6, 8, channel=True)]
    if rid in ('US.gunship', 'SA.gunship'):
        st += [S('empty', 16, 4, 24)]
    return c, st


CANVAS = {  # @2x canvas and anchor by class (samples may override in their spec)
    'infantry': ([112, 104], [56, 72]), 'vehicle': ([240, 192], [120, 124]),
    'vehicle_turret': ([240, 192], [120, 124]), 'vehicle_tracked_turret': ([272, 208], [136, 128]),
    'aircraft_fixed_wing': ([288, 208], [144, 112]), 'aircraft_rotor': ([256, 208], [128, 116]),
    'aircraft_drone': ([224, 160], [112, 88]),
}

# --------------------------------------------------------------------------- building variants
SHARED_BUILDINGS = ['Headquarters', 'Power station', 'Supply center', 'Barracks', 'Vehicle factory', 'Radar center',
                    'Technology center', 'Repair depot', 'Outpost', 'Guard bunker', 'Gun turret', 'Air-defense post',
                    'Interceptor battery', 'Strategic operations site']
UNIQUE_BUILDINGS = {'US airfield': 'US', 'Iranian drone hub': 'IR', 'Syrian air workshop': 'SY', 'Saudi airfield': 'SA',
                    'Syrian safehouse': 'SY'}
FOOT = {'Headquarters': (4, 4), 'Power station': (2, 2), 'Supply center': (4, 3), 'Barracks': (3, 2),
        'Vehicle factory': (4, 4), 'Radar center': (3, 2), 'Technology center': (3, 3), 'Repair depot': (3, 3),
        'Outpost': (2, 2), 'Guard bunker': (2, 2), 'Gun turret': (2, 2), 'Air-defense post': (2, 2),
        'Interceptor battery': (3, 2), 'Strategic operations site': (4, 4), 'US airfield': (6, 5),
        'Iranian drone hub': (4, 4), 'Syrian air workshop': (3, 3), 'Saudi airfield': (6, 5), 'Syrian safehouse': (2, 2)}
SLUG = {'Headquarters': 'hq', 'Power station': 'power', 'Supply center': 'supply', 'Barracks': 'barracks',
        'Vehicle factory': 'factory', 'Radar center': 'radar', 'Technology center': 'tech', 'Repair depot': 'repair_depot',
        'Outpost': 'outpost', 'Guard bunker': 'bunker', 'Gun turret': 'gun_turret', 'Air-defense post': 'aa_post',
        'Interceptor battery': 'interceptor_battery', 'Strategic operations site': 'strategic_site',
        'US airfield': 'airfield', 'Iranian drone hub': 'drone_hub', 'Syrian air workshop': 'air_workshop',
        'Saudi airfield': 'airfield', 'Syrian safehouse': 'safehouse'}


def building_states(bname, faction):
    B = 'building'
    st = [S('foundation', 1, 1, part=B), S('construct', 1, 8, 0, False, part=B, progress_driven=True),
          S('idle', 1, 8, 8, part=B), S('lowpower', 1, 1, part=B), S('disabled', 1, 1, part=B),
          S('damaged', 1, 1, part=B), S('critical', 1, 1, part=B), S('rubble', 1, 1, loop=False, part=B, layers=NOTEAM)]
    if bname in ('Barracks', 'Vehicle factory', 'Supply center', 'US airfield', 'Iranian drone hub',
                 'Syrian air workshop', 'Saudi airfield', 'Headquarters'):
        st.append(S('produce', 1, 6, 10, False, part=B, note='doors/pad active while a job completes'))
    if bname in ('Gun turret', 'Air-defense post'):
        # Independently rotating equipment casts a separately composed ground
        # shadow; the renderer keeps it behind the complete building body.
        st += [S('aim', 32, 1, part='turret'),
               S('fire', 32, 3, 15, False, part='turret')]
    if bname == 'Interceptor battery':
        st += [S('charges_0', 1, 1, part=B), S('charges_1', 1, 1, part=B), S('charges_2', 1, 1, part=B),
               S('launch', 1, 4, 12, False, part=B)]
    if bname == 'Strategic operations site':
        st += [S('charging', 1, 8, 0, False, part=B, progress_driven=True), S('ready', 1, 6, 6, part=B),
               S('activate', 1, 8, 10, False, part=B)]
    if bname == 'Syrian safehouse':
        st += [S('transfer_prep', 1, 6, 0, False, part=B, progress_driven=True), S('exit_open', 1, 4, 8, False, part=B)]
    if bname == 'Guard bunker':
        st += [S('garrisoned', 1, 2, 2, part=B)]
    if bname == 'Repair depot':
        st += [S('repair_active', 1, 6, 8, part=B)]
    if bname in ('US airfield', 'Saudi airfield', 'Iranian drone hub', 'Syrian air workshop'):
        st += [S('service_active', 1, 6, 8, part=B, note='per-slot service lights; slot occupancy drawn by client')]
    return st


def building_canvas(fp):
    w, h = fp
    cw = (w + h) * 64 + 64
    top = 200
    ch = (w + h) * 32 + top + 32
    return [cw + cw % 2, ch + ch % 2], [cw // 2, top + h * 32 + (w - h) * 0]


# --------------------------------------------------------------------------- manifest assembly
def sprite_status(aid):
    spec = os.path.join(REPO, 'assets', 'pipeline', 'specs', f'{aid}.json')
    side = os.path.join(REPO, 'assets', 'build', 'sprites', aid, f'{aid}.sprite.json')
    if os.path.exists(spec) and os.path.exists(side):
        return 'sample', spec, side
    return 'planned', spec, side


def blender_source(spec):
    """Keep original-model authorship distinct from the shared render library."""
    if spec.get('author') == 'Codex' or spec.get('model') == 'building_roster':
        return ('blender-procedural (original model authored by Codex during user-authorized Claude quota takeover; '
                'Blender/Cycles; shared fclib originally authored by Claude Code claude-opus-5-5)')
    return SRC_BLENDER


def rel(p):
    return os.path.relpath(p, REPO)


def entry(**kw):
    base = OrderedDict(id=None, category=None, subcategory=None, faction=None, name=None, source=None, license=None,
                       editable_origin=None, output=None, spec=None, status='planned', blocker=None, notes=None)
    base.update(kw)
    return base


def apply_audio_production(entries):
    """Report actual original audio output without promoting it to art approval."""
    sys.path.insert(0, os.path.join(REPO, 'assets', 'pipeline', 'audio'))
    from dialogue import voice_jobs
    jobs = voice_jobs()
    by_id = {}
    for job in jobs:
        by_id.setdefault(job['id'], []).append(job)
    try:
        with open(os.path.join(REPO, 'assets/build/audio/index.json')) as source:
            index = json.load(source)['entries']
    except (OSError, ValueError, KeyError):
        index = {}
    missions = []
    for name in sorted(os.listdir(os.path.join(REPO, 'content/missions'))):
        if name.endswith('.json'):
            with open(os.path.join(REPO, 'content/missions', name)) as source:
                missions.append(json.load(source))
    # Co-op briefing voices were absent from the first manifest inventory.
    for mission in missions:
        if mission.get('mode') == 'coop':
            entries.append(entry(id=f'coop.{mission["id"]}.vo',category='voice_briefing',name=mission['title']))
    def valid_variant(variant):
        try:
            for url_key, hash_key, size_key in [('url','sha256','bytes'),('mp3_url','mp3_sha256','mp3_bytes')]:
                url = variant[url_key]
                if not url.startswith('/art/audio/') or '..' in url.split('/'): return False
                file = os.path.join(REPO, 'assets/build/audio', url[len('/art/audio/'):])
                with open(file,'rb') as source: data=source.read()
                if len(data)!=variant[size_key] or hashlib.sha256(data).hexdigest()!=variant[hash_key]: return False
            return True
        except (OSError, KeyError, ValueError): return False
    for item in entries:
        category=item['category']
        if category not in ('voice_unit','voice_announcer','voice_briefing','music','sfx'): continue
        voice=category.startswith('voice')
        ids=[item['id']]
        if category=='voice_briefing':
            # Design campaign labels include their chapter number; authored
            # titles omit it and use display capitalization. Match the title
            # and faction, then validate the actual runtime clip IDs below.
            normalize=lambda name: re.sub(r'^\d+\.\s*','',name).strip().casefold()
            matches=[m for m in missions if normalize(m['title'])==normalize(item['name'])
                     and (not item.get('faction') or m.get('faction')==item['faction'])]
            match=matches[0] if len(matches)==1 else None
            ids=[id for id in by_id if match and any(id.startswith(f'vo.{kind}.{match["id"]}') for kind in ('briefing','debrief','warning'))]
            item['output']=f'assets/build/audio/vo/missions/{match["id"]}/' if match else 'assets/build/audio/vo/missions/'
        complete=bool(ids)
        for id in ids:
            variants=index.get(id,{}).get('variants',[])
            expected=by_id.get(id)
            wanted=len(expected) if expected else (3 if id.startswith('sfx.weapon.') else 1)
            complete &= len(variants)==wanted and all(valid_variant(v) for v in variants)
            if expected:
                complete &= sorted(v.get('caption','') for v in variants)==sorted(j['caption'] for j in expected)
        item['status']='sample' if complete else 'planned'
        item['blocker']=None
        item['source']=('Original scripts rendered with pinned stock Kokoro voices (Apache-2.0), Codex quota takeover'
                        if voice else 'Original procedural composition/sound design, Codex quota takeover')
        item['license']=('Original project dialogue; stock synthetic model Apache-2.0; notices in assets/audio/licenses/'
                         if voice else LIC_ORIGINAL)
        item['editable_origin']='assets/pipeline/audio/dialogue.py + content/missions/' if voice else 'assets/pipeline/audio/synthesis.py'
        item['spec']={**(item.get('spec') or {}),'format':'24 kHz Ogg Vorbis with MP3 fallback','runtime_ids':ids}
        item['notes']='Exact-byte files and captions verified for sample status. Listening and final mix approval remain pending.'


def build_manifest():
    md = read_design()
    units = parse_units(md)
    assert len(units) == 75, f'expected 75 units, parsed {len(units)}'
    buildings = parse_buildings(md)
    assert len(buildings) == 19, f'expected 19 building types, parsed {len(buildings)}'
    weapons = parse_weapons(md)
    assert len(weapons) == 28, f'expected 28 weapons, parsed {len(weapons)}'
    maps = parse_named(md, '### 17.3 Launch maps')
    assert len(maps) == 8
    abilities = parse_named(md, '### 14.2 Faction command abilities')
    ops = parse_named(md, '### 14.4 Four different operations')
    research = []
    for h in ('### 10.3 Research', '### 11.3 Research', '### 12.5 Research and limits', '### 13.3 Research',
              '### 15.1 Shared research'):
        research += parse_named(md, h)
    missions = []
    for h, fac in (('### 19.2', 'US'), ('### 19.3', 'IR'), ('### 19.4', 'SY'), ('### 19.5', 'SA')):
        heading = next(l for l in md.splitlines() if l.startswith(h))
        for row in table_after(md, heading):
            missions.append((fac, row[0]))
    assert len(missions) == 24
    tutorials = re.findall(r'^\d\. \*\*(.+?):\*\*', md[md.index('### 18.4 Tutorials'):], re.M)[:5]
    assert len(tutorials) == 5

    E = []
    # ---------------- units
    for u in units:
        cls, states = unit_states(u)
        aid = f"unit.{u['role_id']}"
        status, spec_path, side = sprite_status(aid)
        cv, an = CANVAS[cls]
        sp = {}
        if os.path.exists(spec_path):
            with open(spec_path) as f:
                sp = json.load(f)
            cv, an, states = sp['canvas'], sp['anchor'], sp['states']
        frames = sum(s['directions'] * s['frames'] for s in states)
        E.append(entry(id=aid, category='unit_sprite', subcategory=cls, faction=u['faction'], name=u['name'],
                       source=blender_source(sp), license=LIC_ORIGINAL,
                       provenance=sp.get('provenance'),
                       editable_origin=f'assets/pipeline/blender/models/{sp.get("model", "<model>")}.py + assets/pipeline/specs/{aid}.json'
                                       f' (+ assets/source/blender/{aid}.blend written on render)',
                       output=f'assets/build/sprites/{aid}/ (@2x and @1x atlases per layer + {aid}.sprite.json)',
                       spec={'canvas_2x': cv, 'anchor_2x': an, 'layers': ['beauty', 'team', 'shadow'],
                             'states': states, 'total_poses': frames, 'weapon': u['weapon'],
                             'squad_members': 4 if cls == 'infantry' and u['role'] not in ('engineer', 'medic') else
                             (1 if cls == 'infantry' else None)},
                       status=status,
                       notes='First-pass production candidate rendered by the pipeline; awaiting art review.'
                       if status == 'sample' else None))
        E.append(entry(id=f"portrait.{u['role_id']}", category='portrait', faction=u['faction'], name=u['name'],
                       source=blender_source(sp) + ' — 3/4 perspective portrait camera', license=LIC_ORIGINAL,
                       editable_origin='same model script; portrait camera preset (planned in fclib)',
                       output=f"assets/build/ui/portraits/{u['role_id']}@2x.png",
                       spec={'size_2x': [192, 192], 'states': ['normal', 'veteran', 'elite', 'damaged'],
                             'background': 'transparent; UI frame supplies panel'}))
        E.append(entry(id=f"icon.build.{u['role_id']}", category='build_icon', faction=u['faction'], name=u['name'],
                       source=blender_source(sp) + ' — cameo camera', license=LIC_ORIGINAL,
                       editable_origin='same model script; cameo camera preset (planned in fclib)',
                       output=f"assets/build/ui/icons/build/{u['role_id']}@2x.png",
                       spec={'size_2x': [128, 96], 'states': ['available', 'hover', 'pressed', 'disabled-reason overlay',
                                                               'queued-count overlay', 'progress overlay'],
                             'note': 'State overlays are code-native; one raster per unit'}))
    # ---------------- buildings
    for b in buildings:
        facs = list(FACTIONS) if b in SHARED_BUILDINGS else [UNIQUE_BUILDINGS[b]]
        for fac in facs:
            aid = f'building.{fac}.{SLUG[b]}'
            status, spec_path, side = sprite_status(aid)
            cv, an = building_canvas(FOOT[b])
            states = building_states(b, fac)
            sp = {}
            if os.path.exists(spec_path):
                with open(spec_path) as f:
                    sp = json.load(f)
                cv, an, states = sp['canvas'], sp['anchor'], sp['states']
            E.append(entry(id=aid, category='building_sprite', subcategory=SLUG[b], faction=fac, name=f'{FACTIONS[fac]} {b}',
                           source=blender_source(sp), license=LIC_ORIGINAL,
                           editable_origin=f'assets/pipeline/blender/models/{sp.get("model", "<faction>_buildings")}.py + assets/pipeline/specs/{aid}.json',
                           output=f'assets/build/sprites/{aid}/',
                           spec={'footprint_tiles': list(FOOT[b]), 'canvas_2x': cv, 'anchor_2x': an,
                                 'layers': ['beauty', 'team', 'shadow'], 'states': states,
                                 'aliases': [{'name': 'sell', 'source': 'construct', 'reverse': True}],
                                 'overlays': ['fx.building.capture_channel', 'fx.building.sabotage_disabled',
                                              'fx.building.sell_dust', 'fx.building.fire_damaged',
                                              'fx.building.smoke_critical']},
                           status=status,
                           notes='First-pass production candidate; awaiting art review.' if status == 'sample' else None))
            E.append(entry(id=f'icon.build.{aid}', category='build_icon', faction=fac, name=f'{FACTIONS[fac]} {b}',
                           source=blender_source(sp) + ' — cameo camera', license=LIC_ORIGINAL,
                           editable_origin='building model script; cameo camera preset',
                           output=f'assets/build/ui/icons/build/{aid}@2x.png', spec={'size_2x': [128, 96]}))
    # ---------------- abilities / research / operations icons
    unit_abilities = ['designate_target', 'falcon_escort', 'airlift_board', 'airlift_unload', 'decoy', 'survey_orbit',
                      'forward_beacon', 'volley_order', 'conceal', 'ambush_ready', 'safehouse_transfer', 'sabotage',
                      'collect_salvage', 'hull_down', 'deploy', 'undeploy', 'service_deploy', 'return_to_base',
                      'patrol', 'escort', 'repeat_sortie', 'capture', 'repair', 'heal', 'disable_building',
                      'garrison', 'evacuate', 'emergency_rig']
    for a in abilities:
        E.append(entry(id=f'icon.ability.{re.sub(r"[^a-z]+", "_", a.lower()).strip("_")}', category='ability_icon',
                       name=a, source=SRC_CODE_UI, license=LIC_ORIGINAL, editable_origin='assets/ui/icons/abilities/*.svg',
                       output='assets/build/ui/icons/abilities/*.svg', spec={'size': [48, 48],
                                                                             'states': ['ready', 'cooldown sweep',
                                                                                        'insufficient energy',
                                                                                        'targeting', 'disabled']}))
    for a in ops:
        E.append(entry(id=f'icon.operation.{re.sub(r"[^a-z]+", "_", a.lower()).strip("_")}', category='operation_icon',
                       name=a, source=SRC_CODE_UI, license=LIC_ORIGINAL, editable_origin='assets/ui/icons/operations/*.svg',
                       output='assets/build/ui/icons/operations/*.svg',
                       spec={'size': [64, 64], 'states': ['charging', 'ready', 'targeting', 'active', 'enemy-warning']}))
    for a in unit_abilities:
        E.append(entry(id=f'icon.unit_ability.{a}', category='ability_icon', name=a, source=SRC_CODE_UI,
                       license=LIC_ORIGINAL, editable_origin='assets/ui/icons/abilities/*.svg',
                       output='assets/build/ui/icons/abilities/*.svg', spec={'size': [48, 48]}))
    for a in research:
        E.append(entry(id=f'icon.research.{re.sub(r"[^a-z]+", "_", a.lower()).strip("_")}', category='research_icon',
                       name=a, source=SRC_CODE_UI, license=LIC_ORIGINAL, editable_origin='assets/ui/icons/research/*.svg',
                       output='assets/build/ui/icons/research/*.svg', spec={'size': [48, 48]}))
    commands = ['move', 'attack', 'attack_move', 'force_fire', 'stop', 'hold', 'guard', 'aggressive_stance', 'rally',
                'sell', 'toggle_power', 'repair_building', 'queue', 'cancel', 'unload_all', 'select_subgroup']
    for c in commands:
        E.append(entry(id=f'icon.command.{c}', category='command_icon', name=c, source=SRC_CODE_UI, license=LIC_ORIGINAL,
                       editable_origin='assets/ui/icons/commands/*.svg', output='assets/build/ui/icons/commands/*.svg',
                       spec={'size': [40, 40], 'states': ['default', 'hover', 'active', 'focus', 'disabled']}))
    # ---------------- cursors
    cursors = ['default', 'select', 'move', 'move_blocked', 'attack', 'attack_move', 'force_fire', 'illegal_target',
               'repair', 'capture', 'board', 'unload', 'sell', 'disable', 'sabotage', 'place_building', 'place_invalid',
               'ability_target', 'waypoint_queue', 'pan_n', 'pan_ne', 'pan_e', 'pan_se', 'pan_s', 'pan_sw', 'pan_w',
               'pan_nw', 'busy']
    for c in cursors:
        E.append(entry(id=f'cursor.{c}', category='cursor', name=c, source=SRC_CODE_UI, license=LIC_ORIGINAL,
                       editable_origin='assets/ui/cursors/*.svg', output='assets/build/ui/cursors/{name}@1x.png,@2x.png',
                       spec={'size': [32, 32], 'scales': [1, 2], 'hotspot': 'declared per cursor',
                             'animated_frames': 4 if c in ('busy', 'attack') else 1}))
    # ---------------- minimap symbols & world markers
    for m in ['unit_infantry', 'unit_vehicle', 'unit_air', 'unit_hauler', 'structure', 'structure_production',
              'hq', 'strategic_site', 'supply_field', 'supply_station', 'central_shipment', 'ping_attack', 'ping_move',
              'ping_alert', 'missile_impact', 'last_seen_structure', 'camera_frame', 'endgame_reveal']:
        E.append(entry(id=f'minimap.{m}', category='minimap_symbol', name=m, source=SRC_CODE_UI, license=LIC_ORIGINAL,
                       editable_origin='client renderer (vector draw) + assets/ui/minimap/*.svg',
                       output='drawn at runtime', spec={'shape_plus_colour': True, 'cvd_safe': True}))
    # ---------------- effects
    fx = {
        'weapon_muzzle': [w for w, _ in weapons],
        'impact': ['miss_ground', 'blocked_shot', 'hit_infantry', 'hit_light', 'hit_heavy', 'hit_structure', 'hit_air',
                   'intercepted_missile', 'decoy_defeat', 'cover_mitigated', 'illegal_target_marker'],
        'projectile': ['tracer_small', 'tracer_auto', 'shell_cannon', 'missile_at', 'shell_artillery', 'rocket_ir',
                       'mortar', 'missile_aa', 'bomb', 'tactical_missile', 'strategic_missile', 'interceptor'],
        'explosion': ['small', 'vehicle_light', 'vehicle_heavy', 'aircraft', 'building_small', 'building_large',
                      'blast_radius_2', 'blast_radius_1_5'],
        'unit': ['selection_ring_035', 'selection_ring_06', 'selection_ring_08', 'health_bar', 'veterancy_1',
                 'veterancy_2', 'ammo_pips', 'concealed', 'ambush_ready', 'designated_target', 'hull_down',
                 'relay_boost', 'drone_recall', 'disperse', 'repairing', 'healing', 'capture_channel',
                 'sabotage_channel', 'emergency_countdown', 'return_warning', 'no_landing_slot', 'dust_trail',
                 'rotor_wash', 'smoke_damaged', 'fire_critical', 'wreck_smoke'],
        'order': ['move_marker', 'attack_marker', 'attack_move_marker', 'waypoint_queue', 'blocked_order',
                  'rally_flag', 'guard_anchor', 'force_fire_area', 'rejected_order_revert'],
        'placement': ['build_ghost_valid', 'build_ghost_invalid', 'build_radius', 'power_impact', 'footprint_grid'],
        'range': ['weapon_range', 'min_range', 'abm_coverage_14', 'aegis_coverage_10', 'sight_radius', 'detection_radius'],
        'warning': ['tactical_impact_marker', 'strategic_impact_marker', 'skybreaker_route', 'saturation_markers',
                    'raid_exit_marker', 'safehouse_exit_marker', 'shieldline_ring', 'recon_sweep_circle',
                    'launch_reveal', 'defeat_countdown', 'endgame_reveal_pulse'],
        'building': ['capture_channel', 'sabotage_disabled', 'sell_dust', 'fire_damaged', 'smoke_critical',
                     'low_power_icon', 'disabled_icon', 'construction_dust', 'sabotage_resistance'],
        'fog': ['unexplored', 'explored_unseen', 'last_seen_timestamp', 'reveal_edge'],
        'environment': ['depletion_dust', 'shipment_arrival', 'supply_station_capture'],
    }
    for group, names in fx.items():
        for n in names:
            E.append(entry(id=f'fx.{group}.{n}', category='effect', subcategory=group, name=n,
                           source='hybrid: Blender-rendered flipbooks for fire/smoke/explosions; code-native shaders/vectors '
                                  'for markers, rings and bars', license=LIC_ORIGINAL,
                           editable_origin='assets/pipeline/blender/fx/*.py or client/src/render/fx/*.ts',
                           output=f'assets/build/fx/{group}/{n}/',
                           spec={'reduced_motion_variant': True, 'reduced_flash_variant': group in (
                               'weapon_muzzle', 'explosion', 'impact', 'projectile'),
                                 'never_occludes_warnings': True, 'quality_tiers': ['high', 'low']}))
    # ---------------- terrain & props
    terrain_done = set()
    tj = os.path.join(REPO, 'assets', 'build', 'terrain', 'terrain.json')
    if os.path.exists(tj):
        with open(tj) as f:
            terrain_done = set(json.load(f)['materials'])
    terrain = ['sand', 'packed_earth', 'gravel_wash', 'gravel', 'scrub_ground', 'rubble_ground', 'asphalt', 'concrete_slab',
               'dry_riverbed', 'shallow_water', 'deep_water', 'coast_sand', 'industrial_pavement', 'farmland_dry',
               'cliff_face_tier1', 'cliff_face_tier2', 'ramp', 'road_asphalt_decal', 'road_dirt_decal',
               'transition_masks', 'height_tier_edges']
    for t in terrain:
        done = t in terrain_done
        E.append(entry(id=f'terrain.{t}', category='terrain', name=t, source=SRC_NUMPY if not t.startswith(('cliff', 'ramp'))
                       else SRC_BLENDER, license=LIC_ORIGINAL,
                       editable_origin='assets/pipeline/terrain/gen_terrain.py (material function)',
                       output=f'assets/build/terrain/{t}.png (+ .height.png)',
                       spec={'size': [512, 512], 'tiles': 4, 'texels_per_tile': 128, 'seamless': True},
                       status='sample' if done else 'planned'))
    props_done = {p[len('prop.'):] for p in os.listdir(os.path.join(REPO, 'assets', 'build', 'sprites'))
                  if p.startswith('prop.')} if os.path.isdir(os.path.join(REPO, 'assets', 'build', 'sprites')) else set()
    props = ['supply_field', 'supply_station_neutral', 'central_shipment_site', 'sandbags', 'rocks', 'rubble_cover',
             'shrub', 'palm', 'forest_edge_scrub', 'fence_chainlink', 'concrete_barrier', 'container_stack',
             'fuel_tanks', 'warehouse_garrisonable', 'ruined_house_garrisonable', 'decor_building_nongarrison',
             'bridge_permanent', 'wreck_decor_vehicle', 'power_pylon', 'destructible_wall_hp_light',
             'destructible_wall_hp_heavy', 'relay_objective', 'command_relay_objective', 'depot_objective',
             'spawn_marker_editor', 'region_marker_editor']
    for p in props:
        st = 'sample' if p in props_done else 'planned'
        E.append(entry(id=f'prop.{p}', category='prop', name=p, source=SRC_BLENDER, license=LIC_ORIGINAL,
                       editable_origin=f'assets/pipeline/blender/models/props.py + assets/pipeline/specs/prop.{p}.json',
                       output=f'assets/build/sprites/prop.{p}/',
                       spec={'layers': ['beauty', 'shadow'],
                             'states': ['full', 'high', 'low', 'depleted'] if p == 'supply_field' else
                             (['intact', 'damaged', 'destroyed'] if 'destructible' in p or 'garrison' in p else ['idle'])},
                       status=st))
    # ---------------- UI / menus / presentation
    ui = ['logo_wordmark', 'faction_emblem_US', 'faction_emblem_IR', 'faction_emblem_SY', 'faction_emblem_SA',
          'main_menu_key_art', 'loading_background', 'panel_chrome_9slice', 'hud_resource_icons', 'hud_frame',
          'rank_badges', 'mastery_badges', 'player_color_swatches', 'cvd_palette_swatches']
    for u in ui:
        E.append(entry(id=f'ui.{u}', category='ui_art', name=u,
                       source=SRC_BLENDER if 'art' in u or 'background' in u else SRC_CODE_UI, license=LIC_ORIGINAL,
                       editable_origin='assets/ui/*.svg or Blender scene script', output=f'assets/build/ui/{u}.*'))
    for m in maps:
        slug = re.sub(r'[^a-z]+', '_', m.lower()).strip('_')
        E.append(entry(id=f'map.preview.{slug}', category='map_preview', name=m, source='composed from map data by '
                       'assets/pipeline/tools (scene composer) + terrain/prop sprites', license=LIC_ORIGINAL,
                       editable_origin=f'content/maps/{slug}.json', output=f'assets/build/maps/{slug}/preview.png',
                       spec={'sizes': [[640, 360], [256, 256]], 'includes_minimap_render': True}))
        E.append(entry(id=f'map.loading.{slug}', category='loading_screen', name=m, source=SRC_BLENDER + ' scene render',
                       license=LIC_ORIGINAL, editable_origin='Blender scene script per map',
                       output=f'assets/build/maps/{slug}/loading.png', spec={'size': [1920, 1080]}))
    for fac, m in missions:
        slug = re.sub(r'[^a-z0-9]+', '_', m.lower()).strip('_')
        mid = f'mission.{fac}.{slug}'
        E.append(entry(id=f'{mid}.briefing_art', category='briefing', faction=fac, name=m,
                       source=SRC_BLENDER + ' scene render + code-native map overlay', license=LIC_ORIGINAL,
                       editable_origin=f'content/missions/{fac}/{slug}.json', output=f'assets/build/missions/{fac}/{slug}/briefing.png',
                       spec={'size': [1280, 720], 'overlay': 'objectives/routes drawn from mission data'}))
        E.append(entry(id=f'{mid}.briefing_vo', category='voice_briefing', faction=fac, name=m, source=SRC_VO_BLOCKED,
                       license='to be recorded under a written work-for-hire/licence agreement',
                       editable_origin=f'content/missions/{fac}/{slug}.script.md',
                       output=f'assets/build/audio/vo/missions/{fac}/{slug}/*.ogg',
                       spec={'lines': 'briefing + debrief + in-mission objective lines', 'captions': 'required',
                             'format': 'Ogg Vorbis 48 kHz mono, -16 LUFS dialog'},
                       status='blocked', blocker='No licensed voice source; requires owner decision (actors or licensed TTS).'))
        E.append(entry(id=f'{mid}.layout', category='mission_layout', faction=fac, name=m, source='map editor + validator',
                       license=LIC_ORIGINAL, editable_origin=f'content/missions/{fac}/{slug}.json',
                       output=f'content/missions/{fac}/{slug}.json',
                       notes='Authored after the editor exists (handoff 8).'))
    for t in tutorials:
        slug = re.sub(r'[^a-z]+', '_', t.lower()).strip('_')
        E.append(entry(id=f'tutorial.{slug}.briefing_art', category='briefing', name=t, source=SRC_BLENDER,
                       license=LIC_ORIGINAL, editable_origin=f'content/missions/tutorials/{slug}.json',
                       output=f'assets/build/missions/tutorials/{slug}/briefing.png', spec={'size': [1280, 720]}))
        E.append(entry(id=f'tutorial.{slug}.vo', category='voice_briefing', name=t, source=SRC_VO_BLOCKED,
                       license='to be recorded under licence', editable_origin=f'content/missions/tutorials/{slug}.script.md',
                       output=f'assets/build/audio/vo/tutorials/{slug}/*.ogg', status='blocked',
                       blocker='No licensed voice source.'))
    for c in ('Convoy Union', 'Twin Outposts'):
        slug = c.lower().replace(' ', '_')
        E.append(entry(id=f'coop.{slug}.briefing_art', category='briefing', name=c, source=SRC_BLENDER,
                       license=LIC_ORIGINAL, editable_origin=f'content/missions/coop/{slug}.json',
                       output=f'assets/build/missions/coop/{slug}/briefing.png', spec={'size': [1280, 720]}))
    # ---------------- audio
    unit_events = ['select', 'move', 'attack', 'stop', 'unavailable', 'under_fire', 'repair', 'ability_ready', 'retreat']
    archetypes = {'US': ['infantry', 'vehicle_crew', 'pilot'], 'IR': ['infantry', 'vehicle_crew', 'drone_operator'],
                  'SY': ['infantry', 'vehicle_crew', 'drone_operator'], 'SA': ['infantry', 'vehicle_crew', 'pilot']}
    for fac, arch in archetypes.items():
        for a in arch:
            for ev in unit_events:
                E.append(entry(id=f'vo.unit.{fac}.{a}.{ev}', category='voice_unit', faction=fac, name=f'{a} {ev}',
                               source=SRC_VO_BLOCKED, license='to be recorded under licence',
                               editable_origin='assets/audio/scripts/unit_responses.md (line scripts + captions)',
                               output=f'assets/build/audio/vo/units/{fac}/{a}/{ev}_[1-3].ogg',
                               spec={'variants': 3, 'caption_key': f'captions.vo.unit.{fac}.{a}.{ev}',
                                     'cooldown_s': 2.5 if ev == 'select' else 0},
                               status='blocked', blocker='No licensed voice source.'))
    announcer = ['base_attacked', 'hauler_attacked', 'low_power', 'unit_ready', 'research_complete',
                 'aircraft_returning', 'no_landing_slot', 'missile_warning', 'interceptor_depleted',
                 'safehouse_transfer_canceled', 'strategic_site_charging', 'capture_interrupted', 'construction_complete',
                 'unit_lost', 'building_lost', 'building_captured', 'insufficient_funds', 'cannot_build_here',
                 'enemy_strategic_ready', 'our_strategic_ready', 'objective_updated', 'mission_accomplished',
                 'mission_failed', 'defeat_countdown', 'endgame_reveal', 'field_depleted', 'shipment_arrived',
                 'reconnecting', 'teammate_disconnected', 'aircraft_lost_emergency']
    for fac in FACTIONS:
        for ev in announcer:
            E.append(entry(id=f'vo.announcer.{fac}.{ev}', category='voice_announcer', faction=fac, name=ev,
                           source=SRC_VO_BLOCKED, license='to be recorded under licence',
                           editable_origin='assets/audio/scripts/announcer.md',
                           output=f'assets/build/audio/vo/announcer/{fac}/{ev}.ogg',
                           spec={'priority': 'critical' if ev in ('missile_warning', 'base_attacked', 'defeat_countdown',
                                                                   'enemy_strategic_ready') else 'normal',
                                 'bundle_window_s': 6, 'caption_key': f'captions.vo.announcer.{ev}'},
                           status='blocked', blocker='No licensed voice source.'))
    for w, cls in weapons:
        E.append(entry(id=f'sfx.weapon.{w}', category='sfx', subcategory='weapon', name=w, source=SRC_SFX_PLANNED,
                       license=LIC_ORIGINAL, editable_origin='assets/audio/sfx_projects/*', output=f'assets/build/audio/sfx/weapon/{w}_[1-3].ogg',
                       spec={'variants': 3, 'class': cls}))
    sfx = ['impact_ground', 'impact_metal_light', 'impact_metal_heavy', 'impact_structure', 'intercept_burst',
           'explosion_small', 'explosion_large', 'explosion_building', 'engine_tracked_heavy', 'engine_wheeled_light',
           'engine_technical', 'engine_8x8', 'engine_rig', 'engine_hauler', 'jet_pass', 'rotor_loop', 'drone_prop_loop',
           'footsteps_squad', 'construct_loop', 'construct_complete', 'sell', 'power_down', 'power_up', 'deploy_hydraulic',
           'launcher_setup', 'missile_warning_tone', 'defeat_countdown_tick', 'ui_click', 'ui_confirm', 'ui_error',
           'ui_tab', 'ui_hover', 'ui_queue_add', 'ui_ping', 'ambient_desert_wind', 'ambient_industrial', 'ambient_coastal',
           'ambient_river', 'ambient_highland', 'ambient_depot']
    for s_ in sfx:
        E.append(entry(id=f'sfx.{s_}', category='sfx', name=s_, source=SRC_SFX_PLANNED, license=LIC_ORIGINAL,
                       editable_origin='assets/audio/sfx_projects/*', output=f'assets/build/audio/sfx/{s_}.ogg',
                       spec={'category_bus': 'ui' if s_.startswith('ui_') else ('ambient' if s_.startswith('ambient')
                                                                             else 'effects')}))
    music = ['menu_theme', 'lobby_loop', 'briefing_bed', 'debrief_bed', 'editor_ambient', 'credits',
             'stinger_victory', 'stinger_defeat', 'stinger_mission_start', 'stinger_objective', 'stinger_strategic_warning']
    for fac in FACTIONS:
        for layer in ('calm', 'tension', 'combat'):
            music.append(f'battle_{fac}_{layer}')
    for m in music:
        E.append(entry(id=f'music.{m}', category='music', name=m, source=SRC_MUSIC_BLOCKED, license=LIC_ORIGINAL,
                       editable_origin='assets/audio/music_projects/*', output=f'assets/build/audio/music/{m}.ogg',
                       spec={'loopable': not m.startswith('stinger'), 'transition': 'bar-synced crossfade between '
                             'calm/tension/combat layers' if m.startswith('battle') else None},
                       status='blocked', blocker='No composition toolchain or composer engaged.'))
    # ---------------- fonts (real, bundled)
    for fam, files in (('barlow', ['Regular', 'Medium', 'SemiBold', 'Bold']),
                       ('barlowsemicondensed', ['Regular', 'Medium', 'SemiBold', 'Bold']),
                       ('ibmplexmono', ['Regular', 'Medium', 'SemiBold'])):
        E.append(entry(id=f'font.{fam}', category='font', name=fam, source='Google Fonts repository (github.com/google/fonts)',
                       license=LIC_OFL, editable_origin='upstream font project', output=f'assets/fonts/{fam}/',
                       spec={'weights': files}, status='final' if os.path.isdir(os.path.join(REPO, 'assets', 'fonts', fam))
                       else 'planned'))
    # ---------------- localization
    loc = {'ui': 'menus, HUD, settings, keybind names, tooltips', 'units': '75 x (name, role line, counter line, description)',
           'buildings': '19 types x faction names + descriptions', 'abilities': 'names, costs, limits, failure reasons',
           'research': 'names + effects + limitations', 'weapons': '28 display names', 'alerts': 'announcer captions',
           'captions': 'every voice line', 'missions': '24 missions + 5 tutorials + 2 co-op: briefings, objectives, debriefs',
           'errors': 'recovery states (design 22.4)', 'order_rejections': 'server reason codes -> readable text'}
    for k, v in loc.items():
        E.append(entry(id=f'l10n.en.{k}', category='localization', name=k, source='authored text (English first)',
                       license=LIC_ORIGINAL, editable_origin=f'client/src/i18n/en/{k}.json',
                       output=f'client/src/i18n/en/{k}.json', spec={'scope': v, 'icu_messageformat': True,
                                                                       'pseudo_locale_test': True}))
    apply_audio_production(E)
    return E, {'units': len(units), 'buildings': len(buildings), 'weapons': len(weapons), 'maps': len(maps),
               'missions': len(missions), 'tutorials': len(tutorials), 'abilities': len(abilities),
               'operations': len(ops), 'research': len(research)}


def main():
    entries, counts = build_manifest()
    ids = [e['id'] for e in entries]
    dup = [k for k, v in Counter(ids).items() if v > 1]
    assert not dup, f'duplicate ids: {dup[:5]}'
    os.makedirs(OUT, exist_ok=True)
    manifest = OrderedDict(schema='fc-asset-manifest/1', generated_from='outputs/frontline-command-game-design.md',
                           generator='assets/pipeline/manifest/gen_manifest.py', design_counts=counts,
                           status_legend={'planned': 'not started', 'sample': 'rendered by the project pipeline as a '
                                          'first-pass production candidate; not yet art-approved',
                                          'final': 'approved and shippable',
                                          'blocked': 'cannot proceed without an external resource or owner decision'},
                           entries=entries)
    with open(os.path.join(OUT, 'asset-manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    by_cat = Counter(e['category'] for e in entries)
    by_status = Counter(e['status'] for e in entries)
    cat_status = Counter((e['category'], e['status']) for e in entries)
    lines = ['# Asset manifest summary', '',
             'Generated by `assets/pipeline/manifest/gen_manifest.py` from the authoritative design. '
             'Do not edit by hand; edit the generator or the design.', '',
             f"Design counts parsed: {', '.join(f'{k} {v}' for k, v in counts.items())}.", '',
             f'Total entries: **{len(entries)}**. Status: ' + ', '.join(f'{k} {v}' for k, v in sorted(by_status.items())) + '.',
             '', '| Category | Entries | planned | sample | final | blocked |', '|---|---:|---:|---:|---:|---:|']
    for c in sorted(by_cat):
        lines.append(f"| {c} | {by_cat[c]} | {cat_status[(c, 'planned')]} | {cat_status[(c, 'sample')]} | "
                     f"{cat_status[(c, 'final')]} | {cat_status[(c, 'blocked')]} |")
    lines += ['', '## Entries with production output (sample or final)', '', '| ID | Status | Output |', '|---|---|---|']
    for e in entries:
        if e['status'] in ('sample', 'final'):
            lines.append(f"| `{e['id']}` | {e['status']} | `{e['output']}` |")
    lines += ['', '## Unit sprite requirements (all 75)', '', '| ID | Name | Class | States | Poses |', '|---|---|---|---|---:|']
    for e in entries:
        if e['category'] == 'unit_sprite':
            sts = ', '.join(f"{s['name']} {s['directions']}x{s['frames']}" for s in e['spec']['states'])
            lines.append(f"| `{e['id']}` | {e['name']} | {e['subcategory']} | {sts} | {e['spec']['total_poses']} |")
    with open(os.path.join(OUT, 'summary.md'), 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'{len(entries)} entries; ' + ', '.join(f'{k}={v}' for k, v in sorted(by_status.items())))
    print('counts', counts)


if __name__ == '__main__':
    main()
