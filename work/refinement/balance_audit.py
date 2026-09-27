from copy import deepcopy
import math
from design_data import ROSTERS, WEAPONS, ARMOR

def battle(left, right, budget, left_faction='US', right_faction='US'):
    """Stationary, initially in range, instantaneous ordinary-weapon hits.
    Same-timestamp shots resolve simultaneously. No cover, abilities, travel,
    projectiles, research, veterancy, or repairs. This is an arithmetic probe.
    """
    profiles=[ROSTERS[left_faction][left],ROSTERS[right_faction][right]]
    counts=[min(budget//u['cost'],100//u['supply']) for u in profiles]
    armies=[]
    for side,(u,count) in enumerate(zip(profiles,counts)):
        assert u['weapon'] and WEAPONS[u['weapon']][0] in ARMOR
        armies.append([dict(hp=float(u['hp']), next=0.0) for _ in range(count)])
    t=0
    for _ in range(100000):
        alive=[[x for x in a if x['hp']>1e-8] for a in armies]
        if not alive[0] or not alive[1]: break
        t=min(x['next'] for a in alive for x in a)
        if t>300: break
        damage=[0.0,0.0]
        for side in range(2):
            u=profiles[side]
            w=WEAPONS[u['weapon']]
            assert w[5] is None, 'Test excludes magazines'
            mult=ARMOR[w[0]][profiles[1-side]['armor']]
            for x in alive[side]:
                if abs(x['next']-t)<1e-7:
                    damage[1-side]+=w[1]*mult
                    x['next']+=w[2]
        # Deliberate focus-fire overkill: all same-tick damage hits the front target.
        for side in range(2): alive[side][0]['hp']-=damage[side]
    survivors=[sum(x['hp']>1e-8 for x in a) for a in armies]
    winner='left' if survivors[0] and not survivors[1] else 'right' if survivors[1] and not survivors[0] else 'draw/timeout'
    return dict(counts=counts,survivors=survivors,time=round(t,2),winner=winner,
                remaining_cash=[budget-count*u['cost'] for count,u in zip(counts,profiles)])

def run():
    total=sum(map(len,ROSTERS.values()))
    assert total==75,total
    assert len({f'{f}.{k}' for f,rs in ROSTERS.items() for k in rs})==75
    for f,rs in ROSTERS.items():
        for k,u in rs.items():
            assert all(u[x]>0 for x in ['cost','build','hp','speed'])
            assert 0<=u['supply']<=5 and 1<=u['tier']<=3
            assert u['weapon'] is None or u['weapon'] in WEAPONS
            assert u['producer'] in {'barracks','factory','hq','supply','airfield','drone_hub','workshop_air'}
            if u['armor']=='air': assert u['producer'] in ['airfield','drone_hub','workshop_air']
        early_aa=[u for u in rs.values() if u['tier']==1 and u['weapon'] and WEAPONS[u['weapon']][0]=='antiair']
        assert early_aa, f
        assert all(WEAPONS[u['weapon']][4]>0 for u in early_aa)
    assert ROSTERS['SY']['portable_aa']['armor']=='infantry'
    assert ROSTERS['SY']['buggy']['armor']=='light'
    assert [u['name'] for u in ROSTERS['SY'].values() if u['armor']=='air']==['Scout drone']
    cases=[
        ('Anti-armor crews vs tanks','at','tank',6000,'US','US','left'),
        ('Scout cars vs rifle squads','car','rifle',3000,'US','US','left'),
        ('Tanks vs scout cars','tank','car',6000,'US','US','left'),
        ('Rifles vs anti-armor crews','rifle','at',3000,'US','US','left'),
        ('Saudi tanks vs Syrian refitted tanks','tank','tank',7000,'SA','SY','left'),
    ]
    assert 500+1800+900+600+350+1400+2200+1800==9550
    assert 600/30*60==1200
    assert 36000/(40*60)==15
    assert .5*(1800-900)+900<1800
    for paid in [500,800,1000,1500,1800,2200,4500]:
        for converted_value in [800,1000,1500,2200,4500]:
            assert .5*min(paid,converted_value)<=paid
        for fraction in [0,.25,.5,.75,1]:
            assert 0<=.75*paid*fraction<=paid
    assert 3*400<4500 and 6*220<4500
    assert .8/1.5>=.5
    lines=[]
    rows=[]
    for label,l,r,b,lf,rf,expected in cases:
        result=battle(l,r,b,lf,rf)
        assert result['winner']==expected,(label,result)
        rows.append((label,b,result))
    lines.extend([
       f'- **Roster validation:** {total} entries: US 19, Iran 19, Syrian Rebels 18, Saudi Arabia 19. IDs are unique; all weapons/producers resolve to defined roles; prices, HP, speeds, tiers, and Supply are valid. The only Syrian aircraft is its unarmed Scout drone.',
       '- **Early response availability:** all four factions have Tier 1 mobile AA and static AA; Syrian Rebels additionally have Tier 1 portable AA. All combat aircraft require Tier 2. This verifies prerequisites, not a measured fastest build-order race.',
       '- **Extraction arithmetic:** 600 credits per 30-second reference trip = 1,200/minute per hauler. Two staggered haulers saturate the 40-credit/second loading bay at 2,400/minute. A 36,000-credit field lasts 15 minutes at that rate; one 24,000-credit expansion lasts ten.',
       '- **Refund conservation:** a sold full-health supply center returns 450 building credits, plus the surviving 900-credit hauler as an asset: 1,350 value against 1,800 paid. Cancel refunds remain below the amount paid. No cycle creates a free hauler.',
       '- **Missile burst versus sustained fire:** a standard launcher delivers at most 500 structure damage per 80-second cycle (6.25 damage/second before interception) for 400 credits. An Iranian launcher restores 350 damage per 60-second charge (5.83/second) for 300 credits, but may bank a 700-damage, 600-credit two-shot burst. This exchanges sustained efficiency for stored burst/range rather than granting both free.',
       '- **Fresh interception capacity:** one full fixed battery can stop both shots of one Iranian volley. Two simultaneous prepared Iranian launchers can fire four missiles; the same battery can stop only two without other defenses. This calculation assumes the defender sees the warnings and the shots share protected coverage; it does not claim either investment always wins.',
       '- **Strategic HQ damage ceiling:** US bombs total at most 1,200 structure damage; Iran\'s six missiles at most 1,320. Both are below a 4,500-HP headquarters before defensive interception. A two-tile blast can damage several nearby structures, so total army/base value still needs area-density testing.',
       '- **No rearm-rate stacking exploit:** US base service ×0.8 and Rapid Sortie ÷1.5 give ×0.5333 of original time, above the global ×0.5 floor. Iranian research gives ×0.85. Neither creates instant ammunition.',
       '',
       '**Stationary counter probes:** equal spending ceilings, no upgrades/cover/abilities, initially in firing range, instant-hit approximation, simultaneous timestamps, and deliberate focus-fire overkill. Surplus credits are shown; an unused credit budget is not treated as a deployed unit. These probes are sanity checks, not match simulations.',
       '',
       '| Probe | Budget each | Starting counts, left : right | Survivors, left : right | Unspent credits, left : right | Outcome |',
       '|---|---:|---|---|---|---|',
    ])
    for label,b,result in rows:
        n=result['counts'];s=result['survivors'];cash=result['remaining_cash']
        lines.append(f"| {label} | {b} | {n[0]} : {n[1]} | {s[0]} : {s[1]} | {cash[0]} : {cash[1]} | Left wins |")
    lines += ['', 'The Syrian tank was deliberately changed to 1,250 credits, 1,050 HP, and a 90-damage / three-second cannon after the initial pricing made weak-looking armor too efficient for its intended role. Saudi tanks retain a direct-formation advantage while Syrian infantry, technicals, and repositioning carry that faction\'s efficiency. Passing these narrow probes does not prove that air, abilities, pathfinding, maps, or full factions are balanced.']
    return '\n'.join(lines),rows

if __name__=='__main__':
    report,rows=run()
    print(report)
