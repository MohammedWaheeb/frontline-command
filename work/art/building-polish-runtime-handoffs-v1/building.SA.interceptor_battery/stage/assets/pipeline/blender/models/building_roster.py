"""Original faction architecture for the remaining Frontline Command buildings.

Shared functions provide construction/damage plumbing; each role has a distinct
functional silhouette and each faction changes massing, roof construction and
field equipment. No external game models, textures or real insignia are used.
"""
import math
import fclib
import building_common as bc
from fclib import box, cyl, slab, empty, mat

FOOTPRINTS = {'hq':(4,4),'power':(2,2),'supply':(4,3),'barracks':(3,2),'factory':(4,4),
 'radar':(3,2),'tech':(3,3),'repair_depot':(3,3),'outpost':(2,2),'bunker':(2,2),
 'gun_turret':(2,2),'aa_post':(2,2),'interceptor_battery':(3,2),'strategic_site':(4,4),
 'airfield':(6,5),'drone_hub':(4,4),'air_workshop':(3,3),'safehouse':(2,2)}

class Architect:
    def __init__(self, faction, role):
        self.faction,self.role=faction,role
        self.M=fclib.faction_mats(faction)
        self.M['lens']=mat('building_instrument', '#332E20', emission='#E3B856', emission_strength=1.5, grime=0)
        self.M['brick']=mat('fired_brick', '#785D42', rough=.9, grime=.5)
        self.M['roof']=mat('patched_sheet' if faction=='SY' else 'roof_panel',
                          '#6F6655' if faction=='SY' else '#827D68', rough=.75, metal=.2, grime=.45)
        self.M['stripe']=mat('workshop_safety', '#C3A04F', rough=.8, grime=.4)
        self.M['warhead']=mat('interceptor_ceramic', '#D8D4B8', rough=.65, grime=.15)
        self.w,self.h=FOOTPRINTS[role]
        self.r=bc.BuildingRig(empty('root'),(self.w,self.h))
        self.r.doors=[];self.r.special=[];self.r.charges=[];self.r.turret_meshes=[]
        self.r.turret=None;self.r.gun=None;self.r.role=role
        bc.pad(self.r,self.M,self.w,self.h)
    def b(self,name,size,loc,material='paint',parent=None,rot=(0,0,0),bevel=.016):
        o=box(name,size,loc=loc,rot=rot,material=self.M[material],parent=parent or self.r.root,bevel=bevel)
        self.r.structure.append(o);return o
    def c(self,name,radius,depth,loc,material='metal',parent=None,rot=(0,0,0),verts=12,top=None):
        kwargs={} if top is None else {'radius_top':top}
        o=cyl(name,radius,depth,loc=loc,rot=rot,material=self.M[material],parent=parent or self.r.root,verts=verts,bevel=.008,**kwargs)
        self.r.structure.append(o);return o
    def block(self,name,x,y,w,h,height):
        # Front-facing architecture is clear at gameplay scale, not just in a portrait.
        base=.055
        if self.faction=='IR':
            shell=slab(name,[(x-w/2,y-h/2),(x+w/2,y-h/2),(x+w/2,y+h/2),(x-w/2,y+h/2)],base,base+height,
                       material=self.M['wall'],top_scale=.87,bevel=.025,parent=self.r.root)
            self.r.structure.append(shell)
        else:self.b(name,(w,h,height),(x,y,base+height/2),'wall')
        roof=self.b(name+'_roof',(w+.10,h+.10,.09),(x,y,base+height+.035),'paint2')
        self.b(name+'_team',(w+.08,.065,.11),(x,y-h/2-.025,base+height-.045),'team')
        if self.faction=='SA':
            for side in [-1,1]:
                self.b(name+'_buttress',(w*.09,h+.12,height*.92),(x+side*w*.43,y,base+height*.46),'paint')
            self.b(name+'_sunshade',(w*.85,.25,.045),(x,y-h/2-.07,base+height*.69),'roof')
        elif self.faction=='SY':
            # Irregular corrugated roof and exposed brick reinforce improvised construction.
            self.b(name+'_patch',(w*.45,h*.62,.025),(x+w*.18,y+.06,base+height+.095),'roof',rot=(0,0,.075))
            for i in range(max(3,int(w*5))):
                self.b(name+'_roof_rib',(0.025,h+.06,.025),(x-w*.46+i*w*.92/max(1,int(w*5)-1),y,base+height+.10),'trim',bevel=0)
            for i in range(4):self.b(name+'_brick',(.14,.02,.065),(x-w*.34+i*.16,y-h/2-.006,.13+(i%2)*.075),'brick',bevel=.002)
        elif self.faction=='US':
            for side in [-1,1]:self.b(name+'_steel_corner',(.075,h+.04,height),(x+side*w*.46,y,base+height/2),'trim')
        count=max(2,int(w*2))
        for i in range(count):
            self.b(name+'_window',(.15,.016,.095),(x-w*.36+i*w*.72/max(1,count-1),y-h/2-.011,base+height*.63),'glass',bevel=.002)
        self.r.detachable.append(roof)
        return base+height+.08
    def door(self,name,x,y,width,height=.48):
        panels=[]
        # Inset dark opening is behind the shutter but in front of the wall.
        self.b(name+'_aperture',(width-.012,.006,height-.012),(x,y+.006,.055+height/2),'dark',bevel=0)
        panels.append(self.b(name,(width,.025,height),(x,y,.055+height/2),'trim'))
        for i in range(5):panels.append(self.b(name+'_rib',(width,.034,.018),(x,y-.012,.075+i*height/5),'metal',bevel=0))
        for o in panels:self.r.doors.append((o,o.location.copy(),height*.8))
        for side in [-1,1]:self.b(name+'_edge',(.04,.07,height+.08),(x+side*(width/2+.03),y,.07+height/2),'stripe')
    def vents(self,x,y,z,count=3):
        for i in range(count):
            ox=x+(i-(count-1)/2)*.19
            o=self.b('vent_box',(.14,.23,.12),(ox,y,z+.06),'trim');self.r.detachable.append(o)
            for j in range(3):self.b('vent_slot',(.115,.012,.008),(ox,y-.075+j*.075,z+.124),'metal',bevel=0)
    def mast(self,x,y,z,height=1.15,dish=False):
        for s in [-1,1]:self.c('mast_leg',.019,height,(x+s*.11,y,z+height/2),'metal',verts=6)
        for i in range(4):
            self.b('mast_brace',(.24,.02,.02),(x,y,z+.10+i*height/4),'trim',rot=(0,(-1 if i%2 else 1)*.6,0))
        top=empty('mast_rotor',loc=(x,y,z+height),parent=self.r.root)
        if dish:
            self.c('dish_bowl',.36,.13,(0,0,.08),'paint2',top,rot=(.65,0,0),verts=16,top=.12)
            self.c('dish_feed',.018,.27,(0,-.03,.25),'metal',top,rot=(.65,0,0),verts=6)
        else:
            self.b('radar_back',(.13,.85,.23),(0,0,.10),'paint',top)
            self.b('radar_face',(.02,.76,.17),(.079,0,.10),'lens',top,bevel=.002)
        self.r.spinners.append((top,'z',1));self.r.critical_hide.append(top)
        self.c('mast_warning',.04,.06,(x,y,z+height+.29),'light',verts=8)
        return z+height+.35
    def crate(self,x,y,scale=1):
        self.b('supply_crate',(.36*scale,.30*scale,.26*scale),(x,y,.055+.13*scale),'canvas')
        for s in [-1,1]:self.b('crate_band',(.025,.31*scale,.27*scale),(x+s*.10*scale,y,.055+.135*scale),'team',bevel=0)
    def tanks(self,x,y,count=2):
        for i in range(count):
            tx=x+i*.44
            self.c('service_tank',.18,.62,(tx,y,.365),'paint2',verts=12)
            self.c('tank_band',.186,.10,(tx,y,.39),'team',verts=12)
            self.c('tank_cap',.09,.05,(tx,y,.70),'metal',verts=10)
    def lamps(self):
        for side in [-1,1]:
            x,y=side*(self.w/2-.16),-self.h/2+.15
            self.c('yard_light_post',.016,.64,(x,y,.375),'metal',verts=6)
            lamp=self.b('yard_light',(.11,.09,.075),(x,y,.715),'light');self.r.detachable.append(lamp)
    def service_arm(self,x,y,z):
        root=empty('service_arm',loc=(x,y,z),parent=self.r.root)
        self.c('service_post',.055,.50,(0,0,.25),'stripe',root)
        self.b('service_boom',(.50,.06,.07),(.20,0,.51),'stripe',root)
        self.c('service_hose',.018,.33,(.43,0,.33),'dark',root,verts=6)
        self.r.special.append((root,root.location.copy(),root.rotation_euler.copy(),'service'))
        return root
    def producer_service_cue(self,arm):
        # This warm work light is part of the fixed service post, not another
        # world actor. It is hidden, including its shadow, outside servicing.
        lamp=self.b('producer_service_worklamp',(.19,.10,.14),(0,-.065,.38),'lens',arm,bevel=.015)
        self.r.service_cues=getattr(self.r,'service_cues',[])+[lamp]
    def repair_apron_arm(self):
        # Keep the Saudi depot's work silhouette clear of its deep door trim.
        # The whole swept boom remains on the existing 3x3 concrete apron.
        root=empty('repair_service_base',loc=(.20,-1.06,.07),parent=self.r.root)
        self.c('repair_service_foot',.14,.07,(0,0,.035),'metal',root,verts=10)
        self.c('repair_service_post',.065,.64,(0,0,.36),'stripe',root)
        pivot=empty('repair_service_shoulder',loc=(0,0,.70),parent=root)
        self.c('repair_service_joint',.105,.12,(0,0,0),'metal',pivot,verts=10)
        self.b('repair_service_boom',(.75,.08,.09),(.31,0,.02),'stripe',pivot)
        self.b('repair_service_brace',(.45,.055,.055),(.18,0,-.13),'metal',pivot,rot=(0,-.55,0))
        self.c('repair_service_hose',.026,.43,(.66,0,-.22),'dark',pivot,verts=8)
        self.b('repair_service_tool',(.105,.09,.12),(.66,0,-.45),'stripe',pivot)
        self.r.special.append((pivot,pivot.location.copy(),pivot.rotation_euler.copy(),'repair_service'))
    def interceptor_ir(self):
        # Original hardened electronics plinth and paired canted launch pods.
        # Only two exposed pale/warm noses represent the two gameplay charges;
        # the three small dark covers per pod are sealed equipment panels.
        r=self.r;r.battery_faction='IR'
        z=self.block('ir_electronics_plinth',-.83,.32,.82,.78,.29)
        self.vents(-.81,.35,z,2)
        self.c('ir_radar_turntable',.29,.12,(-.83,.32,z+.06),'metal',verts=12)
        r.height=self.mast(-.83,.32,z+.12,.58,dish=True)
        r.battery_dish=r.spinners[-1][0]
        # Critical retains a collapsed remnant instead of the clean bare mast
        # that an intact edge-on spinning dish can resemble in a paused frame.
        r.critical_hide.remove(r.battery_dish)
        r.critical_dark=list(r.battery_dish.children_recursive)
        r.pose_dark_material=self.M['dark']
        self.b('ir_access_hatch',(.31,.045,.22),(-.81,-.09,.23),'trim')
        self.b('ir_access_handle',(.14,.035,.025),(-.81,-.12,.24),'metal',bevel=.004)
        self.M['interceptor_tip']=mat('ir_interceptor_warm_cap', '#CE7740', rough=.6, metal=.1, grime=.1)
        self.M['interceptor_flame']=mat('interceptor_flame', '#EBA046', emission='#FFAA4C', emission_strength=2.6, grime=0)
        self.M['interceptor_core']=mat('interceptor_core', '#FFF0B5', emission='#FFE5A0', emission_strength=3.2, grime=0)
        r.launch_exhaust=[];r.charge_exhaust=[];r.charge_details=[]
        for i in range(2):
            root=empty('interceptor_rack',loc=(.08+i*.69,-.10,.35),parent=r.root)
            self.b('ir_pod_foot',(.60,.74,.24),(0,0,-.15),'wall',root)
            self.c('ir_elevation_axle',.105,.66,(0,.10,.03),'metal',root,rot=(0,math.pi/2,0),verts=12)
            cradle=empty('ir_canted_cradle',loc=(0,0,.02),parent=root)
            cradle.rotation_euler.x=.22
            self.b('ir_canted_pod',(.49,.64,.61),(0,.035,.31),'paint2',cradle,rot=(.30,0,0))
            self.b('ir_pod_armor_band',(.51,.065,.42),(0,-.285,.30),'team',cradle,rot=(.30,0,0))
            self.b('ir_pod_crown',(.51,.18,.06),(0,.07,.67),'trim',cradle,rot=(.30,0,0))
            for x,y in [(-.14,.015),(.14,.015),(.14,.24)]:
                self.b('ir_sealed_cell',(.13,.018,.12),(x,-.33-y*.295,.20+y*.955),'dark',cradle,rot=(.30,0,0),bevel=.004)
            missile=self.c('ready_missile',.14,.96,(-.10,-.095,.76),'warhead',cradle,rot=(.30,0,0),verts=12,top=.03)
            cap=self.c('ir_warm_nose_cap',.092,.255,(0,0,.35),'interceptor_tip',missile,verts=12,top=.029)
            r.charges.append(missile);r.charge_details.append([cap])
            flame=self.c('interceptor_flame',.17,.54,(0,0,-.74),'interceptor_flame',missile,verts=10,top=.036)
            core=self.c('interceptor_flame_core',.085,.39,(0,-.015,-.66),'interceptor_core',missile,verts=10,top=.024)
            flame.visible_shadow=False;core.visible_shadow=False
            r.charge_exhaust.append([flame,core]);r.launch_exhaust.extend([flame,core])
            r.special.append((cradle,cradle.location.copy(),cradle.rotation_euler.copy(),'interceptor_rack_'+str(i)))
        r.height=max(r.height,1.64)
    def interceptor_sy(self):
        # Improvised field battery: exposed welded rails, patched radio hut,
        # sandbag perimeter. Only the two physical missiles count as charges.
        r=self.r;r.battery_faction='SY'
        z=self.block('sy_radio_shelter',-.89,.33,.77,.75,.36)
        self.b('sy_field_door',(.25,.028,.29),(-.92,-.063,.21),'team')
        self.b('sy_radio_patch',(.18,.035,.14),(-.62,-.078,.30),'roof',rot=(0,0,.13))
        self.c('sy_radio_mast',.022,.64,(-.95,.31,z+.31),'metal',verts=8)
        radio=empty('sy_radio_link_pivot',loc=(-.95,.31,z+.64),parent=r.root)
        self.b('sy_radio_link',(.34,.06,.075),(0,0,0),'team',radio)
        for x in (-.13,0,.13):self.b('sy_link_element',(.025,.29,.025),(x,0,.045),'metal',radio)
        r.battery_link=radio;r.critical_hide.append(radio)
        r.disabled_dark=list(radio.children_recursive)
        r.pose_dark_material=self.M['dark']
        for i in range(6):
            self.b('sy_sandbag_front',(.39,.18,.13),(-.77+i*.365,-.73,.13),'canvas',rot=(0,0,.07*(-1 if i%2 else 1)),bevel=.055)
        for i in range(3):self.b('sy_sandbag_side',(.19,.37,.13),(-1.25,-.52+i*.35,.13),'canvas',bevel=.055)
        self.b('sy_loose_patch',(.43,.30,.035),(-.42,-.42,.083),'roof',rot=(0,0,.19),bevel=.005)
        self.M['interceptor_tip']=mat('sy_interceptor_warm_cap', '#BA723E', rough=.72, metal=.05, grime=.12)
        self.M['interceptor_flame']=mat('interceptor_flame', '#EBA046', emission='#FFAA4C', emission_strength=2.6, grime=0)
        self.M['interceptor_core']=mat('interceptor_core', '#FFF0B5', emission='#FFE5A0', emission_strength=3.2, grime=0)
        r.launch_exhaust=[];r.charge_exhaust=[];r.charge_details=[]
        for i in range(2):
            base=empty('interceptor_rack',loc=(.12+i*.72,.02,.23),parent=r.root)
            self.b('sy_welded_foot',(.57,.71,.09),(0,0,-.11),'metal',base)
            for side in (-1,1):
                self.b('sy_stool_leg',(.07,.09,.39),(side*.215,.17,.07),'trim',base,rot=(0,side*.12,0))
            cradle=empty('sy_rail_cradle',loc=(0,0,.09),parent=base)
            cradle.rotation_euler.x=.12
            for side in (-1,1):
                self.b('sy_launch_rail',(.065,.09,1.10),(side*.15,.03,.51),'metal',cradle,rot=(.30,0,0),bevel=.008)
            for step in (0,.28,.56):
                self.b('sy_rail_crossbar',(.38,.075,.045),(0,.15-step*.295,.12+step*.955),'team' if step==.28 else 'trim',cradle,rot=(.30,0,0),bevel=.006)
            self.b('sy_team_plate',(.31,.04,.20),(0,-.21,.31),'team',cradle,rot=(.30,0,.07),bevel=.007)
            self.b('sy_repair_patch',(.12,.045,.10),(.09,-.238,.29),'roof',cradle,rot=(.30,0,-.09),bevel=.003)
            missile=self.c('ready_missile',.13,.96,(0,-.055,.75),'warhead',cradle,rot=(.30,0,0),verts=12,top=.03)
            cap=self.c('sy_warm_nose_cap',.088,.255,(0,0,.35),'interceptor_tip',missile,verts=12,top=.029)
            band=self.c('sy_missile_band',.131,.075,(0,0,.16),'team',missile,verts=12)
            r.charges.append(missile);r.charge_details.append([cap,band])
            flame=self.c('interceptor_flame',.17,.54,(0,0,-.74),'interceptor_flame',missile,verts=10,top=.036)
            core=self.c('interceptor_flame_core',.085,.39,(0,-.015,-.66),'interceptor_core',missile,verts=10,top=.024)
            flame.visible_shadow=False;core.visible_shadow=False
            r.charge_exhaust.append([flame,core]);r.launch_exhaust.extend([flame,core])
            r.special.append((cradle,cradle.location.copy(),cradle.rotation_euler.copy(),'interceptor_rack_'+str(i)))
        r.height=1.70
    def interceptor_sa(self):
        # Reinforced vertical twin-cell battery with a separate phased array.
        # Concrete buttresses are fixed; only two exposed noses are ammunition.
        r=self.r;r.battery_faction='SA';r.charge_launch_angle=0.0
        self.b('sa_reinforced_apron',(2.55,1.50,.11),(0,0,.115),'wall',bevel=.045)
        self.b('sa_blast_wall',(2.46,.18,.39),(0,-.58,.30),'wall',bevel=.028)
        self.b('sa_wall_team',(1.54,.025,.13),(.15,-.687,.36),'team',bevel=.005)
        for x in (-1.12,-.44,.36,1.12):
            self.b('sa_wall_buttress',(.17,.46,.39),(x,-.51,.29),'paint2',bevel=.020)
        self.c('sa_array_foot',.29,.17,(-.88,.28,.25),'paint2',verts=8)
        self.b('sa_array_post',(.18,.18,.50),(-.88,.28,.56),'metal')
        array=empty('sa_array_gimbal',loc=(-.88,.28,.87),parent=r.root)
        self.b('sa_phased_array',(.69,.12,.68),(0,0,.11),'paint2',array,bevel=.035)
        self.b('sa_array_face',(.58,.025,.55),(0,-.076,.11),'trim',array,bevel=.010)
        for x in (-.18,0,.18):
            for z in (-.06,.12,.30):self.b('sa_array_element',(.145,.020,.135),(x,-.094,z),'lens',array,bevel=.006)
        self.b('sa_array_crown',(.73,.145,.07),(0,0,.47),'team',array)
        r.battery_link=array;r.critical_hide.append(array)
        r.disabled_dark=list(array.children_recursive)
        r.pose_dark_material=self.M['dark']
        self.M['interceptor_tip']=mat('sa_interceptor_warm_cap', '#C18145', rough=.58, metal=.1, grime=.1)
        self.M['interceptor_flame']=mat('interceptor_flame', '#EBA046', emission='#FFAA4C', emission_strength=2.6, grime=0)
        self.M['interceptor_core']=mat('interceptor_core', '#FFF0B5', emission='#FFE5A0', emission_strength=3.2, grime=0)
        r.launch_exhaust=[];r.charge_exhaust=[];r.charge_details=[]
        for i in range(2):
            root=empty('interceptor_rack',loc=(.03+i*.74,.10,.22),parent=r.root)
            self.b('sa_vertical_cell_foot',(.65,.75,.18),(0,0,.035),'wall',root,bevel=.025)
            cradle=empty('sa_vertical_cell_cradle',loc=(0,0,.06),parent=root)
            self.b('sa_vertical_cell',(.46,.58,.89),(0,0,.45),'paint2',cradle,bevel=.030)
            self.b('sa_cell_front_plate',(.39,.075,.48),(0,-.326,.43),'paint',cradle,bevel=.016)
            self.b('sa_cell_team',(.40,.024,.11),(0,-.370,.54),'team',cradle,bevel=.004)
            self.b('sa_cell_crown',(.53,.66,.09),(0,0,.93),'trim',cradle,bevel=.012)
            self.c('sa_cell_aperture',.168,.015,(0,0,.984),'dark',cradle,verts=12)
            missile=self.c('ready_missile',.14,.96,(0,0,.87),'warhead',cradle,verts=12,top=.03)
            cap=self.c('sa_warm_nose_cap',.092,.255,(0,0,.35),'interceptor_tip',missile,verts=12,top=.029)
            r.charges.append(missile);r.charge_details.append([cap])
            flame=self.c('interceptor_flame',.17,.54,(0,0,-.74),'interceptor_flame',missile,verts=10,top=.036)
            core=self.c('interceptor_flame_core',.085,.39,(0,-.015,-.66),'interceptor_core',missile,verts=10,top=.024)
            flame.visible_shadow=False;core.visible_shadow=False
            r.charge_exhaust.append([flame,core]);r.launch_exhaust.extend([flame,core])
            r.special.append((cradle,cradle.location.copy(),cradle.rotation_euler.copy(),'interceptor_rack_'+str(i)))
        r.height=1.76
    def producer_shell(self,name,x,y,w,h,height,bay):
        # A genuine hollow bay: solid sides/back and roof, no front wall or
        # black plate hiding a solid box. Two doors hinge onto the open apron.
        r=self.r;base=.055;front=y-h/2
        if not hasattr(r,'producer_bays'):r.producer_bays=[]
        r.producer_bays.append({'name':name,'x':x,'y':y,'w':w,'h':h,'height':height,'bay':bay})
        self.b(name+'_floor',(w,h,.045),(x,y,base+.022),'concrete_dark')
        for side in (-1,1):
            self.b(name+'_side',(.10,h,height),(x+side*(w/2-.05),y,base+height/2),'wall')
            width=(w-bay)/2
            self.b(name+'_front_pier',(width,.11,height),(x+side*(bay/2+width/2),front+.055,base+height/2),'wall')
        self.b(name+'_back',(w-.12,.10,height),(x,y+h/2-.05,base+height/2),'wall')
        self.b(name+'_interior',(w-.22,.013,height*.70),(x,y+h/2-.108,base+height*.42),'dark',bevel=0)
        door_h=height*.78
        self.b(name+'_lintel',(bay+.05,.16,height-door_h),(x,front+.05,base+door_h+(height-door_h)/2),'paint2')
        self.b(name+'_header_team',(bay*.82,.025,.105),(x,front-.045,base+height-.065),'team',bevel=.004)
        for side in (-1,1):
            pivot=empty(name+'_door_hinge',loc=(x+side*bay/2,front-.015,base),parent=r.root)
            leaf=bay/2-.01
            self.b(name+'_door_leaf',(leaf,.04,door_h-.015),(-side*leaf/2,0,door_h/2),'trim',pivot)
            for k in range(4):self.b(name+'_door_rib',(leaf,.05,.026),(-side*leaf/2,-.028,.10+k*door_h*.21),'metal',pivot,bevel=.004)
            self.b(name+'_door_mark',(leaf*.54,.052,.09),(-side*leaf/2,-.029,door_h*.64),'team',pivot,bevel=.004)
            r.special.append((pivot,pivot.location.copy(),pivot.rotation_euler.copy(),'producer_bay_'+str(side)))
        return base+height
    def producer_us(self):
        r=self.r;x,y=-.92,.56;w,h=3.12,2.32
        z=self.producer_shell('us_wing_hangar',x,y,w,h,.94,2.05)
        # Broad faceted gable and exposed roof ribs, distinct from other roofs.
        for side in (-1,1):
            panels=[self.b('us_hangar_roof',(w*.54,h+.22,.075),(x+side*w*.25,y,z+.15),'paint2',rot=(0,side*.17,0),bevel=.020)]
            for k in range(6):panels.append(self.b('us_roof_rib',(w*.54,.045,.055),(x+side*w*.25,y-h*.43+k*h*.86/5,z+.205),'trim',rot=(0,side*.17,0),bevel=.006))
            if side==1:r.critical_hide.extend(panels)
        self.b('us_roof_ridge',(.18,h+.24,.075),(x,y,z+.29),'team')
        self.b('us_taxi_apron',(5.52,1.25,.015),(0,-1.64,.067),'concrete_dark')
        for i in range(8):self.b('us_taxi_dash',(.31,.06,.009),(-2.38+i*.67,-1.63,.080),'stripe',bevel=0)
        self.block('us_control_stem',2.03,1.26,.59,.68,1.03)
        self.b('us_control_cab',(.93,.84,.38),(2.03,1.26,1.22),'paint2',bevel=.038)
        self.b('us_control_glazing',(.84,.87,.20),(2.03,1.26,1.25),'glass',bevel=.030)
        r.critical_hide.append(self.b('us_control_roof',(1.02,.96,.09),(2.03,1.26,1.48),'team'))
        r.critical_hide.append(self.c('us_control_antenna',.018,.42,(2.27,1.45,1.73),'metal',verts=8))
        self.producer_service_cue(self.service_arm(1.27,-.52,.08))
        self.vents(-1.95,1.16,z+.22,3)
        r.height=1.96
    def producer_sa(self):
        r=self.r
        for i,x in enumerate((-.67,1.05)):
            z=self.producer_shell('sa_service_bay_'+str(i),x,.35,1.49,2.06,.94,1.00)
            canopy=self.b('sa_thick_canopy',(1.67,2.25,.17),(x,.35,z+.08),'wall',bevel=.035)
            inset=self.b('sa_canopy_inset',(1.27,1.72,.055),(x,.35,z+.19),'roof')
            if i==1:r.critical_hide.extend([canopy,inset])
            for side in (-1,1):self.b('sa_bay_buttress',(.20,1.10,.75),(x+side*.67,-.34,.43),'paint2',bevel=.024)
        self.c('sa_control_tower',.46,1.10,(-2.12,1.20,.62),'wall',verts=8)
        self.c('sa_control_glazing',.51,.22,(-2.12,1.20,1.21),'glass',verts=8)
        r.critical_hide.append(self.c('sa_control_crown',.58,.12,(-2.12,1.20,1.39),'team',verts=8))
        r.critical_hide.append(self.b('sa_roof_array',(.16,.59,.39),(-2.12,1.20,1.66),'paint2',rot=(0,.18,0)))
        r.critical_hide.append(self.b('sa_array_face',(.026,.47,.28),(-2.015,1.20,1.68),'lens',rot=(0,.18,0),bevel=.005))
        self.b('sa_court',(4.77,.87,.015),(.15,-1.74,.067),'concrete_dark')
        for i in range(5):self.b('sa_court_dash',(.46,.075,.009),(-1.90+i*.94,-1.73,.08),'stripe',bevel=0)
        self.producer_service_cue(self.service_arm(.30,-1.40,.08))
        self.tanks(1.73,1.62,2)
        r.height=1.93
    def producer_ir(self):
        r=self.r;x,y=-.44,.50;w,h=2.07,1.65
        z=self.producer_shell('ir_drone_shelter',x,y,w,h,.68,1.43)
        for side in (-1,1):
            panels=[self.b('ir_segmented_roof',(w*.54,h+.18,.15),(x+side*w*.24,y,z+.12),'paint2',rot=(0,side*.30,0),bevel=.024)]
            for k in range(4):panels.append(self.b('ir_roof_segment',(.055,h+.21,.065),(x+side*(.20+k*.22),y,z+.29-k*.065),'trim',bevel=.007))
            if side==1:r.critical_hide.extend(panels)
        self.b('ir_roof_link_spine',(.22,1.34,.10),(x,y,z+.33),'team')
        r.height=self.mast(-1.36,1.12,.10,1.16,dish=True)
        for side in (-1,1):
            self.b('ir_gantry_leg',(.095,.095,.72),(1.10+side*.34,-.43,.43),'metal')
        self.b('ir_service_gantry',(.86,.15,.13),(1.10,-.43,.83),'paint2')
        tool=empty('ir_service_head',loc=(1.10,-.43,.74),parent=r.root)
        self.b('ir_service_head_body',(.18,.20,.15),(0,0,0),'team',tool)
        self.c('ir_service_cable',.02,.35,(0,0,-.20),'dark',tool,verts=8)
        r.special.append((tool,tool.location.copy(),tool.rotation_euler.copy(),'produce'))
        self.producer_service_cue(self.service_arm(.46,-1.12,.08))
        self.b('ir_operations_rack',(.65,.42,.38),(-1.14,-1.15,.26),'paint2')
        self.b('ir_operations_team',(.53,.025,.12),(-1.14,-1.373,.30),'team')
        r.height=max(r.height,1.78)
    def producer_sy(self):
        r=self.r;x,y=-.35,.31;w,h=1.74,1.63
        z=self.producer_shell('sy_repair_shed',x,y,w,h,.78,1.12)
        r.critical_hide.append(self.b('sy_sloped_roof',(1.98,1.87,.09),(x,y,z+.13),'roof',rot=(0,.11,0),bevel=.013))
        r.critical_hide.append(self.b('sy_roof_patch',(.82,.76,.034),(-.04,.63,z+.16),'paint2',rot=(0,.11,.075),bevel=.006))
        for k in range(8):r.critical_hide.append(self.b('sy_roof_rib',(.025,1.85,.027),(-1.17+k*.23,y,z+.24-k*.025),'trim',rot=(0,.11,0),bevel=0))
        for k in range(3):self.b('sy_exposed_brick',(.22,.04,.09),(-1.04+k*.23,-.524,.19+k%2*.11),'brick',bevel=.004)
        self.b('sy_repair_awning',(.86,.80,.035),(.91,-.77,.72),'canvas',rot=(.14,0,0),bevel=.006)
        for x in (.55,1.25):self.c('sy_awning_leg',.022,.67,(x,-1.12,.385),'metal',verts=6)
        self.producer_service_cue(self.service_arm(.45,-1.40,.08))
        self.c('sy_radio_mast',.022,1.11,(1.05,.90,.62),'metal',verts=8)
        self.b('sy_radio_crossbar',(.55,.035,.04),(1.05,.90,1.13),'team')
        for x in (.87,1.05,1.23):self.b('sy_radio_element',(.022,.28,.022),(x,.90,1.17),'metal',bevel=.003)
        self.crate(-.92,-1.12,.82)
        self.b('sy_workshop_sign',(.51,.025,.18),(-.35,-.535,.70),'team',bevel=.008)
        r.height=1.42
    def make(self):
        role,r=self.role,self.r
        if role in ('hq','outpost'):
            small=role=='outpost';w,h=(1.3,1.0) if small else (2.5,2.1)
            z=self.block('command_house',-.18,0,w,h,.66 if small else .78)
            self.door('command_entry',.1,-h/2-.02,.35)
            if self.faction=='SY':
                # A repaired civilian courtyard and a conspicuous angular aerial.
                tower=self.block('watch_room',-.42,.35,.55,.60,z+.40)
                r.height=self.mast(-.42,.35,tower,.5)
            elif self.faction=='SA':
                self.c('octagonal_cab',.42,.50,(-.4,.2,z+.25),'wall',verts=8)
                self.c('cab_glass',.43,.16,(-.4,.2,z+.43),'glass',verts=8)
                self.c('cab_cap',.47,.10,(-.4,.2,z+.56),'team',verts=8,top=.38)
                r.height=self.mast(-.4,.2,z+.62,.45)
            elif self.faction=='IR' and not small:
                # A headquarters must read as the command anchor, not an outpost.
                self.c('command_drum',.47,.72,(-.61,.39,z+.36),'wall',verts=8,top=.41)
                self.c('command_glazing',.43,.15,(-.61,.39,z+.61),'glass',verts=8)
                self.c('command_band',.49,.085,(-.61,.39,z+.74),'team',verts=8)
                self.c('command_cap',.53,.09,(-.61,.39,z+.83),'paint2',verts=8,top=.43)
                for i in range(8):
                    angle=i*math.pi/4
                    self.b('command_rib',(.035,.055,.70),(-.61+.448*math.cos(angle),.39+.448*math.sin(angle),z+.37),'trim',rot=(0,0,angle))
                r.height=self.mast(-.61,.39,z+.88,.52,dish=True)
                self.block('rig_annex',1.39,-.13,.77,1.23,.58)
                self.door('rig_gate',1.39,-.765,.64,.49)
                self.b('rig_ramp',(.65,.39,.022),(1.39,-.99,.055),'concrete_dark',rot=(.04,0,0))
                self.crate(-1.60,-1.40,.75)
            else:r.height=self.mast(-.45,.30,z,.75 if small else 1.1,dish=self.faction=='IR')
            if not small:
                self.vents(.5,.45,z)
                if self.faction!='IR':self.crate(1.3,-1.4)
        elif role=='power':
            # Three horizontal diesel housings, a capacitor bank and exhausts.
            z=self.block('generator_shed',-.13,.05,1.12,1.02,.55)
            self.vents(-.13,.1,z)
            for i in range(2):
                x=-.62+i*.37
                self.c('exhaust_stack',.065,1.02,(x,.57,.56),'metal',verts=8)
                self.c('exhaust_ring',.095,.055,(x,.57,1.055),'trim',verts=8)
            for i in range(3):self.b('transformer_fin',(.12,.42,.37),(.68,-.33+i*.25,.24),'paint2')
            r.height=1.15
        elif role=='supply':
            z=self.block('depot_office',-.95,.44,1.50,1.1,.73);self.vents(-.95,.44,z)
            self.block('loading_awning',.90,.48,1.35,1.00,.26)
            for x in [.5,1.0,1.5]:self.crate(x,.50)
            # Gantry and open receipt apron face the hauler approach.
            for x in [.28,1.68]:self.b('gantry_column',(.09,.10,1.2),(x,.82,.65),'stripe')
            self.b('gantry_crossbar',(1.52,.14,.14),(.98,.82,1.24),'paint')
            hook=empty('gantry_hook',loc=(.90,.80,.86),parent=r.root)
            self.c('hoist_cable',.013,.52,(0,0,0),'metal',hook,verts=6)
            self.b('hoist_clamp',(.16,.11,.10),(0,0,-.28),'stripe',hook)
            r.special.append((hook,hook.location.copy(),hook.rotation_euler.copy(),'produce'))
            self.door('supply_gate',-.95,-.12,.72)
            for i in range(3):self.b('receipt_line',(.05,.55,.008),(.5+i*.4,-.78,.061),'stripe',bevel=0)
            r.height=1.42
        elif role=='barracks':
            z=self.block('barracks',-.35,.12,1.70,1.12,.67);self.door('infantry_door',-.32,-.455,.42)
            if self.faction=='IR':self.c('roof_water',.25,.42,(-.62,.21,z+.21),'paint2',verts=12)
            elif self.faction=='SY':
                # Offset shade covers the rest area, leaving the production door readable.
                self.b('canvas_awning',(.70,.48,.045),(-.83,-.66,.70),'canvas',rot=(.09,0,0))
                for x in [-1.13,-.53]:self.c('awning_post',.015,.66,(x,-.85,.38),'trim',verts=6)
            else:self.vents(-.35,.22,z)
            self.crate(1.1,.5)
            self.b('training_frame',(.035,.6,.48),(1.1,-.25,.29),'trim')
            for i in range(3):self.b('training_target',(.06,.14,.17),(1.13,-.45+i*.20,.40),'team')
            r.height=1.28
        elif role in ('factory','repair_depot'):
            repair=role=='repair_depot';w=2.25 if repair else 3.20;h=1.6 if repair else 2.35
            z=self.block('maintenance_hall',0,.24,w,h,.85)
            for x in [-w*.25,w*.25]:self.door('vehicle_bay',x,.24-h/2-.02,w*.35,.66)
            self.vents(-.6,.6,z,4)
            if self.faction in ('IR','SY'):
                for i in range(5):self.b('sawtooth_roof',(w*.19,h+.05,.10),(-w*.4+i*w*.2,.24,z+.08),'roof',rot=(0,.22,0))
            else:
                for s in [-1,1]:self.b('roof_spine',(.08,h,.13),(s*w*.30,.24,z+.10),'team')
            if repair:self.repair_apron_arm()
            else:self.service_arm(w*.34,-h/2+.08,.07)
            self.tanks(-w*.34,.24+h/2+.25,2)
            if not repair:
                self.c('factory_stack',.13,1.40,(-1.53,1.48,.77),'brick',verts=12)
                self.c('stack_lip',.16,.10,(-1.53,1.48,1.46),'metal',verts=12)
            r.height=1.65
        elif role in ('radar','tech'):
            z=self.block('control_lab',-.32,-.02,1.7,1.20,.71)
            self.door('lab_entry',.17,-.64,.34)
            self.vents(-.7,-.08,z)
            if role=='radar':r.height=self.mast(.53,.34,z,.96,dish=self.faction in ('IR','SY'))
            else:
                self.c('test_chamber',.48,.74,(.68,.68,.43),'wall',verts=12)
                self.c('chamber_band',.49,.10,(.68,.68,.70),'team',verts=12)
                self.c('sensor_cap',.46,.21,(.68,.68,.88),'paint2',verts=12,top=.06)
                self.b('lab_window',(.028,.44,.20),(.547,-.13,.42),'lens')
                r.height=self.mast(-.67,.38,z,.54,dish=True)
        elif role=='bunker':
            shape=[(-.77,-.69),(.55,-.69),(.82,-.40),(.82,.52),(.57,.76),(-.77,.76)]
            o=slab('bunker_shell',shape,.055,.64,material=self.M['concrete_dark'],top_scale=.79,bevel=.035,parent=r.root);r.structure.append(o)
            self.b('firing_slit',(1.05,.025,.07),(0,-.631,.40),'dark')
            self.b('roof_band',(1.12,.11,.035),(-.1,-.38,.66),'team')
            self.c('roof_hatch',.26,.06,(.13,.20,.68),'paint',verts=8)
            for i in range(5):self.b('sandbag',(.23,.14,.11),(-.57+i*.24,-.60,.74),'canvas',bevel=.04)
            for i in range(3):
                gun=self.c('garrison_barrel',.02,.28,(-.32+i*.31,-.77,.40),'metal',rot=(math.pi/2,0,0),verts=8)
                r.special.append((gun,gun.location.copy(),gun.rotation_euler.copy(),'garrison'))
            r.height=.95
        elif role in ('gun_turret','aa_post'):
            self.c('defense_plinth',.64,.34,(0,0,.22),'wall',verts=8,top=.49)
            self.c('bearing_ring',.46,.10,(0,0,.43),'team',verts=16)
            pivot=empty('turret_pivot',loc=(0,0,.52),parent=r.root);r.turret=pivot
            before=len(r.structure)
            self.b('turret_casing',(.63,.51,.30),(0,0,.15),'paint',pivot)
            self.b('turret_band',(.54,.07,.12),(-.02,-.27,.20),'team',pivot)
            gun=empty('gun_cradle',loc=(.10,0,.24),parent=pivot);r.gun=gun
            if role=='gun_turret':
                self.c('gun_barrel',.035,.66,(.43,0,0),'metal',gun,rot=(0,math.pi/2,0),verts=12)
                self.c('gun_brake',.057,.10,(.80,0,0),'trim',gun,rot=(0,math.pi/2,0),verts=10)
            else:
                for side in [-1,1]:
                    self.b('aa_pod',(.62,.18,.19),(.13,side*.35,.15),'paint2',gun,rot=(0,-.38,0))
                    for j in [-1,1]:self.c('aa_muzzle',.04,.08,(.46,side*.35+j*.043,.28),'dark',gun,rot=(0,math.pi/2-.38,0),verts=8)
                self.b('aa_radar',(.07,.36,.22),(-.19,0,.51),'lens',pivot)
            r.turret_meshes=r.structure[before:];r.height=1.38
        elif role=='interceptor_battery':
            if self.faction=='IR':self.interceptor_ir()
            elif self.faction=='SY':self.interceptor_sy()
            elif self.faction=='SA':self.interceptor_sa()
            else:
                z=self.block('battery_control',-.93,.18,.69,1.01,.53)
                self.mast(-.93,.18,z,.40)
                # Only this role owns the transient launch geometry/materials.
                # They never appear in another building's source or shader state.
                self.M['interceptor_flame']=mat('interceptor_flame', '#EBA046', emission='#FFAA4C', emission_strength=2.6, grime=0)
                self.M['interceptor_core']=mat('interceptor_core', '#FFF0B5', emission='#FFE5A0', emission_strength=3.2, grime=0)
                r.launch_exhaust=[];r.charge_exhaust=[]
                for i in range(2):
                    root=empty('interceptor_rack',loc=(.18+i*.67,.10,.40),parent=r.root)
                    self.b('rack_base',(.52,.72,.36),(0,0,-.12),'paint2',root)
                    self.b('launcher_box',(.34,.56,.59),(0,.03,.29),'paint',root,rot=(.30,0,0))
                    self.b('launcher_team',(.35,.075,.33),(0,-.26,.27),'team',root,rot=(.30,0,0))
                    # Clearly exposed pale missile noses make the finite charge
                    # rack readable at gameplay size, not merely in a zoomed render.
                    missile=self.c('ready_missile',.125,.96,(0,-.075,.68),'warhead',root,rot=(.30,0,0),verts=12,top=.030)
                    r.charges.append(missile)
                    # Exhaust follows the actual departing charge and has no solid
                    # cast shadow. The cone widens toward the tail, away from the
                    # nozzle; the lighter core keeps the cue readable at native1x.
                    flame=self.c('interceptor_flame',.17,.54,(0,0,-.74),'interceptor_flame',missile,verts=10,top=.036)
                    core=self.c('interceptor_flame_core',.085,.39,(0,-.015,-.66),'interceptor_core',missile,verts=10,top=.024)
                    flame.visible_shadow=False;core.visible_shadow=False
                    r.charge_exhaust.append([flame,core]);r.launch_exhaust.extend([flame,core])
                    r.special.append((root,root.location.copy(),root.rotation_euler.copy(),'interceptor_rack_'+str(i)))
                r.height=1.58
        elif role=='strategic_site':
            z=self.block('strategic_bunker',-.99,.55,1.12,1.74,.63)
            self.mast(-.99,.55,z,.81,dish=self.faction in ('US','SY'))
            # Deliberately different centerpiece for each strategic operation.
            if self.faction=='IR':
                for i in range(3):
                    x,y=.35+(i%2)*.83,-.68+(i//2)*1.1
                    self.c('silo_collar',.34,.09,(x,y,.11),'team',verts=16)
                    self.c('silo_well',.287,.006,(x,y,.165),'dark',verts=16)
                    hatch=self.c('silo_hatch',.29,.10,(x,y,.20),'paint',verts=16)
                    r.special.append((hatch,hatch.location.copy(),hatch.rotation_euler.copy(),'activate'))
            elif self.faction=='SA':
                self.c('shield_generator',.66,.66,(.54,.10,.43),'wall',verts=8,top=.46)
                for i in range(4):
                    a=i*math.pi/2
                    self.c('shield_pylon',.10,1.15,(.54+.71*math.cos(a),.10+.71*math.sin(a),.63),'team',verts=8)
                    relay=empty('shield_relay_hinge',loc=(.54+.71*math.cos(a),.10+.71*math.sin(a),1.14),parent=r.root)
                    relay.rotation_euler.y=.78;relay.rotation_euler.z=a
                    self.b('shield_relay_plate',(.10,.35,.41),(0,0,.19),'paint2',relay,bevel=.035)
                    self.b('shield_relay_face',(.115,.25,.25),(0,0,.21),'lens',relay,bevel=.025)
                    self.b('shield_relay_crown',(.13,.38,.045),(0,0,.405),'team',relay)
                    r.special.append((relay,relay.location.copy(),relay.rotation_euler.copy(),'relay_'+str(i)))
                rotor=empty('generator_rotor_pivot',loc=(.54,.10,.92),parent=r.root)
                self.c('generator_rotor',.40,.12,(0,0,0),'paint2',rotor,verts=8)
                # An asymmetric marker makes rotation visible on the octagonal rotor.
                self.b('generator_rotor_index',(.10,.59,.025),(.13,0,.074),'team',rotor)
                r.spinners.append((rotor,'z',1))
                r.special.append((rotor,rotor.location.copy(),rotor.rotation_euler.copy(),'relay_rotor'))
            elif self.faction=='SY':
                self.block('operations_shelter',.64,.60,1.29,1.35,.53)
                self.door('operations_entry',.73,-.10,.32,.43)
                self.mast(1.02,.75,.62,.45)
                self.b('radio_link_rack',(.68,.24,.20),(.55,.20,.72),'paint2')
                for i in range(3):
                    x=-.18+i*.66
                    self.b('dispatch_console',(.51,.42,.31),(x,-.92,.22),'paint2')
                    self.b('dispatch_console_band',(.44,.025,.10),(x,-1.14,.24),'team')
                    self.b('dispatch_control',(.39,.30,.027),(x,-.92,.385),'dark')
                    for j in range(3):self.b('dispatch_key',(.055,.06,.014),(x-.10+j*.10,-.96,.405),'light',bevel=.004)
                    lid=empty('dispatch_lid',loc=(x,-.70,.40),parent=r.root)
                    self.b('dispatch_weather_lid',(.54,.44,.035),(0,-.22,.01),'roof',lid)
                    self.b('dispatch_route_panel',(.41,.31,.016),(0,-.22,-.018),'lens',lid)
                    self.c('dispatch_antenna',.012,.41,(x-.23,-.73,.57),'metal',verts=6)
                    self.b('dispatch_radio_tip',(.06,.05,.075),(x-.23,-.73,.80),'team')
                    r.special.append((lid,lid.location.copy(),lid.rotation_euler.copy(),'dispatch_'+str(i)))
            else:
                dish=empty('wing_uplink_gimbal',loc=(.62,.13,.69),parent=r.root)
                self.c('uplink_dish',.69,.28,(0,0,0),'wall',dish,rot=(.48,0,0),verts=20,top=.14)
                self.c('uplink_stem',.10,.65,(.62,.13,.39),'metal',verts=10)
                self.b('operations_rack',(1.17,.51,.35),(.47,-1.25,.23),'paint2')
                for i in range(3):
                    panel=empty('wing_status_hinge',loc=(.06+i*.41,-1.23,.42),parent=r.root)
                    panel.rotation_euler.x=-.95
                    self.b('wing_status_frame',(.33,.07,.38),(0,0,.19),'paint',panel)
                    self.b('wing_status_screen',(.26,.025,.30),(0,-.048,.19),'lens',panel)
                    # Three original flight-plan glyphs represent the coordinated wing.
                    self.b('flight_indicator_body',(.03,.026,.24),(0,-.07,.19),'team',panel,bevel=.004)
                    self.b('flight_indicator_wing',(.20,.026,.04),(0,-.07,.20),'team',panel,bevel=.004)
                    self.b('flight_indicator_tail',(.10,.026,.028),(0,-.07,.09),'team',panel,bevel=.004)
                    r.special.append((panel,panel.location.copy(),panel.rotation_euler.copy(),'wing_'+str(i)))
                r.special.append((dish,dish.location.copy(),dish.rotation_euler.copy(),'wing_gimbal'))
            for i in range(8):
                o=self.b('charge_lamp',(.115,.09,.055),(-1.55+i*.19,-1.6,.12),'light')
                r.special.append((o,o.location.copy(),o.rotation_euler.copy(),'charge_'+str(i)))
            r.height=2.25
        elif role in ('airfield','drone_hub','air_workshop'):
            if self.faction=='US':self.producer_us()
            elif self.faction=='SA':self.producer_sa()
            elif self.faction=='IR':self.producer_ir()
            elif self.faction=='SY':self.producer_sy()
        elif role=='safehouse':
            z=self.block('courtyard_house',-.1,.17,1.29,1.26,.76)
            self.door('safehouse_door',.15,-.48,.37,.48)
            self.c('water_tank',.21,.31,(-.31,.31,z+.17),'roof',verts=12)
            self.b('courtyard_wall',(1.67,.10,.24),(-.05,-.84,.18),'wall')
            self.b('patched_awning',(.52,.51,.045),(.53,-.40,.61),'canvas',rot=(.10,.03,0))
            self.crate(-.64,-.62,.6)
            r.height=1.23
        else:raise ValueError('unknown building role '+role)
        self.lamps()
        r.critical_hide.extend(o for o in r.structure if o.parent is r.root and
                               o.location.z>.8 and o.name.startswith(('vent_','stack_','exhaust_','gantry_','tower_','shield_pylon')))
        # Neutral naming is only an authoring detail: all silhouettes remain original.
        bc.make_scaffold(r,self.M,self.w-.3,self.h-.3,r.height*.8)
        bc.make_rubble(r,self.M,self.w,self.h,seed=sum(map(ord,self.faction+role)))
        bc.install_cutter(r)
        r.hardpoints={}
        for name,loc in {'healthbar':(0,0,r.height+.16),'rally':(0,-self.h/2-.3,0),'smoke_1':(-.3,.12,r.height*.72),'smoke_2':(.45,-.15,r.height*.4)}.items():
            point=empty('hp_'+name,loc=loc,parent=r.root);point['fc_parts']=['building'];r.hardpoints[name]=point
        if r.gun:
            point=empty('hp_muzzle',loc=(.85,0,0) if role=='gun_turret' else (.49,.35,.28),parent=r.gun)
            point['fc_parts']=['turret'];r.hardpoints['muzzle']=point
        r.original={o:(o.location.copy(),o.rotation_euler.copy(),o.scale.copy()) for o in r.root.children_recursive}
        dark_objects=getattr(r,'disabled_dark',[])+getattr(r,'critical_dark',[])
        r.pose_original_materials={o:tuple(o.data.materials) for o in dark_objects if o.type=='MESH'}
        return r

def build(faction,params):
    return Architect(faction,params['building']).make()

def pose(rig,st,frame,d):
    for obj,(loc,rot,scale) in rig.original.items():obj.location,obj.rotation_euler,obj.scale=loc.copy(),rot.copy(),scale.copy()
    for obj,materials in rig.pose_original_materials.items():
        for index,material in enumerate(materials):obj.data.materials[index]=material
    name,n=st['name'],max(1,st['frames']);phase=frame/n*math.tau
    structural_count=None
    if rig.role=='interceptor_battery':
        structural_variants={base+'_charges_'+str(count):(base,count) for base in ('lowpower','disabled','damaged','critical') for count in (0,1)}
        if name in structural_variants:name,structural_count=structural_variants[name]
    generic=name if name in ('foundation','construct','idle','lowpower','disabled','damaged','critical','rubble') else 'idle'
    visible,shadow=bc.pose_building(rig,{**st,'name':generic},frame)
    if generic=='idle':fclib.set_emission_scale(1+.06*math.sin(phase))
    hide=[]
    if name!='service_active':hide.extend(getattr(rig,'service_cues',[]))
    opening=name in ('produce','repair_active','service_active','exit_open','transfer_prep')
    for obj,base,height in rig.doors:
        if opening:obj.location.z+=height*(frame/max(1,n-1) if name in ('produce','transfer_prep') else .82)
    for obj,base,rot,kind in rig.special:
        if kind.startswith('producer_bay_') and opening:
            side=int(kind.rsplit('_',1)[1]);fraction=frame/max(1,n-1) if name=='produce' else .82
            if name=='service_active':fraction=.28
            obj.rotation_euler.z=side*1.35*fraction
        if kind=='garrison':
            if name!='garrisoned':hide.append(obj)
            else:obj.location.y+=.035*(frame%2)
        if kind=='service' and name in ('service_active','repair_active'):
            obj.rotation_euler.z+=(.55 if hasattr(rig,'producer_bays') else .25)*math.sin(phase)
        if kind=='repair_service' and name=='repair_active':obj.rotation_euler.z+=.45*math.sin(phase)
        if kind=='produce' and name=='produce':obj.location.x+=.32*math.sin(phase)
        if kind.startswith('interceptor_rack_') and name in ('launch','launch_empty'):
            firing=1 if name=='launch' else 0
            if int(kind[-1])==firing:
                obj.rotation_euler.x-=.10*(0,.85,.35,0)[min(frame,3)]
        if kind=='activate' and name=='activate':obj.location.x+=.4*frame/max(1,n-1)
        if kind.startswith('wing_') and kind[5:].isdigit():
            index=int(kind[5:])
            if name=='ready':obj.rotation_euler.x=-.20+.04*math.sin(phase+index)
            if name=='activate':obj.rotation_euler.x=-.20+.55*min(1,max(0,(frame/max(1,n-1)-.12*index)/.70))
        if kind=='wing_gimbal' and name=='activate':obj.rotation_euler.z+=.48*frame/max(1,n-1)
        if kind.startswith('dispatch_') and kind[9:].isdigit():
            index=int(kind[9:])
            if name=='ready':obj.rotation_euler.x=-.36
            if name=='activate':obj.rotation_euler.x=-.36-.86*min(1,max(0,(frame/max(1,n-1)-.12*index)/.70))
        if kind.startswith('relay_') and kind[6:].isdigit():
            index=int(kind[6:])
            if name=='ready':obj.rotation_euler.y=.22+.04*math.sin(phase+index)
            if name=='activate':obj.rotation_euler.y=.22-.60*min(1,max(0,(frame/max(1,n-1)-.05*index)/.80))
        if kind=='relay_rotor' and name=='activate':obj.rotation_euler.z+=phase*.63
        if kind.startswith('charge_'):
            index=int(kind.split('_')[1])
            if name=='charging' and index>frame or name not in ('charging','ready','activate'):hide.append(obj)
    if name.startswith('charges_'):
        hide+=rig.charges[int(name[-1]):]
    if rig.role=='interceptor_battery':
        if structural_count is not None:hide.extend(rig.charges[structural_count:])
        exhaust=rig.launch_exhaust
        if name in ('launch','launch_empty'):
            # Two→one fires rack1, matching charges_1's remaining rack0.
            # One→zero fires rack0 and never fabricates another ready charge.
            firing=1 if name=='launch' else 0
            travel=(0,.45,.95,1.15)[min(frame,3)]
            missile=rig.charges[firing]
            launch_angle=getattr(rig,'charge_launch_angle',.30)
            missile.location.y-=math.sin(launch_angle)*travel
            missile.location.z+=math.cos(launch_angle)*travel
            if name=='launch_empty':hide.append(rig.charges[1])
            active_exhaust=rig.charge_exhaust[firing] if frame<3 else []
            if frame>=3:hide.append(missile)
            hide.extend(obj for obj in exhaust if obj not in active_exhaust)
        else:hide.extend(exhaust)
        if getattr(rig,'battery_faction',None)=='IR':
            # Keep low-power visibly distinct while retaining every ready charge.
            # Disabled folds further; structural charge counts remain independent.
            if generic in ('lowpower','disabled'):
                rig.battery_dish.rotation_euler.x+=.48 if generic=='lowpower' else .95
            elif generic=='critical':
                rig.battery_dish.rotation_euler=(1.45,0,-.35)
                rig.battery_dish.scale=(.45,.65,1)
                rig.battery_dish.location.z-=.18
                for obj in rig.critical_dark:
                    if obj.type=='MESH':obj.data.materials[0]=rig.pose_dark_material
        if getattr(rig,'battery_faction',None)=='SY' and generic in ('lowpower','disabled'):
            rig.battery_link.rotation_euler.x=.75 if generic=='lowpower' else 0
        if getattr(rig,'battery_faction',None)=='SA':
            if generic=='idle':rig.battery_link.rotation_euler.z=.10*math.sin(phase)
            elif generic in ('lowpower','disabled'):
                rig.battery_link.rotation_euler.x=.65 if generic=='lowpower' else math.pi/2
        if generic=='disabled':
            for obj in getattr(rig,'disabled_dark',[]):
                if obj.type=='MESH':obj.data.materials[0]=rig.pose_dark_material
        if hasattr(rig,'charge_details'):
            for missile,details in zip(rig.charges,rig.charge_details):
                if missile in hide:hide.extend(details)
        shadow=[obj for obj in shadow if obj not in exhaust]
    if rig.turret:
        if st.get('part')=='turret':
            rig.turret.rotation_euler.z=fclib.heading_to_blender_z(d,st['directions'])
            if name=='fire':rig.gun.location.x-=.08*(1-frame/max(1,n-1))
            return rig.turret_meshes,rig.turret_meshes
        if st.get('part')!='whole' and name not in ('foundation','construct','lowpower','disabled','damaged','critical','rubble'):
            visible=[o for o in visible if o not in rig.turret_meshes]
            shadow=[o for o in shadow if o not in rig.turret_meshes]
    visible=[o for o in visible if o not in hide]
    shadow=[o for o in shadow if o not in hide]
    return visible,shadow
