def _mask_source_alpha(material):
    if material is None:
        return 1.0
    alpha = float(material.diffuse_color[3])
    if material.use_nodes:
        nodes = [n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED']
        if len(nodes) != 1 or nodes[0].inputs['Alpha'].is_linked:
            raise ValueError('Team mask requires constant Principled opacity: ' + material.name)
        alpha = float(nodes[0].inputs['Alpha'].default_value)
    if not math.isfinite(alpha) or not 0 <= alpha <= 1:
        raise ValueError('Invalid team-mask opacity')
    return alpha


def _mask_coverage_material(team, alpha):
    name = 'fc_coverage_' + str(int(team)) + '_' + alpha.hex()
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (1, 1, 1, 1) if team else (0, 0, 0, 1)
    emit.inputs['Strength'].default_value = 1
    if alpha == 1:
        material.node_tree.links.new(emit.outputs[0], output.inputs['Surface'])
    else:
        transparent = nodes.new('ShaderNodeBsdfTransparent')
        mix = nodes.new('ShaderNodeMixShader')
        mix.inputs[0].default_value = alpha
        material.node_tree.links.new(transparent.outputs[0], mix.inputs[1])
        material.node_tree.links.new(emit.outputs[0], mix.inputs[2])
        material.node_tree.links.new(mix.outputs[0], output.inputs['Surface'])
    return material


def render_passes(rig, part_objs, out_paths, layers=('beauty', 'team', 'shadow'), shadow_objs=None):
    # Preserve the exact original single-pass path for every opaque scene.
    part_objs = list(part_objs)
    translucent = set()
    source_slots = []
    if 'team' in layers:
        for obj in part_objs:
            alphas = []
            for slot in obj.material_slots:
                material = slot.material
                team = bool(material and material.get('fc_team'))
                alpha = 1.0 if team else _mask_source_alpha(material)
                source_slots.append((obj, slot, material, team, alpha))
                alphas.append(alpha)
            if any(a < 1 for a in alphas):
                if not all(a < 1 for a in alphas):
                    raise ValueError('Mixed opaque/translucent mesh needs explicit mask support: ' + obj.name)
                translucent.add(obj)
    if not translucent:
        return _render_passes_original(rig, part_objs, out_paths, layers, shadow_objs)

    sc = bpy.context.scene
    meshes = rig.meshes()
    saved_visibility = [(obj, obj.hide_render, obj.visible_camera) for obj in meshes]
    saved_materials = [(slot, slot.material) for obj in meshes for slot in obj.material_slots]
    settings = (sc.cycles.samples, sc.cycles.transparent_max_bounces, sc.render.filepath,
                sc.view_settings.view_transform, sc.view_settings.look,
                sc.view_settings.exposure, sc.view_settings.gamma,
                sc.render.image_settings.file_format, sc.render.image_settings.color_mode,
                sc.render.image_settings.color_depth, rig.ground.hide_render,
                sc.cycles.use_denoising, sc.render.dither_intensity)
    coverage_path = None
    try:
        if 'beauty' in layers:
            _render_passes_original(rig, part_objs, out_paths, ('beauty',), shadow_objs)
        # Shading is the original white material, with translucent non-team
        # pieces absent. Coverage below supplies their true attenuation.
        white, holdout = _team_mask_material()
        part_set = set(part_objs)
        for obj in meshes:
            obj.hide_render = obj not in part_set or obj in translucent
            obj.visible_camera = True
        for obj, slot, material, team, alpha in source_slots:
            slot.material = white if team else holdout
        rig.ground.hide_render = True
        sc.cycles.samples = 32
        sc.render.filepath = out_paths['team']
        bpy.ops.render.render(write_still=True)

        # Linear camera coverage uses no Holdout shader at all. Transparent
        # black surfaces attenuate white team emission; plain surfaces stay0.
        for obj in meshes:
            obj.hide_render = obj not in part_set
            obj.visible_camera = True
        for obj, slot, material, team, alpha in source_slots:
            slot.material = _mask_coverage_material(team, alpha)
        sc.view_settings.view_transform = 'Raw'
        sc.view_settings.look = 'None'
        sc.view_settings.exposure = 0
        sc.view_settings.gamma = 1
        # Coverage is a neutral mathematical mask; denoiser color estimates
        # and display dithering must not introduce chromatic edge noise.
        sc.cycles.use_denoising = False
        sc.render.dither_intensity = 0
        sc.cycles.transparent_max_bounces = max(16, settings[1])
        sc.render.image_settings.file_format = 'PNG'
        sc.render.image_settings.color_mode = 'RGBA'
        sc.render.image_settings.color_depth = '8'
        handle, coverage_path = tempfile.mkstemp(suffix='.png', prefix='fc-team-coverage-')
        os.close(handle)
        sc.render.filepath = coverage_path
        bpy.ops.render.render(write_still=True)
        merge_coverage(out_paths['team'], coverage_path)

        # Restore every original material and rendering setting before shadow.
        for slot, material in saved_materials:
            slot.material = material
        sc.cycles.samples, sc.cycles.transparent_max_bounces = settings[:2]
        sc.view_settings.view_transform, sc.view_settings.look = settings[3:5]
        sc.view_settings.exposure, sc.view_settings.gamma = settings[5:7]
        sc.render.image_settings.file_format, sc.render.image_settings.color_mode, sc.render.image_settings.color_depth = settings[7:10]
        sc.cycles.use_denoising, sc.render.dither_intensity = settings[11:13]
        if 'shadow' in layers:
            _render_passes_original(rig, part_objs, out_paths, ('shadow',), shadow_objs)
    finally:
        for slot, material in saved_materials:
            slot.material = material
        for obj, hidden, camera in saved_visibility:
            obj.hide_render, obj.visible_camera = hidden, camera
        sc.cycles.samples, sc.cycles.transparent_max_bounces, sc.render.filepath = settings[:3]
        sc.view_settings.view_transform, sc.view_settings.look = settings[3:5]
        sc.view_settings.exposure, sc.view_settings.gamma = settings[5:7]
        sc.render.image_settings.file_format, sc.render.image_settings.color_mode, sc.render.image_settings.color_depth = settings[7:10]
        rig.ground.hide_render = settings[10]
        sc.cycles.use_denoising, sc.render.dither_intensity = settings[11:13]
        if coverage_path and os.path.exists(coverage_path):
            os.unlink(coverage_path)
