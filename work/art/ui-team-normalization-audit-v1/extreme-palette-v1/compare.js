var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e2) {
    throw err = [e2], e2;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e2) {
    throw mod = 0, e2;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// client/node_modules/pixi.js/lib/extensions/Extensions.mjs
var ExtensionType, normalizeExtension, normalizeExtensionPriority, extensions;
var init_Extensions = __esm({
  "client/node_modules/pixi.js/lib/extensions/Extensions.mjs"() {
    "use strict";
    ExtensionType = /* @__PURE__ */ ((ExtensionType2) => {
      ExtensionType2["Application"] = "application";
      ExtensionType2["WebGLPipes"] = "webgl-pipes";
      ExtensionType2["WebGLPipesAdaptor"] = "webgl-pipes-adaptor";
      ExtensionType2["WebGLSystem"] = "webgl-system";
      ExtensionType2["WebGLLoader"] = "webgl-loader";
      ExtensionType2["WebGPUPipes"] = "webgpu-pipes";
      ExtensionType2["WebGPUPipesAdaptor"] = "webgpu-pipes-adaptor";
      ExtensionType2["WebGPUSystem"] = "webgpu-system";
      ExtensionType2["WebGPULoader"] = "webgpu-loader";
      ExtensionType2["CanvasSystem"] = "canvas-system";
      ExtensionType2["CanvasPipesAdaptor"] = "canvas-pipes-adaptor";
      ExtensionType2["CanvasPipes"] = "canvas-pipes";
      ExtensionType2["CanvasLoader"] = "canvas-loader";
      ExtensionType2["Asset"] = "asset";
      ExtensionType2["LoadParser"] = "load-parser";
      ExtensionType2["ResolveParser"] = "resolve-parser";
      ExtensionType2["CacheParser"] = "cache-parser";
      ExtensionType2["DetectionParser"] = "detection-parser";
      ExtensionType2["MaskEffect"] = "mask-effect";
      ExtensionType2["BlendMode"] = "blend-mode";
      ExtensionType2["TextureSource"] = "texture-source";
      ExtensionType2["TextureUploaderWebGL"] = "texture-uploader-webgl";
      ExtensionType2["TextureUploaderWebGPU"] = "texture-uploader-webgpu";
      ExtensionType2["Environment"] = "environment";
      ExtensionType2["ShapeBuilder"] = "shape-builder";
      ExtensionType2["Batcher"] = "batcher";
      return ExtensionType2;
    })(ExtensionType || {});
    normalizeExtension = (ext) => {
      if (typeof ext === "function" || typeof ext === "object" && ext.extension) {
        if (!ext.extension) {
          throw new Error("Extension class must have an extension object");
        }
        const metadata = typeof ext.extension !== "object" ? { type: ext.extension } : ext.extension;
        ext = { ...metadata, ref: ext };
      }
      if (typeof ext === "object") {
        ext = { ...ext };
      } else {
        throw new Error("Invalid extension type");
      }
      if (typeof ext.type === "string") {
        ext.type = [ext.type];
      }
      return ext;
    };
    normalizeExtensionPriority = (ext, defaultPriority) => normalizeExtension(ext).priority ?? defaultPriority;
    extensions = {
      /** @ignore */
      _addHandlers: {},
      /** @ignore */
      _removeHandlers: {},
      /** @ignore */
      _queue: {},
      /**
       * Remove extensions from PixiJS.
       * @param extensions - Extensions to be removed. Can be:
       * - Extension class with static `extension` property
       * - Extension format object with `type` and `ref`
       * - Multiple extensions as separate arguments
       * @returns {extensions} this for chaining
       * @example
       * ```ts
       * // Remove a single extension
       * extensions.remove(MyRendererPlugin);
       *
       * // Remove multiple extensions
       * extensions.remove(
       *     MyRendererPlugin,
       *     MySystemPlugin
       * );
       * ```
       * @see {@link ExtensionType} For available extension types
       * @see {@link ExtensionFormat} For extension format details
       */
      remove(...extensions2) {
        extensions2.map(normalizeExtension).forEach((ext) => {
          ext.type.forEach((type) => this._removeHandlers[type]?.(ext));
        });
        return this;
      },
      /**
       * Register new extensions with PixiJS. Extensions can be registered in multiple formats:
       * - As a class with a static `extension` property
       * - As an extension format object
       * - As multiple extensions passed as separate arguments
       * @param extensions - Extensions to add to PixiJS. Each can be:
       * - A class with static `extension` property
       * - An extension format object with `type` and `ref`
       * - Multiple extensions as separate arguments
       * @returns This extensions instance for chaining
       * @example
       * ```ts
       * // Register a simple extension
       * extensions.add(MyRendererPlugin);
       *
       * // Register multiple extensions
       * extensions.add(
       *     MyRendererPlugin,
       *     MySystemPlugin,
       * });
       * ```
       * @see {@link ExtensionType} For available extension types
       * @see {@link ExtensionFormat} For extension format details
       * @see {@link extensions.remove} For removing registered extensions
       */
      add(...extensions2) {
        extensions2.map(normalizeExtension).forEach((ext) => {
          ext.type.forEach((type) => {
            const handlers = this._addHandlers;
            const queue = this._queue;
            if (!handlers[type]) {
              queue[type] = queue[type] || [];
              queue[type]?.push(ext);
            } else {
              handlers[type]?.(ext);
            }
          });
        });
        return this;
      },
      /**
       * Internal method to handle extensions by name.
       * @param type - The extension type.
       * @param onAdd  - Function handler when extensions are added/registered {@link StrictExtensionFormat}.
       * @param onRemove  - Function handler when extensions are removed/unregistered {@link StrictExtensionFormat}.
       * @returns this for chaining.
       * @internal
       * @ignore
       */
      handle(type, onAdd, onRemove) {
        const addHandlers = this._addHandlers;
        const removeHandlers = this._removeHandlers;
        if (addHandlers[type] || removeHandlers[type]) {
          throw new Error(`Extension type ${type} already has a handler`);
        }
        addHandlers[type] = onAdd;
        removeHandlers[type] = onRemove;
        const queue = this._queue;
        if (queue[type]) {
          queue[type]?.forEach((ext) => onAdd(ext));
          delete queue[type];
        }
        return this;
      },
      /**
       * Handle a type, but using a map by `name` property.
       * @param type - Type of extension to handle.
       * @param map - The object map of named extensions.
       * @returns this for chaining.
       * @ignore
       */
      handleByMap(type, map) {
        return this.handle(
          type,
          (extension) => {
            if (extension.name) {
              map[extension.name] = extension.ref;
            }
          },
          (extension) => {
            if (extension.name) {
              delete map[extension.name];
            }
          }
        );
      },
      /**
       * Handle a type, but using a list of extensions with a `name` property.
       * @param type - Type of extension to handle.
       * @param map - The array of named extensions.
       * @param defaultPriority - Fallback priority if none is defined.
       * @returns this for chaining.
       * @ignore
       */
      handleByNamedList(type, map, defaultPriority = -1) {
        return this.handle(
          type,
          (extension) => {
            const index = map.findIndex((item) => item.name === extension.name);
            if (index >= 0) return;
            map.push({ name: extension.name, value: extension.ref });
            map.sort((a2, b2) => normalizeExtensionPriority(b2.value, defaultPriority) - normalizeExtensionPriority(a2.value, defaultPriority));
          },
          (extension) => {
            const index = map.findIndex((item) => item.name === extension.name);
            if (index !== -1) {
              map.splice(index, 1);
            }
          }
        );
      },
      /**
       * Handle a type, but using a list of extensions.
       * @param type - Type of extension to handle.
       * @param list - The list of extensions.
       * @param defaultPriority - The default priority to use if none is specified.
       * @returns this for chaining.
       * @ignore
       */
      handleByList(type, list, defaultPriority = -1) {
        return this.handle(
          type,
          (extension) => {
            if (list.includes(extension.ref)) {
              return;
            }
            list.push(extension.ref);
            list.sort((a2, b2) => normalizeExtensionPriority(b2, defaultPriority) - normalizeExtensionPriority(a2, defaultPriority));
          },
          (extension) => {
            const index = list.indexOf(extension.ref);
            if (index !== -1) {
              list.splice(index, 1);
            }
          }
        );
      },
      /**
       * Mixin the source object(s) properties into the target class's prototype.
       * Copies all property descriptors from source objects to the target's prototype.
       * @param Target - The target class to mix properties into
       * @param sources - One or more source objects containing properties to mix in
       * @example
       * ```ts
       * // Create a mixin with shared properties
       * const moveable = {
       *     x: 0,
       *     y: 0,
       *     move(x: number, y: number) {
       *         this.x += x;
       *         this.y += y;
       *     }
       * };
       *
       * // Create a mixin with computed properties
       * const scalable = {
       *     scale: 1,
       *     get scaled() {
       *         return this.scale > 1;
       *     }
       * };
       *
       * // Apply mixins to a class
       * extensions.mixin(Sprite, moveable, scalable);
       *
       * // Use mixed-in properties
       * const sprite = new Sprite();
       * sprite.move(10, 20);
       * console.log(sprite.x, sprite.y); // 10, 20
       * ```
       * @remarks
       * - Copies all properties including getters/setters
       * - Does not modify source objects
       * - Preserves property descriptors
       * @see {@link Object.defineProperties} For details on property descriptors
       * @see {@link Object.getOwnPropertyDescriptors} For details on property copying
       */
      mixin(Target, ...sources2) {
        for (const source2 of sources2) {
          Object.defineProperties(Target.prototype, Object.getOwnPropertyDescriptors(source2));
        }
      }
    };
  }
});

// client/node_modules/eventemitter3/index.js
var require_eventemitter3 = __commonJS({
  "client/node_modules/eventemitter3/index.js"(exports, module) {
    "use strict";
    var has = Object.prototype.hasOwnProperty;
    var prefix = "~";
    function Events() {
    }
    if (Object.create) {
      Events.prototype = /* @__PURE__ */ Object.create(null);
      if (!new Events().__proto__) prefix = false;
    }
    function EE(fn, context2, once) {
      this.fn = fn;
      this.context = context2;
      this.once = once || false;
    }
    function addListener(emitter, event, fn, context2, once) {
      if (typeof fn !== "function") {
        throw new TypeError("The listener must be a function");
      }
      var listener = new EE(fn, context2 || emitter, once), evt = prefix ? prefix + event : event;
      if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
      else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
      else emitter._events[evt] = [emitter._events[evt], listener];
      return emitter;
    }
    function clearEvent(emitter, evt) {
      if (--emitter._eventsCount === 0) emitter._events = new Events();
      else delete emitter._events[evt];
    }
    function EventEmitter2() {
      this._events = new Events();
      this._eventsCount = 0;
    }
    EventEmitter2.prototype.eventNames = function eventNames() {
      var names = [], events, name;
      if (this._eventsCount === 0) return names;
      for (name in events = this._events) {
        if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
      }
      if (Object.getOwnPropertySymbols) {
        return names.concat(Object.getOwnPropertySymbols(events));
      }
      return names;
    };
    EventEmitter2.prototype.listeners = function listeners(event) {
      var evt = prefix ? prefix + event : event, handlers = this._events[evt];
      if (!handlers) return [];
      if (handlers.fn) return [handlers.fn];
      for (var i2 = 0, l2 = handlers.length, ee = new Array(l2); i2 < l2; i2++) {
        ee[i2] = handlers[i2].fn;
      }
      return ee;
    };
    EventEmitter2.prototype.listenerCount = function listenerCount(event) {
      var evt = prefix ? prefix + event : event, listeners = this._events[evt];
      if (!listeners) return 0;
      if (listeners.fn) return 1;
      return listeners.length;
    };
    EventEmitter2.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt]) return false;
      var listeners = this._events[evt], len = arguments.length, args, i2;
      if (listeners.fn) {
        if (listeners.once) this.removeListener(event, listeners.fn, void 0, true);
        switch (len) {
          case 1:
            return listeners.fn.call(listeners.context), true;
          case 2:
            return listeners.fn.call(listeners.context, a1), true;
          case 3:
            return listeners.fn.call(listeners.context, a1, a2), true;
          case 4:
            return listeners.fn.call(listeners.context, a1, a2, a3), true;
          case 5:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
          case 6:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
        }
        for (i2 = 1, args = new Array(len - 1); i2 < len; i2++) {
          args[i2 - 1] = arguments[i2];
        }
        listeners.fn.apply(listeners.context, args);
      } else {
        var length = listeners.length, j2;
        for (i2 = 0; i2 < length; i2++) {
          if (listeners[i2].once) this.removeListener(event, listeners[i2].fn, void 0, true);
          switch (len) {
            case 1:
              listeners[i2].fn.call(listeners[i2].context);
              break;
            case 2:
              listeners[i2].fn.call(listeners[i2].context, a1);
              break;
            case 3:
              listeners[i2].fn.call(listeners[i2].context, a1, a2);
              break;
            case 4:
              listeners[i2].fn.call(listeners[i2].context, a1, a2, a3);
              break;
            default:
              if (!args) for (j2 = 1, args = new Array(len - 1); j2 < len; j2++) {
                args[j2 - 1] = arguments[j2];
              }
              listeners[i2].fn.apply(listeners[i2].context, args);
          }
        }
      }
      return true;
    };
    EventEmitter2.prototype.on = function on(event, fn, context2) {
      return addListener(this, event, fn, context2, false);
    };
    EventEmitter2.prototype.once = function once(event, fn, context2) {
      return addListener(this, event, fn, context2, true);
    };
    EventEmitter2.prototype.removeListener = function removeListener(event, fn, context2, once) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt]) return this;
      if (!fn) {
        clearEvent(this, evt);
        return this;
      }
      var listeners = this._events[evt];
      if (listeners.fn) {
        if (listeners.fn === fn && (!once || listeners.once) && (!context2 || listeners.context === context2)) {
          clearEvent(this, evt);
        }
      } else {
        for (var i2 = 0, events = [], length = listeners.length; i2 < length; i2++) {
          if (listeners[i2].fn !== fn || once && !listeners[i2].once || context2 && listeners[i2].context !== context2) {
            events.push(listeners[i2]);
          }
        }
        if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
        else clearEvent(this, evt);
      }
      return this;
    };
    EventEmitter2.prototype.removeAllListeners = function removeAllListeners(event) {
      var evt;
      if (event) {
        evt = prefix ? prefix + event : event;
        if (this._events[evt]) clearEvent(this, evt);
      } else {
        this._events = new Events();
        this._eventsCount = 0;
      }
      return this;
    };
    EventEmitter2.prototype.off = EventEmitter2.prototype.removeListener;
    EventEmitter2.prototype.addListener = EventEmitter2.prototype.on;
    EventEmitter2.prefixed = prefix;
    EventEmitter2.EventEmitter = EventEmitter2;
    if ("undefined" !== typeof module) {
      module.exports = EventEmitter2;
    }
  }
});

// client/node_modules/eventemitter3/index.mjs
var import_index, eventemitter3_default;
var init_eventemitter3 = __esm({
  "client/node_modules/eventemitter3/index.mjs"() {
    import_index = __toESM(require_eventemitter3(), 1);
    eventemitter3_default = import_index.default;
  }
});

// client/node_modules/@pixi/colord/index.mjs
var r, t, n, e, u, a, o, i, s, h, b, g, d, f, c, l, p, v, m, y, N, x, M, H, $, j, w, S, k;
var init_colord = __esm({
  "client/node_modules/@pixi/colord/index.mjs"() {
    r = { grad: 0.9, turn: 360, rad: 360 / (2 * Math.PI) };
    t = function(r2) {
      return "string" == typeof r2 ? r2.length > 0 : "number" == typeof r2;
    };
    n = function(r2, t2, n2) {
      return void 0 === t2 && (t2 = 0), void 0 === n2 && (n2 = Math.pow(10, t2)), Math.round(n2 * r2) / n2 + 0;
    };
    e = function(r2, t2, n2) {
      return void 0 === t2 && (t2 = 0), void 0 === n2 && (n2 = 1), r2 > n2 ? n2 : r2 > t2 ? r2 : t2;
    };
    u = function(r2) {
      return (r2 = isFinite(r2) ? r2 % 360 : 0) > 0 ? r2 : r2 + 360;
    };
    a = function(r2) {
      return { r: e(r2.r, 0, 255), g: e(r2.g, 0, 255), b: e(r2.b, 0, 255), a: e(r2.a) };
    };
    o = function(r2) {
      return { r: n(r2.r), g: n(r2.g), b: n(r2.b), a: n(r2.a, 3) };
    };
    i = /^#([0-9a-f]{3,8})$/i;
    s = function(r2) {
      var t2 = r2.toString(16);
      return t2.length < 2 ? "0" + t2 : t2;
    };
    h = function(r2) {
      var t2 = r2.r, n2 = r2.g, e2 = r2.b, u2 = r2.a, a2 = Math.max(t2, n2, e2), o2 = a2 - Math.min(t2, n2, e2), i2 = o2 ? a2 === t2 ? (n2 - e2) / o2 : a2 === n2 ? 2 + (e2 - t2) / o2 : 4 + (t2 - n2) / o2 : 0;
      return { h: 60 * (i2 < 0 ? i2 + 6 : i2), s: a2 ? o2 / a2 * 100 : 0, v: a2 / 255 * 100, a: u2 };
    };
    b = function(r2) {
      var t2 = r2.h, n2 = r2.s, e2 = r2.v, u2 = r2.a;
      t2 = t2 / 360 * 6, n2 /= 100, e2 /= 100;
      var a2 = Math.floor(t2), o2 = e2 * (1 - n2), i2 = e2 * (1 - (t2 - a2) * n2), s2 = e2 * (1 - (1 - t2 + a2) * n2), h2 = a2 % 6;
      return { r: 255 * [e2, i2, o2, o2, s2, e2][h2], g: 255 * [s2, e2, e2, i2, o2, o2][h2], b: 255 * [o2, o2, s2, e2, e2, i2][h2], a: u2 };
    };
    g = function(r2) {
      return { h: u(r2.h), s: e(r2.s, 0, 100), l: e(r2.l, 0, 100), a: e(r2.a) };
    };
    d = function(r2) {
      return { h: n(r2.h), s: n(r2.s), l: n(r2.l), a: n(r2.a, 3) };
    };
    f = function(r2) {
      return b((n2 = (t2 = r2).s, { h: t2.h, s: (n2 *= ((e2 = t2.l) < 50 ? e2 : 100 - e2) / 100) > 0 ? 2 * n2 / (e2 + n2) * 100 : 0, v: e2 + n2, a: t2.a }));
      var t2, n2, e2;
    };
    c = function(r2) {
      return { h: (t2 = h(r2)).h, s: (u2 = (200 - (n2 = t2.s)) * (e2 = t2.v) / 100) > 0 && u2 < 200 ? n2 * e2 / 100 / (u2 <= 100 ? u2 : 200 - u2) * 100 : 0, l: u2 / 2, a: t2.a };
      var t2, n2, e2, u2;
    };
    l = /^hsla?\(\s*([+-]?\d*\.?\d+)(deg|rad|grad|turn)?\s*,\s*([+-]?\d*\.?\d+)%\s*,\s*([+-]?\d*\.?\d+)%\s*(?:,\s*([+-]?\d*\.?\d+)(%)?\s*)?\)$/i;
    p = /^hsla?\(\s*([+-]?\d*\.?\d+)(deg|rad|grad|turn)?\s+([+-]?\d*\.?\d+)%\s+([+-]?\d*\.?\d+)%\s*(?:\/\s*([+-]?\d*\.?\d+)(%)?\s*)?\)$/i;
    v = /^rgba?\(\s*([+-]?\d*\.?\d+)(%)?\s*,\s*([+-]?\d*\.?\d+)(%)?\s*,\s*([+-]?\d*\.?\d+)(%)?\s*(?:,\s*([+-]?\d*\.?\d+)(%)?\s*)?\)$/i;
    m = /^rgba?\(\s*([+-]?\d*\.?\d+)(%)?\s+([+-]?\d*\.?\d+)(%)?\s+([+-]?\d*\.?\d+)(%)?\s*(?:\/\s*([+-]?\d*\.?\d+)(%)?\s*)?\)$/i;
    y = { string: [[function(r2) {
      var t2 = i.exec(r2);
      return t2 ? (r2 = t2[1]).length <= 4 ? { r: parseInt(r2[0] + r2[0], 16), g: parseInt(r2[1] + r2[1], 16), b: parseInt(r2[2] + r2[2], 16), a: 4 === r2.length ? n(parseInt(r2[3] + r2[3], 16) / 255, 2) : 1 } : 6 === r2.length || 8 === r2.length ? { r: parseInt(r2.substr(0, 2), 16), g: parseInt(r2.substr(2, 2), 16), b: parseInt(r2.substr(4, 2), 16), a: 8 === r2.length ? n(parseInt(r2.substr(6, 2), 16) / 255, 2) : 1 } : null : null;
    }, "hex"], [function(r2) {
      var t2 = v.exec(r2) || m.exec(r2);
      return t2 ? t2[2] !== t2[4] || t2[4] !== t2[6] ? null : a({ r: Number(t2[1]) / (t2[2] ? 100 / 255 : 1), g: Number(t2[3]) / (t2[4] ? 100 / 255 : 1), b: Number(t2[5]) / (t2[6] ? 100 / 255 : 1), a: void 0 === t2[7] ? 1 : Number(t2[7]) / (t2[8] ? 100 : 1) }) : null;
    }, "rgb"], [function(t2) {
      var n2 = l.exec(t2) || p.exec(t2);
      if (!n2) return null;
      var e2, u2, a2 = g({ h: (e2 = n2[1], u2 = n2[2], void 0 === u2 && (u2 = "deg"), Number(e2) * (r[u2] || 1)), s: Number(n2[3]), l: Number(n2[4]), a: void 0 === n2[5] ? 1 : Number(n2[5]) / (n2[6] ? 100 : 1) });
      return f(a2);
    }, "hsl"]], object: [[function(r2) {
      var n2 = r2.r, e2 = r2.g, u2 = r2.b, o2 = r2.a, i2 = void 0 === o2 ? 1 : o2;
      return t(n2) && t(e2) && t(u2) ? a({ r: Number(n2), g: Number(e2), b: Number(u2), a: Number(i2) }) : null;
    }, "rgb"], [function(r2) {
      var n2 = r2.h, e2 = r2.s, u2 = r2.l, a2 = r2.a, o2 = void 0 === a2 ? 1 : a2;
      if (!t(n2) || !t(e2) || !t(u2)) return null;
      var i2 = g({ h: Number(n2), s: Number(e2), l: Number(u2), a: Number(o2) });
      return f(i2);
    }, "hsl"], [function(r2) {
      var n2 = r2.h, a2 = r2.s, o2 = r2.v, i2 = r2.a, s2 = void 0 === i2 ? 1 : i2;
      if (!t(n2) || !t(a2) || !t(o2)) return null;
      var h2 = (function(r3) {
        return { h: u(r3.h), s: e(r3.s, 0, 100), v: e(r3.v, 0, 100), a: e(r3.a) };
      })({ h: Number(n2), s: Number(a2), v: Number(o2), a: Number(s2) });
      return b(h2);
    }, "hsv"]] };
    N = function(r2, t2) {
      for (var n2 = 0; n2 < t2.length; n2++) {
        var e2 = t2[n2][0](r2);
        if (e2) return [e2, t2[n2][1]];
      }
      return [null, void 0];
    };
    x = function(r2) {
      return "string" == typeof r2 ? N(r2.trim(), y.string) : "object" == typeof r2 && null !== r2 ? N(r2, y.object) : [null, void 0];
    };
    M = function(r2, t2) {
      var n2 = c(r2);
      return { h: n2.h, s: e(n2.s + 100 * t2, 0, 100), l: n2.l, a: n2.a };
    };
    H = function(r2) {
      return (299 * r2.r + 587 * r2.g + 114 * r2.b) / 1e3 / 255;
    };
    $ = function(r2, t2) {
      var n2 = c(r2);
      return { h: n2.h, s: n2.s, l: e(n2.l + 100 * t2, 0, 100), a: n2.a };
    };
    j = (function() {
      function r2(r3) {
        this.parsed = x(r3)[0], this.rgba = this.parsed || { r: 0, g: 0, b: 0, a: 1 };
      }
      return r2.prototype.isValid = function() {
        return null !== this.parsed;
      }, r2.prototype.brightness = function() {
        return n(H(this.rgba), 2);
      }, r2.prototype.isDark = function() {
        return H(this.rgba) < 0.5;
      }, r2.prototype.isLight = function() {
        return H(this.rgba) >= 0.5;
      }, r2.prototype.toHex = function() {
        return r3 = o(this.rgba), t2 = r3.r, e2 = r3.g, u2 = r3.b, i2 = (a2 = r3.a) < 1 ? s(n(255 * a2)) : "", "#" + s(t2) + s(e2) + s(u2) + i2;
        var r3, t2, e2, u2, a2, i2;
      }, r2.prototype.toRgb = function() {
        return o(this.rgba);
      }, r2.prototype.toRgbString = function() {
        return r3 = o(this.rgba), t2 = r3.r, n2 = r3.g, e2 = r3.b, (u2 = r3.a) < 1 ? "rgba(" + t2 + ", " + n2 + ", " + e2 + ", " + u2 + ")" : "rgb(" + t2 + ", " + n2 + ", " + e2 + ")";
        var r3, t2, n2, e2, u2;
      }, r2.prototype.toHsl = function() {
        return d(c(this.rgba));
      }, r2.prototype.toHslString = function() {
        return r3 = d(c(this.rgba)), t2 = r3.h, n2 = r3.s, e2 = r3.l, (u2 = r3.a) < 1 ? "hsla(" + t2 + ", " + n2 + "%, " + e2 + "%, " + u2 + ")" : "hsl(" + t2 + ", " + n2 + "%, " + e2 + "%)";
        var r3, t2, n2, e2, u2;
      }, r2.prototype.toHsv = function() {
        return r3 = h(this.rgba), { h: n(r3.h), s: n(r3.s), v: n(r3.v), a: n(r3.a, 3) };
        var r3;
      }, r2.prototype.invert = function() {
        return w({ r: 255 - (r3 = this.rgba).r, g: 255 - r3.g, b: 255 - r3.b, a: r3.a });
        var r3;
      }, r2.prototype.saturate = function(r3) {
        return void 0 === r3 && (r3 = 0.1), w(M(this.rgba, r3));
      }, r2.prototype.desaturate = function(r3) {
        return void 0 === r3 && (r3 = 0.1), w(M(this.rgba, -r3));
      }, r2.prototype.grayscale = function() {
        return w(M(this.rgba, -1));
      }, r2.prototype.lighten = function(r3) {
        return void 0 === r3 && (r3 = 0.1), w($(this.rgba, r3));
      }, r2.prototype.darken = function(r3) {
        return void 0 === r3 && (r3 = 0.1), w($(this.rgba, -r3));
      }, r2.prototype.rotate = function(r3) {
        return void 0 === r3 && (r3 = 15), this.hue(this.hue() + r3);
      }, r2.prototype.alpha = function(r3) {
        return "number" == typeof r3 ? w({ r: (t2 = this.rgba).r, g: t2.g, b: t2.b, a: r3 }) : n(this.rgba.a, 3);
        var t2;
      }, r2.prototype.hue = function(r3) {
        var t2 = c(this.rgba);
        return "number" == typeof r3 ? w({ h: r3, s: t2.s, l: t2.l, a: t2.a }) : n(t2.h);
      }, r2.prototype.isEqual = function(r3) {
        return this.toHex() === w(r3).toHex();
      }, r2;
    })();
    w = function(r2) {
      return r2 instanceof j ? r2 : new j(r2);
    };
    S = [];
    k = function(r2) {
      r2.forEach(function(r3) {
        S.indexOf(r3) < 0 && (r3(j, y), S.push(r3));
      });
    };
  }
});

// client/node_modules/@pixi/colord/plugins/names.mjs
function names_default(e2, f2) {
  var a2 = { white: "#ffffff", bisque: "#ffe4c4", blue: "#0000ff", cadetblue: "#5f9ea0", chartreuse: "#7fff00", chocolate: "#d2691e", coral: "#ff7f50", antiquewhite: "#faebd7", aqua: "#00ffff", azure: "#f0ffff", whitesmoke: "#f5f5f5", papayawhip: "#ffefd5", plum: "#dda0dd", blanchedalmond: "#ffebcd", black: "#000000", gold: "#ffd700", goldenrod: "#daa520", gainsboro: "#dcdcdc", cornsilk: "#fff8dc", cornflowerblue: "#6495ed", burlywood: "#deb887", aquamarine: "#7fffd4", beige: "#f5f5dc", crimson: "#dc143c", cyan: "#00ffff", darkblue: "#00008b", darkcyan: "#008b8b", darkgoldenrod: "#b8860b", darkkhaki: "#bdb76b", darkgray: "#a9a9a9", darkgreen: "#006400", darkgrey: "#a9a9a9", peachpuff: "#ffdab9", darkmagenta: "#8b008b", darkred: "#8b0000", darkorchid: "#9932cc", darkorange: "#ff8c00", darkslateblue: "#483d8b", gray: "#808080", darkslategray: "#2f4f4f", darkslategrey: "#2f4f4f", deeppink: "#ff1493", deepskyblue: "#00bfff", wheat: "#f5deb3", firebrick: "#b22222", floralwhite: "#fffaf0", ghostwhite: "#f8f8ff", darkviolet: "#9400d3", magenta: "#ff00ff", green: "#008000", dodgerblue: "#1e90ff", grey: "#808080", honeydew: "#f0fff0", hotpink: "#ff69b4", blueviolet: "#8a2be2", forestgreen: "#228b22", lawngreen: "#7cfc00", indianred: "#cd5c5c", indigo: "#4b0082", fuchsia: "#ff00ff", brown: "#a52a2a", maroon: "#800000", mediumblue: "#0000cd", lightcoral: "#f08080", darkturquoise: "#00ced1", lightcyan: "#e0ffff", ivory: "#fffff0", lightyellow: "#ffffe0", lightsalmon: "#ffa07a", lightseagreen: "#20b2aa", linen: "#faf0e6", mediumaquamarine: "#66cdaa", lemonchiffon: "#fffacd", lime: "#00ff00", khaki: "#f0e68c", mediumseagreen: "#3cb371", limegreen: "#32cd32", mediumspringgreen: "#00fa9a", lightskyblue: "#87cefa", lightblue: "#add8e6", midnightblue: "#191970", lightpink: "#ffb6c1", mistyrose: "#ffe4e1", moccasin: "#ffe4b5", mintcream: "#f5fffa", lightslategray: "#778899", lightslategrey: "#778899", navajowhite: "#ffdead", navy: "#000080", mediumvioletred: "#c71585", powderblue: "#b0e0e6", palegoldenrod: "#eee8aa", oldlace: "#fdf5e6", paleturquoise: "#afeeee", mediumturquoise: "#48d1cc", mediumorchid: "#ba55d3", rebeccapurple: "#663399", lightsteelblue: "#b0c4de", mediumslateblue: "#7b68ee", thistle: "#d8bfd8", tan: "#d2b48c", orchid: "#da70d6", mediumpurple: "#9370db", purple: "#800080", pink: "#ffc0cb", skyblue: "#87ceeb", springgreen: "#00ff7f", palegreen: "#98fb98", red: "#ff0000", yellow: "#ffff00", slateblue: "#6a5acd", lavenderblush: "#fff0f5", peru: "#cd853f", palevioletred: "#db7093", violet: "#ee82ee", teal: "#008080", slategray: "#708090", slategrey: "#708090", aliceblue: "#f0f8ff", darkseagreen: "#8fbc8f", darkolivegreen: "#556b2f", greenyellow: "#adff2f", seagreen: "#2e8b57", seashell: "#fff5ee", tomato: "#ff6347", silver: "#c0c0c0", sienna: "#a0522d", lavender: "#e6e6fa", lightgreen: "#90ee90", orange: "#ffa500", orangered: "#ff4500", steelblue: "#4682b4", royalblue: "#4169e1", turquoise: "#40e0d0", yellowgreen: "#9acd32", salmon: "#fa8072", saddlebrown: "#8b4513", sandybrown: "#f4a460", rosybrown: "#bc8f8f", darksalmon: "#e9967a", lightgoldenrodyellow: "#fafad2", snow: "#fffafa", lightgrey: "#d3d3d3", lightgray: "#d3d3d3", dimgray: "#696969", dimgrey: "#696969", olivedrab: "#6b8e23", olive: "#808000" }, r2 = {};
  for (var d2 in a2) r2[a2[d2]] = d2;
  var l2 = {};
  e2.prototype.toName = function(f3) {
    if (!(this.rgba.a || this.rgba.r || this.rgba.g || this.rgba.b)) return "transparent";
    var d3, i2, n2 = r2[this.toHex()];
    if (n2) return n2;
    if (null == f3 ? void 0 : f3.closest) {
      var o2 = this.toRgb(), t2 = 1 / 0, b2 = "black";
      if (!l2.length) for (var c2 in a2) l2[c2] = new e2(a2[c2]).toRgb();
      for (var g2 in a2) {
        var u2 = (d3 = o2, i2 = l2[g2], Math.pow(d3.r - i2.r, 2) + Math.pow(d3.g - i2.g, 2) + Math.pow(d3.b - i2.b, 2));
        u2 < t2 && (t2 = u2, b2 = g2);
      }
      return b2;
    }
  };
  f2.string.push([function(f3) {
    var r3 = f3.toLowerCase(), d3 = "transparent" === r3 ? "#0000" : a2[r3];
    return d3 ? new e2(d3).toRgb() : null;
  }, "name"]);
}
var init_names = __esm({
  "client/node_modules/@pixi/colord/plugins/names.mjs"() {
  }
});

// client/node_modules/pixi.js/lib/color/Color.mjs
var _Color, Color;
var init_Color = __esm({
  "client/node_modules/pixi.js/lib/color/Color.mjs"() {
    init_colord();
    init_names();
    k([names_default]);
    _Color = class _Color2 {
      /**
       * @param {ColorSource} value - Optional value to use, if not provided, white is used.
       */
      constructor(value = 16777215) {
        this._value = null;
        this._components = new Float32Array(4);
        this._components.fill(1);
        this._int = 16777215;
        this.value = value;
      }
      /**
       * Get the red component of the color, normalized between 0 and 1.
       * @example
       * ```ts
       * const color = new Color('red');
       * console.log(color.red); // 1
       *
       * const green = new Color('#00ff00');
       * console.log(green.red); // 0
       * ```
       */
      get red() {
        return this._components[0];
      }
      /**
       * Get the green component of the color, normalized between 0 and 1.
       * @example
       * ```ts
       * const color = new Color('lime');
       * console.log(color.green); // 1
       *
       * const red = new Color('#ff0000');
       * console.log(red.green); // 0
       * ```
       */
      get green() {
        return this._components[1];
      }
      /**
       * Get the blue component of the color, normalized between 0 and 1.
       * @example
       * ```ts
       * const color = new Color('blue');
       * console.log(color.blue); // 1
       *
       * const yellow = new Color('#ffff00');
       * console.log(yellow.blue); // 0
       * ```
       */
      get blue() {
        return this._components[2];
      }
      /**
       * Get the alpha component of the color, normalized between 0 and 1.
       * @example
       * ```ts
       * const color = new Color('red');
       * console.log(color.alpha); // 1 (fully opaque)
       *
       * const transparent = new Color('rgba(255, 0, 0, 0.5)');
       * console.log(transparent.alpha); // 0.5 (semi-transparent)
       * ```
       */
      get alpha() {
        return this._components[3];
      }
      /**
       * Sets the color value and returns the instance for chaining.
       *
       * This is a chainable version of setting the `value` property.
       * @param value - The color to set. Accepts various formats:
       * - Hex strings/numbers (e.g., '#ff0000', 0xff0000)
       * - RGB/RGBA values (arrays, objects)
       * - CSS color names
       * - HSL/HSLA values
       * - HSV/HSVA values
       * @returns The Color instance for chaining
       * @example
       * ```ts
       * // Basic usage
       * const color = new Color();
       * color.setValue('#ff0000')
       *     .setAlpha(0.5)
       *     .premultiply(0.8);
       *
       * // Different formats
       * color.setValue(0xff0000);          // Hex number
       * color.setValue('#ff0000');         // Hex string
       * color.setValue([1, 0, 0]);         // RGB array
       * color.setValue([1, 0, 0, 0.5]);    // RGBA array
       * color.setValue({ r: 1, g: 0, b: 0 }); // RGB object
       *
       * // Copy from another color
       * const red = new Color('red');
       * color.setValue(red);
       * ```
       * @throws {Error} If the color value is invalid or null
       * @see {@link Color.value} For the underlying value property
       */
      setValue(value) {
        this.value = value;
        return this;
      }
      /**
       * The current color source. This property allows getting and setting the color value
       * while preserving the original format where possible.
       * @remarks
       * When setting:
       * - Setting to a `Color` instance copies its source and components
       * - Setting to other valid sources normalizes and stores the value
       * - Setting to `null` throws an Error
       * - The color remains unchanged if normalization fails
       *
       * When getting:
       * - Returns `null` if color was modified by {@link Color.multiply} or {@link Color.premultiply}
       * - Otherwise returns the original color source
       * @example
       * ```ts
       * // Setting different color formats
       * const color = new Color();
       *
       * color.value = 0xff0000;         // Hex number
       * color.value = '#ff0000';        // Hex string
       * color.value = [1, 0, 0];        // RGB array
       * color.value = [1, 0, 0, 0.5];   // RGBA array
       * color.value = { r: 1, g: 0, b: 0 }; // RGB object
       *
       * // Copying from another color
       * const red = new Color('red');
       * color.value = red;  // Copies red's components
       *
       * // Getting the value
       * console.log(color.value);  // Returns original format
       *
       * // After modifications
       * color.multiply([0.5, 0.5, 0.5]);
       * console.log(color.value);  // Returns null
       * ```
       * @throws {Error} When attempting to set `null`
       */
      set value(value) {
        if (value instanceof _Color2) {
          this._value = this._cloneSource(value._value);
          this._int = value._int;
          this._components.set(value._components);
        } else if (value === null) {
          throw new Error("Cannot set Color#value to null");
        } else if (this._value === null || !this._isSourceEqual(this._value, value)) {
          this._value = this._cloneSource(value);
          this._normalize(this._value);
        }
      }
      get value() {
        return this._value;
      }
      /**
       * Copy a color source internally.
       * @param value - Color source
       */
      _cloneSource(value) {
        if (typeof value === "string" || typeof value === "number" || value instanceof Number || value === null) {
          return value;
        } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
          return value.slice(0);
        } else if (typeof value === "object" && value !== null) {
          return { ...value };
        }
        return value;
      }
      /**
       * Equality check for color sources.
       * @param value1 - First color source
       * @param value2 - Second color source
       * @returns `true` if the color sources are equal, `false` otherwise.
       */
      _isSourceEqual(value1, value2) {
        const type1 = typeof value1;
        const type2 = typeof value2;
        if (type1 !== type2) {
          return false;
        } else if (type1 === "number" || type1 === "string" || value1 instanceof Number) {
          return value1 === value2;
        } else if (Array.isArray(value1) && Array.isArray(value2) || ArrayBuffer.isView(value1) && ArrayBuffer.isView(value2)) {
          if (value1.length !== value2.length) {
            return false;
          }
          return value1.every((v2, i2) => v2 === value2[i2]);
        } else if (value1 !== null && value2 !== null) {
          const keys1 = Object.keys(value1);
          const keys2 = Object.keys(value2);
          if (keys1.length !== keys2.length) {
            return false;
          }
          return keys1.every((key) => value1[key] === value2[key]);
        }
        return value1 === value2;
      }
      /**
       * Convert to a RGBA color object with normalized components (0-1).
       * @example
       * ```ts
       * import { Color } from 'pixi.js';
       *
       * // Convert colors to RGBA objects
       * new Color('white').toRgba();     // returns { r: 1, g: 1, b: 1, a: 1 }
       * new Color('#ff0000').toRgba();   // returns { r: 1, g: 0, b: 0, a: 1 }
       *
       * // With transparency
       * new Color('rgba(255,0,0,0.5)').toRgba(); // returns { r: 1, g: 0, b: 0, a: 0.5 }
       * ```
       * @returns An RGBA object with normalized components
       */
      toRgba() {
        const [r2, g2, b2, a2] = this._components;
        return { r: r2, g: g2, b: b2, a: a2 };
      }
      /**
       * Convert to a RGB color object with normalized components (0-1).
       *
       * Alpha component is omitted in the output.
       * @example
       * ```ts
       * import { Color } from 'pixi.js';
       *
       * // Convert colors to RGB objects
       * new Color('white').toRgb();     // returns { r: 1, g: 1, b: 1 }
       * new Color('#ff0000').toRgb();   // returns { r: 1, g: 0, b: 0 }
       *
       * // Alpha is ignored
       * new Color('rgba(255,0,0,0.5)').toRgb(); // returns { r: 1, g: 0, b: 0 }
       * ```
       * @returns An RGB object with normalized components
       */
      toRgb() {
        const [r2, g2, b2] = this._components;
        return { r: r2, g: g2, b: b2 };
      }
      /**
       * Convert to a CSS-style rgba string representation.
       *
       * RGB components are scaled to 0-255 range, alpha remains 0-1.
       * @example
       * ```ts
       * import { Color } from 'pixi.js';
       *
       * // Convert colors to RGBA strings
       * new Color('white').toRgbaString();     // returns "rgba(255,255,255,1)"
       * new Color('#ff0000').toRgbaString();   // returns "rgba(255,0,0,1)"
       *
       * // With transparency
       * new Color([1, 0, 0, 0.5]).toRgbaString(); // returns "rgba(255,0,0,0.5)"
       * ```
       * @returns A CSS-compatible rgba string
       */
      toRgbaString() {
        const [r2, g2, b2] = this.toUint8RgbArray();
        return `rgba(${r2},${g2},${b2},${this.alpha})`;
      }
      /**
       * Convert to an [R, G, B] array of clamped uint8 values (0 to 255).
       * @param {number[]|Uint8Array|Uint8ClampedArray} [out] - Optional output array. If not provided,
       * a cached array will be used and returned.
       * @returns Array containing RGB components as integers between 0-255
       * @example
       * ```ts
       * // Basic usage
       * new Color('white').toUint8RgbArray(); // returns [255, 255, 255]
       * new Color('#ff0000').toUint8RgbArray(); // returns [255, 0, 0]
       *
       * // Using custom output array
       * const rgb = new Uint8Array(3);
       * new Color('blue').toUint8RgbArray(rgb); // rgb is now [0, 0, 255]
       *
       * // Using different array types
       * new Color('red').toUint8RgbArray(new Uint8ClampedArray(3)); // [255, 0, 0]
       * new Color('red').toUint8RgbArray([]); // [255, 0, 0]
       * ```
       * @remarks
       * - Output values are always clamped between 0-255
       * - Alpha component is not included in output
       * - Reuses internal cache array if no output array provided
       */
      toUint8RgbArray(out) {
        const [r2, g2, b2] = this._components;
        if (!this._arrayRgb) {
          this._arrayRgb = [];
        }
        out || (out = this._arrayRgb);
        out[0] = Math.round(r2 * 255);
        out[1] = Math.round(g2 * 255);
        out[2] = Math.round(b2 * 255);
        return out;
      }
      /**
       * Convert to an [R, G, B, A] array of normalized floats (numbers from 0.0 to 1.0).
       * @param {number[]|Float32Array} [out] - Optional output array. If not provided,
       * a cached array will be used and returned.
       * @returns Array containing RGBA components as floats between 0-1
       * @example
       * ```ts
       * // Basic usage
       * new Color('white').toArray();  // returns [1, 1, 1, 1]
       * new Color('red').toArray();    // returns [1, 0, 0, 1]
       *
       * // With alpha
       * new Color('rgba(255,0,0,0.5)').toArray(); // returns [1, 0, 0, 0.5]
       *
       * // Using custom output array
       * const rgba = new Float32Array(4);
       * new Color('blue').toArray(rgba); // rgba is now [0, 0, 1, 1]
       * ```
       * @remarks
       * - Output values are normalized between 0-1
       * - Includes alpha component as the fourth value
       * - Reuses internal cache array if no output array provided
       */
      toArray(out) {
        if (!this._arrayRgba) {
          this._arrayRgba = [];
        }
        out || (out = this._arrayRgba);
        const [r2, g2, b2, a2] = this._components;
        out[0] = r2;
        out[1] = g2;
        out[2] = b2;
        out[3] = a2;
        return out;
      }
      /**
       * Convert to an [R, G, B] array of normalized floats (numbers from 0.0 to 1.0).
       * @param {number[]|Float32Array} [out] - Optional output array. If not provided,
       * a cached array will be used and returned.
       * @returns Array containing RGB components as floats between 0-1
       * @example
       * ```ts
       * // Basic usage
       * new Color('white').toRgbArray(); // returns [1, 1, 1]
       * new Color('red').toRgbArray();   // returns [1, 0, 0]
       *
       * // Using custom output array
       * const rgb = new Float32Array(3);
       * new Color('blue').toRgbArray(rgb); // rgb is now [0, 0, 1]
       * ```
       * @remarks
       * - Output values are normalized between 0-1
       * - Alpha component is omitted from output
       * - Reuses internal cache array if no output array provided
       */
      toRgbArray(out) {
        if (!this._arrayRgb) {
          this._arrayRgb = [];
        }
        out || (out = this._arrayRgb);
        const [r2, g2, b2] = this._components;
        out[0] = r2;
        out[1] = g2;
        out[2] = b2;
        return out;
      }
      /**
       * Convert to a hexadecimal number.
       * @returns The color as a 24-bit RGB integer
       * @example
       * ```ts
       * // Basic usage
       * new Color('white').toNumber(); // returns 0xffffff
       * new Color('red').toNumber();   // returns 0xff0000
       *
       * // Store as hex
       * const color = new Color('blue');
       * const hex = color.toNumber(); // 0x0000ff
       * ```
       */
      toNumber() {
        return this._int;
      }
      /**
       * Convert to a BGR number.
       *
       * Useful for platforms that expect colors in BGR format.
       * @returns The color as a 24-bit BGR integer
       * @example
       * ```ts
       * // Convert RGB to BGR
       * new Color(0xffcc99).toBgrNumber(); // returns 0x99ccff
       *
       * // Common use case: platform-specific color format
       * const color = new Color('orange');
       * const bgrColor = color.toBgrNumber(); // Color with swapped R/B channels
       * ```
       * @remarks
       * This swaps the red and blue channels compared to the normal RGB format:
       * - RGB 0xRRGGBB becomes BGR 0xBBGGRR
       */
      toBgrNumber() {
        const [r2, g2, b2] = this.toUint8RgbArray();
        return (b2 << 16) + (g2 << 8) + r2;
      }
      /**
       * Convert to a hexadecimal number in little endian format (e.g., BBGGRR).
       *
       * Useful for platforms that expect colors in little endian byte order.
       * @example
       * ```ts
       * import { Color } from 'pixi.js';
       *
       * // Convert RGB color to little endian format
       * new Color(0xffcc99).toLittleEndianNumber(); // returns 0x99ccff
       *
       * // Common use cases:
       * const color = new Color('orange');
       * const leColor = color.toLittleEndianNumber(); // Swaps byte order for LE systems
       *
       * // Multiple conversions
       * const colors = {
       *     normal: 0xffcc99,
       *     littleEndian: new Color(0xffcc99).toLittleEndianNumber(), // 0x99ccff
       *     backToNormal: new Color(0x99ccff).toLittleEndianNumber()  // 0xffcc99
       * };
       * ```
       * @remarks
       * - Swaps R and B channels in the color value
       * - RGB 0xRRGGBB becomes 0xBBGGRR
       * - Useful for systems that use little endian byte order
       * - Can be used to convert back and forth between formats
       * @returns The color as a number in little endian format (BBGGRR)
       * @see {@link Color.toBgrNumber} For BGR format without byte swapping
       */
      toLittleEndianNumber() {
        const value = this._int;
        return (value >> 16) + (value & 65280) + ((value & 255) << 16);
      }
      /**
       * Multiply with another color.
       *
       * This action is destructive and modifies the original color.
       * @param {ColorSource} value - The color to multiply by. Accepts any valid color format:
       * - Hex strings/numbers (e.g., '#ff0000', 0xff0000)
       * - RGB/RGBA arrays ([1, 0, 0], [1, 0, 0, 1])
       * - Color objects ({ r: 1, g: 0, b: 0 })
       * - CSS color names ('red', 'blue')
       * @returns this - The Color instance for chaining
       * @example
       * ```ts
       * // Basic multiplication
       * const color = new Color('#ff0000');
       * color.multiply(0x808080); // 50% darker red
       *
       * // With transparency
       * color.multiply([1, 1, 1, 0.5]); // 50% transparent
       *
       * // Chain operations
       * color
       *     .multiply('#808080')
       *     .multiply({ r: 1, g: 1, b: 1, a: 0.5 });
       * ```
       * @remarks
       * - Multiplies each RGB component and alpha separately
       * - Values are clamped between 0-1
       * - Original color format is lost (value becomes null)
       * - Operation cannot be undone
       */
      multiply(value) {
        const [r2, g2, b2, a2] = _Color2._temp.setValue(value)._components;
        this._components[0] *= r2;
        this._components[1] *= g2;
        this._components[2] *= b2;
        this._components[3] *= a2;
        this._refreshInt();
        this._value = null;
        return this;
      }
      /**
       * Converts color to a premultiplied alpha format.
       *
       * This action is destructive and modifies the original color.
       * @param alpha - The alpha value to multiply by (0-1)
       * @param {boolean} [applyToRGB=true] - Whether to premultiply RGB channels
       * @returns {Color} The Color instance for chaining
       * @example
       * ```ts
       * // Basic premultiplication
       * const color = new Color('red');
       * color.premultiply(0.5); // 50% transparent red with premultiplied RGB
       *
       * // Alpha only (RGB unchanged)
       * color.premultiply(0.5, false); // 50% transparent, original RGB
       *
       * // Chain with other operations
       * color
       *     .multiply(0x808080)
       *     .premultiply(0.5)
       *     .toNumber();
       * ```
       * @remarks
       * - RGB channels are multiplied by alpha when applyToRGB is true
       * - Alpha is always set to the provided value
       * - Values are clamped between 0-1
       * - Original color format is lost (value becomes null)
       * - Operation cannot be undone
       */
      premultiply(alpha, applyToRGB = true) {
        if (applyToRGB) {
          this._components[0] *= alpha;
          this._components[1] *= alpha;
          this._components[2] *= alpha;
        }
        this._components[3] = alpha;
        this._refreshInt();
        this._value = null;
        return this;
      }
      /**
       * Returns the color as a 32-bit premultiplied alpha integer.
       *
       * Format: 0xAARRGGBB
       * @param {number} alpha - The alpha value to multiply by (0-1)
       * @param {boolean} [applyToRGB=true] - Whether to premultiply RGB channels
       * @returns {number} The premultiplied color as a 32-bit integer
       * @example
       * ```ts
       * // Convert to premultiplied format
       * const color = new Color('red');
       *
       * // Full opacity (0xFFRRGGBB)
       * color.toPremultiplied(1.0); // 0xFFFF0000
       *
       * // 50% transparency with premultiplied RGB
       * color.toPremultiplied(0.5); // 0x7F7F0000
       *
       * // 50% transparency without RGB premultiplication
       * color.toPremultiplied(0.5, false); // 0x7FFF0000
       * ```
       * @remarks
       * - Returns full opacity (0xFF000000) when alpha is 1.0
       * - Returns 0 when alpha is 0.0 and applyToRGB is true
       * - RGB values are rounded during premultiplication
       */
      toPremultiplied(alpha, applyToRGB = true) {
        if (alpha === 1) {
          return (255 << 24) + this._int;
        }
        if (alpha === 0) {
          return applyToRGB ? 0 : this._int;
        }
        let r2 = this._int >> 16 & 255;
        let g2 = this._int >> 8 & 255;
        let b2 = this._int & 255;
        if (applyToRGB) {
          r2 = r2 * alpha + 0.5 | 0;
          g2 = g2 * alpha + 0.5 | 0;
          b2 = b2 * alpha + 0.5 | 0;
        }
        return (alpha * 255 << 24) + (r2 << 16) + (g2 << 8) + b2;
      }
      /**
       * Convert to a hexadecimal string (6 characters).
       * @returns A CSS-compatible hex color string (e.g., "#ff0000")
       * @example
       * ```ts
       * import { Color } from 'pixi.js';
       *
       * // Basic colors
       * new Color('red').toHex();    // returns "#ff0000"
       * new Color('white').toHex();  // returns "#ffffff"
       * new Color('black').toHex();  // returns "#000000"
       *
       * // From different formats
       * new Color(0xff0000).toHex(); // returns "#ff0000"
       * new Color([1, 0, 0]).toHex(); // returns "#ff0000"
       * new Color({ r: 1, g: 0, b: 0 }).toHex(); // returns "#ff0000"
       * ```
       * @remarks
       * - Always returns a 6-character hex string
       * - Includes leading "#" character
       * - Alpha channel is ignored
       * - Values are rounded to nearest hex value
       */
      toHex() {
        const hexString = this._int.toString(16);
        return `#${"000000".substring(0, 6 - hexString.length) + hexString}`;
      }
      /**
       * Convert to a hexadecimal string with alpha (8 characters).
       * @returns A CSS-compatible hex color string with alpha (e.g., "#ff0000ff")
       * @example
       * ```ts
       * import { Color } from 'pixi.js';
       *
       * // Fully opaque colors
       * new Color('red').toHexa();   // returns "#ff0000ff"
       * new Color('white').toHexa(); // returns "#ffffffff"
       *
       * // With transparency
       * new Color('rgba(255, 0, 0, 0.5)').toHexa(); // returns "#ff00007f"
       * new Color([1, 0, 0, 0]).toHexa(); // returns "#ff000000"
       * ```
       * @remarks
       * - Returns an 8-character hex string
       * - Includes leading "#" character
       * - Alpha is encoded in last two characters
       * - Values are rounded to nearest hex value
       */
      toHexa() {
        const alphaValue = Math.round(this._components[3] * 255);
        const alphaString = alphaValue.toString(16);
        return this.toHex() + "00".substring(0, 2 - alphaString.length) + alphaString;
      }
      /**
       * Set alpha (transparency) value while preserving color components.
       *
       * Provides a chainable interface for setting alpha.
       * @param alpha - Alpha value between 0 (fully transparent) and 1 (fully opaque)
       * @returns The Color instance for chaining
       * @example
       * ```ts
       * // Basic alpha setting
       * const color = new Color('red');
       * color.setAlpha(0.5);  // 50% transparent red
       *
       * // Chain with other operations
       * color
       *     .setValue('#ff0000')
       *     .setAlpha(0.8)    // 80% opaque
       *     .premultiply(0.5); // Further modify alpha
       *
       * // Reset to fully opaque
       * color.setAlpha(1);
       * ```
       * @remarks
       * - Alpha value is clamped between 0-1
       * - Can be chained with other color operations
       */
      setAlpha(alpha) {
        this._components[3] = this._clamp(alpha);
        this._value = null;
        return this;
      }
      /**
       * Normalize the input value into rgba
       * @param value - Input value
       */
      _normalize(value) {
        let r2;
        let g2;
        let b2;
        let a2;
        if ((typeof value === "number" || value instanceof Number) && value >= 0 && value <= 16777215) {
          const int = value;
          r2 = (int >> 16 & 255) / 255;
          g2 = (int >> 8 & 255) / 255;
          b2 = (int & 255) / 255;
          a2 = 1;
        } else if ((Array.isArray(value) || value instanceof Float32Array) && value.length >= 3 && value.length <= 4) {
          value = this._clamp(value);
          [r2, g2, b2, a2 = 1] = value;
        } else if ((value instanceof Uint8Array || value instanceof Uint8ClampedArray) && value.length >= 3 && value.length <= 4) {
          value = this._clamp(value, 0, 255);
          [r2, g2, b2, a2 = 255] = value;
          r2 /= 255;
          g2 /= 255;
          b2 /= 255;
          a2 /= 255;
        } else if (typeof value === "string" || typeof value === "object") {
          if (typeof value === "string") {
            const match = _Color2.HEX_PATTERN.exec(value);
            if (match) {
              value = `#${match[2]}`;
            }
          }
          const color = w(value);
          if (color.isValid()) {
            ({ r: r2, g: g2, b: b2, a: a2 } = color.rgba);
            r2 /= 255;
            g2 /= 255;
            b2 /= 255;
          }
        }
        if (r2 !== void 0) {
          this._components[0] = r2;
          this._components[1] = g2;
          this._components[2] = b2;
          this._components[3] = a2;
          this._refreshInt();
        } else {
          throw new Error(`Unable to convert color ${value}`);
        }
      }
      /** Refresh the internal color rgb number */
      _refreshInt() {
        this._clamp(this._components);
        const [r2, g2, b2] = this._components;
        this._int = (r2 * 255 << 16) + (g2 * 255 << 8) + (b2 * 255 | 0);
      }
      /**
       * Clamps values to a range. Will override original values
       * @param value - Value(s) to clamp
       * @param min - Minimum value
       * @param max - Maximum value
       */
      _clamp(value, min = 0, max = 1) {
        if (typeof value === "number") {
          return Math.min(Math.max(value, min), max);
        }
        value.forEach((v2, i2) => {
          value[i2] = Math.min(Math.max(v2, min), max);
        });
        return value;
      }
      /**
       * Check if a value can be interpreted as a valid color format.
       * Supports all color formats that can be used with the Color class.
       * @param value - Value to check
       * @returns True if the value can be used as a color
       * @example
       * ```ts
       * import { Color } from 'pixi.js';
       *
       * // CSS colors and hex values
       * Color.isColorLike('red');          // true
       * Color.isColorLike('#ff0000');      // true
       * Color.isColorLike(0xff0000);       // true
       *
       * // Arrays (RGB/RGBA)
       * Color.isColorLike([1, 0, 0]);      // true
       * Color.isColorLike([1, 0, 0, 0.5]); // true
       *
       * // TypedArrays
       * Color.isColorLike(new Float32Array([1, 0, 0]));          // true
       * Color.isColorLike(new Uint8Array([255, 0, 0]));          // true
       * Color.isColorLike(new Uint8ClampedArray([255, 0, 0]));   // true
       *
       * // Object formats
       * Color.isColorLike({ r: 1, g: 0, b: 0 });            // true (RGB)
       * Color.isColorLike({ r: 1, g: 0, b: 0, a: 0.5 });    // true (RGBA)
       * Color.isColorLike({ h: 0, s: 100, l: 50 });         // true (HSL)
       * Color.isColorLike({ h: 0, s: 100, l: 50, a: 0.5 }); // true (HSLA)
       * Color.isColorLike({ h: 0, s: 100, v: 100 });        // true (HSV)
       * Color.isColorLike({ h: 0, s: 100, v: 100, a: 0.5 });// true (HSVA)
       *
       * // Color instances
       * Color.isColorLike(new Color('red')); // true
       *
       * // Invalid values
       * Color.isColorLike(null);           // false
       * Color.isColorLike(undefined);      // false
       * Color.isColorLike({});             // false
       * Color.isColorLike([]);             // false
       * Color.isColorLike('not-a-color');  // false
       * ```
       * @remarks
       * Checks for the following formats:
       * - Numbers (0x000000 to 0xffffff)
       * - CSS color strings
       * - RGB/RGBA arrays and objects
       * - HSL/HSLA objects
       * - HSV/HSVA objects
       * - TypedArrays (Float32Array, Uint8Array, Uint8ClampedArray)
       * - Color instances
       * @see {@link ColorSource} For supported color format types
       * @see {@link Color.setValue} For setting color values
       * @category utility
       */
      static isColorLike(value) {
        return typeof value === "number" || typeof value === "string" || value instanceof Number || value instanceof _Color2 || Array.isArray(value) || value instanceof Uint8Array || value instanceof Uint8ClampedArray || value instanceof Float32Array || value.r !== void 0 && value.g !== void 0 && value.b !== void 0 || value.r !== void 0 && value.g !== void 0 && value.b !== void 0 && value.a !== void 0 || value.h !== void 0 && value.s !== void 0 && value.l !== void 0 || value.h !== void 0 && value.s !== void 0 && value.l !== void 0 && value.a !== void 0 || value.h !== void 0 && value.s !== void 0 && value.v !== void 0 || value.h !== void 0 && value.s !== void 0 && value.v !== void 0 && value.a !== void 0;
      }
    };
    _Color.shared = new _Color();
    _Color._temp = new _Color();
    _Color.HEX_PATTERN = /^(#|0x)?(([a-f0-9]{3}){1,2}([a-f0-9]{2})?)$/i;
    Color = _Color;
  }
});

// client/node_modules/pixi.js/lib/culling/cullingMixin.mjs
var cullingMixin;
var init_cullingMixin = __esm({
  "client/node_modules/pixi.js/lib/culling/cullingMixin.mjs"() {
    "use strict";
    cullingMixin = {
      cullArea: null,
      cullable: false,
      cullableChildren: true
    };
  }
});

// client/node_modules/pixi.js/lib/maths/misc/const.mjs
var PI_2, RAD_TO_DEG, DEG_TO_RAD;
var init_const = __esm({
  "client/node_modules/pixi.js/lib/maths/misc/const.mjs"() {
    "use strict";
    PI_2 = Math.PI * 2;
    RAD_TO_DEG = 180 / Math.PI;
    DEG_TO_RAD = Math.PI / 180;
  }
});

// client/node_modules/pixi.js/lib/maths/point/Point.mjs
var Point, tempPoint;
var init_Point = __esm({
  "client/node_modules/pixi.js/lib/maths/point/Point.mjs"() {
    "use strict";
    Point = class _Point {
      /**
       * Creates a new `Point`
       * @param {number} [x=0] - position of the point on the x axis
       * @param {number} [y=0] - position of the point on the y axis
       */
      constructor(x2 = 0, y2 = 0) {
        this.x = 0;
        this.y = 0;
        this.x = x2;
        this.y = y2;
      }
      /**
       * Creates a clone of this point, which is a new instance with the same `x` and `y` values.
       * @example
       * ```ts
       * // Basic point cloning
       * const original = new Point(100, 200);
       * const copy = original.clone();
       *
       * // Clone and modify
       * const modified = original.clone();
       * modified.set(300, 400);
       *
       * // Verify independence
       * console.log(original); // Point(100, 200)
       * console.log(modified); // Point(300, 400)
       * ```
       * @remarks
       * - Creates new Point instance
       * - Deep copies x and y values
       * - Independent from original
       * - Useful for preserving values
       * @returns A clone of this point
       * @see {@link Point.copyFrom} For copying into existing point
       * @see {@link Point.copyTo} For copying to existing point
       */
      clone() {
        return new _Point(this.x, this.y);
      }
      /**
       * Copies x and y from the given point into this point.
       * @example
       * ```ts
       * // Basic copying
       * const source = new Point(100, 200);
       * const target = new Point();
       * target.copyFrom(source);
       *
       * // Copy and chain operations
       * const point = new Point()
       *     .copyFrom(source)
       *     .set(x + 50, y + 50);
       *
       * // Copy from any PointData
       * const data = { x: 10, y: 20 };
       * point.copyFrom(data);
       * ```
       * @param p - The point to copy from
       * @returns The point instance itself
       * @see {@link Point.copyTo} For copying to another point
       * @see {@link Point.clone} For creating new point copy
       */
      copyFrom(p2) {
        this.set(p2.x, p2.y);
        return this;
      }
      /**
       * Copies this point's x and y into the given point.
       * @example
       * ```ts
       * // Basic copying
       * const source = new Point(100, 200);
       * const target = new Point();
       * source.copyTo(target);
       * ```
       * @param p - The point to copy to. Can be any type that is or extends `PointLike`
       * @returns The point (`p`) with values updated
       * @see {@link Point.copyFrom} For copying from another point
       * @see {@link Point.clone} For creating new point copy
       */
      copyTo(p2) {
        p2.set(this.x, this.y);
        return p2;
      }
      /**
       * Checks if another point is equal to this point.
       *
       * Compares x and y values using strict equality.
       * @example
       * ```ts
       * // Basic equality check
       * const p1 = new Point(100, 200);
       * const p2 = new Point(100, 200);
       * console.log(p1.equals(p2)); // true
       *
       * // Compare with PointData
       * const data = { x: 100, y: 200 };
       * console.log(p1.equals(data)); // true
       *
       * // Check different points
       * const p3 = new Point(200, 300);
       * console.log(p1.equals(p3)); // false
       * ```
       * @param p - The point to check
       * @returns `true` if both `x` and `y` are equal
       * @see {@link Point.copyFrom} For making points equal
       * @see {@link PointData} For point data interface
       */
      equals(p2) {
        return p2.x === this.x && p2.y === this.y;
      }
      /**
       * Sets the point to a new x and y position.
       *
       * If y is omitted, both x and y will be set to x.
       * @example
       * ```ts
       * // Basic position setting
       * const point = new Point();
       * point.set(100, 200);
       *
       * // Set both x and y to same value
       * point.set(50); // x=50, y=50
       *
       * // Chain with other operations
       * point
       *     .set(10, 20)
       *     .copyTo(otherPoint);
       * ```
       * @param x - Position on the x axis
       * @param y - Position on the y axis, defaults to x
       * @returns The point instance itself
       * @see {@link Point.copyFrom} For copying from another point
       * @see {@link Point.equals} For comparing positions
       */
      set(x2 = 0, y2 = x2) {
        this.x = x2;
        this.y = y2;
        return this;
      }
      toString() {
        return `[pixi.js/math:Point x=${this.x} y=${this.y}]`;
      }
      /**
       * A static Point object with `x` and `y` values of `0`.
       *
       * This shared instance is reset to zero values when accessed.
       *
       * > [!IMPORTANT] This point is shared and temporary. Do not store references to it.
       * @example
       * ```ts
       * // Use for temporary calculations
       * const tempPoint = Point.shared;
       * tempPoint.set(100, 200);
       * matrix.apply(tempPoint);
       *
       * // Will be reset to (0,0) on next access
       * const fresh = Point.shared; // x=0, y=0
       * ```
       * @readonly
       * @returns A fresh zeroed point for temporary use
       * @see {@link Point.constructor} For creating new points
       * @see {@link PointData} For basic point interface
       */
      static get shared() {
        tempPoint.x = 0;
        tempPoint.y = 0;
        return tempPoint;
      }
    };
    tempPoint = new Point();
  }
});

// client/node_modules/pixi.js/lib/maths/matrix/Matrix.mjs
var Matrix, tempMatrix, identityMatrix;
var init_Matrix = __esm({
  "client/node_modules/pixi.js/lib/maths/matrix/Matrix.mjs"() {
    init_const();
    init_Point();
    Matrix = class _Matrix {
      /**
       * @param a - x scale
       * @param b - y skew
       * @param c - x skew
       * @param d - y scale
       * @param tx - x translation
       * @param ty - y translation
       */
      constructor(a2 = 1, b2 = 0, c2 = 0, d2 = 1, tx = 0, ty = 0) {
        this.array = null;
        this.a = a2;
        this.b = b2;
        this.c = c2;
        this.d = d2;
        this.tx = tx;
        this.ty = ty;
      }
      /**
       * Creates a Matrix object based on the given array.
       * Populates matrix components from a flat array in column-major order.
       *
       * > [!NOTE] Array mapping order:
       * > ```
       * > array[0] = a  (x scale)
       * > array[1] = b  (y skew)
       * > array[2] = tx (x translation)
       * > array[3] = c  (x skew)
       * > array[4] = d  (y scale)
       * > array[5] = ty (y translation)
       * > ```
       * @example
       * ```ts
       * // Create matrix from array
       * const matrix = new Matrix();
       * matrix.fromArray([
       *     2, 0,  100,  // a, b, tx
       *     0, 2,  100   // c, d, ty
       * ]);
       *
       * // Create matrix from typed array
       * const float32Array = new Float32Array([
       *     1, 0, 0,     // Scale x1, no skew
       *     0, 1, 0      // No skew, scale x1
       * ]);
       * matrix.fromArray(float32Array);
       * ```
       * @param array - The array to populate the matrix from
       * @see {@link Matrix.toArray} For converting matrix to array
       * @see {@link Matrix.set} For setting values directly
       */
      fromArray(array2) {
        this.a = array2[0];
        this.b = array2[1];
        this.c = array2[3];
        this.d = array2[4];
        this.tx = array2[2];
        this.ty = array2[5];
      }
      /**
       * Sets the matrix properties directly.
       * All matrix components can be set in one call.
       * @example
       * ```ts
       * // Set to identity matrix
       * matrix.set(1, 0, 0, 1, 0, 0);
       *
       * // Set to scale matrix
       * matrix.set(2, 0, 0, 2, 0, 0); // Scale 2x
       *
       * // Set to translation matrix
       * matrix.set(1, 0, 0, 1, 100, 50); // Move 100,50
       * ```
       * @param a - Scale on x axis
       * @param b - Shear on y axis
       * @param c - Shear on x axis
       * @param d - Scale on y axis
       * @param tx - Translation on x axis
       * @param ty - Translation on y axis
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.identity} For resetting to identity
       * @see {@link Matrix.fromArray} For setting from array
       */
      set(a2, b2, c2, d2, tx, ty) {
        this.a = a2;
        this.b = b2;
        this.c = c2;
        this.d = d2;
        this.tx = tx;
        this.ty = ty;
        return this;
      }
      /**
       * Creates an array from the current Matrix object.
       *
       * > [!NOTE] The array format is:
       * > ```
       * > Non-transposed:
       * > [a, c, tx,
       * > b, d, ty,
       * > 0, 0, 1]
       * >
       * > Transposed:
       * > [a, b, 0,
       * > c, d, 0,
       * > tx,ty,1]
       * > ```
       * @example
       * ```ts
       * // Basic array conversion
       * const matrix = new Matrix(2, 0, 0, 2, 100, 100);
       * const array = matrix.toArray();
       *
       * // Using existing array
       * const float32Array = new Float32Array(9);
       * matrix.toArray(false, float32Array);
       *
       * // Get transposed array
       * const transposed = matrix.toArray(true);
       * ```
       * @param transpose - Whether to transpose the matrix
       * @param out - Optional Float32Array to store the result
       * @returns The array containing the matrix values
       * @see {@link Matrix.fromArray} For creating matrix from array
       * @see {@link Matrix.array} For cached array storage
       */
      toArray(transpose, out) {
        if (!this.array) {
          this.array = new Float32Array(9);
        }
        const array2 = out || this.array;
        if (transpose) {
          array2[0] = this.a;
          array2[1] = this.b;
          array2[2] = 0;
          array2[3] = this.c;
          array2[4] = this.d;
          array2[5] = 0;
          array2[6] = this.tx;
          array2[7] = this.ty;
          array2[8] = 1;
        } else {
          array2[0] = this.a;
          array2[1] = this.c;
          array2[2] = this.tx;
          array2[3] = this.b;
          array2[4] = this.d;
          array2[5] = this.ty;
          array2[6] = 0;
          array2[7] = 0;
          array2[8] = 1;
        }
        return array2;
      }
      /**
       * Get a new position with the current transformation applied.
       *
       * Can be used to go from a child's coordinate space to the world coordinate space. (e.g. rendering)
       * @example
       * ```ts
       * // Basic point transformation
       * const matrix = new Matrix().translate(100, 50).rotate(Math.PI / 4);
       * const point = new Point(10, 20);
       * const transformed = matrix.apply(point);
       *
       * // Reuse existing point
       * const output = new Point();
       * matrix.apply(point, output);
       * ```
       * @param pos - The origin point to transform
       * @param newPos - Optional point to store the result
       * @returns The transformed point
       * @see {@link Matrix.applyInverse} For inverse transformation
       * @see {@link Point} For point operations
       */
      apply(pos, newPos) {
        newPos = newPos || new Point();
        const x2 = pos.x;
        const y2 = pos.y;
        newPos.x = this.a * x2 + this.c * y2 + this.tx;
        newPos.y = this.b * x2 + this.d * y2 + this.ty;
        return newPos;
      }
      /**
       * Get a new position with the inverse of the current transformation applied.
       *
       * Can be used to go from the world coordinate space to a child's coordinate space. (e.g. input)
       * @example
       * ```ts
       * // Basic inverse transformation
       * const matrix = new Matrix().translate(100, 50).rotate(Math.PI / 4);
       * const worldPoint = new Point(150, 100);
       * const localPoint = matrix.applyInverse(worldPoint);
       *
       * // Reuse existing point
       * const output = new Point();
       * matrix.applyInverse(worldPoint, output);
       *
       * // Convert mouse position to local space
       * const mousePoint = new Point(mouseX, mouseY);
       * const localMouse = matrix.applyInverse(mousePoint);
       * ```
       * @param pos - The origin point to inverse-transform
       * @param newPos - Optional point to store the result
       * @returns The inverse-transformed point
       * @see {@link Matrix.apply} For forward transformation
       * @see {@link Matrix.invert} For getting inverse matrix
       */
      applyInverse(pos, newPos) {
        newPos = newPos || new Point();
        const a2 = this.a;
        const b2 = this.b;
        const c2 = this.c;
        const d2 = this.d;
        const tx = this.tx;
        const ty = this.ty;
        const id = 1 / (a2 * d2 + c2 * -b2);
        const x2 = pos.x;
        const y2 = pos.y;
        newPos.x = d2 * id * x2 + -c2 * id * y2 + (ty * c2 - tx * d2) * id;
        newPos.y = a2 * id * y2 + -b2 * id * x2 + (-ty * a2 + tx * b2) * id;
        return newPos;
      }
      /**
       * Translates the matrix on the x and y axes.
       * Adds to the position values while preserving scale, rotation and skew.
       * @example
       * ```ts
       * // Basic translation
       * const matrix = new Matrix();
       * matrix.translate(100, 50); // Move right 100, down 50
       *
       * // Chain with other transformations
       * matrix
       *     .scale(2, 2)
       *     .translate(100, 0)
       *     .rotate(Math.PI / 4);
       * ```
       * @param x - How much to translate on the x axis
       * @param y - How much to translate on the y axis
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.set} For setting position directly
       * @see {@link Matrix.setTransform} For complete transform setup
       */
      translate(x2, y2) {
        this.tx += x2;
        this.ty += y2;
        return this;
      }
      /**
       * Applies a scale transformation to the matrix.
       * Multiplies the scale values with existing matrix components.
       * @example
       * ```ts
       * // Basic scaling
       * const matrix = new Matrix();
       * matrix.scale(2, 3); // Scale 2x horizontally, 3x vertically
       *
       * // Chain with other transformations
       * matrix
       *     .translate(100, 100)
       *     .scale(2, 2)     // Scales after translation
       *     .rotate(Math.PI / 4);
       * ```
       * @param x - The amount to scale horizontally
       * @param y - The amount to scale vertically
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.setTransform} For setting scale directly
       * @see {@link Matrix.append} For combining transformations
       */
      scale(x2, y2) {
        this.a *= x2;
        this.d *= y2;
        this.c *= x2;
        this.b *= y2;
        this.tx *= x2;
        this.ty *= y2;
        return this;
      }
      /**
       * Applies a rotation transformation to the matrix.
       *
       * Rotates around the origin (0,0) by the given angle in radians.
       * @example
       * ```ts
       * // Basic rotation
       * const matrix = new Matrix();
       * matrix.rotate(Math.PI / 4); // Rotate 45 degrees
       *
       * // Chain with other transformations
       * matrix
       *     .translate(100, 100) // Move to rotation center
       *     .rotate(Math.PI)     // Rotate 180 degrees
       *     .scale(2, 2);        // Scale after rotation
       *
       * // Common angles
       * matrix.rotate(Math.PI / 2);  // 90 degrees
       * matrix.rotate(Math.PI);      // 180 degrees
       * matrix.rotate(Math.PI * 2);  // 360 degrees
       * ```
       * @remarks
       * - Rotates around origin point (0,0)
       * - Affects position if translation was set
       * - Uses counter-clockwise rotation
       * - Order of operations matters when chaining
       * @param angle - The angle in radians
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.setTransform} For setting rotation directly
       * @see {@link Matrix.append} For combining transformations
       */
      rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const a1 = this.a;
        const c1 = this.c;
        const tx1 = this.tx;
        this.a = a1 * cos - this.b * sin;
        this.b = a1 * sin + this.b * cos;
        this.c = c1 * cos - this.d * sin;
        this.d = c1 * sin + this.d * cos;
        this.tx = tx1 * cos - this.ty * sin;
        this.ty = tx1 * sin + this.ty * cos;
        return this;
      }
      /**
       * Appends the given Matrix to this Matrix.
       * Combines two matrices by multiplying them together: this = this * matrix
       * @example
       * ```ts
       * // Basic matrix combination
       * const matrix = new Matrix();
       * const other = new Matrix().translate(100, 0).rotate(Math.PI / 4);
       * matrix.append(other);
       * ```
       * @remarks
       * - Order matters: A.append(B) !== B.append(A)
       * - Modifies current matrix
       * - Preserves transformation order
       * - Commonly used for combining transforms
       * @param matrix - The matrix to append
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.prepend} For prepending transformations
       * @see {@link Matrix.appendFrom} For appending two external matrices
       */
      append(matrix) {
        const a1 = this.a;
        const b1 = this.b;
        const c1 = this.c;
        const d1 = this.d;
        this.a = matrix.a * a1 + matrix.b * c1;
        this.b = matrix.a * b1 + matrix.b * d1;
        this.c = matrix.c * a1 + matrix.d * c1;
        this.d = matrix.c * b1 + matrix.d * d1;
        this.tx = matrix.tx * a1 + matrix.ty * c1 + this.tx;
        this.ty = matrix.tx * b1 + matrix.ty * d1 + this.ty;
        return this;
      }
      /**
       * Appends two matrices and sets the result to this matrix.
       * Performs matrix multiplication: this = A * B
       * @example
       * ```ts
       * // Basic matrix multiplication
       * const result = new Matrix();
       * const matrixA = new Matrix().scale(2, 2);
       * const matrixB = new Matrix().rotate(Math.PI / 4);
       * result.appendFrom(matrixA, matrixB);
       * ```
       * @remarks
       * - Order matters: A * B !== B * A
       * - Creates a new transformation from two others
       * - More efficient than append() for multiple operations
       * - Does not modify input matrices
       * @param a - The first matrix to multiply
       * @param b - The second matrix to multiply
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.append} For single matrix combination
       * @see {@link Matrix.prepend} For reverse order multiplication
       */
      appendFrom(a2, b2) {
        const a1 = a2.a;
        const b1 = a2.b;
        const c1 = a2.c;
        const d1 = a2.d;
        const tx = a2.tx;
        const ty = a2.ty;
        const a22 = b2.a;
        const b22 = b2.b;
        const c2 = b2.c;
        const d2 = b2.d;
        this.a = a1 * a22 + b1 * c2;
        this.b = a1 * b22 + b1 * d2;
        this.c = c1 * a22 + d1 * c2;
        this.d = c1 * b22 + d1 * d2;
        this.tx = tx * a22 + ty * c2 + b2.tx;
        this.ty = tx * b22 + ty * d2 + b2.ty;
        return this;
      }
      /**
       * Sets the matrix based on all the available properties.
       * Combines position, scale, rotation, skew and pivot in a single operation.
       * @example
       * ```ts
       * // Basic transform setup
       * const matrix = new Matrix();
       * matrix.setTransform(
       *     100, 100,    // position
       *     0, 0,        // pivot
       *     2, 2,        // scale
       *     Math.PI / 4, // rotation (45 degrees)
       *     0, 0         // skew
       * );
       * ```
       * @remarks
       * - Updates all matrix components at once
       * - More efficient than separate transform calls
       * - Uses radians for rotation and skew
       * - Pivot affects rotation center
       * @param x - Position on the x axis
       * @param y - Position on the y axis
       * @param pivotX - Pivot on the x axis
       * @param pivotY - Pivot on the y axis
       * @param scaleX - Scale on the x axis
       * @param scaleY - Scale on the y axis
       * @param rotation - Rotation in radians
       * @param skewX - Skew on the x axis
       * @param skewY - Skew on the y axis
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.decompose} For extracting transform properties
       * @see {@link TransformableObject} For transform data structure
       */
      setTransform(x2, y2, pivotX, pivotY, scaleX, scaleY, rotation, skewX, skewY) {
        this.a = Math.cos(rotation + skewY) * scaleX;
        this.b = Math.sin(rotation + skewY) * scaleX;
        this.c = -Math.sin(rotation - skewX) * scaleY;
        this.d = Math.cos(rotation - skewX) * scaleY;
        this.tx = x2 - (pivotX * this.a + pivotY * this.c);
        this.ty = y2 - (pivotX * this.b + pivotY * this.d);
        return this;
      }
      /**
       * Prepends the given Matrix to this Matrix.
       * Combines two matrices by multiplying them together: this = matrix * this
       * @example
       * ```ts
       * // Basic matrix prepend
       * const matrix = new Matrix().scale(2, 2);
       * const other = new Matrix().translate(100, 0);
       * matrix.prepend(other); // Translation happens before scaling
       * ```
       * @remarks
       * - Order matters: A.prepend(B) !== B.prepend(A)
       * - Modifies current matrix
       * - Reverses transformation order compared to append()
       * @param matrix - The matrix to prepend
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.append} For appending transformations
       * @see {@link Matrix.appendFrom} For combining external matrices
       */
      prepend(matrix) {
        const tx1 = this.tx;
        if (matrix.a !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.d !== 1) {
          const a1 = this.a;
          const c1 = this.c;
          this.a = a1 * matrix.a + this.b * matrix.c;
          this.b = a1 * matrix.b + this.b * matrix.d;
          this.c = c1 * matrix.a + this.d * matrix.c;
          this.d = c1 * matrix.b + this.d * matrix.d;
        }
        this.tx = tx1 * matrix.a + this.ty * matrix.c + matrix.tx;
        this.ty = tx1 * matrix.b + this.ty * matrix.d + matrix.ty;
        return this;
      }
      /**
       * Decomposes the matrix into its individual transform components.
       * Extracts position, scale, rotation and skew values from the matrix.
       * @example
       * ```ts
       * // Basic decomposition
       * const matrix = new Matrix()
       *     .translate(100, 100)
       *     .rotate(Math.PI / 4)
       *     .scale(2, 2);
       *
       * const transform = {
       *     position: new Point(),
       *     scale: new Point(),
       *     pivot: new Point(),
       *     skew: new Point(),
       *     rotation: 0
       * };
       *
       * matrix.decompose(transform);
       * console.log(transform.position); // Point(100, 100)
       * console.log(transform.rotation); // ~0.785 (PI/4)
       * console.log(transform.scale); // Point(2, 2)
       * ```
       * @remarks
       * - Handles combined transformations
       * - Accounts for pivot points
       * - Chooses between rotation/skew based on transform type
       * - Uses radians for rotation and skew
       * @param transform - The transform object to store the decomposed values
       * @returns The transform with the newly applied properties
       * @see {@link Matrix.setTransform} For composing from components
       * @see {@link TransformableObject} For transform structure
       */
      decompose(transform) {
        const a2 = this.a;
        const b2 = this.b;
        const c2 = this.c;
        const d2 = this.d;
        const pivot = transform.pivot;
        const skewX = -Math.atan2(-c2, d2);
        const skewY = Math.atan2(b2, a2);
        const delta = Math.abs(skewX + skewY);
        let scaleX = Math.sqrt(a2 * a2 + b2 * b2);
        if (delta < 1e-5 || Math.abs(PI_2 - delta) < 1e-5) {
          transform.rotation = skewY;
          transform.skew.x = transform.skew.y = 0;
        } else if (Math.abs(Math.PI - delta) < 1e-5) {
          transform.rotation = skewY - Math.PI;
          transform.skew.x = transform.skew.y = 0;
          scaleX = -scaleX;
        } else {
          transform.rotation = 0;
          transform.skew.x = skewX;
          transform.skew.y = skewY;
        }
        transform.scale.x = scaleX;
        transform.scale.y = Math.sqrt(c2 * c2 + d2 * d2);
        transform.position.x = this.tx + (pivot.x * a2 + pivot.y * c2);
        transform.position.y = this.ty + (pivot.x * b2 + pivot.y * d2);
        return transform;
      }
      /**
       * Inverts this matrix.
       * Creates the matrix that when multiplied with this matrix results in an identity matrix.
       * @example
       * ```ts
       * // Basic matrix inversion
       * const matrix = new Matrix()
       *     .translate(100, 50)
       *     .scale(2, 2);
       *
       * matrix.invert(); // Now transforms in opposite direction
       *
       * // Verify inversion
       * const point = new Point(50, 50);
       * const transformed = matrix.apply(point);
       * const original = matrix.invert().apply(transformed);
       * // original ≈ point
       * ```
       * @remarks
       * - Modifies the current matrix
       * - Useful for reversing transformations
       * - Cannot invert matrices with zero determinant
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.identity} For resetting to identity
       * @see {@link Matrix.applyInverse} For inverse transformations
       */
      invert() {
        const a1 = this.a;
        const b1 = this.b;
        const c1 = this.c;
        const d1 = this.d;
        const tx1 = this.tx;
        const n2 = a1 * d1 - b1 * c1;
        this.a = d1 / n2;
        this.b = -b1 / n2;
        this.c = -c1 / n2;
        this.d = a1 / n2;
        this.tx = (c1 * this.ty - d1 * tx1) / n2;
        this.ty = -(a1 * this.ty - b1 * tx1) / n2;
        return this;
      }
      /**
       * Checks if this matrix is an identity matrix.
       *
       * An identity matrix has no transformations applied (default state).
       * @example
       * ```ts
       * // Check if matrix is identity
       * const matrix = new Matrix();
       * console.log(matrix.isIdentity()); // true
       *
       * // Check after transformations
       * matrix.translate(100, 0);
       * console.log(matrix.isIdentity()); // false
       *
       * // Reset and verify
       * matrix.identity();
       * console.log(matrix.isIdentity()); // true
       * ```
       * @remarks
       * - Verifies a = 1, d = 1 (no scale)
       * - Verifies b = 0, c = 0 (no skew)
       * - Verifies tx = 0, ty = 0 (no translation)
       * @returns True if matrix has no transformations
       * @see {@link Matrix.identity} For resetting to identity
       * @see {@link Matrix.IDENTITY} For constant identity matrix
       */
      isIdentity() {
        return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.tx === 0 && this.ty === 0;
      }
      /**
       * Resets this Matrix to an identity (default) matrix.
       * Sets all components to their default values: scale=1, no skew, no translation.
       * @example
       * ```ts
       * // Reset transformed matrix
       * const matrix = new Matrix()
       *     .scale(2, 2)
       *     .rotate(Math.PI / 4);
       * matrix.identity(); // Back to default state
       *
       * // Chain after reset
       * matrix
       *     .identity()
       *     .translate(100, 100)
       *     .scale(2, 2);
       *
       * // Compare with identity constant
       * const isDefault = matrix.equals(Matrix.IDENTITY);
       * ```
       * @remarks
       * - Sets a=1, d=1 (default scale)
       * - Sets b=0, c=0 (no skew)
       * - Sets tx=0, ty=0 (no translation)
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.IDENTITY} For constant identity matrix
       * @see {@link Matrix.isIdentity} For checking identity state
       */
      identity() {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.tx = 0;
        this.ty = 0;
        return this;
      }
      /**
       * Creates a new Matrix object with the same values as this one.
       * @returns A copy of this matrix. Good for chaining method calls.
       */
      clone() {
        const matrix = new _Matrix();
        matrix.a = this.a;
        matrix.b = this.b;
        matrix.c = this.c;
        matrix.d = this.d;
        matrix.tx = this.tx;
        matrix.ty = this.ty;
        return matrix;
      }
      /**
       * Creates a new Matrix object with the same values as this one.
       * @param matrix
       * @example
       * ```ts
       * // Basic matrix cloning
       * const matrix = new Matrix()
       *     .translate(100, 100)
       *     .rotate(Math.PI / 4);
       * const copy = matrix.clone();
       *
       * // Clone and modify
       * const modified = matrix.clone()
       *     .scale(2, 2);
       *
       * // Compare matrices
       * console.log(matrix.equals(copy));     // true
       * console.log(matrix.equals(modified)); // false
       * ```
       * @returns A copy of this matrix. Good for chaining method calls.
       * @see {@link Matrix.copyTo} For copying to existing matrix
       * @see {@link Matrix.copyFrom} For copying from another matrix
       */
      copyTo(matrix) {
        matrix.a = this.a;
        matrix.b = this.b;
        matrix.c = this.c;
        matrix.d = this.d;
        matrix.tx = this.tx;
        matrix.ty = this.ty;
        return matrix;
      }
      /**
       * Changes the values of the matrix to be the same as the ones in given matrix.
       * @example
       * ```ts
       * // Basic matrix copying
       * const source = new Matrix()
       *     .translate(100, 100)
       *     .rotate(Math.PI / 4);
       * const target = new Matrix();
       * target.copyFrom(source);
       * ```
       * @param matrix - The matrix to copy from
       * @returns This matrix. Good for chaining method calls.
       * @see {@link Matrix.clone} For creating new matrix copy
       * @see {@link Matrix.copyTo} For copying to another matrix
       */
      copyFrom(matrix) {
        this.a = matrix.a;
        this.b = matrix.b;
        this.c = matrix.c;
        this.d = matrix.d;
        this.tx = matrix.tx;
        this.ty = matrix.ty;
        return this;
      }
      /**
       * Checks if this matrix equals another matrix.
       * Compares all components for exact equality.
       * @example
       * ```ts
       * // Basic equality check
       * const m1 = new Matrix();
       * const m2 = new Matrix();
       * console.log(m1.equals(m2)); // true
       *
       * // Compare transformed matrices
       * const transform = new Matrix()
       *     .translate(100, 100)
       * const clone = new Matrix()
       *     .scale(2, 2);
       * console.log(transform.equals(clone)); // false
       * ```
       * @param matrix - The matrix to compare to
       * @returns True if matrices are identical
       * @see {@link Matrix.copyFrom} For copying matrix values
       * @see {@link Matrix.isIdentity} For identity comparison
       */
      equals(matrix) {
        return matrix.a === this.a && matrix.b === this.b && matrix.c === this.c && matrix.d === this.d && matrix.tx === this.tx && matrix.ty === this.ty;
      }
      toString() {
        return `[pixi.js:Matrix a=${this.a} b=${this.b} c=${this.c} d=${this.d} tx=${this.tx} ty=${this.ty}]`;
      }
      /**
       * A default (identity) matrix with no transformations applied.
       *
       * > [!IMPORTANT] This is a shared read-only object. Create a new Matrix if you need to modify it.
       * @example
       * ```ts
       * // Get identity matrix reference
       * const identity = Matrix.IDENTITY;
       * console.log(identity.isIdentity()); // true
       *
       * // Compare with identity
       * const matrix = new Matrix();
       * console.log(matrix.equals(Matrix.IDENTITY)); // true
       *
       * // Create new matrix instead of modifying IDENTITY
       * const transform = new Matrix()
       *     .copyFrom(Matrix.IDENTITY)
       *     .translate(100, 100);
       * ```
       * @readonly
       * @returns A read-only identity matrix
       * @see {@link Matrix.shared} For temporary calculations
       * @see {@link Matrix.identity} For resetting matrices
       */
      static get IDENTITY() {
        return identityMatrix.identity();
      }
      /**
       * A static Matrix that can be used to avoid creating new objects.
       * Will always ensure the matrix is reset to identity when requested.
       *
       * > [!IMPORTANT] This matrix is shared and temporary. Do not store references to it.
       * @example
       * ```ts
       * // Use for temporary calculations
       * const tempMatrix = Matrix.shared;
       * tempMatrix.translate(100, 100).rotate(Math.PI / 4);
       * const point = tempMatrix.apply({ x: 10, y: 20 });
       *
       * // Will be reset to identity on next access
       * const fresh = Matrix.shared; // Back to identity
       * ```
       * @remarks
       * - Always returns identity matrix
       * - Safe to modify temporarily
       * - Not safe to store references
       * - Useful for one-off calculations
       * @readonly
       * @returns A fresh identity matrix for temporary use
       * @see {@link Matrix.IDENTITY} For immutable identity matrix
       * @see {@link Matrix.identity} For resetting matrices
       */
      static get shared() {
        return tempMatrix.identity();
      }
    };
    tempMatrix = new Matrix();
    identityMatrix = new Matrix();
  }
});

// client/node_modules/pixi.js/lib/maths/point/ObservablePoint.mjs
var ObservablePoint;
var init_ObservablePoint = __esm({
  "client/node_modules/pixi.js/lib/maths/point/ObservablePoint.mjs"() {
    "use strict";
    ObservablePoint = class _ObservablePoint {
      /**
       * Creates a new `ObservablePoint`
       * @param observer - Observer to pass to listen for change events.
       * @param {number} [x=0] - position of the point on the x axis
       * @param {number} [y=0] - position of the point on the y axis
       */
      constructor(observer, x2, y2) {
        this._x = x2 || 0;
        this._y = y2 || 0;
        this._observer = observer;
      }
      /**
       * Creates a clone of this point.
       * @example
       * ```ts
       * // Basic cloning
       * const point = new ObservablePoint(observer, 100, 200);
       * const copy = point.clone();
       *
       * // Clone with new observer
       * const newObserver = {
       *     _onUpdate: (p) => console.log(`Clone updated: (${p.x}, ${p.y})`)
       * };
       * const watched = point.clone(newObserver);
       *
       * // Verify independence
       * watched.set(300, 400); // Only triggers new observer
       * ```
       * @param observer - Optional observer to pass to the new observable point
       * @returns A copy of this observable point
       * @see {@link ObservablePoint.copyFrom} For copying into existing point
       * @see {@link Observer} For observer interface details
       */
      clone(observer) {
        return new _ObservablePoint(observer ?? this._observer, this._x, this._y);
      }
      /**
       * Sets the point to a new x and y position.
       *
       * If y is omitted, both x and y will be set to x.
       * @example
       * ```ts
       * // Basic position setting
       * const point = new ObservablePoint(observer);
       * point.set(100, 200);
       *
       * // Set both x and y to same value
       * point.set(50); // x=50, y=50
       * ```
       * @param x - Position on the x axis
       * @param y - Position on the y axis, defaults to x
       * @returns The point instance itself
       * @see {@link ObservablePoint.copyFrom} For copying from another point
       * @see {@link ObservablePoint.equals} For comparing positions
       */
      set(x2 = 0, y2 = x2) {
        if (this._x !== x2 || this._y !== y2) {
          this._x = x2;
          this._y = y2;
          this._observer._onUpdate(this);
        }
        return this;
      }
      /**
       * Copies x and y from the given point into this point.
       * @example
       * ```ts
       * // Basic copying
       * const source = new ObservablePoint(observer, 100, 200);
       * const target = new ObservablePoint();
       * target.copyFrom(source);
       *
       * // Copy and chain operations
       * const point = new ObservablePoint()
       *     .copyFrom(source)
       *     .set(x + 50, y + 50);
       *
       * // Copy from any PointData
       * const data = { x: 10, y: 20 };
       * point.copyFrom(data);
       * ```
       * @param p - The point to copy from
       * @returns The point instance itself
       * @see {@link ObservablePoint.copyTo} For copying to another point
       * @see {@link ObservablePoint.clone} For creating new point copy
       */
      copyFrom(p2) {
        if (this._x !== p2.x || this._y !== p2.y) {
          this._x = p2.x;
          this._y = p2.y;
          this._observer._onUpdate(this);
        }
        return this;
      }
      /**
       * Copies this point's x and y into the given point.
       * @example
       * ```ts
       * // Basic copying
       * const source = new ObservablePoint(100, 200);
       * const target = new ObservablePoint();
       * source.copyTo(target);
       * ```
       * @param p - The point to copy to. Can be any type that is or extends `PointLike`
       * @returns The point (`p`) with values updated
       * @see {@link ObservablePoint.copyFrom} For copying from another point
       * @see {@link ObservablePoint.clone} For creating new point copy
       */
      copyTo(p2) {
        p2.set(this._x, this._y);
        return p2;
      }
      /**
       * Checks if another point is equal to this point.
       *
       * Compares x and y values using strict equality.
       * @example
       * ```ts
       * // Basic equality check
       * const p1 = new ObservablePoint(100, 200);
       * const p2 = new ObservablePoint(100, 200);
       * console.log(p1.equals(p2)); // true
       *
       * // Compare with PointData
       * const data = { x: 100, y: 200 };
       * console.log(p1.equals(data)); // true
       *
       * // Check different points
       * const p3 = new ObservablePoint(200, 300);
       * console.log(p1.equals(p3)); // false
       * ```
       * @param p - The point to check
       * @returns `true` if both `x` and `y` are equal
       * @see {@link ObservablePoint.copyFrom} For making points equal
       * @see {@link PointData} For point data interface
       */
      equals(p2) {
        return p2.x === this._x && p2.y === this._y;
      }
      toString() {
        return `[pixi.js/math:ObservablePoint x=${this._x} y=${this._y} scope=${this._observer}]`;
      }
      /**
       * Position of the observable point on the x axis.
       * Triggers observer callback when value changes.
       * @example
       * ```ts
       * // Basic x position
       * const point = new ObservablePoint(observer);
       * point.x = 100; // Triggers observer
       *
       * // Use in calculations
       * const width = rightPoint.x - leftPoint.x;
       * ```
       * @default 0
       */
      get x() {
        return this._x;
      }
      set x(value) {
        if (this._x !== value) {
          this._x = value;
          this._observer._onUpdate(this);
        }
      }
      /**
       * Position of the observable point on the y axis.
       * Triggers observer callback when value changes.
       * @example
       * ```ts
       * // Basic y position
       * const point = new ObservablePoint(observer);
       * point.y = 200; // Triggers observer
       *
       * // Use in calculations
       * const height = bottomPoint.y - topPoint.y;
       * ```
       * @default 0
       */
      get y() {
        return this._y;
      }
      set y(value) {
        if (this._y !== value) {
          this._y = value;
          this._observer._onUpdate(this);
        }
      }
    };
  }
});

// client/node_modules/pixi.js/lib/utils/data/uid.mjs
function uid(name = "default") {
  if (uidCache[name] === void 0) {
    uidCache[name] = -1;
  }
  return ++uidCache[name];
}
var uidCache;
var init_uid = __esm({
  "client/node_modules/pixi.js/lib/utils/data/uid.mjs"() {
    "use strict";
    uidCache = {
      default: -1
    };
  }
});

// client/node_modules/pixi.js/lib/utils/logging/deprecation.mjs
var warnings, v8_0_0, v8_21_0, deprecationState, deprecation;
var init_deprecation = __esm({
  "client/node_modules/pixi.js/lib/utils/logging/deprecation.mjs"() {
    "use strict";
    warnings = /* @__PURE__ */ new Set();
    v8_0_0 = "8.0.0";
    v8_21_0 = "8.21.0";
    deprecationState = {
      quiet: false,
      noColor: false
    };
    deprecation = ((version, message, ignoreDepth = 3) => {
      if (deprecationState.quiet || warnings.has(message)) return;
      let stack = new Error().stack;
      const deprecationMessage = `${message}
Deprecated since v${version}`;
      const useGroup = typeof console.groupCollapsed === "function" && !deprecationState.noColor;
      if (typeof stack === "undefined") {
        console.warn("PixiJS Deprecation Warning: ", deprecationMessage);
      } else {
        stack = stack.split("\n").splice(ignoreDepth).join("\n");
        if (useGroup) {
          console.groupCollapsed(
            "%cPixiJS Deprecation Warning: %c%s",
            "color:#614108;background:#fffbe6",
            "font-weight:normal;color:#614108;background:#fffbe6",
            deprecationMessage
          );
          console.warn(stack);
          console.groupEnd();
        } else {
          console.warn("PixiJS Deprecation Warning: ", deprecationMessage);
          console.warn(stack);
        }
      }
      warnings.add(message);
    });
    Object.defineProperties(deprecation, {
      quiet: {
        get: () => deprecationState.quiet,
        set: (value) => {
          deprecationState.quiet = value;
        },
        enumerable: true,
        configurable: false
      },
      noColor: {
        get: () => deprecationState.noColor,
        set: (value) => {
          deprecationState.noColor = value;
        },
        enumerable: true,
        configurable: false
      }
    });
  }
});

// client/node_modules/pixi.js/lib/utils/logging/warn.mjs
function warn(...args) {
  if (warnCount === maxWarnings) return;
  warnCount++;
  if (warnCount === maxWarnings) {
    console.warn("PixiJS Warning: too many warnings, no more warnings will be reported to the console by PixiJS.");
  } else {
    console.warn("PixiJS Warning: ", ...args);
  }
}
var warnCount, maxWarnings;
var init_warn = __esm({
  "client/node_modules/pixi.js/lib/utils/logging/warn.mjs"() {
    "use strict";
    warnCount = 0;
    maxWarnings = 500;
  }
});

// client/node_modules/pixi.js/lib/utils/pool/GlobalResourceRegistry.mjs
var GlobalResourceRegistry;
var init_GlobalResourceRegistry = __esm({
  "client/node_modules/pixi.js/lib/utils/pool/GlobalResourceRegistry.mjs"() {
    "use strict";
    GlobalResourceRegistry = {
      /**
       * Set of registered pools and cleanable objects.
       * @private
       */
      _registeredResources: /* @__PURE__ */ new Set(),
      /**
       * Registers a pool or cleanable object for cleanup.
       * @param {Cleanable} pool - The pool or object to register.
       */
      register(pool) {
        this._registeredResources.add(pool);
      },
      /**
       * Unregisters a pool or cleanable object from cleanup.
       * @param {Cleanable} pool - The pool or object to unregister.
       */
      unregister(pool) {
        this._registeredResources.delete(pool);
      },
      /** Clears all registered pools and cleanable objects. This will call clear() on each registered item. */
      release() {
        this._registeredResources.forEach((pool) => pool.clear());
      },
      /**
       * Gets the number of registered pools and cleanable objects.
       * @returns {number} The count of registered items.
       */
      get registeredCount() {
        return this._registeredResources.size;
      },
      /**
       * Checks if a specific pool or cleanable object is registered.
       * @param {Cleanable} pool - The pool or object to check.
       * @returns {boolean} True if the item is registered, false otherwise.
       */
      isRegistered(pool) {
        return this._registeredResources.has(pool);
      },
      /**
       * Removes all registrations without clearing the pools.
       * Useful if you want to reset the collector without affecting the pools.
       */
      reset() {
        this._registeredResources.clear();
      }
    };
  }
});

// client/node_modules/pixi.js/lib/utils/pool/Pool.mjs
var Pool;
var init_Pool = __esm({
  "client/node_modules/pixi.js/lib/utils/pool/Pool.mjs"() {
    "use strict";
    Pool = class {
      /**
       * Constructs a new Pool.
       * @param ClassType - The constructor of the items in the pool.
       * @param {number} [initialSize] - The initial size of the pool.
       */
      constructor(ClassType, initialSize) {
        this._pool = [];
        this._count = 0;
        this._index = 0;
        this._classType = ClassType;
        if (initialSize) {
          this.prepopulate(initialSize);
        }
      }
      /**
       * Prepopulates the pool with a given number of items.
       * @param total - The number of items to add to the pool.
       */
      prepopulate(total) {
        for (let i2 = 0; i2 < total; i2++) {
          this._pool[this._index++] = new this._classType();
        }
        this._count += total;
      }
      /**
       * Gets an item from the pool. Calls the item's `init` method if it exists.
       * If there are no items left in the pool, a new one will be created.
       * @param {I} [data] - Optional data to pass to the item's constructor.
       * @returns {T} The item from the pool.
       */
      get(data) {
        let item;
        if (this._index > 0) {
          item = this._pool[--this._index];
        } else {
          item = new this._classType();
          this._count++;
        }
        item.init?.(data);
        return item;
      }
      /**
       * Returns an item to the pool. Calls the item's `reset` method if it exists.
       * @param {T} item - The item to return to the pool.
       */
      return(item) {
        item.reset?.();
        this._pool[this._index++] = item;
      }
      /**
       * Gets the number of items in the pool.
       * @readonly
       */
      get totalSize() {
        return this._count;
      }
      /**
       * Gets the number of items in the pool that are free to use without needing to create more.
       * @readonly
       */
      get totalFree() {
        return this._index;
      }
      /**
       * Gets the number of items in the pool that are currently in use.
       * @readonly
       */
      get totalUsed() {
        return this._count - this._index;
      }
      /** clears the pool */
      clear() {
        if (this._pool.length > 0 && this._pool[0].destroy) {
          for (let i2 = 0; i2 < this._index; i2++) {
            this._pool[i2].destroy();
          }
        }
        this._pool.length = 0;
        this._count = 0;
        this._index = 0;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/utils/pool/PoolGroup.mjs
var PoolGroupClass, BigPool;
var init_PoolGroup = __esm({
  "client/node_modules/pixi.js/lib/utils/pool/PoolGroup.mjs"() {
    init_GlobalResourceRegistry();
    init_Pool();
    PoolGroupClass = class {
      constructor() {
        this._poolsByClass = /* @__PURE__ */ new Map();
      }
      /**
       * Prepopulates a specific pool with a given number of items.
       * @template T The type of items in the pool. Must extend PoolItem.
       * @param {PoolItemConstructor<T>} Class - The constructor of the items in the pool.
       * @param {number} total - The number of items to add to the pool.
       */
      prepopulate(Class, total) {
        const classPool = this.getPool(Class);
        classPool.prepopulate(total);
      }
      /**
       * Gets an item from a specific pool.
       * @template T The type of items in the pool. Must extend PoolItem.
       * @param {PoolItemConstructor<T>} Class - The constructor of the items in the pool.
       * @param {unknown} [data] - Optional data to pass to the item's constructor.
       * @returns {T} The item from the pool.
       */
      get(Class, data) {
        const pool = this.getPool(Class);
        return pool.get(data);
      }
      /**
       * Returns an item to its respective pool.
       * @param {PoolItem} item - The item to return to the pool.
       */
      return(item) {
        const pool = this.getPool(item.constructor);
        pool.return(item);
      }
      /**
       * Gets a specific pool based on the class type.
       * @template T The type of items in the pool. Must extend PoolItem.
       * @param {PoolItemConstructor<T>} ClassType - The constructor of the items in the pool.
       * @returns {Pool<T>} The pool of the given class type.
       */
      getPool(ClassType) {
        if (!this._poolsByClass.has(ClassType)) {
          this._poolsByClass.set(ClassType, new Pool(ClassType));
        }
        return this._poolsByClass.get(ClassType);
      }
      /** gets the usage stats of each pool in the system */
      stats() {
        const stats = {};
        this._poolsByClass.forEach((pool) => {
          const name = stats[pool._classType.name] ? pool._classType.name + pool._classType.ID : pool._classType.name;
          stats[name] = {
            free: pool.totalFree,
            used: pool.totalUsed,
            size: pool.totalSize
          };
        });
        return stats;
      }
      /** Clears all pools in the group. This will reset all pools and free their resources. */
      clear() {
        this._poolsByClass.forEach((pool) => pool.clear());
        this._poolsByClass.clear();
      }
    };
    BigPool = new PoolGroupClass();
    GlobalResourceRegistry.register(BigPool);
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/cacheAsTextureMixin.mjs
var cacheAsTextureMixin;
var init_cacheAsTextureMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/cacheAsTextureMixin.mjs"() {
    init_deprecation();
    cacheAsTextureMixin = {
      get isCachedAsTexture() {
        return !!this.renderGroup?.isCachedAsTexture;
      },
      cacheAsTexture(val) {
        if (typeof val === "boolean" && val === false) {
          this.disableRenderGroup();
        } else {
          this.enableRenderGroup();
          this.renderGroup.enableCacheAsTexture(val === true ? {} : val);
        }
      },
      updateCacheTexture() {
        this.renderGroup?.updateCacheTexture();
      },
      get cacheAsBitmap() {
        return this.isCachedAsTexture;
      },
      set cacheAsBitmap(val) {
        deprecation("v8.6.0", "cacheAsBitmap is deprecated, use cacheAsTexture instead.");
        this.cacheAsTexture(val);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/utils/data/removeItems.mjs
function removeItems(arr, startIdx, removeCount) {
  const length = arr.length;
  let i2;
  if (startIdx >= length || removeCount === 0) {
    return;
  }
  removeCount = startIdx + removeCount > length ? length - startIdx : removeCount;
  const len = length - removeCount;
  for (i2 = startIdx; i2 < len; ++i2) {
    arr[i2] = arr[i2 + removeCount];
  }
  arr.length = len;
}
var init_removeItems = __esm({
  "client/node_modules/pixi.js/lib/utils/data/removeItems.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/childrenHelperMixin.mjs
var childrenHelperMixin;
var init_childrenHelperMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/childrenHelperMixin.mjs"() {
    init_removeItems();
    init_deprecation();
    childrenHelperMixin = {
      allowChildren: true,
      removeChildren(beginIndex = 0, endIndex) {
        const end = endIndex ?? this.children.length;
        const range = end - beginIndex;
        const removed = [];
        if (range > 0 && range <= end) {
          for (let i2 = end - 1; i2 >= beginIndex; i2--) {
            const child = this.children[i2];
            if (!child) continue;
            removed.push(child);
            child.parent = null;
          }
          removeItems(this.children, beginIndex, end);
          const renderGroup = this.renderGroup || this.parentRenderGroup;
          if (renderGroup) {
            renderGroup.removeChildren(removed);
          }
          for (let i2 = 0; i2 < removed.length; ++i2) {
            const child = removed[i2];
            child.parentRenderLayer?.detach(child);
            this.emit("childRemoved", child, this, i2);
            removed[i2].emit("removed", this);
          }
          if (removed.length > 0) {
            this._didViewChangeTick++;
          }
          return removed;
        } else if (range === 0 && this.children.length === 0) {
          return removed;
        }
        throw new RangeError("removeChildren: numeric values are outside the acceptable range.");
      },
      removeChildAt(index) {
        const child = this.getChildAt(index);
        return this.removeChild(child);
      },
      getChildAt(index) {
        if (index < 0 || index >= this.children.length) {
          throw new Error(`getChildAt: Index (${index}) does not exist.`);
        }
        return this.children[index];
      },
      setChildIndex(child, index) {
        if (index < 0 || index >= this.children.length) {
          throw new Error(`The index ${index} supplied is out of bounds ${this.children.length}`);
        }
        this.getChildIndex(child);
        this.addChildAt(child, index);
      },
      getChildIndex(child) {
        const index = this.children.indexOf(child);
        if (index === -1) {
          throw new Error("The supplied Container must be a child of the caller");
        }
        return index;
      },
      addChildAt(child, index) {
        if (!this.allowChildren) {
          deprecation(v8_0_0, "addChildAt: Only Containers will be allowed to add children in v8.0.0");
        }
        const { children } = this;
        if (index < 0 || index > children.length) {
          throw new Error(`${child}addChildAt: The index ${index} supplied is out of bounds ${children.length}`);
        }
        const sameParent = child.parent === this;
        if (child.parent) {
          const currentIndex = child.parent.children.indexOf(child);
          if (sameParent) {
            if (currentIndex === index) {
              return child;
            }
            child.parent.children.splice(currentIndex, 1);
          } else {
            child.removeFromParent();
          }
        }
        if (index === children.length) {
          children.push(child);
        } else {
          children.splice(index, 0, child);
        }
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        if (this.sortableChildren) this.sortDirty = true;
        if (sameParent) {
          if (renderGroup) {
            renderGroup.structureDidChange = true;
          }
          return child;
        }
        child.parent = this;
        child.didChange = true;
        child._updateFlags = 15;
        if (renderGroup) {
          renderGroup.addChild(child);
        }
        this.emit("childAdded", child, this, index);
        child.emit("added", this);
        return child;
      },
      swapChildren(child, child2) {
        if (child === child2) {
          return;
        }
        const index1 = this.getChildIndex(child);
        const index2 = this.getChildIndex(child2);
        this.children[index1] = child2;
        this.children[index2] = child;
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        if (renderGroup) {
          renderGroup.structureDidChange = true;
        }
        this._didContainerChangeTick++;
      },
      removeFromParent() {
        this.parent?.removeChild(this);
      },
      reparentChild(...child) {
        if (child.length === 1) {
          return this.reparentChildAt(child[0], this.children.length);
        }
        child.forEach((c2) => this.reparentChildAt(c2, this.children.length));
        return child[0];
      },
      reparentChildAt(child, index) {
        if (child.parent === this) {
          this.setChildIndex(child, index);
          return child;
        }
        const childMat = child.worldTransform.clone();
        child.removeFromParent();
        this.addChildAt(child, index);
        const newMatrix = this.worldTransform.clone();
        newMatrix.invert();
        childMat.prepend(newMatrix);
        child.setFromMatrix(childMat);
        return child;
      },
      replaceChild(oldChild, newChild) {
        oldChild.updateLocalTransform();
        this.addChildAt(newChild, this.getChildIndex(oldChild));
        newChild.setFromMatrix(oldChild.localTransform);
        newChild.updateLocalTransform();
        this.removeChild(oldChild);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/collectRenderablesMixin.mjs
var collectRenderablesMixin;
var init_collectRenderablesMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/collectRenderablesMixin.mjs"() {
    "use strict";
    collectRenderablesMixin = {
      collectRenderables(instructionSet, renderer, currentLayer) {
        if (this.parentRenderLayer && this.parentRenderLayer !== currentLayer || this.globalDisplayStatus < 7 || !this.includeInBuild) return;
        if (this.sortableChildren) {
          this.sortChildren();
        }
        if (this.isSimple) {
          this.collectRenderablesSimple(instructionSet, renderer, currentLayer);
        } else if (this.renderGroup) {
          renderer.renderPipes.renderGroup.addRenderGroup(this.renderGroup, instructionSet);
        } else {
          this.collectRenderablesWithEffects(instructionSet, renderer, currentLayer);
        }
      },
      collectRenderablesSimple(instructionSet, renderer, currentLayer) {
        const children = this.children;
        const length = children.length;
        for (let i2 = 0; i2 < length; i2++) {
          children[i2].collectRenderables(instructionSet, renderer, currentLayer);
        }
      },
      collectRenderablesWithEffects(instructionSet, renderer, currentLayer) {
        const { renderPipes } = renderer;
        for (let i2 = 0; i2 < this.effects.length; i2++) {
          const effect = this.effects[i2];
          const pipe = renderPipes[effect.pipe];
          pipe.push(effect, this, instructionSet);
        }
        this.collectRenderablesSimple(instructionSet, renderer, currentLayer);
        for (let i2 = this.effects.length - 1; i2 >= 0; i2--) {
          const effect = this.effects[i2];
          const pipe = renderPipes[effect.pipe];
          pipe.pop(effect, this, instructionSet);
        }
      }
    };
  }
});

// client/node_modules/pixi.js/lib/filters/FilterEffect.mjs
var FilterEffect;
var init_FilterEffect = __esm({
  "client/node_modules/pixi.js/lib/filters/FilterEffect.mjs"() {
    "use strict";
    FilterEffect = class {
      constructor() {
        this.pipe = "filter";
        this.priority = 1;
      }
      destroy() {
        for (let i2 = 0; i2 < this.filters.length; i2++) {
          this.filters[i2].destroy();
        }
        this.filters = null;
        this.filterArea = null;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/mask/MaskEffectManager.mjs
var MaskEffectManagerClass, MaskEffectManager;
var init_MaskEffectManager = __esm({
  "client/node_modules/pixi.js/lib/rendering/mask/MaskEffectManager.mjs"() {
    init_Extensions();
    init_PoolGroup();
    MaskEffectManagerClass = class {
      constructor() {
        this._effectClasses = [];
        this._tests = [];
        this._initialized = false;
      }
      init() {
        if (this._initialized) return;
        this._initialized = true;
        this._effectClasses.forEach((test) => {
          this.add({
            test: test.test,
            maskClass: test
          });
        });
      }
      add(test) {
        this._tests.push(test);
      }
      getMaskEffect(item) {
        if (!this._initialized) this.init();
        for (let i2 = 0; i2 < this._tests.length; i2++) {
          const test = this._tests[i2];
          if (test.test(item)) {
            return BigPool.get(test.maskClass, item);
          }
        }
        return item;
      }
      returnMaskEffect(effect) {
        BigPool.return(effect);
      }
    };
    MaskEffectManager = new MaskEffectManagerClass();
    extensions.handleByList(ExtensionType.MaskEffect, MaskEffectManager._effectClasses);
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/effectsMixin.mjs
var effectsMixin;
var init_effectsMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/effectsMixin.mjs"() {
    init_FilterEffect();
    init_MaskEffectManager();
    effectsMixin = {
      _maskEffect: null,
      _maskOptions: {
        inverse: false,
        channel: "red"
      },
      _filterEffect: null,
      effects: [],
      _markStructureAsChanged() {
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        if (renderGroup) {
          renderGroup.structureDidChange = true;
        }
      },
      addEffect(effect) {
        const index = this.effects.indexOf(effect);
        if (index !== -1) return;
        this.effects.push(effect);
        this.effects.sort((a2, b2) => a2.priority - b2.priority);
        this._markStructureAsChanged();
        this._updateIsSimple();
      },
      removeEffect(effect) {
        const index = this.effects.indexOf(effect);
        if (index === -1) return;
        this.effects.splice(index, 1);
        this._markStructureAsChanged();
        this._updateIsSimple();
      },
      set mask(value) {
        const effect = this._maskEffect;
        if (effect?.mask === value) return;
        if (effect) {
          this.removeEffect(effect);
          MaskEffectManager.returnMaskEffect(effect);
          this._maskEffect = null;
        }
        if (value === null || value === void 0) return;
        this._maskEffect = MaskEffectManager.getMaskEffect(value);
        this.addEffect(this._maskEffect);
      },
      get mask() {
        return this._maskEffect?.mask;
      },
      setMask(options) {
        this._maskOptions = {
          ...this._maskOptions,
          ...options
        };
        if (options.mask) {
          this.mask = options.mask;
        }
        this._markStructureAsChanged();
      },
      set filters(value) {
        if (!Array.isArray(value) && value) value = [value];
        const effect = this._filterEffect || (this._filterEffect = new FilterEffect());
        value = value;
        const hasFilters = value?.length > 0;
        const hadFilters = effect.filters?.length > 0;
        const didChange = hasFilters !== hadFilters;
        value = Array.isArray(value) ? value.slice(0) : value;
        effect.filters = Object.freeze(value);
        if (didChange) {
          if (hasFilters) {
            this.addEffect(effect);
          } else {
            this.removeEffect(effect);
            effect.filters = value ?? null;
          }
        }
      },
      get filters() {
        return this._filterEffect?.filters;
      },
      set filterArea(value) {
        this._filterEffect || (this._filterEffect = new FilterEffect());
        this._filterEffect.filterArea = value;
      },
      get filterArea() {
        return this._filterEffect?.filterArea;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/findMixin.mjs
var findMixin;
var init_findMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/findMixin.mjs"() {
    init_deprecation();
    findMixin = {
      label: null,
      get name() {
        deprecation(v8_0_0, "Container.name property has been removed, use Container.label instead");
        return this.label;
      },
      set name(value) {
        deprecation(v8_0_0, "Container.name property has been removed, use Container.label instead");
        this.label = value;
      },
      getChildByName(name, deep = false) {
        return this.getChildByLabel(name, deep);
      },
      getChildByLabel(label, deep = false) {
        const children = this.children;
        for (let i2 = 0; i2 < children.length; i2++) {
          const child = children[i2];
          if (child.label === label || label instanceof RegExp && label.test(child.label)) return child;
        }
        if (deep) {
          for (let i2 = 0; i2 < children.length; i2++) {
            const child = children[i2];
            const found = child.getChildByLabel(label, true);
            if (found) {
              return found;
            }
          }
        }
        return null;
      },
      getChildrenByLabel(label, deep = false, out = []) {
        const children = this.children;
        for (let i2 = 0; i2 < children.length; i2++) {
          const child = children[i2];
          if (child.label === label || label instanceof RegExp && label.test(child.label)) {
            out.push(child);
          }
        }
        if (deep) {
          for (let i2 = 0; i2 < children.length; i2++) {
            children[i2].getChildrenByLabel(label, true, out);
          }
        }
        return out;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/maths/shapes/Rectangle.mjs
var tempPoints, Rectangle;
var init_Rectangle = __esm({
  "client/node_modules/pixi.js/lib/maths/shapes/Rectangle.mjs"() {
    init_Point();
    tempPoints = [new Point(), new Point(), new Point(), new Point()];
    Rectangle = class _Rectangle {
      /**
       * @param x - The X coordinate of the upper-left corner of the rectangle
       * @param y - The Y coordinate of the upper-left corner of the rectangle
       * @param width - The overall width of the rectangle
       * @param height - The overall height of the rectangle
       */
      constructor(x2 = 0, y2 = 0, width = 0, height = 0) {
        this.type = "rectangle";
        this.x = Number(x2);
        this.y = Number(y2);
        this.width = Number(width);
        this.height = Number(height);
      }
      /**
       * Returns the left edge (x-coordinate) of the rectangle.
       * @example
       * ```ts
       * // Get left edge position
       * const rect = new Rectangle(100, 100, 200, 150);
       * console.log(rect.left); // 100
       *
       * // Use in alignment calculations
       * sprite.x = rect.left + padding;
       *
       * // Compare positions
       * if (point.x > rect.left) {
       *     console.log('Point is right of rectangle');
       * }
       * ```
       * @readonly
       * @returns The x-coordinate of the left edge
       * @see {@link Rectangle.right} For right edge position
       * @see {@link Rectangle.x} For direct x-coordinate access
       */
      get left() {
        return this.x;
      }
      /**
       * Returns the right edge (x + width) of the rectangle.
       * @example
       * ```ts
       * // Get right edge position
       * const rect = new Rectangle(100, 100, 200, 150);
       * console.log(rect.right); // 300
       *
       * // Align to right edge
       * sprite.x = rect.right - sprite.width;
       *
       * // Check boundaries
       * if (point.x < rect.right) {
       *     console.log('Point is inside right bound');
       * }
       * ```
       * @readonly
       * @returns The x-coordinate of the right edge
       * @see {@link Rectangle.left} For left edge position
       * @see {@link Rectangle.width} For width value
       */
      get right() {
        return this.x + this.width;
      }
      /**
       * Returns the top edge (y-coordinate) of the rectangle.
       * @example
       * ```ts
       * // Get top edge position
       * const rect = new Rectangle(100, 100, 200, 150);
       * console.log(rect.top); // 100
       *
       * // Position above rectangle
       * sprite.y = rect.top - sprite.height;
       *
       * // Check vertical position
       * if (point.y > rect.top) {
       *     console.log('Point is below top edge');
       * }
       * ```
       * @readonly
       * @returns The y-coordinate of the top edge
       * @see {@link Rectangle.bottom} For bottom edge position
       * @see {@link Rectangle.y} For direct y-coordinate access
       */
      get top() {
        return this.y;
      }
      /**
       * Returns the bottom edge (y + height) of the rectangle.
       * @example
       * ```ts
       * // Get bottom edge position
       * const rect = new Rectangle(100, 100, 200, 150);
       * console.log(rect.bottom); // 250
       *
       * // Stack below rectangle
       * sprite.y = rect.bottom + margin;
       *
       * // Check vertical bounds
       * if (point.y < rect.bottom) {
       *     console.log('Point is above bottom edge');
       * }
       * ```
       * @readonly
       * @returns The y-coordinate of the bottom edge
       * @see {@link Rectangle.top} For top edge position
       * @see {@link Rectangle.height} For height value
       */
      get bottom() {
        return this.y + this.height;
      }
      /**
       * Determines whether the Rectangle is empty (has no area).
       * @example
       * ```ts
       * // Check zero dimensions
       * const rect = new Rectangle(100, 100, 0, 50);
       * console.log(rect.isEmpty()); // true
       * ```
       * @returns True if the rectangle has no area
       * @see {@link Rectangle.width} For width value
       * @see {@link Rectangle.height} For height value
       */
      isEmpty() {
        return this.left === this.right || this.top === this.bottom;
      }
      /**
       * A constant empty rectangle. This is a new object every time the property is accessed.
       * @example
       * ```ts
       * // Get fresh empty rectangle
       * const empty = Rectangle.EMPTY;
       * console.log(empty.isEmpty()); // true
       * ```
       * @returns A new empty rectangle instance
       * @see {@link Rectangle.isEmpty} For empty state testing
       */
      static get EMPTY() {
        return new _Rectangle(0, 0, 0, 0);
      }
      /**
       * Creates a clone of this Rectangle
       * @example
       * ```ts
       * // Basic cloning
       * const original = new Rectangle(100, 100, 200, 150);
       * const copy = original.clone();
       *
       * // Clone and modify
       * const modified = original.clone();
       * modified.width *= 2;
       * modified.height += 50;
       *
       * // Verify independence
       * console.log(original.width);  // 200
       * console.log(modified.width);  // 400
       * ```
       * @returns A copy of the rectangle
       * @see {@link Rectangle.copyFrom} For copying into existing rectangle
       * @see {@link Rectangle.copyTo} For copying to another rectangle
       */
      clone() {
        return new _Rectangle(this.x, this.y, this.width, this.height);
      }
      /**
       * Converts a Bounds object to a Rectangle object.
       * @example
       * ```ts
       * // Convert bounds to rectangle
       * const bounds = container.getBounds();
       * const rect = new Rectangle().copyFromBounds(bounds);
       * ```
       * @param bounds - The bounds to copy and convert to a rectangle
       * @returns Returns itself
       * @see {@link Bounds} For bounds object structure
       * @see {@link Rectangle.getBounds} For getting rectangle bounds
       */
      copyFromBounds(bounds) {
        this.x = bounds.minX;
        this.y = bounds.minY;
        this.width = bounds.maxX - bounds.minX;
        this.height = bounds.maxY - bounds.minY;
        return this;
      }
      /**
       * Copies another rectangle to this one.
       * @example
       * ```ts
       * // Basic copying
       * const source = new Rectangle(100, 100, 200, 150);
       * const target = new Rectangle();
       * target.copyFrom(source);
       *
       * // Chain with other operations
       * const rect = new Rectangle()
       *     .copyFrom(source)
       *     .pad(10);
       * ```
       * @param rectangle - The rectangle to copy from
       * @returns Returns itself
       * @see {@link Rectangle.copyTo} For copying to another rectangle
       * @see {@link Rectangle.clone} For creating new rectangle copy
       */
      copyFrom(rectangle) {
        this.x = rectangle.x;
        this.y = rectangle.y;
        this.width = rectangle.width;
        this.height = rectangle.height;
        return this;
      }
      /**
       * Copies this rectangle to another one.
       * @example
       * ```ts
       * // Basic copying
       * const source = new Rectangle(100, 100, 200, 150);
       * const target = new Rectangle();
       * source.copyTo(target);
       *
       * // Chain with other operations
       * const result = source
       *     .copyTo(new Rectangle())
       *     .getBounds();
       * ```
       * @param rectangle - The rectangle to copy to
       * @returns Returns given parameter
       * @see {@link Rectangle.copyFrom} For copying from another rectangle
       * @see {@link Rectangle.clone} For creating new rectangle copy
       */
      copyTo(rectangle) {
        rectangle.copyFrom(this);
        return rectangle;
      }
      /**
       * Checks whether the x and y coordinates given are contained within this Rectangle
       * @example
       * ```ts
       * // Basic containment check
       * const rect = new Rectangle(100, 100, 200, 150);
       * const isInside = rect.contains(150, 125); // true
       * // Check edge cases
       * console.log(rect.contains(100, 100)); // true (on edge)
       * console.log(rect.contains(300, 250)); // false (outside)
       * ```
       * @param x - The X coordinate of the point to test
       * @param y - The Y coordinate of the point to test
       * @returns Whether the x/y coordinates are within this Rectangle
       * @see {@link Rectangle.containsRect} For rectangle containment
       * @see {@link Rectangle.strokeContains} For checking stroke intersection
       */
      contains(x2, y2) {
        if (this.width <= 0 || this.height <= 0) {
          return false;
        }
        if (x2 >= this.x && x2 < this.x + this.width) {
          if (y2 >= this.y && y2 < this.y + this.height) {
            return true;
          }
        }
        return false;
      }
      /**
       * Checks whether the x and y coordinates given are contained within this rectangle including the stroke.
       * @example
       * ```ts
       * // Basic stroke check
       * const rect = new Rectangle(100, 100, 200, 150);
       * const isOnStroke = rect.strokeContains(150, 100, 4); // 4px line width
       *
       * // Check with different alignments
       * const innerStroke = rect.strokeContains(150, 100, 4, 1);   // Inside
       * const centerStroke = rect.strokeContains(150, 100, 4, 0.5); // Centered
       * const outerStroke = rect.strokeContains(150, 100, 4, 0);   // Outside
       * ```
       * @param x - The X coordinate of the point to test
       * @param y - The Y coordinate of the point to test
       * @param strokeWidth - The width of the line to check
       * @param alignment - The alignment of the stroke (1 = inner, 0.5 = centered, 0 = outer)
       * @returns Whether the x/y coordinates are within this rectangle's stroke
       * @see {@link Rectangle.contains} For checking fill containment
       * @see {@link Rectangle.getBounds} For getting stroke bounds
       */
      strokeContains(x2, y2, strokeWidth, alignment = 0.5) {
        const { width, height } = this;
        if (width <= 0 || height <= 0) return false;
        const _x = this.x;
        const _y = this.y;
        const strokeWidthOuter = strokeWidth * (1 - alignment);
        const strokeWidthInner = strokeWidth - strokeWidthOuter;
        const outerLeft = _x - strokeWidthOuter;
        const outerRight = _x + width + strokeWidthOuter;
        const outerTop = _y - strokeWidthOuter;
        const outerBottom = _y + height + strokeWidthOuter;
        const innerLeft = _x + strokeWidthInner;
        const innerRight = _x + width - strokeWidthInner;
        const innerTop = _y + strokeWidthInner;
        const innerBottom = _y + height - strokeWidthInner;
        return x2 >= outerLeft && x2 <= outerRight && y2 >= outerTop && y2 <= outerBottom && !(x2 > innerLeft && x2 < innerRight && y2 > innerTop && y2 < innerBottom);
      }
      /**
       * Determines whether the `other` Rectangle transformed by `transform` intersects with `this` Rectangle object.
       * Returns true only if the area of the intersection is >0, this means that Rectangles
       * sharing a side are not overlapping. Another side effect is that an arealess rectangle
       * (width or height equal to zero) can't intersect any other rectangle.
       * @param {Rectangle} other - The Rectangle to intersect with `this`.
       * @param {Matrix} transform - The transformation matrix of `other`.
       * @returns {boolean} A value of `true` if the transformed `other` Rectangle intersects with `this`; otherwise `false`.
       */
      /**
       * Determines whether the `other` Rectangle transformed by `transform` intersects with `this` Rectangle object.
       *
       * Returns true only if the area of the intersection is greater than 0.
       * This means that rectangles sharing only a side are not considered intersecting.
       * @example
       * ```ts
       * // Basic intersection check
       * const rect1 = new Rectangle(0, 0, 100, 100);
       * const rect2 = new Rectangle(50, 50, 100, 100);
       * console.log(rect1.intersects(rect2)); // true
       *
       * // With transformation matrix
       * const matrix = new Matrix();
       * matrix.rotate(Math.PI / 4); // 45 degrees
       * console.log(rect1.intersects(rect2, matrix)); // Checks with rotation
       *
       * // Edge cases
       * const zeroWidth = new Rectangle(0, 0, 0, 100);
       * console.log(rect1.intersects(zeroWidth)); // false (no area)
       * ```
       * @remarks
       * - Returns true only if intersection area is > 0
       * - Rectangles sharing only a side are not intersecting
       * - Zero-area rectangles cannot intersect anything
       * - Supports optional transformation matrix
       * @param other - The Rectangle to intersect with `this`
       * @param transform - Optional transformation matrix of `other`
       * @returns True if the transformed `other` Rectangle intersects with `this`
       * @see {@link Rectangle.containsRect} For containment testing
       * @see {@link Rectangle.contains} For point testing
       */
      intersects(other, transform) {
        if (!transform) {
          const x02 = this.x < other.x ? other.x : this.x;
          const x12 = this.right > other.right ? other.right : this.right;
          if (x12 <= x02) {
            return false;
          }
          const y02 = this.y < other.y ? other.y : this.y;
          const y12 = this.bottom > other.bottom ? other.bottom : this.bottom;
          return y12 > y02;
        }
        const x0 = this.left;
        const x1 = this.right;
        const y0 = this.top;
        const y1 = this.bottom;
        if (x1 <= x0 || y1 <= y0) {
          return false;
        }
        const lt = tempPoints[0].set(other.left, other.top);
        const lb = tempPoints[1].set(other.left, other.bottom);
        const rt = tempPoints[2].set(other.right, other.top);
        const rb = tempPoints[3].set(other.right, other.bottom);
        if (rt.x <= lt.x || lb.y <= lt.y) {
          return false;
        }
        const s2 = Math.sign(transform.a * transform.d - transform.b * transform.c);
        if (s2 === 0) {
          return false;
        }
        transform.apply(lt, lt);
        transform.apply(lb, lb);
        transform.apply(rt, rt);
        transform.apply(rb, rb);
        if (Math.max(lt.x, lb.x, rt.x, rb.x) <= x0 || Math.min(lt.x, lb.x, rt.x, rb.x) >= x1 || Math.max(lt.y, lb.y, rt.y, rb.y) <= y0 || Math.min(lt.y, lb.y, rt.y, rb.y) >= y1) {
          return false;
        }
        const nx = s2 * (lb.y - lt.y);
        const ny = s2 * (lt.x - lb.x);
        const n00 = nx * x0 + ny * y0;
        const n10 = nx * x1 + ny * y0;
        const n01 = nx * x0 + ny * y1;
        const n11 = nx * x1 + ny * y1;
        if (Math.max(n00, n10, n01, n11) <= nx * lt.x + ny * lt.y || Math.min(n00, n10, n01, n11) >= nx * rb.x + ny * rb.y) {
          return false;
        }
        const mx = s2 * (lt.y - rt.y);
        const my = s2 * (rt.x - lt.x);
        const m00 = mx * x0 + my * y0;
        const m10 = mx * x1 + my * y0;
        const m01 = mx * x0 + my * y1;
        const m11 = mx * x1 + my * y1;
        if (Math.max(m00, m10, m01, m11) <= mx * lt.x + my * lt.y || Math.min(m00, m10, m01, m11) >= mx * rb.x + my * rb.y) {
          return false;
        }
        return true;
      }
      /**
       * Pads the rectangle making it grow in all directions.
       *
       * If paddingY is omitted, both paddingX and paddingY will be set to paddingX.
       * @example
       * ```ts
       * // Basic padding
       * const rect = new Rectangle(100, 100, 200, 150);
       * rect.pad(10); // Adds 10px padding on all sides
       *
       * // Different horizontal and vertical padding
       * const uiRect = new Rectangle(0, 0, 100, 50);
       * uiRect.pad(20, 10); // 20px horizontal, 10px vertical
       * ```
       * @remarks
       * - Adjusts x/y by subtracting padding
       * - Increases width/height by padding * 2
       * - Common in UI layout calculations
       * - Chainable with other methods
       * @param paddingX - The horizontal padding amount
       * @param paddingY - The vertical padding amount
       * @returns Returns itself
       * @see {@link Rectangle.enlarge} For growing to include another rectangle
       * @see {@link Rectangle.fit} For shrinking to fit within another rectangle
       */
      pad(paddingX = 0, paddingY = paddingX) {
        this.x -= paddingX;
        this.y -= paddingY;
        this.width += paddingX * 2;
        this.height += paddingY * 2;
        return this;
      }
      /**
       * Fits this rectangle around the passed one.
       * @example
       * ```ts
       * // Basic fitting
       * const container = new Rectangle(0, 0, 100, 100);
       * const content = new Rectangle(25, 25, 200, 200);
       * content.fit(container); // Clips to container bounds
       * ```
       * @param rectangle - The rectangle to fit around
       * @returns Returns itself
       * @see {@link Rectangle.enlarge} For growing to include another rectangle
       * @see {@link Rectangle.pad} For adding padding around the rectangle
       */
      fit(rectangle) {
        const x1 = Math.max(this.x, rectangle.x);
        const x2 = Math.min(this.x + this.width, rectangle.x + rectangle.width);
        const y1 = Math.max(this.y, rectangle.y);
        const y2 = Math.min(this.y + this.height, rectangle.y + rectangle.height);
        this.x = x1;
        this.width = Math.max(x2 - x1, 0);
        this.y = y1;
        this.height = Math.max(y2 - y1, 0);
        return this;
      }
      /**
       * Enlarges rectangle so that its corners lie on a grid defined by resolution.
       * @example
       * ```ts
       * // Basic grid alignment
       * const rect = new Rectangle(10.2, 10.6, 100.8, 100.4);
       * rect.ceil(); // Aligns to whole pixels
       *
       * // Custom resolution grid
       * const uiRect = new Rectangle(5.3, 5.7, 50.2, 50.8);
       * uiRect.ceil(0.5); // Aligns to half pixels
       *
       * // Use with precision value
       * const preciseRect = new Rectangle(20.001, 20.999, 100.001, 100.999);
       * preciseRect.ceil(1, 0.01); // Handles small decimal variations
       * ```
       * @param resolution - The grid size to align to (1 = whole pixels)
       * @param eps - Small number to prevent floating point errors
       * @returns Returns itself
       * @see {@link Rectangle.fit} For constraining to bounds
       * @see {@link Rectangle.enlarge} For growing dimensions
       */
      ceil(resolution = 1, eps = 1e-3) {
        const x2 = Math.ceil((this.x + this.width - eps) * resolution) / resolution;
        const y2 = Math.ceil((this.y + this.height - eps) * resolution) / resolution;
        this.x = Math.floor((this.x + eps) * resolution) / resolution;
        this.y = Math.floor((this.y + eps) * resolution) / resolution;
        this.width = x2 - this.x;
        this.height = y2 - this.y;
        return this;
      }
      /**
       * Scales the rectangle's dimensions and position by the specified factors.
       * @example
       * ```ts
       * const rect = new Rectangle(50, 50, 100, 100);
       *
       * // Scale uniformly
       * rect.scale(0.5, 0.5);
       * // rect is now: x=25, y=25, width=50, height=50
       *
       * // non-uniformly
       * rect.scale(0.5, 1);
       * // rect is now: x=25, y=50, width=50, height=100
       * ```
       * @param x - The factor by which to scale the horizontal properties (x, width).
       * @param y - The factor by which to scale the vertical properties (y, height).
       * @returns Returns itself
       */
      scale(x2, y2 = x2) {
        this.x *= x2;
        this.y *= y2;
        this.width *= x2;
        this.height *= y2;
        return this;
      }
      /**
       * Enlarges this rectangle to include the passed rectangle.
       * @example
       * ```ts
       * // Basic enlargement
       * const rect = new Rectangle(50, 50, 100, 100);
       * const other = new Rectangle(0, 0, 200, 75);
       * rect.enlarge(other);
       * // rect is now: x=0, y=0, width=200, height=150
       *
       * // Use for bounding box calculation
       * const bounds = new Rectangle();
       * objects.forEach((obj) => {
       *     bounds.enlarge(obj.getBounds());
       * });
       * ```
       * @param rectangle - The rectangle to include
       * @returns Returns itself
       * @see {@link Rectangle.fit} For shrinking to fit within another rectangle
       * @see {@link Rectangle.pad} For adding padding around the rectangle
       */
      enlarge(rectangle) {
        const x1 = Math.min(this.x, rectangle.x);
        const x2 = Math.max(this.x + this.width, rectangle.x + rectangle.width);
        const y1 = Math.min(this.y, rectangle.y);
        const y2 = Math.max(this.y + this.height, rectangle.y + rectangle.height);
        this.x = x1;
        this.width = x2 - x1;
        this.y = y1;
        this.height = y2 - y1;
        return this;
      }
      /**
       * Returns the framing rectangle of the rectangle as a Rectangle object
       * @example
       * ```ts
       * // Basic bounds retrieval
       * const rect = new Rectangle(100, 100, 200, 150);
       * const bounds = rect.getBounds();
       *
       * // Reuse existing rectangle
       * const out = new Rectangle();
       * rect.getBounds(out);
       * ```
       * @param out - Optional rectangle to store the result
       * @returns The framing rectangle
       * @see {@link Rectangle.copyFrom} For direct copying
       * @see {@link Rectangle.clone} For creating new copy
       */
      getBounds(out) {
        out || (out = new _Rectangle());
        out.copyFrom(this);
        return out;
      }
      /**
       * Determines whether another Rectangle is fully contained within this Rectangle.
       *
       * Rectangles that occupy the same space are considered to be containing each other.
       *
       * Rectangles without area (width or height equal to zero) can't contain anything,
       * not even other arealess rectangles.
       * @example
       * ```ts
       * // Check if one rectangle contains another
       * const container = new Rectangle(0, 0, 100, 100);
       * const inner = new Rectangle(25, 25, 50, 50);
       *
       * console.log(container.containsRect(inner)); // true
       *
       * // Check overlapping rectangles
       * const partial = new Rectangle(75, 75, 50, 50);
       * console.log(container.containsRect(partial)); // false
       *
       * // Zero-area rectangles can't contain anything
       * const empty = new Rectangle(0, 0, 0, 100);
       * console.log(empty.containsRect(inner)); // false
       * ```
       * @param other - The Rectangle to check for containment
       * @returns True if other is fully contained within this Rectangle
       * @see {@link Rectangle.contains} For point containment
       * @see {@link Rectangle.intersects} For overlap testing
       */
      containsRect(other) {
        if (this.width <= 0 || this.height <= 0) return false;
        const x1 = other.x;
        const y1 = other.y;
        const x2 = other.x + other.width;
        const y2 = other.y + other.height;
        return x1 >= this.x && x1 < this.x + this.width && y1 >= this.y && y1 < this.y + this.height && x2 >= this.x && x2 <= this.x + this.width && y2 >= this.y && y2 <= this.y + this.height;
      }
      /**
       * Sets the position and dimensions of the rectangle.
       * @example
       * ```ts
       * // Basic usage
       * const rect = new Rectangle();
       * rect.set(100, 100, 200, 150);
       *
       * // Chain with other operations
       * const bounds = new Rectangle()
       *     .set(0, 0, 100, 100)
       *     .pad(10);
       * ```
       * @param x - The X coordinate of the upper-left corner of the rectangle
       * @param y - The Y coordinate of the upper-left corner of the rectangle
       * @param width - The overall width of the rectangle
       * @param height - The overall height of the rectangle
       * @returns Returns itself for method chaining
       * @see {@link Rectangle.copyFrom} For copying from another rectangle
       * @see {@link Rectangle.clone} For creating a new copy
       */
      set(x2, y2, width, height) {
        this.x = x2;
        this.y = y2;
        this.width = width;
        this.height = height;
        return this;
      }
      toString() {
        return `[pixi.js/math:Rectangle x=${this.x} y=${this.y} width=${this.width} height=${this.height}]`;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/bounds/Bounds.mjs
var defaultMatrix, Bounds;
var init_Bounds = __esm({
  "client/node_modules/pixi.js/lib/scene/container/bounds/Bounds.mjs"() {
    init_Matrix();
    init_Rectangle();
    defaultMatrix = new Matrix();
    Bounds = class _Bounds {
      /**
       * Creates a new Bounds object.
       * @param minX - The minimum X coordinate of the bounds.
       * @param minY - The minimum Y coordinate of the bounds.
       * @param maxX - The maximum X coordinate of the bounds.
       * @param maxY - The maximum Y coordinate of the bounds.
       */
      constructor(minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity) {
        this.minX = Infinity;
        this.minY = Infinity;
        this.maxX = -Infinity;
        this.maxY = -Infinity;
        this.matrix = defaultMatrix;
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
      }
      /**
       * Checks if bounds are empty, meaning either width or height is zero or negative.
       * Empty bounds occur when min values exceed max values on either axis.
       * @example
       * ```ts
       * const bounds = new Bounds();
       *
       * // Check if newly created bounds are empty
       * console.log(bounds.isEmpty()); // true, default bounds are empty
       *
       * // Add frame and check again
       * bounds.addFrame(0, 0, 100, 100);
       * console.log(bounds.isEmpty()); // false, bounds now have area
       *
       * // Clear bounds
       * bounds.clear();
       * console.log(bounds.isEmpty()); // true, bounds are empty again
       * ```
       * @returns True if bounds are empty (have no area)
       * @see {@link Bounds#clear} For resetting bounds
       * @see {@link Bounds#isValid} For checking validity
       */
      isEmpty() {
        return this.minX > this.maxX || this.minY > this.maxY;
      }
      /**
       * The bounding rectangle representation of these bounds.
       * Lazily creates and updates a Rectangle instance based on the current bounds.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       *
       * // Get rectangle representation
       * const rect = bounds.rectangle;
       * console.log(rect.x, rect.y, rect.width, rect.height);
       *
       * // Use for hit testing
       * if (bounds.rectangle.contains(mouseX, mouseY)) {
       *     console.log('Mouse is inside bounds!');
       * }
       * ```
       * @see {@link Rectangle} For rectangle methods
       * @see {@link Bounds.isEmpty} For bounds validation
       */
      get rectangle() {
        if (!this._rectangle) {
          this._rectangle = new Rectangle();
        }
        const rectangle = this._rectangle;
        if (this.minX > this.maxX || this.minY > this.maxY) {
          rectangle.x = 0;
          rectangle.y = 0;
          rectangle.width = 0;
          rectangle.height = 0;
        } else {
          rectangle.copyFromBounds(this);
        }
        return rectangle;
      }
      /**
       * Clears the bounds and resets all coordinates to their default values.
       * Resets the transformation matrix back to identity.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * console.log(bounds.isEmpty()); // false
       * // Clear the bounds
       * bounds.clear();
       * console.log(bounds.isEmpty()); // true
       * ```
       * @returns This bounds object for chaining
       */
      clear() {
        this.minX = Infinity;
        this.minY = Infinity;
        this.maxX = -Infinity;
        this.maxY = -Infinity;
        this.matrix = defaultMatrix;
        return this;
      }
      /**
       * Sets the bounds directly using coordinate values.
       * Provides a way to set all bounds values at once.
       * @example
       * ```ts
       * const bounds = new Bounds();
       * bounds.set(0, 0, 100, 100);
       * ```
       * @param x0 - Left X coordinate of frame
       * @param y0 - Top Y coordinate of frame
       * @param x1 - Right X coordinate of frame
       * @param y1 - Bottom Y coordinate of frame
       * @see {@link Bounds#addFrame} For matrix-aware bounds setting
       * @see {@link Bounds#clear} For resetting bounds
       */
      set(x0, y0, x1, y1) {
        this.minX = x0;
        this.minY = y0;
        this.maxX = x1;
        this.maxY = y1;
      }
      /**
       * Adds a rectangular frame to the bounds, optionally transformed by a matrix.
       * Updates the bounds to encompass the new frame coordinates.
       * @example
       * ```ts
       * const bounds = new Bounds();
       * bounds.addFrame(0, 0, 100, 100);
       *
       * // Add transformed frame
       * const matrix = new Matrix()
       *     .translate(50, 50)
       *     .rotate(Math.PI / 4);
       * bounds.addFrame(0, 0, 100, 100, matrix);
       * ```
       * @param x0 - Left X coordinate of frame
       * @param y0 - Top Y coordinate of frame
       * @param x1 - Right X coordinate of frame
       * @param y1 - Bottom Y coordinate of frame
       * @param matrix - Optional transformation matrix
       * @see {@link Bounds#addRect} For adding Rectangle objects
       * @see {@link Bounds#addBounds} For adding other Bounds
       */
      addFrame(x0, y0, x1, y1, matrix) {
        matrix || (matrix = this.matrix);
        const a2 = matrix.a;
        const b2 = matrix.b;
        const c2 = matrix.c;
        const d2 = matrix.d;
        const tx = matrix.tx;
        const ty = matrix.ty;
        let minX = this.minX;
        let minY = this.minY;
        let maxX = this.maxX;
        let maxY = this.maxY;
        let x2 = a2 * x0 + c2 * y0 + tx;
        let y2 = b2 * x0 + d2 * y0 + ty;
        if (x2 < minX) minX = x2;
        if (y2 < minY) minY = y2;
        if (x2 > maxX) maxX = x2;
        if (y2 > maxY) maxY = y2;
        x2 = a2 * x1 + c2 * y0 + tx;
        y2 = b2 * x1 + d2 * y0 + ty;
        if (x2 < minX) minX = x2;
        if (y2 < minY) minY = y2;
        if (x2 > maxX) maxX = x2;
        if (y2 > maxY) maxY = y2;
        x2 = a2 * x0 + c2 * y1 + tx;
        y2 = b2 * x0 + d2 * y1 + ty;
        if (x2 < minX) minX = x2;
        if (y2 < minY) minY = y2;
        if (x2 > maxX) maxX = x2;
        if (y2 > maxY) maxY = y2;
        x2 = a2 * x1 + c2 * y1 + tx;
        y2 = b2 * x1 + d2 * y1 + ty;
        if (x2 < minX) minX = x2;
        if (y2 < minY) minY = y2;
        if (x2 > maxX) maxX = x2;
        if (y2 > maxY) maxY = y2;
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
      }
      /**
       * Adds a rectangle to the bounds, optionally transformed by a matrix.
       * Updates the bounds to encompass the given rectangle.
       * @example
       * ```ts
       * const bounds = new Bounds();
       * // Add simple rectangle
       * const rect = new Rectangle(0, 0, 100, 100);
       * bounds.addRect(rect);
       *
       * // Add transformed rectangle
       * const matrix = new Matrix()
       *     .translate(50, 50)
       *     .rotate(Math.PI / 4);
       * bounds.addRect(rect, matrix);
       * ```
       * @param rect - The rectangle to be added
       * @param matrix - Optional transformation matrix
       * @see {@link Bounds#addFrame} For adding raw coordinates
       * @see {@link Bounds#addBounds} For adding other bounds
       */
      addRect(rect, matrix) {
        this.addFrame(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height, matrix);
      }
      /**
       * Adds another bounds object to this one, optionally transformed by a matrix.
       * Expands the bounds to include the given bounds' area.
       * @example
       * ```ts
       * const bounds = new Bounds();
       *
       * // Add child bounds
       * const childBounds = sprite.getBounds();
       * bounds.addBounds(childBounds);
       *
       * // Add transformed bounds
       * const matrix = new Matrix()
       *     .scale(2, 2);
       * bounds.addBounds(childBounds, matrix);
       * ```
       * @param bounds - The bounds to be added
       * @param matrix - Optional transformation matrix
       * @see {@link Bounds#addFrame} For adding raw coordinates
       * @see {@link Bounds#addRect} For adding rectangles
       */
      addBounds(bounds, matrix) {
        this.addFrame(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, matrix);
      }
      /**
       * Adds other Bounds as a mask, creating an intersection of the two bounds.
       * Only keeps the overlapping region between current bounds and mask bounds.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * // Create mask bounds
       * const mask = new Bounds();
       * mask.addFrame(50, 50, 150, 150);
       * // Apply mask - results in bounds of (50,50,100,100)
       * bounds.addBoundsMask(mask);
       * ```
       * @param mask - The Bounds to use as a mask
       * @see {@link Bounds#addBounds} For union operation
       * @see {@link Bounds#fit} For fitting to rectangle
       */
      addBoundsMask(mask) {
        this.minX = this.minX > mask.minX ? this.minX : mask.minX;
        this.minY = this.minY > mask.minY ? this.minY : mask.minY;
        this.maxX = this.maxX < mask.maxX ? this.maxX : mask.maxX;
        this.maxY = this.maxY < mask.maxY ? this.maxY : mask.maxY;
      }
      /**
       * Applies a transformation matrix to the bounds, updating its coordinates.
       * Transforms all corners of the bounds using the given matrix.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * // Apply translation
       * const translateMatrix = new Matrix()
       *     .translate(50, 50);
       * bounds.applyMatrix(translateMatrix);
       * ```
       * @param matrix - The matrix to apply to the bounds
       * @see {@link Matrix} For matrix operations
       * @see {@link Bounds#addFrame} For adding transformed frames
       */
      applyMatrix(matrix) {
        const minX = this.minX;
        const minY = this.minY;
        const maxX = this.maxX;
        const maxY = this.maxY;
        const { a: a2, b: b2, c: c2, d: d2, tx, ty } = matrix;
        let x2 = a2 * minX + c2 * minY + tx;
        let y2 = b2 * minX + d2 * minY + ty;
        this.minX = x2;
        this.minY = y2;
        this.maxX = x2;
        this.maxY = y2;
        x2 = a2 * maxX + c2 * minY + tx;
        y2 = b2 * maxX + d2 * minY + ty;
        this.minX = x2 < this.minX ? x2 : this.minX;
        this.minY = y2 < this.minY ? y2 : this.minY;
        this.maxX = x2 > this.maxX ? x2 : this.maxX;
        this.maxY = y2 > this.maxY ? y2 : this.maxY;
        x2 = a2 * minX + c2 * maxY + tx;
        y2 = b2 * minX + d2 * maxY + ty;
        this.minX = x2 < this.minX ? x2 : this.minX;
        this.minY = y2 < this.minY ? y2 : this.minY;
        this.maxX = x2 > this.maxX ? x2 : this.maxX;
        this.maxY = y2 > this.maxY ? y2 : this.maxY;
        x2 = a2 * maxX + c2 * maxY + tx;
        y2 = b2 * maxX + d2 * maxY + ty;
        this.minX = x2 < this.minX ? x2 : this.minX;
        this.minY = y2 < this.minY ? y2 : this.minY;
        this.maxX = x2 > this.maxX ? x2 : this.maxX;
        this.maxY = y2 > this.maxY ? y2 : this.maxY;
      }
      /**
       * Resizes the bounds object to fit within the given rectangle.
       * Clips the bounds if they extend beyond the rectangle's edges.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 200, 200);
       * // Fit within viewport
       * const viewport = new Rectangle(50, 50, 100, 100);
       * bounds.fit(viewport);
       * // bounds are now (50, 50, 150, 150)
       * ```
       * @param rect - The rectangle to fit within
       * @returns This bounds object for chaining
       * @see {@link Bounds#addBoundsMask} For intersection
       * @see {@link Bounds#pad} For expanding bounds
       */
      fit(rect) {
        if (this.minX < rect.left) this.minX = rect.left;
        if (this.maxX > rect.right) this.maxX = rect.right;
        if (this.minY < rect.top) this.minY = rect.top;
        if (this.maxY > rect.bottom) this.maxY = rect.bottom;
        return this;
      }
      /**
       * Resizes the bounds object to include the given bounds.
       * Similar to fit() but works with raw coordinate values instead of a Rectangle.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 200, 200);
       * // Fit to specific coordinates
       * bounds.fitBounds(50, 150, 50, 150);
       * // bounds are now (50, 50, 150, 150)
       * ```
       * @param left - The left value of the bounds
       * @param right - The right value of the bounds
       * @param top - The top value of the bounds
       * @param bottom - The bottom value of the bounds
       * @returns This bounds object for chaining
       * @see {@link Bounds#fit} For fitting to Rectangle
       * @see {@link Bounds#addBoundsMask} For intersection
       */
      fitBounds(left, right, top, bottom) {
        if (this.minX < left) this.minX = left;
        if (this.maxX > right) this.maxX = right;
        if (this.minY < top) this.minY = top;
        if (this.maxY > bottom) this.maxY = bottom;
        return this;
      }
      /**
       * Pads bounds object, making it grow in all directions.
       * If paddingY is omitted, both paddingX and paddingY will be set to paddingX.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       *
       * // Add equal padding
       * bounds.pad(10);
       * // bounds are now (-10, -10, 110, 110)
       *
       * // Add different padding for x and y
       * bounds.pad(20, 10);
       * // bounds are now (-30, -20, 130, 120)
       * ```
       * @param paddingX - The horizontal padding amount
       * @param paddingY - The vertical padding amount
       * @returns This bounds object for chaining
       * @see {@link Bounds#fit} For constraining bounds
       * @see {@link Bounds#scale} For uniform scaling
       */
      pad(paddingX, paddingY = paddingX) {
        this.minX -= paddingX;
        this.maxX += paddingX;
        this.minY -= paddingY;
        this.maxY += paddingY;
        return this;
      }
      /**
       * Ceils the bounds by rounding up max values and rounding down min values.
       * Useful for pixel-perfect calculations and avoiding fractional pixels.
       * @example
       * ```ts
       * const bounds = new Bounds();
       * bounds.set(10.2, 10.9, 50.1, 50.8);
       *
       * // Round to whole pixels
       * bounds.ceil();
       * // bounds are now (10, 10, 51, 51)
       * ```
       * @returns This bounds object for chaining
       * @see {@link Bounds#scale} For size adjustments
       * @see {@link Bounds#fit} For constraining bounds
       */
      ceil() {
        this.minX = Math.floor(this.minX);
        this.minY = Math.floor(this.minY);
        this.maxX = Math.ceil(this.maxX);
        this.maxY = Math.ceil(this.maxY);
        return this;
      }
      /**
       * Creates a new Bounds instance with the same values.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       *
       * // Create a copy
       * const copy = bounds.clone();
       *
       * // Original and copy are independent
       * bounds.pad(10);
       * console.log(copy.width === bounds.width); // false
       * ```
       * @returns A new Bounds instance with the same values
       * @see {@link Bounds#copyFrom} For reusing existing bounds
       */
      clone() {
        return new _Bounds(this.minX, this.minY, this.maxX, this.maxY);
      }
      /**
       * Scales the bounds by the given values, adjusting all edges proportionally.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       *
       * // Scale uniformly
       * bounds.scale(2);
       * // bounds are now (0, 0, 200, 200)
       *
       * // Scale non-uniformly
       * bounds.scale(0.5, 2);
       * // bounds are now (0, 0, 100, 400)
       * ```
       * @param x - The X value to scale by
       * @param y - The Y value to scale by (defaults to x)
       * @returns This bounds object for chaining
       * @see {@link Bounds#pad} For adding padding
       * @see {@link Bounds#fit} For constraining size
       */
      scale(x2, y2 = x2) {
        this.minX *= x2;
        this.minY *= y2;
        this.maxX *= x2;
        this.maxY *= y2;
        return this;
      }
      /**
       * The x position of the bounds in local space.
       * Setting this value will move the bounds while maintaining its width.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * // Get x position
       * console.log(bounds.x); // 0
       *
       * // Move bounds horizontally
       * bounds.x = 50;
       * console.log(bounds.minX, bounds.maxX); // 50, 150
       *
       * // Width stays the same
       * console.log(bounds.width); // Still 100
       * ```
       */
      get x() {
        return this.minX;
      }
      set x(value) {
        const width = this.maxX - this.minX;
        this.minX = value;
        this.maxX = value + width;
      }
      /**
       * The y position of the bounds in local space.
       * Setting this value will move the bounds while maintaining its height.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * // Get y position
       * console.log(bounds.y); // 0
       *
       * // Move bounds vertically
       * bounds.y = 50;
       * console.log(bounds.minY, bounds.maxY); // 50, 150
       *
       * // Height stays the same
       * console.log(bounds.height); // Still 100
       * ```
       */
      get y() {
        return this.minY;
      }
      set y(value) {
        const height = this.maxY - this.minY;
        this.minY = value;
        this.maxY = value + height;
      }
      /**
       * The width value of the bounds.
       * Represents the distance between minX and maxX coordinates.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * // Get width
       * console.log(bounds.width); // 100
       * // Resize width
       * bounds.width = 200;
       * console.log(bounds.maxX - bounds.minX); // 200
       * ```
       */
      get width() {
        return this.maxX - this.minX;
      }
      set width(value) {
        this.maxX = this.minX + value;
      }
      /**
       * The height value of the bounds.
       * Represents the distance between minY and maxY coordinates.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * // Get height
       * console.log(bounds.height); // 100
       * // Resize height
       * bounds.height = 150;
       * console.log(bounds.maxY - bounds.minY); // 150
       * ```
       */
      get height() {
        return this.maxY - this.minY;
      }
      set height(value) {
        this.maxY = this.minY + value;
      }
      /**
       * The left edge coordinate of the bounds.
       * Alias for minX.
       * @example
       * ```ts
       * const bounds = new Bounds(50, 0, 150, 100);
       * console.log(bounds.left); // 50
       * console.log(bounds.left === bounds.minX); // true
       * ```
       * @readonly
       */
      get left() {
        return this.minX;
      }
      /**
       * The right edge coordinate of the bounds.
       * Alias for maxX.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * console.log(bounds.right); // 100
       * console.log(bounds.right === bounds.maxX); // true
       * ```
       * @readonly
       */
      get right() {
        return this.maxX;
      }
      /**
       * The top edge coordinate of the bounds.
       * Alias for minY.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 25, 100, 125);
       * console.log(bounds.top); // 25
       * console.log(bounds.top === bounds.minY); // true
       * ```
       * @readonly
       */
      get top() {
        return this.minY;
      }
      /**
       * The bottom edge coordinate of the bounds.
       * Alias for maxY.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 200);
       * console.log(bounds.bottom); // 200
       * console.log(bounds.bottom === bounds.maxY); // true
       * ```
       * @readonly
       */
      get bottom() {
        return this.maxY;
      }
      /**
       * Whether the bounds has positive width and height.
       * Checks if both dimensions are greater than zero.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * // Check if bounds are positive
       * console.log(bounds.isPositive); // true
       *
       * // Negative bounds
       * bounds.maxX = bounds.minX;
       * console.log(bounds.isPositive); // false, width is 0
       * ```
       * @readonly
       * @see {@link Bounds#isEmpty} For checking empty state
       * @see {@link Bounds#isValid} For checking validity
       */
      get isPositive() {
        return this.maxX - this.minX > 0 && this.maxY - this.minY > 0;
      }
      /**
       * Whether the bounds has valid coordinates.
       * Checks if the bounds has been initialized with real values.
       * @example
       * ```ts
       * const bounds = new Bounds();
       * console.log(bounds.isValid); // false, default state
       *
       * // Set valid bounds
       * bounds.addFrame(0, 0, 100, 100);
       * console.log(bounds.isValid); // true
       * ```
       * @readonly
       * @see {@link Bounds#isEmpty} For checking empty state
       * @see {@link Bounds#isPositive} For checking dimensions
       */
      get isValid() {
        return this.minX + this.minY !== Infinity;
      }
      /**
       * Adds vertices from a Float32Array to the bounds, optionally transformed by a matrix.
       * Used for efficiently updating bounds from raw vertex data.
       * @example
       * ```ts
       * const bounds = new Bounds();
       *
       * // Add vertices from geometry
       * const vertices = new Float32Array([
       *     0, 0,    // Vertex 1
       *     100, 0,  // Vertex 2
       *     100, 100 // Vertex 3
       * ]);
       * bounds.addVertexData(vertices, 0, 6);
       *
       * // Add transformed vertices
       * const matrix = new Matrix()
       *     .translate(50, 50)
       *     .rotate(Math.PI / 4);
       * bounds.addVertexData(vertices, 0, 6, matrix);
       *
       * // Add subset of vertices
       * bounds.addVertexData(vertices, 2, 4); // Only second vertex
       * ```
       * @param vertexData - The array of vertices to add
       * @param beginOffset - Starting index in the vertex array
       * @param endOffset - Ending index in the vertex array (excluded)
       * @param matrix - Optional transformation matrix
       * @see {@link Bounds#addFrame} For adding rectangular frames
       * @see {@link Matrix} For transformation details
       */
      addVertexData(vertexData, beginOffset, endOffset, matrix) {
        let minX = this.minX;
        let minY = this.minY;
        let maxX = this.maxX;
        let maxY = this.maxY;
        matrix || (matrix = this.matrix);
        const a2 = matrix.a;
        const b2 = matrix.b;
        const c2 = matrix.c;
        const d2 = matrix.d;
        const tx = matrix.tx;
        const ty = matrix.ty;
        for (let i2 = beginOffset; i2 < endOffset; i2 += 2) {
          const localX = vertexData[i2];
          const localY = vertexData[i2 + 1];
          const x2 = a2 * localX + c2 * localY + tx;
          const y2 = b2 * localX + d2 * localY + ty;
          minX = x2 < minX ? x2 : minX;
          minY = y2 < minY ? y2 : minY;
          maxX = x2 > maxX ? x2 : maxX;
          maxY = y2 > maxY ? y2 : maxY;
        }
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
      }
      /**
       * Checks if a point is contained within the bounds.
       * Returns true if the point's coordinates fall within the bounds' area.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * // Basic point check
       * console.log(bounds.containsPoint(50, 50)); // true
       * console.log(bounds.containsPoint(150, 150)); // false
       *
       * // Check edges
       * console.log(bounds.containsPoint(0, 0));   // true, includes edges
       * console.log(bounds.containsPoint(100, 100)); // true, includes edges
       * ```
       * @param x - x coordinate to check
       * @param y - y coordinate to check
       * @returns True if the point is inside the bounds
       * @see {@link Bounds#isPositive} For valid bounds check
       * @see {@link Bounds#rectangle} For Rectangle representation
       */
      containsPoint(x2, y2) {
        if (this.minX <= x2 && this.minY <= y2 && this.maxX >= x2 && this.maxY >= y2) {
          return true;
        }
        return false;
      }
      /**
       * Returns a string representation of the bounds.
       * Useful for debugging and logging bounds information.
       * @example
       * ```ts
       * const bounds = new Bounds(0, 0, 100, 100);
       * console.log(bounds.toString()); // "[pixi.js:Bounds minX=0 minY=0 maxX=100 maxY=100 width=100 height=100]"
       * ```
       * @returns A string describing the bounds
       * @see {@link Bounds#copyFrom} For copying bounds
       * @see {@link Bounds#clone} For creating a new instance
       */
      toString() {
        return `[pixi.js:Bounds minX=${this.minX} minY=${this.minY} maxX=${this.maxX} maxY=${this.maxY} width=${this.width} height=${this.height}]`;
      }
      /**
       * Copies the bounds from another bounds object.
       * Useful for reusing bounds objects and avoiding allocations.
       * @example
       * ```ts
       * const sourceBounds = new Bounds(0, 0, 100, 100);
       * // Copy bounds
       * const targetBounds = new Bounds();
       * targetBounds.copyFrom(sourceBounds);
       * ```
       * @param bounds - The bounds to copy from
       * @returns This bounds object for chaining
       * @see {@link Bounds#clone} For creating new instances
       */
      copyFrom(bounds) {
        this.minX = bounds.minX;
        this.minY = bounds.minY;
        this.maxX = bounds.maxX;
        this.maxY = bounds.maxY;
        return this;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/bounds/utils/matrixAndBoundsPool.mjs
var matrixPool, boundsPool;
var init_matrixAndBoundsPool = __esm({
  "client/node_modules/pixi.js/lib/scene/container/bounds/utils/matrixAndBoundsPool.mjs"() {
    init_Matrix();
    init_PoolGroup();
    init_Bounds();
    matrixPool = BigPool.getPool(Matrix);
    boundsPool = BigPool.getPool(Bounds);
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/getFastGlobalBoundsMixin.mjs
var tempMatrix2, getFastGlobalBoundsMixin;
var init_getFastGlobalBoundsMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/getFastGlobalBoundsMixin.mjs"() {
    init_Matrix();
    init_Bounds();
    init_matrixAndBoundsPool();
    tempMatrix2 = new Matrix();
    getFastGlobalBoundsMixin = {
      getFastGlobalBounds(factorRenderLayers, bounds) {
        bounds || (bounds = new Bounds());
        bounds.clear();
        this._getGlobalBoundsRecursive(!!factorRenderLayers, bounds, this.parentRenderLayer);
        if (!bounds.isValid) {
          bounds.set(0, 0, 0, 0);
        }
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        bounds.applyMatrix(renderGroup.worldTransform);
        return bounds;
      },
      _getGlobalBoundsRecursive(factorRenderLayers, bounds, currentLayer) {
        let localBounds = bounds;
        if (factorRenderLayers && this.parentRenderLayer && this.parentRenderLayer !== currentLayer) return;
        if (this.localDisplayStatus !== 7 || !this.measurable) {
          return;
        }
        const manageEffects = !!this.effects.length;
        if (this.renderGroup || manageEffects) {
          localBounds = boundsPool.get().clear();
        }
        if (this.boundsArea) {
          bounds.addRect(this.boundsArea, this.worldTransform);
        } else {
          if (this.renderPipeId) {
            const viewBounds = this.bounds;
            localBounds.addFrame(
              viewBounds.minX,
              viewBounds.minY,
              viewBounds.maxX,
              viewBounds.maxY,
              this.groupTransform
            );
          }
          const children = this.children;
          for (let i2 = 0; i2 < children.length; i2++) {
            children[i2]._getGlobalBoundsRecursive(factorRenderLayers, localBounds, currentLayer);
          }
        }
        if (manageEffects) {
          let advanced = false;
          const renderGroup = this.renderGroup || this.parentRenderGroup;
          for (let i2 = 0; i2 < this.effects.length; i2++) {
            if (this.effects[i2].addBounds) {
              if (!advanced) {
                advanced = true;
                localBounds.applyMatrix(renderGroup.worldTransform);
              }
              this.effects[i2].addBounds(localBounds, true);
            }
          }
          if (advanced) {
            localBounds.applyMatrix(renderGroup.worldTransform.copyTo(tempMatrix2).invert());
          }
          bounds.addBounds(localBounds);
          boundsPool.return(localBounds);
        } else if (this.renderGroup) {
          bounds.addBounds(localBounds, this.relativeGroupTransform);
          boundsPool.return(localBounds);
        }
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/bounds/getGlobalBounds.mjs
function getGlobalBounds(target, skipUpdateTransform, bounds) {
  bounds.clear();
  let parentTransform;
  let pooledMatrix;
  if (target.parent) {
    if (!skipUpdateTransform) {
      pooledMatrix = matrixPool.get().identity();
      parentTransform = updateTransformBackwards(target, pooledMatrix);
    } else {
      parentTransform = target.parent.worldTransform;
    }
  } else {
    parentTransform = Matrix.IDENTITY;
  }
  _getGlobalBounds(target, bounds, parentTransform, skipUpdateTransform);
  if (pooledMatrix) {
    matrixPool.return(pooledMatrix);
  }
  if (!bounds.isValid) {
    bounds.set(0, 0, 0, 0);
  }
  return bounds;
}
function _getGlobalBounds(target, bounds, parentTransform, skipUpdateTransform) {
  if (!target.visible || !target.measurable) return;
  let worldTransform;
  if (!skipUpdateTransform) {
    target.updateLocalTransform();
    worldTransform = matrixPool.get();
    worldTransform.appendFrom(target.localTransform, parentTransform);
  } else {
    worldTransform = target.worldTransform;
  }
  const parentBounds = bounds;
  const preserveBounds = !!target.effects.length;
  if (preserveBounds) {
    bounds = boundsPool.get().clear();
  }
  if (target.boundsArea) {
    bounds.addRect(target.boundsArea, worldTransform);
  } else {
    const renderableBounds = target.bounds;
    if (renderableBounds && !renderableBounds.isEmpty()) {
      bounds.matrix = worldTransform;
      bounds.addBounds(renderableBounds);
    }
    for (let i2 = 0; i2 < target.children.length; i2++) {
      _getGlobalBounds(target.children[i2], bounds, worldTransform, skipUpdateTransform);
    }
  }
  if (preserveBounds) {
    for (let i2 = 0; i2 < target.effects.length; i2++) {
      target.effects[i2].addBounds?.(bounds);
    }
    parentBounds.addBounds(bounds, Matrix.IDENTITY);
    boundsPool.return(bounds);
  }
  if (!skipUpdateTransform) {
    matrixPool.return(worldTransform);
  }
}
function updateTransformBackwards(target, parentTransform) {
  const parent = target.parent;
  if (parent) {
    updateTransformBackwards(parent, parentTransform);
    parent.updateLocalTransform();
    parentTransform.append(parent.localTransform);
  }
  return parentTransform;
}
var init_getGlobalBounds = __esm({
  "client/node_modules/pixi.js/lib/scene/container/bounds/getGlobalBounds.mjs"() {
    init_Matrix();
    init_matrixAndBoundsPool();
  }
});

// client/node_modules/pixi.js/lib/scene/container/utils/multiplyHexColors.mjs
function multiplyHexColors(color1, color2) {
  if (color1 === 16777215 || !color2) return color2;
  if (color2 === 16777215 || !color1) return color1;
  const r1 = color1 >> 16 & 255;
  const g1 = color1 >> 8 & 255;
  const b1 = color1 & 255;
  const r2 = color2 >> 16 & 255;
  const g2 = color2 >> 8 & 255;
  const b2 = color2 & 255;
  const r3 = r1 * r2 / 255 | 0;
  const g3 = g1 * g2 / 255 | 0;
  const b3 = b1 * b2 / 255 | 0;
  return (r3 << 16) + (g3 << 8) + b3;
}
var init_multiplyHexColors = __esm({
  "client/node_modules/pixi.js/lib/scene/container/utils/multiplyHexColors.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/scene/container/utils/multiplyColors.mjs
function multiplyColors(localBGRColor, parentBGRColor) {
  if (localBGRColor === WHITE_BGR) {
    return parentBGRColor;
  }
  if (parentBGRColor === WHITE_BGR) {
    return localBGRColor;
  }
  return multiplyHexColors(localBGRColor, parentBGRColor);
}
var WHITE_BGR;
var init_multiplyColors = __esm({
  "client/node_modules/pixi.js/lib/scene/container/utils/multiplyColors.mjs"() {
    init_multiplyHexColors();
    WHITE_BGR = 16777215;
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/getGlobalMixin.mjs
function bgr2rgb(color) {
  return ((color & 255) << 16) + (color & 65280) + (color >> 16 & 255);
}
var getGlobalMixin;
var init_getGlobalMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/getGlobalMixin.mjs"() {
    init_Matrix();
    init_getGlobalBounds();
    init_matrixAndBoundsPool();
    init_multiplyColors();
    getGlobalMixin = {
      getGlobalAlpha(skipUpdate) {
        if (skipUpdate) {
          if (this.renderGroup) {
            return this.renderGroup.worldAlpha;
          }
          if (this.parentRenderGroup) {
            return this.parentRenderGroup.worldAlpha * this.alpha;
          }
          return this.alpha;
        }
        let alpha = this.alpha;
        let current = this.parent;
        while (current) {
          alpha *= current.alpha;
          current = current.parent;
        }
        return alpha;
      },
      getGlobalTransform(matrix = new Matrix(), skipUpdate) {
        if (skipUpdate) {
          return matrix.copyFrom(this.worldTransform);
        }
        this.updateLocalTransform();
        const parentTransform = updateTransformBackwards(this, matrixPool.get().identity());
        matrix.appendFrom(this.localTransform, parentTransform);
        matrixPool.return(parentTransform);
        return matrix;
      },
      getGlobalTint(skipUpdate) {
        if (skipUpdate) {
          if (this.renderGroup) {
            return bgr2rgb(this.renderGroup.worldColor);
          }
          if (this.parentRenderGroup) {
            return bgr2rgb(
              multiplyColors(this.localColor, this.parentRenderGroup.worldColor)
            );
          }
          return this.tint;
        }
        let color = this.localColor;
        let parent = this.parent;
        while (parent) {
          color = multiplyColors(color, parent.localColor);
          parent = parent.parent;
        }
        return bgr2rgb(color);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/bounds/getLocalBounds.mjs
function getLocalBounds(target, bounds, relativeMatrix) {
  bounds.clear();
  relativeMatrix || (relativeMatrix = Matrix.IDENTITY);
  _getLocalBounds(target, bounds, relativeMatrix, target, true);
  if (!bounds.isValid) {
    bounds.set(0, 0, 0, 0);
  }
  return bounds;
}
function _getLocalBounds(target, bounds, parentTransform, rootContainer, isRoot) {
  let relativeTransform;
  if (!isRoot) {
    if (!target.visible || !target.measurable) return;
    target.updateLocalTransform();
    const localTransform = target.localTransform;
    relativeTransform = matrixPool.get();
    relativeTransform.appendFrom(localTransform, parentTransform);
  } else {
    relativeTransform = matrixPool.get();
    relativeTransform = parentTransform.copyTo(relativeTransform);
  }
  const parentBounds = bounds;
  const preserveBounds = !!target.effects.length;
  if (preserveBounds) {
    bounds = boundsPool.get().clear();
  }
  if (target.boundsArea) {
    bounds.addRect(target.boundsArea, relativeTransform);
  } else {
    if (target.renderPipeId) {
      bounds.matrix = relativeTransform;
      bounds.addBounds(target.bounds);
    }
    const children = target.children;
    for (let i2 = 0; i2 < children.length; i2++) {
      _getLocalBounds(children[i2], bounds, relativeTransform, rootContainer, false);
    }
  }
  if (preserveBounds) {
    for (let i2 = 0; i2 < target.effects.length; i2++) {
      target.effects[i2].addLocalBounds?.(bounds, rootContainer);
    }
    parentBounds.addBounds(bounds, Matrix.IDENTITY);
    boundsPool.return(bounds);
  }
  matrixPool.return(relativeTransform);
}
var init_getLocalBounds = __esm({
  "client/node_modules/pixi.js/lib/scene/container/bounds/getLocalBounds.mjs"() {
    init_Matrix();
    init_matrixAndBoundsPool();
  }
});

// client/node_modules/pixi.js/lib/scene/container/utils/checkChildrenDidChange.mjs
function checkChildrenDidChange(container, previousData) {
  const children = container.children;
  for (let i2 = 0; i2 < children.length; i2++) {
    const child = children[i2];
    const uid2 = child.uid;
    const didChange = (child._didViewChangeTick & 65535) << 16 | child._didContainerChangeTick & 65535;
    const index = previousData.index;
    if (previousData.data[index] !== uid2 || previousData.data[index + 1] !== didChange) {
      previousData.data[previousData.index] = uid2;
      previousData.data[previousData.index + 1] = didChange;
      previousData.didChange = true;
    }
    previousData.index = index + 2;
    if (child.children.length) {
      checkChildrenDidChange(child, previousData);
    }
  }
  return previousData.didChange;
}
var init_checkChildrenDidChange = __esm({
  "client/node_modules/pixi.js/lib/scene/container/utils/checkChildrenDidChange.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/measureMixin.mjs
var tempMatrix3, measureMixin;
var init_measureMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/measureMixin.mjs"() {
    init_Matrix();
    init_Bounds();
    init_getGlobalBounds();
    init_getLocalBounds();
    init_checkChildrenDidChange();
    tempMatrix3 = new Matrix();
    measureMixin = {
      _localBoundsCacheId: -1,
      _localBoundsCacheData: null,
      _setWidth(value, localWidth) {
        const sign = Math.sign(this.scale.x) || 1;
        if (localWidth !== 0) {
          this.scale.x = value / localWidth * sign;
        } else {
          this.scale.x = sign;
        }
      },
      _setHeight(value, localHeight) {
        const sign = Math.sign(this.scale.y) || 1;
        if (localHeight !== 0) {
          this.scale.y = value / localHeight * sign;
        } else {
          this.scale.y = sign;
        }
      },
      getLocalBounds() {
        if (!this._localBoundsCacheData) {
          this._localBoundsCacheData = {
            data: [],
            index: 1,
            didChange: false,
            localBounds: new Bounds()
          };
        }
        const localBoundsCacheData = this._localBoundsCacheData;
        localBoundsCacheData.index = 1;
        localBoundsCacheData.didChange = false;
        if (localBoundsCacheData.data[0] !== this._didViewChangeTick) {
          localBoundsCacheData.didChange = true;
          localBoundsCacheData.data[0] = this._didViewChangeTick;
        }
        checkChildrenDidChange(this, localBoundsCacheData);
        if (localBoundsCacheData.didChange) {
          getLocalBounds(this, localBoundsCacheData.localBounds, tempMatrix3);
        }
        return localBoundsCacheData.localBounds;
      },
      getBounds(skipUpdate, bounds) {
        return getGlobalBounds(this, skipUpdate, bounds || new Bounds());
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/onRenderMixin.mjs
var onRenderMixin;
var init_onRenderMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/onRenderMixin.mjs"() {
    "use strict";
    onRenderMixin = {
      _onRender: null,
      set onRender(func) {
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        if (!func) {
          if (this._onRender) {
            renderGroup?.removeOnRender(this);
          }
          this._onRender = null;
          return;
        }
        if (!this._onRender) {
          renderGroup?.addOnRender(this);
        }
        this._onRender = func;
      },
      get onRender() {
        return this._onRender;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/sortMixin.mjs
function sortChildren(a2, b2) {
  return a2._zIndex - b2._zIndex;
}
var sortMixin;
var init_sortMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/sortMixin.mjs"() {
    "use strict";
    sortMixin = {
      _zIndex: 0,
      sortDirty: false,
      sortableChildren: false,
      get zIndex() {
        return this._zIndex;
      },
      set zIndex(value) {
        if (this._zIndex === value) return;
        this._zIndex = value;
        this.depthOfChildModified();
      },
      depthOfChildModified() {
        if (this.parent) {
          this.parent.sortableChildren = true;
          this.parent.sortDirty = true;
        }
        if (this.parentRenderGroup) {
          this.parentRenderGroup.structureDidChange = true;
        }
      },
      sortChildren() {
        if (!this.sortDirty) return;
        this.sortDirty = false;
        this.children.sort(sortChildren);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/container-mixins/toLocalGlobalMixin.mjs
var toLocalGlobalMixin;
var init_toLocalGlobalMixin = __esm({
  "client/node_modules/pixi.js/lib/scene/container/container-mixins/toLocalGlobalMixin.mjs"() {
    init_Point();
    init_matrixAndBoundsPool();
    toLocalGlobalMixin = {
      getGlobalPosition(point = new Point(), skipUpdate = false) {
        if (this.parent) {
          this.parent.toGlobal(this._position, point, skipUpdate);
        } else {
          point.x = this._position.x;
          point.y = this._position.y;
        }
        return point;
      },
      toGlobal(position, point, skipUpdate = false) {
        const globalMatrix = this.getGlobalTransform(matrixPool.get(), skipUpdate);
        point = globalMatrix.apply(position, point);
        matrixPool.return(globalMatrix);
        return point;
      },
      toLocal(position, from, point, skipUpdate) {
        if (from) {
          position = from.toGlobal(position, point, skipUpdate);
        }
        const globalMatrix = this.getGlobalTransform(matrixPool.get(), skipUpdate);
        point = globalMatrix.applyInverse(position, point);
        matrixPool.return(globalMatrix);
        return point;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/instructions/InstructionSet.mjs
var InstructionSet;
var init_InstructionSet = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/instructions/InstructionSet.mjs"() {
    init_uid();
    InstructionSet = class {
      constructor() {
        this.uid = uid("instructionSet");
        this.instructions = [];
        this.instructionSize = 0;
        this.renderables = [];
        this.gcTick = 0;
      }
      /** reset the instruction set so it can be reused set size back to 0 */
      reset() {
        this.instructionSize = 0;
      }
      /**
       * Destroy the instruction set, clearing the instructions and renderables and notifying
       * each render pipe so it can release any per-InstructionSet cached resources.
       * @internal
       */
      destroy() {
        if (this.renderPipes) {
          for (const i2 in this.renderPipes) {
            this.renderPipes[i2].destroyInstructionSet?.(this);
          }
        }
        this.instructions.length = 0;
        this.renderables.length = 0;
        this.renderPipes = null;
        this.gcTick = 0;
      }
      /**
       * Add an instruction to the set
       * @param instruction - add an instruction to the set
       */
      add(instruction) {
        this.instructions[this.instructionSize++] = instruction;
      }
      /**
       * Log the instructions to the console (for debugging)
       * @internal
       */
      log() {
        this.instructions.length = this.instructionSize;
        console.table(this.instructions, ["type", "action"]);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/maths/misc/pow2.mjs
function nextPow2(v2) {
  v2 += v2 === 0 ? 1 : 0;
  --v2;
  v2 |= v2 >>> 1;
  v2 |= v2 >>> 2;
  v2 |= v2 >>> 4;
  v2 |= v2 >>> 8;
  v2 |= v2 >>> 16;
  return v2 + 1;
}
function isPow2(v2) {
  return !(v2 & v2 - 1) && !!v2;
}
var init_pow2 = __esm({
  "client/node_modules/pixi.js/lib/maths/misc/pow2.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/scene/container/utils/definedProps.mjs
function definedProps(obj) {
  const result2 = {};
  for (const key in obj) {
    if (obj[key] !== void 0) {
      result2[key] = obj[key];
    }
  }
  return result2;
}
var init_definedProps = __esm({
  "client/node_modules/pixi.js/lib/scene/container/utils/definedProps.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/TextureStyle.mjs
function createResourceIdFromString(value) {
  const id = idHash[value];
  if (id === void 0) {
    idHash[value] = uid("resource");
  }
  return id;
}
var idHash, _TextureStyle, TextureStyle;
var init_TextureStyle = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/TextureStyle.mjs"() {
    init_eventemitter3();
    init_uid();
    init_deprecation();
    idHash = /* @__PURE__ */ Object.create(null);
    _TextureStyle = class _TextureStyle2 extends eventemitter3_default {
      /**
       * @param options - options for the style
       */
      constructor(options = {}) {
        super();
        this._resourceType = "textureSampler";
        this._maxAnisotropy = 1;
        this.destroyed = false;
        options = { ..._TextureStyle2.defaultOptions, ...options };
        this.addressMode = options.addressMode;
        this.addressModeU = options.addressModeU ?? this.addressModeU;
        this.addressModeV = options.addressModeV ?? this.addressModeV;
        this.addressModeW = options.addressModeW ?? this.addressModeW;
        this.scaleMode = options.scaleMode;
        this.magFilter = options.magFilter ?? this.magFilter;
        this.minFilter = options.minFilter ?? this.minFilter;
        this.mipmapFilter = options.mipmapFilter ?? this.mipmapFilter;
        this.lodMinClamp = options.lodMinClamp;
        this.lodMaxClamp = options.lodMaxClamp;
        this.compare = options.compare;
        this.maxAnisotropy = options.maxAnisotropy ?? 1;
      }
      set addressMode(value) {
        this.addressModeU = value;
        this.addressModeV = value;
        this.addressModeW = value;
      }
      /** setting this will set wrapModeU,wrapModeV and wrapModeW all at once! */
      get addressMode() {
        return this.addressModeU;
      }
      set wrapMode(value) {
        deprecation(v8_0_0, "TextureStyle.wrapMode is now TextureStyle.addressMode");
        this.addressMode = value;
      }
      get wrapMode() {
        return this.addressMode;
      }
      set scaleMode(value) {
        this.magFilter = value;
        this.minFilter = value;
        this.mipmapFilter = value;
      }
      /** setting this will set magFilter,minFilter and mipmapFilter all at once!  */
      get scaleMode() {
        return this.magFilter;
      }
      /** Specifies the maximum anisotropy value clamp used by the sampler. */
      set maxAnisotropy(value) {
        this._maxAnisotropy = Math.min(value, 16);
        if (this._maxAnisotropy > 1) {
          this.scaleMode = "linear";
        }
      }
      get maxAnisotropy() {
        return this._maxAnisotropy;
      }
      // TODO - move this to WebGL?
      get _resourceId() {
        return this._sharedResourceId || this._generateResourceId();
      }
      update() {
        this._sharedResourceId = null;
        this.emit("change", this);
      }
      _generateResourceId() {
        const bigKey = `${this.addressModeU}-${this.addressModeV}-${this.addressModeW}-${this.magFilter}-${this.minFilter}-${this.mipmapFilter}-${this.lodMinClamp}-${this.lodMaxClamp}-${this.compare}-${this._maxAnisotropy}`;
        this._sharedResourceId = createResourceIdFromString(bigKey);
        return this._resourceId;
      }
      /** Destroys the style */
      destroy() {
        this.destroyed = true;
        this.emit("destroy", this);
        this.emit("change", this);
        this.removeAllListeners();
      }
    };
    _TextureStyle.defaultOptions = {
      addressMode: "clamp-to-edge",
      scaleMode: "linear"
    };
    TextureStyle = _TextureStyle;
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/TextureSource.mjs
var _TextureSource, TextureSource;
var init_TextureSource = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/TextureSource.mjs"() {
    init_eventemitter3();
    init_pow2();
    init_definedProps();
    init_uid();
    init_TextureStyle();
    _TextureSource = class _TextureSource2 extends eventemitter3_default {
      /**
       * @param options - options for creating a new TextureSource
       */
      constructor(options = {}) {
        super();
        this.options = options;
        this._gpuData = /* @__PURE__ */ Object.create(null);
        this._gcLastUsed = -1;
        this.uid = uid("textureSource");
        this._resourceType = "textureSource";
        this._resourceId = uid("resource");
        this.uploadMethodId = "unknown";
        this._resolution = 1;
        this.pixelWidth = 1;
        this.pixelHeight = 1;
        this.width = 1;
        this.height = 1;
        this.sampleCount = 1;
        this.mipLevelCount = 1;
        this.autoGenerateMipmaps = false;
        this.format = "rgba8unorm";
        this.dimension = "2d";
        this.viewDimension = "2d";
        this.arrayLayerCount = 1;
        this._ownsStyle = false;
        this.antialias = false;
        this.transient = false;
        this._batchTick = -1;
        this._textureBindLocation = -1;
        options = { ..._TextureSource2.defaultOptions, ...options };
        this.label = options.label ?? "";
        this.resource = options.resource;
        this.autoGarbageCollect = options.autoGarbageCollect;
        this._resolution = options.resolution;
        if (options.width) {
          this.pixelWidth = options.width * this._resolution;
        } else {
          this.pixelWidth = this.resource ? this.resourceWidth ?? 1 : 1;
        }
        if (options.height) {
          this.pixelHeight = options.height * this._resolution;
        } else {
          this.pixelHeight = this.resource ? this.resourceHeight ?? 1 : 1;
        }
        this.width = this.pixelWidth / this._resolution;
        this.height = this.pixelHeight / this._resolution;
        this.format = options.format;
        this.dimension = options.dimensions;
        this.viewDimension = options.viewDimension ?? options.dimensions;
        this.arrayLayerCount = options.arrayLayerCount;
        this.mipLevelCount = options.mipLevelCount;
        this.autoGenerateMipmaps = options.autoGenerateMipmaps;
        this.sampleCount = options.sampleCount;
        this.antialias = options.antialias;
        this.transient = options.transient ?? false;
        this.alphaMode = options.alphaMode;
        this.style = new TextureStyle(definedProps(options));
        this._ownsStyle = true;
        this.destroyed = false;
        this._refreshPOT();
      }
      /** returns itself */
      get source() {
        return this;
      }
      /** the style of the texture */
      get style() {
        return this._style;
      }
      set style(value) {
        if (this.style === value) return;
        this._ownsStyle = false;
        this._style?.off("change", this._onStyleChange, this);
        this._style = value;
        this._style?.on("change", this._onStyleChange, this);
        this._onStyleChange();
      }
      /** Specifies the maximum anisotropy value clamp used by the sampler. */
      set maxAnisotropy(value) {
        this._style.maxAnisotropy = value;
      }
      get maxAnisotropy() {
        return this._style.maxAnisotropy;
      }
      /** setting this will set wrapModeU, wrapModeV and wrapModeW all at once! */
      get addressMode() {
        return this._style.addressMode;
      }
      set addressMode(value) {
        this._style.addressMode = value;
      }
      /** setting this will set wrapModeU, wrapModeV and wrapModeW all at once! */
      get repeatMode() {
        return this._style.addressMode;
      }
      set repeatMode(value) {
        this._style.addressMode = value;
      }
      /** Specifies the sampling behavior when the sample footprint is smaller than or equal to one texel. */
      get magFilter() {
        return this._style.magFilter;
      }
      set magFilter(value) {
        this._style.magFilter = value;
      }
      /** Specifies the sampling behavior when the sample footprint is larger than one texel. */
      get minFilter() {
        return this._style.minFilter;
      }
      set minFilter(value) {
        this._style.minFilter = value;
      }
      /** Specifies behavior for sampling between mipmap levels. */
      get mipmapFilter() {
        return this._style.mipmapFilter;
      }
      set mipmapFilter(value) {
        this._style.mipmapFilter = value;
      }
      /** Specifies the minimum and maximum levels of detail, respectively, used internally when sampling a texture. */
      get lodMinClamp() {
        return this._style.lodMinClamp;
      }
      set lodMinClamp(value) {
        this._style.lodMinClamp = value;
      }
      /** Specifies the minimum and maximum levels of detail, respectively, used internally when sampling a texture. */
      get lodMaxClamp() {
        return this._style.lodMaxClamp;
      }
      set lodMaxClamp(value) {
        this._style.lodMaxClamp = value;
      }
      _onStyleChange() {
        this.emit("styleChange", this);
      }
      /** call this if you have modified the texture outside of the constructor */
      update() {
        if (this.resource) {
          const resolution = this._resolution;
          const didResize = this.resize(this.resourceWidth / resolution, this.resourceHeight / resolution);
          if (didResize) return;
        }
        this.emit("update", this);
      }
      /** Destroys this texture source */
      destroy() {
        this.destroyed = true;
        this.unload();
        this.emit("destroy", this);
        if (this._style) {
          if (this._ownsStyle) this._style.destroy();
          this._style = null;
        }
        this.uploadMethodId = null;
        this.resource = null;
        this.removeAllListeners();
      }
      /**
       * This will unload the Texture source from the GPU. This will free up the GPU memory
       * As soon as it is required fore rendering, it will be re-uploaded.
       */
      unload() {
        this._resourceId = uid("resource");
        this.emit("change", this);
        this.emit("unload", this);
        for (const key in this._gpuData) {
          this._gpuData[key]?.destroy?.();
        }
        this._gpuData = /* @__PURE__ */ Object.create(null);
      }
      /** the width of the resource. This is the REAL pure number, not accounting resolution   */
      get resourceWidth() {
        const { resource } = this;
        return resource.naturalWidth || resource.videoWidth || resource.displayWidth || resource.width;
      }
      /** the height of the resource. This is the REAL pure number, not accounting resolution */
      get resourceHeight() {
        const { resource } = this;
        return resource.naturalHeight || resource.videoHeight || resource.displayHeight || resource.height;
      }
      /**
       * the resolution of the texture. Changing this number, will not change the number of pixels in the actual texture
       * but will the size of the texture when rendered.
       *
       * changing the resolution of this texture to 2 for example will make it appear twice as small when rendered (as pixel
       * density will have increased)
       */
      get resolution() {
        return this._resolution;
      }
      set resolution(resolution) {
        if (this._resolution === resolution) return;
        this._resolution = resolution;
        this.width = this.pixelWidth / resolution;
        this.height = this.pixelHeight / resolution;
      }
      /**
       * Resize the texture, this is handy if you want to use the texture as a render texture
       * @param width - the new width of the texture
       * @param height - the new height of the texture
       * @param resolution - the new resolution of the texture
       * @returns - if the texture was resized
       */
      resize(width, height, resolution) {
        resolution || (resolution = this._resolution);
        width || (width = this.width);
        height || (height = this.height);
        const newPixelWidth = Math.round(width * resolution);
        const newPixelHeight = Math.round(height * resolution);
        this.width = newPixelWidth / resolution;
        this.height = newPixelHeight / resolution;
        this._resolution = resolution;
        if (this.pixelWidth === newPixelWidth && this.pixelHeight === newPixelHeight) {
          return false;
        }
        this._refreshPOT();
        this.pixelWidth = newPixelWidth;
        this.pixelHeight = newPixelHeight;
        this.emit("resize", this);
        this._resourceId = uid("resource");
        this.emit("change", this);
        return true;
      }
      /**
       * Lets the renderer know that this texture has been updated and its mipmaps should be re-generated.
       * This is only important for RenderTexture instances, as standard Texture instances will have their
       * mipmaps generated on upload. You should call this method after you make any change to the texture
       *
       * The reason for this is is can be quite expensive to update mipmaps for a texture. So by default,
       * We want you, the developer to specify when this action should happen.
       *
       * Generally you don't want to have mipmaps generated on Render targets that are changed every frame,
       */
      updateMipmaps() {
        if (this.autoGenerateMipmaps && this.mipLevelCount > 1) {
          this.emit("updateMipmaps", this);
        }
      }
      set wrapMode(value) {
        this._style.wrapMode = value;
      }
      get wrapMode() {
        return this._style.wrapMode;
      }
      set scaleMode(value) {
        this._style.scaleMode = value;
      }
      /** setting this will set magFilter,minFilter and mipmapFilter all at once!  */
      get scaleMode() {
        return this._style.scaleMode;
      }
      /**
       * Refresh check for isPowerOfTwo texture based on size
       * @private
       */
      _refreshPOT() {
        this.isPowerOfTwo = isPow2(this.pixelWidth) && isPow2(this.pixelHeight);
      }
      static test(_resource) {
        throw new Error("Unimplemented");
      }
    };
    _TextureSource.defaultOptions = {
      resolution: 1,
      format: "bgra8unorm",
      alphaMode: "premultiply-alpha-on-upload",
      dimensions: "2d",
      viewDimension: "2d",
      arrayLayerCount: 1,
      mipLevelCount: 1,
      autoGenerateMipmaps: false,
      sampleCount: 1,
      antialias: false,
      autoGarbageCollect: false
    };
    TextureSource = _TextureSource;
  }
});

// client/node_modules/pixi.js/lib/maths/matrix/groupD8.mjs
function init() {
  for (let i2 = 0; i2 < 16; i2++) {
    const row = [];
    rotationCayley.push(row);
    for (let j2 = 0; j2 < 16; j2++) {
      const _ux = signum(ux[i2] * ux[j2] + vx[i2] * uy[j2]);
      const _uy = signum(uy[i2] * ux[j2] + vy[i2] * uy[j2]);
      const _vx = signum(ux[i2] * vx[j2] + vx[i2] * vy[j2]);
      const _vy = signum(uy[i2] * vx[j2] + vy[i2] * vy[j2]);
      for (let k2 = 0; k2 < 16; k2++) {
        if (ux[k2] === _ux && uy[k2] === _uy && vx[k2] === _vx && vy[k2] === _vy) {
          row.push(k2);
          break;
        }
      }
    }
  }
  for (let i2 = 0; i2 < 16; i2++) {
    const mat = new Matrix();
    mat.set(ux[i2], uy[i2], vx[i2], vy[i2], 0, 0);
    rotationMatrices.push(mat);
  }
}
var ux, uy, vx, vy, rotationCayley, rotationMatrices, signum, groupD8;
var init_groupD8 = __esm({
  "client/node_modules/pixi.js/lib/maths/matrix/groupD8.mjs"() {
    init_Matrix();
    ux = [1, 1, 0, -1, -1, -1, 0, 1, 1, 1, 0, -1, -1, -1, 0, 1];
    uy = [0, 1, 1, 1, 0, -1, -1, -1, 0, 1, 1, 1, 0, -1, -1, -1];
    vx = [0, -1, -1, -1, 0, 1, 1, 1, 0, 1, 1, 1, 0, -1, -1, -1];
    vy = [1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, 1, 1, 1, 0, -1];
    rotationCayley = [];
    rotationMatrices = [];
    signum = Math.sign;
    init();
    groupD8 = {
      /**
       * | Rotation | Direction |
       * |----------|-----------|
       * | 0°       | East      |
       * @group groupD8
       * @type {GD8Symmetry}
       */
      E: 0,
      /**
       * | Rotation | Direction |
       * |----------|-----------|
       * | 45°↻     | Southeast |
       * @group groupD8
       * @type {GD8Symmetry}
       */
      SE: 1,
      /**
       * | Rotation | Direction |
       * |----------|-----------|
       * | 90°↻     | South     |
       * @group groupD8
       * @type {GD8Symmetry}
       */
      S: 2,
      /**
       * | Rotation | Direction |
       * |----------|-----------|
       * | 135°↻    | Southwest |
       * @group groupD8
       * @type {GD8Symmetry}
       */
      SW: 3,
      /**
       * | Rotation | Direction |
       * |----------|-----------|
       * | 180°     | West      |
       * @group groupD8
       * @type {GD8Symmetry}
       */
      W: 4,
      /**
       * | Rotation    | Direction    |
       * |-------------|--------------|
       * | -135°/225°↻ | Northwest    |
       * @group groupD8
       * @type {GD8Symmetry}
       */
      NW: 5,
      /**
       * | Rotation    | Direction    |
       * |-------------|--------------|
       * | -90°/270°↻  | North        |
       * @group groupD8
       * @type {GD8Symmetry}
       */
      N: 6,
      /**
       * | Rotation    | Direction    |
       * |-------------|--------------|
       * | -45°/315°↻  | Northeast    |
       * @group groupD8
       * @type {GD8Symmetry}
       */
      NE: 7,
      /**
       * Reflection about Y-axis.
       * @group groupD8
       * @type {GD8Symmetry}
       */
      MIRROR_VERTICAL: 8,
      /**
       * Reflection about the main diagonal.
       * @group groupD8
       * @type {GD8Symmetry}
       */
      MAIN_DIAGONAL: 10,
      /**
       * Reflection about X-axis.
       * @group groupD8
       * @type {GD8Symmetry}
       */
      MIRROR_HORIZONTAL: 12,
      /**
       * Reflection about reverse diagonal.
       * @group groupD8
       * @type {GD8Symmetry}
       */
      REVERSE_DIAGONAL: 14,
      /**
       * @group groupD8
       * @param {GD8Symmetry} ind - sprite rotation angle.
       * @returns {GD8Symmetry} The X-component of the U-axis
       *    after rotating the axes.
       */
      uX: (ind) => ux[ind],
      /**
       * @group groupD8
       * @param {GD8Symmetry} ind - sprite rotation angle.
       * @returns {GD8Symmetry} The Y-component of the U-axis
       *    after rotating the axes.
       */
      uY: (ind) => uy[ind],
      /**
       * @group groupD8
       * @param {GD8Symmetry} ind - sprite rotation angle.
       * @returns {GD8Symmetry} The X-component of the V-axis
       *    after rotating the axes.
       */
      vX: (ind) => vx[ind],
      /**
       * @group groupD8
       * @param {GD8Symmetry} ind - sprite rotation angle.
       * @returns {GD8Symmetry} The Y-component of the V-axis
       *    after rotating the axes.
       */
      vY: (ind) => vy[ind],
      /**
       * @group groupD8
       * @param {GD8Symmetry} rotation - symmetry whose opposite
       *   is needed. Only rotations have opposite symmetries while
       *   reflections don't.
       * @returns {GD8Symmetry} The opposite symmetry of `rotation`
       */
      inv: (rotation) => {
        if (rotation & 8) {
          return rotation & 15;
        }
        return -rotation & 7;
      },
      /**
       * Composes the two D8 operations.
       *
       * Taking `^` as reflection:
       *
       * |       | E=0 | S=2 | W=4 | N=6 | E^=8 | S^=10 | W^=12 | N^=14 |
       * |-------|-----|-----|-----|-----|------|-------|-------|-------|
       * | E=0   | E   | S   | W   | N   | E^   | S^    | W^    | N^    |
       * | S=2   | S   | W   | N   | E   | S^   | W^    | N^    | E^    |
       * | W=4   | W   | N   | E   | S   | W^   | N^    | E^    | S^    |
       * | N=6   | N   | E   | S   | W   | N^   | E^    | S^    | W^    |
       * | E^=8  | E^  | N^  | W^  | S^  | E    | N     | W     | S     |
       * | S^=10 | S^  | E^  | N^  | W^  | S    | E     | N     | W     |
       * | W^=12 | W^  | S^  | E^  | N^  | W    | S     | E     | N     |
       * | N^=14 | N^  | W^  | S^  | E^  | N    | W     | S     | E     |
       *
       * [This is a Cayley table]{@link https://en.wikipedia.org/wiki/Cayley_table}
       * @group groupD8
       * @param {GD8Symmetry} rotationSecond - Second operation, which
       *   is the row in the above cayley table.
       * @param {GD8Symmetry} rotationFirst - First operation, which
       *   is the column in the above cayley table.
       * @returns {GD8Symmetry} Composed operation
       */
      add: (rotationSecond, rotationFirst) => rotationCayley[rotationSecond][rotationFirst],
      /**
       * Reverse of `add`.
       * @group groupD8
       * @param {GD8Symmetry} rotationSecond - Second operation
       * @param {GD8Symmetry} rotationFirst - First operation
       * @returns {GD8Symmetry} Result
       */
      sub: (rotationSecond, rotationFirst) => rotationCayley[rotationSecond][groupD8.inv(rotationFirst)],
      /**
       * Adds 180 degrees to rotation, which is a commutative
       * operation.
       * @group groupD8
       * @param {number} rotation - The number to rotate.
       * @returns {number} Rotated number
       */
      rotate180: (rotation) => rotation ^ 4,
      /**
       * Checks if the rotation angle is vertical, i.e. south
       * or north. It doesn't work for reflections.
       * @group groupD8
       * @param {GD8Symmetry} rotation - The number to check.
       * @returns {boolean} Whether or not the direction is vertical
       */
      isVertical: (rotation) => (rotation & 3) === 2,
      // rotation % 4 === 2
      /**
       * Approximates the vector `V(dx,dy)` into one of the
       * eight directions provided by `groupD8`.
       * @group groupD8
       * @param {number} dx - X-component of the vector
       * @param {number} dy - Y-component of the vector
       * @returns {GD8Symmetry} Approximation of the vector into
       *  one of the eight symmetries.
       */
      byDirection: (dx, dy) => {
        if (Math.abs(dx) * 2 <= Math.abs(dy)) {
          if (dy >= 0) {
            return groupD8.S;
          }
          return groupD8.N;
        } else if (Math.abs(dy) * 2 <= Math.abs(dx)) {
          if (dx > 0) {
            return groupD8.E;
          }
          return groupD8.W;
        } else if (dy > 0) {
          if (dx > 0) {
            return groupD8.SE;
          }
          return groupD8.SW;
        } else if (dx > 0) {
          return groupD8.NE;
        }
        return groupD8.NW;
      },
      /**
       * Helps sprite to compensate texture packer rotation.
       * @group groupD8
       * @param {Matrix} matrix - sprite world matrix
       * @param {GD8Symmetry} rotation - The rotation factor to use.
       * @param {number} tx - sprite anchoring
       * @param {number} ty - sprite anchoring
       * @param {number} dw - sprite width
       * @param {number} dh - sprite height
       */
      matrixAppendRotationInv: (matrix, rotation, tx = 0, ty = 0, dw = 0, dh = 0) => {
        const mat = rotationMatrices[groupD8.inv(rotation)];
        const a2 = mat.a;
        const b2 = mat.b;
        const c2 = mat.c;
        const d2 = mat.d;
        const finalTx = tx - Math.min(0, a2 * dw, c2 * dh, a2 * dw + c2 * dh);
        const finalTy = ty - Math.min(0, b2 * dw, d2 * dh, b2 * dw + d2 * dh);
        const a1 = matrix.a;
        const b1 = matrix.b;
        const c1 = matrix.c;
        const d1 = matrix.d;
        matrix.a = a2 * a1 + b2 * c1;
        matrix.b = a2 * b1 + b2 * d1;
        matrix.c = c2 * a1 + d2 * c1;
        matrix.d = c2 * b1 + d2 * d1;
        matrix.tx = finalTx * a1 + finalTy * c1 + matrix.tx;
        matrix.ty = finalTx * b1 + finalTy * d1 + matrix.ty;
      },
      /**
       * Transforms rectangle coordinates based on texture packer rotation.
       * Used when texture atlas pages are rotated and coordinates need to be adjusted.
       * @group groupD8
       * @param {RectangleLike} rect - Rectangle with original coordinates to transform
       * @param {RectangleLike} sourceFrame - Source texture frame (includes offset and dimensions)
       * @param {GD8Symmetry} rotation - The groupD8 rotation value
       * @param {Rectangle} out - Rectangle to store the result
       * @returns {Rectangle} Transformed coordinates (includes source frame offset)
       */
      transformRectCoords: (rect, sourceFrame, rotation, out) => {
        const { x: x2, y: y2, width, height } = rect;
        const { x: frameX, y: frameY, width: frameWidth, height: frameHeight } = sourceFrame;
        if (rotation === groupD8.E) {
          out.set(x2 + frameX, y2 + frameY, width, height);
          return out;
        } else if (rotation === groupD8.S) {
          return out.set(
            frameWidth - y2 - height + frameX,
            x2 + frameY,
            height,
            width
          );
        } else if (rotation === groupD8.W) {
          return out.set(
            frameWidth - x2 - width + frameX,
            frameHeight - y2 - height + frameY,
            width,
            height
          );
        } else if (rotation === groupD8.N) {
          return out.set(
            y2 + frameX,
            frameHeight - x2 - width + frameY,
            height,
            width
          );
        }
        return out.set(x2 + frameX, y2 + frameY, width, height);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/utils/misc/NOOP.mjs
var NOOP;
var init_NOOP = __esm({
  "client/node_modules/pixi.js/lib/utils/misc/NOOP.mjs"() {
    "use strict";
    NOOP = () => {
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/BufferImageSource.mjs
var BufferImageSource;
var init_BufferImageSource = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/BufferImageSource.mjs"() {
    init_Extensions();
    init_TextureSource();
    BufferImageSource = class extends TextureSource {
      constructor(options) {
        const buffer = options.resource || new Float32Array(options.width * options.height * 4);
        let format = options.format;
        if (!format) {
          if (buffer instanceof Float32Array) {
            format = "rgba32float";
          } else if (buffer instanceof Int32Array) {
            format = "rgba32uint";
          } else if (buffer instanceof Uint32Array) {
            format = "rgba32uint";
          } else if (buffer instanceof Int16Array) {
            format = "rgba16uint";
          } else if (buffer instanceof Uint16Array) {
            format = "rgba16uint";
          } else if (buffer instanceof Int8Array) {
            format = "bgra8unorm";
          } else {
            format = "bgra8unorm";
          }
        }
        super({
          ...options,
          resource: buffer,
          format
        });
        this.uploadMethodId = "buffer";
      }
      static test(resource) {
        return resource instanceof Int8Array || resource instanceof Uint8Array || resource instanceof Uint8ClampedArray || resource instanceof Int16Array || resource instanceof Uint16Array || resource instanceof Int32Array || resource instanceof Uint32Array || resource instanceof Float32Array;
      }
    };
    BufferImageSource.extension = ExtensionType.TextureSource;
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/TextureMatrix.mjs
var tempMat, TextureMatrix;
var init_TextureMatrix = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/TextureMatrix.mjs"() {
    init_Matrix();
    tempMat = new Matrix();
    TextureMatrix = class {
      /**
       * @param texture - observed texture
       * @param clampMargin - Changes frame clamping, 0.5 by default. Use -0.5 for extra border.
       */
      constructor(texture, clampMargin) {
        this.mapCoord = new Matrix();
        this.uClampFrame = new Float32Array(4);
        this.uClampOffset = new Float32Array(2);
        this._updateID = 0;
        this.clampOffset = 0;
        if (typeof clampMargin === "undefined") {
          this.clampMargin = texture.width < 10 ? 0 : 0.5;
        } else {
          this.clampMargin = clampMargin;
        }
        this.isSimple = false;
        this.texture = texture;
      }
      /** Texture property. */
      get texture() {
        return this._texture;
      }
      set texture(value) {
        if (this._texture !== value) {
          this._texture?.removeListener("update", this.update, this);
          this._texture = value;
          this._texture.addListener("update", this.update, this);
        }
        this.update();
      }
      /** Releases the observed texture, removing the `update` listener from it. */
      destroy() {
        this._texture?.removeListener("update", this.update, this);
        this._texture = null;
      }
      /**
       * Multiplies uvs array to transform
       * @param uvs - mesh uvs
       * @param [out=uvs] - output
       * @returns - output
       */
      multiplyUvs(uvs, out) {
        if (out === void 0) {
          out = uvs;
        }
        const mat = this.mapCoord;
        for (let i2 = 0; i2 < uvs.length; i2 += 2) {
          const x2 = uvs[i2];
          const y2 = uvs[i2 + 1];
          out[i2] = x2 * mat.a + y2 * mat.c + mat.tx;
          out[i2 + 1] = x2 * mat.b + y2 * mat.d + mat.ty;
        }
        return out;
      }
      /**
       * Updates matrices if texture was changed
       * @returns - whether or not it was updated
       */
      update() {
        const tex = this._texture;
        this._updateID++;
        const uvs = tex.uvs;
        this.mapCoord.set(uvs.x1 - uvs.x0, uvs.y1 - uvs.y0, uvs.x3 - uvs.x0, uvs.y3 - uvs.y0, uvs.x0, uvs.y0);
        const orig = tex.orig;
        const trim = tex.trim;
        if (trim) {
          tempMat.set(
            orig.width / trim.width,
            0,
            0,
            orig.height / trim.height,
            -trim.x / trim.width,
            -trim.y / trim.height
          );
          this.mapCoord.append(tempMat);
        }
        const texBase = tex.source;
        const frame = this.uClampFrame;
        const margin = this.clampMargin / texBase._resolution;
        const offset = this.clampOffset / texBase._resolution;
        frame[0] = (tex.frame.x + margin + offset) / texBase.width;
        frame[1] = (tex.frame.y + margin + offset) / texBase.height;
        frame[2] = (tex.frame.x + tex.frame.width - margin + offset) / texBase.width;
        frame[3] = (tex.frame.y + tex.frame.height - margin + offset) / texBase.height;
        this.uClampOffset[0] = this.clampOffset / texBase.pixelWidth;
        this.uClampOffset[1] = this.clampOffset / texBase.pixelHeight;
        this.isSimple = tex.frame.width === texBase.width && tex.frame.height === texBase.height && tex.rotate === 0;
        return true;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/Texture.mjs
var Texture;
var init_Texture = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/Texture.mjs"() {
    init_eventemitter3();
    init_groupD8();
    init_Rectangle();
    init_uid();
    init_deprecation();
    init_NOOP();
    init_BufferImageSource();
    init_TextureSource();
    init_TextureMatrix();
    Texture = class extends eventemitter3_default {
      /**
       * @param {TextureOptions} options - Options for the texture
       */
      constructor({
        source: source2,
        label,
        frame,
        orig,
        trim,
        defaultAnchor,
        defaultBorders,
        rotate: rotate2,
        dynamic
      } = {}) {
        super();
        this.uid = uid("texture");
        this.uvs = { x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0 };
        this.frame = new Rectangle();
        this.noFrame = false;
        this.dynamic = false;
        this.isTexture = true;
        this.label = label;
        this.source = source2?.source ?? new TextureSource();
        this.noFrame = !frame;
        if (frame) {
          this.frame.copyFrom(frame);
        } else {
          const { width, height } = this._source;
          this.frame.width = width;
          this.frame.height = height;
        }
        this.orig = orig || this.frame;
        this.trim = trim;
        this.rotate = rotate2 ?? 0;
        this.defaultAnchor = defaultAnchor;
        this.defaultBorders = defaultBorders;
        this.destroyed = false;
        this.dynamic = dynamic || false;
        this.updateUvs();
      }
      set source(value) {
        if (this._source) {
          this._source.off("resize", this.update, this);
        }
        this._source = value;
        value.on("resize", this.update, this);
        this.emit("update", this);
      }
      /** the underlying source of the texture (equivalent of baseTexture in v7) */
      get source() {
        return this._source;
      }
      /** returns a TextureMatrix instance for this texture. By default, that object is not created because its heavy. */
      get textureMatrix() {
        if (!this._textureMatrix) {
          this._textureMatrix = new TextureMatrix(this);
        }
        return this._textureMatrix;
      }
      /** The width of the Texture in pixels. */
      get width() {
        return this.orig.width;
      }
      /** The height of the Texture in pixels. */
      get height() {
        return this.orig.height;
      }
      /** Call this function when you have modified the frame of this texture. */
      updateUvs() {
        const { uvs, frame } = this;
        const { width, height } = this._source;
        const nX = frame.x / width;
        const nY = frame.y / height;
        const nW = frame.width / width;
        const nH = frame.height / height;
        let rotate2 = this.rotate;
        if (rotate2) {
          const w2 = nW / 2;
          const h2 = nH / 2;
          const cX = nX + w2;
          const cY = nY + h2;
          rotate2 = groupD8.add(rotate2, groupD8.NW);
          uvs.x0 = cX + w2 * groupD8.uX(rotate2);
          uvs.y0 = cY + h2 * groupD8.uY(rotate2);
          rotate2 = groupD8.add(rotate2, 2);
          uvs.x1 = cX + w2 * groupD8.uX(rotate2);
          uvs.y1 = cY + h2 * groupD8.uY(rotate2);
          rotate2 = groupD8.add(rotate2, 2);
          uvs.x2 = cX + w2 * groupD8.uX(rotate2);
          uvs.y2 = cY + h2 * groupD8.uY(rotate2);
          rotate2 = groupD8.add(rotate2, 2);
          uvs.x3 = cX + w2 * groupD8.uX(rotate2);
          uvs.y3 = cY + h2 * groupD8.uY(rotate2);
        } else {
          uvs.x0 = nX;
          uvs.y0 = nY;
          uvs.x1 = nX + nW;
          uvs.y1 = nY;
          uvs.x2 = nX + nW;
          uvs.y2 = nY + nH;
          uvs.x3 = nX;
          uvs.y3 = nY + nH;
        }
      }
      /**
       * Destroys this texture
       * @param destroySource - Destroy the source when the texture is destroyed.
       */
      destroy(destroySource = false) {
        if (this._source) {
          this._source.off("resize", this.update, this);
          if (destroySource) {
            this._source.destroy();
            this._source = null;
          }
        }
        this._textureMatrix = null;
        this.destroyed = true;
        this.emit("destroy", this);
        this.removeAllListeners();
      }
      /**
       * Call this if you have modified the `texture outside` of the constructor.
       *
       * If you have modified this texture's source, you must separately call `texture.source.update()` to see those changes.
       */
      update() {
        if (this.noFrame) {
          this.frame.width = this._source.width;
          this.frame.height = this._source.height;
        }
        this.updateUvs();
        this.emit("update", this);
      }
      /** @deprecated since 8.0.0 */
      get baseTexture() {
        deprecation(v8_0_0, "Texture.baseTexture is now Texture.source");
        return this._source;
      }
    };
    Texture.EMPTY = new Texture({
      label: "EMPTY",
      source: new TextureSource({
        label: "EMPTY"
      })
    });
    Texture.EMPTY.destroy = NOOP;
    Texture.WHITE = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array([255, 255, 255, 255]),
        width: 1,
        height: 1,
        alphaMode: "premultiply-alpha-on-upload",
        label: "WHITE"
      }),
      label: "WHITE"
    });
    Texture.WHITE.destroy = NOOP;
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/utils/ScreenSizeRegistry.mjs
var ScreenSizeRegistry;
var init_ScreenSizeRegistry = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/utils/ScreenSizeRegistry.mjs"() {
    "use strict";
    ScreenSizeRegistry = class {
      constructor() {
        this._screenSizes = /* @__PURE__ */ new Map();
        this._widths = [];
        this._heights = [];
      }
      /** The number of renderers with a registered screen. */
      get size() {
        return this._screenSizes.size;
      }
      /**
       * Registers, or updates, the screen size of a renderer.
       * @param rendererUid - The uid of the renderer, used to update or remove this screen later.
       * @param pixelWidth - The width of the screen in physical pixels.
       * @param pixelHeight - The height of the screen in physical pixels.
       * @returns `true` if this changed the registered screens, `false` if the size was already registered.
       */
      set(rendererUid, pixelWidth, pixelHeight) {
        const current = this._screenSizes.get(rendererUid);
        if (current && current.pixelWidth === pixelWidth && current.pixelHeight === pixelHeight) return false;
        this._screenSizes.set(rendererUid, { pixelWidth, pixelHeight });
        this._update();
        return true;
      }
      /**
       * Removes the screen of a renderer.
       * @param rendererUid - The uid the screen was registered with.
       * @returns `true` if a screen was removed, `false` if the renderer had none registered.
       */
      remove(rendererUid) {
        if (!this._screenSizes.delete(rendererUid)) return false;
        this._update();
        return true;
      }
      /**
       * The smallest registered screen width the request fits in.
       * @param pixelWidth - The requested width in physical pixels.
       * @returns The smallest live screen width that is at least `pixelWidth`, or `undefined` if none.
       */
      getFittingWidth(pixelWidth) {
        return this._getFittingAxis(pixelWidth, this._widths);
      }
      /**
       * The smallest registered screen height the request fits in.
       * @param pixelHeight - The requested height in physical pixels.
       * @returns The smallest live screen height that is at least `pixelHeight`, or `undefined` if none.
       */
      getFittingHeight(pixelHeight) {
        return this._getFittingAxis(pixelHeight, this._heights);
      }
      /**
       * Whether a live screen uses this width.
       * @param width - The width in physical pixels.
       */
      hasWidth(width) {
        return this._widths.includes(width);
      }
      /**
       * Whether a live screen uses this height.
       * @param height - The height in physical pixels.
       */
      hasHeight(height) {
        return this._heights.includes(height);
      }
      /**
       * The smallest registered screen on this axis that the request still fits in.
       * @param pixelSize - The requested size on this axis in physical pixels.
       * @param screenSizes - The live screen sizes on this axis, sorted ascending.
       * @returns The smallest screen size that is at least `pixelSize`, or `undefined` if none.
       */
      _getFittingAxis(pixelSize, screenSizes) {
        for (let i2 = 0; i2 < screenSizes.length; i2++) {
          const screenSize = screenSizes[i2];
          if (screenSize >= pixelSize) return screenSize;
        }
        return void 0;
      }
      /** Rebuilds the sorted unique sizes for each axis. */
      _update() {
        this._widths = [...this._screenSizes.values()].map((screenSize) => screenSize.pixelWidth).filter((width, i2, widths) => widths.indexOf(width) === i2).sort((a2, b2) => a2 - b2);
        this._heights = [...this._screenSizes.values()].map((screenSize) => screenSize.pixelHeight).filter((height, i2, heights) => heights.indexOf(height) === i2).sort((a2, b2) => a2 - b2);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/TexturePool.mjs
function formatId(format) {
  const id = formatIds[format];
  if (id !== void 0) return id;
  return formatIds[format] = nextFormatId++;
}
function bucketKey(width, height, antialias, autoGenerateMipmaps, format, scaleMode) {
  const packed = (width << 17) + (height << 2) + ((autoGenerateMipmaps ? 1 : 0) << 1) + (antialias ? 1 : 0);
  const scale = scaleMode === "nearest" ? 1 : 0;
  return packed + scale * scaleBit + formatId(format) * formatBit;
}
var count, maxKeyDimension, scaleBit, formatBit, formatIds, nextFormatId, TexturePoolClass, TexturePool;
var init_TexturePool = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/TexturePool.mjs"() {
    init_pow2();
    init_deprecation();
    init_warn();
    init_GlobalResourceRegistry();
    init_TextureSource();
    init_Texture();
    init_TextureStyle();
    init_ScreenSizeRegistry();
    count = 0;
    maxKeyDimension = 32767;
    scaleBit = 4294967296;
    formatBit = 8589934592;
    formatIds = /* @__PURE__ */ Object.create(null);
    nextFormatId = 0;
    TexturePoolClass = class {
      /**
       * @param textureOptions - options that will be passed to BaseRenderTexture constructor
       * @param {SCALE_MODE} [textureOptions.scaleMode] - See {@link SCALE_MODE} for possible values.
       */
      constructor(textureOptions) {
        this._buckets = /* @__PURE__ */ new Map();
        this._poolKey = /* @__PURE__ */ Object.create(null);
        this._poolStyle = /* @__PURE__ */ Object.create(null);
        this._screens = new ScreenSizeRegistry();
        this._enableFullScreen = false;
        this.textureOptions = textureOptions || {};
      }
      /**
       * A style built from the pool options. The pool no longer applies it to anything.
       * @deprecated since 8.21.0, pooled textures carry their own style; pass `scaleMode` in the request instead.
       */
      get textureStyle() {
        deprecation(v8_21_0, "TexturePool.textureStyle is no longer used, pooled textures carry their own style. Pass scaleMode in the request instead.");
        if (!this._textureStyle) this._textureStyle = new TextureStyle(this.textureOptions);
        return this._textureStyle;
      }
      set textureStyle(value) {
        deprecation(v8_21_0, "TexturePool.textureStyle is no longer used, pooled textures carry their own style. Pass scaleMode in the request instead.");
        this._textureStyle = value;
      }
      /**
       * Has no effect. The pool sizes textures to the screens registered with
       * {@link TexturePoolClass#setScreenSize|setScreenSize}.
       * @deprecated since 8.21.0
       */
      get enableFullScreen() {
        deprecation(v8_21_0, "TexturePool.enableFullScreen is no longer used, the pool sizes textures to the screens registered with setScreenSize.");
        return this._enableFullScreen;
      }
      set enableFullScreen(value) {
        deprecation(v8_21_0, "TexturePool.enableFullScreen is no longer used, the pool sizes textures to the screens registered with setScreenSize.");
        this._enableFullScreen = value;
      }
      createTexture(...args) {
        let options = args[0];
        if (typeof options === "number") {
          deprecation(v8_21_0, "TexturePool.createTexture params are now an options object. See params: { width, height, antialias, autoGenerateMipmaps }");
          options = {
            width: options,
            height: args[1],
            antialias: args[2] ?? false,
            autoGenerateMipmaps: args[3] ?? false
          };
        }
        const format = options.format ?? this.textureOptions.format ?? TextureSource.defaultOptions.format;
        const scaleMode = options.scaleMode ?? this.textureOptions.scaleMode ?? TextureStyle.defaultOptions.scaleMode;
        const textureSource = new TextureSource({
          ...this.textureOptions,
          width: options.width,
          height: options.height,
          resolution: 1,
          antialias: options.antialias ?? false,
          autoGarbageCollect: false,
          autoGenerateMipmaps: options.autoGenerateMipmaps ?? false,
          format,
          scaleMode
        });
        return new Texture({
          source: textureSource,
          label: `texturePool_${count++}`
        });
      }
      getOptimalTexture(...args) {
        let options = args[0];
        if (typeof options === "number") {
          deprecation(v8_21_0, "TexturePool.getOptimalTexture params are now an options object. See params: { width, height, resolution, antialias, autoGenerateMipmaps }");
          options = {
            width: options,
            height: args[1],
            resolution: args[2] ?? 1,
            antialias: args[3] ?? false,
            autoGenerateMipmaps: args[4] ?? false
          };
        }
        const frameWidth = options.width;
        const frameHeight = options.height;
        const resolution = options.resolution ?? 1;
        const antialias = options.antialias ?? false;
        const autoGenerateMipmaps = options.autoGenerateMipmaps ?? false;
        const format = options.format ?? this.textureOptions.format ?? TextureSource.defaultOptions.format;
        const scaleMode = options.scaleMode ?? this.textureOptions.scaleMode ?? TextureStyle.defaultOptions.scaleMode;
        const { width: textureWidth, height: textureHeight } = this.getOptimalSize(
          frameWidth,
          frameHeight,
          resolution
        );
        if (textureWidth > maxKeyDimension || textureHeight > maxKeyDimension) {
          warn(`TexturePool: ${textureWidth}x${textureHeight} is larger than the ${maxKeyDimension}px pool key limit, textures of this size may be pooled together`);
        }
        const key = bucketKey(textureWidth, textureHeight, antialias, autoGenerateMipmaps, format, scaleMode);
        let bucket = this._buckets.get(key);
        if (!bucket) {
          bucket = [];
          this._buckets.set(key, bucket);
        }
        let texture = bucket.pop();
        if (!texture) {
          texture = this.createTexture({
            width: textureWidth,
            height: textureHeight,
            antialias,
            autoGenerateMipmaps,
            format,
            scaleMode
          });
          this._poolStyle[texture.uid] = texture.source.style;
        }
        texture.source._resolution = resolution;
        texture.source.width = textureWidth / resolution;
        texture.source.height = textureHeight / resolution;
        texture.source.pixelWidth = textureWidth;
        texture.source.pixelHeight = textureHeight;
        texture.frame.x = 0;
        texture.frame.y = 0;
        texture.frame.width = frameWidth;
        texture.frame.height = frameHeight;
        texture.updateUvs();
        this._poolKey[texture.uid] = key;
        return texture;
      }
      /**
       * The backing size, in physical pixels, that {@link TexturePoolClass#getOptimalTexture|getOptimalTexture}
       * would allocate for a request, without taking a texture from the pool.
       *
       * Each axis is the next power of two, or the smallest registered screen the request fits inside
       * (see {@link TexturePoolClass#setScreenSize|setScreenSize}). Use it when a consumer needs to know
       * where a request's content will sit inside its pooled texture before it has one, such as a uniform
       * that maps content space onto texture space.
       * @param frameWidth - The minimum width of the texture.
       * @param frameHeight - The minimum height of the texture.
       * @param resolution - The resolution of the texture.
       * @returns The width and height the pooled texture would have, in physical pixels.
       */
      getOptimalSize(frameWidth, frameHeight, resolution = 1) {
        const pixelWidth = Math.ceil(frameWidth * resolution - 1e-6);
        const pixelHeight = Math.ceil(frameHeight * resolution - 1e-6);
        const po2Width = nextPow2(pixelWidth);
        const screenWidth = this._screens.getFittingWidth(pixelWidth);
        const po2Height = nextPow2(pixelHeight);
        const screenHeight = this._screens.getFittingHeight(pixelHeight);
        return {
          width: screenWidth !== void 0 ? Math.min(screenWidth, po2Width) : po2Width,
          height: screenHeight !== void 0 ? Math.min(screenHeight, po2Height) : po2Height
        };
      }
      /**
       * Gets a pooled texture matching the dimensions and resolution of the given texture.
       *
       * This is a convenience wrapper around {@link TexturePoolClass#getOptimalTexture|getOptimalTexture}
       * that copies width, height, and resolution from an existing texture. Useful when a filter needs
       * a temporary texture the same size as its input (e.g., for multi-pass blur).
       * @param texture - The texture whose dimensions to match.
       * @param antialias - Whether to use antialias on the pooled texture. Defaults to `false`.
       * @returns A pooled texture with power-of-two or screen sized backing dimensions at the source resolution.
       */
      getSameSizeTexture(texture, antialias = false) {
        const source2 = texture.source;
        return this.getOptimalTexture({
          width: texture.width,
          height: texture.height,
          resolution: source2._resolution,
          antialias
        });
      }
      /**
       * Returns a texture to the pool so it can be reused by future
       * {@link TexturePoolClass#getOptimalTexture|getOptimalTexture}
       * or {@link TexturePoolClass#getSameSizeTexture|getSameSizeTexture} calls.
       *
       * If you gave the texture a style of your own after obtaining it (a different address mode, anisotropy
       * or similar), pass `resetStyle = true` so the pool puts its own style back. Otherwise your style stays
       * on the texture and the next consumer inherits it.
       * @param renderTexture - The texture to return to the pool.
       * @param resetStyle - When `true`, restores the style the pool created for this texture. Defaults to `false`.
       */
      returnTexture(renderTexture, resetStyle = false) {
        const uid2 = renderTexture.uid;
        const key = this._poolKey[uid2];
        if (key === void 0) {
          warn("TexturePool: returnTexture was passed a texture that did not come from this pool, ignoring it");
          return;
        }
        const poolStyle = this._poolStyle[uid2];
        if (resetStyle && renderTexture.source.style !== poolStyle) {
          renderTexture.source.style = poolStyle;
        }
        const textures = this._buckets.get(key);
        if (!textures) {
          delete this._poolKey[uid2];
          delete this._poolStyle[uid2];
          renderTexture.destroy(true);
          return;
        }
        textures.push(renderTexture);
      }
      /**
       * Registers the screen size of a renderer with the pool, in physical pixels.
       *
       * While a screen is registered, a request that fits inside it on an axis is given that screen's size on
       * that axis instead of the next power of two, which stops a full screen filter from allocating a texture
       * far larger than the screen. Requests larger than every registered screen on an axis keep the power of
       * two size - the pool never rounds a request up to a screen it does not fit in.
       * @param rendererUid - The uid of the renderer, used to update or remove this screen later.
       * @param pixelWidth - The width of the screen in physical pixels.
       * @param pixelHeight - The height of the screen in physical pixels.
       */
      setScreenSize(rendererUid, pixelWidth, pixelHeight) {
        if (!this._screens.set(rendererUid, pixelWidth, pixelHeight)) return;
        this._pruneScreenTextures();
      }
      /**
       * Removes a screen previously registered with
       * {@link TexturePoolClass#setScreenSize|setScreenSize}, destroying any idle textures that were
       * only being kept for it.
       * @param rendererUid - The uid the screen was registered with.
       */
      removeScreen(rendererUid) {
        if (!this._screens.remove(rendererUid)) return;
        this._pruneScreenTextures();
      }
      /**
       * Destroys the idle textures in every bucket that has a non power of two dimension matching no live
       * screen. Power of two buckets are always kept, as any request can fall back to them.
       */
      _pruneScreenTextures() {
        for (const [key, textures] of this._buckets) {
          const packed = key >>> 0;
          const width = packed >>> 17;
          const height = packed >>> 2 & 32767;
          if ((isPow2(width) || this._screens.hasWidth(width)) && (isPow2(height) || this._screens.hasHeight(height))) continue;
          this._dropTextures(textures, true);
          this._buckets.delete(key);
        }
      }
      /**
       * Forgets idle textures were ever handed out, so a later return is ignored, and optionally destroys them.
       * @param textures - The textures of one bucket.
       * @param destroy - Whether to destroy the textures as well.
       */
      _dropTextures(textures, destroy) {
        for (let i2 = 0; i2 < textures.length; i2++) {
          const texture = textures[i2];
          delete this._poolKey[texture.uid];
          delete this._poolStyle[texture.uid];
          if (destroy) texture.destroy(true);
        }
      }
      /**
       * Clears the pool.
       * @param destroyTextures - Destroy all stored textures.
       */
      clear(destroyTextures) {
        for (const textures of this._buckets.values()) {
          this._dropTextures(textures, destroyTextures !== false);
        }
        this._buckets.clear();
      }
    };
    TexturePool = new TexturePoolClass();
    GlobalResourceRegistry.register(TexturePool);
  }
});

// client/node_modules/pixi.js/lib/scene/container/RenderGroup.mjs
var RenderGroup;
var init_RenderGroup = __esm({
  "client/node_modules/pixi.js/lib/scene/container/RenderGroup.mjs"() {
    init_Matrix();
    init_InstructionSet();
    init_TexturePool();
    RenderGroup = class {
      constructor() {
        this.renderPipeId = "renderGroup";
        this.root = null;
        this.canBundle = false;
        this.renderGroupParent = null;
        this.renderGroupChildren = [];
        this.worldTransform = new Matrix();
        this.worldColorAlpha = 4294967295;
        this.worldColor = 16777215;
        this.worldAlpha = 1;
        this.childrenToUpdate = /* @__PURE__ */ Object.create(null);
        this.updateTick = 0;
        this.gcTick = 0;
        this.childrenRenderablesToUpdate = { list: [], index: 0 };
        this.structureDidChange = true;
        this.instructionSet = new InstructionSet();
        this._onRenderContainers = [];
        this.textureNeedsUpdate = true;
        this.isCachedAsTexture = false;
        this._matrixDirty = 7;
      }
      init(root) {
        this.root = root;
        if (root._onRender) this.addOnRender(root);
        root.didChange = true;
        const children = root.children;
        for (let i2 = 0; i2 < children.length; i2++) {
          const child = children[i2];
          child._updateFlags = 15;
          this.addChild(child);
        }
      }
      enableCacheAsTexture(options = {}) {
        this.textureOptions = options;
        this.isCachedAsTexture = true;
        this.textureNeedsUpdate = true;
      }
      disableCacheAsTexture() {
        this.isCachedAsTexture = false;
        if (this.texture) {
          TexturePool.returnTexture(this.texture);
          this.texture = null;
        }
      }
      updateCacheTexture() {
        this.textureNeedsUpdate = true;
        const cachedParent = this._parentCacheAsTextureRenderGroup;
        if (cachedParent && !cachedParent.textureNeedsUpdate) {
          cachedParent.updateCacheTexture();
        }
      }
      reset() {
        this.renderGroupChildren.length = 0;
        for (const i2 in this.childrenToUpdate) {
          const childrenAtDepth = this.childrenToUpdate[i2];
          childrenAtDepth.list.fill(null);
          childrenAtDepth.index = 0;
        }
        this.childrenRenderablesToUpdate.index = 0;
        this.childrenRenderablesToUpdate.list.fill(null);
        this.root = null;
        this.updateTick = 0;
        this.structureDidChange = true;
        this._onRenderContainers.length = 0;
        this.renderGroupParent = null;
        this.disableCacheAsTexture();
      }
      get localTransform() {
        return this.root.localTransform;
      }
      addRenderGroupChild(renderGroupChild) {
        if (renderGroupChild.renderGroupParent) {
          renderGroupChild.renderGroupParent._removeRenderGroupChild(renderGroupChild);
        }
        renderGroupChild.renderGroupParent = this;
        this.renderGroupChildren.push(renderGroupChild);
      }
      _removeRenderGroupChild(renderGroupChild) {
        const index = this.renderGroupChildren.indexOf(renderGroupChild);
        if (index > -1) {
          this.renderGroupChildren.splice(index, 1);
        }
        renderGroupChild.renderGroupParent = null;
      }
      addChild(child) {
        this.structureDidChange = true;
        child.parentRenderGroup = this;
        child.updateTick = -1;
        if (child.parent === this.root) {
          child.relativeRenderGroupDepth = 1;
        } else {
          child.relativeRenderGroupDepth = child.parent.relativeRenderGroupDepth + 1;
        }
        child.didChange = true;
        this.onChildUpdate(child);
        if (child.renderGroup) {
          this.addRenderGroupChild(child.renderGroup);
          return;
        }
        if (child._onRender) this.addOnRender(child);
        const children = child.children;
        for (let i2 = 0; i2 < children.length; i2++) {
          this.addChild(children[i2]);
        }
      }
      removeChild(child) {
        this.structureDidChange = true;
        if (child._onRender) {
          if (!child.renderGroup) {
            this.removeOnRender(child);
          }
        }
        child.parentRenderGroup = null;
        if (child.renderGroup) {
          this._removeRenderGroupChild(child.renderGroup);
          return;
        }
        const children = child.children;
        for (let i2 = 0; i2 < children.length; i2++) {
          this.removeChild(children[i2]);
        }
      }
      removeChildren(children) {
        for (let i2 = 0; i2 < children.length; i2++) {
          this.removeChild(children[i2]);
        }
      }
      onChildUpdate(child) {
        let childrenToUpdate = this.childrenToUpdate[child.relativeRenderGroupDepth];
        if (!childrenToUpdate) {
          childrenToUpdate = this.childrenToUpdate[child.relativeRenderGroupDepth] = {
            index: 0,
            list: []
          };
        }
        childrenToUpdate.list[childrenToUpdate.index++] = child;
      }
      updateRenderable(renderable) {
        if (renderable.globalDisplayStatus < 7) return;
        this.instructionSet.renderPipes[renderable.renderPipeId].updateRenderable(renderable);
        renderable.didViewUpdate = false;
      }
      onChildViewUpdate(child) {
        this.childrenRenderablesToUpdate.list[this.childrenRenderablesToUpdate.index++] = child;
      }
      get isRenderable() {
        return this.root.localDisplayStatus === 7 && this.worldAlpha > 0;
      }
      /**
       * adding a container to the onRender list will make sure the user function
       * passed in to the user defined 'onRender` callBack
       * @param container - the container to add to the onRender list
       */
      addOnRender(container) {
        if (this._onRenderContainers.indexOf(container) === -1) {
          this._onRenderContainers.push(container);
        }
      }
      removeOnRender(container) {
        const idx = this._onRenderContainers.indexOf(container);
        if (idx !== -1) this._onRenderContainers.splice(idx, 1);
      }
      runOnRender(renderer) {
        for (let i2 = 0; i2 < this._onRenderContainers.length; i2++) {
          this._onRenderContainers[i2]._onRender(renderer);
        }
      }
      destroy() {
        this.disableCacheAsTexture();
        this.renderGroupParent = null;
        this.root = null;
        this.childrenRenderablesToUpdate = null;
        this.childrenToUpdate = null;
        this.renderGroupChildren = null;
        this._onRenderContainers = null;
        this.instructionSet?.destroy();
        this.instructionSet = null;
      }
      getChildren(out = []) {
        const children = this.root.children;
        for (let i2 = 0; i2 < children.length; i2++) {
          this._getChildren(children[i2], out);
        }
        return out;
      }
      _getChildren(container, out = []) {
        out.push(container);
        if (container.renderGroup) return out;
        const children = container.children;
        for (let i2 = 0; i2 < children.length; i2++) {
          this._getChildren(children[i2], out);
        }
        return out;
      }
      invalidateMatrices() {
        this._matrixDirty = 7;
      }
      /**
       * Returns the inverse of the world transform matrix.
       * @returns {Matrix} The inverse of the world transform matrix.
       */
      get inverseWorldTransform() {
        if ((this._matrixDirty & 1) === 0) return this._inverseWorldTransform;
        this._matrixDirty &= ~1;
        this._inverseWorldTransform || (this._inverseWorldTransform = new Matrix());
        return this._inverseWorldTransform.copyFrom(this.worldTransform).invert();
      }
      /**
       * Returns the inverse of the texture offset transform matrix.
       * @returns {Matrix} The inverse of the texture offset transform matrix.
       */
      get textureOffsetInverseTransform() {
        if ((this._matrixDirty & 2) === 0) return this._textureOffsetInverseTransform;
        this._matrixDirty &= ~2;
        this._textureOffsetInverseTransform || (this._textureOffsetInverseTransform = new Matrix());
        return this._textureOffsetInverseTransform.copyFrom(this.inverseWorldTransform).translate(
          -this._textureBounds.x,
          -this._textureBounds.y
        );
      }
      /**
       * Returns the inverse of the parent texture transform matrix.
       * This is used to properly transform coordinates when rendering into cached textures.
       * @returns {Matrix} The inverse of the parent texture transform matrix.
       */
      get inverseParentTextureTransform() {
        if ((this._matrixDirty & 4) === 0) return this._inverseParentTextureTransform;
        this._matrixDirty &= ~4;
        const parentCacheAsTexture = this._parentCacheAsTextureRenderGroup;
        if (parentCacheAsTexture) {
          this._inverseParentTextureTransform || (this._inverseParentTextureTransform = new Matrix());
          return this._inverseParentTextureTransform.copyFrom(this.worldTransform).prepend(parentCacheAsTexture.inverseWorldTransform).translate(
            -parentCacheAsTexture._textureBounds.x,
            -parentCacheAsTexture._textureBounds.y
          );
        }
        return this.worldTransform;
      }
      /**
       * Returns a matrix that transforms coordinates to the correct coordinate space of the texture being rendered to.
       * This is the texture offset inverse transform of the closest parent RenderGroup that is cached as a texture.
       * @returns {Matrix | null} The transform matrix for the cached texture coordinate space,
       * or null if no parent is cached as texture.
       */
      get cacheToLocalTransform() {
        if (this.isCachedAsTexture) {
          return this.textureOffsetInverseTransform;
        }
        if (!this._parentCacheAsTextureRenderGroup) return null;
        return this._parentCacheAsTextureRenderGroup.textureOffsetInverseTransform;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/scene/container/utils/assignWithIgnore.mjs
function assignWithIgnore(target, options, ignore = {}) {
  for (const key in options) {
    if (!ignore[key] && options[key] !== void 0) {
      target[key] = options[key];
    }
  }
}
var init_assignWithIgnore = __esm({
  "client/node_modules/pixi.js/lib/scene/container/utils/assignWithIgnore.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/scene/container/Container.mjs
var defaultSkew, defaultPivot, defaultScale, defaultOrigin, UPDATE_COLOR, UPDATE_BLEND, UPDATE_VISIBLE, Container;
var init_Container = __esm({
  "client/node_modules/pixi.js/lib/scene/container/Container.mjs"() {
    init_eventemitter3();
    init_Color();
    init_cullingMixin();
    init_Extensions();
    init_Matrix();
    init_const();
    init_ObservablePoint();
    init_uid();
    init_deprecation();
    init_warn();
    init_PoolGroup();
    init_cacheAsTextureMixin();
    init_childrenHelperMixin();
    init_collectRenderablesMixin();
    init_effectsMixin();
    init_findMixin();
    init_getFastGlobalBoundsMixin();
    init_getGlobalMixin();
    init_measureMixin();
    init_onRenderMixin();
    init_sortMixin();
    init_toLocalGlobalMixin();
    init_RenderGroup();
    init_assignWithIgnore();
    defaultSkew = new ObservablePoint(null);
    defaultPivot = new ObservablePoint(null);
    defaultScale = new ObservablePoint(null, 1, 1);
    defaultOrigin = new ObservablePoint(null);
    UPDATE_COLOR = 1;
    UPDATE_BLEND = 2;
    UPDATE_VISIBLE = 4;
    Container = class _Container extends eventemitter3_default {
      constructor(options = {}) {
        super();
        this.uid = uid("renderable");
        this._updateFlags = 15;
        this.renderGroup = null;
        this.parentRenderGroup = null;
        this.parentRenderGroupIndex = 0;
        this.didChange = false;
        this.didViewUpdate = false;
        this.relativeRenderGroupDepth = 0;
        this.children = [];
        this.parent = null;
        this.includeInBuild = true;
        this.measurable = true;
        this.isSimple = true;
        this.parentRenderLayer = null;
        this.updateTick = -1;
        this.localTransform = new Matrix();
        this.relativeGroupTransform = new Matrix();
        this.groupTransform = this.relativeGroupTransform;
        this.destroyed = false;
        this._position = new ObservablePoint(this, 0, 0);
        this._scale = defaultScale;
        this._pivot = defaultPivot;
        this._origin = defaultOrigin;
        this._skew = defaultSkew;
        this._cx = 1;
        this._sx = 0;
        this._cy = 0;
        this._sy = 1;
        this._rotation = 0;
        this.localColor = 16777215;
        this.localAlpha = 1;
        this.groupAlpha = 1;
        this.groupColor = 16777215;
        this.groupColorAlpha = 4294967295;
        this.localBlendMode = "inherit";
        this.groupBlendMode = "normal";
        this.localDisplayStatus = 7;
        this.globalDisplayStatus = 7;
        this._didContainerChangeTick = 0;
        this._didViewChangeTick = 0;
        this._didLocalTransformChangeId = -1;
        this.effects = [];
        assignWithIgnore(this, options, {
          children: true,
          parent: true,
          effects: true
        });
        options.children?.forEach((child) => this.addChild(child));
        options.parent?.addChild(this);
      }
      /**
       * Mixes all enumerable properties and methods from a source object to Container.
       * @param source - The source of properties and methods to mix in.
       * @deprecated since 8.8.0
       */
      static mixin(source2) {
        deprecation("8.8.0", "Container.mixin is deprecated, please use extensions.mixin instead.");
        extensions.mixin(_Container, source2);
      }
      // = 'default';
      /**
       * We now use the _didContainerChangeTick and _didViewChangeTick to track changes
       * @deprecated since 8.2.6
       * @ignore
       */
      set _didChangeId(value) {
        this._didViewChangeTick = value >> 12 & 4095;
        this._didContainerChangeTick = value & 4095;
      }
      /** @ignore */
      get _didChangeId() {
        return this._didContainerChangeTick & 4095 | (this._didViewChangeTick & 4095) << 12;
      }
      /**
       * Adds one or more children to the container.
       * The children will be rendered as part of this container's display list.
       * @example
       * ```ts
       * // Add a single child
       * container.addChild(sprite);
       *
       * // Add multiple children
       * container.addChild(background, player, foreground);
       *
       * // Add with type checking
       * const sprite = container.addChild<Sprite>(new Sprite(texture));
       * sprite.tint = 'red';
       * ```
       * @param children - The Container(s) to add to the container
       * @returns The first child that was added
       * @see {@link Container#removeChild} For removing children
       * @see {@link Container#addChildAt} For adding at specific index
       */
      addChild(...children) {
        if (!this.allowChildren) {
          deprecation(v8_0_0, "addChild: Only Containers will be allowed to add children in v8.0.0");
        }
        if (children.length > 1) {
          for (let i2 = 0; i2 < children.length; i2++) {
            this.addChild(children[i2]);
          }
          return children[0];
        }
        const child = children[0];
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        if (child.parent === this) {
          this.children.splice(this.children.indexOf(child), 1);
          this.children.push(child);
          if (renderGroup) {
            renderGroup.structureDidChange = true;
          }
          return child;
        }
        if (child.parent) {
          child.parent.removeChild(child);
        }
        this.children.push(child);
        if (this.sortableChildren) this.sortDirty = true;
        child.parent = this;
        child.didChange = true;
        child._updateFlags = 15;
        if (renderGroup) {
          renderGroup.addChild(child);
        }
        this.emit("childAdded", child, this, this.children.length - 1);
        child.emit("added", this);
        this._didViewChangeTick++;
        if (child._zIndex !== 0) {
          child.depthOfChildModified();
        }
        return child;
      }
      /**
       * Removes one or more children from the container.
       * When removing multiple children, events will be triggered for each child in sequence.
       * @example
       * ```ts
       * // Remove a single child
       * const removed = container.removeChild(sprite);
       *
       * // Remove multiple children
       * const bg = container.removeChild(background, player, userInterface);
       *
       * // Remove with type checking
       * const sprite = container.removeChild<Sprite>(childSprite);
       * sprite.texture = newTexture;
       * ```
       * @param children - The Container(s) to remove
       * @returns The first child that was removed
       * @see {@link Container#addChild} For adding children
       * @see {@link Container#removeChildren} For removing multiple children
       */
      removeChild(...children) {
        if (children.length > 1) {
          for (let i2 = 0; i2 < children.length; i2++) {
            this.removeChild(children[i2]);
          }
          return children[0];
        }
        const child = children[0];
        const index = this.children.indexOf(child);
        if (index > -1) {
          this._didViewChangeTick++;
          this.children.splice(index, 1);
          if (this.renderGroup) {
            this.renderGroup.removeChild(child);
          } else if (this.parentRenderGroup) {
            this.parentRenderGroup.removeChild(child);
          }
          if (child.parentRenderLayer) {
            child.parentRenderLayer.detach(child);
          }
          child.parent = null;
          this.emit("childRemoved", child, this, index);
          child.emit("removed", this);
        }
        return child;
      }
      /** @ignore */
      _onUpdate(point) {
        if (point) {
          if (point === this._skew) {
            this._updateSkew();
          }
        }
        this._didContainerChangeTick++;
        if (this.didChange) return;
        this.didChange = true;
        if (this.parentRenderGroup) {
          this.parentRenderGroup.onChildUpdate(this);
        }
      }
      set isRenderGroup(value) {
        if (!!this.renderGroup === value) return;
        if (value) {
          this.enableRenderGroup();
        } else {
          this.disableRenderGroup();
        }
      }
      /**
       * Returns true if this container is a render group.
       * This means that it will be rendered as a separate pass, with its own set of instructions
       * @advanced
       */
      get isRenderGroup() {
        return !!this.renderGroup;
      }
      /**
       * Calling this enables a render group for this container.
       * This means it will be rendered as a separate set of instructions.
       * The transform of the container will also be handled on the GPU rather than the CPU.
       * @advanced
       */
      enableRenderGroup() {
        if (this.renderGroup) return;
        const parentRenderGroup = this.parentRenderGroup;
        parentRenderGroup?.removeChild(this);
        this.renderGroup = BigPool.get(RenderGroup, this);
        this.groupTransform = Matrix.IDENTITY;
        parentRenderGroup?.addChild(this);
        this._updateIsSimple();
      }
      /**
       * This will disable the render group for this container.
       * @advanced
       */
      disableRenderGroup() {
        if (!this.renderGroup) return;
        const parentRenderGroup = this.parentRenderGroup;
        parentRenderGroup?.removeChild(this);
        BigPool.return(this.renderGroup);
        this.renderGroup = null;
        this.groupTransform = this.relativeGroupTransform;
        parentRenderGroup?.addChild(this);
        this._updateIsSimple();
      }
      /** @ignore */
      _updateIsSimple() {
        this.isSimple = !this.renderGroup && this.effects.length === 0;
      }
      /**
       * Current transform of the object based on world (parent) factors.
       *
       * This matrix represents the absolute transformation in the scene graph.
       * @example
       * ```ts
       * // Get world position
       * const worldPos = container.worldTransform;
       * console.log(`World position: (${worldPos.tx}, ${worldPos.ty})`);
       * ```
       * @readonly
       * @see {@link Container#localTransform} For local space transform
       */
      get worldTransform() {
        this._worldTransform || (this._worldTransform = new Matrix());
        if (this.renderGroup) {
          this._worldTransform.copyFrom(this.renderGroup.worldTransform);
        } else if (this.parentRenderGroup) {
          this._worldTransform.appendFrom(this.relativeGroupTransform, this.parentRenderGroup.worldTransform);
        }
        return this._worldTransform;
      }
      /**
       * The position of the container on the x axis relative to the local coordinates of the parent.
       *
       * An alias to position.x
       * @example
       * ```ts
       * // Basic position
       * container.x = 100;
       * ```
       */
      get x() {
        return this._position.x;
      }
      set x(value) {
        this._position.x = value;
      }
      /**
       * The position of the container on the y axis relative to the local coordinates of the parent.
       *
       * An alias to position.y
       * @example
       * ```ts
       * // Basic position
       * container.y = 200;
       * ```
       */
      get y() {
        return this._position.y;
      }
      set y(value) {
        this._position.y = value;
      }
      /**
       * The coordinate of the object relative to the local coordinates of the parent.
       * @example
       * ```ts
       * // Basic position setting
       * container.position.set(100, 200);
       * container.position.set(100); // Sets both x and y to 100
       * // Using point data
       * container.position = { x: 50, y: 75 };
       * ```
       * @since 4.0.0
       */
      get position() {
        return this._position;
      }
      set position(value) {
        this._position.copyFrom(value);
      }
      /**
       * The rotation of the object in radians.
       *
       * > [!NOTE] 'rotation' and 'angle' have the same effect on a display object;
       * > rotation is in radians, angle is in degrees.
       * @example
       * ```ts
       * // Basic rotation
       * container.rotation = Math.PI / 4; // 45 degrees
       *
       * // Convert from degrees
       * const degrees = 45;
       * container.rotation = degrees * Math.PI / 180;
       *
       * // Rotate around center
       * container.pivot.set(container.width / 2, container.height / 2);
       * container.rotation = Math.PI; // 180 degrees
       *
       * // Rotate around center with origin
       * container.origin.set(container.width / 2, container.height / 2);
       * container.rotation = Math.PI; // 180 degrees
       * ```
       */
      get rotation() {
        return this._rotation;
      }
      set rotation(value) {
        if (this._rotation !== value) {
          this._rotation = value;
          this._onUpdate(this._skew);
        }
      }
      /**
       * The angle of the object in degrees.
       *
       * > [!NOTE] 'rotation' and 'angle' have the same effect on a display object;
       * > rotation is in radians, angle is in degrees.
       * @example
       * ```ts
       * // Basic angle rotation
       * sprite.angle = 45; // 45 degrees
       *
       * // Rotate around center
       * sprite.pivot.set(sprite.width / 2, sprite.height / 2);
       * sprite.angle = 180; // Half rotation
       *
       * // Rotate around center with origin
       * sprite.origin.set(sprite.width / 2, sprite.height / 2);
       * sprite.angle = 180; // Half rotation
       *
       * // Reset rotation
       * sprite.angle = 0;
       * ```
       */
      get angle() {
        return this.rotation * RAD_TO_DEG;
      }
      set angle(value) {
        this.rotation = value * DEG_TO_RAD;
      }
      /**
       * The center of rotation, scaling, and skewing for this display object in its local space.
       * The `position` is the projection of `pivot` in the parent's local space.
       *
       * By default, the pivot is the origin (0, 0).
       * @example
       * ```ts
       * // Rotate around center
       * container.pivot.set(container.width / 2, container.height / 2);
       * container.rotation = Math.PI; // Rotates around center
       * ```
       * @since 4.0.0
       */
      get pivot() {
        if (this._pivot === defaultPivot) {
          this._pivot = new ObservablePoint(this, 0, 0);
        }
        return this._pivot;
      }
      set pivot(value) {
        if (this._pivot === defaultPivot) {
          this._pivot = new ObservablePoint(this, 0, 0);
          if (this._origin !== defaultOrigin) {
            warn(`Setting both a pivot and origin on a Container is not recommended. This can lead to unexpected behavior if not handled carefully.`);
          }
        }
        typeof value === "number" ? this._pivot.set(value) : this._pivot.copyFrom(value);
      }
      /**
       * The skew factor for the object in radians. Skewing is a transformation that distorts
       * the object by rotating it differently at each point, creating a non-uniform shape.
       * @example
       * ```ts
       * // Basic skewing
       * container.skew.set(0.5, 0); // Skew horizontally
       * container.skew.set(0, 0.5); // Skew vertically
       *
       * // Skew with point data
       * container.skew = { x: 0.3, y: 0.3 }; // Diagonal skew
       *
       * // Reset skew
       * container.skew.set(0, 0);
       *
       * // Animate skew
       * app.ticker.add(() => {
       *     // Create wave effect
       *     container.skew.x = Math.sin(Date.now() / 1000) * 0.3;
       * });
       *
       * // Combine with rotation
       * container.rotation = Math.PI / 4; // 45 degrees
       * container.skew.set(0.2, 0.2); // Skew the rotated object
       * ```
       * @since 4.0.0
       * @type {ObservablePoint} Point-like object with x/y properties in radians
       * @default {x: 0, y: 0}
       */
      get skew() {
        if (this._skew === defaultSkew) {
          this._skew = new ObservablePoint(this, 0, 0);
        }
        return this._skew;
      }
      set skew(value) {
        if (this._skew === defaultSkew) {
          this._skew = new ObservablePoint(this, 0, 0);
        }
        this._skew.copyFrom(value);
      }
      /**
       * The scale factors of this object along the local coordinate axes.
       *
       * The default scale is (1, 1).
       * @example
       * ```ts
       * // Basic scaling
       * container.scale.set(2, 2); // Scales to double size
       * container.scale.set(2); // Scales uniformly to double size
       * container.scale = 2; // Scales uniformly to double size
       * // Scale to a specific width and height
       * container.setSize(200, 100); // Sets width to 200 and height to 100
       * ```
       * @since 4.0.0
       */
      get scale() {
        if (this._scale === defaultScale) {
          this._scale = new ObservablePoint(this, 1, 1);
        }
        return this._scale;
      }
      set scale(value) {
        if (this._scale === defaultScale) {
          this._scale = new ObservablePoint(this, 0, 0);
        }
        if (typeof value === "string") {
          value = parseFloat(value);
        }
        typeof value === "number" ? this._scale.set(value) : this._scale.copyFrom(value);
      }
      /**
       * @experimental
       * The origin point around which the container rotates and scales without affecting its position.
       * Unlike pivot, changing the origin will not move the container's position.
       * @example
       * ```ts
       * // Rotate around center point
       * container.origin.set(container.width / 2, container.height / 2);
       * container.rotation = Math.PI; // Rotates around center
       *
       * // Reset origin
       * container.origin.set(0, 0);
       * ```
       */
      get origin() {
        if (this._origin === defaultOrigin) {
          this._origin = new ObservablePoint(this, 0, 0);
        }
        return this._origin;
      }
      set origin(value) {
        if (this._origin === defaultOrigin) {
          this._origin = new ObservablePoint(this, 0, 0);
          if (this._pivot !== defaultPivot) {
            warn(`Setting both a pivot and origin on a Container is not recommended. This can lead to unexpected behavior if not handled carefully.`);
          }
        }
        typeof value === "number" ? this._origin.set(value) : this._origin.copyFrom(value);
      }
      /**
       * The width of the Container, setting this will actually modify the scale to achieve the value set.
       * > [!NOTE] Changing the width will adjust the scale.x property of the container while maintaining its aspect ratio.
       * > [!NOTE] If you want to set both width and height at the same time, use {@link Container#setSize}
       * as it is more optimized by not recalculating the local bounds twice.
       * @example
       * ```ts
       * // Basic width setting
       * container.width = 100;
       * // Optimized width setting
       * container.setSize(100, 100);
       * ```
       */
      get width() {
        return Math.abs(this.scale.x * this.getLocalBounds().width);
      }
      set width(value) {
        const localWidth = this.getLocalBounds().width;
        this._setWidth(value, localWidth);
      }
      /**
       * The height of the Container,
       * > [!NOTE] Changing the height will adjust the scale.y property of the container while maintaining its aspect ratio.
       * > [!NOTE] If you want to set both width and height at the same time, use {@link Container#setSize}
       * as it is more optimized by not recalculating the local bounds twice.
       * @example
       * ```ts
       * // Basic height setting
       * container.height = 200;
       * // Optimized height setting
       * container.setSize(100, 200);
       * ```
       */
      get height() {
        return Math.abs(this.scale.y * this.getLocalBounds().height);
      }
      set height(value) {
        const localHeight = this.getLocalBounds().height;
        this._setHeight(value, localHeight);
      }
      /**
       * Retrieves the size of the container as a [Size]{@link Size} object.
       *
       * This is faster than get the width and height separately.
       * @example
       * ```ts
       * // Basic size retrieval
       * const size = container.getSize();
       * console.log(`Size: ${size.width}x${size.height}`);
       *
       * // Reuse existing size object
       * const reuseSize = { width: 0, height: 0 };
       * container.getSize(reuseSize);
       * ```
       * @param out - Optional object to store the size in.
       * @returns The size of the container.
       */
      getSize(out) {
        if (!out) {
          out = {};
        }
        const bounds = this.getLocalBounds();
        out.width = Math.abs(this.scale.x * bounds.width);
        out.height = Math.abs(this.scale.y * bounds.height);
        return out;
      }
      /**
       * Sets the size of the container to the specified width and height.
       * This is more efficient than setting width and height separately as it only recalculates bounds once.
       * @example
       * ```ts
       * // Basic size setting
       * container.setSize(100, 200);
       *
       * // Set uniform size
       * container.setSize(100); // Sets both width and height to 100
       * ```
       * @param value - This can be either a number or a [Size]{@link Size} object.
       * @param height - The height to set. Defaults to the value of `width` if not provided.
       */
      setSize(value, height) {
        const size = this.getLocalBounds();
        if (typeof value === "object") {
          height = value.height ?? value.width;
          value = value.width;
        } else {
          height ?? (height = value);
        }
        value !== void 0 && this._setWidth(value, size.width);
        height !== void 0 && this._setHeight(height, size.height);
      }
      /** Called when the skew or the rotation changes. */
      _updateSkew() {
        const rotation = this._rotation;
        const skew = this._skew;
        this._cx = Math.cos(rotation + skew._y);
        this._sx = Math.sin(rotation + skew._y);
        this._cy = -Math.sin(rotation - skew._x);
        this._sy = Math.cos(rotation - skew._x);
      }
      /**
       * Updates the transform properties of the container.
       * Allows partial updates of transform properties for optimized manipulation.
       * @example
       * ```ts
       * // Basic transform update
       * container.updateTransform({
       *     x: 100,
       *     y: 200,
       *     rotation: Math.PI / 4
       * });
       *
       * // Scale and rotate around center
       * sprite.updateTransform({
       *     pivotX: sprite.width / 2,
       *     pivotY: sprite.height / 2,
       *     scaleX: 2,
       *     scaleY: 2,
       *     rotation: Math.PI
       * });
       *
       * // Update position only
       * button.updateTransform({
       *     x: button.x + 10, // Move right
       *     y: button.y      // Keep same y
       * });
       * ```
       * @param opts - Transform options to update
       * @param opts.x - The x position
       * @param opts.y - The y position
       * @param opts.scaleX - The x-axis scale factor
       * @param opts.scaleY - The y-axis scale factor
       * @param opts.rotation - The rotation in radians
       * @param opts.skewX - The x-axis skew factor
       * @param opts.skewY - The y-axis skew factor
       * @param opts.pivotX - The x-axis pivot point
       * @param opts.pivotY - The y-axis pivot point
       * @returns This container, for chaining
       * @see {@link Container#setFromMatrix} For matrix-based transforms
       * @see {@link Container#position} For direct position access
       */
      updateTransform(opts) {
        this.position.set(
          typeof opts.x === "number" ? opts.x : this.position.x,
          typeof opts.y === "number" ? opts.y : this.position.y
        );
        this.scale.set(
          typeof opts.scaleX === "number" ? opts.scaleX : this.scale.x,
          typeof opts.scaleY === "number" ? opts.scaleY : this.scale.y
        );
        this.rotation = typeof opts.rotation === "number" ? opts.rotation : this.rotation;
        this.skew.set(
          typeof opts.skewX === "number" ? opts.skewX : this.skew.x,
          typeof opts.skewY === "number" ? opts.skewY : this.skew.y
        );
        this.pivot.set(
          typeof opts.pivotX === "number" ? opts.pivotX : this.pivot.x,
          typeof opts.pivotY === "number" ? opts.pivotY : this.pivot.y
        );
        this.origin.set(
          typeof opts.originX === "number" ? opts.originX : this.origin.x,
          typeof opts.originY === "number" ? opts.originY : this.origin.y
        );
        return this;
      }
      /**
       * Updates the local transform properties by decomposing the given matrix.
       * Extracts position, scale, rotation, and skew from a transformation matrix.
       * @example
       * ```ts
       * // Basic matrix transform
       * const matrix = new Matrix()
       *     .translate(100, 100)
       *     .rotate(Math.PI / 4)
       *     .scale(2, 2);
       *
       * container.setFromMatrix(matrix);
       *
       * // Copy transform from another container
       * const source = new Container();
       * source.position.set(100, 100);
       * source.rotation = Math.PI / 2;
       *
       * target.setFromMatrix(source.localTransform);
       *
       * // Reset transform
       * container.setFromMatrix(Matrix.IDENTITY);
       * ```
       * @param matrix - The matrix to use for updating the transform
       * @see {@link Container#updateTransform} For property-based updates
       * @see {@link Matrix#decompose} For matrix decomposition details
       */
      setFromMatrix(matrix) {
        matrix.decompose(this);
      }
      /** Updates the local transform. */
      updateLocalTransform() {
        const localTransformChangeId = this._didContainerChangeTick;
        if (this._didLocalTransformChangeId === localTransformChangeId) return;
        this._didLocalTransformChangeId = localTransformChangeId;
        const lt = this.localTransform;
        const scale = this._scale;
        const pivot = this._pivot;
        const origin = this._origin;
        const position = this._position;
        const sx = scale._x;
        const sy = scale._y;
        const px = pivot._x;
        const py = pivot._y;
        const ox = -origin._x;
        const oy = -origin._y;
        lt.a = this._cx * sx;
        lt.b = this._sx * sx;
        lt.c = this._cy * sy;
        lt.d = this._sy * sy;
        lt.tx = position._x - (px * lt.a + py * lt.c) + (ox * lt.a + oy * lt.c) - ox;
        lt.ty = position._y - (px * lt.b + py * lt.d) + (ox * lt.b + oy * lt.d) - oy;
      }
      // / ///// color related stuff
      set alpha(value) {
        if (value === this.localAlpha) return;
        this.localAlpha = value;
        this._updateFlags |= UPDATE_COLOR;
        this._onUpdate();
      }
      /**
       * The opacity of the object relative to its parent's opacity.
       * Value ranges from 0 (fully transparent) to 1 (fully opaque).
       * @example
       * ```ts
       * // Basic transparency
       * sprite.alpha = 0.5; // 50% opacity
       *
       * // Inherited opacity
       * container.alpha = 0.5;
       * const child = new Sprite(texture);
       * child.alpha = 0.5;
       * container.addChild(child);
       * // child's effective opacity is 0.25 (0.5 * 0.5)
       * ```
       * @default 1
       * @see {@link Container#visible} For toggling visibility
       * @see {@link Container#renderable} For render control
       */
      get alpha() {
        return this.localAlpha;
      }
      set tint(value) {
        const tempColor = Color.shared.setValue(value ?? 16777215);
        const bgr = tempColor.toBgrNumber();
        if (bgr === this.localColor) return;
        this.localColor = bgr;
        this._updateFlags |= UPDATE_COLOR;
        this._onUpdate();
      }
      /**
       * The tint applied to the sprite.
       *
       * This can be any valid {@link ColorSource}.
       * @example
       * ```ts
       * // Basic color tinting
       * container.tint = 0xff0000; // Red tint
       * container.tint = 'red';    // Same as above
       * container.tint = '#00ff00'; // Green
       * container.tint = 'rgb(0,0,255)'; // Blue
       *
       * // Remove tint
       * container.tint = 0xffffff; // White = no tint
       * container.tint = null;     // Also removes tint
       * ```
       * @default 0xFFFFFF
       * @see {@link Container#alpha} For transparency
       * @see {@link Container#visible} For visibility control
       */
      get tint() {
        return bgr2rgb(this.localColor);
      }
      // / //////////////// blend related stuff
      set blendMode(value) {
        if (this.localBlendMode === value) return;
        if (this.parentRenderGroup) {
          this.parentRenderGroup.structureDidChange = true;
        }
        this._updateFlags |= UPDATE_BLEND;
        this.localBlendMode = value;
        this._onUpdate();
      }
      /**
       * The blend mode to be applied to the sprite. Controls how pixels are blended when rendering.
       *
       * Setting to 'normal' will reset to default blending.
       * > [!NOTE] More blend modes are available after importing the `pixi.js/advanced-blend-modes` sub-export.
       * @example
       * ```ts
       * // Basic blend modes
       * sprite.blendMode = 'add';        // Additive blending
       * sprite.blendMode = 'multiply';   // Multiply colors
       * sprite.blendMode = 'screen';     // Screen blend
       *
       * // Reset blend mode
       * sprite.blendMode = 'normal';     // Normal blending
       * ```
       * @default 'normal'
       * @see {@link Container#alpha} For transparency
       * @see {@link Container#tint} For color adjustments
       */
      get blendMode() {
        return this.localBlendMode;
      }
      // / ///////// VISIBILITY / RENDERABLE /////////////////
      /**
       * The visibility of the object. If false the object will not be drawn,
       * and the transform will not be updated.
       * @example
       * ```ts
       * // Basic visibility toggle
       * sprite.visible = false; // Hide sprite
       * sprite.visible = true;  // Show sprite
       * ```
       * @default true
       * @see {@link Container#renderable} For render-only control
       * @see {@link Container#alpha} For transparency
       */
      get visible() {
        return !!(this.localDisplayStatus & 2);
      }
      set visible(value) {
        const valueNumber = value ? 2 : 0;
        if ((this.localDisplayStatus & 2) === valueNumber) return;
        if (this.parentRenderGroup) {
          this.parentRenderGroup.structureDidChange = true;
        }
        this._updateFlags |= UPDATE_VISIBLE;
        this.localDisplayStatus ^= 2;
        this._onUpdate();
        this.emit("visibleChanged", value);
      }
      /** @ignore */
      get culled() {
        return !(this.localDisplayStatus & 4);
      }
      /** @ignore */
      set culled(value) {
        const valueNumber = value ? 0 : 4;
        if ((this.localDisplayStatus & 4) === valueNumber) return;
        if (this.parentRenderGroup) {
          this.parentRenderGroup.structureDidChange = true;
        }
        this._updateFlags |= UPDATE_VISIBLE;
        this.localDisplayStatus ^= 4;
        this._onUpdate();
      }
      /**
       * Controls whether this object can be rendered. If false the object will not be drawn,
       * but the transform will still be updated. This is different from visible, which skips
       * transform updates.
       * @example
       * ```ts
       * // Basic render control
       * sprite.renderable = false; // Skip rendering
       * sprite.renderable = true;  // Enable rendering
       * ```
       * @default true
       * @see {@link Container#visible} For skipping transform updates
       * @see {@link Container#alpha} For transparency
       */
      get renderable() {
        return !!(this.localDisplayStatus & 1);
      }
      set renderable(value) {
        const valueNumber = value ? 1 : 0;
        if ((this.localDisplayStatus & 1) === valueNumber) return;
        this._updateFlags |= UPDATE_VISIBLE;
        this.localDisplayStatus ^= 1;
        if (this.parentRenderGroup) {
          this.parentRenderGroup.structureDidChange = true;
        }
        this._onUpdate();
      }
      /**
       * Whether or not the object should be rendered.
       * @advanced
       */
      get isRenderable() {
        return this.localDisplayStatus === 7 && this.groupAlpha > 0;
      }
      /**
       * Removes all internal references and listeners as well as removes children from the display list.
       * Do not use a Container after calling `destroy`.
       * @param options - Options parameter. A boolean will act as if all options
       *  have been set to that value
       * @example
       * ```ts
       * container.destroy();
       * container.destroy(true);
       * container.destroy({ children: true });
       * container.destroy({ children: true, texture: true, textureSource: true });
       * ```
       */
      destroy(options = false) {
        if (this.destroyed) return;
        this.destroyed = true;
        let oldChildren;
        if (this.children.length) {
          oldChildren = this.removeChildren(0, this.children.length);
        }
        this.removeFromParent();
        this.parent = null;
        this._maskEffect = null;
        this._filterEffect = null;
        this.effects = null;
        this._position = null;
        this._scale = null;
        this._pivot = null;
        this._origin = null;
        this._skew = null;
        this.emit("destroyed", this);
        this.removeAllListeners();
        const destroyChildren = typeof options === "boolean" ? options : options?.children;
        if (destroyChildren && oldChildren) {
          for (let i2 = 0; i2 < oldChildren.length; ++i2) {
            oldChildren[i2].destroy(options);
          }
        }
        this.renderGroup?.destroy();
        this.renderGroup = null;
      }
    };
    extensions.mixin(
      Container,
      childrenHelperMixin,
      getFastGlobalBoundsMixin,
      toLocalGlobalMixin,
      onRenderMixin,
      measureMixin,
      effectsMixin,
      findMixin,
      sortMixin,
      cullingMixin,
      cacheAsTextureMixin,
      getGlobalMixin,
      collectRenderablesMixin
    );
  }
});

// client/node_modules/pixi.js/lib/ticker/const.mjs
var UPDATE_PRIORITY;
var init_const2 = __esm({
  "client/node_modules/pixi.js/lib/ticker/const.mjs"() {
    "use strict";
    UPDATE_PRIORITY = /* @__PURE__ */ ((UPDATE_PRIORITY2) => {
      UPDATE_PRIORITY2[UPDATE_PRIORITY2["INTERACTION"] = 50] = "INTERACTION";
      UPDATE_PRIORITY2[UPDATE_PRIORITY2["HIGH"] = 25] = "HIGH";
      UPDATE_PRIORITY2[UPDATE_PRIORITY2["NORMAL"] = 0] = "NORMAL";
      UPDATE_PRIORITY2[UPDATE_PRIORITY2["LOW"] = -25] = "LOW";
      UPDATE_PRIORITY2[UPDATE_PRIORITY2["UTILITY"] = -50] = "UTILITY";
      return UPDATE_PRIORITY2;
    })(UPDATE_PRIORITY || {});
  }
});

// client/node_modules/pixi.js/lib/ticker/TickerListener.mjs
var TickerListener;
var init_TickerListener = __esm({
  "client/node_modules/pixi.js/lib/ticker/TickerListener.mjs"() {
    "use strict";
    TickerListener = class {
      /**
       * Constructor
       * @private
       * @param fn - The listener function to be added for one update
       * @param context - The listener context
       * @param priority - The priority for emitting
       * @param once - If the handler should fire once
       */
      constructor(fn, context2 = null, priority = 0, once = false) {
        this.next = null;
        this.previous = null;
        this._destroyed = false;
        this._fn = fn;
        this._context = context2;
        this.priority = priority;
        this._once = once;
      }
      /**
       * Simple compare function to figure out if a function and context match.
       * @param fn - The listener function to be added for one update
       * @param context - The listener context
       * @returns `true` if the listener match the arguments
       */
      match(fn, context2 = null) {
        return this._fn === fn && this._context === context2;
      }
      /**
       * Emit by calling the current function.
       * @param ticker - The ticker emitting.
       * @returns Next ticker
       */
      emit(ticker) {
        if (this._fn) {
          if (this._context) {
            this._fn.call(this._context, ticker);
          } else {
            this._fn(ticker);
          }
        }
        const redirect = this.next;
        if (this._once) {
          this.destroy(true);
        }
        if (this._destroyed) {
          this.next = null;
        }
        return redirect;
      }
      /**
       * Connect to the list.
       * @param previous - Input node, previous listener
       */
      connect(previous) {
        this.previous = previous;
        if (previous.next) {
          previous.next.previous = this;
        }
        this.next = previous.next;
        previous.next = this;
      }
      /**
       * Destroy and don't use after this.
       * @param hard - `true` to remove the `next` reference, this
       *        is considered a hard destroy. Soft destroy maintains the next reference.
       * @returns The listener to redirect while emitting or removing.
       */
      destroy(hard = false) {
        this._destroyed = true;
        this._fn = null;
        this._context = null;
        if (this.previous) {
          this.previous.next = this.next;
        }
        if (this.next) {
          this.next.previous = this.previous;
        }
        const redirect = this.next;
        this.next = hard ? null : redirect;
        this.previous = null;
        return redirect;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/ticker/Ticker.mjs
var _Ticker, Ticker;
var init_Ticker = __esm({
  "client/node_modules/pixi.js/lib/ticker/Ticker.mjs"() {
    init_const2();
    init_TickerListener();
    _Ticker = class _Ticker2 {
      constructor() {
        this.autoStart = false;
        this.deltaTime = 1;
        this.lastTime = -1;
        this.speed = 1;
        this.started = false;
        this._requestId = null;
        this._maxElapsedMS = 100;
        this._minElapsedMS = 0;
        this._protected = false;
        this._lastFrame = -1;
        this._head = new TickerListener(null, null, Infinity);
        this.deltaMS = 1 / _Ticker2.targetFPMS;
        this.elapsedMS = 1 / _Ticker2.targetFPMS;
        this._tick = (time) => {
          this._requestId = null;
          if (this.started) {
            this.update(time);
            if (this.started && this._requestId === null && this._head.next) {
              this._requestId = requestAnimationFrame(this._tick);
            }
          }
        };
      }
      /**
       * Conditionally requests a new animation frame.
       * If a frame has not already been requested, and if the internal
       * emitter has listeners, a new frame is requested.
       */
      _requestIfNeeded() {
        if (this._requestId === null && this._head.next) {
          this.lastTime = performance.now();
          this._lastFrame = this.lastTime;
          this._requestId = requestAnimationFrame(this._tick);
        }
      }
      /** Conditionally cancels a pending animation frame. */
      _cancelIfNeeded() {
        if (this._requestId !== null) {
          cancelAnimationFrame(this._requestId);
          this._requestId = null;
        }
      }
      /**
       * Conditionally requests a new animation frame.
       * If the ticker has been started it checks if a frame has not already
       * been requested, and if the internal emitter has listeners. If these
       * conditions are met, a new frame is requested. If the ticker has not
       * been started, but autoStart is `true`, then the ticker starts now,
       * and continues with the previous conditions to request a new frame.
       */
      _startIfPossible() {
        if (this.started) {
          this._requestIfNeeded();
        } else if (this.autoStart) {
          this.start();
        }
      }
      /**
       * Register a handler for tick events.
       * @param fn - The listener function to add. Receives the Ticker instance as parameter
       * @param context - The context for the listener
       * @param priority - The priority of the listener
       * @example
       * ```ts
       * // Access time properties through the ticker parameter
       * ticker.add((ticker) => {
       *     // Use deltaTime (dimensionless scalar) for frame-independent animations
       *     sprite.rotation += 0.1 * ticker.deltaTime;
       *
       *     // Use deltaMS (milliseconds) for time-based calculations
       *     const progress = ticker.deltaMS / animationDuration;
       *
       *     // Use elapsedMS for raw timing measurements
       *     console.log(`Raw frame time: ${ticker.elapsedMS}ms`);
       * });
       * ```
       */
      add(fn, context2, priority = UPDATE_PRIORITY.NORMAL) {
        return this._addListener(new TickerListener(fn, context2, priority));
      }
      /**
       * Add a handler for the tick event which is only executed once on the next frame.
       * @example
       * ```ts
       * // Basic one-time update
       * ticker.addOnce(() => {
       *     console.log('Runs next frame only');
       * });
       *
       * // With specific context
       * const game = {
       *     init(ticker) {
       *         this.loadResources();
       *         console.log('Game initialized');
       *     }
       * };
       * ticker.addOnce(game.init, game);
       *
       * // With priority
       * ticker.addOnce(
       *     () => {
       *         // High priority one-time setup
       *         physics.init();
       *     },
       *     undefined,
       *     UPDATE_PRIORITY.HIGH
       * );
       * ```
       * @param fn - The listener function to be added for one update
       * @param context - The listener context
       * @param priority - The priority for emitting (default: UPDATE_PRIORITY.NORMAL)
       * @returns This instance of a ticker
       * @see {@link Ticker#add} For continuous updates
       * @see {@link Ticker#remove} For removing handlers
       */
      addOnce(fn, context2, priority = UPDATE_PRIORITY.NORMAL) {
        return this._addListener(new TickerListener(fn, context2, priority, true));
      }
      /**
       * Internally adds the event handler so that it can be sorted by priority.
       * Priority allows certain handler (user, AnimatedSprite, Interaction) to be run
       * before the rendering.
       * @private
       * @param listener - Current listener being added.
       * @returns This instance of a ticker
       */
      _addListener(listener) {
        let current = this._head.next;
        let previous = this._head;
        if (!current) {
          listener.connect(previous);
        } else {
          while (current) {
            if (listener.priority > current.priority) {
              listener.connect(previous);
              break;
            }
            previous = current;
            current = current.next;
          }
          if (!listener.previous) {
            listener.connect(previous);
          }
        }
        this._startIfPossible();
        return this;
      }
      /**
       * Removes any handlers matching the function and context parameters.
       * If no handlers are left after removing, then it cancels the animation frame.
       * @example
       * ```ts
       * // Basic removal
       * const onTick = () => {
       *     sprite.rotation += 0.1;
       * };
       * ticker.add(onTick);
       * ticker.remove(onTick);
       *
       * // Remove with context
       * const game = {
       *     update(ticker) {
       *         this.physics.update(ticker.deltaTime);
       *     }
       * };
       * ticker.add(game.update, game);
       * ticker.remove(game.update, game);
       *
       * // Remove all matching handlers
       * // (if same function was added multiple times)
       * ticker.add(onTick);
       * ticker.add(onTick);
       * ticker.remove(onTick); // Removes all instances
       * ```
       * @param fn - The listener function to be removed
       * @param context - The listener context to be removed
       * @returns This instance of a ticker
       * @see {@link Ticker#add} For adding handlers
       * @see {@link Ticker#addOnce} For one-time handlers
       */
      remove(fn, context2) {
        let listener = this._head.next;
        while (listener) {
          if (listener.match(fn, context2)) {
            listener = listener.destroy();
          } else {
            listener = listener.next;
          }
        }
        if (!this._head.next) {
          this._cancelIfNeeded();
        }
        return this;
      }
      /**
       * The number of listeners on this ticker, calculated by walking through linked list.
       * @example
       * ```ts
       * // Check number of active listeners
       * const ticker = new Ticker();
       * console.log(ticker.count); // 0
       *
       * // Add some listeners
       * ticker.add(() => {});
       * ticker.add(() => {});
       * console.log(ticker.count); // 2
       *
       * // Check after cleanup
       * ticker.destroy();
       * console.log(ticker.count); // 0
       * ```
       * @readonly
       * @see {@link Ticker#add} For adding listeners
       * @see {@link Ticker#remove} For removing listeners
       */
      get count() {
        if (!this._head) {
          return 0;
        }
        let count2 = 0;
        let current = this._head;
        while (current = current.next) {
          count2++;
        }
        return count2;
      }
      /**
       * Starts the ticker. If the ticker has listeners a new animation frame is requested at this point.
       * @example
       * ```ts
       * // Basic manual start
       * const ticker = new Ticker();
       * ticker.add(() => {
       *     // Animation code here
       * });
       * ticker.start();
       * ```
       * @see {@link Ticker#stop} For stopping the ticker
       * @see {@link Ticker#autoStart} For automatic starting
       * @see {@link Ticker#started} For checking ticker state
       */
      start() {
        if (!this.started) {
          this.started = true;
          this._requestIfNeeded();
        }
      }
      /**
       * Stops the ticker. If the ticker has requested an animation frame it is canceled at this point.
       * @example
       * ```ts
       * // Basic stop
       * const ticker = new Ticker();
       * ticker.stop();
       * ```
       * @see {@link Ticker#start} For starting the ticker
       * @see {@link Ticker#started} For checking ticker state
       * @see {@link Ticker#destroy} For cleaning up the ticker
       */
      stop() {
        if (this.started) {
          this.started = false;
          this._cancelIfNeeded();
        }
      }
      /**
       * Destroy the ticker and don't use after this. Calling this method removes all references to internal events.
       * @example
       * ```ts
       * // Clean up with active listeners
       * const ticker = new Ticker();
       * ticker.add(() => {});
       * ticker.destroy(); // Removes all listeners
       * ```
       * @see {@link Ticker#stop} For stopping without destroying
       * @see {@link Ticker#remove} For removing specific listeners
       */
      destroy() {
        if (!this._protected) {
          this.stop();
          let listener = this._head.next;
          while (listener) {
            listener = listener.destroy(true);
          }
          this._head.destroy();
          this._head = null;
        }
      }
      /**
       * Triggers an update.
       *
       * An update entails setting the
       * current {@link Ticker#elapsedMS|elapsedMS},
       * the current {@link Ticker#deltaTime|deltaTime},
       * invoking all listeners with current deltaTime,
       * and then finally setting {@link Ticker#lastTime|lastTime}
       * with the value of currentTime that was provided.
       *
       * This method will be called automatically by animation
       * frame callbacks if the ticker instance has been started
       * and listeners are added.
       * @example
       * ```ts
       * // Basic manual update
       * const ticker = new Ticker();
       * ticker.update(performance.now());
       * ```
       * @param currentTime - The current time of execution (defaults to performance.now())
       * @see {@link Ticker#deltaTime} For frame delta value
       * @see {@link Ticker#elapsedMS} For raw elapsed time
       */
      update(currentTime = performance.now()) {
        let elapsedMS;
        if (currentTime > this.lastTime) {
          elapsedMS = this.elapsedMS = currentTime - this.lastTime;
          if (elapsedMS > this._maxElapsedMS) {
            elapsedMS = this._maxElapsedMS;
          }
          elapsedMS *= this.speed;
          if (this._minElapsedMS) {
            const delta = currentTime - this._lastFrame | 0;
            if (delta < this._minElapsedMS) {
              return;
            }
            this._lastFrame = currentTime - delta % this._minElapsedMS;
          }
          this.deltaMS = elapsedMS;
          this.deltaTime = this.deltaMS * _Ticker2.targetFPMS;
          const head = this._head;
          let listener = head.next;
          while (listener) {
            listener = listener.emit(this);
          }
          if (!head.next) {
            this._cancelIfNeeded();
          }
        } else {
          this.deltaTime = this.deltaMS = this.elapsedMS = 0;
        }
        this.lastTime = currentTime;
      }
      /**
       * The frames per second at which this ticker is running.
       * The default is approximately 60 in most modern browsers.
       * > [!NOTE] This does not factor in the value of
       * > {@link Ticker#speed|speed}, which is specific
       * > to scaling {@link Ticker#deltaTime|deltaTime}.
       * @example
       * ```ts
       * // Basic FPS monitoring
       * ticker.add(() => {
       *     console.log(`Current FPS: ${Math.round(ticker.FPS)}`);
       * });
       * ```
       * @readonly
       */
      get FPS() {
        return 1e3 / this.elapsedMS;
      }
      /**
       * Manages the maximum amount of milliseconds allowed to
       * elapse between invoking {@link Ticker#update|update}.
       *
       * This value is used to cap {@link Ticker#deltaTime|deltaTime},
       * but does not effect the measured value of {@link Ticker#FPS|FPS}.
       *
       * When setting this property it is clamped to a value between
       * `0` and `Ticker.targetFPMS * 1000` (typically 60).
       *
       * If `maxFPS` is currently set (non-zero) and `minFPS` is set above it,
       * `maxFPS` is automatically raised to match. This keeps the two limits consistent.
       * @example
       * ```ts
       * // Set minimum acceptable frame rate
       * const ticker = new Ticker();
       * ticker.minFPS = 30; // Never go below 30 FPS
       *
       * // Use with maxFPS for frame rate clamping
       * ticker.minFPS = 30;
       * ticker.maxFPS = 60;
       *
       * // minFPS above maxFPS pushes maxFPS up
       * ticker.minFPS = 50; // maxFPS is raised to 50
       * ```
       * @default 10
       */
      get minFPS() {
        return 1e3 / this._maxElapsedMS;
      }
      set minFPS(fps) {
        const minFPMS = Math.min(Math.max(0, fps) / 1e3, _Ticker2.targetFPMS);
        this._maxElapsedMS = 1 / minFPMS;
        if (this._minElapsedMS && fps > this.maxFPS) {
          this.maxFPS = fps;
        }
      }
      /**
       * Manages the minimum amount of milliseconds required to
       * elapse between invoking {@link Ticker#update|update}.
       *
       * This will effect the measured value of {@link Ticker#FPS|FPS}.
       *
       * If it is set to `0`, then there is no limit; PixiJS will render as many frames as it can.
       * Otherwise it will be at least `minFPS`.
       *
       * If `maxFPS` is set below the current `minFPS`, `minFPS` is automatically lowered to match.
       * This keeps the two limits consistent.
       * @example
       * ```ts
       * // Cap the frame rate
       * const ticker = new Ticker();
       * ticker.maxFPS = 60; // Never go above 60 FPS
       *
       * // Use with minFPS for frame rate clamping
       * ticker.minFPS = 30;
       * ticker.maxFPS = 60;
       *
       * // maxFPS below minFPS pushes minFPS down
       * ticker.maxFPS = 20; // minFPS is now also 20
       * ```
       * @default 0
       */
      get maxFPS() {
        if (this._minElapsedMS) {
          return Math.round(1e3 / this._minElapsedMS);
        }
        return 0;
      }
      set maxFPS(fps) {
        if (fps === 0) {
          this._minElapsedMS = 0;
        } else {
          if (fps < this.minFPS) {
            this.minFPS = fps;
          }
          this._minElapsedMS = 1 / (fps / 1e3);
        }
      }
      /**
       * The shared ticker instance used by {@link AnimatedSprite} and by
       * {@link VideoSource} to update animation frames / video textures.
       *
       * It may also be used by {@link Application} if created with the `sharedTicker` option property set to true.
       *
       * The property {@link Ticker#autoStart|autoStart} is set to `true` for this instance.
       * Please follow the examples for usage, including how to opt-out of auto-starting the shared ticker.
       * @example
       * import { Ticker } from 'pixi.js';
       *
       * const ticker = Ticker.shared;
       * // Set this to prevent starting this ticker when listeners are added.
       * // By default this is true only for the Ticker.shared instance.
       * ticker.autoStart = false;
       *
       * // FYI, call this to ensure the ticker is stopped. It should be stopped
       * // if you have not attempted to render anything yet.
       * ticker.stop();
       *
       * // Call this when you are ready for a running shared ticker.
       * ticker.start();
       * @example
       * import { autoDetectRenderer, Container } from 'pixi.js';
       *
       * // You may use the shared ticker to render...
       * const renderer = autoDetectRenderer();
       * const stage = new Container();
       * document.body.appendChild(renderer.view);
       * ticker.add((time) => renderer.render(stage));
       *
       * // Or you can just update it manually.
       * ticker.autoStart = false;
       * ticker.stop();
       * const animate = (time) => {
       *     ticker.update(time);
       *     renderer.render(stage);
       *     requestAnimationFrame(animate);
       * };
       * animate(performance.now());
       * @type {Ticker}
       * @readonly
       */
      static get shared() {
        if (!_Ticker2._shared) {
          const shared = _Ticker2._shared = new _Ticker2();
          shared.autoStart = true;
          shared._protected = true;
        }
        return _Ticker2._shared;
      }
      /**
       * The system ticker instance used by {@link PrepareBase} for core timing
       * functionality that shouldn't usually need to be paused, unlike the `shared`
       * ticker which drives visual animations and rendering which may want to be paused.
       *
       * The property {@link Ticker#autoStart|autoStart} is set to `true` for this instance.
       * @type {Ticker}
       * @readonly
       * @advanced
       */
      static get system() {
        if (!_Ticker2._system) {
          const system = _Ticker2._system = new _Ticker2();
          system.autoStart = true;
          system._protected = true;
        }
        return _Ticker2._system;
      }
    };
    _Ticker.targetFPMS = 0.06;
    Ticker = _Ticker;
  }
});

// client/node_modules/pixi.js/lib/dom/CanvasObserver.mjs
var CanvasObserver;
var init_CanvasObserver = __esm({
  "client/node_modules/pixi.js/lib/dom/CanvasObserver.mjs"() {
    init_const2();
    init_Ticker();
    CanvasObserver = class {
      constructor(options) {
        this._lastTransform = "";
        this._observer = null;
        this._tickerAttached = false;
        this.updateTranslation = () => {
          if (!this._canvas) return;
          const rect = this._canvas.getBoundingClientRect();
          const contentWidth = this._canvas.width;
          const contentHeight = this._canvas.height;
          const sx = rect.width / contentWidth * this._renderer.resolution;
          const sy = rect.height / contentHeight * this._renderer.resolution;
          const tx = rect.left;
          const ty = rect.top;
          const newTransform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
          if (newTransform !== this._lastTransform) {
            this._domElement.style.transform = newTransform;
            this._lastTransform = newTransform;
          }
        };
        this._domElement = options.domElement;
        this._renderer = options.renderer;
        if (globalThis.OffscreenCanvas && this._renderer.canvas instanceof OffscreenCanvas) return;
        this._canvas = this._renderer.canvas;
        this._attachObserver();
      }
      /** The canvas element that this CanvasObserver is associated with. */
      get canvas() {
        return this._canvas;
      }
      /** Attaches the DOM element to the canvas parent if it is not already attached. */
      ensureAttached() {
        if (!this._domElement.parentNode && this._canvas.parentNode) {
          this._canvas.parentNode.appendChild(this._domElement);
          this.updateTranslation();
        }
      }
      /** Sets up a ResizeObserver if available. This ensures that the DOM element is kept in sync with the canvas size . */
      _attachObserver() {
        if ("ResizeObserver" in globalThis) {
          if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
          }
          this._observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
              if (entry.target !== this._canvas) {
                continue;
              }
              const contentWidth = this.canvas.width;
              const contentHeight = this.canvas.height;
              const sx = entry.contentRect.width / contentWidth * this._renderer.resolution;
              const sy = entry.contentRect.height / contentHeight * this._renderer.resolution;
              const needsUpdate = this._lastScaleX !== sx || this._lastScaleY !== sy;
              if (needsUpdate) {
                this.updateTranslation();
                this._lastScaleX = sx;
                this._lastScaleY = sy;
              }
            }
          });
          this._observer.observe(this._canvas);
        } else if (!this._tickerAttached) {
          Ticker.shared.add(this.updateTranslation, this, UPDATE_PRIORITY.HIGH);
        }
      }
      /** Destroys the CanvasObserver instance, cleaning up observers and Ticker. */
      destroy() {
        if (this._observer) {
          this._observer.disconnect();
          this._observer = null;
        } else if (this._tickerAttached) {
          Ticker.shared.remove(this.updateTranslation);
        }
        this._domElement = null;
        this._renderer = null;
        this._canvas = null;
        this._tickerAttached = false;
        this._lastTransform = "";
        this._lastScaleX = null;
        this._lastScaleY = null;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/events/FederatedEvent.mjs
var FederatedEvent;
var init_FederatedEvent = __esm({
  "client/node_modules/pixi.js/lib/events/FederatedEvent.mjs"() {
    init_Point();
    FederatedEvent = class _FederatedEvent {
      /**
       * @param manager - The event boundary which manages this event. Propagation can only occur
       *  within the boundary's jurisdiction.
       */
      constructor(manager) {
        this.bubbles = true;
        this.cancelBubble = true;
        this.cancelable = false;
        this.composed = false;
        this.defaultPrevented = false;
        this.eventPhase = _FederatedEvent.prototype.NONE;
        this.propagationStopped = false;
        this.propagationImmediatelyStopped = false;
        this.layer = new Point();
        this.page = new Point();
        this.NONE = 0;
        this.CAPTURING_PHASE = 1;
        this.AT_TARGET = 2;
        this.BUBBLING_PHASE = 3;
        this.manager = manager;
      }
      /** @readonly */
      get layerX() {
        return this.layer.x;
      }
      /** @readonly */
      get layerY() {
        return this.layer.y;
      }
      /** @readonly */
      get pageX() {
        return this.page.x;
      }
      /** @readonly */
      get pageY() {
        return this.page.y;
      }
      /**
       * Fallback for the deprecated `InteractionEvent.data`.
       * @deprecated since 7.0.0
       */
      get data() {
        return this;
      }
      /**
       * The propagation path for this event. Alias for {@link EventBoundary.propagationPath}.
       * @advanced
       */
      composedPath() {
        if (this.manager && (!this.path || this.path[this.path.length - 1] !== this.target)) {
          this.path = this.target ? this.manager.propagationPath(this.target) : [];
        }
        return this.path;
      }
      /**
       * Unimplemented method included for implementing the DOM interface `Event`. It will throw an `Error`.
       * @deprecated
       * @ignore
       * @param _type
       * @param _bubbles
       * @param _cancelable
       */
      initEvent(_type, _bubbles, _cancelable) {
        throw new Error("initEvent() is a legacy DOM API. It is not implemented in the Federated Events API.");
      }
      /**
       * Unimplemented method included for implementing the DOM interface `UIEvent`. It will throw an `Error`.
       * @ignore
       * @deprecated
       * @param _typeArg
       * @param _bubblesArg
       * @param _cancelableArg
       * @param _viewArg
       * @param _detailArg
       */
      initUIEvent(_typeArg, _bubblesArg, _cancelableArg, _viewArg, _detailArg) {
        throw new Error("initUIEvent() is a legacy DOM API. It is not implemented in the Federated Events API.");
      }
      /**
       * Prevent default behavior of both PixiJS and the user agent.
       * @example
       * ```ts
       * sprite.on('click', (event) => {
       *     // Prevent both browser's default click behavior
       *     // and PixiJS's default handling
       *     event.preventDefault();
       *
       *     // Custom handling
       *     customClickHandler();
       * });
       * ```
       * @remarks
       * - Only works if the native event is cancelable
       * - Does not stop event propagation
       */
      preventDefault() {
        if (this.nativeEvent instanceof Event && this.nativeEvent.cancelable) {
          this.nativeEvent.preventDefault();
        }
        this.defaultPrevented = true;
      }
      /**
       * Stop this event from propagating to any additional listeners, including those
       * on the current target and any following targets in the propagation path.
       * @example
       * ```ts
       * container.on('pointerdown', (event) => {
       *     // Stop all further event handling
       *     event.stopImmediatePropagation();
       *
       *     // These handlers won't be called:
       *     // - Other pointerdown listeners on this container
       *     // - Any pointerdown listeners on parent containers
       * });
       * ```
       * @remarks
       * - Immediately stops all event propagation
       * - Prevents other listeners on same target from being called
       * - More aggressive than stopPropagation()
       */
      stopImmediatePropagation() {
        this.propagationImmediatelyStopped = true;
      }
      /**
       * Stop this event from propagating to the next target in the propagation path.
       * The rest of the listeners on the current target will still be notified.
       * @example
       * ```ts
       * child.on('pointermove', (event) => {
       *     // Handle event on child
       *     updateChild();
       *
       *     // Prevent parent handlers from being called
       *     event.stopPropagation();
       * });
       *
       * // This won't be called if child handles the event
       * parent.on('pointermove', (event) => {
       *     updateParent();
       * });
       * ```
       * @remarks
       * - Stops event bubbling to parent containers
       * - Does not prevent other listeners on same target
       * - Less aggressive than stopImmediatePropagation()
       */
      stopPropagation() {
        this.propagationStopped = true;
      }
    };
  }
});

// client/node_modules/ismobilejs/esm/isMobile.js
function createMatch(userAgent) {
  return function(regex) {
    return regex.test(userAgent);
  };
}
function isMobile(param) {
  var nav = {
    userAgent: "",
    platform: "",
    maxTouchPoints: 0
  };
  if (!param && typeof navigator !== "undefined") {
    nav = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints || 0
    };
  } else if (typeof param === "string") {
    nav.userAgent = param;
  } else if (param && param.userAgent) {
    nav = {
      userAgent: param.userAgent,
      platform: param.platform,
      maxTouchPoints: param.maxTouchPoints || 0
    };
  }
  var userAgent = nav.userAgent;
  var tmp = userAgent.split("[FBAN");
  if (typeof tmp[1] !== "undefined") {
    userAgent = tmp[0];
  }
  tmp = userAgent.split("Twitter");
  if (typeof tmp[1] !== "undefined") {
    userAgent = tmp[0];
  }
  var match = createMatch(userAgent);
  var result2 = {
    apple: {
      phone: match(appleIphone) && !match(windowsPhone),
      ipod: match(appleIpod),
      tablet: !match(appleIphone) && (match(appleTablet) || isAppleTabletOnIos13(nav)) && !match(windowsPhone),
      universal: match(appleUniversal),
      device: (match(appleIphone) || match(appleIpod) || match(appleTablet) || match(appleUniversal) || isAppleTabletOnIos13(nav)) && !match(windowsPhone)
    },
    amazon: {
      phone: match(amazonPhone),
      tablet: !match(amazonPhone) && match(amazonTablet),
      device: match(amazonPhone) || match(amazonTablet)
    },
    android: {
      phone: !match(windowsPhone) && match(amazonPhone) || !match(windowsPhone) && match(androidPhone),
      tablet: !match(windowsPhone) && !match(amazonPhone) && !match(androidPhone) && (match(amazonTablet) || match(androidTablet)),
      device: !match(windowsPhone) && (match(amazonPhone) || match(amazonTablet) || match(androidPhone) || match(androidTablet)) || match(/\bokhttp\b/i)
    },
    windows: {
      phone: match(windowsPhone),
      tablet: match(windowsTablet),
      device: match(windowsPhone) || match(windowsTablet)
    },
    other: {
      blackberry: match(otherBlackBerry),
      blackberry10: match(otherBlackBerry10),
      opera: match(otherOpera),
      firefox: match(otherFirefox),
      chrome: match(otherChrome),
      device: match(otherBlackBerry) || match(otherBlackBerry10) || match(otherOpera) || match(otherFirefox) || match(otherChrome)
    },
    any: false,
    phone: false,
    tablet: false
  };
  result2.any = result2.apple.device || result2.android.device || result2.windows.device || result2.other.device;
  result2.phone = result2.apple.phone || result2.android.phone || result2.windows.phone;
  result2.tablet = result2.apple.tablet || result2.android.tablet || result2.windows.tablet;
  return result2;
}
var appleIphone, appleIpod, appleTablet, appleUniversal, androidPhone, androidTablet, amazonPhone, amazonTablet, windowsPhone, windowsTablet, otherBlackBerry, otherBlackBerry10, otherOpera, otherChrome, otherFirefox, isAppleTabletOnIos13;
var init_isMobile = __esm({
  "client/node_modules/ismobilejs/esm/isMobile.js"() {
    appleIphone = /iPhone/i;
    appleIpod = /iPod/i;
    appleTablet = /iPad/i;
    appleUniversal = /\biOS-universal(?:.+)Mac\b/i;
    androidPhone = /\bAndroid(?:.+)Mobile\b/i;
    androidTablet = /Android/i;
    amazonPhone = /(?:SD4930UR|\bSilk(?:.+)Mobile\b)/i;
    amazonTablet = /Silk/i;
    windowsPhone = /Windows Phone/i;
    windowsTablet = /\bWindows(?:.+)ARM\b/i;
    otherBlackBerry = /BlackBerry/i;
    otherBlackBerry10 = /BB10/i;
    otherOpera = /Opera Mini/i;
    otherChrome = /\b(CriOS|Chrome)(?:.+)Mobile/i;
    otherFirefox = /Mobile(?:.+)Firefox\b/i;
    isAppleTabletOnIos13 = function(navigator2) {
      return typeof navigator2 !== "undefined" && navigator2.platform === "MacIntel" && typeof navigator2.maxTouchPoints === "number" && navigator2.maxTouchPoints > 1 && typeof MSStream === "undefined";
    };
  }
});

// client/node_modules/ismobilejs/esm/index.js
var init_esm = __esm({
  "client/node_modules/ismobilejs/esm/index.js"() {
    init_isMobile();
    init_isMobile();
  }
});

// client/node_modules/pixi.js/lib/utils/browser/isMobile.mjs
var isMobileCall, isMobile2;
var init_isMobile2 = __esm({
  "client/node_modules/pixi.js/lib/utils/browser/isMobile.mjs"() {
    init_esm();
    isMobileCall = isMobile.default ?? isMobile;
    isMobile2 = isMobileCall(globalThis.navigator);
  }
});

// client/node_modules/pixi.js/lib/accessibility/AccessibilitySystem.mjs
var KEY_CODE_TAB, DIV_TOUCH_SIZE, DIV_TOUCH_POS_X, DIV_TOUCH_POS_Y, DIV_TOUCH_ZINDEX, DIV_HOOK_SIZE, DIV_HOOK_POS_X, DIV_HOOK_POS_Y, DIV_HOOK_ZINDEX, _AccessibilitySystem, AccessibilitySystem;
var init_AccessibilitySystem = __esm({
  "client/node_modules/pixi.js/lib/accessibility/AccessibilitySystem.mjs"() {
    init_CanvasObserver();
    init_FederatedEvent();
    init_Extensions();
    init_isMobile2();
    init_removeItems();
    KEY_CODE_TAB = 9;
    DIV_TOUCH_SIZE = 100;
    DIV_TOUCH_POS_X = 0;
    DIV_TOUCH_POS_Y = 0;
    DIV_TOUCH_ZINDEX = 2;
    DIV_HOOK_SIZE = 1;
    DIV_HOOK_POS_X = -1e3;
    DIV_HOOK_POS_Y = -1e3;
    DIV_HOOK_ZINDEX = 2;
    _AccessibilitySystem = class _AccessibilitySystem2 {
      // eslint-disable-next-line jsdoc/require-param
      /**
       * @param {WebGLRenderer|WebGPURenderer} renderer - A reference to the current renderer
       */
      constructor(renderer, _mobileInfo = isMobile2) {
        this._mobileInfo = _mobileInfo;
        this.debug = false;
        this._activateOnTab = true;
        this._deactivateOnMouseMove = true;
        this._isActive = false;
        this._isMobileAccessibility = false;
        this._div = null;
        this._pools = {};
        this._renderId = 0;
        this._children = [];
        this._androidUpdateCount = 0;
        this._androidUpdateFrequency = 500;
        this._isRunningTests = false;
        this._boundOnKeyDown = this._onKeyDown.bind(this);
        this._boundOnMouseMove = this._onMouseMove.bind(this);
        this._hookDiv = null;
        if (_mobileInfo.tablet || _mobileInfo.phone) {
          this._createTouchHook();
        }
        this._renderer = renderer;
      }
      /**
       * Value of `true` if accessibility is currently active and accessibility layers are showing.
       * @type {boolean}
       * @readonly
       */
      get isActive() {
        return this._isActive;
      }
      /**
       * Value of `true` if accessibility is enabled for touch devices.
       * @type {boolean}
       * @readonly
       */
      get isMobileAccessibility() {
        return this._isMobileAccessibility;
      }
      /**
       * Button element for handling touch hooks.
       * @readonly
       */
      get hookDiv() {
        return this._hookDiv;
      }
      /**
       * The DOM element that will sit over the PixiJS element. This is where the div overlays will go.
       * @readonly
       */
      get div() {
        return this._div;
      }
      /**
       * Creates the touch hooks.
       * @private
       */
      _createTouchHook() {
        const hookDiv = document.createElement("button");
        hookDiv.style.width = `${DIV_HOOK_SIZE}px`;
        hookDiv.style.height = `${DIV_HOOK_SIZE}px`;
        hookDiv.style.position = "absolute";
        hookDiv.style.top = `${DIV_HOOK_POS_X}px`;
        hookDiv.style.left = `${DIV_HOOK_POS_Y}px`;
        hookDiv.style.zIndex = DIV_HOOK_ZINDEX.toString();
        hookDiv.style.backgroundColor = "#FF0000";
        hookDiv.title = "select to enable accessibility for this content";
        hookDiv.addEventListener("focus", () => {
          this._isMobileAccessibility = true;
          this._activate();
          this._destroyTouchHook();
        });
        document.body.appendChild(hookDiv);
        this._hookDiv = hookDiv;
      }
      /**
       * Destroys the touch hooks.
       * @private
       */
      _destroyTouchHook() {
        if (!this._hookDiv) {
          return;
        }
        document.body.removeChild(this._hookDiv);
        this._hookDiv = null;
      }
      /**
       * Activating will cause the Accessibility layer to be shown.
       * This is called when a user presses the tab key.
       * @private
       */
      _activate() {
        if (this._isActive) {
          return;
        }
        this._isActive = true;
        if (!this._div) {
          this._div = document.createElement("div");
          this._div.style.position = "absolute";
          this._div.style.top = `${DIV_TOUCH_POS_X}px`;
          this._div.style.left = `${DIV_TOUCH_POS_Y}px`;
          this._div.style.pointerEvents = "none";
          this._div.style.zIndex = DIV_TOUCH_ZINDEX.toString();
          this._canvasObserver = new CanvasObserver({
            domElement: this._div,
            renderer: this._renderer
          });
        }
        if (this._activateOnTab) {
          globalThis.addEventListener("keydown", this._boundOnKeyDown, false);
        }
        if (this._deactivateOnMouseMove) {
          globalThis.document.addEventListener("mousemove", this._boundOnMouseMove, true);
        }
        const canvas = this._renderer.view.canvas;
        if (!canvas.parentNode) {
          const observer = new MutationObserver(() => {
            if (canvas.parentNode) {
              observer.disconnect();
              this._canvasObserver.ensureAttached();
              this._initAccessibilitySetup();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        } else {
          this._canvasObserver.ensureAttached();
          this._initAccessibilitySetup();
        }
      }
      // New method to handle initialization after div is ready
      _initAccessibilitySetup() {
        this._renderer.runners.postrender.add(this);
        if (this._renderer.lastObjectRendered) {
          this._updateAccessibleObjects(this._renderer.lastObjectRendered);
        }
      }
      /**
       * Deactivates the accessibility system. Removes listeners and accessibility elements.
       * @private
       */
      _deactivate() {
        if (!this._isActive || this._isMobileAccessibility) {
          return;
        }
        this._isActive = false;
        globalThis.document.removeEventListener("mousemove", this._boundOnMouseMove, true);
        if (this._activateOnTab) {
          globalThis.addEventListener("keydown", this._boundOnKeyDown, false);
        }
        this._renderer.runners.postrender.remove(this);
        for (const child of this._children) {
          if (child._accessibleDiv?.parentNode) {
            child._accessibleDiv.parentNode.removeChild(child._accessibleDiv);
            child._accessibleDiv = null;
          }
          child._accessibleActive = false;
        }
        for (const accessibleType in this._pools) {
          const pool = this._pools[accessibleType];
          pool.forEach((div) => {
            if (div.parentNode) {
              div.parentNode.removeChild(div);
            }
          });
          delete this._pools[accessibleType];
        }
        if (this._div?.parentNode) {
          this._div.parentNode.removeChild(this._div);
        }
        this._pools = {};
        this._children = [];
      }
      /**
       * This recursive function will run through the scene graph and add any new accessible objects to the DOM layer.
       * @private
       * @param {Container} container - The Container to check.
       */
      _updateAccessibleObjects(container) {
        if (!container.visible || !container.accessibleChildren) {
          return;
        }
        if (container.accessible) {
          if (!container._accessibleActive) {
            this._addChild(container);
          }
          container._renderId = this._renderId;
        }
        const children = container.children;
        if (children) {
          for (let i2 = 0; i2 < children.length; i2++) {
            this._updateAccessibleObjects(children[i2]);
          }
        }
      }
      /**
       * Runner init called, view is available at this point.
       * @ignore
       */
      init(options) {
        const defaultOpts = _AccessibilitySystem2.defaultOptions;
        const mergedOptions = {
          accessibilityOptions: {
            ...defaultOpts,
            ...options?.accessibilityOptions || {}
          }
        };
        this.debug = mergedOptions.accessibilityOptions.debug;
        this._activateOnTab = mergedOptions.accessibilityOptions.activateOnTab;
        this._deactivateOnMouseMove = mergedOptions.accessibilityOptions.deactivateOnMouseMove;
        if (mergedOptions.accessibilityOptions.enabledByDefault) {
          this._activate();
        }
        this._renderer.runners.postrender.remove(this);
      }
      /**
       * Updates the accessibility layer during rendering.
       * - Removes divs for containers no longer in the scene
       * - Updates the position and dimensions of the root div
       * - Updates positions of active accessibility divs
       * Only fires while the accessibility system is active.
       * @ignore
       */
      postrender() {
        const now = performance.now();
        if (this._mobileInfo.android.device && now < this._androidUpdateCount) {
          return;
        }
        this._androidUpdateCount = now + this._androidUpdateFrequency;
        if ((!this._renderer.renderingToScreen || !this._renderer.view.canvas) && !this._isRunningTests) {
          return;
        }
        const activeIds = /* @__PURE__ */ new Set();
        if (this._renderer.lastObjectRendered) {
          this._updateAccessibleObjects(this._renderer.lastObjectRendered);
          for (const child of this._children) {
            if (child._renderId === this._renderId) {
              activeIds.add(this._children.indexOf(child));
            }
          }
        }
        for (let i2 = this._children.length - 1; i2 >= 0; i2--) {
          const child = this._children[i2];
          if (!activeIds.has(i2)) {
            if (child._accessibleDiv && child._accessibleDiv.parentNode) {
              child._accessibleDiv.parentNode.removeChild(child._accessibleDiv);
              const pool = this._getPool(child.accessibleType);
              pool.push(child._accessibleDiv);
              child._accessibleDiv = null;
            }
            child._accessibleActive = false;
            removeItems(this._children, i2, 1);
          }
        }
        if (this._renderer.renderingToScreen) {
          this._canvasObserver.ensureAttached();
        }
        for (let i2 = 0; i2 < this._children.length; i2++) {
          const child = this._children[i2];
          if (!child._accessibleActive || !child._accessibleDiv) {
            continue;
          }
          const div = child._accessibleDiv;
          const hitArea = child.hitArea || child.getBounds().rectangle;
          if (child.hitArea) {
            const wt = child.worldTransform;
            div.style.left = `${wt.tx + hitArea.x * wt.a}px`;
            div.style.top = `${wt.ty + hitArea.y * wt.d}px`;
            div.style.width = `${hitArea.width * wt.a}px`;
            div.style.height = `${hitArea.height * wt.d}px`;
          } else {
            this._capHitArea(hitArea);
            div.style.left = `${hitArea.x}px`;
            div.style.top = `${hitArea.y}px`;
            div.style.width = `${hitArea.width}px`;
            div.style.height = `${hitArea.height}px`;
          }
        }
        this._renderId++;
      }
      /**
       * private function that will visually add the information to the
       * accessibility div
       * @param {HTMLElement} div -
       */
      _updateDebugHTML(div) {
        div.innerHTML = `type: ${div.type}</br> title : ${div.title}</br> tabIndex: ${div.tabIndex}`;
      }
      /**
       * Adjust the hit area based on the bounds of a display object
       * @param {Rectangle} hitArea - Bounds of the child
       */
      _capHitArea(hitArea) {
        if (hitArea.x < 0) {
          hitArea.width += hitArea.x;
          hitArea.x = 0;
        }
        if (hitArea.y < 0) {
          hitArea.height += hitArea.y;
          hitArea.y = 0;
        }
        const { width: viewWidth, height: viewHeight } = this._renderer;
        if (hitArea.x + hitArea.width > viewWidth) {
          hitArea.width = viewWidth - hitArea.x;
        }
        if (hitArea.y + hitArea.height > viewHeight) {
          hitArea.height = viewHeight - hitArea.y;
        }
      }
      /**
       * Creates or reuses a div element for a Container and adds it to the accessibility layer.
       * Sets up ARIA attributes, event listeners, and positioning based on the container's properties.
       * @private
       * @param {Container} container - The child to make accessible.
       */
      _addChild(container) {
        const pool = this._getPool(container.accessibleType);
        let div = pool.pop();
        if (div) {
          div.innerHTML = "";
          div.removeAttribute("title");
          div.removeAttribute("aria-label");
          div.tabIndex = 0;
        } else {
          if (container.accessibleType === "button") {
            div = document.createElement("button");
          } else {
            div = document.createElement(container.accessibleType);
            div.style.cssText = `
                        color: transparent;
                        pointer-events: none;
                        padding: 0;
                        margin: 0;
                        border: 0;
                        outline: 0;
                        background: transparent;
                        box-sizing: border-box;
                        user-select: none;
                        -webkit-user-select: none;
                        -moz-user-select: none;
                        -ms-user-select: none;
                    `;
            if (container.accessibleText) {
              div.innerText = container.accessibleText;
            }
          }
          div.style.width = `${DIV_TOUCH_SIZE}px`;
          div.style.height = `${DIV_TOUCH_SIZE}px`;
          div.style.backgroundColor = this.debug ? "rgba(255,255,255,0.5)" : "transparent";
          div.style.position = "absolute";
          div.style.zIndex = DIV_TOUCH_ZINDEX.toString();
          div.style.borderStyle = "none";
          if (navigator.userAgent.toLowerCase().includes("chrome")) {
            div.setAttribute("aria-live", "off");
          } else {
            div.setAttribute("aria-live", "polite");
          }
          if (navigator.userAgent.match(/rv:.*Gecko\//)) {
            div.setAttribute("aria-relevant", "additions");
          } else {
            div.setAttribute("aria-relevant", "text");
          }
          div.addEventListener("click", this._onClick.bind(this));
          div.addEventListener("focus", this._onFocus.bind(this));
          div.addEventListener("focusout", this._onFocusOut.bind(this));
        }
        div.style.pointerEvents = container.accessiblePointerEvents;
        div.type = container.accessibleType;
        if (container.accessibleTitle && container.accessibleTitle !== null) {
          div.title = container.accessibleTitle;
        } else if (!container.accessibleHint || container.accessibleHint === null) {
          div.title = `container ${container.tabIndex}`;
        }
        if (container.accessibleHint && container.accessibleHint !== null) {
          div.setAttribute("aria-label", container.accessibleHint);
        }
        if (container.interactive) {
          div.tabIndex = container.tabIndex;
        } else {
          div.tabIndex = 0;
        }
        if (this.debug) {
          this._updateDebugHTML(div);
        }
        container._accessibleActive = true;
        container._accessibleDiv = div;
        div.container = container;
        this._children.push(container);
        this._div.appendChild(container._accessibleDiv);
      }
      /**
       * Dispatch events with the EventSystem.
       * @param e
       * @param type
       * @private
       */
      _dispatchEvent(e2, type) {
        const { container: target } = e2.target;
        const boundary = this._renderer.events.rootBoundary;
        const event = Object.assign(new FederatedEvent(boundary), { target });
        boundary.rootTarget = this._renderer.lastObjectRendered;
        type.forEach((type2) => boundary.dispatchEvent(event, type2));
      }
      /**
       * Maps the div button press to pixi's EventSystem (click)
       * @private
       * @param {MouseEvent} e - The click event.
       */
      _onClick(e2) {
        this._dispatchEvent(e2, ["click", "pointertap", "tap"]);
      }
      /**
       * Maps the div focus events to pixi's EventSystem (mouseover)
       * @private
       * @param {FocusEvent} e - The focus event.
       */
      _onFocus(e2) {
        if (!e2.target.getAttribute("aria-live")) {
          e2.target.setAttribute("aria-live", "assertive");
        }
        this._dispatchEvent(e2, ["mouseover"]);
      }
      /**
       * Maps the div focus events to pixi's EventSystem (mouseout)
       * @private
       * @param {FocusEvent} e - The focusout event.
       */
      _onFocusOut(e2) {
        if (!e2.target.getAttribute("aria-live")) {
          e2.target.setAttribute("aria-live", "polite");
        }
        this._dispatchEvent(e2, ["mouseout"]);
      }
      /**
       * Is called when a key is pressed
       * @private
       * @param {KeyboardEvent} e - The keydown event.
       */
      _onKeyDown(e2) {
        if (e2.keyCode !== KEY_CODE_TAB || !this._activateOnTab) {
          return;
        }
        this._activate();
      }
      /**
       * Is called when the mouse moves across the renderer element
       * @private
       * @param {MouseEvent} e - The mouse event.
       */
      _onMouseMove(e2) {
        if (e2.movementX === 0 && e2.movementY === 0) {
          return;
        }
        this._deactivate();
      }
      /**
       * Destroys the accessibility system. Removes all elements and listeners.
       * > [!IMPORTANT] This is typically called automatically when the {@link Application} is destroyed.
       * > A typically user should not need to call this method directly.
       */
      destroy() {
        this._deactivate();
        this._destroyTouchHook();
        this._canvasObserver?.destroy();
        this._canvasObserver = null;
        this._div = null;
        this._pools = null;
        this._children = null;
        this._renderer = null;
        this._hookDiv = null;
        globalThis.removeEventListener("keydown", this._boundOnKeyDown);
        this._boundOnKeyDown = null;
        globalThis.document.removeEventListener("mousemove", this._boundOnMouseMove, true);
        this._boundOnMouseMove = null;
      }
      /**
       * Enables or disables the accessibility system.
       * @param enabled - Whether to enable or disable accessibility.
       * @example
       * ```js
       * app.renderer.accessibility.setAccessibilityEnabled(true); // Enable accessibility
       * app.renderer.accessibility.setAccessibilityEnabled(false); // Disable accessibility
       * ```
       */
      setAccessibilityEnabled(enabled) {
        if (enabled) {
          this._activate();
        } else {
          this._deactivate();
        }
      }
      _getPool(accessibleType) {
        if (!this._pools[accessibleType]) {
          this._pools[accessibleType] = [];
        }
        return this._pools[accessibleType];
      }
    };
    _AccessibilitySystem.extension = {
      type: [
        ExtensionType.WebGLSystem,
        ExtensionType.WebGPUSystem
      ],
      name: "accessibility"
    };
    _AccessibilitySystem.defaultOptions = {
      /**
       * Whether to enable accessibility features on initialization
       * @default false
       */
      enabledByDefault: false,
      /**
       * Whether to visually show the accessibility divs for debugging
       * @default false
       */
      debug: false,
      /**
       * Whether to activate accessibility when tab key is pressed
       * @default true
       */
      activateOnTab: true,
      /**
       * Whether to deactivate accessibility when mouse moves
       * @default true
       */
      deactivateOnMouseMove: true
    };
    AccessibilitySystem = _AccessibilitySystem;
  }
});

// client/node_modules/pixi.js/lib/accessibility/accessibilityTarget.mjs
var accessibilityTarget;
var init_accessibilityTarget = __esm({
  "client/node_modules/pixi.js/lib/accessibility/accessibilityTarget.mjs"() {
    "use strict";
    accessibilityTarget = {
      accessible: false,
      accessibleTitle: null,
      accessibleHint: null,
      tabIndex: 0,
      accessibleType: "button",
      accessibleText: null,
      accessiblePointerEvents: "auto",
      accessibleChildren: true,
      _accessibleActive: false,
      _accessibleDiv: null,
      _renderId: -1
    };
  }
});

// client/node_modules/pixi.js/lib/accessibility/init.mjs
var init_init = __esm({
  "client/node_modules/pixi.js/lib/accessibility/init.mjs"() {
    init_Extensions();
    init_Container();
    init_AccessibilitySystem();
    init_accessibilityTarget();
    extensions.add(AccessibilitySystem);
    extensions.mixin(Container, accessibilityTarget);
  }
});

// client/node_modules/pixi.js/lib/dom/DOMPipe.mjs
var DOMPipe;
var init_DOMPipe = __esm({
  "client/node_modules/pixi.js/lib/dom/DOMPipe.mjs"() {
    init_Extensions();
    init_CanvasObserver();
    DOMPipe = class {
      /**
       * Constructor for the DOMPipe class.
       * @param renderer - The renderer instance that this DOMPipe will be associated with.
       */
      constructor(renderer) {
        this._attachedDomElements = [];
        this._renderer = renderer;
        this._renderer.runners.postrender.add(this);
        this._renderer.runners.init.add(this);
        this._domElement = document.createElement("div");
        this._domElement.style.position = "absolute";
        this._domElement.style.top = "0";
        this._domElement.style.left = "0";
        this._domElement.style.pointerEvents = "none";
        this._domElement.style.zIndex = "1000";
      }
      /** Initializes the DOMPipe, setting up the main DOM element and adding it to the document body. */
      init() {
        this._canvasObserver = new CanvasObserver({
          domElement: this._domElement,
          renderer: this._renderer
        });
      }
      /**
       * Adds a renderable DOM container to the list of attached elements.
       * @param domContainer - The DOM container to be added.
       * @param _instructionSet - The instruction set (unused).
       */
      addRenderable(domContainer, _instructionSet) {
        if (!this._attachedDomElements.includes(domContainer)) {
          this._attachedDomElements.push(domContainer);
        }
      }
      /**
       * Updates a renderable DOM container.
       * @param _domContainer - The DOM container to be updated (unused).
       */
      updateRenderable(_domContainer) {
      }
      /**
       * Validates a renderable DOM container.
       * @param _domContainer - The DOM container to be validated (unused).
       * @returns Always returns true as validation is not required.
       */
      validateRenderable(_domContainer) {
        return true;
      }
      /** Handles the post-rendering process, ensuring DOM elements are correctly positioned and visible. */
      postrender() {
        const attachedDomElements = this._attachedDomElements;
        if (attachedDomElements.length === 0) {
          this._domElement.remove();
          return;
        }
        this._canvasObserver.ensureAttached();
        for (let i2 = 0; i2 < attachedDomElements.length; i2++) {
          const domContainer = attachedDomElements[i2];
          const element = domContainer.element;
          if (!domContainer.parent || domContainer.globalDisplayStatus < 7) {
            element?.remove();
            attachedDomElements.splice(i2, 1);
            i2--;
          } else {
            if (!this._domElement.contains(element)) {
              element.style.position = "absolute";
              element.style.pointerEvents = "auto";
              this._domElement.appendChild(element);
            }
            const wt = domContainer.worldTransform;
            const anchor = domContainer._anchor;
            const ax = domContainer.width * anchor.x;
            const ay = domContainer.height * anchor.y;
            element.style.transformOrigin = `${ax}px ${ay}px`;
            element.style.transform = `matrix(${wt.a}, ${wt.b}, ${wt.c}, ${wt.d}, ${wt.tx - ax}, ${wt.ty - ay})`;
            element.style.opacity = domContainer.groupAlpha.toString();
          }
        }
      }
      /** Destroys the DOMPipe, removing all attached DOM elements and cleaning up resources. */
      destroy() {
        this._renderer.runners.postrender.remove(this);
        for (let i2 = 0; i2 < this._attachedDomElements.length; i2++) {
          const domContainer = this._attachedDomElements[i2];
          domContainer.element?.remove();
        }
        this._attachedDomElements.length = 0;
        this._domElement.remove();
        this._canvasObserver.destroy();
        this._renderer = null;
      }
    };
    DOMPipe.extension = {
      type: [
        ExtensionType.WebGLPipes,
        ExtensionType.WebGPUPipes,
        ExtensionType.CanvasPipes
      ],
      name: "dom"
    };
  }
});

// client/node_modules/pixi.js/lib/scene/view/ViewContainer.mjs
var ViewContainer;
var init_ViewContainer = __esm({
  "client/node_modules/pixi.js/lib/scene/view/ViewContainer.mjs"() {
    init_Bounds();
    init_Container();
    ViewContainer = class extends Container {
      constructor(options) {
        super(options);
        this.canBundle = true;
        this.allowChildren = false;
        this._roundPixels = 0;
        this._lastUsed = -1;
        this._gpuData = /* @__PURE__ */ Object.create(null);
        this.autoGarbageCollect = true;
        this._gcLastUsed = -1;
        this._bounds = new Bounds(0, 1, 0, 0);
        this._boundsDirty = true;
        this.autoGarbageCollect = options.autoGarbageCollect ?? true;
      }
      /**
       * The local bounds of the view in its own coordinate space.
       * Bounds are automatically updated when the view's content changes.
       * @example
       * ```ts
       * // Get bounds dimensions
       * const bounds = view.bounds;
       * console.log(`Width: ${bounds.maxX - bounds.minX}`);
       * console.log(`Height: ${bounds.maxY - bounds.minY}`);
       * ```
       * @returns The rectangular bounds of the view
       * @see {@link Bounds} For bounds operations
       */
      get bounds() {
        if (!this._boundsDirty) return this._bounds;
        this.updateBounds();
        this._boundsDirty = false;
        return this._bounds;
      }
      /**
       * Whether or not to round the x/y position of the sprite.
       * @example
       * ```ts
       * // Enable pixel rounding for crisp rendering
       * view.roundPixels = true;
       * ```
       * @default false
       */
      get roundPixels() {
        return !!this._roundPixels;
      }
      set roundPixels(value) {
        this._roundPixels = value ? 1 : 0;
      }
      /**
       * Checks if the object contains the given point in local coordinates.
       * Uses the view's bounds for hit testing.
       * @example
       * ```ts
       * // Basic point check
       * const localPoint = { x: 50, y: 25 };
       * const contains = view.containsPoint(localPoint);
       * console.log('Point is inside:', contains);
       * ```
       * @param point - The point to check in local coordinates
       * @returns True if the point is within the view's bounds
       * @see {@link ViewContainer#bounds} For the bounds used in hit testing
       * @see {@link Container#toLocal} For converting global coordinates to local
       */
      containsPoint(point) {
        const bounds = this.bounds;
        const { x: x2, y: y2 } = point;
        return x2 >= bounds.minX && x2 <= bounds.maxX && y2 >= bounds.minY && y2 <= bounds.maxY;
      }
      /** @private */
      onViewUpdate() {
        this._didViewChangeTick++;
        this._boundsDirty = true;
        if (this.didViewUpdate) return;
        this.didViewUpdate = true;
        const renderGroup = this.renderGroup || this.parentRenderGroup;
        if (renderGroup) {
          renderGroup.onChildViewUpdate(this);
        }
      }
      /** Unloads the GPU data from the view. */
      unload() {
        this.emit("unload", this);
        for (const key in this._gpuData) {
          this._gpuData[key]?.destroy();
        }
        this._gpuData = /* @__PURE__ */ Object.create(null);
        this.onViewUpdate();
      }
      destroy(options) {
        this.unload();
        super.destroy(options);
        this._bounds = null;
      }
      /**
       * Collects renderables for the view container.
       * @param instructionSet - The instruction set to collect renderables for.
       * @param renderer - The renderer to collect renderables for.
       * @param currentLayer - The current render layer.
       * @internal
       */
      collectRenderablesSimple(instructionSet, renderer, currentLayer) {
        const { renderPipes } = renderer;
        renderPipes.blendMode.pushBlendMode(this, this.groupBlendMode, instructionSet);
        const rp = renderPipes;
        const pipe = rp[this.renderPipeId];
        if (pipe?.addRenderable) {
          pipe.addRenderable(this, instructionSet);
        }
        this.didViewUpdate = false;
        const children = this.children;
        const length = children.length;
        for (let i2 = 0; i2 < length; i2++) {
          children[i2].collectRenderables(instructionSet, renderer, currentLayer);
        }
        renderPipes.blendMode.popBlendMode(instructionSet);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/dom/init.mjs
var init_init2 = __esm({
  "client/node_modules/pixi.js/lib/dom/init.mjs"() {
    init_Extensions();
    init_DOMPipe();
    extensions.add(DOMPipe);
  }
});

// client/node_modules/pixi.js/lib/events/EventTicker.mjs
var EventsTickerClass, EventsTicker;
var init_EventTicker = __esm({
  "client/node_modules/pixi.js/lib/events/EventTicker.mjs"() {
    init_const2();
    init_Ticker();
    EventsTickerClass = class {
      constructor() {
        this.interactionFrequency = 10;
        this._deltaTime = 0;
        this._didMove = false;
        this._tickerAdded = false;
        this._pauseUpdate = true;
      }
      /**
       * Initializes the event ticker.
       * @param events - The event system.
       */
      init(events) {
        this.removeTickerListener();
        this.events = events;
        this.interactionFrequency = 10;
        this._deltaTime = 0;
        this._didMove = false;
        this._tickerAdded = false;
        this._pauseUpdate = true;
      }
      /** Whether to pause the update checks or not. */
      get pauseUpdate() {
        return this._pauseUpdate;
      }
      set pauseUpdate(paused) {
        this._pauseUpdate = paused;
      }
      /** Adds the ticker listener. */
      addTickerListener() {
        if (this._tickerAdded || !this.domElement) {
          return;
        }
        Ticker.system.add(this._tickerUpdate, this, UPDATE_PRIORITY.INTERACTION);
        this._tickerAdded = true;
      }
      /** Removes the ticker listener. */
      removeTickerListener() {
        if (!this._tickerAdded) {
          return;
        }
        Ticker.system.remove(this._tickerUpdate, this);
        this._tickerAdded = false;
      }
      /** Sets flag to not fire extra events when the user has already moved there mouse */
      pointerMoved() {
        this._didMove = true;
      }
      /** Updates the state of interactive objects. */
      _update() {
        if (!this.domElement || this._pauseUpdate) {
          return;
        }
        if (this._didMove) {
          this._didMove = false;
          return;
        }
        const rootPointerEvent = this.events["_rootPointerEvent"];
        if (this.events.supportsTouchEvents && rootPointerEvent.pointerType === "touch") {
          return;
        }
        globalThis.document.dispatchEvent(this.events.supportsPointerEvents ? new PointerEvent("pointermove", {
          clientX: rootPointerEvent.clientX,
          clientY: rootPointerEvent.clientY,
          pointerType: rootPointerEvent.pointerType,
          pointerId: rootPointerEvent.pointerId
        }) : new MouseEvent("mousemove", {
          clientX: rootPointerEvent.clientX,
          clientY: rootPointerEvent.clientY
        }));
      }
      /**
       * Updates the state of interactive objects if at least {@link interactionFrequency}
       * milliseconds have passed since the last invocation.
       *
       * Invoked by a throttled ticker update from {@link Ticker.system}.
       * @param ticker - The throttled ticker.
       */
      _tickerUpdate(ticker) {
        this._deltaTime += ticker.deltaTime;
        if (this._deltaTime < this.interactionFrequency) {
          return;
        }
        this._deltaTime = 0;
        this._update();
      }
      /** Destroys the event ticker. */
      destroy() {
        this.removeTickerListener();
        this.events = null;
        this.domElement = null;
        this._deltaTime = 0;
        this._didMove = false;
        this._tickerAdded = false;
        this._pauseUpdate = true;
      }
    };
    EventsTicker = new EventsTickerClass();
  }
});

// client/node_modules/pixi.js/lib/events/FederatedMouseEvent.mjs
var FederatedMouseEvent;
var init_FederatedMouseEvent = __esm({
  "client/node_modules/pixi.js/lib/events/FederatedMouseEvent.mjs"() {
    init_Point();
    init_FederatedEvent();
    FederatedMouseEvent = class extends FederatedEvent {
      constructor() {
        super(...arguments);
        this.client = new Point();
        this.movement = new Point();
        this.offset = new Point();
        this.global = new Point();
        this.screen = new Point();
      }
      /** @readonly */
      get clientX() {
        return this.client.x;
      }
      /** @readonly */
      get clientY() {
        return this.client.y;
      }
      /**
       * Alias for {@link FederatedMouseEvent.clientX this.clientX}.
       * @readonly
       */
      get x() {
        return this.clientX;
      }
      /**
       * Alias for {@link FederatedMouseEvent.clientY this.clientY}.
       * @readonly
       */
      get y() {
        return this.clientY;
      }
      /** @readonly */
      get movementX() {
        return this.movement.x;
      }
      /** @readonly */
      get movementY() {
        return this.movement.y;
      }
      /** @readonly */
      get offsetX() {
        return this.offset.x;
      }
      /** @readonly */
      get offsetY() {
        return this.offset.y;
      }
      /** @readonly */
      get globalX() {
        return this.global.x;
      }
      /** @readonly */
      get globalY() {
        return this.global.y;
      }
      /**
       * The pointer coordinates in the renderer's screen. Alias for `screen.x`.
       * @readonly
       */
      get screenX() {
        return this.screen.x;
      }
      /**
       * The pointer coordinates in the renderer's screen. Alias for `screen.y`.
       * @readonly
       */
      get screenY() {
        return this.screen.y;
      }
      /**
       * Converts global coordinates into container-local coordinates.
       *
       * This method transforms coordinates from world space to a container's local space,
       * useful for precise positioning and hit testing.
       * @param container - The Container to get local coordinates for
       * @param point - Optional Point object to store the result. If not provided, a new Point will be created
       * @param globalPos - Optional custom global coordinates. If not provided, the event's global position is used
       * @returns The local coordinates as a Point object
       * @example
       * ```ts
       * // Basic usage - get local coordinates relative to a container
       * sprite.on('pointermove', (event: FederatedMouseEvent) => {
       *     // Get position relative to the sprite
       *     const localPos = event.getLocalPosition(sprite);
       *     console.log('Local position:', localPos.x, localPos.y);
       * });
       * // Using custom global coordinates
       * const customGlobal = new Point(100, 100);
       * sprite.on('pointermove', (event: FederatedMouseEvent) => {
       *     // Transform custom coordinates
       *     const localPos = event.getLocalPosition(sprite, undefined, customGlobal);
       *     console.log('Custom local position:', localPos.x, localPos.y);
       * });
       * ```
       * @see {@link Container.worldTransform} For the transformation matrix
       * @see {@link Point} For the point class used to store coordinates
       */
      getLocalPosition(container, point, globalPos) {
        return container.worldTransform.applyInverse(globalPos || this.global, point);
      }
      /**
       * Whether the modifier key was pressed when this event natively occurred.
       * @param key - The modifier key.
       */
      getModifierState(key) {
        return "getModifierState" in this.nativeEvent && this.nativeEvent.getModifierState(key);
      }
      /**
       * Not supported.
       * @param _typeArg
       * @param _canBubbleArg
       * @param _cancelableArg
       * @param _viewArg
       * @param _detailArg
       * @param _screenXArg
       * @param _screenYArg
       * @param _clientXArg
       * @param _clientYArg
       * @param _ctrlKeyArg
       * @param _altKeyArg
       * @param _shiftKeyArg
       * @param _metaKeyArg
       * @param _buttonArg
       * @param _relatedTargetArg
       * @deprecated since 7.0.0
       * @ignore
       */
      // eslint-disable-next-line max-params
      initMouseEvent(_typeArg, _canBubbleArg, _cancelableArg, _viewArg, _detailArg, _screenXArg, _screenYArg, _clientXArg, _clientYArg, _ctrlKeyArg, _altKeyArg, _shiftKeyArg, _metaKeyArg, _buttonArg, _relatedTargetArg) {
        throw new Error("Method not implemented.");
      }
    };
  }
});

// client/node_modules/pixi.js/lib/events/FederatedPointerEvent.mjs
var FederatedPointerEvent;
var init_FederatedPointerEvent = __esm({
  "client/node_modules/pixi.js/lib/events/FederatedPointerEvent.mjs"() {
    init_FederatedMouseEvent();
    FederatedPointerEvent = class extends FederatedMouseEvent {
      constructor() {
        super(...arguments);
        this.width = 0;
        this.height = 0;
        this.isPrimary = false;
        this.persistentDeviceId = 0;
      }
      /**
       * Only included for completeness for now
       * @ignore
       */
      getCoalescedEvents() {
        if (this.type === "pointermove" || this.type === "mousemove" || this.type === "touchmove") {
          return [this];
        }
        return [];
      }
      /**
       * Only included for completeness for now
       * @ignore
       */
      getPredictedEvents() {
        throw new Error("getPredictedEvents is not supported!");
      }
    };
  }
});

// client/node_modules/pixi.js/lib/events/FederatedWheelEvent.mjs
var FederatedWheelEvent;
var init_FederatedWheelEvent = __esm({
  "client/node_modules/pixi.js/lib/events/FederatedWheelEvent.mjs"() {
    init_FederatedMouseEvent();
    FederatedWheelEvent = class extends FederatedMouseEvent {
      constructor() {
        super(...arguments);
        this.DOM_DELTA_PIXEL = 0;
        this.DOM_DELTA_LINE = 1;
        this.DOM_DELTA_PAGE = 2;
      }
    };
    FederatedWheelEvent.DOM_DELTA_PIXEL = 0;
    FederatedWheelEvent.DOM_DELTA_LINE = 1;
    FederatedWheelEvent.DOM_DELTA_PAGE = 2;
  }
});

// client/node_modules/pixi.js/lib/events/EventBoundary.mjs
var PROPAGATION_LIMIT, tempHitLocation, tempLocalMapping, EventBoundary;
var init_EventBoundary = __esm({
  "client/node_modules/pixi.js/lib/events/EventBoundary.mjs"() {
    init_eventemitter3();
    init_Point();
    init_warn();
    init_EventTicker();
    init_FederatedMouseEvent();
    init_FederatedPointerEvent();
    init_FederatedWheelEvent();
    PROPAGATION_LIMIT = 2048;
    tempHitLocation = new Point();
    tempLocalMapping = new Point();
    EventBoundary = class {
      /**
       * @param rootTarget - The holder of the event boundary.
       */
      constructor(rootTarget) {
        this.dispatch = new eventemitter3_default();
        this.moveOnAll = false;
        this.enableGlobalMoveEvents = true;
        this.mappingState = {
          trackingData: {}
        };
        this.eventPool = /* @__PURE__ */ new Map();
        this._allInteractiveElements = [];
        this._hitElements = [];
        this._isPointerMoveEvent = false;
        this.rootTarget = rootTarget;
        this.hitPruneFn = this.hitPruneFn.bind(this);
        this.hitTestFn = this.hitTestFn.bind(this);
        this.mapPointerDown = this.mapPointerDown.bind(this);
        this.mapPointerMove = this.mapPointerMove.bind(this);
        this.mapPointerOut = this.mapPointerOut.bind(this);
        this.mapPointerOver = this.mapPointerOver.bind(this);
        this.mapPointerUp = this.mapPointerUp.bind(this);
        this.mapPointerUpOutside = this.mapPointerUpOutside.bind(this);
        this.mapWheel = this.mapWheel.bind(this);
        this.mappingTable = {};
        this.addEventMapping("pointerdown", this.mapPointerDown);
        this.addEventMapping("pointermove", this.mapPointerMove);
        this.addEventMapping("pointerout", this.mapPointerOut);
        this.addEventMapping("pointerleave", this.mapPointerOut);
        this.addEventMapping("pointerover", this.mapPointerOver);
        this.addEventMapping("pointerup", this.mapPointerUp);
        this.addEventMapping("pointerupoutside", this.mapPointerUpOutside);
        this.addEventMapping("wheel", this.mapWheel);
      }
      /**
       * Adds an event mapping for the event `type` handled by `fn`.
       *
       * Event mappings can be used to implement additional or custom events. They take an event
       * coming from the upstream scene (or directly from the {@link EventSystem}) and dispatch new downstream events
       * generally trickling down and bubbling up to {@link EventBoundary.rootTarget this.rootTarget}.
       *
       * To modify the semantics of existing events, the built-in mapping methods of EventBoundary should be overridden
       * instead.
       * @param type - The type of upstream event to map.
       * @param fn - The mapping method. The context of this function must be bound manually, if desired.
       */
      addEventMapping(type, fn) {
        if (!this.mappingTable[type]) {
          this.mappingTable[type] = [];
        }
        this.mappingTable[type].push({
          fn,
          priority: 0
        });
        this.mappingTable[type].sort((a2, b2) => a2.priority - b2.priority);
      }
      /**
       * Dispatches the given event
       * @param e - The event to dispatch.
       * @param type - The type of event to dispatch. Defaults to `e.type`.
       */
      dispatchEvent(e2, type) {
        e2.propagationStopped = false;
        e2.propagationImmediatelyStopped = false;
        this.propagate(e2, type);
        this.dispatch.emit(type || e2.type, e2);
      }
      /**
       * Maps the given upstream event through the event boundary and propagates it downstream.
       * @param e - The event to map.
       */
      mapEvent(e2) {
        if (!this.rootTarget) {
          return;
        }
        const mappers = this.mappingTable[e2.type];
        if (mappers) {
          for (let i2 = 0, j2 = mappers.length; i2 < j2; i2++) {
            mappers[i2].fn(e2);
          }
        } else {
          warn(`[EventBoundary]: Event mapping not defined for ${e2.type}`);
        }
      }
      /**
       * Finds the Container that is the target of a event at the given coordinates.
       *
       * The passed (x,y) coordinates are in the world space above this event boundary.
       * @param x - The x coordinate of the event.
       * @param y - The y coordinate of the event.
       */
      hitTest(x2, y2) {
        EventsTicker.pauseUpdate = true;
        const useMove = this._isPointerMoveEvent && this.enableGlobalMoveEvents;
        const fn = useMove ? "hitTestMoveRecursive" : "hitTestRecursive";
        const invertedPath = this[fn](
          this.rootTarget,
          this.rootTarget.eventMode,
          tempHitLocation.set(x2, y2),
          this.hitTestFn,
          this.hitPruneFn
        );
        return invertedPath && invertedPath[0];
      }
      /**
       * Propagate the passed event from from {@link EventBoundary.rootTarget this.rootTarget} to its
       * target `e.target`.
       * @param e - The event to propagate.
       * @param type - The type of event to propagate. Defaults to `e.type`.
       */
      propagate(e2, type) {
        if (!e2.target) {
          return;
        }
        const composedPath = e2.composedPath();
        e2.eventPhase = e2.CAPTURING_PHASE;
        for (let i2 = 0, j2 = composedPath.length - 1; i2 < j2; i2++) {
          e2.currentTarget = composedPath[i2];
          this.notifyTarget(e2, type);
          if (e2.propagationStopped || e2.propagationImmediatelyStopped) return;
        }
        e2.eventPhase = e2.AT_TARGET;
        e2.currentTarget = e2.target;
        this.notifyTarget(e2, type);
        if (e2.propagationStopped || e2.propagationImmediatelyStopped) return;
        e2.eventPhase = e2.BUBBLING_PHASE;
        for (let i2 = composedPath.length - 2; i2 >= 0; i2--) {
          e2.currentTarget = composedPath[i2];
          this.notifyTarget(e2, type);
          if (e2.propagationStopped || e2.propagationImmediatelyStopped) return;
        }
      }
      /**
       * Emits the event `e` to all interactive containers. The event is propagated in the bubbling phase always.
       *
       * This is used in the `globalpointermove` event.
       * @param e - The emitted event.
       * @param type - The listeners to notify.
       * @param targets - The targets to notify.
       */
      all(e2, type, targets = this._allInteractiveElements) {
        if (targets.length === 0) return;
        e2.eventPhase = e2.BUBBLING_PHASE;
        const events = Array.isArray(type) ? type : [type];
        for (let i2 = targets.length - 1; i2 >= 0; i2--) {
          events.forEach((event) => {
            e2.currentTarget = targets[i2];
            this.notifyTarget(e2, event);
          });
        }
      }
      /**
       * Finds the propagation path from {@link EventBoundary.rootTarget rootTarget} to the passed
       * `target`. The last element in the path is `target`.
       * @param target - The target to find the propagation path to.
       */
      propagationPath(target) {
        const propagationPath = [target];
        for (let i2 = 0; i2 < PROPAGATION_LIMIT && (target !== this.rootTarget && target.parent); i2++) {
          if (!target.parent) {
            throw new Error("Cannot find propagation path to disconnected target");
          }
          propagationPath.push(target.parent);
          target = target.parent;
        }
        propagationPath.reverse();
        return propagationPath;
      }
      hitTestMoveRecursive(currentTarget, eventMode, location2, testFn, pruneFn, ignore = false) {
        let shouldReturn = false;
        if (this._interactivePrune(currentTarget)) return null;
        if (currentTarget.eventMode === "dynamic" || eventMode === "dynamic") {
          EventsTicker.pauseUpdate = false;
        }
        if (currentTarget.interactiveChildren && currentTarget.children) {
          const children = currentTarget.children;
          for (let i2 = children.length - 1; i2 >= 0; i2--) {
            const child = children[i2];
            const nestedHit = this.hitTestMoveRecursive(
              child,
              this._isInteractive(eventMode) ? eventMode : child.eventMode,
              location2,
              testFn,
              pruneFn,
              ignore || pruneFn(currentTarget, location2)
            );
            if (nestedHit) {
              if (nestedHit.length > 0 && !nestedHit[nestedHit.length - 1].parent) {
                continue;
              }
              const isInteractive = currentTarget.isInteractive();
              if (nestedHit.length > 0 || isInteractive) {
                if (isInteractive) this._allInteractiveElements.push(currentTarget);
                nestedHit.push(currentTarget);
              }
              if (this._hitElements.length === 0) this._hitElements = nestedHit;
              shouldReturn = true;
            }
          }
        }
        const isInteractiveMode = this._isInteractive(eventMode);
        const isInteractiveTarget = currentTarget.isInteractive();
        if (isInteractiveTarget && isInteractiveTarget) this._allInteractiveElements.push(currentTarget);
        if (ignore || this._hitElements.length > 0) return null;
        if (shouldReturn) return this._hitElements;
        if (isInteractiveMode && (!pruneFn(currentTarget, location2) && testFn(currentTarget, location2))) {
          return isInteractiveTarget ? [currentTarget] : [];
        }
        return null;
      }
      /**
       * Recursive implementation for {@link EventBoundary.hitTest hitTest}.
       * @param currentTarget - The Container that is to be hit tested.
       * @param eventMode - The event mode for the `currentTarget` or one of its parents.
       * @param location - The location that is being tested for overlap.
       * @param testFn - Callback that determines whether the target passes hit testing. This callback
       *  can assume that `pruneFn` failed to prune the container.
       * @param pruneFn - Callback that determiness whether the target and all of its children
       *  cannot pass the hit test. It is used as a preliminary optimization to prune entire subtrees
       *  of the scene graph.
       * @returns An array holding the hit testing target and all its ancestors in order. The first element
       *  is the target itself and the last is {@link EventBoundary.rootTarget rootTarget}. This is the opposite
       *  order w.r.t. the propagation path. If no hit testing target is found, null is returned.
       */
      hitTestRecursive(currentTarget, eventMode, location2, testFn, pruneFn) {
        if (this._interactivePrune(currentTarget) || pruneFn(currentTarget, location2)) {
          return null;
        }
        if (currentTarget.eventMode === "dynamic" || eventMode === "dynamic") {
          EventsTicker.pauseUpdate = false;
        }
        if (currentTarget.interactiveChildren && currentTarget.children) {
          const children = currentTarget.children;
          const relativeLocation = location2;
          for (let i2 = children.length - 1; i2 >= 0; i2--) {
            const child = children[i2];
            const nestedHit = this.hitTestRecursive(
              child,
              this._isInteractive(eventMode) ? eventMode : child.eventMode,
              relativeLocation,
              testFn,
              pruneFn
            );
            if (nestedHit) {
              if (nestedHit.length > 0 && !nestedHit[nestedHit.length - 1].parent) {
                continue;
              }
              const isInteractive = currentTarget.isInteractive();
              if (nestedHit.length > 0 || isInteractive) nestedHit.push(currentTarget);
              return nestedHit;
            }
          }
        }
        const isInteractiveMode = this._isInteractive(eventMode);
        const isInteractiveTarget = currentTarget.isInteractive();
        if (isInteractiveMode && testFn(currentTarget, location2)) {
          return isInteractiveTarget ? [currentTarget] : [];
        }
        return null;
      }
      _isInteractive(int) {
        return int === "static" || int === "dynamic";
      }
      _interactivePrune(container) {
        if (!container || !container.visible || !container.renderable || !container.measurable) {
          return true;
        }
        if (container.eventMode === "none") {
          return true;
        }
        if (container.eventMode === "passive" && !container.interactiveChildren) {
          return true;
        }
        return false;
      }
      /**
       * Checks whether the container or any of its children cannot pass the hit test at all.
       *
       * {@link EventBoundary}'s implementation uses the {@link Container.hitArea hitArea}
       * and {@link Container._maskEffect} for pruning.
       * @param container - The container to prune.
       * @param location - The location to test for overlap.
       */
      hitPruneFn(container, location2) {
        if (container.hitArea) {
          container.worldTransform.applyInverse(location2, tempLocalMapping);
          if (!container.hitArea.contains(tempLocalMapping.x, tempLocalMapping.y)) {
            return true;
          }
        }
        if (container.effects && container.effects.length) {
          for (let i2 = 0; i2 < container.effects.length; i2++) {
            const effect = container.effects[i2];
            if (effect.containsPoint) {
              const effectContainsPoint = effect.containsPoint(location2, this.hitTestFn);
              if (!effectContainsPoint) {
                return true;
              }
            }
          }
        }
        return false;
      }
      /**
       * Checks whether the container passes hit testing for the given location.
       * @param container - The container to test.
       * @param location - The location to test for overlap.
       * @returns - Whether `container` passes hit testing for `location`.
       */
      hitTestFn(container, location2) {
        if (container.hitArea) {
          return true;
        }
        if (container?.containsPoint) {
          container.worldTransform.applyInverse(location2, tempLocalMapping);
          return container.containsPoint(tempLocalMapping);
        }
        return false;
      }
      /**
       * Notify all the listeners to the event's `currentTarget`.
       *
       * If the `currentTarget` contains the property `on<type>`, then it is called here,
       * simulating the behavior from version 6.x and prior.
       * @param e - The event passed to the target.
       * @param type - The type of event to notify. Defaults to `e.type`.
       */
      notifyTarget(e2, type) {
        if (!e2.currentTarget.isInteractive()) {
          return;
        }
        type ?? (type = e2.type);
        const handlerKey = `on${type}`;
        e2.currentTarget[handlerKey]?.(e2);
        const key = e2.eventPhase === e2.CAPTURING_PHASE || e2.eventPhase === e2.AT_TARGET ? `${type}capture` : type;
        this._notifyListeners(e2, key);
        if (e2.eventPhase === e2.AT_TARGET) {
          this._notifyListeners(e2, type);
        }
      }
      /**
       * Maps the upstream `pointerdown` events to a downstream `pointerdown` event.
       *
       * `touchstart`, `rightdown`, `mousedown` events are also dispatched for specific pointer types.
       * @param from - The upstream `pointerdown` event.
       */
      mapPointerDown(from) {
        if (!(from instanceof FederatedPointerEvent)) {
          warn("EventBoundary cannot map a non-pointer event as a pointer event");
          return;
        }
        const e2 = this.createPointerEvent(from);
        this.dispatchEvent(e2, "pointerdown");
        if (e2.pointerType === "touch") {
          this.dispatchEvent(e2, "touchstart");
        } else if (e2.pointerType === "mouse" || e2.pointerType === "pen") {
          const isRightButton = e2.button === 2;
          this.dispatchEvent(e2, isRightButton ? "rightdown" : "mousedown");
        }
        const trackingData = this.trackingData(from.pointerId);
        trackingData.pressTargetsByButton[from.button] = e2.composedPath();
        this.freeEvent(e2);
      }
      /**
       * Maps the upstream `pointermove` to downstream `pointerout`, `pointerover`, and `pointermove` events, in that order.
       *
       * The tracking data for the specific pointer has an updated `overTarget`. `mouseout`, `mouseover`,
       * `mousemove`, and `touchmove` events are fired as well for specific pointer types.
       * @param from - The upstream `pointermove` event.
       */
      mapPointerMove(from) {
        if (!(from instanceof FederatedPointerEvent)) {
          warn("EventBoundary cannot map a non-pointer event as a pointer event");
          return;
        }
        this._allInteractiveElements.length = 0;
        this._hitElements.length = 0;
        this._isPointerMoveEvent = true;
        const e2 = this.createPointerEvent(from);
        this._isPointerMoveEvent = false;
        const isMouse = e2.pointerType === "mouse" || e2.pointerType === "pen";
        const trackingData = this.trackingData(from.pointerId);
        const outTarget = this.findMountedTarget(trackingData.overTargets);
        if (trackingData.overTargets?.length > 0 && outTarget !== e2.target) {
          const outType = from.type === "mousemove" ? "mouseout" : "pointerout";
          const outEvent = this.createPointerEvent(from, outType, outTarget);
          this.dispatchEvent(outEvent, "pointerout");
          if (isMouse) this.dispatchEvent(outEvent, "mouseout");
          if (!e2.composedPath().includes(outTarget)) {
            const leaveEvent = this.createPointerEvent(from, "pointerleave", outTarget);
            leaveEvent.eventPhase = leaveEvent.AT_TARGET;
            while (leaveEvent.target && !e2.composedPath().includes(leaveEvent.target)) {
              leaveEvent.currentTarget = leaveEvent.target;
              this.notifyTarget(leaveEvent);
              if (isMouse) this.notifyTarget(leaveEvent, "mouseleave");
              leaveEvent.target = leaveEvent.target.parent;
            }
            this.freeEvent(leaveEvent);
          }
          this.freeEvent(outEvent);
        }
        if (outTarget !== e2.target) {
          const overType = from.type === "mousemove" ? "mouseover" : "pointerover";
          const overEvent = this.clonePointerEvent(e2, overType);
          this.dispatchEvent(overEvent, "pointerover");
          if (isMouse) this.dispatchEvent(overEvent, "mouseover");
          let overTargetAncestor = outTarget?.parent;
          while (overTargetAncestor && overTargetAncestor !== this.rootTarget.parent) {
            if (overTargetAncestor === e2.target) break;
            overTargetAncestor = overTargetAncestor.parent;
          }
          const didPointerEnter = !overTargetAncestor || overTargetAncestor === this.rootTarget.parent;
          if (didPointerEnter) {
            const enterEvent = this.clonePointerEvent(e2, "pointerenter");
            enterEvent.eventPhase = enterEvent.AT_TARGET;
            while (enterEvent.target && enterEvent.target !== outTarget && enterEvent.target !== this.rootTarget.parent) {
              enterEvent.currentTarget = enterEvent.target;
              this.notifyTarget(enterEvent);
              if (isMouse) this.notifyTarget(enterEvent, "mouseenter");
              enterEvent.target = enterEvent.target.parent;
            }
            this.freeEvent(enterEvent);
          }
          this.freeEvent(overEvent);
        }
        const allMethods = [];
        const allowGlobalPointerEvents = this.enableGlobalMoveEvents ?? true;
        this.moveOnAll ? allMethods.push("pointermove") : this.dispatchEvent(e2, "pointermove");
        allowGlobalPointerEvents && allMethods.push("globalpointermove");
        if (e2.pointerType === "touch") {
          this.moveOnAll ? allMethods.splice(1, 0, "touchmove") : this.dispatchEvent(e2, "touchmove");
          allowGlobalPointerEvents && allMethods.push("globaltouchmove");
        }
        if (isMouse) {
          this.moveOnAll ? allMethods.splice(1, 0, "mousemove") : this.dispatchEvent(e2, "mousemove");
          allowGlobalPointerEvents && allMethods.push("globalmousemove");
          this.cursor = e2.target?.cursor;
        }
        if (allMethods.length > 0) {
          this.all(e2, allMethods);
        }
        this._allInteractiveElements.length = 0;
        this._hitElements.length = 0;
        trackingData.overTargets = e2.composedPath();
        this.freeEvent(e2);
      }
      /**
       * Maps the upstream `pointerover` to downstream `pointerover` and `pointerenter` events, in that order.
       *
       * The tracking data for the specific pointer gets a new `overTarget`.
       * @param from - The upstream `pointerover` event.
       */
      mapPointerOver(from) {
        if (!(from instanceof FederatedPointerEvent)) {
          warn("EventBoundary cannot map a non-pointer event as a pointer event");
          return;
        }
        const trackingData = this.trackingData(from.pointerId);
        const e2 = this.createPointerEvent(from);
        const isMouse = e2.pointerType === "mouse" || e2.pointerType === "pen";
        this.dispatchEvent(e2, "pointerover");
        if (isMouse) this.dispatchEvent(e2, "mouseover");
        if (e2.pointerType === "mouse") this.cursor = e2.target?.cursor;
        const enterEvent = this.clonePointerEvent(e2, "pointerenter");
        enterEvent.eventPhase = enterEvent.AT_TARGET;
        while (enterEvent.target && enterEvent.target !== this.rootTarget.parent) {
          enterEvent.currentTarget = enterEvent.target;
          this.notifyTarget(enterEvent);
          if (isMouse) this.notifyTarget(enterEvent, "mouseenter");
          enterEvent.target = enterEvent.target.parent;
        }
        trackingData.overTargets = e2.composedPath();
        this.freeEvent(e2);
        this.freeEvent(enterEvent);
      }
      /**
       * Maps the upstream `pointerout` to downstream `pointerout`, `pointerleave` events, in that order.
       *
       * The tracking data for the specific pointer is cleared of a `overTarget`.
       * @param from - The upstream `pointerout` event.
       */
      mapPointerOut(from) {
        if (!(from instanceof FederatedPointerEvent)) {
          warn("EventBoundary cannot map a non-pointer event as a pointer event");
          return;
        }
        const trackingData = this.trackingData(from.pointerId);
        if (trackingData.overTargets) {
          const isMouse = from.pointerType === "mouse" || from.pointerType === "pen";
          const outTarget = this.findMountedTarget(trackingData.overTargets);
          const outEvent = this.createPointerEvent(from, "pointerout", outTarget);
          this.dispatchEvent(outEvent);
          if (isMouse) this.dispatchEvent(outEvent, "mouseout");
          const leaveEvent = this.createPointerEvent(from, "pointerleave", outTarget);
          leaveEvent.eventPhase = leaveEvent.AT_TARGET;
          while (leaveEvent.target && leaveEvent.target !== this.rootTarget.parent) {
            leaveEvent.currentTarget = leaveEvent.target;
            this.notifyTarget(leaveEvent);
            if (isMouse) this.notifyTarget(leaveEvent, "mouseleave");
            leaveEvent.target = leaveEvent.target.parent;
          }
          trackingData.overTargets = null;
          this.freeEvent(outEvent);
          this.freeEvent(leaveEvent);
        }
        this.cursor = null;
      }
      /**
       * Maps the upstream `pointerup` event to downstream `pointerup`, `pointerupoutside`,
       * and `click`/`rightclick`/`pointertap` events, in that order.
       *
       * The `pointerupoutside` event bubbles from the original `pointerdown` target to the most specific
       * ancestor of the `pointerdown` and `pointerup` targets, which is also the `click` event's target. `touchend`,
       * `rightup`, `mouseup`, `touchendoutside`, `rightupoutside`, `mouseupoutside`, and `tap` are fired as well for
       * specific pointer types.
       * @param from - The upstream `pointerup` event.
       */
      mapPointerUp(from) {
        if (!(from instanceof FederatedPointerEvent)) {
          warn("EventBoundary cannot map a non-pointer event as a pointer event");
          return;
        }
        const now = performance.now();
        const e2 = this.createPointerEvent(from);
        this.dispatchEvent(e2, "pointerup");
        if (e2.pointerType === "touch") {
          this.dispatchEvent(e2, "touchend");
        } else if (e2.pointerType === "mouse" || e2.pointerType === "pen") {
          const isRightButton = e2.button === 2;
          this.dispatchEvent(e2, isRightButton ? "rightup" : "mouseup");
        }
        const trackingData = this.trackingData(from.pointerId);
        const pressTarget = this.findMountedTarget(trackingData.pressTargetsByButton[from.button]);
        let clickTarget = pressTarget;
        if (pressTarget && !e2.composedPath().includes(pressTarget)) {
          let currentTarget = pressTarget;
          while (currentTarget && !e2.composedPath().includes(currentTarget)) {
            e2.currentTarget = currentTarget;
            this.notifyTarget(e2, "pointerupoutside");
            if (e2.pointerType === "touch") {
              this.notifyTarget(e2, "touchendoutside");
            } else if (e2.pointerType === "mouse" || e2.pointerType === "pen") {
              const isRightButton = e2.button === 2;
              this.notifyTarget(e2, isRightButton ? "rightupoutside" : "mouseupoutside");
            }
            currentTarget = currentTarget.parent;
          }
          delete trackingData.pressTargetsByButton[from.button];
          clickTarget = currentTarget;
        }
        if (clickTarget) {
          const clickEvent = this.clonePointerEvent(e2, "click");
          clickEvent.target = clickTarget;
          clickEvent.path = null;
          if (!trackingData.clicksByButton[from.button]) {
            trackingData.clicksByButton[from.button] = {
              clickCount: 0,
              target: clickEvent.target,
              timeStamp: now
            };
          }
          const clickHistory = trackingData.clicksByButton[from.button];
          if (clickHistory.target === clickEvent.target && now - clickHistory.timeStamp < 200) {
            ++clickHistory.clickCount;
          } else {
            clickHistory.clickCount = 1;
          }
          clickHistory.target = clickEvent.target;
          clickHistory.timeStamp = now;
          clickEvent.detail = clickHistory.clickCount;
          if (clickEvent.pointerType === "mouse") {
            const isRightButton = clickEvent.button === 2;
            this.dispatchEvent(clickEvent, isRightButton ? "rightclick" : "click");
          } else if (clickEvent.pointerType === "touch") {
            this.dispatchEvent(clickEvent, "tap");
          }
          this.dispatchEvent(clickEvent, "pointertap");
          this.freeEvent(clickEvent);
        }
        this.freeEvent(e2);
      }
      /**
       * Maps the upstream `pointerupoutside` event to a downstream `pointerupoutside` event, bubbling from the original
       * `pointerdown` target to `rootTarget`.
       *
       * (The most specific ancestor of the `pointerdown` event and the `pointerup` event must the
       * `{@link EventBoundary}'s root because the `pointerup` event occurred outside of the boundary.)
       *
       * `touchendoutside`, `mouseupoutside`, and `rightupoutside` events are fired as well for specific pointer
       * types. The tracking data for the specific pointer is cleared of a `pressTarget`.
       * @param from - The upstream `pointerupoutside` event.
       */
      mapPointerUpOutside(from) {
        if (!(from instanceof FederatedPointerEvent)) {
          warn("EventBoundary cannot map a non-pointer event as a pointer event");
          return;
        }
        const trackingData = this.trackingData(from.pointerId);
        const pressTarget = this.findMountedTarget(trackingData.pressTargetsByButton[from.button]);
        const e2 = this.createPointerEvent(from);
        if (pressTarget) {
          let currentTarget = pressTarget;
          while (currentTarget) {
            e2.currentTarget = currentTarget;
            this.notifyTarget(e2, "pointerupoutside");
            if (e2.pointerType === "touch") {
              this.notifyTarget(e2, "touchendoutside");
            } else if (e2.pointerType === "mouse" || e2.pointerType === "pen") {
              this.notifyTarget(e2, e2.button === 2 ? "rightupoutside" : "mouseupoutside");
            }
            currentTarget = currentTarget.parent;
          }
          delete trackingData.pressTargetsByButton[from.button];
        }
        this.freeEvent(e2);
      }
      /**
       * Maps the upstream `wheel` event to a downstream `wheel` event.
       * @param from - The upstream `wheel` event.
       */
      mapWheel(from) {
        if (!(from instanceof FederatedWheelEvent)) {
          warn("EventBoundary cannot map a non-wheel event as a wheel event");
          return;
        }
        const wheelEvent = this.createWheelEvent(from);
        this.dispatchEvent(wheelEvent);
        this.freeEvent(wheelEvent);
      }
      /**
       * Finds the most specific event-target in the given propagation path that is still mounted in the scene graph.
       *
       * This is used to find the correct `pointerup` and `pointerout` target in the case that the original `pointerdown`
       * or `pointerover` target was unmounted from the scene graph.
       * @param propagationPath - The propagation path was valid in the past.
       * @returns - The most specific event-target still mounted at the same location in the scene graph.
       */
      findMountedTarget(propagationPath) {
        if (!propagationPath) {
          return null;
        }
        let currentTarget = propagationPath[0];
        for (let i2 = 1; i2 < propagationPath.length; i2++) {
          if (propagationPath[i2].parent === currentTarget) {
            currentTarget = propagationPath[i2];
          } else {
            break;
          }
        }
        return currentTarget;
      }
      /**
       * Creates an event whose `originalEvent` is `from`, with an optional `type` and `target` override.
       *
       * The event is allocated using {@link EventBoundary#allocateEvent this.allocateEvent}.
       * @param from - The `originalEvent` for the returned event.
       * @param [type=from.type] - The type of the returned event.
       * @param target - The target of the returned event.
       */
      createPointerEvent(from, type, target) {
        const event = this.allocateEvent(FederatedPointerEvent);
        this.copyPointerData(from, event);
        this.copyMouseData(from, event);
        this.copyData(from, event);
        event.nativeEvent = from.nativeEvent;
        event.originalEvent = from;
        event.target = target ?? this.hitTest(event.global.x, event.global.y) ?? this._hitElements[0];
        if (typeof type === "string") {
          event.type = type;
        }
        return event;
      }
      /**
       * Creates a wheel event whose `originalEvent` is `from`.
       *
       * The event is allocated using {@link EventBoundary#allocateEvent this.allocateEvent}.
       * @param from - The upstream wheel event.
       */
      createWheelEvent(from) {
        const event = this.allocateEvent(FederatedWheelEvent);
        this.copyWheelData(from, event);
        this.copyMouseData(from, event);
        this.copyData(from, event);
        event.nativeEvent = from.nativeEvent;
        event.originalEvent = from;
        event.target = this.hitTest(event.global.x, event.global.y);
        return event;
      }
      /**
       * Clones the event `from`, with an optional `type` override.
       *
       * The event is allocated using {@link EventBoundary#allocateEvent this.allocateEvent}.
       * @param from - The event to clone.
       * @param [type=from.type] - The type of the returned event.
       */
      clonePointerEvent(from, type) {
        const event = this.allocateEvent(FederatedPointerEvent);
        event.nativeEvent = from.nativeEvent;
        event.originalEvent = from.originalEvent;
        this.copyPointerData(from, event);
        this.copyMouseData(from, event);
        this.copyData(from, event);
        event.target = from.target;
        event.path = from.composedPath().slice();
        event.type = type ?? event.type;
        return event;
      }
      /**
       * Copies wheel {@link FederatedWheelEvent} data from `from` into `to`.
       *
       * The following properties are copied:
       * + deltaMode
       * + deltaX
       * + deltaY
       * + deltaZ
       * @param from - The event to copy data from.
       * @param to - The event to copy data into.
       */
      copyWheelData(from, to) {
        to.deltaMode = from.deltaMode;
        to.deltaX = from.deltaX;
        to.deltaY = from.deltaY;
        to.deltaZ = from.deltaZ;
      }
      /**
       * Copies pointer {@link FederatedPointerEvent} data from `from` into `to`.
       *
       * The following properties are copied:
       * + pointerId
       * + width
       * + height
       * + isPrimary
       * + pointerType
       * + pressure
       * + tangentialPressure
       * + tiltX
       * + tiltY
       * @param from - The event to copy data from.
       * @param to - The event to copy data into.
       */
      copyPointerData(from, to) {
        if (!(from instanceof FederatedPointerEvent && to instanceof FederatedPointerEvent)) return;
        to.pointerId = from.pointerId;
        to.width = from.width;
        to.height = from.height;
        to.isPrimary = from.isPrimary;
        to.pointerType = from.pointerType;
        to.pressure = from.pressure;
        to.tangentialPressure = from.tangentialPressure;
        to.tiltX = from.tiltX;
        to.tiltY = from.tiltY;
        to.twist = from.twist;
        to.persistentDeviceId = from.persistentDeviceId;
      }
      /**
       * Copies mouse {@link FederatedMouseEvent} data from `from` to `to`.
       *
       * The following properties are copied:
       * + altKey
       * + button
       * + buttons
       * + clientX
       * + clientY
       * + metaKey
       * + movementX
       * + movementY
       * + pageX
       * + pageY
       * + x
       * + y
       * + screen
       * + shiftKey
       * + global
       * @param from - The event to copy data from.
       * @param to - The event to copy data into.
       */
      copyMouseData(from, to) {
        if (!(from instanceof FederatedMouseEvent && to instanceof FederatedMouseEvent)) return;
        to.altKey = from.altKey;
        to.button = from.button;
        to.buttons = from.buttons;
        to.client.copyFrom(from.client);
        to.ctrlKey = from.ctrlKey;
        to.metaKey = from.metaKey;
        to.movement.copyFrom(from.movement);
        to.screen.copyFrom(from.screen);
        to.shiftKey = from.shiftKey;
        to.global.copyFrom(from.global);
      }
      /**
       * Copies base {@link FederatedEvent} data from `from` into `to`.
       *
       * The following properties are copied:
       * + isTrusted
       * + srcElement
       * + timeStamp
       * + type
       * @param from - The event to copy data from.
       * @param to - The event to copy data into.
       */
      copyData(from, to) {
        to.isTrusted = from.isTrusted;
        to.srcElement = from.srcElement;
        to.timeStamp = performance.now();
        to.type = from.type;
        to.detail = from.detail;
        to.view = from.view;
        to.which = from.which;
        to.layer.copyFrom(from.layer);
        to.page.copyFrom(from.page);
      }
      /**
       * @param id - The pointer ID.
       * @returns The tracking data stored for the given pointer. If no data exists, a blank
       *  state will be created.
       */
      trackingData(id) {
        if (!this.mappingState.trackingData[id]) {
          this.mappingState.trackingData[id] = {
            pressTargetsByButton: {},
            clicksByButton: {},
            overTarget: null
          };
        }
        return this.mappingState.trackingData[id];
      }
      /**
       * Allocate a specific type of event from {@link EventBoundary#eventPool this.eventPool}.
       *
       * This allocation is constructor-agnostic, as long as it only takes one argument - this event
       * boundary.
       * @param constructor - The event's constructor.
       * @returns An event of the given type.
       */
      allocateEvent(constructor) {
        if (!this.eventPool.has(constructor)) {
          this.eventPool.set(constructor, []);
        }
        const event = this.eventPool.get(constructor).pop() || new constructor(this);
        event.eventPhase = event.NONE;
        event.currentTarget = null;
        event.defaultPrevented = false;
        event.path = null;
        event.target = null;
        return event;
      }
      /**
       * Frees the event and puts it back into the event pool.
       *
       * It is illegal to reuse the event until it is allocated again, using `this.allocateEvent`.
       *
       * It is also advised that events not allocated from {@link EventBoundary#allocateEvent this.allocateEvent}
       * not be freed. This is because of the possibility that the same event is freed twice, which can cause
       * it to be allocated twice & result in overwriting.
       * @param event - The event to be freed.
       * @throws Error if the event is managed by another event boundary.
       */
      freeEvent(event) {
        if (event.manager !== this) throw new Error("It is illegal to free an event not managed by this EventBoundary!");
        const constructor = event.constructor;
        if (!this.eventPool.has(constructor)) {
          this.eventPool.set(constructor, []);
        }
        this.eventPool.get(constructor).push(event);
      }
      /**
       * Similar to {@link EventEmitter.emit}, except it stops if the `propagationImmediatelyStopped` flag
       * is set on the event.
       * @param e - The event to call each listener with.
       * @param type - The event key.
       */
      _notifyListeners(e2, type) {
        const listeners = e2.currentTarget._events[type];
        if (!listeners) return;
        if ("fn" in listeners) {
          if (listeners.once) e2.currentTarget.removeListener(type, listeners.fn, void 0, true);
          listeners.fn.call(listeners.context, e2);
        } else {
          for (let i2 = 0, j2 = listeners.length; i2 < j2 && !e2.propagationImmediatelyStopped; i2++) {
            if (listeners[i2].once) e2.currentTarget.removeListener(type, listeners[i2].fn, void 0, true);
            listeners[i2].fn.call(listeners[i2].context, e2);
          }
        }
      }
    };
  }
});

// client/node_modules/pixi.js/lib/events/EventSystem.mjs
var MOUSE_POINTER_ID, TOUCH_TO_POINTER, _EventSystem, EventSystem;
var init_EventSystem = __esm({
  "client/node_modules/pixi.js/lib/events/EventSystem.mjs"() {
    init_Extensions();
    init_EventBoundary();
    init_EventTicker();
    init_FederatedPointerEvent();
    init_FederatedWheelEvent();
    MOUSE_POINTER_ID = 1;
    TOUCH_TO_POINTER = {
      touchstart: "pointerdown",
      touchend: "pointerup",
      touchendoutside: "pointerupoutside",
      touchmove: "pointermove",
      touchcancel: "pointercancel"
    };
    _EventSystem = class _EventSystem2 {
      /**
       * @param {Renderer} renderer
       */
      constructor(renderer) {
        this.supportsTouchEvents = "ontouchstart" in globalThis;
        this.supportsPointerEvents = !!globalThis.PointerEvent;
        this.domElement = null;
        this.resolution = 1;
        this.renderer = renderer;
        this.rootBoundary = new EventBoundary(null);
        EventsTicker.init(this);
        this.autoPreventDefault = true;
        this._eventsAdded = false;
        this._rootPointerEvent = new FederatedPointerEvent(null);
        this._rootWheelEvent = new FederatedWheelEvent(null);
        this.cursorStyles = {
          default: "inherit",
          pointer: "pointer"
        };
        this.features = new Proxy({ ..._EventSystem2.defaultEventFeatures }, {
          set: (target, key, value) => {
            if (key === "globalMove") {
              this.rootBoundary.enableGlobalMoveEvents = value;
            }
            target[key] = value;
            return true;
          }
        });
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onPointerOverOut = this._onPointerOverOut.bind(this);
        this.onWheel = this.onWheel.bind(this);
      }
      /**
       * The default interaction mode for all display objects.
       * @see Container.eventMode
       * @type {EventMode}
       * @readonly
       * @since 7.2.0
       */
      static get defaultEventMode() {
        return this._defaultEventMode;
      }
      /**
       * Runner init called, view is available at this point.
       * @ignore
       */
      init(options) {
        const { canvas, resolution } = this.renderer;
        this.setTargetElement(canvas);
        this.resolution = resolution;
        _EventSystem2._defaultEventMode = options.eventMode ?? "passive";
        Object.assign(this.features, options.eventFeatures ?? {});
        this.rootBoundary.enableGlobalMoveEvents = this.features.globalMove;
      }
      /**
       * Handle changing resolution.
       * @ignore
       */
      resolutionChange(resolution) {
        this.resolution = resolution;
      }
      /** Destroys all event listeners and detaches the renderer. */
      destroy() {
        EventsTicker.destroy();
        this.setTargetElement(null);
        this.renderer = null;
        this._currentCursor = null;
      }
      /**
       * Sets the current cursor mode, handling any callbacks or CSS style changes.
       * The cursor can be a CSS cursor string, a custom callback function, or a key from the cursorStyles dictionary.
       * @param mode - Cursor mode to set. Can be:
       * - A CSS cursor string (e.g., 'pointer', 'grab')
       * - A key from the cursorStyles dictionary
       * - null/undefined to reset to default
       * @example
       * ```ts
       * // Using predefined cursor styles
       * app.renderer.events.setCursor('pointer');    // Set standard pointer cursor
       * app.renderer.events.setCursor('grab');       // Set grab cursor
       * app.renderer.events.setCursor(null);         // Reset to default
       *
       * // Using custom cursor styles
       * app.renderer.events.cursorStyles.custom = 'url("cursor.png"), auto';
       * app.renderer.events.setCursor('custom');     // Apply custom cursor
       *
       * // Using callback-based cursor
       * app.renderer.events.cursorStyles.dynamic = (mode) => {
       *     document.body.style.cursor = mode === 'hover' ? 'pointer' : 'default';
       * };
       * app.renderer.events.setCursor('dynamic');    // Trigger cursor callback
       * ```
       * @remarks
       * - Has no effect on OffscreenCanvas except for callback-based cursors
       * - Caches current cursor to avoid unnecessary DOM updates
       * - Supports CSS cursor values, style objects, and callback functions
       * @see {@link EventSystem.cursorStyles} For defining custom cursor styles
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/CSS/cursor} MDN Cursor Reference
       */
      setCursor(mode) {
        mode || (mode = "default");
        let applyStyles = true;
        if (globalThis.OffscreenCanvas && this.domElement instanceof OffscreenCanvas) {
          applyStyles = false;
        }
        if (this._currentCursor === mode) {
          return;
        }
        this._currentCursor = mode;
        const style = this.cursorStyles[mode];
        if (style) {
          switch (typeof style) {
            case "string":
              if (applyStyles) {
                this.domElement.style.cursor = style;
              }
              break;
            case "function":
              style(mode);
              break;
            case "object":
              if (applyStyles) {
                Object.assign(this.domElement.style, style);
              }
              break;
          }
        } else if (applyStyles && typeof mode === "string" && !Object.prototype.hasOwnProperty.call(this.cursorStyles, mode)) {
          this.domElement.style.cursor = mode;
        }
      }
      /**
       * The global pointer event instance containing the most recent pointer state.
       * This is useful for accessing pointer information without listening to events.
       * @example
       * ```ts
       * // Access current pointer position at any time
       * const eventSystem = app.renderer.events;
       * const pointer = eventSystem.pointer;
       *
       * // Get global coordinates
       * console.log('Position:', pointer.global.x, pointer.global.y);
       *
       * // Check button state
       * console.log('Buttons pressed:', pointer.buttons);
       *
       * // Get pointer type and pressure
       * console.log('Type:', pointer.pointerType);
       * console.log('Pressure:', pointer.pressure);
       * ```
       * @readonly
       * @since 7.2.0
       * @see {@link FederatedPointerEvent} For all available pointer properties
       */
      get pointer() {
        return this._rootPointerEvent;
      }
      /**
       * Event handler for pointer down events on {@link EventSystem#domElement this.domElement}.
       * @param nativeEvent - The native mouse/pointer/touch event.
       */
      _onPointerDown(nativeEvent) {
        if (!this.features.click) return;
        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;
        const events = this._normalizeToPointerData(nativeEvent);
        if (this.autoPreventDefault && events[0].isNormalized) {
          const cancelable = nativeEvent.cancelable || !("cancelable" in nativeEvent);
          if (cancelable) {
            nativeEvent.preventDefault();
          }
        }
        for (let i2 = 0, j2 = events.length; i2 < j2; i2++) {
          const nativeEvent2 = events[i2];
          const federatedEvent = this._bootstrapEvent(this._rootPointerEvent, nativeEvent2);
          this.rootBoundary.mapEvent(federatedEvent);
        }
        this.setCursor(this.rootBoundary.cursor);
      }
      /**
       * Event handler for pointer move events on on {@link EventSystem#domElement this.domElement}.
       * @param nativeEvent - The native mouse/pointer/touch events.
       */
      _onPointerMove(nativeEvent) {
        if (!this.features.move) return;
        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;
        EventsTicker.pointerMoved();
        const normalizedEvents = this._normalizeToPointerData(nativeEvent);
        for (let i2 = 0, j2 = normalizedEvents.length; i2 < j2; i2++) {
          const event = this._bootstrapEvent(this._rootPointerEvent, normalizedEvents[i2]);
          this.rootBoundary.mapEvent(event);
        }
        this.setCursor(this.rootBoundary.cursor);
      }
      /**
       * Event handler for pointer up events on {@link EventSystem#domElement this.domElement}.
       * @param nativeEvent - The native mouse/pointer/touch event.
       */
      _onPointerUp(nativeEvent) {
        if (!this.features.click) return;
        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;
        let target = nativeEvent.target;
        if (nativeEvent.composedPath && nativeEvent.composedPath().length > 0) {
          target = nativeEvent.composedPath()[0];
        }
        const outside = target !== this.domElement ? "outside" : "";
        const normalizedEvents = this._normalizeToPointerData(nativeEvent);
        for (let i2 = 0, j2 = normalizedEvents.length; i2 < j2; i2++) {
          const event = this._bootstrapEvent(this._rootPointerEvent, normalizedEvents[i2]);
          event.type += outside;
          this.rootBoundary.mapEvent(event);
        }
        this.setCursor(this.rootBoundary.cursor);
      }
      /**
       * Event handler for pointer over & out events on {@link EventSystem#domElement this.domElement}.
       * @param nativeEvent - The native mouse/pointer/touch event.
       */
      _onPointerOverOut(nativeEvent) {
        if (!this.features.click) return;
        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;
        const normalizedEvents = this._normalizeToPointerData(nativeEvent);
        for (let i2 = 0, j2 = normalizedEvents.length; i2 < j2; i2++) {
          const event = this._bootstrapEvent(this._rootPointerEvent, normalizedEvents[i2]);
          this.rootBoundary.mapEvent(event);
        }
        this.setCursor(this.rootBoundary.cursor);
      }
      /**
       * Passive handler for `wheel` events on {@link EventSystem.domElement this.domElement}.
       * @param nativeEvent - The native wheel event.
       */
      onWheel(nativeEvent) {
        if (!this.features.wheel) return;
        const wheelEvent = this.normalizeWheelEvent(nativeEvent);
        this.rootBoundary.rootTarget = this.renderer.lastObjectRendered;
        this.rootBoundary.mapEvent(wheelEvent);
      }
      /**
       * Sets the {@link EventSystem#domElement domElement} and binds event listeners.
       * This method manages the DOM event bindings for the event system, allowing you to
       * change or remove the target element that receives input events.
       * > [!IMPORTANT] This will default to the canvas element of the renderer, so you
       * > should not need to call this unless you are using a custom element.
       * @param element - The new DOM element to bind events to, or null to remove all event bindings
       * @example
       * ```ts
       * // Set a new canvas element as the target
       * const canvas = document.createElement('canvas');
       * app.renderer.events.setTargetElement(canvas);
       *
       * // Remove all event bindings
       * app.renderer.events.setTargetElement(null);
       *
       * // Switch to a different canvas
       * const newCanvas = document.querySelector('#game-canvas');
       * app.renderer.events.setTargetElement(newCanvas);
       * ```
       * @remarks
       * - Automatically removes event listeners from previous element
       * - Required for the event system to function
       * - Safe to call multiple times
       * @see {@link EventSystem#domElement} The current DOM element
       * @see {@link EventsTicker} For the ticker system that tracks pointer movement
       */
      setTargetElement(element) {
        this._removeEvents();
        this.domElement = element;
        EventsTicker.domElement = element;
        this._addEvents();
      }
      /** Register event listeners on {@link Renderer#domElement this.domElement}. */
      _addEvents() {
        if (this._eventsAdded || !this.domElement) {
          return;
        }
        EventsTicker.addTickerListener();
        const style = this.domElement.style;
        if (style) {
          if (globalThis.navigator.msPointerEnabled) {
            style.msContentZooming = "none";
            style.msTouchAction = "none";
          } else if (this.supportsPointerEvents) {
            style.touchAction = "none";
          }
        }
        if (this.supportsPointerEvents) {
          globalThis.document.addEventListener("pointermove", this._onPointerMove, true);
          this.domElement.addEventListener("pointerdown", this._onPointerDown, true);
          this.domElement.addEventListener("pointerleave", this._onPointerOverOut, true);
          this.domElement.addEventListener("pointerover", this._onPointerOverOut, true);
          globalThis.addEventListener("pointerup", this._onPointerUp, true);
        } else {
          globalThis.document.addEventListener("mousemove", this._onPointerMove, true);
          this.domElement.addEventListener("mousedown", this._onPointerDown, true);
          this.domElement.addEventListener("mouseout", this._onPointerOverOut, true);
          this.domElement.addEventListener("mouseover", this._onPointerOverOut, true);
          globalThis.addEventListener("mouseup", this._onPointerUp, true);
          if (this.supportsTouchEvents) {
            this.domElement.addEventListener("touchstart", this._onPointerDown, true);
            this.domElement.addEventListener("touchend", this._onPointerUp, true);
            this.domElement.addEventListener("touchmove", this._onPointerMove, true);
          }
        }
        this.domElement.addEventListener("wheel", this.onWheel, {
          passive: true,
          capture: true
        });
        this._eventsAdded = true;
      }
      /** Unregister event listeners on {@link EventSystem#domElement this.domElement}. */
      _removeEvents() {
        if (!this._eventsAdded || !this.domElement) {
          return;
        }
        EventsTicker.removeTickerListener();
        const style = this.domElement.style;
        if (style) {
          if (globalThis.navigator.msPointerEnabled) {
            style.msContentZooming = "";
            style.msTouchAction = "";
          } else if (this.supportsPointerEvents) {
            style.touchAction = "";
          }
        }
        if (this.supportsPointerEvents) {
          globalThis.document.removeEventListener("pointermove", this._onPointerMove, true);
          this.domElement.removeEventListener("pointerdown", this._onPointerDown, true);
          this.domElement.removeEventListener("pointerleave", this._onPointerOverOut, true);
          this.domElement.removeEventListener("pointerover", this._onPointerOverOut, true);
          globalThis.removeEventListener("pointerup", this._onPointerUp, true);
        } else {
          globalThis.document.removeEventListener("mousemove", this._onPointerMove, true);
          this.domElement.removeEventListener("mousedown", this._onPointerDown, true);
          this.domElement.removeEventListener("mouseout", this._onPointerOverOut, true);
          this.domElement.removeEventListener("mouseover", this._onPointerOverOut, true);
          globalThis.removeEventListener("mouseup", this._onPointerUp, true);
          if (this.supportsTouchEvents) {
            this.domElement.removeEventListener("touchstart", this._onPointerDown, true);
            this.domElement.removeEventListener("touchend", this._onPointerUp, true);
            this.domElement.removeEventListener("touchmove", this._onPointerMove, true);
          }
        }
        this.domElement.removeEventListener("wheel", this.onWheel, true);
        this.domElement = null;
        this._eventsAdded = false;
      }
      /**
       * Maps coordinates from DOM/screen space into PixiJS normalized coordinates.
       * This takes into account the current scale, position, and resolution of the DOM element.
       * @param point - The point to store the mapped coordinates in
       * @param x - The x coordinate in DOM/client space
       * @param y - The y coordinate in DOM/client space
       * @example
       * ```ts
       * // Map mouse coordinates to PixiJS space
       * const point = new Point();
       * app.renderer.events.mapPositionToPoint(
       *     point,
       *     event.clientX,
       *     event.clientY
       * );
       * console.log('Mapped position:', point.x, point.y);
       *
       * // Using with pointer events
       * sprite.on('pointermove', (event) => {
       *     // event.global already contains mapped coordinates
       *     console.log('Global:', event.global.x, event.global.y);
       *
       *     // Map to local coordinates
       *     const local = event.getLocalPosition(sprite);
       *     console.log('Local:', local.x, local.y);
       * });
       * ```
       * @remarks
       * - Accounts for element scaling and positioning
       * - Adjusts for device pixel ratio/resolution
       */
      mapPositionToPoint(point, x2, y2) {
        const rect = this.domElement.isConnected ? this.domElement.getBoundingClientRect() : {
          x: 0,
          y: 0,
          width: this.domElement.width,
          height: this.domElement.height,
          left: 0,
          top: 0
        };
        const resolutionMultiplier = 1 / this.resolution;
        point.x = (x2 - rect.left) * (this.domElement.width / rect.width) * resolutionMultiplier;
        point.y = (y2 - rect.top) * (this.domElement.height / rect.height) * resolutionMultiplier;
      }
      /**
       * Ensures that the original event object contains all data that a regular pointer event would have
       * @param event - The original event data from a touch or mouse event
       * @returns An array containing a single normalized pointer event, in the case of a pointer
       *  or mouse event, or a multiple normalized pointer events if there are multiple changed touches
       */
      _normalizeToPointerData(event) {
        const normalizedEvents = [];
        if (this.supportsTouchEvents && event instanceof TouchEvent) {
          for (let i2 = 0, li = event.changedTouches.length; i2 < li; i2++) {
            const touch = event.changedTouches[i2];
            if (typeof touch.button === "undefined") touch.button = 0;
            if (typeof touch.buttons === "undefined") touch.buttons = 1;
            if (typeof touch.isPrimary === "undefined") {
              touch.isPrimary = event.touches.length === 1 && event.type === "touchstart";
            }
            if (typeof touch.width === "undefined") touch.width = touch.radiusX || 1;
            if (typeof touch.height === "undefined") touch.height = touch.radiusY || 1;
            if (typeof touch.tiltX === "undefined") touch.tiltX = 0;
            if (typeof touch.tiltY === "undefined") touch.tiltY = 0;
            if (typeof touch.pointerType === "undefined") touch.pointerType = "touch";
            if (typeof touch.pointerId === "undefined") touch.pointerId = touch.identifier || 0;
            if (typeof touch.pressure === "undefined") touch.pressure = touch.force || 0.5;
            if (typeof touch.twist === "undefined") touch.twist = 0;
            if (typeof touch.tangentialPressure === "undefined") touch.tangentialPressure = 0;
            if (typeof touch.layerX === "undefined") touch.layerX = touch.offsetX = touch.clientX;
            if (typeof touch.layerY === "undefined") touch.layerY = touch.offsetY = touch.clientY;
            touch.isNormalized = true;
            touch.type = event.type;
            touch.altKey ?? (touch.altKey = event.altKey);
            touch.ctrlKey ?? (touch.ctrlKey = event.ctrlKey);
            touch.metaKey ?? (touch.metaKey = event.metaKey);
            touch.shiftKey ?? (touch.shiftKey = event.shiftKey);
            normalizedEvents.push(touch);
          }
        } else if (!globalThis.MouseEvent || event instanceof MouseEvent && (!this.supportsPointerEvents || !(event instanceof globalThis.PointerEvent))) {
          const tempEvent = event;
          if (typeof tempEvent.isPrimary === "undefined") tempEvent.isPrimary = true;
          if (typeof tempEvent.width === "undefined") tempEvent.width = 1;
          if (typeof tempEvent.height === "undefined") tempEvent.height = 1;
          if (typeof tempEvent.tiltX === "undefined") tempEvent.tiltX = 0;
          if (typeof tempEvent.tiltY === "undefined") tempEvent.tiltY = 0;
          if (typeof tempEvent.pointerType === "undefined") tempEvent.pointerType = "mouse";
          if (typeof tempEvent.pointerId === "undefined") tempEvent.pointerId = MOUSE_POINTER_ID;
          if (typeof tempEvent.pressure === "undefined") tempEvent.pressure = 0.5;
          if (typeof tempEvent.twist === "undefined") tempEvent.twist = 0;
          if (typeof tempEvent.tangentialPressure === "undefined") tempEvent.tangentialPressure = 0;
          tempEvent.isNormalized = true;
          normalizedEvents.push(tempEvent);
        } else {
          normalizedEvents.push(event);
        }
        return normalizedEvents;
      }
      /**
       * Normalizes the native {@link https://w3c.github.io/uievents/#interface-wheelevent WheelEvent}.
       *
       * The returned {@link FederatedWheelEvent} is a shared instance. It will not persist across
       * multiple native wheel events.
       * @param nativeEvent - The native wheel event that occurred on the canvas.
       * @returns A federated wheel event.
       */
      normalizeWheelEvent(nativeEvent) {
        const event = this._rootWheelEvent;
        this._transferMouseData(event, nativeEvent);
        event.deltaX = nativeEvent.deltaX;
        event.deltaY = nativeEvent.deltaY;
        event.deltaZ = nativeEvent.deltaZ;
        event.deltaMode = nativeEvent.deltaMode;
        this.mapPositionToPoint(event.screen, nativeEvent.clientX, nativeEvent.clientY);
        event.global.copyFrom(event.screen);
        event.offset.copyFrom(event.screen);
        event.nativeEvent = nativeEvent;
        event.type = nativeEvent.type;
        return event;
      }
      /**
       * Normalizes the `nativeEvent` into a federateed {@link FederatedPointerEvent}.
       * @param event
       * @param nativeEvent
       */
      _bootstrapEvent(event, nativeEvent) {
        event.originalEvent = null;
        event.nativeEvent = nativeEvent;
        event.pointerId = nativeEvent.pointerId;
        event.width = nativeEvent.width;
        event.height = nativeEvent.height;
        event.isPrimary = nativeEvent.isPrimary;
        event.pointerType = nativeEvent.pointerType;
        event.pressure = nativeEvent.pressure;
        event.tangentialPressure = nativeEvent.tangentialPressure;
        event.tiltX = nativeEvent.tiltX;
        event.tiltY = nativeEvent.tiltY;
        event.twist = nativeEvent.twist;
        this._transferMouseData(event, nativeEvent);
        this.mapPositionToPoint(event.screen, nativeEvent.clientX, nativeEvent.clientY);
        event.global.copyFrom(event.screen);
        event.offset.copyFrom(event.screen);
        event.isTrusted = nativeEvent.isTrusted;
        if (event.type === "pointerleave") {
          event.type = "pointerout";
        }
        if (event.type.startsWith("mouse")) {
          event.type = event.type.replace("mouse", "pointer");
        }
        if (event.type.startsWith("touch")) {
          event.type = TOUCH_TO_POINTER[event.type] || event.type;
        }
        return event;
      }
      /**
       * Transfers base & mouse event data from the `nativeEvent` to the federated event.
       * @param event
       * @param nativeEvent
       */
      _transferMouseData(event, nativeEvent) {
        event.isTrusted = nativeEvent.isTrusted;
        event.srcElement = nativeEvent.srcElement;
        event.timeStamp = performance.now();
        event.type = nativeEvent.type;
        event.altKey = nativeEvent.altKey;
        event.button = nativeEvent.button;
        event.buttons = nativeEvent.buttons;
        event.client.x = nativeEvent.clientX;
        event.client.y = nativeEvent.clientY;
        event.ctrlKey = nativeEvent.ctrlKey;
        event.metaKey = nativeEvent.metaKey;
        event.movement.x = nativeEvent.movementX;
        event.movement.y = nativeEvent.movementY;
        event.page.x = nativeEvent.pageX;
        event.page.y = nativeEvent.pageY;
        event.relatedTarget = null;
        event.shiftKey = nativeEvent.shiftKey;
      }
    };
    _EventSystem.extension = {
      name: "events",
      type: [
        ExtensionType.WebGLSystem,
        ExtensionType.CanvasSystem,
        ExtensionType.WebGPUSystem
      ],
      priority: -1
    };
    _EventSystem.defaultEventFeatures = {
      /** Enables pointer events associated with pointer movement. */
      move: true,
      /** Enables global pointer move events. */
      globalMove: true,
      /** Enables pointer events associated with clicking. */
      click: true,
      /** Enables wheel events. */
      wheel: true
    };
    EventSystem = _EventSystem;
  }
});

// client/node_modules/pixi.js/lib/events/FederatedEventTarget.mjs
var FederatedContainer;
var init_FederatedEventTarget = __esm({
  "client/node_modules/pixi.js/lib/events/FederatedEventTarget.mjs"() {
    init_EventSystem();
    init_FederatedEvent();
    FederatedContainer = {
      onclick: null,
      onmousedown: null,
      onmouseenter: null,
      onmouseleave: null,
      onmousemove: null,
      onglobalmousemove: null,
      onmouseout: null,
      onmouseover: null,
      onmouseup: null,
      onmouseupoutside: null,
      onpointercancel: null,
      onpointerdown: null,
      onpointerenter: null,
      onpointerleave: null,
      onpointermove: null,
      onglobalpointermove: null,
      onpointerout: null,
      onpointerover: null,
      onpointertap: null,
      onpointerup: null,
      onpointerupoutside: null,
      onrightclick: null,
      onrightdown: null,
      onrightup: null,
      onrightupoutside: null,
      ontap: null,
      ontouchcancel: null,
      ontouchend: null,
      ontouchendoutside: null,
      ontouchmove: null,
      onglobaltouchmove: null,
      ontouchstart: null,
      onwheel: null,
      get interactive() {
        return this.eventMode === "dynamic" || this.eventMode === "static";
      },
      set interactive(value) {
        this.eventMode = value ? "static" : "passive";
      },
      _internalEventMode: void 0,
      get eventMode() {
        return this._internalEventMode ?? EventSystem.defaultEventMode;
      },
      set eventMode(value) {
        this._internalEventMode = value;
      },
      isInteractive() {
        return this.eventMode === "static" || this.eventMode === "dynamic";
      },
      interactiveChildren: true,
      hitArea: null,
      addEventListener(type, listener, options) {
        const capture = typeof options === "boolean" && options || typeof options === "object" && options.capture;
        const signal = typeof options === "object" ? options.signal : void 0;
        const once = typeof options === "object" ? options.once === true : false;
        const context2 = typeof listener === "function" ? void 0 : listener;
        type = capture ? `${type}capture` : type;
        const listenerFn = typeof listener === "function" ? listener : listener.handleEvent;
        const emitter = this;
        if (signal) {
          signal.addEventListener("abort", () => {
            emitter.off(type, listenerFn, context2);
          });
        }
        if (once) {
          emitter.once(type, listenerFn, context2);
        } else {
          emitter.on(type, listenerFn, context2);
        }
      },
      removeEventListener(type, listener, options) {
        const capture = typeof options === "boolean" && options || typeof options === "object" && options.capture;
        const context2 = typeof listener === "function" ? void 0 : listener;
        type = capture ? `${type}capture` : type;
        listener = typeof listener === "function" ? listener : listener.handleEvent;
        this.off(type, listener, context2);
      },
      dispatchEvent(e2) {
        if (!(e2 instanceof FederatedEvent)) {
          throw new Error("Container cannot propagate events outside of the Federated Events API");
        }
        e2.defaultPrevented = false;
        e2.path = null;
        e2.target = this;
        e2.manager.dispatchEvent(e2);
        return !e2.defaultPrevented;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/events/init.mjs
var init_init3 = __esm({
  "client/node_modules/pixi.js/lib/events/init.mjs"() {
    init_Extensions();
    init_Container();
    init_EventSystem();
    init_FederatedEventTarget();
    extensions.add(EventSystem);
    extensions.mixin(Container, FederatedContainer);
  }
});

// client/node_modules/pixi.js/lib/assets/loader/parsers/LoaderParser.mjs
var LoaderParserPriority;
var init_LoaderParser = __esm({
  "client/node_modules/pixi.js/lib/assets/loader/parsers/LoaderParser.mjs"() {
    "use strict";
    LoaderParserPriority = /* @__PURE__ */ ((LoaderParserPriority2) => {
      LoaderParserPriority2[LoaderParserPriority2["Low"] = 0] = "Low";
      LoaderParserPriority2[LoaderParserPriority2["Normal"] = 1] = "Normal";
      LoaderParserPriority2[LoaderParserPriority2["High"] = 2] = "High";
      return LoaderParserPriority2;
    })(LoaderParserPriority || {});
  }
});

// client/node_modules/pixi.js/lib/environment-browser/BrowserAdapter.mjs
var BrowserAdapter;
var init_BrowserAdapter = __esm({
  "client/node_modules/pixi.js/lib/environment-browser/BrowserAdapter.mjs"() {
    "use strict";
    BrowserAdapter = {
      createCanvas: (width, height) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
      },
      createImage: () => new Image(),
      getCanvasRenderingContext2D: () => CanvasRenderingContext2D,
      getWebGLRenderingContext: () => WebGLRenderingContext,
      getNavigator: () => navigator,
      getBaseUrl: () => document.baseURI ?? window.location.href,
      getFontFaceSet: () => document.fonts,
      fetch: (url, options) => fetch(url, options),
      parseXML: (xml) => {
        const parser = new DOMParser();
        return parser.parseFromString(xml, "text/xml");
      }
    };
  }
});

// client/node_modules/pixi.js/lib/environment/adapter.mjs
var currentAdapter, DOMAdapter;
var init_adapter = __esm({
  "client/node_modules/pixi.js/lib/environment/adapter.mjs"() {
    init_BrowserAdapter();
    currentAdapter = BrowserAdapter;
    DOMAdapter = {
      /**
       * Returns the current adapter.
       * @returns {environment.Adapter} The current adapter.
       */
      get() {
        return currentAdapter;
      },
      /**
       * Sets the current adapter.
       * @param adapter - The new adapter.
       */
      set(adapter) {
        currentAdapter = adapter;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/utils/path.mjs
function assertPath(path2) {
  if (typeof path2 !== "string") {
    throw new TypeError(`Path must be a string. Received ${JSON.stringify(path2)}`);
  }
}
function removeUrlParams(url) {
  const re = url.split("?")[0];
  return re.split("#")[0];
}
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function replaceAll(str, find, replace) {
  return str.replace(new RegExp(escapeRegExp(find), "g"), replace);
}
function normalizeStringPosix(path2, allowAboveRoot) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code = -1;
  for (let i2 = 0; i2 <= path2.length; ++i2) {
    if (i2 < path2.length) {
      code = path2.charCodeAt(i2);
    } else if (code === 47) {
      break;
    } else {
      code = 47;
    }
    if (code === 47) {
      if (lastSlash === i2 - 1 || dots === 1) {
      } else if (lastSlash !== i2 - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1) {
                res = "";
                lastSegmentLength = 0;
              } else {
                res = res.slice(0, lastSlashIndex);
                lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              }
              lastSlash = i2;
              dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i2;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) {
            res += "/..";
          } else {
            res = "..";
          }
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) {
          res += `/${path2.slice(lastSlash + 1, i2)}`;
        } else {
          res = path2.slice(lastSlash + 1, i2);
        }
        lastSegmentLength = i2 - lastSlash - 1;
      }
      lastSlash = i2;
      dots = 0;
    } else if (code === 46 && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}
var path;
var init_path = __esm({
  "client/node_modules/pixi.js/lib/utils/path.mjs"() {
    init_adapter();
    path = {
      /**
       * Converts a path to posix format.
       * @param path - The path to convert to posix
       * @example
       * ```ts
       * // Convert a Windows path to POSIX format
       * path.toPosix('C:\\Users\\User\\Documents\\file.txt');
       * // -> 'C:/Users/User/Documents/file.txt'
       * ```
       */
      toPosix(path2) {
        return replaceAll(path2, "\\", "/");
      },
      /**
       * Checks if the path is a URL e.g. http://, https://
       * @param path - The path to check
       * @example
       * ```ts
       * // Check if a path is a URL
       * path.isUrl('http://www.example.com');
       * // -> true
       * path.isUrl('C:/Users/User/Documents/file.txt');
       * // -> false
       * ```
       */
      isUrl(path2) {
        return /^https?:/.test(this.toPosix(path2));
      },
      /**
       * Checks if the path is a data URL
       * @param path - The path to check
       * @example
       * ```ts
       * // Check if a path is a data URL
       * path.isDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...');
       * // -> true
       * ```
       */
      isDataUrl(path2) {
        return /^data:([a-z]+\/[a-z0-9-+.]+(;[a-z0-9-.!#$%*+.{}|~`]+=[a-z0-9-.!#$%*+.{}()_|~`]+)*)?(;base64)?,([a-z0-9!$&',()*+;=\-._~:@\/?%\s<>]*?)$/i.test(path2);
      },
      /**
       * Checks if the path is a blob URL
       * @param path - The path to check
       * @example
       * ```ts
       * // Check if a path is a blob URL
       * path.isBlobUrl('blob:http://www.example.com/12345678-1234-1234-1234-123456789012');
       * // -> true
       * ```
       */
      isBlobUrl(path2) {
        return path2.startsWith("blob:");
      },
      /**
       * Checks if the path has a protocol e.g. http://, https://, file:///, data:, blob:, C:/
       * This will return true for windows file paths
       * @param path - The path to check
       * @example
       * ```ts
       * // Check if a path has a protocol
       * path.hasProtocol('http://www.example.com');
       * // -> true
       * path.hasProtocol('C:/Users/User/Documents/file.txt');
       * // -> true
       * ```
       */
      hasProtocol(path2) {
        return /^[^/:]+:/.test(this.toPosix(path2));
      },
      /**
       * Returns the protocol of the path e.g. http://, https://, file:///, data:, blob:, C:/
       * @param path - The path to get the protocol from
       * @example
       * ```ts
       * // Get the protocol from a URL
       * path.getProtocol('http://www.example.com/path/to/resource');
       * // -> 'http://'
       * // Get the protocol from a file path
       * path.getProtocol('C:/Users/User/Documents/file.txt');
       * // -> 'C:/'
       * ```
       */
      getProtocol(path2) {
        assertPath(path2);
        path2 = this.toPosix(path2);
        const matchFile = /^file:\/\/\//.exec(path2);
        if (matchFile) {
          return matchFile[0];
        }
        const matchProtocol = /^[^/:]+:\/{0,2}/.exec(path2);
        if (matchProtocol) {
          return matchProtocol[0];
        }
        return "";
      },
      /**
       * Converts URL to an absolute path.
       * When loading from a Web Worker, we must use absolute paths.
       * If the URL is already absolute we return it as is
       * If it's not, we convert it
       * @param url - The URL to test
       * @param customBaseUrl - The base URL to use
       * @param customRootUrl - The root URL to use
       * @example
       * ```ts
       * // Convert a relative URL to an absolute path
       * path.toAbsolute('images/texture.png', 'http://example.com/assets/');
       * // -> 'http://example.com/assets/images/texture.png'
       * ```
       */
      toAbsolute(url, customBaseUrl, customRootUrl) {
        assertPath(url);
        if (this.isDataUrl(url) || this.isBlobUrl(url)) return url;
        const baseUrl = removeUrlParams(this.toPosix(customBaseUrl ?? DOMAdapter.get().getBaseUrl()));
        const rootUrl = removeUrlParams(this.toPosix(customRootUrl ?? this.rootname(baseUrl)));
        url = this.toPosix(url);
        if (url.startsWith("/")) {
          return path.join(rootUrl, url.slice(1));
        }
        const absolutePath = this.isAbsolute(url) ? url : this.join(baseUrl, url);
        return absolutePath;
      },
      /**
       * Normalizes the given path, resolving '..' and '.' segments
       * @param path - The path to normalize
       * @example
       * ```ts
       * // Normalize a path with relative segments
       * path.normalize('http://www.example.com/foo/bar/../baz');
       * // -> 'http://www.example.com/foo/baz'
       * // Normalize a file path with relative segments
       * path.normalize('C:\\Users\\User\\Documents\\..\\file.txt');
       * // -> 'C:/Users/User/file.txt'
       * ```
       */
      normalize(path2) {
        assertPath(path2);
        if (path2.length === 0) return ".";
        if (this.isDataUrl(path2) || this.isBlobUrl(path2)) return path2;
        path2 = this.toPosix(path2);
        let protocol = "";
        const isAbsolute = path2.startsWith("/");
        if (this.hasProtocol(path2)) {
          protocol = this.rootname(path2);
          path2 = path2.slice(protocol.length);
        }
        const trailingSeparator = path2.endsWith("/");
        path2 = normalizeStringPosix(path2, false);
        if (path2.length > 0 && trailingSeparator) path2 += "/";
        if (isAbsolute) return `/${path2}`;
        return protocol + path2;
      },
      /**
       * Determines if path is an absolute path.
       * Absolute paths can be urls, data urls, or paths on disk
       * @param path - The path to test
       * @example
       * ```ts
       * // Check if a path is absolute
       * path.isAbsolute('http://www.example.com/foo/bar');
       * // -> true
       * path.isAbsolute('C:/Users/User/Documents/file.txt');
       * // -> true
       * ```
       */
      isAbsolute(path2) {
        assertPath(path2);
        path2 = this.toPosix(path2);
        if (this.hasProtocol(path2)) return true;
        return path2.startsWith("/");
      },
      /**
       * Joins all given path segments together using the platform-specific separator as a delimiter,
       * then normalizes the resulting path
       * @param segments - The segments of the path to join
       * @example
       * ```ts
       * // Join multiple path segments
       * path.join('assets', 'images', 'sprite.png');
       * // -> 'assets/images/sprite.png'
       * // Join with relative segments
       * path.join('assets', 'images', '../textures', 'sprite.png');
       * // -> 'assets/textures/sprite.png'
       * ```
       */
      join(...segments) {
        if (segments.length === 0) {
          return ".";
        }
        let joined;
        for (let i2 = 0; i2 < segments.length; ++i2) {
          const arg = segments[i2];
          assertPath(arg);
          if (arg.length > 0) {
            if (joined === void 0) joined = arg;
            else {
              const prevArg = segments[i2 - 1] ?? "";
              if (this.joinExtensions.includes(this.extname(prevArg).toLowerCase())) {
                joined += `/../${arg}`;
              } else {
                joined += `/${arg}`;
              }
            }
          }
        }
        if (joined === void 0) {
          return ".";
        }
        return this.normalize(joined);
      },
      /**
       * Returns the directory name of a path
       * @param path - The path to parse
       * @example
       * ```ts
       * // Get the directory name of a path
       * path.dirname('http://www.example.com/foo/bar/baz.png');
       * // -> 'http://www.example.com/foo/bar'
       * // Get the directory name of a file path
       * path.dirname('C:/Users/User/Documents/file.txt');
       * // -> 'C:/Users/User/Documents'
       * ```
       */
      dirname(path2) {
        assertPath(path2);
        if (path2.length === 0) return ".";
        path2 = this.toPosix(path2);
        let code = path2.charCodeAt(0);
        const hasRoot = code === 47;
        let end = -1;
        let matchedSlash = true;
        const proto = this.getProtocol(path2);
        const origpath = path2;
        path2 = path2.slice(proto.length);
        for (let i2 = path2.length - 1; i2 >= 1; --i2) {
          code = path2.charCodeAt(i2);
          if (code === 47) {
            if (!matchedSlash) {
              end = i2;
              break;
            }
          } else {
            matchedSlash = false;
          }
        }
        if (end === -1) return hasRoot ? "/" : this.isUrl(origpath) ? proto + path2 : proto;
        if (hasRoot && end === 1) return "//";
        return proto + path2.slice(0, end);
      },
      /**
       * Returns the root of the path e.g. /, C:/, file:///, http://domain.com/
       * @param path - The path to parse
       * @example
       * ```ts
       * // Get the root of a URL
       * path.rootname('http://www.example.com/foo/bar/baz.png');
       * // -> 'http://www.example.com/'
       * // Get the root of a file path
       * path.rootname('C:/Users/User/Documents/file.txt');
       * // -> 'C:/'
       * ```
       */
      rootname(path2) {
        assertPath(path2);
        path2 = this.toPosix(path2);
        let root = "";
        if (path2.startsWith("/")) root = "/";
        else {
          root = this.getProtocol(path2);
        }
        if (this.isUrl(path2)) {
          const index = path2.indexOf("/", root.length);
          if (index !== -1) {
            root = path2.slice(0, index);
          } else root = path2;
          if (!root.endsWith("/")) root += "/";
        }
        return root;
      },
      /**
       * Returns the last portion of a path
       * @param path - The path to test
       * @param ext - Optional extension to remove
       * @example
       * ```ts
       * // Get the basename of a URL
       * path.basename('http://www.example.com/foo/bar/baz.png');
       * // -> 'baz.png'
       * // Get the basename of a file path
       * path.basename('C:/Users/User/Documents/file.txt');
       * // -> 'file.txt'
       * ```
       */
      basename(path2, ext) {
        assertPath(path2);
        if (ext) assertPath(ext);
        path2 = removeUrlParams(this.toPosix(path2));
        let start = 0;
        let end = -1;
        let matchedSlash = true;
        let i2;
        if (ext !== void 0 && ext.length > 0 && ext.length <= path2.length) {
          if (ext.length === path2.length && ext === path2) return "";
          let extIdx = ext.length - 1;
          let firstNonSlashEnd = -1;
          for (i2 = path2.length - 1; i2 >= 0; --i2) {
            const code = path2.charCodeAt(i2);
            if (code === 47) {
              if (!matchedSlash) {
                start = i2 + 1;
                break;
              }
            } else {
              if (firstNonSlashEnd === -1) {
                matchedSlash = false;
                firstNonSlashEnd = i2 + 1;
              }
              if (extIdx >= 0) {
                if (code === ext.charCodeAt(extIdx)) {
                  if (--extIdx === -1) {
                    end = i2;
                  }
                } else {
                  extIdx = -1;
                  end = firstNonSlashEnd;
                }
              }
            }
          }
          if (start === end) end = firstNonSlashEnd;
          else if (end === -1) end = path2.length;
          return path2.slice(start, end);
        }
        for (i2 = path2.length - 1; i2 >= 0; --i2) {
          if (path2.charCodeAt(i2) === 47) {
            if (!matchedSlash) {
              start = i2 + 1;
              break;
            }
          } else if (end === -1) {
            matchedSlash = false;
            end = i2 + 1;
          }
        }
        if (end === -1) return "";
        return path2.slice(start, end);
      },
      /**
       * Returns the extension of the path, from the last occurrence of the . (period) character to end of string in the last
       * portion of the path. If there is no . in the last portion of the path, or if there are no . characters other than
       * the first character of the basename of path, an empty string is returned.
       * @param path - The path to parse
       * @example
       * ```ts
       * // Get the extension of a URL
       * path.extname('http://www.example.com/foo/bar/baz.png');
       * // -> '.png'
       * // Get the extension of a file path
       * path.extname('C:/Users/User/Documents/file.txt');
       * // -> '.txt'
       * ```
       */
      extname(path2) {
        assertPath(path2);
        path2 = removeUrlParams(this.toPosix(path2));
        let startDot = -1;
        let startPart = 0;
        let end = -1;
        let matchedSlash = true;
        let preDotState = 0;
        for (let i2 = path2.length - 1; i2 >= 0; --i2) {
          const code = path2.charCodeAt(i2);
          if (code === 47) {
            if (!matchedSlash) {
              startPart = i2 + 1;
              break;
            }
            continue;
          }
          if (end === -1) {
            matchedSlash = false;
            end = i2 + 1;
          }
          if (code === 46) {
            if (startDot === -1) startDot = i2;
            else if (preDotState !== 1) preDotState = 1;
          } else if (startDot !== -1) {
            preDotState = -1;
          }
        }
        if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
          return "";
        }
        return path2.slice(startDot, end);
      },
      /**
       * Parses a path into an object containing the 'root', `dir`, `base`, `ext`, and `name` properties.
       * @param path - The path to parse
       * @example
       * ```ts
       * // Parse a URL
       * const parsed = path.parse('http://www.example.com/foo/bar/baz.png');
       * // -> {
       * //   root: 'http://www.example.com/',
       * //   dir: 'http://www.example.com/foo/bar',
       * //   base: 'baz.png',
       * //   ext: '.png',
       * //   name: 'baz'
       * // }
       * // Parse a file path
       * const parsedFile = path.parse('C:/Users/User/Documents/file.txt');
       * // -> {
       * //   root: 'C:/',
       * //   dir: 'C:/Users/User/Documents',
       * //   base: 'file.txt',
       * //   ext: '.txt',
       * //   name: 'file'
       * // }
       * ```
       */
      parse(path2) {
        assertPath(path2);
        const ret = { root: "", dir: "", base: "", ext: "", name: "" };
        if (path2.length === 0) return ret;
        path2 = removeUrlParams(this.toPosix(path2));
        let code = path2.charCodeAt(0);
        const isAbsolute = this.isAbsolute(path2);
        let start;
        const protocol = "";
        ret.root = this.rootname(path2);
        if (isAbsolute || this.hasProtocol(path2)) {
          start = 1;
        } else {
          start = 0;
        }
        let startDot = -1;
        let startPart = 0;
        let end = -1;
        let matchedSlash = true;
        let i2 = path2.length - 1;
        let preDotState = 0;
        for (; i2 >= start; --i2) {
          code = path2.charCodeAt(i2);
          if (code === 47) {
            if (!matchedSlash) {
              startPart = i2 + 1;
              break;
            }
            continue;
          }
          if (end === -1) {
            matchedSlash = false;
            end = i2 + 1;
          }
          if (code === 46) {
            if (startDot === -1) startDot = i2;
            else if (preDotState !== 1) preDotState = 1;
          } else if (startDot !== -1) {
            preDotState = -1;
          }
        }
        if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
          if (end !== -1) {
            if (startPart === 0 && isAbsolute) ret.base = ret.name = path2.slice(1, end);
            else ret.base = ret.name = path2.slice(startPart, end);
          }
        } else {
          if (startPart === 0 && isAbsolute) {
            ret.name = path2.slice(1, startDot);
            ret.base = path2.slice(1, end);
          } else {
            ret.name = path2.slice(startPart, startDot);
            ret.base = path2.slice(startPart, end);
          }
          ret.ext = path2.slice(startDot, end);
        }
        ret.dir = this.dirname(path2);
        if (protocol) ret.dir = protocol + ret.dir;
        return ret;
      },
      sep: "/",
      delimiter: ":",
      joinExtensions: [".html"]
    };
  }
});

// client/node_modules/pixi.js/lib/assets/utils/convertToList.mjs
var convertToList;
var init_convertToList = __esm({
  "client/node_modules/pixi.js/lib/assets/utils/convertToList.mjs"() {
    "use strict";
    convertToList = (input, transform, forceTransform = false) => {
      if (!Array.isArray(input)) {
        input = [input];
      }
      if (!transform) {
        return input;
      }
      return input.map((item) => {
        if (typeof item === "string" || forceTransform) {
          return transform(item);
        }
        return item;
      });
    };
  }
});

// client/node_modules/pixi.js/lib/assets/utils/createStringVariations.mjs
function processX(base, ids, depth, result2, tags) {
  const id = ids[depth];
  for (let i2 = 0; i2 < id.length; i2++) {
    const value = id[i2];
    if (depth < ids.length - 1) {
      processX(base.replace(result2[depth], value), ids, depth + 1, result2, tags);
    } else {
      tags.push(base.replace(result2[depth], value));
    }
  }
}
function createStringVariations(string) {
  const regex = /\{(.*?)\}/g;
  const result2 = string.match(regex);
  const tags = [];
  if (result2) {
    const ids = [];
    result2.forEach((vars) => {
      const split = vars.substring(1, vars.length - 1).split(",");
      ids.push(split);
    });
    processX(string, ids, 0, result2, tags);
  } else {
    tags.push(string);
  }
  return tags;
}
var init_createStringVariations = __esm({
  "client/node_modules/pixi.js/lib/assets/utils/createStringVariations.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/assets/utils/isSingleItem.mjs
var isSingleItem;
var init_isSingleItem = __esm({
  "client/node_modules/pixi.js/lib/assets/utils/isSingleItem.mjs"() {
    "use strict";
    isSingleItem = (item) => !Array.isArray(item);
  }
});

// client/node_modules/pixi.js/lib/assets/resolver/Resolver.mjs
function getUrlExtension(url) {
  return url.split(".").pop().split("?").shift().split("#").shift();
}
var Resolver;
var init_Resolver = __esm({
  "client/node_modules/pixi.js/lib/assets/resolver/Resolver.mjs"() {
    init_warn();
    init_path();
    init_convertToList();
    init_createStringVariations();
    init_isSingleItem();
    Resolver = class {
      constructor() {
        this._defaultBundleIdentifierOptions = {
          connector: "-",
          createBundleAssetId: (bundleId, assetId) => `${bundleId}${this._bundleIdConnector}${assetId}`,
          extractAssetIdFromBundle: (bundleId, assetBundleId) => assetBundleId.replace(`${bundleId}${this._bundleIdConnector}`, "")
        };
        this._bundleIdConnector = this._defaultBundleIdentifierOptions.connector;
        this._createBundleAssetId = this._defaultBundleIdentifierOptions.createBundleAssetId;
        this._extractAssetIdFromBundle = this._defaultBundleIdentifierOptions.extractAssetIdFromBundle;
        this._assetMap = {};
        this._preferredOrder = [];
        this._parsers = [];
        this._resolverHash = {};
        this._bundles = {};
      }
      /**
       * Override how the resolver deals with generating bundle ids.
       * must be called before any bundles are added
       * @param bundleIdentifier - the bundle identifier options
       */
      setBundleIdentifier(bundleIdentifier) {
        this._bundleIdConnector = bundleIdentifier.connector ?? this._bundleIdConnector;
        this._createBundleAssetId = bundleIdentifier.createBundleAssetId ?? this._createBundleAssetId;
        this._extractAssetIdFromBundle = bundleIdentifier.extractAssetIdFromBundle ?? this._extractAssetIdFromBundle;
        if (this._extractAssetIdFromBundle("foo", this._createBundleAssetId("foo", "bar")) !== "bar") {
          throw new Error("[Resolver] GenerateBundleAssetId are not working correctly");
        }
      }
      /**
       * Let the resolver know which assets you prefer to use when resolving assets.
       * Multiple prefer user defined rules can be added.
       * @example
       * resolver.prefer({
       *     // first look for something with the correct format, and then then correct resolution
       *     priority: ['format', 'resolution'],
       *     params:{
       *         format:'webp', // prefer webp images
       *         resolution: 2, // prefer a resolution of 2
       *     }
       * })
       * resolver.add('foo', ['bar@2x.webp', 'bar@2x.png', 'bar.webp', 'bar.png']);
       * resolver.resolveUrl('foo') // => 'bar@2x.webp'
       * @param preferOrders - the prefer options
       */
      prefer(...preferOrders) {
        preferOrders.forEach((prefer) => {
          this._preferredOrder.push(prefer);
          if (!prefer.priority) {
            prefer.priority = Object.keys(prefer.params);
          }
        });
        this._resolverHash = {};
      }
      /**
       * Set the base path to prepend to all urls when resolving
       * @example
       * resolver.basePath = 'https://home.com/';
       * resolver.add('foo', 'bar.ong');
       * resolver.resolveUrl('foo', 'bar.png'); // => 'https://home.com/bar.png'
       * @param basePath - the base path to use
       */
      set basePath(basePath) {
        this._basePath = basePath;
      }
      get basePath() {
        return this._basePath;
      }
      /**
       * Set the root path for root-relative URLs. By default the `basePath`'s root is used. If no `basePath` is set, then the
       * default value for browsers is `window.location.origin`
       * @example
       * // Application hosted on https://home.com/some-path/index.html
       * resolver.basePath = 'https://home.com/some-path/';
       * resolver.rootPath = 'https://home.com/';
       * resolver.add('foo', '/bar.png');
       * resolver.resolveUrl('foo', '/bar.png'); // => 'https://home.com/bar.png'
       * @param rootPath - the root path to use
       */
      set rootPath(rootPath) {
        this._rootPath = rootPath;
      }
      get rootPath() {
        return this._rootPath;
      }
      /**
       * All the active URL parsers that help the parser to extract information and create
       * an asset object-based on parsing the URL itself.
       *
       * Can be added using the extensions API
       * @example
       * resolver.add('foo', [
       *     {
       *         resolution: 2,
       *         format: 'png',
       *         src: 'image@2x.png',
       *     },
       *     {
       *         resolution:1,
       *         format:'png',
       *         src: 'image.png',
       *     },
       * ]);
       *
       * // With a url parser the information such as resolution and file format could extracted from the url itself:
       * extensions.add({
       *     extension: ExtensionType.ResolveParser,
       *     test: loadTextures.test, // test if url ends in an image
       *     parse: (value: string) =>
       *     ({
       *         resolution: parseFloat(Resolver.RETINA_PREFIX.exec(value)?.[1] ?? '1'),
       *         format: value.split('.').pop(),
       *         src: value,
       *     }),
       * });
       *
       * // Now resolution and format can be extracted from the url
       * resolver.add('foo', [
       *     'image@2x.png',
       *     'image.png',
       * ]);
       */
      get parsers() {
        return this._parsers;
      }
      /** Used for testing, this resets the resolver to its initial state */
      reset() {
        this.setBundleIdentifier(this._defaultBundleIdentifierOptions);
        this._assetMap = {};
        this._preferredOrder = [];
        this._resolverHash = {};
        this._rootPath = null;
        this._basePath = null;
        this._manifest = null;
        this._bundles = {};
        this._defaultSearchParams = null;
      }
      /**
       * Sets the default URL search parameters for the URL resolver. The urls can be specified as a string or an object.
       * @param searchParams - the default url parameters to append when resolving urls
       */
      setDefaultSearchParams(searchParams) {
        if (typeof searchParams === "string") {
          this._defaultSearchParams = searchParams;
        } else {
          const queryValues = searchParams;
          this._defaultSearchParams = Object.keys(queryValues).map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(queryValues[key])}`).join("&");
        }
      }
      /**
       * Returns the aliases for a given asset
       * @param asset - the asset to get the aliases for
       */
      getAlias(asset) {
        const { alias, src } = asset;
        const aliasesToUse = convertToList(
          alias || src,
          (value) => {
            if (typeof value === "string") return value;
            if (Array.isArray(value)) return value.map((v2) => v2?.src ?? v2);
            if (value?.src) return value.src;
            return value;
          },
          true
        );
        return aliasesToUse;
      }
      /**
       * Removes the specified alias for an asset.
       *
       * This only removes the alias mapping. It does **not** remove, unload, or destroy the
       * underlying asset. If the asset is already cached, it stays in memory until you call
       * `Assets.unload`.
       *
       * If `asset` is provided, the alias is only removed when the resolver's current mapping for
       * that alias matches the given `ResolvedAsset`. This lets you avoid accidentally removing an
       * alias that has been reassigned.
       *
       * Silently returns if the alias does not exist or the asset does not match.
       * @param alias - the alias to remove
       * @param asset - only remove the alias if it is currently assigned to this asset
       * @example
       * ```ts
       * resolver.add({ alias: 'hero', src: 'hero.png' });
       *
       * // Simple removal
       * resolver.removeAlias('hero');
       *
       * // Conditional removal — only if alias currently maps to a specific asset
       * const resolved = resolver.resolve('hero');
       * resolver.removeAlias('hero', resolved);
       * ```
       */
      removeAlias(alias, asset) {
        if (!this._assetMap[alias]) {
          return;
        }
        if (asset && asset !== this._resolverHash[alias]) {
          return;
        }
        delete this._resolverHash[alias];
        delete this._assetMap[alias];
      }
      /**
       * Add a manifest to the asset resolver. This is a nice way to add all the asset information in one go.
       * generally a manifest would be built using a tool.
       * @param manifest - the manifest to add to the resolver
       */
      addManifest(manifest2) {
        if (this._manifest) {
          warn("[Resolver] Manifest already exists, this will be overwritten");
        }
        this._manifest = manifest2;
        manifest2.bundles.forEach((bundle) => {
          this.addBundle(bundle.name, bundle.assets);
        });
      }
      /**
       * This adds a bundle of assets in one go so that you can resolve them as a group.
       * For example you could add a bundle for each screen in you pixi app
       * @example
       * resolver.addBundle('animals', [
       *  { alias: 'bunny', src: 'bunny.png' },
       *  { alias: 'chicken', src: 'chicken.png' },
       *  { alias: 'thumper', src: 'thumper.png' },
       * ]);
       * // or
       * resolver.addBundle('animals', {
       *     bunny: 'bunny.png',
       *     chicken: 'chicken.png',
       *     thumper: 'thumper.png',
       * });
       *
       * const resolvedAssets = await resolver.resolveBundle('animals');
       * @param bundleId - The id of the bundle to add
       * @param assets - A record of the asset or assets that will be chosen from when loading via the specified key
       */
      addBundle(bundleId, assets) {
        const assetNames = [];
        let convertedAssets = assets;
        if (!Array.isArray(assets)) {
          convertedAssets = Object.entries(assets).map(([alias, src]) => {
            if (typeof src === "string" || Array.isArray(src)) {
              return { alias, src };
            }
            return { alias, ...src };
          });
        }
        convertedAssets.forEach((asset) => {
          const srcs = asset.src;
          const aliases = asset.alias;
          let ids;
          if (typeof aliases === "string") {
            const bundleAssetId = this._createBundleAssetId(bundleId, aliases);
            assetNames.push(bundleAssetId);
            ids = [aliases, bundleAssetId];
          } else {
            const bundleIds = aliases.map((name) => this._createBundleAssetId(bundleId, name));
            assetNames.push(...bundleIds);
            ids = [...aliases, ...bundleIds];
          }
          this.add({
            ...asset,
            ...{
              alias: ids,
              src: srcs
            }
          });
        });
        this._bundles[bundleId] = assetNames;
      }
      /**
       * Tells the resolver what keys are associated with witch asset.
       * The most important thing the resolver does
       * @example
       * // Single key, single asset:
       * resolver.add({alias: 'foo', src: 'bar.png');
       * resolver.resolveUrl('foo') // => 'bar.png'
       *
       * // Multiple keys, single asset:
       * resolver.add({alias: ['foo', 'boo'], src: 'bar.png'});
       * resolver.resolveUrl('foo') // => 'bar.png'
       * resolver.resolveUrl('boo') // => 'bar.png'
       *
       * // Multiple keys, multiple assets:
       * resolver.add({alias: ['foo', 'boo'], src: ['bar.png', 'bar.webp']});
       * resolver.resolveUrl('foo') // => 'bar.png'
       *
       * // Add custom data attached to the resolver
       * Resolver.add({
       *     alias: 'bunnyBooBooSmooth',
       *     src: 'bunny{png,webp}',
       *     data: { scaleMode:SCALE_MODES.NEAREST }, // Base texture options
       * });
       *
       * resolver.resolve('bunnyBooBooSmooth') // => { src: 'bunny.png', data: { scaleMode: SCALE_MODES.NEAREST } }
       * @param aliases - the UnresolvedAsset or array of UnresolvedAssets to add to the resolver
       */
      add(aliases) {
        const assets = [];
        if (Array.isArray(aliases)) {
          assets.push(...aliases);
        } else {
          assets.push(aliases);
        }
        let keyCheck;
        keyCheck = (key) => {
          if (this.hasKey(key)) {
            warn(`[Resolver] already has key: ${key} overwriting`);
          }
        };
        const assetArray = convertToList(assets);
        assetArray.forEach((asset) => {
          const { src } = asset;
          let {
            data,
            format,
            loadParser: userDefinedLoadParser,
            parser: userDefinedParser
          } = asset;
          const srcsToUse = convertToList(src).map((src2) => {
            if (typeof src2 === "string") {
              return createStringVariations(src2);
            }
            return Array.isArray(src2) ? src2 : [src2];
          });
          const aliasesToUse = this.getAlias(asset);
          Array.isArray(aliasesToUse) ? aliasesToUse.forEach(keyCheck) : keyCheck(aliasesToUse);
          const resolvedAssets = [];
          const parseUrl = (url) => {
            const parser = this._parsers.find((p2) => p2.test(url));
            return {
              src: url,
              ...parser?.parse(url)
            };
          };
          srcsToUse.forEach((srcs) => {
            srcs.forEach((src2) => {
              let formattedAsset = {};
              if (typeof src2 !== "object") {
                formattedAsset = parseUrl(src2);
              } else {
                data = src2.data ?? data;
                format = src2.format ?? format;
                if (src2.loadParser || src2.parser) {
                  userDefinedLoadParser = src2.loadParser ?? userDefinedLoadParser;
                  userDefinedParser = src2.parser ?? userDefinedParser;
                }
                formattedAsset = {
                  ...parseUrl(src2.src),
                  ...src2
                };
              }
              if (!aliasesToUse) {
                throw new Error(`[Resolver] alias is undefined for this asset: ${formattedAsset.src}`);
              }
              formattedAsset = this._buildResolvedAsset(formattedAsset, {
                aliases: aliasesToUse,
                data,
                format,
                loadParser: userDefinedLoadParser,
                parser: userDefinedParser,
                progressSize: asset.progressSize
              });
              resolvedAssets.push(formattedAsset);
            });
          });
          aliasesToUse.forEach((alias) => {
            this._assetMap[alias] = resolvedAssets;
          });
        });
      }
      // TODO: this needs an overload like load did in Assets
      /**
       * If the resolver has had a manifest set via setManifest, this will return the assets urls for
       * a given bundleId or bundleIds.
       * @example
       * // Manifest Example
       * const manifest = {
       *     bundles: [
       *         {
       *             name: 'load-screen',
       *             assets: [
       *                 {
       *                     alias: 'background',
       *                     src: 'sunset.png',
       *                 },
       *                 {
       *                     alias: 'bar',
       *                     src: 'load-bar.{png,webp}',
       *                 },
       *             ],
       *         },
       *         {
       *             name: 'game-screen',
       *             assets: [
       *                 {
       *                     alias: 'character',
       *                     src: 'robot.png',
       *                 },
       *                 {
       *                     alias: 'enemy',
       *                     src: 'bad-guy.png',
       *                 },
       *             ],
       *         },
       *     ]
       * };
       *
       * resolver.setManifest(manifest);
       * const resolved = resolver.resolveBundle('load-screen');
       * @param bundleIds - The bundle ids to resolve
       * @returns All the bundles assets or a hash of assets for each bundle specified
       */
      resolveBundle(bundleIds) {
        const singleAsset = isSingleItem(bundleIds);
        bundleIds = convertToList(bundleIds);
        const out = {};
        bundleIds.forEach((bundleId) => {
          const assetNames = this._bundles[bundleId];
          if (assetNames) {
            const results = this.resolve(assetNames);
            const assets = {};
            for (const key in results) {
              const asset = results[key];
              assets[this._extractAssetIdFromBundle(bundleId, key)] = asset;
            }
            out[bundleId] = assets;
          }
        });
        return singleAsset ? out[bundleIds[0]] : out;
      }
      /**
       * Does exactly what resolve does, but returns just the URL rather than the whole asset object
       * @param key - The key or keys to resolve
       * @returns - The URLs associated with the key(s)
       */
      resolveUrl(key) {
        const result2 = this.resolve(key);
        if (typeof key !== "string") {
          const out = {};
          for (const i2 in result2) {
            out[i2] = result2[i2].src;
          }
          return out;
        }
        return result2.src;
      }
      resolve(keys) {
        const singleAsset = isSingleItem(keys);
        keys = convertToList(keys);
        const result2 = {};
        keys.forEach((key) => {
          if (!this._resolverHash[key]) {
            if (this._assetMap[key]) {
              let assets = this._assetMap[key];
              const preferredOrder = this._getPreferredOrder(assets);
              preferredOrder?.priority.forEach((priorityKey) => {
                preferredOrder.params[priorityKey].forEach((value) => {
                  const filteredAssets = assets.filter((asset) => {
                    if (asset[priorityKey]) {
                      return asset[priorityKey] === value;
                    }
                    return false;
                  });
                  if (filteredAssets.length) {
                    assets = filteredAssets;
                  }
                });
              });
              this._resolverHash[key] = assets[0];
            } else {
              this._resolverHash[key] = this._buildResolvedAsset({
                alias: [key],
                src: key
              }, {});
            }
          }
          result2[key] = this._resolverHash[key];
        });
        return singleAsset ? result2[keys[0]] : result2;
      }
      /**
       * Checks if an asset with a given key exists in the resolver
       * @param key - The key of the asset
       */
      hasKey(key) {
        return !!this._assetMap[key];
      }
      /**
       * Checks if a bundle with the given key exists in the resolver
       * @param key - The key of the bundle
       */
      hasBundle(key) {
        return !!this._bundles[key];
      }
      /**
       * Internal function for figuring out what prefer criteria an asset should use.
       * @param assets
       */
      _getPreferredOrder(assets) {
        for (let i2 = 0; i2 < assets.length; i2++) {
          const asset = assets[i2];
          const preferred = this._preferredOrder.find((preference) => preference.params.format.includes(asset.format));
          if (preferred) {
            return preferred;
          }
        }
        return this._preferredOrder[0];
      }
      /**
       * Appends the default url parameters to the url
       * @param url - The url to append the default parameters to
       * @returns - The url with the default parameters appended
       */
      _appendDefaultSearchParams(url) {
        if (!this._defaultSearchParams) return url;
        const paramConnector = /\?/.test(url) ? "&" : "?";
        return `${url}${paramConnector}${this._defaultSearchParams}`;
      }
      _buildResolvedAsset(formattedAsset, data) {
        const { aliases, data: assetData, loadParser, parser, format, progressSize } = data;
        if (this._basePath || this._rootPath) {
          formattedAsset.src = path.toAbsolute(formattedAsset.src, this._basePath, this._rootPath);
        }
        formattedAsset.alias = aliases ?? formattedAsset.alias ?? [formattedAsset.src];
        formattedAsset.src = this._appendDefaultSearchParams(formattedAsset.src);
        formattedAsset.data = { ...assetData || {}, ...formattedAsset.data };
        formattedAsset.loadParser = loadParser ?? formattedAsset.loadParser;
        formattedAsset.parser = parser ?? formattedAsset.parser;
        formattedAsset.format = format ?? formattedAsset.format ?? getUrlExtension(formattedAsset.src);
        if (progressSize !== void 0) {
          formattedAsset.progressSize = progressSize;
        }
        return formattedAsset;
      }
    };
    Resolver.RETINA_PREFIX = /@([0-9\.]+)x/;
  }
});

// client/node_modules/pixi.js/lib/assets/utils/copySearchParams.mjs
var copySearchParams;
var init_copySearchParams = __esm({
  "client/node_modules/pixi.js/lib/assets/utils/copySearchParams.mjs"() {
    "use strict";
    copySearchParams = (targetUrl, sourceUrl) => {
      const searchParams = sourceUrl.split("?")[1];
      if (searchParams) {
        targetUrl += `?${searchParams}`;
      }
      return targetUrl;
    };
  }
});

// client/node_modules/pixi.js/lib/spritesheet/Spritesheet.mjs
var _Spritesheet, Spritesheet;
var init_Spritesheet = __esm({
  "client/node_modules/pixi.js/lib/spritesheet/Spritesheet.mjs"() {
    init_Rectangle();
    init_TextureSource();
    init_Texture();
    _Spritesheet = class _Spritesheet2 {
      constructor(optionsOrTexture, arg1) {
        this.linkedSheets = [];
        let options = optionsOrTexture;
        if (optionsOrTexture?.source instanceof TextureSource) {
          options = {
            texture: optionsOrTexture,
            data: arg1
          };
        }
        const { texture, data, cachePrefix = "" } = options;
        this.cachePrefix = cachePrefix;
        this._texture = texture instanceof Texture ? texture : null;
        this.textureSource = texture.source;
        this.textures = {};
        this.animations = {};
        this.data = data;
        const metaResolution = parseFloat(data.meta.scale);
        if (metaResolution) {
          this.resolution = metaResolution;
          texture.source.resolution = this.resolution;
        } else {
          this.resolution = texture.source._resolution;
        }
        this._frames = this.data.frames;
        this._frameKeys = Object.keys(this._frames);
        this._batchIndex = 0;
        this._callback = null;
      }
      /**
       * Parse spritesheet from loaded data. This is done asynchronously
       * to prevent creating too many Texture within a single process.
       */
      parse() {
        return new Promise((resolve) => {
          this._callback = resolve;
          this._batchIndex = 0;
          if (this._frameKeys.length <= _Spritesheet2.BATCH_SIZE) {
            this._processFrames(0);
            this._processAnimations();
            this._parseComplete();
          } else {
            this._nextBatch();
          }
        });
      }
      /**
       * Parse spritesheet from loaded data. This is done synchronously
       * and is only suitable for smaller spritesheets (less than ~1000 frames)
       * or may cause too many Texture within a single process. However, synchronous parsing may be
       * more convenient since the called does not need to be asynchronous and is safe for
       * small-to-medium sized spritesheets.
       *
       * Other than being synchronous, `parseSync` is otherwise identical to `.parse()`.
       */
      parseSync() {
        this._processFrames(0, true);
        this._processAnimations();
        return this.textures;
      }
      /**
       * Process a batch of frames
       * @param initialFrameIndex - The index of frame to start.
       * @param processAll - if true will process all frames in a single batch, ignoring BATCH_SIZE - this
       * is used for synchronous parsing.
       */
      _processFrames(initialFrameIndex, processAll = false) {
        let frameIndex = initialFrameIndex;
        const maxFrames = processAll ? Infinity : _Spritesheet2.BATCH_SIZE;
        while (frameIndex - initialFrameIndex < maxFrames && frameIndex < this._frameKeys.length) {
          const i2 = this._frameKeys[frameIndex];
          const data = this._frames[i2];
          const rect = data.frame;
          if (rect) {
            let frame = null;
            let trim = null;
            const sourceSize = data.trimmed !== false && data.sourceSize ? data.sourceSize : data.frame;
            const orig = new Rectangle(
              0,
              0,
              Math.floor(sourceSize.w) / this.resolution,
              Math.floor(sourceSize.h) / this.resolution
            );
            if (data.rotated) {
              frame = new Rectangle(
                Math.floor(rect.x) / this.resolution,
                Math.floor(rect.y) / this.resolution,
                Math.floor(rect.h) / this.resolution,
                Math.floor(rect.w) / this.resolution
              );
            } else {
              frame = new Rectangle(
                Math.floor(rect.x) / this.resolution,
                Math.floor(rect.y) / this.resolution,
                Math.floor(rect.w) / this.resolution,
                Math.floor(rect.h) / this.resolution
              );
            }
            if (data.trimmed !== false && data.spriteSourceSize) {
              trim = new Rectangle(
                Math.floor(data.spriteSourceSize.x) / this.resolution,
                Math.floor(data.spriteSourceSize.y) / this.resolution,
                Math.floor(rect.w) / this.resolution,
                Math.floor(rect.h) / this.resolution
              );
            }
            this.textures[i2] = new Texture({
              source: this.textureSource,
              frame,
              orig,
              trim,
              rotate: data.rotated ? 2 : 0,
              defaultAnchor: data.anchor,
              defaultBorders: data.borders,
              label: i2.toString()
            });
          }
          frameIndex++;
        }
      }
      /** Parse animations config. */
      _processAnimations() {
        const animations = this.data.animations || {};
        for (const animName in animations) {
          this.animations[animName] = [];
          for (let i2 = 0; i2 < animations[animName].length; i2++) {
            const frameName = animations[animName][i2];
            this.animations[animName].push(this.textures[frameName]);
          }
        }
      }
      /** The parse has completed. */
      _parseComplete() {
        const callback = this._callback;
        this._callback = null;
        this._batchIndex = 0;
        callback.call(this, this.textures);
      }
      /** Begin the next batch of textures. */
      _nextBatch() {
        this._processFrames(this._batchIndex * _Spritesheet2.BATCH_SIZE);
        this._batchIndex++;
        setTimeout(() => {
          if (this._batchIndex * _Spritesheet2.BATCH_SIZE < this._frameKeys.length) {
            this._nextBatch();
          } else {
            this._processAnimations();
            this._parseComplete();
          }
        }, 0);
      }
      /**
       * Destroy Spritesheet and don't use after this.
       * @param {boolean} [destroyBase=false] - Whether to destroy the base texture as well
       */
      destroy(destroyBase = false) {
        for (const i2 in this.textures) {
          this.textures[i2].destroy();
        }
        this._frames = null;
        this._frameKeys = null;
        this.data = null;
        this.textures = null;
        if (destroyBase) {
          this._texture?.destroy();
          this.textureSource.destroy();
        }
        this._texture = null;
        this.textureSource = null;
        this.linkedSheets = [];
      }
    };
    _Spritesheet.BATCH_SIZE = 1e3;
    Spritesheet = _Spritesheet;
  }
});

// client/node_modules/pixi.js/lib/spritesheet/spritesheetAsset.mjs
function getCacheableAssets(keys, asset, ignoreMultiPack) {
  const out = {};
  keys.forEach((key) => {
    out[key] = asset;
  });
  Object.keys(asset.textures).forEach((key) => {
    out[`${asset.cachePrefix}${key}`] = asset.textures[key];
  });
  if (!ignoreMultiPack) {
    const basePath = path.dirname(keys[0]);
    asset.linkedSheets.forEach((item, i2) => {
      const out2 = getCacheableAssets([`${basePath}/${asset.data.meta.related_multi_packs[i2]}`], item, true);
      Object.assign(out, out2);
    });
  }
  return out;
}
var validImages, spritesheetAsset;
var init_spritesheetAsset = __esm({
  "client/node_modules/pixi.js/lib/spritesheet/spritesheetAsset.mjs"() {
    init_LoaderParser();
    init_Resolver();
    init_copySearchParams();
    init_Extensions();
    init_Texture();
    init_path();
    init_Spritesheet();
    validImages = [
      "jpg",
      "png",
      "jpeg",
      "avif",
      "webp",
      "basis",
      "etc2",
      "bc7",
      "bc6h",
      "bc5",
      "bc4",
      "bc3",
      "bc2",
      "bc1",
      "eac",
      "astc"
    ];
    spritesheetAsset = {
      extension: ExtensionType.Asset,
      /** Handle the caching of the related Spritesheet Textures */
      cache: {
        test: (asset) => asset instanceof Spritesheet,
        getCacheableAssets: (keys, asset) => getCacheableAssets(keys, asset, false)
      },
      /** Resolve the resolution of the asset. */
      resolver: {
        extension: {
          type: ExtensionType.ResolveParser,
          name: "resolveSpritesheet"
        },
        test: (value) => {
          const tempURL = value.split("?")[0];
          const split = tempURL.split(".");
          const extension = split.pop();
          const format = split.pop();
          return extension === "json" && validImages.includes(format);
        },
        parse: (value) => {
          const split = value.split(".");
          return {
            resolution: parseFloat(Resolver.RETINA_PREFIX.exec(value)?.[1] ?? "1"),
            format: split[split.length - 2],
            src: value
          };
        }
      },
      /**
       * Loader plugin that parses sprite sheets!
       * once the JSON has been loaded this checks to see if the JSON is spritesheet data.
       * If it is, we load the spritesheets image and parse the data into Spritesheet
       * All textures in the sprite sheet are then added to the cache
       */
      loader: {
        /** used for deprecation purposes */
        name: "spritesheetLoader",
        id: "spritesheet",
        extension: {
          type: ExtensionType.LoadParser,
          priority: LoaderParserPriority.Normal,
          name: "spritesheetLoader"
        },
        async testParse(asset, options) {
          return path.extname(options.src).toLowerCase() === ".json" && !!asset.frames;
        },
        async parse(asset, options, loader) {
          const {
            texture: imageTexture,
            // if user need to use preloaded texture
            imageFilename,
            // if user need to use custom filename (not from jsonFile.meta.image)
            textureOptions,
            // if user need to set texture options on texture
            cachePrefix
            // if user need to use custom cache prefix
          } = options?.data ?? {};
          let basePath = path.dirname(options.src);
          if (basePath && basePath.lastIndexOf("/") !== basePath.length - 1) {
            basePath += "/";
          }
          let texture;
          if (imageTexture instanceof Texture) {
            texture = imageTexture;
          } else {
            const imagePath = copySearchParams(basePath + (imageFilename ?? asset.meta.image), options.src);
            const assets = await loader.load([{ src: imagePath, data: textureOptions }]);
            texture = assets[imagePath];
          }
          const spritesheet = new Spritesheet({
            texture: texture.source,
            data: asset,
            cachePrefix
          });
          await spritesheet.parse();
          const multiPacks = asset?.meta?.related_multi_packs;
          if (Array.isArray(multiPacks)) {
            const promises = [];
            for (const item of multiPacks) {
              if (typeof item !== "string") {
                continue;
              }
              let itemUrl = basePath + item;
              if (options.data?.ignoreMultiPack) {
                continue;
              }
              itemUrl = copySearchParams(itemUrl, options.src);
              promises.push(loader.load({
                src: itemUrl,
                data: {
                  textureOptions,
                  ignoreMultiPack: true
                }
              }));
            }
            const res = await Promise.all(promises);
            spritesheet.linkedSheets = res;
            res.forEach((item) => {
              item.linkedSheets = [spritesheet].concat(spritesheet.linkedSheets.filter((sp) => sp !== item));
            });
          }
          return spritesheet;
        },
        async unload(spritesheet, _resolvedAsset, loader) {
          await loader.unload(spritesheet.textureSource._sourceOrigin);
          spritesheet.destroy(false);
        }
      }
    };
  }
});

// client/node_modules/pixi.js/lib/spritesheet/init.mjs
var init_init4 = __esm({
  "client/node_modules/pixi.js/lib/spritesheet/init.mjs"() {
    init_Extensions();
    init_spritesheetAsset();
    extensions.add(spritesheetAsset);
  }
});

// client/node_modules/pixi.js/lib/utils/data/updateQuadBounds.mjs
function updateQuadBounds(bounds, anchor, texture) {
  const { width, height } = texture.orig;
  const trim = texture.trim;
  if (trim) {
    const sourceWidth = trim.width;
    const sourceHeight = trim.height;
    bounds.minX = trim.x - anchor._x * width;
    bounds.maxX = bounds.minX + sourceWidth;
    bounds.minY = trim.y - anchor._y * height;
    bounds.maxY = bounds.minY + sourceHeight;
  } else {
    bounds.minX = -anchor._x * width;
    bounds.maxX = bounds.minX + width;
    bounds.minY = -anchor._y * height;
    bounds.maxY = bounds.minY + height;
  }
}
var init_updateQuadBounds = __esm({
  "client/node_modules/pixi.js/lib/utils/data/updateQuadBounds.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/scene/sprite/Sprite.mjs
var Sprite;
var init_Sprite = __esm({
  "client/node_modules/pixi.js/lib/scene/sprite/Sprite.mjs"() {
    init_ObservablePoint();
    init_Texture();
    init_updateQuadBounds();
    init_deprecation();
    init_ViewContainer();
    Sprite = class _Sprite extends ViewContainer {
      /**
       * @param options - The options for creating the sprite.
       */
      constructor(options = Texture.EMPTY) {
        if (options instanceof Texture) {
          options = { texture: options };
        }
        const { texture = Texture.EMPTY, anchor, roundPixels, width, height, ...rest } = options;
        super({
          label: "Sprite",
          ...rest
        });
        this.renderPipeId = "sprite";
        this.batched = true;
        this._visualBounds = { minX: 0, maxX: 1, minY: 0, maxY: 0 };
        this._anchor = new ObservablePoint(
          {
            _onUpdate: () => {
              this.onViewUpdate();
            }
          }
        );
        if (anchor) {
          this.anchor = anchor;
        } else if (texture.defaultAnchor) {
          this.anchor = texture.defaultAnchor;
        }
        this.texture = texture;
        this.allowChildren = false;
        this.roundPixels = roundPixels ?? false;
        if (width !== void 0) this.width = width;
        if (height !== void 0) this.height = height;
      }
      /**
       * Creates a new sprite based on a source texture, image, video, or canvas element.
       * This is a convenience method that automatically creates and manages textures.
       * @example
       * ```ts
       * // Create from path or URL
       * const sprite = Sprite.from('assets/image.png');
       *
       * // Create from existing texture
       * const sprite = Sprite.from(texture);
       *
       * // Create from canvas
       * const canvas = document.createElement('canvas');
       * const sprite = Sprite.from(canvas, true); // Skip caching new texture
       * ```
       * @param source - The source to create the sprite from. Can be a path to an image, a texture,
       * or any valid texture source (canvas, video, etc.)
       * @param skipCache - Whether to skip adding to the texture cache when creating a new texture
       * @returns A new sprite based on the source
       * @see {@link Texture.from} For texture creation details
       * @see {@link Assets} For asset loading and management
       */
      static from(source2, skipCache = false) {
        if (source2 instanceof Texture) {
          return new _Sprite(source2);
        }
        return new _Sprite(Texture.from(source2, skipCache));
      }
      set texture(value) {
        value || (value = Texture.EMPTY);
        const currentTexture = this._texture;
        if (currentTexture === value) return;
        if (currentTexture && currentTexture.dynamic) currentTexture.off("update", this.onViewUpdate, this);
        if (value.dynamic) value.on("update", this.onViewUpdate, this);
        this._texture = value;
        if (this._width) {
          this._setWidth(this._width, this._texture.orig.width);
        }
        if (this._height) {
          this._setHeight(this._height, this._texture.orig.height);
        }
        this.onViewUpdate();
      }
      /**
       * The texture that is displayed by the sprite. When changed, automatically updates
       * the sprite dimensions and manages texture event listeners.
       * @example
       * ```ts
       * // Create sprite with texture
       * const sprite = new Sprite({
       *     texture: Texture.from('sprite.png')
       * });
       *
       * // Update texture
       * sprite.texture = Texture.from('newSprite.png');
       *
       * // Use texture from spritesheet
       * const sheet = await Assets.load('spritesheet.json');
       * sprite.texture = sheet.textures['frame1.png'];
       *
       * // Reset to empty texture
       * sprite.texture = Texture.EMPTY;
       * ```
       * @see {@link Texture} For texture creation and management
       * @see {@link Assets} For asset loading
       */
      get texture() {
        return this._texture;
      }
      /**
       * The bounds of the sprite, taking into account the texture's trim area.
       * @example
       * ```ts
       * const texture = new Texture({
       *     source: new TextureSource({ width: 300, height: 300 }),
       *     frame: new Rectangle(196, 66, 58, 56),
       *     trim: new Rectangle(4, 4, 58, 56),
       *     orig: new Rectangle(0, 0, 64, 64),
       *     rotate: 2,
       * });
       * const sprite = new Sprite(texture);
       * const visualBounds = sprite.visualBounds;
       * // console.log(visualBounds); // { minX: -4, maxX: 62, minY: -4, maxY: 60 }
       */
      get visualBounds() {
        updateQuadBounds(this._visualBounds, this._anchor, this._texture);
        return this._visualBounds;
      }
      /**
       * @deprecated
       * @ignore
       */
      get sourceBounds() {
        deprecation("8.6.1", "Sprite.sourceBounds is deprecated, use visualBounds instead.");
        return this.visualBounds;
      }
      /** @private */
      updateBounds() {
        const anchor = this._anchor;
        const texture = this._texture;
        const bounds = this._bounds;
        const { width, height } = texture.orig;
        bounds.minX = -anchor._x * width;
        bounds.maxX = bounds.minX + width;
        bounds.minY = -anchor._y * height;
        bounds.maxY = bounds.minY + height;
      }
      /**
       * Destroys this sprite renderable and optionally its texture.
       * @param options - Options parameter. A boolean will act as if all options
       *  have been set to that value
       * @example
       * sprite.destroy();
       * sprite.destroy(true);
       * sprite.destroy({ texture: true, textureSource: true });
       */
      destroy(options = false) {
        super.destroy(options);
        const destroyTexture = typeof options === "boolean" ? options : options?.texture;
        if (destroyTexture) {
          const destroyTextureSource = typeof options === "boolean" ? options : options?.textureSource;
          this._texture.destroy(destroyTextureSource);
        }
        this._texture = null;
        this._visualBounds = null;
        this._bounds = null;
        this._anchor = null;
      }
      /**
       * The anchor sets the origin point of the sprite. The default value is taken from the {@link Texture}
       * and passed to the constructor.
       *
       * - The default is `(0,0)`, this means the sprite's origin is the top left.
       * - Setting the anchor to `(0.5,0.5)` means the sprite's origin is centered.
       * - Setting the anchor to `(1,1)` would mean the sprite's origin point will be the bottom right corner.
       *
       * If you pass only single parameter, it will set both x and y to the same value as shown in the example below.
       * @example
       * ```ts
       * // Center the anchor point
       * sprite.anchor = 0.5; // Sets both x and y to 0.5
       * sprite.position.set(400, 300); // Sprite will be centered at this position
       *
       * // Set specific x/y anchor points
       * sprite.anchor = {
       *     x: 1, // Right edge
       *     y: 0  // Top edge
       * };
       *
       * // Using individual coordinates
       * sprite.anchor.set(0.5, 1); // Center-bottom
       *
       * // For rotation around center
       * sprite.anchor.set(0.5);
       * sprite.rotation = Math.PI / 4; // 45 degrees around center
       *
       * // For scaling from center
       * sprite.anchor.set(0.5);
       * sprite.scale.set(2); // Scales from center point
       * ```
       */
      get anchor() {
        return this._anchor;
      }
      set anchor(value) {
        typeof value === "number" ? this._anchor.set(value) : this._anchor.copyFrom(value);
      }
      /**
       * The width of the sprite, setting this will actually modify the scale to achieve the value set.
       * @example
       * ```ts
       * // Set width directly
       * sprite.width = 200;
       * console.log(sprite.scale.x); // Scale adjusted to match width
       *
       * // Set width while preserving aspect ratio
       * const ratio = sprite.height / sprite.width;
       * sprite.width = 300;
       * sprite.height = 300 * ratio;
       *
       * // For better performance when setting both width and height
       * sprite.setSize(300, 400); // Avoids recalculating bounds twice
       *
       * // Reset to original texture size
       * sprite.width = sprite.texture.orig.width;
       * ```
       */
      get width() {
        return Math.abs(this.scale.x) * this._texture.orig.width;
      }
      set width(value) {
        this._setWidth(value, this._texture.orig.width);
        this._width = value;
      }
      /**
       * The height of the sprite, setting this will actually modify the scale to achieve the value set.
       * @example
       * ```ts
       * // Set height directly
       * sprite.height = 150;
       * console.log(sprite.scale.y); // Scale adjusted to match height
       *
       * // Set height while preserving aspect ratio
       * const ratio = sprite.width / sprite.height;
       * sprite.height = 200;
       * sprite.width = 200 * ratio;
       *
       * // For better performance when setting both width and height
       * sprite.setSize(300, 400); // Avoids recalculating bounds twice
       *
       * // Reset to original texture size
       * sprite.height = sprite.texture.orig.height;
       * ```
       */
      get height() {
        return Math.abs(this.scale.y) * this._texture.orig.height;
      }
      set height(value) {
        this._setHeight(value, this._texture.orig.height);
        this._height = value;
      }
      /**
       * Retrieves the size of the Sprite as a [Size]{@link Size} object based on the texture dimensions and scale.
       * This is faster than getting width and height separately as it only calculates the bounds once.
       * @example
       * ```ts
       * // Basic size retrieval
       * const sprite = new Sprite(Texture.from('sprite.png'));
       * const size = sprite.getSize();
       * console.log(`Size: ${size.width}x${size.height}`);
       *
       * // Reuse existing size object
       * const reuseSize = { width: 0, height: 0 };
       * sprite.getSize(reuseSize);
       * ```
       * @param out - Optional object to store the size in, to avoid allocating a new object
       * @returns The size of the Sprite
       * @see {@link Sprite#width} For getting just the width
       * @see {@link Sprite#height} For getting just the height
       * @see {@link Sprite#setSize} For setting both width and height
       */
      getSize(out) {
        out || (out = {});
        out.width = Math.abs(this.scale.x) * this._texture.orig.width;
        out.height = Math.abs(this.scale.y) * this._texture.orig.height;
        return out;
      }
      /**
       * Sets the size of the Sprite to the specified width and height.
       * This is faster than setting width and height separately as it only recalculates bounds once.
       * @example
       * ```ts
       * // Basic size setting
       * const sprite = new Sprite(Texture.from('sprite.png'));
       * sprite.setSize(100, 200); // Width: 100, Height: 200
       *
       * // Set uniform size
       * sprite.setSize(100); // Sets both width and height to 100
       *
       * // Set size with object
       * sprite.setSize({
       *     width: 200,
       *     height: 300
       * });
       *
       * // Reset to texture size
       * sprite.setSize(
       *     sprite.texture.orig.width,
       *     sprite.texture.orig.height
       * );
       * ```
       * @param value - This can be either a number or a {@link Size} object
       * @param height - The height to set. Defaults to the value of `width` if not provided
       * @see {@link Sprite#width} For setting width only
       * @see {@link Sprite#height} For setting height only
       * @see {@link Sprite#texture} For the source dimensions
       */
      setSize(value, height) {
        if (typeof value === "object") {
          height = value.height ?? value.width;
          value = value.width;
        } else {
          height ?? (height = value);
        }
        value !== void 0 && this._setWidth(value, this._texture.orig.width);
        height !== void 0 && this._setHeight(height, this._texture.orig.height);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/mask/utils/addMaskBounds.mjs
function addMaskBounds(mask, bounds, skipUpdateTransform) {
  const boundsToMask = tempBounds;
  mask.measurable = true;
  getGlobalBounds(mask, skipUpdateTransform, boundsToMask);
  bounds.addBoundsMask(boundsToMask);
  mask.measurable = false;
}
var tempBounds;
var init_addMaskBounds = __esm({
  "client/node_modules/pixi.js/lib/rendering/mask/utils/addMaskBounds.mjs"() {
    init_Bounds();
    init_getGlobalBounds();
    tempBounds = new Bounds();
  }
});

// client/node_modules/pixi.js/lib/rendering/mask/utils/addMaskLocalBounds.mjs
function addMaskLocalBounds(mask, bounds, localRoot) {
  const boundsToMask = boundsPool.get();
  mask.measurable = true;
  const tempMatrix4 = matrixPool.get().identity();
  const relativeMask = getMatrixRelativeToParent(mask, localRoot, tempMatrix4);
  getLocalBounds(mask, boundsToMask, relativeMask);
  mask.measurable = false;
  bounds.addBoundsMask(boundsToMask);
  matrixPool.return(tempMatrix4);
  boundsPool.return(boundsToMask);
}
function getMatrixRelativeToParent(target, root, matrix) {
  if (!target) {
    warn("Mask bounds, renderable is not inside the root container");
    return matrix;
  }
  if (target !== root) {
    getMatrixRelativeToParent(target.parent, root, matrix);
    target.updateLocalTransform();
    matrix.append(target.localTransform);
  }
  return matrix;
}
var init_addMaskLocalBounds = __esm({
  "client/node_modules/pixi.js/lib/rendering/mask/utils/addMaskLocalBounds.mjs"() {
    init_getLocalBounds();
    init_matrixAndBoundsPool();
    init_warn();
  }
});

// client/node_modules/pixi.js/lib/rendering/mask/alpha/AlphaMask.mjs
var AlphaMask;
var init_AlphaMask = __esm({
  "client/node_modules/pixi.js/lib/rendering/mask/alpha/AlphaMask.mjs"() {
    init_Extensions();
    init_Sprite();
    init_addMaskBounds();
    init_addMaskLocalBounds();
    AlphaMask = class {
      constructor(options) {
        this.priority = 0;
        this.inverse = false;
        this.channel = "red";
        this.pipe = "alphaMask";
        if (options?.mask) {
          this.init(options.mask);
        }
      }
      init(mask) {
        this.mask = mask;
        this.renderMaskToTexture = !(mask instanceof Sprite);
        this.mask.renderable = this.renderMaskToTexture;
        this.mask.includeInBuild = !this.renderMaskToTexture;
        this.mask.measurable = false;
      }
      reset() {
        if (this.mask === null) return;
        this.mask.measurable = true;
        this.mask = null;
      }
      addBounds(bounds, skipUpdateTransform) {
        if (!this.inverse) {
          addMaskBounds(this.mask, bounds, skipUpdateTransform);
        }
      }
      addLocalBounds(bounds, localRoot) {
        addMaskLocalBounds(this.mask, bounds, localRoot);
      }
      containsPoint(point, hitTestFn) {
        const mask = this.mask;
        return hitTestFn(mask, point);
      }
      destroy() {
        this.reset();
      }
      static test(mask) {
        return mask instanceof Sprite;
      }
    };
    AlphaMask.extension = ExtensionType.MaskEffect;
  }
});

// client/node_modules/pixi.js/lib/rendering/mask/color/ColorMask.mjs
var ColorMask;
var init_ColorMask = __esm({
  "client/node_modules/pixi.js/lib/rendering/mask/color/ColorMask.mjs"() {
    init_Extensions();
    ColorMask = class {
      constructor(options) {
        this.priority = 0;
        this.pipe = "colorMask";
        if (options?.mask) {
          this.init(options.mask);
        }
      }
      init(mask) {
        this.mask = mask;
      }
      destroy() {
      }
      static test(mask) {
        return typeof mask === "number";
      }
    };
    ColorMask.extension = ExtensionType.MaskEffect;
  }
});

// client/node_modules/pixi.js/lib/rendering/mask/stencil/StencilMask.mjs
var StencilMask;
var init_StencilMask = __esm({
  "client/node_modules/pixi.js/lib/rendering/mask/stencil/StencilMask.mjs"() {
    init_Extensions();
    init_Container();
    init_addMaskBounds();
    init_addMaskLocalBounds();
    StencilMask = class {
      constructor(options) {
        this.priority = 0;
        this.pipe = "stencilMask";
        if (options?.mask) {
          this.init(options.mask);
        }
      }
      init(mask) {
        this.mask = mask;
        this.mask.includeInBuild = false;
        this.mask.measurable = false;
      }
      reset() {
        if (this.mask === null) return;
        this.mask.measurable = true;
        this.mask.includeInBuild = true;
        this.mask = null;
      }
      addBounds(bounds, skipUpdateTransform) {
        addMaskBounds(this.mask, bounds, skipUpdateTransform);
      }
      addLocalBounds(bounds, localRoot) {
        addMaskLocalBounds(this.mask, bounds, localRoot);
      }
      containsPoint(point, hitTestFn) {
        const mask = this.mask;
        return hitTestFn(mask, point);
      }
      destroy() {
        this.reset();
      }
      static test(mask) {
        return mask instanceof Container;
      }
    };
    StencilMask.extension = ExtensionType.MaskEffect;
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/CanvasSource.mjs
var CanvasSource;
var init_CanvasSource = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/CanvasSource.mjs"() {
    init_adapter();
    init_Extensions();
    init_TextureSource();
    CanvasSource = class extends TextureSource {
      constructor(options) {
        if (!options.resource) {
          options.resource = DOMAdapter.get().createCanvas();
        }
        if (!options.width) {
          options.width = options.resource.width;
          if (!options.autoDensity) {
            options.width /= options.resolution;
          }
        }
        if (!options.height) {
          options.height = options.resource.height;
          if (!options.autoDensity) {
            options.height /= options.resolution;
          }
        }
        super(options);
        this.uploadMethodId = "image";
        this.autoDensity = options.autoDensity;
        this.resizeCanvas();
        this.transparent = !!options.transparent;
      }
      resizeCanvas() {
        if (this.autoDensity && "style" in this.resource) {
          this.resource.style.width = `${this.width}px`;
          this.resource.style.height = `${this.height}px`;
        }
        if (this.resource.width !== this.pixelWidth || this.resource.height !== this.pixelHeight) {
          this.resource.width = this.pixelWidth;
          this.resource.height = this.pixelHeight;
        }
      }
      resize(width = this.width, height = this.height, resolution = this._resolution) {
        const didResize = super.resize(width, height, resolution);
        if (didResize) {
          this.resizeCanvas();
        }
        return didResize;
      }
      static test(resource) {
        return globalThis.HTMLCanvasElement && resource instanceof HTMLCanvasElement || globalThis.OffscreenCanvas && resource instanceof OffscreenCanvas;
      }
      /**
       * Returns the 2D rendering context for the canvas.
       * Caches the context after creating it.
       * @returns The 2D rendering context of the canvas.
       */
      get context2D() {
        return this._context2D || (this._context2D = this.resource.getContext("2d"));
      }
    };
    CanvasSource.extension = ExtensionType.TextureSource;
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/ImageSource.mjs
var ImageSource;
var init_ImageSource = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/ImageSource.mjs"() {
    init_Extensions();
    init_TextureSource();
    ImageSource = class extends TextureSource {
      constructor(options) {
        super(options);
        this.uploadMethodId = "image";
        this.autoGarbageCollect = true;
      }
      static test(resource) {
        return globalThis.HTMLImageElement && resource instanceof HTMLImageElement || typeof ImageBitmap !== "undefined" && resource instanceof ImageBitmap || globalThis.VideoFrame && resource instanceof VideoFrame;
      }
    };
    ImageSource.extension = ExtensionType.TextureSource;
  }
});

// client/node_modules/pixi.js/lib/utils/browser/detectVideoAlphaMode.mjs
async function detectVideoAlphaMode() {
  promise ?? (promise = (async () => {
    const canvas = DOMAdapter.get().createCanvas(1, 1);
    const gl = canvas.getContext("webgl");
    if (!gl) {
      return "premultiply-alpha-on-upload";
    }
    const video = await new Promise((resolve) => {
      const video2 = document.createElement("video");
      video2.onloadeddata = () => resolve(video2);
      video2.onerror = () => resolve(null);
      video2.autoplay = false;
      video2.crossOrigin = "anonymous";
      video2.preload = "auto";
      video2.src = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEXTbuMU6uEHFO7a1OsggG97AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRMYXZmV0GETGF2ZkSJiEBEAAAAAAAAFlSua8yuAQAAAAAAAEPXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAJiWgDglLCBArqBApqBAlPAgQFVsIRVuYEBElTDZ9Vzc9JjwItjxYgAAAAAAAAAAWfInEWjh0VOQ09ERVJEh49MYXZjIGxpYnZweC12cDlnyKJFo4hEVVJBVElPTkSHlDAwOjAwOjAwLjA0MDAwMDAwMAAAH0O2dcfngQCgwqGggQAAAIJJg0IAABAAFgA4JBwYSgAAICAAEb///4r+AAB1oZ2mm+6BAaWWgkmDQgAAEAAWADgkHBhKAAAgIABIQBxTu2uRu4+zgQC3iveBAfGCAXHwgQM=";
      video2.load();
    });
    if (!video) {
      return "premultiply-alpha-on-upload";
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return pixel[0] <= pixel[3] ? "premultiplied-alpha" : "premultiply-alpha-on-upload";
  })());
  return promise;
}
var promise;
var init_detectVideoAlphaMode = __esm({
  "client/node_modules/pixi.js/lib/utils/browser/detectVideoAlphaMode.mjs"() {
    init_adapter();
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/VideoSource.mjs
var _VideoSource, VideoSource;
var init_VideoSource = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/sources/VideoSource.mjs"() {
    init_Extensions();
    init_Ticker();
    init_detectVideoAlphaMode();
    init_TextureSource();
    _VideoSource = class _VideoSource2 extends TextureSource {
      constructor(options) {
        super(options);
        this.isReady = false;
        this.uploadMethodId = "video";
        options = {
          ..._VideoSource2.defaultOptions,
          ...options
        };
        this._autoUpdate = true;
        this._isConnectedToTicker = false;
        this._updateFPS = options.updateFPS || 0;
        this._msToNextUpdate = 0;
        this.autoPlay = options.autoPlay !== false;
        this.alphaMode = options.alphaMode ?? "premultiply-alpha-on-upload";
        this._videoFrameRequestCallback = this._videoFrameRequestCallback.bind(this);
        this._videoFrameRequestCallbackHandle = null;
        this._load = null;
        this._resolve = null;
        this._reject = null;
        this._onCanPlay = this._onCanPlay.bind(this);
        this._onCanPlayThrough = this._onCanPlayThrough.bind(this);
        this._onError = this._onError.bind(this);
        this._onPlayStart = this._onPlayStart.bind(this);
        this._onPlayStop = this._onPlayStop.bind(this);
        this._onSeeked = this._onSeeked.bind(this);
        this._onLoadedMetadata = this._onLoadedMetadata.bind(this);
        if (options.autoLoad !== false) {
          void this.load();
        }
      }
      /** Update the video frame if the source is not destroyed and meets certain conditions. */
      updateFrame() {
        if (this.destroyed) {
          return;
        }
        if (this._updateFPS) {
          const elapsedMS = Ticker.shared.elapsedMS * this.resource.playbackRate;
          this._msToNextUpdate = Math.floor(this._msToNextUpdate - elapsedMS);
        }
        if (!this._updateFPS || this._msToNextUpdate <= 0) {
          this._msToNextUpdate = this._updateFPS ? Math.floor(1e3 / this._updateFPS) : 0;
        }
        if (this.isValid) {
          this.update();
        }
      }
      /** Callback to update the video frame and potentially request the next frame update. */
      _videoFrameRequestCallback() {
        this.updateFrame();
        if (this.destroyed) {
          this._videoFrameRequestCallbackHandle = null;
        } else {
          this._videoFrameRequestCallbackHandle = this.resource.requestVideoFrameCallback(
            this._videoFrameRequestCallback
          );
        }
      }
      /**
       * Checks if the resource has valid dimensions.
       * @returns {boolean} True if width and height are set, otherwise false.
       */
      get isValid() {
        return !!this.resource.videoWidth && !!this.resource.videoHeight;
      }
      /**
       * Start preloading the video resource.
       * @returns {Promise<this>} Handle the validate event
       */
      async load() {
        if (this._load) {
          return this._load;
        }
        const source2 = this.resource;
        const options = this.options;
        if ((source2.readyState === source2.HAVE_ENOUGH_DATA || source2.readyState === source2.HAVE_FUTURE_DATA) && source2.width && source2.height) {
          source2.complete = true;
        }
        source2.addEventListener("play", this._onPlayStart);
        source2.addEventListener("pause", this._onPlayStop);
        source2.addEventListener("seeked", this._onSeeked);
        if (!this._isSourceReady()) {
          if (!options.preload) {
            source2.addEventListener("canplay", this._onCanPlay);
          }
          source2.addEventListener("canplaythrough", this._onCanPlayThrough);
          source2.addEventListener("error", this._onError, true);
        } else {
          this._mediaReady();
        }
        if (!this.isValid) {
          source2.addEventListener("loadedmetadata", this._onLoadedMetadata);
        }
        this.alphaMode = await detectVideoAlphaMode();
        this._load = new Promise((resolve, reject) => {
          if (this.isValid) {
            resolve(this);
          } else {
            this._resolve = resolve;
            this._reject = reject;
            if (options.preloadTimeoutMs !== void 0) {
              this._preloadTimeout = setTimeout(() => {
                this._onError(new ErrorEvent(`Preload exceeded timeout of ${options.preloadTimeoutMs}ms`));
              });
            }
            source2.load();
          }
        });
        return this._load;
      }
      /**
       * Handle video error events.
       * @param event - The error event
       */
      _onError(event) {
        this.resource.removeEventListener("error", this._onError, true);
        this.emit("error", event);
        if (this._reject) {
          this._reject(event);
          this._reject = null;
          this._resolve = null;
        }
      }
      /**
       * Checks if the underlying source is playing.
       * @returns True if playing.
       */
      _isSourcePlaying() {
        const source2 = this.resource;
        return !source2.paused && !source2.ended;
      }
      /**
       * Checks if the underlying source is ready for playing.
       * @returns True if ready.
       */
      _isSourceReady() {
        const source2 = this.resource;
        return source2.readyState > 2;
      }
      /** Runs the update loop when the video is ready to play. */
      _onPlayStart() {
        this._configureAutoUpdate();
      }
      /** Stops the update loop when a pause event is triggered. */
      _onPlayStop() {
        this._configureAutoUpdate();
      }
      /** Handles behavior when the video completes seeking to the current playback position. */
      _onSeeked() {
        if (this._autoUpdate && !this._isSourcePlaying()) {
          this._msToNextUpdate = 0;
          this.updateFrame();
          this._msToNextUpdate = 0;
        }
      }
      /** When intrinsic size becomes known after play / canplay (common with MediaStream). */
      _onLoadedMetadata() {
        if (!this.isValid) {
          return;
        }
        this._mediaReady();
      }
      _onCanPlay() {
        const source2 = this.resource;
        source2.removeEventListener("canplay", this._onCanPlay);
        this._mediaReady();
      }
      _onCanPlayThrough() {
        const source2 = this.resource;
        source2.removeEventListener("canplaythrough", this._onCanPlayThrough);
        if (this._preloadTimeout) {
          clearTimeout(this._preloadTimeout);
          this._preloadTimeout = void 0;
        }
        this._mediaReady();
      }
      /** Fired when the video is loaded and ready to play. */
      _mediaReady() {
        const source2 = this.resource;
        if (this.isValid) {
          this.isReady = true;
          this.resize(source2.videoWidth, source2.videoHeight);
        }
        this._msToNextUpdate = 0;
        this.updateFrame();
        this._msToNextUpdate = 0;
        if (this._resolve && this.isValid) {
          this._resolve(this);
          this._resolve = null;
          this._reject = null;
        }
        if (this._isSourcePlaying()) {
          this._onPlayStart();
        } else if (this.autoPlay) {
          void this.resource.play();
        }
      }
      /** Cleans up resources and event listeners associated with this texture. */
      destroy() {
        this._configureAutoUpdate();
        const source2 = this.resource;
        if (source2) {
          source2.removeEventListener("play", this._onPlayStart);
          source2.removeEventListener("pause", this._onPlayStop);
          source2.removeEventListener("seeked", this._onSeeked);
          source2.removeEventListener("canplay", this._onCanPlay);
          source2.removeEventListener("canplaythrough", this._onCanPlayThrough);
          source2.removeEventListener("loadedmetadata", this._onLoadedMetadata);
          source2.removeEventListener("error", this._onError, true);
          source2.pause();
          source2.src = "";
          source2.load();
        }
        super.destroy();
      }
      /** Should the base texture automatically update itself, set to true by default. */
      get autoUpdate() {
        return this._autoUpdate;
      }
      set autoUpdate(value) {
        if (value !== this._autoUpdate) {
          this._autoUpdate = value;
          this._configureAutoUpdate();
        }
      }
      /**
       * How many times a second to update the texture from the video.
       * Leave at 0 to update at every render.
       * A lower fps can help performance, as updating the texture at 60fps on a 30ps video may not be efficient.
       */
      get updateFPS() {
        return this._updateFPS;
      }
      set updateFPS(value) {
        if (value !== this._updateFPS) {
          this._updateFPS = value;
          this._configureAutoUpdate();
        }
      }
      /**
       * Configures the updating mechanism based on the current state and settings.
       *
       * This method decides between using the browser's native video frame callback or a custom ticker
       * for updating the video frame. It ensures optimal performance and responsiveness
       * based on the video's state, playback status, and the desired frames-per-second setting.
       *
       * - If `_autoUpdate` is enabled and the video source is playing:
       *   - It will prefer the native video frame callback if available and no specific FPS is set.
       *   - Otherwise, it will use a custom ticker for manual updates.
       * - If `_autoUpdate` is disabled or the video isn't playing, any active update mechanisms are halted.
       */
      _configureAutoUpdate() {
        if (this._autoUpdate && this._isSourcePlaying()) {
          if (!this._updateFPS && this.resource.requestVideoFrameCallback) {
            if (this._isConnectedToTicker) {
              Ticker.shared.remove(this.updateFrame, this);
              this._isConnectedToTicker = false;
              this._msToNextUpdate = 0;
            }
            if (this._videoFrameRequestCallbackHandle === null) {
              this._videoFrameRequestCallbackHandle = this.resource.requestVideoFrameCallback(
                this._videoFrameRequestCallback
              );
            }
          } else {
            if (this._videoFrameRequestCallbackHandle !== null) {
              this.resource.cancelVideoFrameCallback(this._videoFrameRequestCallbackHandle);
              this._videoFrameRequestCallbackHandle = null;
            }
            if (!this._isConnectedToTicker) {
              Ticker.shared.add(this.updateFrame, this);
              this._isConnectedToTicker = true;
              this._msToNextUpdate = 0;
            }
          }
        } else {
          if (this._videoFrameRequestCallbackHandle !== null) {
            this.resource.cancelVideoFrameCallback(this._videoFrameRequestCallbackHandle);
            this._videoFrameRequestCallbackHandle = null;
          }
          if (this._isConnectedToTicker) {
            Ticker.shared.remove(this.updateFrame, this);
            this._isConnectedToTicker = false;
            this._msToNextUpdate = 0;
          }
        }
      }
      static test(resource) {
        return globalThis.HTMLVideoElement && resource instanceof HTMLVideoElement;
      }
    };
    _VideoSource.extension = ExtensionType.TextureSource;
    _VideoSource.defaultOptions = {
      ...TextureSource.defaultOptions,
      /** If true, the video will start loading immediately. */
      autoLoad: true,
      /** If true, the video will start playing as soon as it is loaded. */
      autoPlay: true,
      /** The number of times a second to update the texture from the video. Leave at 0 to update at every render. */
      updateFPS: 0,
      /** If true, the video will be loaded with the `crossorigin` attribute. */
      crossorigin: true,
      /** If true, the video will loop when it ends. */
      loop: false,
      /** If true, the video will be muted. */
      muted: true,
      /** If true, the video will play inline. */
      playsinline: true,
      /** If true, the video will be preloaded. */
      preload: false
    };
    _VideoSource.MIME_TYPES = {
      ogv: "video/ogg",
      mov: "video/quicktime",
      m4v: "video/mp4"
    };
    VideoSource = _VideoSource;
  }
});

// client/node_modules/pixi.js/lib/assets/cache/Cache.mjs
var CacheClass, Cache;
var init_Cache = __esm({
  "client/node_modules/pixi.js/lib/assets/cache/Cache.mjs"() {
    init_warn();
    init_convertToList();
    CacheClass = class {
      constructor() {
        this._parsers = [];
        this._cache = /* @__PURE__ */ new Map();
        this._cacheMap = /* @__PURE__ */ new Map();
      }
      /** Clear all entries. */
      reset() {
        this._cacheMap.clear();
        this._cache.clear();
      }
      /**
       * Check if the key exists
       * @param key - The key to check
       */
      has(key) {
        return this._cache.has(key);
      }
      /**
       * Fetch entry by key
       * @param key - The key of the entry to get
       */
      get(key) {
        const result2 = this._cache.get(key);
        if (!result2) {
          warn(`[Assets] Asset id ${key} was not found in the Cache`);
        }
        return result2;
      }
      /**
       * Set a value by key or keys name
       * @param key - The key or keys to set
       * @param value - The value to store in the cache or from which cacheable assets will be derived.
       */
      set(key, value) {
        const keys = convertToList(key);
        let cacheableAssets;
        for (let i2 = 0; i2 < this.parsers.length; i2++) {
          const parser = this.parsers[i2];
          if (parser.test(value)) {
            cacheableAssets = parser.getCacheableAssets(keys, value);
            break;
          }
        }
        const cacheableMap = new Map(Object.entries(cacheableAssets || {}));
        if (!cacheableAssets) {
          keys.forEach((key2) => {
            cacheableMap.set(key2, value);
          });
        }
        const cacheKeys = [...cacheableMap.keys()];
        const cachedAssets = {
          cacheKeys,
          keys
        };
        keys.forEach((key2) => {
          this._cacheMap.set(key2, cachedAssets);
        });
        cacheKeys.forEach((key2) => {
          const val = cacheableAssets ? cacheableAssets[key2] : value;
          if (this._cache.has(key2) && this._cache.get(key2) !== val) {
            warn("[Cache] already has key:", key2);
          }
          this._cache.set(key2, cacheableMap.get(key2));
        });
      }
      /**
       * Remove entry by key
       *
       * This function will also remove any associated alias from the cache also.
       * @param key - The key of the entry to remove
       */
      remove(key) {
        if (!this._cacheMap.has(key)) {
          warn(`[Assets] Asset id ${key} was not found in the Cache`);
          return;
        }
        const cacheMap = this._cacheMap.get(key);
        const cacheKeys = cacheMap.cacheKeys;
        cacheKeys.forEach((key2) => {
          this._cache.delete(key2);
        });
        cacheMap.keys.forEach((key2) => {
          this._cacheMap.delete(key2);
        });
      }
      /**
       * All loader parsers registered
       * @advanced
       */
      get parsers() {
        return this._parsers;
      }
    };
    Cache = new CacheClass();
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/utils/textureFrom.mjs
function textureSourceFrom(options = {}) {
  const hasResource = options && options.resource;
  const res = hasResource ? options.resource : options;
  const opts = hasResource ? options : { resource: options };
  for (let i2 = 0; i2 < sources.length; i2++) {
    const Source = sources[i2];
    if (Source.test(res)) {
      return new Source(opts);
    }
  }
  throw new Error(`Could not find a source type for resource: ${opts.resource}`);
}
function resourceToTexture(options = {}, skipCache = false) {
  const hasResource = options && options.resource;
  const resource = hasResource ? options.resource : options;
  const opts = hasResource ? options : { resource: options };
  if (!skipCache && Cache.has(resource)) {
    return Cache.get(resource);
  }
  const texture = new Texture({ source: textureSourceFrom(opts) });
  texture.on("destroy", () => {
    if (Cache.has(resource)) {
      Cache.remove(resource);
    }
  });
  if (!skipCache) {
    Cache.set(resource, texture);
  }
  return texture;
}
function textureFrom(id, skipCache = false) {
  if (typeof id === "string") {
    return Cache.get(id);
  } else if (id instanceof TextureSource) {
    return new Texture({ source: id });
  }
  return resourceToTexture(id, skipCache);
}
var sources;
var init_textureFrom = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/utils/textureFrom.mjs"() {
    init_Cache();
    init_Extensions();
    init_TextureSource();
    init_Texture();
    sources = [];
    extensions.handleByList(ExtensionType.TextureSource, sources);
    Texture.from = textureFrom;
    TextureSource.from = textureSourceFrom;
  }
});

// client/node_modules/pixi.js/lib/rendering/init.mjs
var init_init5 = __esm({
  "client/node_modules/pixi.js/lib/rendering/init.mjs"() {
    init_Extensions();
    init_AlphaMask();
    init_ColorMask();
    init_StencilMask();
    init_BufferImageSource();
    init_CanvasSource();
    init_ImageSource();
    init_VideoSource();
    init_textureFrom();
    extensions.add(
      AlphaMask,
      ColorMask,
      StencilMask,
      VideoSource,
      ImageSource,
      CanvasSource,
      BufferImageSource
    );
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/canvas/utils/canUseNewCanvasBlendModes.mjs
function createColoredCanvas(color) {
  const canvas = DOMAdapter.get().createCanvas(6, 1);
  const context2 = canvas.getContext("2d");
  context2.fillStyle = color;
  context2.fillRect(0, 0, 6, 1);
  return canvas;
}
function canUseNewCanvasBlendModes() {
  if (canUseNewCanvasBlendModesValue !== void 0) {
    return canUseNewCanvasBlendModesValue;
  }
  try {
    const magenta = createColoredCanvas("#ff00ff");
    const yellow = createColoredCanvas("#ffff00");
    const canvas = DOMAdapter.get().createCanvas(6, 1);
    const context2 = canvas.getContext("2d");
    context2.globalCompositeOperation = "multiply";
    context2.drawImage(magenta, 0, 0);
    context2.drawImage(yellow, 2, 0);
    const imageData = context2.getImageData(2, 0, 1, 1);
    if (!imageData) {
      canUseNewCanvasBlendModesValue = false;
    } else {
      const data = imageData.data;
      canUseNewCanvasBlendModesValue = data[0] === 255 && data[1] === 0 && data[2] === 0;
    }
  } catch (_error) {
    canUseNewCanvasBlendModesValue = false;
  }
  return canUseNewCanvasBlendModesValue;
}
var canUseNewCanvasBlendModesValue;
var init_canUseNewCanvasBlendModes = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/canvas/utils/canUseNewCanvasBlendModes.mjs"() {
    init_adapter();
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/canvas/utils/canvasUtils.mjs
var canvasUtils;
var init_canvasUtils = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/canvas/utils/canvasUtils.mjs"() {
    init_Color();
    init_adapter();
    init_groupD8();
    init_canUseNewCanvasBlendModes();
    canvasUtils = {
      canvas: null,
      convertTintToImage: false,
      cacheStepsPerColorChannel: 8,
      canUseMultiply: canUseNewCanvasBlendModes(),
      tintMethod: null,
      _canvasSourceCache: /* @__PURE__ */ new WeakMap(),
      _unpremultipliedCache: /* @__PURE__ */ new WeakMap(),
      getCanvasSource: (texture) => {
        const source2 = texture.source;
        const resource = source2?.resource;
        if (!resource) {
          return null;
        }
        const isPMA = source2.alphaMode === "premultiplied-alpha";
        const resourceWidth = source2.resourceWidth ?? source2.pixelWidth;
        const resourceHeight = source2.resourceHeight ?? source2.pixelHeight;
        const needsResize = resourceWidth !== source2.pixelWidth || resourceHeight !== source2.pixelHeight;
        if (isPMA) {
          if (resource instanceof HTMLCanvasElement || typeof OffscreenCanvas !== "undefined" && resource instanceof OffscreenCanvas) {
            if (!needsResize) {
              return resource;
            }
          }
          const cached = canvasUtils._unpremultipliedCache.get(source2);
          if (cached?.resourceId === source2._resourceId) {
            return cached.canvas;
          }
        }
        if (resource instanceof Uint8Array || resource instanceof Uint8ClampedArray || resource instanceof Int8Array || resource instanceof Uint16Array || resource instanceof Int16Array || resource instanceof Uint32Array || resource instanceof Int32Array || resource instanceof Float32Array || resource instanceof ArrayBuffer) {
          const cached = canvasUtils._canvasSourceCache.get(source2);
          if (cached?.resourceId === source2._resourceId) {
            return cached.canvas;
          }
          const canvas = DOMAdapter.get().createCanvas(source2.pixelWidth, source2.pixelHeight);
          const context2 = canvas.getContext("2d");
          const imageData = context2.createImageData(source2.pixelWidth, source2.pixelHeight);
          const data = imageData.data;
          const bytes2 = resource instanceof ArrayBuffer ? new Uint8Array(resource) : new Uint8Array(resource.buffer, resource.byteOffset, resource.byteLength);
          if (source2.format === "bgra8unorm") {
            for (let i2 = 0; i2 < data.length && i2 + 3 < bytes2.length; i2 += 4) {
              data[i2] = bytes2[i2 + 2];
              data[i2 + 1] = bytes2[i2 + 1];
              data[i2 + 2] = bytes2[i2];
              data[i2 + 3] = bytes2[i2 + 3];
            }
          } else {
            data.set(bytes2.subarray(0, data.length));
          }
          context2.putImageData(imageData, 0, 0);
          canvasUtils._canvasSourceCache.set(source2, { canvas, resourceId: source2._resourceId });
          return canvas;
        }
        if (isPMA) {
          const canvas = DOMAdapter.get().createCanvas(source2.pixelWidth, source2.pixelHeight);
          const context2 = canvas.getContext("2d", { willReadFrequently: true });
          canvas.width = source2.pixelWidth;
          canvas.height = source2.pixelHeight;
          context2.drawImage(resource, 0, 0);
          const imageData = context2.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          for (let i2 = 0; i2 < data.length; i2 += 4) {
            const a2 = data[i2 + 3];
            if (a2 > 0) {
              const alphaInv = 255 / a2;
              data[i2] = Math.min(255, data[i2] * alphaInv + 0.5);
              data[i2 + 1] = Math.min(255, data[i2 + 1] * alphaInv + 0.5);
              data[i2 + 2] = Math.min(255, data[i2 + 2] * alphaInv + 0.5);
            }
          }
          context2.putImageData(imageData, 0, 0);
          canvasUtils._unpremultipliedCache.set(source2, { canvas, resourceId: source2._resourceId });
          return canvas;
        }
        if (needsResize) {
          const cached = canvasUtils._canvasSourceCache.get(source2);
          if (cached?.resourceId === source2._resourceId) {
            return cached.canvas;
          }
          const canvas = DOMAdapter.get().createCanvas(source2.pixelWidth, source2.pixelHeight);
          const context2 = canvas.getContext("2d");
          canvas.width = source2.pixelWidth;
          canvas.height = source2.pixelHeight;
          context2.drawImage(resource, 0, 0);
          canvasUtils._canvasSourceCache.set(source2, { canvas, resourceId: source2._resourceId });
          return canvas;
        }
        return resource;
      },
      getTintedCanvas: (sprite, color) => {
        const texture = sprite.texture;
        const stringColor = Color.shared.setValue(color).toHex();
        const cache = texture.tintCache || (texture.tintCache = {});
        const cachedCanvas = cache[stringColor];
        const resourceId = texture.source._resourceId;
        if (cachedCanvas?.tintId === resourceId) {
          return cachedCanvas;
        }
        const canvas = cachedCanvas && "getContext" in cachedCanvas ? cachedCanvas : DOMAdapter.get().createCanvas();
        canvasUtils.tintMethod(texture, color, canvas);
        canvas.tintId = resourceId;
        if (canvasUtils.convertTintToImage && canvas.toDataURL !== void 0) {
          const tintImage = DOMAdapter.get().createImage();
          tintImage.src = canvas.toDataURL();
          tintImage.tintId = resourceId;
          cache[stringColor] = tintImage;
        } else {
          cache[stringColor] = canvas;
        }
        return cache[stringColor];
      },
      getTintedPattern: (texture, color) => {
        const stringColor = Color.shared.setValue(color).toHex();
        const cache = texture.patternCache || (texture.patternCache = {});
        const resourceId = texture.source._resourceId;
        let pattern = cache[stringColor];
        if (pattern?.tintId === resourceId) {
          return pattern;
        }
        if (!canvasUtils.canvas) {
          canvasUtils.canvas = DOMAdapter.get().createCanvas();
        }
        canvasUtils.tintMethod(texture, color, canvasUtils.canvas);
        const context2 = canvasUtils.canvas.getContext("2d");
        pattern = context2.createPattern(canvasUtils.canvas, "repeat");
        pattern.tintId = resourceId;
        cache[stringColor] = pattern;
        return pattern;
      },
      /**
       * Applies a transform to a CanvasPattern.
       * @param pattern - The pattern to apply the transform to.
       * @param matrix - The matrix to apply.
       * @param matrix.a
       * @param matrix.b
       * @param matrix.c
       * @param matrix.d
       * @param matrix.tx
       * @param matrix.ty
       * @param invert
       */
      applyPatternTransform: (pattern, matrix, invert = true) => {
        if (!matrix) return;
        const patternAny = pattern;
        if (!patternAny.setTransform) return;
        const DOMMatrixCtor = globalThis.DOMMatrix;
        if (!DOMMatrixCtor) return;
        const domMatrix = new DOMMatrixCtor([matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty]);
        patternAny.setTransform(invert ? domMatrix.inverse() : domMatrix);
      },
      tintWithMultiply: (texture, color, canvas) => {
        const context2 = canvas.getContext("2d");
        const crop = texture.frame.clone();
        const resolution = texture.source._resolution ?? texture.source.resolution ?? 1;
        const rotate2 = texture.rotate;
        crop.x *= resolution;
        crop.y *= resolution;
        crop.width *= resolution;
        crop.height *= resolution;
        const isVertical = groupD8.isVertical(rotate2);
        const outWidth = isVertical ? crop.height : crop.width;
        const outHeight = isVertical ? crop.width : crop.height;
        canvas.width = Math.ceil(outWidth);
        canvas.height = Math.ceil(outHeight);
        context2.save();
        if (color !== 16777215) {
          context2.fillStyle = Color.shared.setValue(color).toHex();
          context2.fillRect(0, 0, outWidth, outHeight);
          context2.globalCompositeOperation = "multiply";
        }
        const source2 = canvasUtils.getCanvasSource(texture);
        if (!source2) {
          context2.restore();
          return;
        }
        if (rotate2) {
          canvasUtils._applyInverseRotation(context2, rotate2, crop.width, crop.height);
        }
        context2.drawImage(
          source2,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height
        );
        if (color !== 16777215) {
          context2.globalCompositeOperation = "destination-atop";
          context2.drawImage(
            source2,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            0,
            0,
            crop.width,
            crop.height
          );
        }
        context2.restore();
      },
      tintWithOverlay: (texture, color, canvas) => {
        const context2 = canvas.getContext("2d");
        const crop = texture.frame.clone();
        const resolution = texture.source._resolution ?? texture.source.resolution ?? 1;
        const rotate2 = texture.rotate;
        crop.x *= resolution;
        crop.y *= resolution;
        crop.width *= resolution;
        crop.height *= resolution;
        const isVertical = groupD8.isVertical(rotate2);
        const outWidth = isVertical ? crop.height : crop.width;
        const outHeight = isVertical ? crop.width : crop.height;
        canvas.width = Math.ceil(outWidth);
        canvas.height = Math.ceil(outHeight);
        context2.save();
        context2.globalCompositeOperation = "copy";
        context2.fillStyle = Color.shared.setValue(color).toHex();
        context2.fillRect(0, 0, outWidth, outHeight);
        context2.globalCompositeOperation = "destination-atop";
        const source2 = canvasUtils.getCanvasSource(texture);
        if (!source2) {
          context2.restore();
          return;
        }
        if (rotate2) {
          canvasUtils._applyInverseRotation(context2, rotate2, crop.width, crop.height);
        }
        context2.drawImage(
          source2,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height
        );
        context2.restore();
      },
      tintWithPerPixel: (texture, color, canvas) => {
        const context2 = canvas.getContext("2d");
        const crop = texture.frame.clone();
        const resolution = texture.source._resolution ?? texture.source.resolution ?? 1;
        const rotate2 = texture.rotate;
        crop.x *= resolution;
        crop.y *= resolution;
        crop.width *= resolution;
        crop.height *= resolution;
        const isVertical = groupD8.isVertical(rotate2);
        const outWidth = isVertical ? crop.height : crop.width;
        const outHeight = isVertical ? crop.width : crop.height;
        canvas.width = Math.ceil(outWidth);
        canvas.height = Math.ceil(outHeight);
        context2.save();
        context2.globalCompositeOperation = "copy";
        const source2 = canvasUtils.getCanvasSource(texture);
        if (!source2) {
          context2.restore();
          return;
        }
        if (rotate2) {
          canvasUtils._applyInverseRotation(context2, rotate2, crop.width, crop.height);
        }
        context2.drawImage(
          source2,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height
        );
        context2.restore();
        const r2 = color >> 16 & 255;
        const g2 = color >> 8 & 255;
        const b2 = color & 255;
        const imageData = context2.getImageData(0, 0, outWidth, outHeight);
        const data = imageData.data;
        for (let i2 = 0; i2 < data.length; i2 += 4) {
          data[i2] = data[i2] * r2 / 255;
          data[i2 + 1] = data[i2 + 1] * g2 / 255;
          data[i2 + 2] = data[i2 + 2] * b2 / 255;
        }
        context2.putImageData(imageData, 0, 0);
      },
      /**
       * Applies inverse rotation transform to context for texture packer rotation compensation.
       * Supports all 16 groupD8 symmetries (rotations and reflections).
       * @param context - Canvas 2D context
       * @param rotate - The groupD8 rotation value
       * @param srcWidth - Source crop width (before rotation)
       * @param srcHeight - Source crop height (before rotation)
       */
      _applyInverseRotation: (context2, rotate2, srcWidth, srcHeight) => {
        const inv = groupD8.inv(rotate2);
        const a2 = groupD8.uX(inv);
        const b2 = groupD8.uY(inv);
        const c2 = groupD8.vX(inv);
        const d2 = groupD8.vY(inv);
        const tx = -Math.min(0, a2 * srcWidth, c2 * srcHeight, a2 * srcWidth + c2 * srcHeight);
        const ty = -Math.min(0, b2 * srcWidth, d2 * srcHeight, b2 * srcWidth + d2 * srcHeight);
        context2.transform(a2, b2, c2, d2, tx, ty);
      }
    };
    canvasUtils.tintMethod = canvasUtils.canUseMultiply ? canvasUtils.tintWithMultiply : canvasUtils.tintWithPerPixel;
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/CanvasPool.mjs
function bucketKey2(width, height) {
  return (width << 17) + (height << 2);
}
var maxKeyDimension2, CanvasPoolClass, CanvasPool;
var init_CanvasPool = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/texture/CanvasPool.mjs"() {
    init_adapter();
    init_pow2();
    init_deprecation();
    init_warn();
    init_GlobalResourceRegistry();
    init_ScreenSizeRegistry();
    maxKeyDimension2 = 32767;
    CanvasPoolClass = class {
      constructor(canvasOptions) {
        this._buckets = /* @__PURE__ */ new Map();
        this._screens = new ScreenSizeRegistry();
        this._enableFullScreen = false;
        this.canvasOptions = canvasOptions || {};
      }
      /**
       * Has no effect. The pool sizes canvases to the screens registered with
       * {@link CanvasPoolClass#setScreenSize|setScreenSize}.
       * @deprecated since 8.21.0
       */
      get enableFullScreen() {
        deprecation(v8_21_0, "CanvasPool.enableFullScreen is no longer used, the pool sizes canvases to the screens registered with setScreenSize.");
        return this._enableFullScreen;
      }
      set enableFullScreen(value) {
        deprecation(v8_21_0, "CanvasPool.enableFullScreen is no longer used, the pool sizes canvases to the screens registered with setScreenSize.");
        this._enableFullScreen = value;
      }
      /**
       * Creates texture with params that were specified in pool constructor.
       * @param pixelWidth - Width of texture in pixels.
       * @param pixelHeight - Height of texture in pixels.
       */
      _createCanvasAndContext(pixelWidth, pixelHeight) {
        const canvas = DOMAdapter.get().createCanvas();
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        const context2 = canvas.getContext("2d");
        return { canvas, context: context2 };
      }
      /**
       * Gets a Power-of-Two canvas or screen sized canvas
       * @param minWidth - The minimum width of the canvas.
       * @param minHeight - The minimum height of the canvas.
       * @param resolution - The resolution of the canvas.
       * @returns The new canvas and its context.
       */
      getOptimalCanvasAndContext(minWidth, minHeight, resolution = 1) {
        const { width: canvasWidth, height: canvasHeight } = this.getOptimalSize(minWidth, minHeight, resolution);
        if (canvasWidth > maxKeyDimension2 || canvasHeight > maxKeyDimension2) {
          warn(`CanvasPool: ${canvasWidth}x${canvasHeight} is larger than the ${maxKeyDimension2}px pool key limit, canvases of this size may be pooled together`);
        }
        const key = bucketKey2(canvasWidth, canvasHeight);
        let bucket = this._buckets.get(key);
        if (!bucket) {
          bucket = [];
          this._buckets.set(key, bucket);
        }
        let canvasAndContext = bucket.pop();
        if (!canvasAndContext) {
          canvasAndContext = this._createCanvasAndContext(canvasWidth, canvasHeight);
        }
        return canvasAndContext;
      }
      /**
       * The backing size, in physical pixels, that
       * {@link CanvasPoolClass#getOptimalCanvasAndContext|getOptimalCanvasAndContext} would allocate for a request,
       * without taking a canvas from the pool.
       *
       * Each axis is the next power of two, or the smallest registered screen the request fits inside
       * (see {@link CanvasPoolClass#setScreenSize|setScreenSize}).
       * @param minWidth - The minimum width of the canvas.
       * @param minHeight - The minimum height of the canvas.
       * @param resolution - The resolution of the canvas.
       * @returns The width and height the pooled canvas would have, in physical pixels.
       */
      getOptimalSize(minWidth, minHeight, resolution = 1) {
        const pixelWidth = Math.ceil(minWidth * resolution - 1e-6);
        const pixelHeight = Math.ceil(minHeight * resolution - 1e-6);
        const po2Width = nextPow2(pixelWidth);
        const screenWidth = this._screens.getFittingWidth(pixelWidth);
        const po2Height = nextPow2(pixelHeight);
        const screenHeight = this._screens.getFittingHeight(pixelHeight);
        return {
          width: screenWidth !== void 0 ? Math.min(screenWidth, po2Width) : po2Width,
          height: screenHeight !== void 0 ? Math.min(screenHeight, po2Height) : po2Height
        };
      }
      /**
       * Place a canvas back into the pool.
       * @param canvasAndContext
       */
      returnCanvasAndContext(canvasAndContext) {
        const canvas = canvasAndContext.canvas;
        const { width, height } = canvas;
        const canvases = this._buckets.get(bucketKey2(width, height));
        if (!canvases) return;
        canvasAndContext.context.resetTransform();
        canvasAndContext.context.clearRect(0, 0, width, height);
        canvases.push(canvasAndContext);
      }
      /**
       * Registers the screen size of a renderer with the pool, in physical pixels.
       *
       * While a screen is registered, a request that fits inside it on an axis is given that screen's size on
       * that axis instead of the next power of two, which stops a full screen canvas from being allocated far
       * larger than the screen. Requests larger than every registered screen on an axis keep the power of two
       * size - the pool never rounds a request up to a screen it does not fit in.
       * @param rendererUid - The uid of the renderer, used to update or remove this screen later.
       * @param pixelWidth - The width of the screen in physical pixels.
       * @param pixelHeight - The height of the screen in physical pixels.
       */
      setScreenSize(rendererUid, pixelWidth, pixelHeight) {
        if (!this._screens.set(rendererUid, pixelWidth, pixelHeight)) return;
        this._pruneScreenCanvases();
      }
      /**
       * Removes a screen previously registered with
       * {@link CanvasPoolClass#setScreenSize|setScreenSize}, dropping any idle canvases that were
       * only being kept for it.
       * @param rendererUid - The uid the screen was registered with.
       */
      removeScreen(rendererUid) {
        if (!this._screens.remove(rendererUid)) return;
        this._pruneScreenCanvases();
      }
      /** Clears the pool. */
      clear() {
        this._buckets.clear();
      }
      /**
       * Drops the idle canvases in every bucket that has a non power of two dimension matching no live
       * screen. Power of two buckets are always kept, as any request can fall back to them.
       */
      _pruneScreenCanvases() {
        for (const [key] of this._buckets) {
          const width = key >>> 17;
          const height = key >>> 2 & 32767;
          if ((isPow2(width) || this._screens.hasWidth(width)) && (isPow2(height) || this._screens.hasHeight(height))) continue;
          this._buckets.delete(key);
        }
      }
    };
    CanvasPool = new CanvasPoolClass();
    GlobalResourceRegistry.register(CanvasPool);
  }
});

// client/node_modules/pixi.js/lib/scene/container/bounds/getRenderableBounds.mjs
function getGlobalRenderableBounds(renderables, bounds) {
  bounds.clear();
  const actualMatrix = bounds.matrix;
  for (let i2 = 0; i2 < renderables.length; i2++) {
    const renderable = renderables[i2];
    if (renderable.globalDisplayStatus < 7) {
      continue;
    }
    const renderGroup = renderable.renderGroup ?? renderable.parentRenderGroup;
    if (renderGroup?.isCachedAsTexture) {
      bounds.matrix = tempProjectionMatrix.copyFrom(renderGroup.textureOffsetInverseTransform).append(renderable.worldTransform);
    } else if (renderGroup?._parentCacheAsTextureRenderGroup) {
      bounds.matrix = tempProjectionMatrix.copyFrom(renderGroup._parentCacheAsTextureRenderGroup.inverseWorldTransform).append(renderable.groupTransform);
    } else {
      bounds.matrix = renderable.worldTransform;
    }
    bounds.addBounds(renderable.bounds);
  }
  bounds.matrix = actualMatrix;
  return bounds;
}
var tempProjectionMatrix;
var init_getRenderableBounds = __esm({
  "client/node_modules/pixi.js/lib/scene/container/bounds/getRenderableBounds.mjs"() {
    init_Matrix();
    tempProjectionMatrix = new Matrix();
  }
});

// client/node_modules/pixi.js/lib/scene/text/utils/getPo2TextureFromSource.mjs
function getPo2TextureFromSource(image2, width, height, resolution, autoGenerateMipmaps = false, scaleMode) {
  const bounds = tempBounds2;
  bounds.minX = 0;
  bounds.minY = 0;
  bounds.maxX = image2.width / resolution | 0;
  bounds.maxY = image2.height / resolution | 0;
  const texture = TexturePool.getOptimalTexture({
    width: bounds.width,
    height: bounds.height,
    resolution,
    autoGenerateMipmaps,
    scaleMode
  });
  texture.source.uploadMethodId = "image";
  texture.source.resource = image2;
  texture.source.alphaMode = "premultiply-alpha-on-upload";
  texture.frame.width = width / resolution;
  texture.frame.height = height / resolution;
  texture.source.emit("update", texture.source);
  texture.updateUvs();
  return texture;
}
var tempBounds2;
var init_getPo2TextureFromSource = __esm({
  "client/node_modules/pixi.js/lib/scene/text/utils/getPo2TextureFromSource.mjs"() {
    init_TexturePool();
    init_Bounds();
    tempBounds2 = new Bounds();
  }
});

// client/node_modules/pixi.js/lib/filters/CanvasFilterSystem.mjs
function isCanvasFilterCapable(filter) {
  return typeof filter.getCanvasFilterString === "function";
}
var CanvasFilterFrame, CanvasFilterSystem;
var init_CanvasFilterSystem = __esm({
  "client/node_modules/pixi.js/lib/filters/CanvasFilterSystem.mjs"() {
    init_Extensions();
    init_canvasUtils();
    init_CanvasPool();
    init_Bounds();
    init_getRenderableBounds();
    init_getPo2TextureFromSource();
    CanvasFilterFrame = class {
      constructor() {
        this.skip = false;
        this.useClip = false;
        this.filters = null;
        this.container = null;
        this.bounds = new Bounds();
        this.cssFilterString = "";
      }
    };
    CanvasFilterSystem = class {
      /**
       * @param renderer - The Canvas renderer
       * @param renderer.canvasContext
       * @param renderer.canvasContext.activeContext
       * @param renderer.canvasContext.activeResolution
       */
      constructor(renderer) {
        this._filterStack = [];
        this._filterStackIndex = 0;
        this._savedStates = [];
        this._alphaMultiplier = 1;
        this._warnedFilterTypes = /* @__PURE__ */ new Set();
        this.renderer = renderer;
      }
      /**
       * Push a filter instruction onto the stack.
       * Called when entering a filtered container.
       * @param instruction - The filter instruction from FilterPipe
       */
      push(instruction) {
        const filterFrame = this._pushFilterFrame();
        const filters = instruction.filterEffect.filters;
        filterFrame.skip = false;
        filterFrame.useClip = false;
        filterFrame.filters = filters;
        filterFrame.container = instruction.container;
        filterFrame.cssFilterString = "";
        if (filters.every((filter) => !filter.enabled)) {
          filterFrame.skip = true;
          return;
        }
        const cssFilters = [];
        const alphaMultiplier = 1;
        for (const filter of filters) {
          if (!filter.enabled) continue;
          if (!isCanvasFilterCapable(filter)) {
            this._warnUnsupportedFilter(filter);
            continue;
          }
          const cssString = filter.getCanvasFilterString();
          if (cssString === null) {
            this._warnUnsupportedFilter(filter);
            continue;
          }
          if (cssString) {
            cssFilters.push(cssString);
          }
        }
        if (cssFilters.length === 0 && alphaMultiplier === 1) {
          filterFrame.skip = true;
          return;
        }
        filterFrame.cssFilterString = cssFilters.join(" ");
        this._calculateFilterArea(instruction, filterFrame.bounds);
        filterFrame.useClip = !!instruction.filterEffect.filterArea;
        const context2 = this.renderer.canvasContext.activeContext;
        const previousFilter = context2.filter || "none";
        this._savedStates.push({ filter: previousFilter, alphaMultiplier: this._alphaMultiplier });
        if (filterFrame.useClip && Number.isFinite(filterFrame.bounds.width) && Number.isFinite(filterFrame.bounds.height) && filterFrame.bounds.width > 0 && filterFrame.bounds.height > 0) {
          const resolution = this.renderer.canvasContext.activeResolution || 1;
          context2.save();
          context2.setTransform(1, 0, 0, 1, 0, 0);
          context2.beginPath();
          context2.rect(
            filterFrame.bounds.x * resolution,
            filterFrame.bounds.y * resolution,
            filterFrame.bounds.width * resolution,
            filterFrame.bounds.height * resolution
          );
          context2.clip();
        } else {
          filterFrame.useClip = false;
        }
        if (alphaMultiplier !== 1) {
          this._alphaMultiplier *= alphaMultiplier;
        }
        if (filterFrame.cssFilterString) {
          context2.filter = previousFilter !== "none" ? `${previousFilter} ${filterFrame.cssFilterString}` : filterFrame.cssFilterString;
        }
      }
      /** Pop a filter from the stack. Called when exiting a filtered container. */
      pop() {
        const filterFrame = this._popFilterFrame();
        if (filterFrame.skip) {
          return;
        }
        const savedState = this._savedStates.pop();
        if (!savedState) {
          return;
        }
        const context2 = this.renderer.canvasContext.activeContext;
        if (filterFrame.useClip) {
          context2.restore();
        } else {
          context2.filter = savedState.filter;
        }
        this._alphaMultiplier = savedState.alphaMultiplier;
      }
      /**
       * Applies supported filters to a texture and returns a new texture.
       * Unsupported filters are skipped with a warn-once message.
       * @param params - The parameters for applying filters.
       * @param params.texture
       * @param params.filters
       * @returns The resulting texture after filters are applied.
       */
      generateFilteredTexture({ texture, filters }) {
        if (!filters?.length || filters.every((filter) => !filter.enabled)) {
          return texture;
        }
        const cssFilters = [];
        const alphaMultiplier = 1;
        for (const filter of filters) {
          if (!filter.enabled) continue;
          if (!isCanvasFilterCapable(filter)) {
            this._warnUnsupportedFilter(filter);
            continue;
          }
          const cssString = filter.getCanvasFilterString();
          if (cssString === null) {
            this._warnUnsupportedFilter(filter);
            continue;
          }
          if (cssString) {
            cssFilters.push(cssString);
          }
        }
        if (cssFilters.length === 0 && alphaMultiplier === 1) {
          return texture;
        }
        const source2 = canvasUtils.getCanvasSource(texture);
        if (!source2) {
          return texture;
        }
        const frame = texture.frame;
        const resolution = texture.source._resolution ?? texture.source.resolution ?? 1;
        const width = frame.width;
        const height = frame.height;
        const canvasAndContext = CanvasPool.getOptimalCanvasAndContext(width, height, resolution);
        const { canvas, context: context2 } = canvasAndContext;
        context2.setTransform(1, 0, 0, 1, 0, 0);
        context2.clearRect(0, 0, canvas.width, canvas.height);
        if (cssFilters.length) {
          context2.filter = cssFilters.join(" ");
        }
        if (alphaMultiplier !== 1) {
          context2.globalAlpha = alphaMultiplier;
        }
        const sx = frame.x * resolution;
        const sy = frame.y * resolution;
        const sw = width * resolution;
        const sh = height * resolution;
        context2.drawImage(
          source2,
          sx,
          sy,
          sw,
          sh,
          0,
          0,
          sw,
          sh
        );
        context2.filter = "none";
        context2.globalAlpha = 1;
        return getPo2TextureFromSource(canvas, width, height, resolution);
      }
      /**
       * Calculate the filter area bounds.
       * @param instruction - Filter instruction
       * @param bounds - Bounds object to populate
       */
      _calculateFilterArea(instruction, bounds) {
        if (instruction.renderables) {
          getGlobalRenderableBounds(instruction.renderables, bounds);
        } else if (instruction.filterEffect.filterArea) {
          bounds.clear();
          bounds.addRect(instruction.filterEffect.filterArea);
          bounds.applyMatrix(instruction.container.worldTransform);
        } else {
          instruction.container.getFastGlobalBounds(true, bounds);
        }
        if (instruction.container) {
          const renderGroup = instruction.container.renderGroup || instruction.container.parentRenderGroup;
          const filterFrameTransform = renderGroup?.cacheToLocalTransform;
          if (filterFrameTransform) {
            bounds.applyMatrix(filterFrameTransform);
          }
        }
      }
      _warnUnsupportedFilter(filter) {
        const filterName = filter?.constructor?.name || "Filter";
        if (this._warnedFilterTypes.has(filterName)) {
          return;
        }
        this._warnedFilterTypes.add(filterName);
        console.warn(
          `CanvasRenderer: filter "${filterName}" is not supported in Canvas2D and will be skipped.`
        );
      }
      get alphaMultiplier() {
        return this._alphaMultiplier;
      }
      _pushFilterFrame() {
        let filterFrame = this._filterStack[this._filterStackIndex];
        if (!filterFrame) {
          filterFrame = this._filterStack[this._filterStackIndex] = new CanvasFilterFrame();
        }
        this._filterStackIndex++;
        return filterFrame;
      }
      _popFilterFrame() {
        if (this._filterStackIndex <= 0) {
          return this._filterStack[0];
        }
        this._filterStackIndex--;
        return this._filterStack[this._filterStackIndex];
      }
      /** Destroys the system */
      destroy() {
        this._filterStack = null;
        this._savedStates = null;
        this._warnedFilterTypes = null;
        this._alphaMultiplier = 1;
      }
    };
    CanvasFilterSystem.extension = {
      type: [ExtensionType.CanvasSystem],
      name: "filter"
    };
  }
});

// client/node_modules/pixi.js/lib/filters/FilterPipe.mjs
var FilterPipe;
var init_FilterPipe = __esm({
  "client/node_modules/pixi.js/lib/filters/FilterPipe.mjs"() {
    init_Extensions();
    FilterPipe = class {
      constructor(renderer) {
        this._renderer = renderer;
      }
      push(filterEffect, container, instructionSet) {
        const renderPipes = this._renderer.renderPipes;
        renderPipes.batch.break(instructionSet);
        instructionSet.add({
          renderPipeId: "filter",
          canBundle: false,
          action: "pushFilter",
          container,
          filterEffect
        });
      }
      pop(_filterEffect, _container, instructionSet) {
        this._renderer.renderPipes.batch.break(instructionSet);
        instructionSet.add({
          renderPipeId: "filter",
          action: "popFilter",
          canBundle: false
        });
      }
      execute(instruction) {
        if (instruction.action === "pushFilter") {
          this._renderer.filter.push(instruction);
        } else if (instruction.action === "popFilter") {
          this._renderer.filter.pop();
        }
      }
      destroy() {
        this._renderer = null;
      }
    };
    FilterPipe.extension = {
      type: [
        ExtensionType.WebGLPipes,
        ExtensionType.WebGPUPipes,
        ExtensionType.CanvasPipes
      ],
      name: "filter"
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/utils/createIdFromString.mjs
function createIdFromString(value, groupId) {
  let id = idHash2[value];
  if (id === void 0) {
    if (idCounts[groupId] === void 0) {
      idCounts[groupId] = 1;
    }
    idHash2[value] = id = idCounts[groupId]++;
  }
  return id;
}
var idCounts, idHash2;
var init_createIdFromString = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/utils/createIdFromString.mjs"() {
    "use strict";
    idCounts = /* @__PURE__ */ Object.create(null);
    idHash2 = /* @__PURE__ */ Object.create(null);
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/getTestContext.mjs
function getTestContext() {
  if (!context || context?.isContextLost()) {
    const canvas = DOMAdapter.get().createCanvas();
    context = canvas.getContext("webgl", {});
  }
  return context;
}
var context;
var init_getTestContext = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/getTestContext.mjs"() {
    init_adapter();
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/getMaxFragmentPrecision.mjs
function getMaxFragmentPrecision() {
  if (!maxFragmentPrecision) {
    maxFragmentPrecision = "mediump";
    const gl = getTestContext();
    if (gl) {
      if (gl.getShaderPrecisionFormat) {
        const shaderFragment = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        maxFragmentPrecision = shaderFragment.precision ? "highp" : "mediump";
      }
    }
  }
  return maxFragmentPrecision;
}
var maxFragmentPrecision;
var init_getMaxFragmentPrecision = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/getMaxFragmentPrecision.mjs"() {
    init_getTestContext();
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/addProgramDefines.mjs
function addProgramDefines(src, isES300, isFragment) {
  if (isES300) return src;
  if (isFragment) {
    src = src.replace("out vec4 finalColor;", "");
    return `

        #ifdef GL_ES // This checks if it is WebGL1
        #define in varying
        #define finalColor gl_FragColor
        #define texture texture2D
        #endif
        ${src}
        `;
  }
  return `

        #ifdef GL_ES // This checks if it is WebGL1
        #define in attribute
        #define out varying
        #endif
        ${src}
        `;
}
var init_addProgramDefines = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/addProgramDefines.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/ensurePrecision.mjs
function ensurePrecision(src, options, isFragment) {
  const maxSupportedPrecision = isFragment ? options.maxSupportedFragmentPrecision : options.maxSupportedVertexPrecision;
  if (src.substring(0, 9) !== "precision") {
    let precision = isFragment ? options.requestedFragmentPrecision : options.requestedVertexPrecision;
    if (precision === "highp" && maxSupportedPrecision !== "highp") {
      precision = "mediump";
    }
    return `precision ${precision} float;
${src}`;
  } else if (maxSupportedPrecision !== "highp" && src.substring(0, 15) === "precision highp") {
    return src.replace("precision highp", "precision mediump");
  }
  return src;
}
var init_ensurePrecision = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/ensurePrecision.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/insertVersion.mjs
function insertVersion(src, isES300) {
  if (!isES300) return src;
  return `#version 300 es
${src}`;
}
var init_insertVersion = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/insertVersion.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/setProgramName.mjs
function setProgramName(src, { name = `pixi-program` }, isFragment = true) {
  name = name.replace(/\s+/g, "-");
  name += isFragment ? "-fragment" : "-vertex";
  const nameCache = isFragment ? fragmentNameCache : VertexNameCache;
  if (nameCache[name]) {
    nameCache[name]++;
    name += `-${nameCache[name]}`;
  } else {
    nameCache[name] = 1;
  }
  if (src.indexOf("#define SHADER_NAME") !== -1) return src;
  const shaderName = `#define SHADER_NAME ${name}`;
  return `${shaderName}
${src}`;
}
var fragmentNameCache, VertexNameCache;
var init_setProgramName = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/setProgramName.mjs"() {
    "use strict";
    fragmentNameCache = {};
    VertexNameCache = {};
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/stripVersion.mjs
function stripVersion(src, isES300) {
  if (!isES300) return src;
  return src.replace("#version 300 es", "");
}
var init_stripVersion = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/program/preprocessors/stripVersion.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/GlProgram.mjs
var processes, programCache, _GlProgram, GlProgram;
var init_GlProgram = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gl/shader/GlProgram.mjs"() {
    init_createIdFromString();
    init_getMaxFragmentPrecision();
    init_addProgramDefines();
    init_ensurePrecision();
    init_insertVersion();
    init_setProgramName();
    init_stripVersion();
    processes = {
      // strips any version headers..
      stripVersion,
      // adds precision string if not already present
      ensurePrecision,
      // add some defines if WebGL1 to make it more compatible with WebGL2 shaders
      addProgramDefines,
      // add the program name to the shader
      setProgramName,
      // add the version string to the shader header
      insertVersion
    };
    programCache = /* @__PURE__ */ Object.create(null);
    _GlProgram = class _GlProgram2 {
      /**
       * Creates a shiny new GlProgram. Used by WebGL renderer.
       * @param options - The options for the program.
       */
      constructor(options) {
        options = { ..._GlProgram2.defaultOptions, ...options };
        const isES300 = options.fragment.indexOf("#version 300 es") !== -1;
        const preprocessorOptions = {
          stripVersion: isES300,
          ensurePrecision: {
            requestedFragmentPrecision: options.preferredFragmentPrecision,
            requestedVertexPrecision: options.preferredVertexPrecision,
            maxSupportedVertexPrecision: "highp",
            maxSupportedFragmentPrecision: getMaxFragmentPrecision()
          },
          setProgramName: {
            name: options.name
          },
          addProgramDefines: isES300,
          insertVersion: isES300
        };
        let fragment2 = options.fragment;
        let vertex2 = options.vertex;
        Object.keys(processes).forEach((processKey) => {
          const processOptions = preprocessorOptions[processKey];
          fragment2 = processes[processKey](fragment2, processOptions, true);
          vertex2 = processes[processKey](vertex2, processOptions, false);
        });
        this.fragment = fragment2;
        this.vertex = vertex2;
        this.transformFeedbackVaryings = options.transformFeedbackVaryings;
        this._key = createIdFromString(`${this.vertex}:${this.fragment}`, "gl-program");
      }
      /** destroys the program */
      destroy() {
        this.fragment = null;
        this.vertex = null;
        this._attributeData = null;
        this._uniformData = null;
        this._uniformBlockData = null;
        this.transformFeedbackVaryings = null;
        programCache[this._cacheKey] = null;
      }
      /**
       * Helper function that creates a program for a given source.
       * It will check the program cache if the program has already been created.
       * If it has that one will be returned, if not a new one will be created and cached.
       * @param options - The options for the program.
       * @returns A program using the same source
       */
      static from(options) {
        const key = `${options.vertex}:${options.fragment}`;
        if (!programCache[key]) {
          programCache[key] = new _GlProgram2(options);
          programCache[key]._cacheKey = key;
        }
        return programCache[key];
      }
    };
    _GlProgram.defaultOptions = {
      preferredVertexPrecision: "highp",
      preferredFragmentPrecision: "mediump"
    };
    GlProgram = _GlProgram;
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/geometry/utils/getAttributeInfoFromFormat.mjs
function getAttributeInfoFromFormat(format) {
  return attributeFormatData[format] ?? attributeFormatData.float32;
}
var attributeFormatData;
var init_getAttributeInfoFromFormat = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/geometry/utils/getAttributeInfoFromFormat.mjs"() {
    "use strict";
    attributeFormatData = {
      uint8x2: { size: 2, stride: 2, normalised: false },
      uint8x4: { size: 4, stride: 4, normalised: false },
      sint8x2: { size: 2, stride: 2, normalised: false },
      sint8x4: { size: 4, stride: 4, normalised: false },
      unorm8x2: { size: 2, stride: 2, normalised: true },
      unorm8x4: { size: 4, stride: 4, normalised: true },
      snorm8x2: { size: 2, stride: 2, normalised: true },
      snorm8x4: { size: 4, stride: 4, normalised: true },
      uint16x2: { size: 2, stride: 4, normalised: false },
      uint16x4: { size: 4, stride: 8, normalised: false },
      sint16x2: { size: 2, stride: 4, normalised: false },
      sint16x4: { size: 4, stride: 8, normalised: false },
      unorm16x2: { size: 2, stride: 4, normalised: true },
      unorm16x4: { size: 4, stride: 8, normalised: true },
      snorm16x2: { size: 2, stride: 4, normalised: true },
      snorm16x4: { size: 4, stride: 8, normalised: true },
      float16x2: { size: 2, stride: 4, normalised: false },
      float16x4: { size: 4, stride: 8, normalised: false },
      float32: { size: 1, stride: 4, normalised: false },
      float32x2: { size: 2, stride: 8, normalised: false },
      float32x3: { size: 3, stride: 12, normalised: false },
      float32x4: { size: 4, stride: 16, normalised: false },
      uint32: { size: 1, stride: 4, normalised: false },
      uint32x2: { size: 2, stride: 8, normalised: false },
      uint32x3: { size: 3, stride: 12, normalised: false },
      uint32x4: { size: 4, stride: 16, normalised: false },
      sint32: { size: 1, stride: 4, normalised: false },
      sint32x2: { size: 2, stride: 8, normalised: false },
      sint32x3: { size: 3, stride: 12, normalised: false },
      sint32x4: { size: 4, stride: 16, normalised: false }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/extractAttributesFromGpuProgram.mjs
function parseLocations(str, results) {
  let match;
  while ((match = LOCATION_REGEX.exec(str)) !== null) {
    const format = WGSL_TO_VERTEX_TYPES[match[3]] ?? "float32";
    results[match[2]] = {
      location: parseInt(match[1], 10),
      format,
      stride: getAttributeInfoFromFormat(format).stride,
      offset: 0,
      instance: false,
      start: 0
    };
  }
  LOCATION_REGEX.lastIndex = 0;
}
function stripComments(source2) {
  return source2.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
function extractAttributesFromGpuProgram({ source: source2, entryPoint }) {
  const results = {};
  const cleanSource = stripComments(source2);
  const mainVertStart = cleanSource.indexOf(`fn ${entryPoint}(`);
  if (mainVertStart === -1) {
    return results;
  }
  const arrowFunctionStart = cleanSource.indexOf("->", mainVertStart);
  if (arrowFunctionStart === -1) {
    return results;
  }
  const functionArgsSubstring = cleanSource.substring(mainVertStart, arrowFunctionStart);
  parseLocations(functionArgsSubstring, results);
  if (Object.keys(results).length === 0) {
    const structMatch = functionArgsSubstring.match(/\(\s*\w+\s*:\s*(\w+)/);
    if (structMatch) {
      const structName = structMatch[1];
      const structRegex = new RegExp(`struct\\s+${structName}\\s*\\{([^}]+)\\}`, "s");
      const structBody = cleanSource.match(structRegex);
      if (structBody) {
        parseLocations(structBody[1], results);
      }
    }
  }
  return results;
}
var WGSL_TO_VERTEX_TYPES, LOCATION_REGEX;
var init_extractAttributesFromGpuProgram = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/extractAttributesFromGpuProgram.mjs"() {
    init_getAttributeInfoFromFormat();
    WGSL_TO_VERTEX_TYPES = {
      f32: "float32",
      "vec2<f32>": "float32x2",
      "vec3<f32>": "float32x3",
      "vec4<f32>": "float32x4",
      vec2f: "float32x2",
      vec3f: "float32x3",
      vec4f: "float32x4",
      i32: "sint32",
      "vec2<i32>": "sint32x2",
      "vec3<i32>": "sint32x3",
      "vec4<i32>": "sint32x4",
      vec2i: "sint32x2",
      vec3i: "sint32x3",
      vec4i: "sint32x4",
      u32: "uint32",
      "vec2<u32>": "uint32x2",
      "vec3<u32>": "uint32x3",
      "vec4<u32>": "uint32x4",
      vec2u: "uint32x2",
      vec3u: "uint32x3",
      vec4u: "uint32x4",
      bool: "uint32",
      "vec2<bool>": "uint32x2",
      "vec3<bool>": "uint32x3",
      "vec4<bool>": "uint32x4"
    };
    LOCATION_REGEX = /@location\((\d+)\)\s+([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_<>]+)(?:,|\s|\)|$)/g;
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/extractStructAndGroups.mjs
function extractStructAndGroups(wgsl) {
  const linePattern = /(^|[^/])@(group|binding)\(\d+\)[^;]+;/g;
  const groupPattern = /@group\((\d+)\)/;
  const bindingPattern = /@binding\((\d+)\)/;
  const namePattern = /var(<[^>]+>)? (\w+)/;
  const typePattern = /:\s*([\w<>]+)/;
  const structPattern = /struct\s+(\w+)\s*{([^}]+)}/g;
  const structMemberPattern = /(\w+)\s*:\s*([\w\<\>]+)/g;
  const structName = /struct\s+(\w+)/;
  const groups = wgsl.match(linePattern)?.map((item) => {
    const varMatch = item.match(namePattern);
    const varQualifier = varMatch?.[1] ?? "";
    let accessMode;
    if (varQualifier === "<uniform>") {
      accessMode = "uniform";
    } else if (varQualifier.startsWith("<storage")) {
      accessMode = "storage";
    }
    return {
      group: parseInt(item.match(groupPattern)[1], 10),
      binding: parseInt(item.match(bindingPattern)[1], 10),
      name: varMatch[2],
      accessMode,
      type: item.match(typePattern)[1]
    };
  });
  if (!groups) {
    return {
      groups: [],
      structs: []
    };
  }
  const structs = wgsl.match(structPattern)?.map((struct) => {
    const name = struct.match(structName)[1];
    const members = struct.match(structMemberPattern).reduce((acc, member) => {
      const [name2, type] = member.split(":");
      acc[name2.trim()] = type.trim();
      return acc;
    }, {});
    if (!members) {
      return null;
    }
    return { name, members };
  }).filter(({ name }) => groups.some(
    (group) => (
      // Handle both direct type matches and generic types like array<StructName>
      group.type === name || group.type.includes(`<${name}>`)
    )
  )) ?? [];
  return {
    groups,
    structs
  };
}
var init_extractStructAndGroups = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/extractStructAndGroups.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/const.mjs
var ShaderStage;
var init_const3 = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/const.mjs"() {
    "use strict";
    ShaderStage = /* @__PURE__ */ ((ShaderStage2) => {
      ShaderStage2[ShaderStage2["VERTEX"] = 1] = "VERTEX";
      ShaderStage2[ShaderStage2["FRAGMENT"] = 2] = "FRAGMENT";
      ShaderStage2[ShaderStage2["COMPUTE"] = 4] = "COMPUTE";
      return ShaderStage2;
    })(ShaderStage || {});
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/generateGpuLayoutGroups.mjs
function generateGpuLayoutGroups({ groups }) {
  const layout = [];
  for (let i2 = 0; i2 < groups.length; i2++) {
    const group = groups[i2];
    if (!layout[group.group]) {
      layout[group.group] = [];
    }
    if (group.accessMode === "uniform") {
      layout[group.group].push({
        binding: group.binding,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        buffer: {
          type: "uniform"
        }
      });
    } else if (group.accessMode === "storage") {
      layout[group.group].push({
        binding: group.binding,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        buffer: {
          type: "read-only-storage"
        }
      });
    } else if (group.type === "sampler") {
      layout[group.group].push({
        binding: group.binding,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        sampler: {
          type: "filtering"
        }
      });
    } else if (group.type === "sampler_comparison") {
      layout[group.group].push({
        binding: group.binding,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        sampler: {
          type: "comparison"
        }
      });
    } else if (group.type === "texture_2d" || group.type.startsWith("texture_2d<")) {
      layout[group.group].push({
        binding: group.binding,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
          viewDimension: "2d",
          multisampled: false
        }
      });
    } else if (group.type === "texture_depth_2d") {
      layout[group.group].push({
        binding: group.binding,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        texture: {
          sampleType: "depth",
          viewDimension: "2d",
          multisampled: false
        }
      });
    } else if (group.type === "texture_depth_2d_array") {
      layout[group.group].push({
        binding: group.binding,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        texture: {
          sampleType: "depth",
          viewDimension: "2d-array",
          multisampled: false
        }
      });
    } else if (group.type === "texture_2d_array" || group.type.startsWith("texture_2d_array<")) {
      layout[group.group].push({
        binding: group.binding,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
          viewDimension: "2d-array",
          multisampled: false
        }
      });
    } else if (group.type === "texture_cube" || group.type.startsWith("texture_cube<")) {
      layout[group.group].push({
        binding: group.binding,
        visibility: ShaderStage.VERTEX | ShaderStage.FRAGMENT,
        texture: {
          sampleType: "float",
          viewDimension: "cube",
          multisampled: false
        }
      });
    }
  }
  for (let i2 = 0; i2 < layout.length; i2++) {
    layout[i2] || (layout[i2] = []);
  }
  return layout;
}
var init_generateGpuLayoutGroups = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/generateGpuLayoutGroups.mjs"() {
    init_const3();
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/generateLayoutHash.mjs
function generateLayoutHash({ groups }) {
  const layout = [];
  for (let i2 = 0; i2 < groups.length; i2++) {
    const group = groups[i2];
    if (!layout[group.group]) {
      layout[group.group] = {};
    }
    layout[group.group][group.name] = group.binding;
  }
  return layout;
}
var init_generateLayoutHash = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/generateLayoutHash.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/removeStructAndGroupDuplicates.mjs
function removeStructAndGroupDuplicates(vertexStructsAndGroups, fragmentStructsAndGroups) {
  const structNameSet = /* @__PURE__ */ new Set();
  const dupeGroupKeySet = /* @__PURE__ */ new Set();
  const structs = [...vertexStructsAndGroups.structs, ...fragmentStructsAndGroups.structs].filter((struct) => {
    if (structNameSet.has(struct.name)) {
      return false;
    }
    structNameSet.add(struct.name);
    return true;
  });
  const groups = [...vertexStructsAndGroups.groups, ...fragmentStructsAndGroups.groups].filter((group) => {
    const key = `${group.name}-${group.binding}`;
    if (dupeGroupKeySet.has(key)) {
      return false;
    }
    dupeGroupKeySet.add(key);
    return true;
  });
  return { structs, groups };
}
var init_removeStructAndGroupDuplicates = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/utils/removeStructAndGroupDuplicates.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/GpuProgram.mjs
var programCache2, GpuProgram;
var init_GpuProgram = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/GpuProgram.mjs"() {
    init_createIdFromString();
    init_extractAttributesFromGpuProgram();
    init_extractStructAndGroups();
    init_generateGpuLayoutGroups();
    init_generateLayoutHash();
    init_removeStructAndGroupDuplicates();
    programCache2 = /* @__PURE__ */ Object.create(null);
    GpuProgram = class _GpuProgram {
      /**
       * Create a new GpuProgram
       * @param options - The options for the gpu program
       */
      constructor(options) {
        this._layoutKey = 0;
        this._attributeLocationsKey = 0;
        const { fragment: fragment2, vertex: vertex2, layout, gpuLayout, name } = options;
        this.name = name;
        this.fragment = fragment2;
        this.vertex = vertex2;
        if (fragment2.source === vertex2.source) {
          const structsAndGroups = extractStructAndGroups(fragment2.source);
          this.structsAndGroups = structsAndGroups;
        } else {
          const vertexStructsAndGroups = extractStructAndGroups(vertex2.source);
          const fragmentStructsAndGroups = extractStructAndGroups(fragment2.source);
          this.structsAndGroups = removeStructAndGroupDuplicates(vertexStructsAndGroups, fragmentStructsAndGroups);
        }
        this.layout = layout ?? generateLayoutHash(this.structsAndGroups);
        this.gpuLayout = gpuLayout ?? generateGpuLayoutGroups(this.structsAndGroups);
        this.autoAssignGlobalUniforms = !!(this.layout[0]?.globalUniforms !== void 0);
        this.autoAssignLocalUniforms = !!(this.layout[1]?.localUniforms !== void 0);
        this._generateProgramKey();
      }
      // TODO maker this pure
      _generateProgramKey() {
        const { vertex: vertex2, fragment: fragment2 } = this;
        const bigKey = vertex2.source + fragment2.source + vertex2.entryPoint + fragment2.entryPoint;
        this._layoutKey = createIdFromString(bigKey, "program");
      }
      get attributeData() {
        this._attributeData ?? (this._attributeData = extractAttributesFromGpuProgram(this.vertex));
        return this._attributeData;
      }
      /** destroys the program */
      destroy() {
        this.gpuLayout = null;
        this.layout = null;
        this.structsAndGroups = null;
        this.fragment = null;
        this.vertex = null;
        programCache2[this._cacheKey] = null;
      }
      /**
       * Helper function that creates a program for a given source.
       * It will check the program cache if the program has already been created.
       * If it has that one will be returned, if not a new one will be created and cached.
       * @param options - The options for the program.
       * @returns A program using the same source
       */
      static from(options) {
        const key = `${options.vertex.source}:${options.fragment.source}:${options.fragment.entryPoint}:${options.vertex.entryPoint}`;
        if (!programCache2[key]) {
          programCache2[key] = new _GpuProgram(options);
          programCache2[key]._cacheKey = key;
        }
        return programCache2[key];
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/BindGroup.mjs
var BindGroup;
var init_BindGroup = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/gpu/shader/BindGroup.mjs"() {
    init_warn();
    BindGroup = class {
      /**
       * Create a new instance of the Bind Group.
       * @param resources - The resources that are bound together for use by a shader.
       */
      constructor(resources) {
        this.resources = /* @__PURE__ */ Object.create(null);
        this._dirty = true;
        let index = 0;
        for (const i2 in resources) {
          const resource = resources[i2];
          this.setResource(resource, index++);
        }
      }
      /**
       * A key used internally to match it up to a WebGPU BindGroup.
       * Lazily rebuilt from resource IDs when dirty.
       * @internal
       */
      get _key() {
        if (this._dirty) {
          this._dirty = false;
          const keyParts = [];
          let index = 0;
          for (const i2 in this.resources) {
            keyParts[index++] = this.resources[i2] ? this.resources[i2]._resourceId : -1;
          }
          this._keyValue = keyParts.join("|");
        }
        return this._keyValue;
      }
      /**
       * Set a resource at a given index. This function will
       * ensure that listeners will be removed from the current resource
       * and added to the new resource.
       * @param resource - The resource to set.
       * @param index - The index to set the resource at.
       */
      setResource(resource, index) {
        const currentResource = this.resources[index];
        if (resource === currentResource) return;
        if (currentResource) {
          currentResource.off?.("change", this.onResourceChange, this);
        }
        resource.on?.("change", this.onResourceChange, this);
        this.resources[index] = resource;
        this._dirty = true;
      }
      /**
       * Returns the resource at the current specified index.
       * @param index - The index of the resource to get.
       * @returns - The resource at the specified index.
       */
      getResource(index) {
        return this.resources[index];
      }
      /**
       * Used internally to 'touch' each resource, to ensure that the GC
       * knows that all resources in this bind group are still being used.
       * @param now - The current time in milliseconds.
       * @internal
       */
      _touch(now) {
        const resources = this.resources;
        for (const i2 in resources) {
          const resource = resources[i2];
          if (!resource) continue;
          resource._gcLastUsed = now;
        }
      }
      /** Destroys this bind group and removes all listeners. */
      destroy() {
        const resources = this.resources;
        for (const i2 in resources) {
          const resource = resources[i2];
          resource?.off?.("change", this.onResourceChange, this);
        }
        this.resources = null;
      }
      onResourceChange(resource) {
        this._dirty = true;
        if (resource.destroyed) {
          const resources = this.resources;
          for (const i2 in resources) {
            if (resources[i2] === resource) {
              resources[i2] = null;
            }
          }
          warn(`[BindGroup] a '${resource._resourceType}' was destroyed while still bound to a shader. Remove it from the shader before destroying it.`);
        }
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/types.mjs
var RendererType;
var init_types = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/types.mjs"() {
    "use strict";
    RendererType = /* @__PURE__ */ ((RendererType2) => {
      RendererType2[RendererType2["WEBGL"] = 1] = "WEBGL";
      RendererType2[RendererType2["WEBGPU"] = 2] = "WEBGPU";
      RendererType2[RendererType2["CANVAS"] = 4] = "CANVAS";
      RendererType2[RendererType2["BOTH"] = 3] = "BOTH";
      return RendererType2;
    })(RendererType || {});
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/ShaderOverrides.mjs
var ShaderOverrides;
var init_ShaderOverrides = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/ShaderOverrides.mjs"() {
    init_createIdFromString();
    ShaderOverrides = class _ShaderOverrides {
      /**
       * @param data - A dictionary of constants to set on the shader.
       * Keys should match the constant names in the WGSL shader.
       */
      constructor(data) {
        this.data = { ...data };
        const key = Object.keys(data).sort().map((k2) => `${k2}:${data[k2]}`).join("|");
        this.id = createIdFromString(key, "shader-overrides");
      }
      /**
       * Creates a ShaderOverrides instance from a plain object or existing instance.
       * @param overrides - The overrides to convert.
       * @returns A ShaderOverrides instance.
       */
      static from(overrides) {
        if (overrides instanceof _ShaderOverrides) {
          return overrides;
        }
        return new _ShaderOverrides(overrides);
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/types.mjs
var UNIFORM_TYPES_VALUES, UNIFORM_TYPES_MAP;
var init_types2 = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/types.mjs"() {
    "use strict";
    UNIFORM_TYPES_VALUES = [
      "f32",
      "i32",
      "u32",
      "vec2<f32>",
      "vec3<f32>",
      "vec4<f32>",
      "mat2x2<f32>",
      "mat3x3<f32>",
      "mat4x4<f32>",
      "mat3x2<f32>",
      "mat4x2<f32>",
      "mat2x3<f32>",
      "mat4x3<f32>",
      "mat2x4<f32>",
      "mat3x4<f32>",
      "vec2<i32>",
      "vec3<i32>",
      "vec4<i32>",
      "vec2<u32>",
      "vec3<u32>",
      "vec4<u32>"
    ];
    UNIFORM_TYPES_MAP = UNIFORM_TYPES_VALUES.reduce((acc, type) => {
      acc[type] = true;
      return acc;
    }, {});
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/utils/getDefaultUniformValue.mjs
function getDefaultUniformValue(type, size) {
  switch (type) {
    case "f32":
      return 0;
    case "vec2<f32>":
      return new Float32Array(2 * size);
    case "vec3<f32>":
      return new Float32Array(3 * size);
    case "vec4<f32>":
      return new Float32Array(4 * size);
    case "mat2x2<f32>":
      return new Float32Array([
        1,
        0,
        0,
        1
      ]);
    case "mat3x3<f32>":
      return new Float32Array([
        1,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1
      ]);
    case "mat4x4<f32>":
      return new Float32Array([
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1
      ]);
  }
  return null;
}
var init_getDefaultUniformValue = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/utils/getDefaultUniformValue.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/UniformGroup.mjs
var _UniformGroup, UniformGroup;
var init_UniformGroup = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/UniformGroup.mjs"() {
    init_eventemitter3();
    init_uid();
    init_createIdFromString();
    init_types2();
    init_getDefaultUniformValue();
    _UniformGroup = class _UniformGroup2 extends eventemitter3_default {
      /**
       * Create a new Uniform group
       * @param uniformStructures - The structures of the uniform group
       * @param options - The optional parameters of this uniform group
       */
      constructor(uniformStructures, options) {
        super();
        this.uid = uid("uniform");
        this._resourceType = "uniformGroup";
        this._resourceId = uid("resource");
        this.isUniformGroup = true;
        this._dirtyId = 0;
        this.destroyed = false;
        options = { ..._UniformGroup2.defaultOptions, ...options };
        this.uniformStructures = uniformStructures;
        const uniforms = {};
        for (const i2 in uniformStructures) {
          const uniformData = uniformStructures[i2];
          uniformData.name = i2;
          uniformData.size = uniformData.size ?? 1;
          if (!UNIFORM_TYPES_MAP[uniformData.type]) {
            const arrayMatch = uniformData.type.match(/^array<(\w+(?:<\w+>)?),\s*(\d+)>$/);
            if (arrayMatch) {
              const [, innerType, size] = arrayMatch;
              throw new Error(
                `Uniform type ${uniformData.type} is not supported. Use type: '${innerType}', size: ${size} instead.`
              );
            }
            throw new Error(`Uniform type ${uniformData.type} is not supported. Supported uniform types are: ${UNIFORM_TYPES_VALUES.join(", ")}`);
          }
          uniformData.value ?? (uniformData.value = getDefaultUniformValue(uniformData.type, uniformData.size));
          uniforms[i2] = uniformData.value;
        }
        this.uniforms = uniforms;
        this._dirtyId = 1;
        this.ubo = options.ubo;
        this.isStatic = options.isStatic;
        this._signature = createIdFromString(Object.keys(uniforms).map(
          (i2) => `${i2}-${uniformStructures[i2].type}`
        ).join("-"), "uniform-group");
      }
      /**
       * an underlying buffer that will be uploaded to the GPU when using this UniformGroup.
       * It is created lazily by the renderer's ubo system on first use.
       */
      get buffer() {
        return this._buffer;
      }
      set buffer(value) {
        if (this._buffer === value) return;
        this._buffer?.off("change", this.onBufferChange, this);
        this._buffer = value;
        value?.on("change", this.onBufferChange, this);
      }
      /**
       * The GC tracks this group's underlying buffer, not the group itself — a GC stamp on the
       * group (see BindGroup._touch) must land on the buffer, or the GC collects it while
       * cached bind groups still reference it.
       * @internal
       */
      get _gcLastUsed() {
        return this._buffer?._gcLastUsed ?? -1;
      }
      set _gcLastUsed(value) {
        if (this._buffer) this._buffer._gcLastUsed = value;
      }
      /**
       * Bind group keys are built from this group's _resourceId, not the buffer's — so when the
       * buffer re-keys (it resized, or the GC unloaded its GPU copy), this group must re-key too,
       * or cached GPUBindGroups keep referencing the destroyed GPU buffer.
       */
      onBufferChange() {
        this._resourceId = uid("resource");
        this.emit("change", this);
      }
      /** Call this if you want the uniform groups data to be uploaded to the GPU only useful if `isStatic` is true. */
      update() {
        this._dirtyId++;
      }
    };
    _UniformGroup.defaultOptions = {
      /** if true the UniformGroup is handled as an Uniform buffer object. */
      ubo: false,
      /** if true, then you are responsible for when the data is uploaded to the GPU by calling `update()` */
      isStatic: false
    };
    UniformGroup = _UniformGroup;
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/Shader.mjs
var Shader;
var init_Shader = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/shader/Shader.mjs"() {
    init_eventemitter3();
    init_uid();
    init_warn();
    init_GlProgram();
    init_BindGroup();
    init_GpuProgram();
    init_types();
    init_ShaderOverrides();
    init_UniformGroup();
    Shader = class _Shader extends eventemitter3_default {
      constructor(options) {
        super();
        this.uid = uid("shader");
        this._uniformBindMap = /* @__PURE__ */ Object.create(null);
        this._ownedBindGroups = [];
        this._destroyed = false;
        let {
          gpuProgram,
          glProgram,
          groups,
          resources,
          compatibleRenderers,
          groupMap,
          overrides
        } = options;
        this._overrides = overrides ? ShaderOverrides.from(overrides) : null;
        this.gpuProgram = gpuProgram;
        this.glProgram = glProgram;
        if (compatibleRenderers === void 0) {
          compatibleRenderers = 0;
          if (gpuProgram) compatibleRenderers |= RendererType.WEBGPU;
          if (glProgram) compatibleRenderers |= RendererType.WEBGL;
        }
        this.compatibleRenderers = compatibleRenderers;
        const nameHash = {};
        if (groupMap) {
          for (const i2 in groupMap) {
            for (const j2 in groupMap[i2]) {
              const uniformName = groupMap[i2][j2];
              nameHash[uniformName] = {
                group: i2,
                binding: j2,
                name: uniformName
              };
            }
          }
        }
        if (!resources && !groups) {
          resources = {};
        }
        if (resources && groups) {
          throw new Error("[Shader] Cannot have both resources and groups");
        } else if (!gpuProgram && groups && !groupMap) {
          throw new Error("[Shader] No group map or WebGPU shader provided - consider using resources instead.");
        } else if (gpuProgram && groups && !groupMap) {
          const groupData = gpuProgram.structsAndGroups.groups;
          groupMap = {};
          groupData.forEach((data) => {
            groupMap[data.group] = groupMap[data.group] || {};
            groupMap[data.group][data.binding] = data.name;
            nameHash[data.name] = data;
          });
        } else if (resources) {
          groups = {};
          groupMap || (groupMap = {});
          if (gpuProgram) {
            const groupData = gpuProgram.structsAndGroups.groups;
            groupData.forEach((data) => {
              groupMap[data.group] = groupMap[data.group] || {};
              groupMap[data.group][data.binding] = data.name;
              nameHash[data.name] = data;
            });
          }
          let bindTick = 0;
          for (const i2 in resources) {
            if (nameHash[i2]) continue;
            if (gpuProgram && !glProgram) {
              warn(`[Shader] the resource '${i2}' matches no binding in the WGSL source \u2014 is the name correct?`);
            }
            if (!groups[99]) {
              groups[99] = new BindGroup();
              this._ownedBindGroups.push(groups[99]);
            }
            nameHash[i2] = { group: 99, binding: bindTick, name: i2 };
            groupMap[99] = groupMap[99] || {};
            groupMap[99][bindTick] = i2;
            bindTick++;
          }
          for (const i2 in resources) {
            const name = i2;
            let value = resources[i2];
            if (!value.source && !value._resourceType) {
              value = new UniformGroup(value);
            }
            const data = nameHash[name];
            if (data) {
              if (!groups[data.group]) {
                groups[data.group] = new BindGroup();
                this._ownedBindGroups.push(groups[data.group]);
              }
              groups[data.group].setResource(value, data.binding);
            }
          }
        }
        this.groups = groups;
        this._uniformBindMap = groupMap;
        this.resources = this._buildResourceAccessor(groups, nameHash);
      }
      /**
       * Sometimes a resource group will be provided later (for example global uniforms)
       * In such cases, this method can be used to let the shader know about the group.
       * @param name - the name of the resource group
       * @param groupIndex - the index of the group (should match the webGPU shader group location)
       * @param bindIndex - the index of the bind point (should match the webGPU shader bind point)
       */
      addResource(name, groupIndex, bindIndex) {
        var _a, _b;
        (_a = this._uniformBindMap)[groupIndex] || (_a[groupIndex] = {});
        (_b = this._uniformBindMap[groupIndex])[bindIndex] || (_b[bindIndex] = name);
        if (!this.groups[groupIndex]) {
          this.groups[groupIndex] = new BindGroup();
          this._ownedBindGroups.push(this.groups[groupIndex]);
        }
      }
      _buildResourceAccessor(groups, nameHash) {
        const uniformsOut = {};
        for (const i2 in nameHash) {
          const data = nameHash[i2];
          Object.defineProperty(uniformsOut, data.name, {
            get() {
              return groups[data.group].getResource(data.binding);
            },
            set(value) {
              groups[data.group].setResource(value, data.binding);
            }
          });
        }
        return uniformsOut;
      }
      /**
       * Use to destroy the shader when its not longer needed.
       * It will destroy the resources and remove listeners.
       * @param destroyPrograms - if the programs should be destroyed as well.
       * Make sure its not being used by other shaders!
       */
      destroy(destroyPrograms = false) {
        if (this._destroyed) return;
        this._destroyed = true;
        this.emit("destroy", this);
        if (destroyPrograms) {
          this.gpuProgram?.destroy();
          this.glProgram?.destroy();
        }
        this.gpuProgram = null;
        this.glProgram = null;
        this.removeAllListeners();
        this._uniformBindMap = null;
        this._ownedBindGroups.forEach((bindGroup) => {
          bindGroup.destroy();
        });
        this._ownedBindGroups = null;
        this.resources = null;
        this.groups = null;
        this._overrides = null;
      }
      static from(options) {
        const { gpu, gl, ...rest } = options;
        let gpuProgram;
        let glProgram;
        if (gpu) {
          gpuProgram = GpuProgram.from(gpu);
        }
        if (gl) {
          glProgram = GlProgram.from(gl);
        }
        return new _Shader({
          gpuProgram,
          glProgram,
          ...rest
        });
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/state/State.mjs
var blendModeIds, STATE_BITS, BLEND, OFFSET, CULLING, DEPTH_TEST, WINDING, DEPTH_MASK, _State, State;
var init_State = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/state/State.mjs"() {
    "use strict";
    blendModeIds = {
      normal: 0,
      add: 1,
      multiply: 2,
      screen: 3,
      overlay: 4,
      erase: 5,
      "normal-npm": 6,
      "add-npm": 7,
      "screen-npm": 8,
      min: 9,
      max: 10
    };
    STATE_BITS = {
      BLEND: 0,
      OFFSET: 1,
      CULLING: 2,
      DEPTH_TEST: 3,
      WINDING: 4,
      DEPTH_MASK: 5
    };
    ({ BLEND, OFFSET, CULLING, DEPTH_TEST, WINDING, DEPTH_MASK } = STATE_BITS);
    _State = class _State2 {
      constructor() {
        this.data = 0;
        this.blendMode = "normal";
        this.polygonOffset = 0;
        this.blend = true;
        this.depthMask = true;
      }
      /**
       * Activates blending of the computed fragment color values.
       * @default true
       */
      get blend() {
        return !!(this.data & 1 << BLEND);
      }
      set blend(value) {
        if (!!(this.data & 1 << BLEND) !== value) {
          this.data ^= 1 << BLEND;
        }
      }
      /**
       * Activates adding an offset to depth values of polygon's fragments
       * @default false
       */
      get offsets() {
        return !!(this.data & 1 << OFFSET);
      }
      set offsets(value) {
        if (!!(this.data & 1 << OFFSET) !== value) {
          this.data ^= 1 << OFFSET;
        }
      }
      /** The culling settings for this state none - No culling back - Back face culling front - Front face culling */
      set cullMode(value) {
        if (value === "none") {
          this.culling = false;
          return;
        }
        this.culling = true;
        this.clockwiseFrontFace = value === "front";
      }
      get cullMode() {
        if (!this.culling) {
          return "none";
        }
        return this.clockwiseFrontFace ? "front" : "back";
      }
      /**
       * Activates culling of polygons.
       * @default false
       */
      get culling() {
        return !!(this.data & 1 << CULLING);
      }
      set culling(value) {
        if (!!(this.data & 1 << CULLING) !== value) {
          this.data ^= 1 << CULLING;
        }
      }
      /**
       * Activates depth comparisons and updates to the depth buffer.
       * @default false
       */
      get depthTest() {
        return !!(this.data & 1 << DEPTH_TEST);
      }
      set depthTest(value) {
        if (!!(this.data & 1 << DEPTH_TEST) !== value) {
          this.data ^= 1 << DEPTH_TEST;
        }
      }
      /**
       * Enables or disables writing to the depth buffer.
       * @default true
       */
      get depthMask() {
        return !!(this.data & 1 << DEPTH_MASK);
      }
      set depthMask(value) {
        if (!!(this.data & 1 << DEPTH_MASK) !== value) {
          this.data ^= 1 << DEPTH_MASK;
        }
      }
      /**
       * Specifies whether or not front or back-facing polygons can be culled.
       * @default false
       */
      get clockwiseFrontFace() {
        return !!(this.data & 1 << WINDING);
      }
      set clockwiseFrontFace(value) {
        if (!!(this.data & 1 << WINDING) !== value) {
          this.data ^= 1 << WINDING;
        }
      }
      /**
       * The blend mode to be applied when this state is set. Apply a value of `normal` to reset the blend mode.
       * Setting this mode to anything other than NO_BLEND will automatically switch blending on.
       * @default 'normal'
       */
      get blendMode() {
        return this._blendMode;
      }
      set blendMode(value) {
        this.blend = value !== "none";
        this._blendMode = value;
        this._blendModeId = blendModeIds[value] || 0;
      }
      /**
       * The polygon offset. Setting this property to anything other than 0 will automatically enable polygon offset fill.
       * @default 0
       */
      get polygonOffset() {
        return this._polygonOffset;
      }
      set polygonOffset(value) {
        this.offsets = !!value;
        this._polygonOffset = value;
      }
      toString() {
        return `[pixi.js/core:State blendMode=${this.blendMode} clockwiseFrontFace=${this.clockwiseFrontFace} culling=${this.culling} depthMask=${this.depthMask} polygonOffset=${this.polygonOffset}]`;
      }
      /**
       * A quickly getting an instance of a State that is configured for 2d rendering.
       * @returns a new State with values set for 2d rendering
       */
      static for2d() {
        const state = new _State2();
        state.depthTest = false;
        state.depthMask = false;
        state.blend = true;
        return state;
      }
    };
    _State.default2d = _State.for2d();
    State = _State;
  }
});

// client/node_modules/pixi.js/lib/filters/Filter.mjs
var _Filter, Filter;
var init_Filter = __esm({
  "client/node_modules/pixi.js/lib/filters/Filter.mjs"() {
    init_GlProgram();
    init_GpuProgram();
    init_Shader();
    init_State();
    _Filter = class _Filter2 extends Shader {
      /**
       * @param options - The optional parameters of this filter.
       */
      constructor(options) {
        options = { ..._Filter2.defaultOptions, ...options };
        super(options);
        this.enabled = true;
        this._state = State.for2d();
        this.blendMode = options.blendMode;
        this.padding = options.padding;
        if (typeof options.antialias === "boolean") {
          this.antialias = options.antialias ? "on" : "off";
        } else {
          this.antialias = options.antialias;
        }
        this.resolution = options.resolution;
        this.blendRequired = options.blendRequired;
        this.clipToViewport = options.clipToViewport;
        this.addResource("uTexture", 0, 1);
        if (options.blendRequired) {
          this.addResource("uBackTexture", 0, 3);
        }
      }
      /**
       * Applies the filter
       * @param filterManager - The renderer to retrieve the filter from
       * @param input - The input render target.
       * @param output - The target to output to.
       * @param clearMode - Should the output be cleared before rendering to it
       */
      apply(filterManager, input, output, clearMode) {
        filterManager.applyFilter(this, input, output, clearMode);
      }
      /**
       * Get the blend mode of the filter.
       * @default "normal"
       */
      get blendMode() {
        return this._state.blendMode;
      }
      /** Sets the blend mode of the filter. */
      set blendMode(value) {
        this._state.blendMode = value;
      }
      /**
       * A short hand function to create a filter based of a vertex and fragment shader src.
       * @param options
       * @returns A shiny new PixiJS filter!
       */
      static from(options) {
        const { gpu, gl, ...rest } = options;
        let gpuProgram;
        let glProgram;
        if (gpu) {
          gpuProgram = GpuProgram.from(gpu);
        }
        if (gl) {
          glProgram = GlProgram.from(gl);
        }
        return new _Filter2({
          gpuProgram,
          glProgram,
          ...rest
        });
      }
    };
    _Filter.defaultOptions = {
      blendMode: "normal",
      resolution: 1,
      padding: 0,
      antialias: "off",
      blendRequired: false,
      clipToViewport: true
    };
    Filter = _Filter;
  }
});

// client/node_modules/pixi.js/lib/filters/defaults/defaultFilter.vert.mjs
var vertex;
var init_defaultFilter_vert = __esm({
  "client/node_modules/pixi.js/lib/filters/defaults/defaultFilter.vert.mjs"() {
    vertex = "in vec2 aPosition;\nout vec2 vTextureCoord;\n\nuniform vec4 uInputSize;\nuniform vec4 uOutputFrame;\nuniform vec4 uOutputTexture;\n\nvec4 filterVertexPosition( void )\n{\n    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;\n    \n    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;\n    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;\n\n    return vec4(position, 0.0, 1.0);\n}\n\nvec2 filterTextureCoord( void )\n{\n    return aPosition * (uOutputFrame.zw * uInputSize.zw);\n}\n\nvoid main(void)\n{\n    gl_Position = filterVertexPosition();\n    vTextureCoord = filterTextureCoord();\n}\n";
  }
});

// client/node_modules/pixi.js/lib/filters/defaults/passthrough/passthrough.frag.mjs
var fragment;
var init_passthrough_frag = __esm({
  "client/node_modules/pixi.js/lib/filters/defaults/passthrough/passthrough.frag.mjs"() {
    fragment = "in vec2 vTextureCoord;\nout vec4 finalColor;\nuniform sampler2D uTexture;\nvoid main() {\n    finalColor = texture(uTexture, vTextureCoord);\n}\n";
  }
});

// client/node_modules/pixi.js/lib/filters/defaults/passthrough/passthrough.wgsl.mjs
var source;
var init_passthrough_wgsl = __esm({
  "client/node_modules/pixi.js/lib/filters/defaults/passthrough/passthrough.wgsl.mjs"() {
    source = "struct GlobalFilterUniforms {\n  uInputSize: vec4<f32>,\n  uInputPixel: vec4<f32>,\n  uInputClamp: vec4<f32>,\n  uOutputFrame: vec4<f32>,\n  uGlobalFrame: vec4<f32>,\n  uOutputTexture: vec4<f32>,\n};\n\n@group(0) @binding(0) var <uniform> gfu: GlobalFilterUniforms;\n@group(0) @binding(1) var uTexture: texture_2d<f32>;\n@group(0) @binding(2) var uSampler: sampler;\n\nstruct VSOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>\n};\n\nfn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32>\n{\n    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;\n\n    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;\n    position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;\n\n    return vec4(position, 0.0, 1.0);\n}\n\nfn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32>\n{\n    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);\n}\n\n@vertex\nfn mainVertex(\n  @location(0) aPosition: vec2<f32>,\n) -> VSOutput {\n  return VSOutput(\n   filterVertexPosition(aPosition),\n   filterTextureCoord(aPosition)\n  );\n}\n\n@fragment\nfn mainFragment(\n  @location(0) uv: vec2<f32>,\n) -> @location(0) vec4<f32> {\n    return textureSample(uTexture, uSampler, uv);\n}\n";
  }
});

// client/node_modules/pixi.js/lib/filters/defaults/passthrough/PassthroughFilter.mjs
var PassthroughFilter;
var init_PassthroughFilter = __esm({
  "client/node_modules/pixi.js/lib/filters/defaults/passthrough/PassthroughFilter.mjs"() {
    init_GlProgram();
    init_GpuProgram();
    init_Filter();
    init_defaultFilter_vert();
    init_passthrough_frag();
    init_passthrough_wgsl();
    PassthroughFilter = class extends Filter {
      constructor() {
        const gpuProgram = GpuProgram.from({
          vertex: { source, entryPoint: "mainVertex" },
          fragment: { source, entryPoint: "mainFragment" },
          name: "passthrough-filter"
        });
        const glProgram = GlProgram.from({
          vertex,
          fragment,
          name: "passthrough-filter"
        });
        super({
          gpuProgram,
          glProgram
        });
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/buffer/const.mjs
var BufferUsage;
var init_const4 = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/buffer/const.mjs"() {
    "use strict";
    BufferUsage = /* @__PURE__ */ ((BufferUsage2) => {
      BufferUsage2[BufferUsage2["MAP_READ"] = 1] = "MAP_READ";
      BufferUsage2[BufferUsage2["MAP_WRITE"] = 2] = "MAP_WRITE";
      BufferUsage2[BufferUsage2["COPY_SRC"] = 4] = "COPY_SRC";
      BufferUsage2[BufferUsage2["COPY_DST"] = 8] = "COPY_DST";
      BufferUsage2[BufferUsage2["INDEX"] = 16] = "INDEX";
      BufferUsage2[BufferUsage2["VERTEX"] = 32] = "VERTEX";
      BufferUsage2[BufferUsage2["UNIFORM"] = 64] = "UNIFORM";
      BufferUsage2[BufferUsage2["STORAGE"] = 128] = "STORAGE";
      BufferUsage2[BufferUsage2["INDIRECT"] = 256] = "INDIRECT";
      BufferUsage2[BufferUsage2["QUERY_RESOLVE"] = 512] = "QUERY_RESOLVE";
      BufferUsage2[BufferUsage2["STATIC"] = 1024] = "STATIC";
      return BufferUsage2;
    })(BufferUsage || {});
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/buffer/Buffer.mjs
var Buffer2;
var init_Buffer = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/buffer/Buffer.mjs"() {
    init_eventemitter3();
    init_uid();
    init_const4();
    Buffer2 = class extends eventemitter3_default {
      /**
       * Creates a new Buffer with the given options
       * @param options - the options for the buffer
       */
      constructor(options) {
        let { data, size } = options;
        const { usage, label, shrinkToFit } = options;
        super();
        this._gpuData = /* @__PURE__ */ Object.create(null);
        this._gcLastUsed = -1;
        this.autoGarbageCollect = true;
        this.uid = uid("buffer");
        this._resourceType = "buffer";
        this._resourceId = uid("resource");
        this._updateID = 1;
        this._updateOffset = 0;
        this._dataInt32 = null;
        this.shrinkToFit = true;
        this.destroyed = false;
        if (data instanceof Array) {
          data = new Float32Array(data);
        }
        this._data = data;
        size ?? (size = data?.byteLength);
        const mappedAtCreation = !!data;
        this.descriptor = {
          size,
          usage,
          mappedAtCreation,
          label
        };
        this.shrinkToFit = shrinkToFit ?? true;
      }
      /** the data in the buffer */
      get data() {
        return this._data;
      }
      set data(value) {
        this.setDataWithSize(value, value.length, true);
      }
      get dataInt32() {
        if (!this._dataInt32) {
          this._dataInt32 = new Int32Array(this.data.buffer);
        }
        return this._dataInt32;
      }
      /** whether the buffer is static or not */
      get static() {
        return !!(this.descriptor.usage & BufferUsage.STATIC);
      }
      set static(value) {
        if (value) {
          this.descriptor.usage |= BufferUsage.STATIC;
        } else {
          this.descriptor.usage &= ~BufferUsage.STATIC;
        }
      }
      /**
       * Sets the data in the buffer to the given value. This will immediately update the buffer on the GPU.
       * If you only want to update a subset of the buffer, you can pass in the size of the data.
       * @param value - the data to set
       * @param size - the size of the data in bytes
       * @param syncGPU - should the buffer be updated on the GPU immediately?
       */
      setDataWithSize(value, size, syncGPU) {
        this._updateID++;
        this._updateSize = size * value.BYTES_PER_ELEMENT;
        this._updateOffset = 0;
        if (this._data === value) {
          if (syncGPU) this.emit("update", this);
          return;
        }
        const oldData = this._data;
        this._data = value;
        this._dataInt32 = null;
        if (!oldData || oldData.length !== value.length) {
          if (!this.shrinkToFit && oldData && value.byteLength < oldData.byteLength) {
            if (syncGPU) this.emit("update", this);
          } else {
            this.descriptor.size = value.byteLength;
            this._resourceId = uid("resource");
            this.emit("change", this);
          }
          return;
        }
        if (syncGPU) this.emit("update", this);
      }
      /**
       * updates the buffer on the GPU to reflect the data in the buffer.
       * By default it will update the entire buffer. If you only want to update a subset of the buffer,
       * you can pass in the size of the buffer to update.
       * @param sizeInBytes - the new size of the buffer in bytes
       * @param offsetInBytes - the offset to start updating from
       */
      update(sizeInBytes, offsetInBytes) {
        this._updateSize = sizeInBytes ?? this._updateSize;
        this._updateOffset = offsetInBytes || 0;
        this._updateID++;
        this.emit("update", this);
      }
      /** Unloads the buffer from the GPU */
      unload() {
        this.emit("unload", this);
        for (const key in this._gpuData) {
          this._gpuData[key]?.destroy();
        }
        this._gpuData = /* @__PURE__ */ Object.create(null);
        if (!this.destroyed) {
          this._resourceId = uid("resource");
          this.emit("change", this);
        }
      }
      /** Destroys the buffer */
      destroy() {
        this.destroyed = true;
        this.unload();
        this.emit("destroy", this);
        this.emit("change", this);
        this._data = null;
        this.descriptor = null;
        this.removeAllListeners();
      }
    };
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/geometry/utils/ensureIsBuffer.mjs
function ensureIsBuffer(buffer, index) {
  if (!(buffer instanceof Buffer2)) {
    let usage = index ? BufferUsage.INDEX : BufferUsage.VERTEX;
    if (buffer instanceof Array) {
      if (index) {
        buffer = new Uint32Array(buffer);
        usage = BufferUsage.INDEX | BufferUsage.COPY_DST;
      } else {
        buffer = new Float32Array(buffer);
        usage = BufferUsage.VERTEX | BufferUsage.COPY_DST;
      }
    }
    buffer = new Buffer2({
      data: buffer,
      label: index ? "index-mesh-buffer" : "vertex-mesh-buffer",
      usage
    });
  }
  return buffer;
}
var init_ensureIsBuffer = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/geometry/utils/ensureIsBuffer.mjs"() {
    init_Buffer();
    init_const4();
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/geometry/utils/getGeometryBounds.mjs
function getGeometryBounds(geometry, attributeId, bounds) {
  const attribute = geometry.getAttribute(attributeId);
  if (!attribute) {
    bounds.minX = 0;
    bounds.minY = 0;
    bounds.maxX = 0;
    bounds.maxY = 0;
    return bounds;
  }
  const data = attribute.buffer.data;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const byteSize = data.BYTES_PER_ELEMENT;
  const offset = (attribute.offset || 0) / byteSize;
  const stride = (attribute.stride || 2 * 4) / byteSize;
  for (let i2 = offset; i2 < data.length; i2 += stride) {
    const x2 = data[i2];
    const y2 = data[i2 + 1];
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
    if (x2 < minX) minX = x2;
    if (y2 < minY) minY = y2;
  }
  bounds.minX = minX;
  bounds.minY = minY;
  bounds.maxX = maxX;
  bounds.maxY = maxY;
  return bounds;
}
var init_getGeometryBounds = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/geometry/utils/getGeometryBounds.mjs"() {
    "use strict";
  }
});

// client/node_modules/pixi.js/lib/rendering/renderers/shared/geometry/Geometry.mjs
function ensureIsAttribute(attribute) {
  if (attribute instanceof Buffer2 || Array.isArray(attribute) || attribute.BYTES_PER_ELEMENT) {
    attribute = {
      buffer: attribute
    };
  }
  attribute.buffer = ensureIsBuffer(attribute.buffer, false);
  return attribute;
}
var Geometry;
var init_Geometry = __esm({
  "client/node_modules/pixi.js/lib/rendering/renderers/shared/geometry/Geometry.mjs"() {
    init_eventemitter3();
    init_Bounds();
    init_uid();
    init_deprecation();
    init_Buffer();
    init_ensureIsBuffer();
    init_getGeometryBounds();
    Geometry = class extends eventemitter3_default {
      /**
       * Create a new instance of a geometry
       * @param options - The options for the geometry.
       */
      constructor(options = {}) {
        super();
        this._gpuData = /* @__PURE__ */ Object.create(null);
        this.autoGarbageCollect = true;
        this._gcLastUsed = -1;
        this.uid = uid("geometry");
        this._layoutKey = 0;
        this.instanceCount = 1;
        this.indexCount = 0;
        this._bounds = new Bounds();
        this._boundsDirty = true;
        this._vertexCount = 0;
        this._vertexCountDirty = true;
        const { attributes, indexBuffer, topology } = options;
        this.buffers = [];
        this.attributes = {};
        if (attributes) {
          for (const i2 in attributes) {
            this.addAttribute(i2, attributes[i2]);
          }
        }
        this.instanceCount = options.instanceCount ?? 1;
        this.indexCount = options.indexCount ?? 0;
        if (indexBuffer) {
          this.addIndex(indexBuffer);
        }
        this.topology = topology || "triangle-list";
      }
      onBufferUpdate() {
        this._boundsDirty = true;
        this._vertexCountDirty = true;
        this.emit("update", this);
      }
      /**
       * Returns the requested attribute.
       * @param id - The name of the attribute required
       * @returns - The attribute requested.
       */
      getAttribute(id) {
        return this.attributes[id];
      }
      /**
       * Returns the index buffer
       * @returns - The index buffer.
       */
      getIndex() {
        return this.indexBuffer;
      }
      /**
       * Returns the requested buffer.
       * @param id - The name of the buffer required.
       * @returns - The buffer requested.
       */
      getBuffer(id) {
        return this.getAttribute(id).buffer;
      }
      /**
       * The number of vertices in this geometry, derived from the first non-instanced attribute.
       * The value is cached and only recalculated when the geometry's buffers or attributes change.
       */
      get vertexCount() {
        if (!this._vertexCountDirty) return this._vertexCount;
        this._vertexCountDirty = false;
        const attributes = this.attributes;
        for (const i2 in attributes) {
          const attribute = attributes[i2];
          if (attribute.instance) continue;
          const buffer = attribute.buffer;
          this._vertexCount = buffer.data.length / (attribute.stride / 4 || attribute.size);
          return this._vertexCount;
        }
        this._vertexCount = 0;
        return 0;
      }
      /**
       * Used to figure out how many vertices there are in this geometry
       * @returns the number of vertices in the geometry
       * @deprecated since 8.20.0, use {@link Geometry.vertexCount} instead
       */
      getSize() {
        deprecation("8.20.0", "Geometry.getSize is deprecated, please use Geometry.vertexCount instead.");
        return this.vertexCount;
      }
      /**
       * Adds an attribute to the geometry.
       * @param name - The name of the attribute to add.
       * @param attributeOption - The attribute option to add.
       */
      addAttribute(name, attributeOption) {
        const attribute = ensureIsAttribute(attributeOption);
        const bufferIndex = this.buffers.indexOf(attribute.buffer);
        if (bufferIndex === -1) {
          this.buffers.push(attribute.buffer);
          attribute.buffer.on("update", this.onBufferUpdate, this);
          attribute.buffer.on("change", this.onBufferUpdate, this);
        }
        this.attributes[name] = attribute;
        this._vertexCountDirty = true;
      }
      /**
       * Adds an index buffer to the geometry.
       * @param indexBuffer - The index buffer to add. Can be a Buffer, TypedArray, or an array of numbers.
       */
      addIndex(indexBuffer) {
        this.indexBuffer = ensureIsBuffer(indexBuffer, true);
        this.buffers.push(this.indexBuffer);
      }
      /** Returns the bounds of the geometry. */
      get bounds() {
        if (!this._boundsDirty) return this._bounds;
        this._boundsDirty = false;
        return getGeometryBounds(this, "aPosition", this._bounds);
      }
      /** Unloads the geometry from the GPU. */
      unload() {
        this.emit("unload", this);
        for (const key in this._gpuData) {
          this._gpuData[key]?.destroy();
        }
        this._gpuData = /* @__PURE__ */ Object.create(null);
      }
      /**
       * destroys the geometry.
       * @param destroyBuffers - destroy the buffers associated with this geometry
       */
      destroy(destroyBuffers = false) {
        this.emit("destroy", this);
        for (const buffer of this.buffers) {
          buffer.off("update", this.onBufferUpdate, this);
          buffer.off("change", this.onBufferUpdate, this);
          if (destroyBuffers) buffer.destroy();
        }
        this.unload();
        this.removeAllListeners();
        this.attributes = null;
        this.buffers = null;
        this.indexBuffer = null;
        this._bounds = null;
      }
    };
  }
});

// client/node_modules/pixi.js/lib/filters/FilterSystem.mjs
var quadGeometry, FilterData, FilterSystem;
var init_FilterSystem = __esm({
  "client/node_modules/pixi.js/lib/filters/FilterSystem.mjs"() {
    init_Extensions();
    init_PassthroughFilter();
    init_Matrix();
    init_BindGroup();
    init_Geometry();
    init_UniformGroup();
    init_Texture();
    init_TexturePool();
    init_types();
    init_Bounds();
    init_getRenderableBounds();
    init_warn();
    quadGeometry = new Geometry({
      attributes: {
        aPosition: {
          buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
          format: "float32x2",
          stride: 2 * 4,
          offset: 0
        }
      },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3])
    });
    FilterData = class {
      constructor() {
        this.skip = false;
        this.inputTexture = null;
        this.backTexture = null;
        this.filters = null;
        this.bounds = new Bounds();
        this.container = null;
        this.blendRequired = false;
        this.outputRenderSurface = null;
        this.globalFrame = { x: 0, y: 0, width: 0, height: 0 };
        this.firstEnabledIndex = -1;
        this.lastEnabledIndex = -1;
      }
    };
    FilterSystem = class {
      constructor(renderer) {
        this._filterStackIndex = 0;
        this._filterStack = [];
        this._filterGlobalUniforms = new UniformGroup({
          uInputSize: { value: new Float32Array(4), type: "vec4<f32>" },
          uInputPixel: { value: new Float32Array(4), type: "vec4<f32>" },
          uInputClamp: { value: new Float32Array(4), type: "vec4<f32>" },
          uOutputFrame: { value: new Float32Array(4), type: "vec4<f32>" },
          uGlobalFrame: { value: new Float32Array(4), type: "vec4<f32>" },
          uOutputTexture: { value: new Float32Array(4), type: "vec4<f32>" }
        });
        this._globalFilterBindGroup = new BindGroup({});
        this.renderer = renderer;
      }
      /**
       * The back texture of the currently active filter. Requires the filter to have `blendRequired` set to true.
       * @readonly
       */
      get activeBackTexture() {
        return this._activeFilterData?.backTexture;
      }
      /**
       * Pushes a filter instruction onto the filter stack.
       * @param instruction - The instruction containing the filter effect and container.
       * @internal
       */
      push(instruction) {
        const renderer = this.renderer;
        const filters = instruction.filterEffect.filters;
        const filterData = this._pushFilterData();
        filterData.skip = false;
        filterData.filters = filters;
        filterData.container = instruction.container;
        filterData.outputRenderSurface = renderer.renderTarget.renderSurface;
        const colorTextureSource = renderer.renderTarget.renderTarget.colorTexture.source;
        const rootResolution = colorTextureSource.resolution;
        const rootAntialias = colorTextureSource.antialias;
        if (filters.every((filter) => !filter.enabled)) {
          filterData.skip = true;
          return;
        }
        const bounds = filterData.bounds;
        this._calculateFilterArea(instruction, bounds);
        this._calculateFilterBounds(filterData, renderer.renderTarget.rootViewPort, rootAntialias, rootResolution, 1);
        if (filterData.skip) {
          return;
        }
        const previousFilterData = this._getPreviousFilterData();
        const globalResolution = this._findFilterResolution(rootResolution);
        let offsetX = 0;
        let offsetY = 0;
        if (previousFilterData) {
          offsetX = previousFilterData.bounds.minX;
          offsetY = previousFilterData.bounds.minY;
        }
        this._calculateGlobalFrame(
          filterData,
          offsetX,
          offsetY,
          globalResolution,
          colorTextureSource.width,
          colorTextureSource.height
        );
        this._setupFilterTextures(filterData, bounds, renderer, previousFilterData);
      }
      /**
       * Applies filters to a texture.
       *
       * This method takes a texture and a list of filters, applies the filters to the texture,
       * and returns the resulting texture.
       * @param {object} params - The parameters for applying filters.
       * @param {Texture} params.texture - The texture to apply filters to.
       * @param {Filter[]} params.filters - The filters to apply.
       * @returns {Texture} The resulting texture after all filters have been applied.
       * @example
       *
       * ```ts
       * // Create a texture and a list of filters
       * const texture = new Texture(...);
       * const filters = [new BlurFilter(), new ColorMatrixFilter()];
       *
       * // Apply the filters to the texture
       * const resultTexture = filterSystem.applyToTexture({ texture, filters });
       *
       * // Use the resulting texture
       * sprite.texture = resultTexture;
       * ```
       *
       * Key Points:
       * 1. padding is not currently supported here - so clipping may occur with filters that use padding.
       * 2. If all filters are disabled or skipped, the original texture is returned.
       */
      generateFilteredTexture({ texture, filters }) {
        const filterData = this._pushFilterData();
        this._activeFilterData = filterData;
        filterData.skip = false;
        filterData.filters = filters;
        const colorTextureSource = texture.source;
        const rootResolution = colorTextureSource.resolution;
        const rootAntialias = colorTextureSource.antialias;
        if (filters.every((filter) => !filter.enabled)) {
          filterData.skip = true;
          return texture;
        }
        const bounds = filterData.bounds;
        bounds.addRect(texture.frame);
        this._calculateFilterBounds(filterData, bounds.rectangle, rootAntialias, rootResolution, 0);
        if (filterData.skip) {
          return texture;
        }
        const globalResolution = rootResolution;
        const offsetX = 0;
        const offsetY = 0;
        this._calculateGlobalFrame(
          filterData,
          offsetX,
          offsetY,
          globalResolution,
          colorTextureSource.width,
          colorTextureSource.height
        );
        filterData.outputRenderSurface = TexturePool.getOptimalTexture({
          width: bounds.width,
          height: bounds.height,
          resolution: filterData.resolution,
          antialias: filterData.antialias
        });
        filterData.backTexture = Texture.EMPTY;
        filterData.inputTexture = texture;
        const renderer = this.renderer;
        renderer.renderTarget.finishRenderPass();
        this._applyFiltersToTexture(filterData, true);
        const outputTexture = filterData.outputRenderSurface;
        outputTexture.source.alphaMode = "premultiplied-alpha";
        return outputTexture;
      }
      /** @internal */
      pop() {
        const renderer = this.renderer;
        const filterData = this._popFilterData();
        if (filterData.skip) {
          return;
        }
        renderer.globalUniforms.pop();
        renderer.renderTarget.finishRenderPass();
        this._activeFilterData = filterData;
        this._applyFiltersToTexture(filterData, false);
        if (filterData.blendRequired) {
          TexturePool.returnTexture(filterData.backTexture);
        }
        TexturePool.returnTexture(filterData.inputTexture);
      }
      /**
       * Copies the last render surface to a texture.
       * @param lastRenderSurface - The last render surface to copy from.
       * @param bounds - The bounds of the area to copy.
       * @param previousBounds - The previous bounds to use for offsetting the copy.
       */
      getBackTexture(lastRenderSurface, bounds, previousBounds) {
        const backgroundResolution = lastRenderSurface.colorTexture.source._resolution;
        const backTexture = TexturePool.getOptimalTexture({
          width: bounds.width,
          height: bounds.height,
          resolution: backgroundResolution
        });
        let x2 = bounds.minX;
        let y2 = bounds.minY;
        if (previousBounds) {
          x2 -= previousBounds.minX;
          y2 -= previousBounds.minY;
        }
        x2 = Math.floor(x2 * backgroundResolution);
        y2 = Math.floor(y2 * backgroundResolution);
        const width = Math.ceil(bounds.width * backgroundResolution);
        const height = Math.ceil(bounds.height * backgroundResolution);
        this.renderer.renderTarget.copyToTexture(
          lastRenderSurface,
          backTexture,
          { x: x2, y: y2 },
          { width, height },
          { x: 0, y: 0 }
        );
        return backTexture;
      }
      /**
       * Applies a filter to a texture.
       * @param filter - The filter to apply.
       * @param input - The input texture.
       * @param output - The output render surface.
       * @param clear - Whether to clear the output surface before applying the filter.
       */
      applyFilter(filter, input, output, clear) {
        const renderer = this.renderer;
        const filterData = this._activeFilterData;
        const outputRenderSurface = filterData.outputRenderSurface;
        const isFinalTarget = outputRenderSurface === output;
        const rootResolution = renderer.renderTarget.rootRenderTarget.colorTexture.source._resolution;
        const resolution = this._findFilterResolution(rootResolution);
        let offsetX = 0;
        let offsetY = 0;
        if (isFinalTarget) {
          const offset = this._findPreviousFilterOffset();
          offsetX = offset.x;
          offsetY = offset.y;
        }
        this._updateFilterUniforms(input, output, filterData, offsetX, offsetY, resolution, isFinalTarget, clear);
        const filterToApply = filter.enabled ? filter : this._getPassthroughFilter();
        this._setupBindGroupsAndRender(filterToApply, input, renderer);
      }
      /**
       * Multiply _input normalized coordinates_ to this matrix to get _sprite texture normalized coordinates_.
       *
       * Use `outputMatrix * vTextureCoord` in the shader.
       * @param outputMatrix - The matrix to output to.
       * @param {Sprite} sprite - The sprite to map to.
       * @returns The mapped matrix.
       */
      calculateSpriteMatrix(outputMatrix, sprite) {
        const data = this._activeFilterData;
        const mappedMatrix = outputMatrix.set(
          data.inputTexture._source.width,
          0,
          0,
          data.inputTexture._source.height,
          data.bounds.minX,
          data.bounds.minY
        );
        const worldTransform = sprite.worldTransform.copyTo(Matrix.shared);
        const renderGroup = sprite.renderGroup || sprite.parentRenderGroup;
        if (renderGroup && renderGroup.cacheToLocalTransform) {
          worldTransform.prepend(renderGroup.cacheToLocalTransform);
        }
        worldTransform.invert();
        mappedMatrix.prepend(worldTransform);
        mappedMatrix.scale(
          1 / sprite.texture.orig.width,
          1 / sprite.texture.orig.height
        );
        mappedMatrix.translate(sprite.anchor.x, sprite.anchor.y);
        return mappedMatrix;
      }
      destroy() {
        this._passthroughFilter?.destroy(true);
        this._passthroughFilter = null;
      }
      _getPassthroughFilter() {
        this._passthroughFilter ?? (this._passthroughFilter = new PassthroughFilter());
        return this._passthroughFilter;
      }
      /**
       * Sets up the bind groups and renders the filter.
       * @param filter - The filter to apply
       * @param input - The input texture
       * @param renderer - The renderer instance
       */
      _setupBindGroupsAndRender(filter, input, renderer) {
        if (renderer.renderPipes.uniformBatch) {
          const batchUniforms = renderer.renderPipes.uniformBatch.getUboResource(this._filterGlobalUniforms);
          this._globalFilterBindGroup.setResource(batchUniforms, 0);
        } else {
          this._globalFilterBindGroup.setResource(this._filterGlobalUniforms, 0);
        }
        this._globalFilterBindGroup.setResource(input.source, 1);
        this._globalFilterBindGroup.setResource(input.source.style, 2);
        filter.groups[0] = this._globalFilterBindGroup;
        renderer.encoder.draw({
          geometry: quadGeometry,
          shader: filter,
          state: filter._state,
          topology: "triangle-list"
        });
        if (renderer.type === RendererType.WEBGL) {
          renderer.renderTarget.finishRenderPass();
        }
      }
      /**
       * Sets up the filter textures including input texture and back texture if needed.
       * @param filterData - The filter data to update
       * @param bounds - The bounds for the texture
       * @param renderer - The renderer instance
       * @param previousFilterData - The previous filter data for back texture calculation
       */
      _setupFilterTextures(filterData, bounds, renderer, previousFilterData) {
        filterData.backTexture = Texture.EMPTY;
        filterData.inputTexture = TexturePool.getOptimalTexture({
          width: bounds.width,
          height: bounds.height,
          resolution: filterData.resolution,
          antialias: filterData.antialias
        });
        if (filterData.blendRequired) {
          renderer.renderTarget.finishRenderPass();
          const renderTarget = renderer.renderTarget.getRenderTarget(filterData.outputRenderSurface);
          filterData.backTexture = this.getBackTexture(renderTarget, bounds, previousFilterData?.bounds);
        }
        renderer.renderTarget.bind({ target: filterData.inputTexture, clear: true });
        renderer.globalUniforms.push({
          offset: bounds
        });
      }
      /**
       * Calculates and sets the global frame for the filter.
       * @param filterData - The filter data to update
       * @param offsetX - The X offset
       * @param offsetY - The Y offset
       * @param globalResolution - The global resolution
       * @param sourceWidth - The source texture width
       * @param sourceHeight - The source texture height
       */
      _calculateGlobalFrame(filterData, offsetX, offsetY, globalResolution, sourceWidth, sourceHeight) {
        const globalFrame = filterData.globalFrame;
        globalFrame.x = offsetX * globalResolution;
        globalFrame.y = offsetY * globalResolution;
        globalFrame.width = sourceWidth * globalResolution;
        globalFrame.height = sourceHeight * globalResolution;
      }
      /**
       * Updates the filter uniforms with the current filter state.
       * @param input - The input texture
       * @param output - The output render surface
       * @param filterData - The current filter data
       * @param offsetX - The X offset for positioning
       * @param offsetY - The Y offset for positioning
       * @param resolution - The current resolution
       * @param isFinalTarget - Whether this is the final render target
       * @param clear - Whether to clear the output surface
       */
      _updateFilterUniforms(input, output, filterData, offsetX, offsetY, resolution, isFinalTarget, clear) {
        const uniforms = this._filterGlobalUniforms.uniforms;
        const outputFrame = uniforms.uOutputFrame;
        const inputSize = uniforms.uInputSize;
        const inputPixel = uniforms.uInputPixel;
        const inputClamp = uniforms.uInputClamp;
        const globalFrame = uniforms.uGlobalFrame;
        const outputTexture = uniforms.uOutputTexture;
        if (isFinalTarget) {
          outputFrame[0] = filterData.bounds.minX - offsetX;
          outputFrame[1] = filterData.bounds.minY - offsetY;
        } else {
          outputFrame[0] = 0;
          outputFrame[1] = 0;
        }
        outputFrame[2] = input.frame.width;
        outputFrame[3] = input.frame.height;
        inputSize[0] = input.source.width;
        inputSize[1] = input.source.height;
        inputSize[2] = 1 / inputSize[0];
        inputSize[3] = 1 / inputSize[1];
        inputPixel[0] = input.source.pixelWidth;
        inputPixel[1] = input.source.pixelHeight;
        inputPixel[2] = 1 / inputPixel[0];
        inputPixel[3] = 1 / inputPixel[1];
        inputClamp[0] = 0.5 * inputPixel[2];
        inputClamp[1] = 0.5 * inputPixel[3];
        inputClamp[2] = input.frame.width * inputSize[2] - 0.5 * inputPixel[2];
        inputClamp[3] = input.frame.height * inputSize[3] - 0.5 * inputPixel[3];
        const rootTexture = this.renderer.renderTarget.rootRenderTarget.colorTexture;
        globalFrame[0] = offsetX * resolution;
        globalFrame[1] = offsetY * resolution;
        globalFrame[2] = rootTexture.source.width * resolution;
        globalFrame[3] = rootTexture.source.height * resolution;
        if (output instanceof Texture) output.source.resource = null;
        const renderTarget = this.renderer.renderTarget.getRenderTarget(output);
        this.renderer.renderTarget.bind({ target: output, clear: !!clear });
        if (output instanceof Texture) {
          outputTexture[0] = output.frame.width;
          outputTexture[1] = output.frame.height;
        } else {
          outputTexture[0] = renderTarget.width;
          outputTexture[1] = renderTarget.height;
        }
        outputTexture[2] = renderTarget.isRoot ? -1 : 1;
        this._filterGlobalUniforms.update();
      }
      /**
       * Finds the correct resolution by looking back through the filter stack.
       * @param rootResolution - The fallback root resolution to use
       * @returns The resolution from the previous filter or root resolution
       */
      _findFilterResolution(rootResolution) {
        let currentIndex = this._filterStackIndex - 1;
        while (currentIndex > 0 && this._filterStack[currentIndex].skip) {
          --currentIndex;
        }
        return currentIndex > 0 && this._filterStack[currentIndex].inputTexture ? this._filterStack[currentIndex].inputTexture.source._resolution : rootResolution;
      }
      /**
       * Finds the offset from the previous non-skipped filter in the stack.
       * @returns The offset coordinates from the previous filter
       */
      _findPreviousFilterOffset() {
        let offsetX = 0;
        let offsetY = 0;
        let lastIndex = this._filterStackIndex;
        while (lastIndex > 0) {
          lastIndex--;
          const prevFilterData = this._filterStack[lastIndex];
          if (!prevFilterData.skip) {
            offsetX = prevFilterData.bounds.minX;
            offsetY = prevFilterData.bounds.minY;
            break;
          }
        }
        return { x: offsetX, y: offsetY };
      }
      /**
       * Calculates the filter area bounds based on the instruction type.
       * @param instruction - The filter instruction
       * @param bounds - The bounds object to populate
       */
      _calculateFilterArea(instruction, bounds) {
        if (instruction.renderables) {
          getGlobalRenderableBounds(instruction.renderables, bounds);
        } else if (instruction.filterEffect.filterArea) {
          bounds.clear();
          bounds.addRect(instruction.filterEffect.filterArea);
          bounds.applyMatrix(instruction.container.worldTransform);
        } else {
          instruction.container.getFastGlobalBounds(true, bounds);
        }
        if (instruction.container) {
          const renderGroup = instruction.container.renderGroup || instruction.container.parentRenderGroup;
          const filterFrameTransform = renderGroup.cacheToLocalTransform;
          if (filterFrameTransform) {
            bounds.applyMatrix(filterFrameTransform);
          }
        }
      }
      _applyFiltersToTexture(filterData, clear) {
        const inputTexture = filterData.inputTexture;
        const bounds = filterData.bounds;
        const filters = filterData.filters;
        const firstEnabled = filterData.firstEnabledIndex;
        const lastEnabled = filterData.lastEnabledIndex;
        this._globalFilterBindGroup.setResource(inputTexture.source.style, 2);
        this._globalFilterBindGroup.setResource(filterData.backTexture.source, 3);
        if (firstEnabled === lastEnabled) {
          filters[firstEnabled].apply(this, inputTexture, filterData.outputRenderSurface, clear);
        } else {
          let flip = filterData.inputTexture;
          const tempTexture = TexturePool.getOptimalTexture({
            width: bounds.width,
            height: bounds.height,
            resolution: flip.source._resolution
          });
          let flop = tempTexture;
          for (let i2 = firstEnabled; i2 < lastEnabled; i2++) {
            const filter = filters[i2];
            if (!filter.enabled) continue;
            filter.apply(this, flip, flop, true);
            const t2 = flip;
            flip = flop;
            flop = t2;
          }
          filters[lastEnabled].apply(this, flip, filterData.outputRenderSurface, clear);
          TexturePool.returnTexture(tempTexture);
        }
      }
      _calculateFilterBounds(filterData, viewPort, rootAntialias, rootResolution, paddingMultiplier) {
        const renderer = this.renderer;
        const bounds = filterData.bounds;
        const filters = filterData.filters;
        let resolution = Infinity;
        let padding = 0;
        let antialias = true;
        let blendRequired = false;
        let enabled = false;
        let clipToViewport = true;
        let firstEnabledIndex = -1;
        let lastEnabledIndex = -1;
        for (let i2 = 0; i2 < filters.length; i2++) {
          const filter = filters[i2];
          if (!filter.enabled) continue;
          if (firstEnabledIndex === -1) firstEnabledIndex = i2;
          lastEnabledIndex = i2;
          resolution = Math.min(resolution, filter.resolution === "inherit" ? rootResolution : filter.resolution);
          padding += filter.padding;
          if (filter.antialias === "off") {
            antialias = false;
          } else if (filter.antialias === "inherit") {
            antialias && (antialias = rootAntialias);
          }
          if (!filter.clipToViewport) {
            clipToViewport = false;
          }
          const isCompatible = !!(filter.compatibleRenderers & renderer.type);
          if (!isCompatible) {
            enabled = false;
            break;
          }
          if (filter.blendRequired && !(renderer.backBuffer?.useBackBuffer ?? true)) {
            warn("Blend filter requires backBuffer on WebGL renderer to be enabled. Set `useBackBuffer: true` in the renderer options.");
            enabled = false;
            break;
          }
          enabled = true;
          blendRequired || (blendRequired = filter.blendRequired);
        }
        if (!enabled) {
          filterData.skip = true;
          return;
        }
        if (clipToViewport) {
          bounds.fitBounds(0, viewPort.width / rootResolution, 0, viewPort.height / rootResolution);
        }
        bounds.scale(resolution).ceil().scale(1 / resolution).pad((padding | 0) * paddingMultiplier);
        if (!bounds.isPositive) {
          filterData.skip = true;
          return;
        }
        filterData.antialias = antialias;
        filterData.resolution = resolution;
        filterData.blendRequired = blendRequired;
        filterData.firstEnabledIndex = firstEnabledIndex;
        filterData.lastEnabledIndex = lastEnabledIndex;
      }
      _popFilterData() {
        this._filterStackIndex--;
        return this._filterStack[this._filterStackIndex];
      }
      _getPreviousFilterData() {
        let previousFilterData;
        let index = this._filterStackIndex - 1;
        while (index > 0) {
          index--;
          previousFilterData = this._filterStack[index];
          if (!previousFilterData.skip) {
            break;
          }
        }
        return previousFilterData;
      }
      _pushFilterData() {
        let filterData = this._filterStack[this._filterStackIndex];
        if (!filterData) {
          filterData = this._filterStack[this._filterStackIndex] = new FilterData();
        }
        this._filterStackIndex++;
        return filterData;
      }
    };
    FilterSystem.extension = {
      type: [
        ExtensionType.WebGLSystem,
        ExtensionType.WebGPUSystem
      ],
      name: "filter"
    };
  }
});

// client/node_modules/pixi.js/lib/filters/init.mjs
var init_init6 = __esm({
  "client/node_modules/pixi.js/lib/filters/init.mjs"() {
    init_Extensions();
    init_CanvasFilterSystem();
    init_FilterPipe();
    init_FilterSystem();
    extensions.add(FilterSystem, CanvasFilterSystem);
    extensions.add(FilterPipe);
  }
});

// client/node_modules/pixi.js/lib/environment-browser/browserAll.mjs
var browserAll_exports = {};
var init_browserAll = __esm({
  "client/node_modules/pixi.js/lib/environment-browser/browserAll.mjs"() {
    init_init();
    init_init2();
    init_init3();
    init_init4();
    init_init5();
    init_init6();
  }
});

// client/node_modules/pixi.js/lib/environment-webworker/webworkerAll.mjs
var webworkerAll_exports = {};
var init_webworkerAll = __esm({
  "client/node_modules/pixi.js/lib/environment-webworker/webworkerAll.mjs"() {
    init_init4();
    init_init5();
    init_init6();
  }
});

// client/node_modules/pixi.js/lib/environment-browser/browserExt.mjs
init_Extensions();
var browserExt = {
  extension: {
    type: ExtensionType.Environment,
    name: "browser",
    priority: -1
  },
  test: () => true,
  load: async () => {
    await Promise.resolve().then(() => (init_browserAll(), browserAll_exports));
  }
};

// client/node_modules/pixi.js/lib/environment-webworker/webworkerExt.mjs
init_Extensions();
var webworkerExt = {
  extension: {
    type: ExtensionType.Environment,
    name: "webworker",
    priority: 0
  },
  test: () => typeof self !== "undefined" && self.WorkerGlobalScope !== void 0,
  load: async () => {
    await Promise.resolve().then(() => (init_webworkerAll(), webworkerAll_exports));
  }
};

// client/node_modules/pixi.js/lib/index.mjs
init_Extensions();
init_init5();
init_init4();
init_Rectangle();
init_ImageSource();
init_Texture();
init_textureFrom();
init_eventemitter3();
extensions.add(browserExt, webworkerExt);

// client/src/runtime/errors.ts
var RuntimeError = class _RuntimeError extends Error {
  constructor(code, message, recoverable = true, details) {
    super(message);
    this.code = code;
    this.recoverable = recoverable;
    this.details = details;
    this.name = "RuntimeError";
  }
  code;
  recoverable;
  details;
  static from(value) {
    if (value instanceof _RuntimeError) return value;
    if (value && typeof value === "object" && "code" in value && "message" in value) {
      const v2 = value;
      return new _RuntimeError(String(v2.code), String(v2.message), v2.recoverable !== false, value);
    }
    return new _RuntimeError("runtime_failed", value instanceof Error ? value.message : String(value), false);
  }
};

// client/src/runtime/crypto.ts
var constants = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function rotate(value, bits) {
  return value >>> bits | value << 32 - bits;
}
function hex(bytes2) {
  return Array.from(bytes2, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function copy(data) {
  if (!(data instanceof Uint8Array)) throw new RuntimeError("hash_input", "Hash input must be bytes.");
  return data.slice();
}
async function fallback(data) {
  const state = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]), words = new Uint32Array(64);
  const process = (block, offset) => {
    for (let i2 = 0; i2 < 16; i2++) {
      const at = offset + i2 * 4;
      words[i2] = block[at] << 24 | block[at + 1] << 16 | block[at + 2] << 8 | block[at + 3];
    }
    for (let i2 = 16; i2 < 64; i2++) {
      const x2 = words[i2 - 15], y2 = words[i2 - 2], s0 = rotate(x2, 7) ^ rotate(x2, 18) ^ x2 >>> 3, s1 = rotate(y2, 17) ^ rotate(y2, 19) ^ y2 >>> 10;
      words[i2] = words[i2 - 16] + s0 + words[i2 - 7] + s1 >>> 0;
    }
    let [a2, b2, c2, d2, e2, f2, g2, h2] = state;
    for (let i2 = 0; i2 < 64; i2++) {
      const sigma1 = rotate(e2, 6) ^ rotate(e2, 11) ^ rotate(e2, 25), choice = e2 & f2 ^ ~e2 & g2, t1 = h2 + sigma1 + choice + constants[i2] + words[i2] >>> 0;
      const sigma0 = rotate(a2, 2) ^ rotate(a2, 13) ^ rotate(a2, 22), majority = a2 & b2 ^ a2 & c2 ^ b2 & c2, t2 = sigma0 + majority >>> 0;
      h2 = g2;
      g2 = f2;
      f2 = e2;
      e2 = d2 + t1 >>> 0;
      d2 = c2;
      c2 = b2;
      b2 = a2;
      a2 = t1 + t2 >>> 0;
    }
    state[0] = state[0] + a2 >>> 0;
    state[1] = state[1] + b2 >>> 0;
    state[2] = state[2] + c2 >>> 0;
    state[3] = state[3] + d2 >>> 0;
    state[4] = state[4] + e2 >>> 0;
    state[5] = state[5] + f2 >>> 0;
    state[6] = state[6] + g2 >>> 0;
    state[7] = state[7] + h2 >>> 0;
  };
  const fullLength = data.length - data.length % 64;
  for (let offset = 0; offset < fullLength; offset += 64) {
    process(data, offset);
    if (offset > 0 && offset % (256 * 1024) === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const remaining = data.length - fullLength, tail = new Uint8Array(remaining < 56 ? 64 : 128);
  tail.set(data.subarray(fullLength));
  tail[remaining] = 128;
  const length = new DataView(tail.buffer);
  length.setUint32(tail.length - 8, Math.floor(data.length / 536870912), false);
  length.setUint32(tail.length - 4, data.length * 8 >>> 0, false);
  for (let offset = 0; offset < tail.length; offset += 64) process(tail, offset);
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}
async function sha256Hex(data) {
  const bytes2 = copy(data), subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      return hex(new Uint8Array(await subtle.digest("SHA-256", bytes2.buffer)));
    } catch {
    }
  }
  return fallback(bytes2);
}

// client/src/runtime/content-library.ts
var LIMITS = { index: 1 << 20, map: 16 << 20, mission: 2 << 20 };
var factions = ["US", "IR", "SY", "SA"];
var fail = (message) => {
  throw new RuntimeError("content_index_invalid", message);
};
var object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var identifier = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value);
var plain = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[<>\p{Cc}\p{Cf}]/u.test(value);
function shape(value, required, optional = []) {
  if (!object(value) || required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) fail("The content index contains missing or unsupported fields.");
}
function staticPath(value, prefix) {
  if (typeof value !== "string" || value.length > 240 || !/^\/(?:content|assets)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/.test(value) || value.includes("//") || value.split("/").some((segment) => segment === "." || segment === "..") || prefix && !value.startsWith(prefix)) return false;
  return true;
}
function array(value, max, label) {
  if (!Array.isArray(value) || value.length > max) fail(`${label} exceeds its supported index size.`);
  return value;
}
function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicate entries.`);
}
function dependencies(value, packs) {
  const values = array(value, 32, "Pack references");
  if (values.some((id) => !identifier(id) || !packs.has(id))) fail("A required pack is undeclared.");
  unique(values, "Pack references");
}
function file(value, kind, packs) {
  if (!identifier(value.id) || !identifier(value.version) || !plain(value.title, 100) || !staticPath(value.url, kind === "map" ? "/content/maps/" : "/content/missions/") || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.bytes) || Number(value.bytes) < 1 || Number(value.bytes) > LIMITS[kind]) fail(`A ${kind} index entry has invalid identity, metadata, path, checksum or size.`);
  dependencies(value.required_packs, packs);
}
function decodeContentIndex(source2) {
  if (!(source2 instanceof Uint8Array) || source2.byteLength > LIMITS.index) fail("The content index exceeds 1 MiB.");
  let data;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source2));
  } catch {
    fail("The content index is not valid UTF-8 JSON.");
  }
  shape(data, ["format_version", "version", "packs", "maps", "missions"]);
  if (data.format_version !== 1) throw new RuntimeError("content_index_incompatible", "Keep this index for the matching game version.");
  if (!identifier(data.version)) fail("The content index version is invalid.");
  const packs = array(data.packs, 32, "Packs"), maps = array(data.maps, 64, "Maps"), missions = array(data.missions, 128, "Missions");
  for (const pack of packs) {
    shape(pack, ["id", "version", "manifest_url"]);
    if (!identifier(pack.id) || !identifier(pack.version) || !staticPath(pack.manifest_url)) fail("A pack reference is invalid.");
  }
  unique(packs.map((p2) => p2.id), "Packs");
  unique(packs.map((p2) => p2.manifest_url), "Pack manifests");
  const packIDs = new Set(packs.map((p2) => p2.id));
  const fields = ["id", "version", "title", "url", "sha256", "bytes", "required_packs"];
  for (const map of maps) {
    shape(map, [...fields, "author", "players", "kind"], ["environment"]);
    file(map, "map", packIDs);
    if (!plain(map.author, 100) || !Number.isInteger(map.players) || Number(map.players) < 1 || Number(map.players) > 4 || !["skirmish", "scenario"].includes(String(map.kind))) fail("A map index entry has invalid author, player count or kind.");
    if (map.environment !== void 0) {
      shape(map.environment, ["url", "sha256", "bytes"]);
      const env = map.environment;
      if (!staticPath(env.url, "/content/environment/") || typeof env.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(env.sha256) || !Number.isSafeInteger(env.bytes) || Number(env.bytes) < 1 || Number(env.bytes) > 1 << 20) fail("A map environment entry has an invalid path, checksum or size.");
    }
  }
  unique(maps.map((m2) => m2.id), "Maps");
  const mapIDs = new Set(maps.map((m2) => m2.id));
  for (const mission of missions) {
    shape(mission, [...fields, "map_id", "mode", "faction", "order"], ["presentation_url"]);
    file(mission, "mission", packIDs);
    if (!identifier(mission.map_id) || !mapIDs.has(mission.map_id) || !["tutorial", "campaign", "coop"].includes(String(mission.mode)) || !factions.includes(String(mission.faction)) || !Number.isInteger(mission.order) || Number(mission.order) < 1 || Number(mission.order) > (mission.mode === "campaign" ? 6 : mission.mode === "tutorial" ? 5 : 2) || mission.presentation_url !== void 0 && !staticPath(mission.presentation_url)) fail("A mission index entry has an invalid map, mode, faction, story order or presentation path.");
  }
  unique(missions.map((m2) => m2.id), "Missions");
  unique(missions.map((m2) => {
    const v2 = m2;
    return `${v2.mode}:${v2.mode === "campaign" ? v2.faction : "all"}:${v2.order}`;
  }), "Mission order");
  unique([...maps, ...missions].map((v2) => v2.url), "Content file paths");
  return structuredClone(data);
}

// client/src/runtime/cache.ts
var PACK_PREFIX = "frontline-pack-v1:";
var READY_PATH = "/__frontline_pack_ready__";
var MANIFEST_PATH = "/__frontline_pack_manifest__";

// client/src/runtime/asset-generation.ts
var MAX_MANIFEST = 4 << 20;
var MAX_FILE = 128 << 20;
var MAX_TOTAL = 2 * 1024 ** 3;
var MAX_WAITING = 1024;
function fail2(code, message) {
  throw new RuntimeError(code, message);
}
var canceled = (signal) => {
  if (signal?.aborted) fail2("asset_canceled", "The asset load was canceled.");
};
var object2 = (v2) => !!v2 && typeof v2 === "object" && !Array.isArray(v2);
function pathOf(value) {
  if (typeof value !== "string" || value.length > 512 || !/^\/[A-Za-z0-9_.@~/-]+$/.test(value) || value.includes("//") || value.split("/").some((x2) => x2 === "." || x2 === "..") || (value === "/api" || value.startsWith("/api/")) || value === READY_PATH || value === MANIFEST_PATH) fail2("asset_path", "Choose a declared same-origin public asset path.");
  return value;
}
async function bytes(response, maximum, signal) {
  canceled(signal);
  if (!response.ok || response.redirected) fail2("asset_unavailable", "The requested asset response is unavailable.");
  const length = response.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) fail2("asset_size", "The asset response exceeds its allowed size.");
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let count2 = 0;
  const abort = () => {
    void reader.cancel().catch(() => {
    });
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (; ; ) {
      canceled(signal);
      const value = await reader.read();
      canceled(signal);
      if (value.done) break;
      count2 += value.value.byteLength;
      if (count2 > maximum) {
        void reader.cancel().catch(() => {
        });
        fail2("asset_size", "The asset response exceeds its allowed size.");
      }
      chunks.push(value.value);
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const joined = new Uint8Array(count2);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}
function parse(source2) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source2));
  } catch {
    fail2("asset_manifest_invalid", "The asset metadata is not valid UTF-8 JSON.");
  }
}
function manifest(source2) {
  const data = parse(source2);
  if (!object2(data) || Object.keys(data).some((k2) => !["id", "version", "files"].includes(k2)) || typeof data.id !== "string" || typeof data.version !== "string" || !Array.isArray(data.files) || data.files.length < 1 || data.files.length > 16e3) fail2("asset_manifest_invalid", "The asset manifest is invalid.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(data.id) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(data.version)) fail2("asset_manifest_invalid", "The asset manifest identity is invalid.");
  const seen = /* @__PURE__ */ new Set();
  let total = 0;
  const files = data.files.map((value) => {
    if (!object2(value) || Object.keys(value).some((k2) => !["path", "sha256", "bytes"].includes(k2)) || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.bytes) || Number(value.bytes) < 0 || Number(value.bytes) > MAX_FILE) fail2("asset_manifest_invalid", "An asset descriptor is invalid.");
    const path2 = pathOf(value.path);
    if (seen.has(path2)) fail2("asset_manifest_invalid", "An asset descriptor is duplicated.");
    seen.add(path2);
    total += Number(value.bytes);
    return Object.freeze({ path: path2, sha256: value.sha256, bytes: Number(value.bytes) });
  });
  if (total > MAX_TOTAL) fail2("asset_manifest_invalid", "The asset manifest is too large.");
  return { id: data.id, version: data.version, files };
}
async function captureAssetGeneration(indexSource, packId, options = {}) {
  const indexBytes = indexSource.slice(), index = decodeContentIndex(indexBytes), descriptor = index.packs.find((p2) => p2.id === packId);
  if (!descriptor) fail2("asset_identity", "The requested asset pack is absent from this content index.");
  const base = new URL(options.origin ?? globalThis.location?.origin ?? "http://127.0.0.1:8080");
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) fail2("asset_origin", "Choose the game origin without credentials or a path.");
  const origin = base.origin, fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis), storage = options.cacheStorage ?? globalThis.caches;
  const lifetime = new AbortController(), combined = (signal) => AbortSignal.any([lifetime.signal, ...options.signal ? [options.signal] : [], ...signal ? [signal] : []]);
  const initialSignal = combined();
  canceled(initialSignal);
  let bound;
  const present = async (name) => !!storage && (await storage.keys()).includes(name);
  const ready = async () => {
    if (!storage) return;
    const names = (await storage.keys()).filter((n2) => n2.startsWith(PACK_PREFIX));
    if (names.length > 128) fail2("asset_cache_limit", "Too many cached generations to inspect safely.");
    const candidates = [];
    for (const name of names) {
      canceled(initialSignal);
      if (!await present(name)) continue;
      const cache = await storage.open(name), response = await cache.match(READY_PATH);
      if (!response) continue;
      let value;
      try {
        value = parse(await bytes(response, 4096, initialSignal));
      } catch {
        continue;
      }
      if (!object2(value) || value.id !== descriptor.id || value.version !== descriptor.version || !Number.isSafeInteger(value.installedAt) || Number(value.installedAt) < 0 || !Number.isSafeInteger(value.files) || Number(value.files) < 1 || Number(value.files) > 16e3) continue;
      const metadata = value.metadataFiles ?? 0;
      if (metadata !== 0 && metadata !== 1) continue;
      if (metadata === 1 && (typeof value.manifestSHA256 !== "string" || !/^[a-f0-9]{64}$/.test(value.manifestSHA256))) continue;
      if ((await cache.keys()).length < Number(value.files) + 1 + Number(metadata)) continue;
      candidates.push({ name, installedAt: Number(value.installedAt), files: Number(value.files), metadataFiles: Number(metadata), ...typeof value.manifestSHA256 === "string" ? { manifestSHA256: value.manifestSHA256 } : {} });
    }
    return candidates.sort((a2, b2) => b2.installedAt - a2.installedAt || (a2.name < b2.name ? -1 : a2.name > b2.name ? 1 : 0))[0];
  };
  const network = async (path2, maximum2, signal) => {
    canceled(signal);
    signal = AbortSignal.any([signal, AbortSignal.timeout(15e3)]);
    let response;
    try {
      response = await fetcher(new URL(path2, origin), { credentials: "omit", redirect: "error", cache: "no-store", signal });
    } catch (error) {
      canceled(signal);
      throw new RuntimeError("asset_unavailable", "The exact asset generation is unavailable. Reconnect to its matching host or reinstall that generation.", true, error);
    }
    if (response.url && new URL(response.url).origin !== origin) fail2("asset_origin", "The asset response came from another origin.");
    return bytes(response, maximum2, signal);
  };
  bound = await ready();
  let manifestBytes;
  if (bound) {
    if (!await present(bound.name)) fail2("asset_generation_unavailable", "The selected cached generation was removed.");
    const cache = await storage.open(bound.name), response = await cache.match(MANIFEST_PATH);
    if (response) {
      manifestBytes = await bytes(response, MAX_MANIFEST, initialSignal);
      if (bound.manifestSHA256 && await sha256Hex(manifestBytes) !== bound.manifestSHA256) fail2("asset_integrity", "The cached manifest failed its integrity check.");
    } else if (bound.metadataFiles) fail2("asset_generation_unavailable", "The completed generation is missing its manifest.");
  }
  manifestBytes ??= await network(descriptor.manifest_url, MAX_MANIFEST, initialSignal);
  const pack = manifest(manifestBytes), indexSHA256 = await sha256Hex(indexBytes), manifestSHA256 = await sha256Hex(new TextEncoder().encode(JSON.stringify(pack)));
  canceled(initialSignal);
  if (pack.id !== descriptor.id || pack.version !== descriptor.version) fail2("asset_identity", "The pack manifest differs from the captured content index.");
  const byPath = new Map(pack.files.map((f2) => [f2.path, f2])), indexFile = byPath.get("/content/index.json");
  if (!indexFile || indexFile.bytes !== indexBytes.length || indexFile.sha256 !== indexSHA256) fail2("asset_identity", "The manifest does not describe the exact captured content index.");
  if (bound && bound.files !== pack.files.length) fail2("asset_identity", "The completed cache does not match its captured manifest.");
  const identity = Object.freeze({ id: pack.id, version: pack.version, indexSHA256, manifestSHA256, key: `${pack.id}:${pack.version}:${manifestSHA256}` });
  let disposed = false, inFlight = 0, inFlightBytes = 0, leaseBytes = 0;
  const leases = /* @__PURE__ */ new Map(), maximum = options.maxLeaseBytes ?? 64 << 20;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 256 << 20) fail2("asset_limit", "The decoded asset lease limit is invalid.");
  const waiting = [];
  const pump = () => {
    while (!disposed && waiting.length && inFlight < 4 && inFlightBytes + waiting[0].bytes <= MAX_FILE) {
      const job = waiting.shift();
      job.signal.removeEventListener("abort", job.abort);
      inFlight++;
      inFlightBytes += job.bytes;
      job.start();
    }
  };
  const acquire = (size, signal) => {
    canceled(signal);
    if (waiting.length >= MAX_WAITING) fail2("asset_busy", "The bounded asset request queue is full.");
    return new Promise((resolve, reject) => {
      const job = { bytes: size, signal, start: resolve, abort: () => {
        const index2 = waiting.indexOf(job);
        if (index2 < 0) return;
        waiting.splice(index2, 1);
        signal.removeEventListener("abort", job.abort);
        reject(new RuntimeError("asset_canceled", "The queued asset load was canceled."));
        pump();
      } };
      waiting.push(job);
      signal.addEventListener("abort", job.abort, { once: true });
      if (signal.aborted) job.abort();
      else pump();
    });
  };
  const file2 = (path2) => {
    const f2 = byPath.get(pathOf(path2));
    if (!f2) fail2("asset_unknown", "The asset is not declared by the captured manifest.");
    return f2;
  };
  const live = (signal) => {
    canceled(combined(signal));
    if (disposed) fail2("asset_canceled", "The asset generation was disposed.");
  };
  const key = (path2) => {
    const f2 = file2(path2);
    return `${identity.key}:${f2.path}:${f2.sha256}`;
  };
  const read = async (path2, signal) => {
    live(signal);
    const f2 = file2(path2), active = combined(signal);
    await acquire(f2.bytes, active);
    try {
      if (!bound) bound = await ready();
      let data;
      if (bound) {
        if (!await present(bound.name)) fail2("asset_generation_unavailable", "The selected cached generation was removed.");
        const cache = await storage.open(bound.name), response = await cache.match(new URL(f2.path, origin).href);
        if (!response) fail2("asset_generation_unavailable", "The selected generation is missing a required asset.");
        data = await bytes(response, f2.bytes, active);
        if (!await present(bound.name)) fail2("asset_generation_unavailable", "The selected cached generation was removed during loading.");
      } else data = await network(f2.path, f2.bytes, active);
      live(signal);
      if (data.length !== f2.bytes || await sha256Hex(data) !== f2.sha256) fail2("asset_integrity", "The asset bytes differ from the captured generation.");
      live(signal);
      return data;
    } finally {
      inFlight--;
      inFlightBytes -= f2.bytes;
      pump();
    }
  };
  const lease = async (path2, signal) => {
    live(signal);
    const f2 = file2(path2), cacheKey = key(path2);
    let entry = leases.get(cacheKey);
    if (!entry) {
      const data = await read(path2, signal);
      live(signal);
      entry = leases.get(cacheKey);
      if (!entry) {
        if (leaseBytes + data.length > maximum) fail2("asset_memory", "Release unused asset leases before loading more pages.");
        const suffix = path2.slice(path2.lastIndexOf(".")), type = { ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".json": "application/json", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wasm": "application/wasm" }[suffix] ?? "application/octet-stream";
        entry = { url: URL.createObjectURL(new Blob([new Uint8Array(data).buffer], { type })), bytes: data.length, refs: 0 };
        leases.set(cacheKey, entry);
        leaseBytes += data.length;
      }
    }
    entry.refs++;
    let released = false;
    const retained = entry;
    return Object.freeze({ url: entry.url, key: cacheKey, release() {
      if (released) return;
      released = true;
      retained.refs--;
      if (retained.refs === 0 && leases.get(cacheKey) === retained) {
        URL.revokeObjectURL(retained.url);
        leaseBytes -= retained.bytes;
        leases.delete(cacheKey);
      }
    } });
  };
  return Object.freeze({ identity, key, read, json: async (path2, signal) => parse(await read(path2, signal)), lease, get statistics() {
    return Object.freeze({ inFlight, inFlightBytes, queued: waiting.length, leases: leases.size, leaseBytes, disposed });
  }, dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    for (const entry of leases.values()) URL.revokeObjectURL(entry.url);
    leases.clear();
    leaseBytes = 0;
  } });
}

// client/src/runtime/asset-generation-input.ts
async function artGenerationInput(fetcher = globalThis.fetch.bind(globalThis), source2, signal) {
  if (!source2) {
    const active = AbortSignal.any([AbortSignal.timeout(15e3), ...signal ? [signal] : []]);
    const response = await fetcher("/content/index.json", { credentials: "omit", redirect: "error", cache: "no-store", signal: active });
    if (!response.ok || response.redirected || !response.body) throw new RuntimeError("asset_index_unavailable", "The matching game content index is unavailable.");
    const chunks = [], reader = response.body.getReader();
    let size = 0;
    const abort = () => {
      void reader.cancel().catch(() => {
      });
    };
    active.addEventListener("abort", abort, { once: true });
    try {
      for (; ; ) {
        active.throwIfAborted();
        const { done, value } = await reader.read();
        active.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > 1 << 20) throw new RuntimeError("asset_index_size", "The game content index exceeds its supported size.");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => {
      });
      throw error;
    } finally {
      active.removeEventListener("abort", abort);
      reader.releaseLock();
    }
    source2 = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      source2.set(chunk, offset);
      offset += chunk.length;
    }
  }
  const bytes2 = source2.slice(), index = decodeContentIndex(bytes2), pack = index.packs.find((pack2) => pack2.manifest_url === "/assets/packs/base.json");
  if (!pack) throw new RuntimeError("asset_index_missing", "The captured index does not declare the game art pack.");
  return { source: bytes2, packId: pack.id };
}

// client/src/content/catalog.ts
var AIR_ROLES = /* @__PURE__ */ new Set(["fighter", "strike", "gunship", "airlift", "isr", "scout_drone"]);
function classify(u2) {
  if (u2.armor === "infantry") return "infantry";
  if (AIR_ROLES.has(u2.role)) return u2.faction === "IR" || u2.role === "scout_drone" ? "drone" : u2.role === "gunship" || u2.role === "airlift" ? "rotor" : "aircraft";
  if (u2.role === "tank") return "tank";
  if (["rig", "hauler", "repair"].includes(u2.role)) return "support";
  return "vehicle";
}

// client/src/render/art-id.ts
var BUILDING_SKINS = { hq: "hq", power: "power", supply: "supply", barracks: "barracks", factory: "factory", radar: "radar", tech: "tech", depot: "repair_depot", outpost: "outpost", bunker: "bunker", turret: "gun_turret", aa_post: "aa_post", abm: "interceptor_battery", strategic: "strategic_site" };
var SPECIAL_BUILDINGS = { "US.airfield": "US.airfield", "IR.drone_hub": "IR.drone_hub", "SY.workshop_air": "SY.air_workshop", "SA.airfield": "SA.airfield", "SY.safehouse": "SY.safehouse" };
var OBJECT_SKINS = { light_prop: "destructible_wall_hp_light", heavy_prop: "destructible_wall_hp_heavy", garrison: "warehouse_garrisonable", energy_station: "supply_station_neutral" };
function authoredArtId(type, ownerFaction) {
  const special = SPECIAL_BUILDINGS[type];
  if (special) return `building.${special}`;
  if (/^(US|IR|SY|SA)\./.test(type)) return `unit.${type}`;
  if (type.startsWith("map.")) {
    const role = type.slice(4);
    return `prop.${OBJECT_SKINS[role] ?? role}`;
  }
  const skin = BUILDING_SKINS[type];
  return skin && ownerFaction && ["US", "IR", "SY", "SA"].includes(ownerFaction) ? `building.${ownerFaction}.${skin}` : void 0;
}

// client/src/content/art-ui.ts
function artUIKeys(index, id) {
  if (!id || id.length >= 240 || id.includes("..") || !/^[A-Za-z0-9_.@-]+$/.test(id)) throw Error(`Invalid battlefield UI asset: ${id}`);
  const legacy = id.replace(/^(unit|building)\./, "");
  const advertised = (keys) => keys?.includes(id) ? id : legacy && keys?.includes(legacy) ? legacy : void 0;
  return { portrait: advertised(index.portraits), build: advertised(index.buildIcons) };
}

// client/src/render/alpha-picking.ts
function makeAlphaMask(width, height, rgba) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !Number.isSafeInteger(width * height) || rgba.length !== width * height * 4) throw Error("Invalid atlas pixel data");
  const bits = new Uint8Array(Math.ceil(width * height / 8));
  for (let index = 0; index < width * height; index++) if (rgba[index * 4 + 3] !== 0) bits[index >> 3] |= 1 << (index & 7);
  return { width, height, bits };
}
function alphaInFrame(mask, frame, x2, y2, tolerance) {
  if (![x2, y2, tolerance].every(Number.isFinite) || tolerance < 0) return false;
  const left = Math.max(0, Math.floor(x2 - tolerance)), right = Math.min(frame.w - 1, Math.floor(x2 + tolerance)), top = Math.max(0, Math.floor(y2 - tolerance)), bottom = Math.min(frame.h - 1, Math.floor(y2 + tolerance));
  if (left > right || top > bottom) return false;
  for (let py = top; py <= bottom; py++) {
    const first = (frame.y + py) * mask.width + frame.x + left, last = (frame.y + py) * mask.width + frame.x + right;
    for (let byte = first >> 3; byte <= last >> 3; byte++) {
      const lo = byte === first >> 3 ? first & 7 : 0, hi = byte === last >> 3 ? last & 7 : 7;
      if (mask.bits[byte] & (255 << lo & 255 >>> 7 - hi)) return true;
    }
  }
  return false;
}

// client/src/render/art.ts
var SpriteSheet = class {
  constructor(id, meta, scale, pages, loadPage = async () => {
    throw Error("Verified sprite-page loader unavailable.");
  }, onError) {
    this.id = id;
    this.meta = meta;
    this.scale = scale;
    this.pages = pages;
    this.loadPage = loadPage;
    this.onError = onError;
    for (const state of meta.states) this.states.set(state.name, state);
    for (let pass = 0; pass < (meta.aliases?.length ?? 0); pass++) for (const alias of meta.aliases ?? []) {
      const source2 = this.states.get(alias.source);
      if (!source2 || this.states.has(alias.name)) continue;
      this.states.set(alias.name, { ...source2, name: alias.name, progress_driven: alias.progress_driven ?? source2.progress_driven });
      this.aliases.set(alias.name, alias);
    }
    for (const page of pages) for (const key of Object.keys(page.descriptors)) this.lookup.set(`${page.layer}|${key}`, page);
  }
  id;
  meta;
  scale;
  pages;
  loadPage;
  onError;
  states = /* @__PURE__ */ new Map();
  lookup = /* @__PURE__ */ new Map();
  disposed = false;
  aliases = /* @__PURE__ */ new Map();
  lifetime = new AbortController();
  /** Screen scale that converts this atlas to 1× world pixels. */
  get pixelScale() {
    return this.scale === "2x" ? 0.5 : 1;
  }
  get statistics() {
    return { indexedPages: this.pages.length, residentPages: this.pages.filter((page) => page.texture).length, residentBytes: this.pages.reduce((sum, page) => sum + (page.texture ? page.bytes : 0), 0), pickingBytes: this.pages.reduce((sum, page) => sum + (page.alpha?.bits.byteLength ?? 0), 0) };
  }
  key(layer, state, direction, index) {
    return `${layer}|${state}/d${String(direction).padStart(2, "0")}_f${String(index).padStart(2, "0")}`;
  }
  sourceFrame(state, direction, index) {
    for (let depth = 0; depth < this.aliases.size; depth++) {
      const alias = this.aliases.get(state);
      if (!alias) break;
      const source2 = this.states.get(alias.source);
      if (alias.reverse) index = source2.frames - 1 - index;
      state = alias.source;
    }
    return { state, direction, index };
  }
  hasFrame(layer, state, direction, index) {
    const source2 = this.sourceFrame(state, direction, index);
    return this.lookup.has(this.key(layer, source2.state, source2.direction, source2.index));
  }
  frame(layer, state, direction, index) {
    const source2 = this.sourceFrame(state, direction, index), key = this.key(layer, source2.state, source2.direction, source2.index), page = this.lookup.get(key);
    if (!page || this.disposed) return;
    page.lastUsed = performance.now();
    if (!page.texture) this.load(page);
    return page.frames.get(key);
  }
  has(state) {
    return this.states.has(state);
  }
  load(page) {
    if (page.pending || page.failed || this.disposed || performance.now() < (page.retryAfter ?? 0)) return;
    page.pending = (async () => {
      await page.unloading;
      if (this.disposed) return;
      const generation = ++page.generation, owned = await this.loadPage(page.url, this.lifetime.signal);
      if (this.disposed) {
        owned.dispose();
        return;
      }
      const texture = owned.texture;
      page.owned = owned;
      page.texture = texture;
      page.bytes = texture.source.pixelWidth * texture.source.pixelHeight * 4;
      if (page.layer === "beauty" || page.layer === "team") {
        const canvas = document.createElement("canvas");
        canvas.width = texture.source.pixelWidth;
        canvas.height = texture.source.pixelHeight;
        const context2 = canvas.getContext("2d", { willReadFrequently: true });
        if (!context2) throw Error("Atlas picking context unavailable");
        context2.drawImage(texture.source.resource, 0, 0);
        page.alpha = makeAlphaMask(canvas.width, canvas.height, context2.getImageData(0, 0, canvas.width, canvas.height).data);
        canvas.width = canvas.height = 0;
      }
      for (const [key, frame] of Object.entries(page.descriptors)) {
        const t2 = new Texture({ source: texture.source, frame: new Rectangle(frame.frame.x, frame.frame.y, frame.frame.w, frame.frame.h) });
        const ink = frame.ink_bounds, anchorY = frame.anchor?.y ?? 0.5;
        const valid = ink && [ink.x, ink.y, ink.w, ink.h].every(Number.isInteger) && ink.x >= 0 && ink.y >= 0 && ink.w > 0 && ink.h > 0 && ink.x + ink.w <= frame.frame.w && ink.y + ink.h <= frame.frame.h;
        page.frames.set(`${page.layer}|${key}`, { texture: t2, atlasTexture: texture, anchorX: frame.anchor?.x ?? 0.5, anchorY, ...page.alpha ? { containsAlpha: (x2, y2, tolerance) => page.generation === generation && !!page.alpha && alphaInFrame(page.alpha, frame.frame, x2, y2, tolerance) } : {}, ...valid ? { bodyBottom: (ink.y + ink.h - anchorY * frame.frame.h) * this.pixelScale, inkBounds: ink } : {} });
      }
      page.failures = 0;
      page.retryAfter = 0;
    })().catch(async (error) => {
      const retry = ["asset_unavailable", "asset_busy"].includes(String(error?.code));
      page.failures = (page.failures ?? 0) + 1;
      page.failed = !retry;
      page.retryAfter = performance.now() + Math.min(15e3, 250 * 2 ** Math.min(page.failures - 1, 6));
      page.generation++;
      page.alpha = void 0;
      for (const frame of page.frames.values()) frame.texture.destroy(false);
      page.frames.clear();
      page.texture = void 0;
      page.owned?.dispose();
      page.owned = void 0;
      if (!this.disposed && (!retry || page.failures === 1)) {
        this.onError?.(error instanceof Error ? error : new Error(String(error)));
        console.warn("Sprite page failed to load", this.id, page.url, error);
      }
    }).finally(() => {
      page.pending = void 0;
    });
  }
  async settle() {
    await Promise.all(this.pages.map((page) => page.pending));
  }
  unload(page) {
    if (page.pending || !page.texture) return;
    page.generation++;
    page.alpha = void 0;
    for (const frame of page.frames.values()) frame.texture.destroy(false);
    page.frames.clear();
    page.texture = void 0;
    page.owned?.dispose();
    page.owned = void 0;
  }
  evictBefore(before) {
    for (const page of this.pages) if (page.lastUsed < before) this.unload(page);
  }
  async dispose() {
    this.disposed = true;
    this.lifetime.abort();
    await this.settle();
    for (const page of this.pages) this.unload(page);
    await Promise.all(this.pages.map((page) => page.unloading));
  }
};
var ArtLibrary = class {
  constructor(options = {}) {
    this.options = options;
    this.generation = options.generation;
  }
  options;
  index;
  onError;
  generation;
  initialization;
  binding = Promise.resolve();
  epoch = 0;
  closed = false;
  lifetime = new AbortController();
  get generationIdentity() {
    return this.generation?.identity;
  }
  get generationStatistics() {
    return this.generation?.statistics;
  }
  fetch = async (input, init2) => {
    await this.init();
    const request = input instanceof Request ? input : void 0, url = new URL(request?.url ?? String(input), this.options.origin ?? location.origin), method = init2?.method ?? request?.method ?? "GET";
    if (method !== "GET" || url.origin !== new URL(this.options.origin ?? location.origin).origin || url.search || url.hash || url.username || url.password) throw Error("Only a declared same-origin asset GET is allowed.");
    const bytes2 = await this.generation.read(url.pathname, init2?.signal ?? request?.signal ?? void 0), type = url.pathname.endsWith(".png") ? "image/png" : url.pathname.endsWith(".json") ? "application/json" : "application/octet-stream";
    return new Response(new Uint8Array(bytes2).buffer, { status: 200, headers: { "Content-Type": type, "Content-Length": String(bytes2.length) } });
  };
  sheets = /* @__PURE__ */ new Map();
  images = /* @__PURE__ */ new Map();
  cameos = /* @__PURE__ */ new Map();
  scale = "1x";
  releaseWork = Promise.resolve();
  loaded = /* @__PURE__ */ new Set();
  configure(quality) {
    this.scale = quality === "high" ? "2x" : "1x";
  }
  get statistics() {
    return [...this.loaded].reduce((sum, sheet) => {
      const next = sheet.statistics;
      return { indexedPages: sum.indexedPages + next.indexedPages, residentPages: sum.residentPages + next.residentPages, residentBytes: sum.residentBytes + next.residentBytes, pickingBytes: sum.pickingBytes + next.pickingBytes };
    }, { indexedPages: 0, residentPages: 0, residentBytes: 0, pickingBytes: 0 });
  }
  async settle() {
    await Promise.all([...this.loaded].map((sheet) => sheet.settle()));
  }
  /** Keep current on-screen frames; reclaim animations unused for ten seconds. */
  trim() {
    const budget = this.scale === "2x" ? 384 * 1024 * 1024 : 192 * 1024 * 1024;
    if (this.statistics.residentBytes > budget) for (const sheet of this.loaded) sheet.evictBefore(performance.now() - 1e4);
  }
  captureOptions() {
    return { ...this.options, signal: AbortSignal.any([this.lifetime.signal, ...this.options.signal ? [this.options.signal] : []]) };
  }
  async init() {
    if (this.closed) throw new DOMException("Art library was disposed.", "AbortError");
    if (this.index) return this.index;
    if (this.initialization) return this.initialization;
    const epoch = this.epoch;
    const work = (async () => {
      let generation = this.generation;
      try {
        if (!generation) {
          const input = await artGenerationInput(this.options.fetcher, this.options.indexSource, this.captureOptions().signal);
          generation = await captureAssetGeneration(input.source, input.packId, this.captureOptions());
        }
        const index = await generation.json("/art/index.json");
        if (epoch !== this.epoch) {
          generation.dispose();
          throw new DOMException("Art generation was replaced.", "AbortError");
        }
        this.generation = generation;
        this.index = index;
        return index;
      } catch (error) {
        if (epoch === this.epoch) {
          generation?.dispose();
          this.generation = void 0;
          this.initialization = void 0;
        }
        throw error;
      }
    })();
    this.initialization = work;
    return work;
  }
  /** Called only at the application's explicit idle content-reload boundary. A
   * failed candidate keeps the previous index, pixels and generation available. */
  useIndex(source2, isCurrent = () => true) {
    const captured = source2.slice();
    let result2;
    const work = this.binding.then(async () => {
      if (this.closed || !isCurrent()) throw new DOMException("Content reload is no longer idle.", "AbortError");
      const input = await artGenerationInput(this.options.fetcher, captured, this.captureOptions().signal), next = await captureAssetGeneration(input.source, input.packId, this.captureOptions());
      let index;
      try {
        index = await next.json("/art/index.json");
        await this.release();
      } catch (error) {
        next.dispose();
        throw error;
      }
      if (this.closed || !isCurrent()) {
        next.dispose();
        throw new DOMException("Content reload is no longer idle.", "AbortError");
      }
      const previous = this.generation;
      this.epoch++;
      this.clearImages();
      this.generation = next;
      this.index = index;
      this.initialization = Promise.resolve(index);
      previous?.dispose();
      result2 = index;
    });
    this.binding = work.catch(() => {
    });
    return work.then(() => result2);
  }
  clearImages() {
    const images = this.images;
    this.images = /* @__PURE__ */ new Map();
    this.cameos.clear();
    for (const image2 of images.values()) void image2.then((value) => {
      value.src = "";
    }).catch(() => {
    });
  }
  async page(path2, signal, generation) {
    const bytes2 = await generation.read(path2, signal);
    signal.throwIfAborted();
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes2).buffer], { type: "image/png" }));
    if (signal.aborted || generation.statistics.disposed) {
      bitmap.close();
      throw new DOMException("Sprite loading was canceled.", "AbortError");
    }
    let texture;
    try {
      texture = new Texture({ source: new ImageSource({ resource: bitmap, resolution: 1 }) });
    } catch (error) {
      bitmap.close();
      throw error;
    }
    let closed = false;
    return { texture, dispose() {
      if (closed) return;
      closed = true;
      texture.destroy(true);
      bitmap.close();
    } };
  }
  has(id) {
    return !!this.index?.sprites[id];
  }
  /** Resolve the authored sprite for an entity type, with an explicit stand-in flag. */
  resolve(type, ownerFaction, catalog) {
    const direct = this.directId(type, ownerFaction);
    if (direct && this.has(direct)) return { id: direct, standIn: false };
    const standIn = this.standIn(type, ownerFaction, catalog);
    return standIn ? { id: standIn, standIn: true } : void 0;
  }
  directId(type, ownerFaction) {
    return authoredArtId(type, ownerFaction);
  }
  standIn(type, faction, catalog) {
    const u2 = catalog?.units.get(type);
    const pick = (...ids) => ids.find((id) => this.has(id));
    if (u2) {
      const c2 = classify(u2);
      if (c2 === "infantry") return pick(`unit.${u2.faction}.rifle`, "unit.US.rifle", "unit.SY.rifle", "unit.IR.rifle", "unit.SA.rifle");
      if (c2 === "aircraft" || c2 === "drone" || c2 === "rotor") return pick(`unit.${u2.faction}.strike`, "unit.IR.strike", "unit.US.fighter");
      if (c2 === "tank") return pick(`unit.${u2.faction}.tank`, "unit.US.tank", "unit.SA.tank");
      if (u2.role === "mobile_abm" || u2.role === "launcher" || u2.role === "artillery") return pick(`unit.${u2.faction}.${u2.role}`, "unit.SA.mobile_abm", "unit.US.tank");
      return pick(`unit.${u2.faction}.car`, "unit.SY.car", "unit.US.car", "unit.US.tank");
    }
    if (catalog?.buildings.has(type) || faction) return void 0;
    return void 0;
  }
  sheet(id) {
    const scale = this.scale, key = `${this.epoch}|${id}|${scale}`;
    let p2 = this.sheets.get(key);
    if (!p2) {
      p2 = this.loadSheet(id, scale, this.epoch).catch((error) => {
        if (this.sheets.get(key) === p2) this.sheets.delete(key);
        if (!this.closed && !(error instanceof DOMException && error.name === "AbortError")) {
          this.onError?.(error instanceof Error ? error : new Error(String(error)));
          console.warn("Sprite failed to load", id, error);
        }
        return void 0;
      });
      this.sheets.set(key, p2);
    }
    return p2;
  }
  async loadSheet(id, requestedScale, requestEpoch) {
    await this.releaseWork;
    const index = await this.init();
    if (this.closed || requestEpoch !== this.epoch || index !== this.index) throw new DOMException("Art generation was replaced.", "AbortError");
    const rel = index.sprites[id];
    if (!rel) return void 0;
    const base = `/art/${rel.slice(0, rel.lastIndexOf("/") + 1)}`;
    const generation = this.generation, epoch = this.epoch, meta = await generation.json(`/art/${rel}`), scale = meta.atlases[requestedScale] ? requestedScale : "1x";
    const pages = [];
    for (const [layer, files] of Object.entries(meta.atlases[scale])) for (const file2 of files) {
      const atlas = await generation.json(base + file2);
      pages.push({ url: base + atlas.meta.image, layer, descriptors: atlas.frames, frames: /* @__PURE__ */ new Map(), lastUsed: 0, bytes: 0, generation: 0 });
    }
    if (epoch !== this.epoch) throw new DOMException("Art generation was replaced.", "AbortError");
    const sheet = new SpriteSheet(id, meta, scale, pages, (path2, signal) => this.page(path2, signal, generation), (error) => this.onError?.(error));
    this.loaded.add(sheet);
    return sheet;
  }
  async image(url, expectedGeneration) {
    const epoch = this.epoch;
    await this.init();
    if (epoch !== this.epoch) throw new DOMException("Art generation was replaced.", "AbortError");
    const generation = expectedGeneration ?? this.generation;
    if (generation !== this.generation) throw new DOMException("Art generation was replaced.", "AbortError");
    const key = generation.key(url);
    let pending = this.images.get(key);
    if (!pending) {
      pending = (async () => {
        const lease = await generation.lease(url);
        try {
          const img = await new Promise((resolve, reject) => {
            const image2 = new Image();
            image2.decoding = "async";
            image2.onload = () => {
              image2.onload = image2.onerror = null;
              resolve(image2);
            };
            image2.onerror = () => {
              image2.onload = image2.onerror = null;
              reject(new Error("Image failed: " + url));
            };
            image2.src = lease.url;
          });
          if (this.generation !== generation || generation.statistics.disposed) {
            img.src = "";
            throw new DOMException("Art generation was replaced.", "AbortError");
          }
          return img;
        } finally {
          lease.release();
        }
      })().catch((error) => {
        if (this.images.get(key) === pending) this.images.delete(key);
        throw error;
      });
      this.images.set(key, pending);
    }
    return pending;
  }
  terrain(name) {
    return this.index?.terrain.includes(name) ? this.image(`/art/terrain/${name}.png`) : void 0;
  }
  /** Illustrated production/selection cameo composed from the real sprite layers. */
  cameo(id, teamColor, state = "idle", direction, purpose = "portrait") {
    const key = `${this.epoch}|${id}|${teamColor}|${state}|${direction}|${purpose}`;
    let p2 = this.cameos.get(key);
    if (!p2) {
      p2 = this.composeCameo(id, teamColor, state, direction, purpose).catch(() => {
        if (this.cameos.get(key) === p2) this.cameos.delete(key);
        return void 0;
      });
      this.cameos.set(key, p2);
    }
    return p2;
  }
  async composeCameo(id, teamColor, stateName, direction, purpose) {
    const epoch = this.epoch, index = await this.init();
    if (epoch !== this.epoch) throw new DOMException("Art generation was replaced.", "AbortError");
    const generation = this.generation, keys = artUIKeys(index, id);
    const build = purpose === "build" && keys.build, key = build || keys.portrait;
    const ui = build ? "icons/build" : keys.portrait ? "portraits" : void 0;
    if (ui) {
      const [beauty, team] = await Promise.all(["beauty", "team"].map((layer) => this.image(`/art/ui/${ui}/${key}@2x.${layer}.png`, generation)));
      if (generation !== this.generation) throw new DOMException("Art generation was replaced.", "AbortError");
      if (beauty.naturalWidth !== team.naturalWidth || beauty.naturalHeight !== team.naturalHeight) throw Error("Illustration layers do not match");
      const canvas2 = document.createElement("canvas");
      canvas2.width = beauty.naturalWidth;
      canvas2.height = beauty.naturalHeight;
      const ctx2 = canvas2.getContext("2d");
      ctx2.drawImage(beauty, 0, 0);
      const tinted = document.createElement("canvas");
      tinted.width = canvas2.width;
      tinted.height = canvas2.height;
      const mask = tinted.getContext("2d");
      mask.drawImage(team, 0, 0);
      mask.globalCompositeOperation = "multiply";
      mask.fillStyle = teamColor;
      mask.fillRect(0, 0, tinted.width, tinted.height);
      mask.globalCompositeOperation = "destination-in";
      mask.drawImage(team, 0, 0);
      ctx2.drawImage(tinted, 0, 0);
      return canvas2.toDataURL("image/png");
    }
    const rel = index.sprites[id];
    if (!rel) return void 0;
    const base = `/art/${rel.slice(0, rel.lastIndexOf("/") + 1)}`;
    const meta = await generation.json(`/art/${rel}`);
    const state = meta.states.find((s2) => s2.name === stateName) ?? meta.states.find((s2) => ["idle", "fly", "hover", "full"].includes(s2.name)) ?? meta.states[0];
    const dir = direction ?? (state.directions >= 16 ? Math.round(state.directions * 3 / 16) % state.directions : state.directions >= 8 ? 1 : 0);
    const frameKey = `${state.name}/d${String(dir).padStart(2, "0")}_f00`;
    const canvas = document.createElement("canvas");
    const [w2, h2] = meta.frame_size_2x;
    canvas.width = w2;
    canvas.height = h2;
    const ctx = canvas.getContext("2d");
    const parts = [[state.name, frameKey]];
    if (state.part === "hull" && meta.states.some((s2) => s2.name === "aim")) {
      const aim = meta.states.find((s2) => s2.name === "aim");
      parts.push(["aim", `aim/d${String(Math.round(dir * aim.directions / state.directions) % aim.directions).padStart(2, "0")}_f00`]);
    }
    for (const [partState, key2] of parts) {
      for (const layer of ["beauty", "team"]) {
        const files = meta.atlases["2x"][layer];
        if (!files) continue;
        for (const file2 of files) {
          const atlas = await generation.json(base + file2);
          const f2 = atlas.frames[key2];
          if (!f2) continue;
          const img = await this.image(base + atlas.meta.image, generation);
          if (generation !== this.generation) throw new DOMException("Art generation was replaced.", "AbortError");
          if (layer === "team") {
            const tmp = document.createElement("canvas");
            tmp.width = f2.frame.w;
            tmp.height = f2.frame.h;
            const t2 = tmp.getContext("2d");
            t2.drawImage(img, f2.frame.x, f2.frame.y, f2.frame.w, f2.frame.h, 0, 0, f2.frame.w, f2.frame.h);
            t2.globalCompositeOperation = "multiply";
            t2.fillStyle = teamColor;
            t2.fillRect(0, 0, f2.frame.w, f2.frame.h);
            t2.globalCompositeOperation = "destination-in";
            t2.drawImage(img, f2.frame.x, f2.frame.y, f2.frame.w, f2.frame.h, 0, 0, f2.frame.w, f2.frame.h);
            ctx.drawImage(tmp, 0, 0);
          } else ctx.drawImage(img, f2.frame.x, f2.frame.y, f2.frame.w, f2.frame.h, 0, 0, f2.frame.w, f2.frame.h);
          void partState;
          break;
        }
      }
    }
    const data = ctx.getImageData(0, 0, w2, h2).data;
    let minX = w2, minY = h2, maxX = 0, maxY = 0;
    for (let y2 = 0; y2 < h2; y2++) for (let x2 = 0; x2 < w2; x2++) if (data[(y2 * w2 + x2) * 4 + 3] > 16) {
      if (x2 < minX) minX = x2;
      if (x2 > maxX) maxX = x2;
      if (y2 < minY) minY = y2;
      if (y2 > maxY) maxY = y2;
    }
    if (maxX <= minX) return void 0;
    const pad = 6, cw = maxX - minX + pad * 2, ch = maxY - minY + pad * 2, out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d").drawImage(canvas, minX - pad, minY - pad, cw, ch, 0, 0, cw, ch);
    return out.toDataURL("image/png");
  }
  async dispose() {
    if (this.closed) return;
    this.closed = true;
    this.epoch++;
    this.lifetime.abort();
    this.generation?.dispose();
    this.clearImages();
    await this.binding;
    await this.release();
    this.generation = void 0;
    this.index = void 0;
    this.initialization = void 0;
  }
  /** Release GPU textures for a finished match; same-generation cameos stay cached. */
  release() {
    const previous = this.sheets;
    this.sheets = /* @__PURE__ */ new Map();
    const earlier = this.releaseWork;
    this.releaseWork = (async () => {
      await earlier;
      const sheets = await Promise.all(previous.values());
      for (const sheet of sheets) {
        if (sheet) {
          await sheet.dispose();
          this.loaded.delete(sheet);
        }
      }
    })();
    return this.releaseWork;
  }
};
var art = new ArtLibrary();

// work/art/ui-team-normalization-audit-v1/extreme-palette-v1/config.json
var config_default = {
  roles: [
    "US.rifle",
    "US.at",
    "IR.recon",
    "SA.medic",
    "US.tank"
  ],
  colors: [
    {
      palette: "standard",
      bound: "darkest",
      hex: "#D9463E",
      relative_luminance: 0.1947983201463114
    },
    {
      palette: "standard",
      bound: "lightest",
      hex: "#D8DDE2",
      relative_luminance: 0.7180281948662962
    },
    {
      palette: "cvd_safe",
      bound: "darkest",
      hex: "#0072B2",
      relative_luminance: 0.15248980125973846
    },
    {
      palette: "cvd_safe",
      bound: "lightest",
      hex: "#FFFFFF",
      relative_luminance: 1
    }
  ],
  scope: "Actual palette luminance extrema, exact private 136-mask candidate subset; original US rifle is historical pending spec-only replacement."
};

// work/art/ui-team-normalization-audit-v1/extreme-palette-v1/compare.ts
var roles = config_default.roles;
var colors = config_default.colors;
var modes = ["raw", "normalized"];
var image = (src) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(Error(src));
  im.src = src;
});
var pixels = (im) => {
  const c2 = document.createElement("canvas");
  c2.width = im.naturalWidth;
  c2.height = im.naturalHeight;
  const x2 = c2.getContext("2d", { willReadFrequently: true });
  x2.drawImage(im, 0, 0);
  return x2.getImageData(0, 0, c2.width, c2.height).data;
};
var result = { cases: [], images: {}, errors: [], complete: false };
window.audit = result;
async function run() {
  for (const role of roles) for (const purpose of ["portrait", "build"]) {
    const section = document.createElement("section");
    section.id = `${role}-${purpose}`;
    const heading = document.createElement("h2");
    heading.textContent = `${role} ${purpose}`;
    section.append(heading);
    document.body.append(section);
    for (const color of colors) {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("p");
      label.textContent = `${color.palette} ${color.bound} ${color.hex} \u2014 original / normalized, each native 1\xD7 then 2\xD7`;
      row.append(label);
      section.append(row);
      const variants = {};
      for (const mode of modes) {
        const art2 = new ArtLibrary();
        art2.index = { format: 1, sprites: {}, terrain: [], portraits: roles, buildIcons: roles, chrome: [], icons: false, emblems: false };
        art2.image = (url) => {
          if (!url.startsWith("/art/ui/")) throw Error(`Unexpected dependency ${url}`);
          return image(`/inputs/${mode}/${url.slice("/art/ui/".length)}`);
        };
        try {
          const data = await art2.cameo(`unit.${role}`, color.hex, "idle", void 0, purpose);
          if (!data) throw Error(`Missing ${role}/${purpose}/${mode}`);
          const im = await image(data);
          variants[mode] = { image: im, pixels: pixels(im) };
          result.images[`${role}-${purpose}-${color.hex.slice(1)}-${mode}`] = data;
          const cell = document.createElement("div");
          cell.className = "cell";
          for (const divisor of [2, 1]) {
            const picture = new Image();
            picture.src = data;
            picture.width = im.naturalWidth / divisor;
            picture.height = im.naturalHeight / divisor;
            cell.append(picture);
          }
          row.append(cell);
        } finally {
          await art2.release();
        }
      }
      const raw = variants.raw.pixels, other = variants.normalized.pixels, folder = purpose === "portrait" ? "portraits" : "icons/build", mask = pixels(await image(`/inputs/raw/${folder}/${role}@2x.team.png`));
      let changed = 0, outside = 0, max = 0, sum = 0, alpha = 0;
      for (let i2 = 0; i2 < raw.length; i2 += 4) {
        let delta = 0;
        for (let c2 = 0; c2 < 3; c2++) delta = Math.max(delta, Math.abs(raw[i2 + c2] - other[i2 + c2]));
        if (delta) {
          changed++;
          sum += delta;
          if (mask[i2 + 3] === 0) outside++;
        }
        max = Math.max(max, delta);
        if (raw[i2 + 3] !== other[i2 + 3]) alpha++;
      }
      if (outside || alpha) throw Error(`Non-mask change ${role}/${purpose}:${outside}/${alpha}`);
      result.cases.push({ role, purpose, ...color, width: variants.raw.image.naturalWidth, height: variants.raw.image.naturalHeight, changed_pixels: changed, max_rgb_delta: max, mean_changed_pixel_max_delta: changed ? sum / changed : 0, outside_mask_changes: outside, alpha_changes: alpha });
    }
  }
  result.complete = true;
  document.title = "Frontline Command \u2014 extreme palette cameo audit";
}
run().catch((error) => {
  result.errors.push(String(error));
  result.complete = true;
  document.body.append(String(error));
});
