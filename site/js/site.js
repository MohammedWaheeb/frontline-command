// Shared behaviour for the Frontline Command project site. No dependencies.
(() => {
  "use strict";
  document.documentElement.classList.add("js");
  const R = window.FC_RULES;
  const SITE = window.FC_SITE || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icon = (name, cls = "icon") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const fmt = (n) => (Number.isInteger(n) ? n.toLocaleString("en-US") : String(n));

  // ---- Mobile navigation ----------------------------------------------------
  const nav = $(".nav");
  const toggle = $(".nav__toggle");
  if (nav && toggle) {
    toggle.addEventListener("click", () => {
      const open = nav.dataset.open !== "true";
      nav.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.innerHTML = icon(open ? "x" : "list");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.dataset.open === "true") toggle.click();
    });
  }

  // ---- Repository links -----------------------------------------------------
  // <a data-repo="docs/protocol.md"> resolves to the hosted repository when configured.
  if (SITE.repoUrl) {
    const base = SITE.repoUrl.replace(/\/$/, "");
    $$("[data-repo]").forEach((a) => {
      const path = a.dataset.repo;
      a.href = !path ? base : path.endsWith("/") ? `${base}/tree/${SITE.branch}/${path}` : `${base}/blob/${SITE.branch}/${path}`;
    });
    $$("[data-repo-issues]").forEach((a) => (a.href = `${base}/issues`));
  }

  // ---- Live counts from the rules data -----------------------------------------
  if (R) {
    $$("[data-count]").forEach((el) => {
      const v = R.counts[el.dataset.count];
      if (v != null) el.textContent = fmt(v);
    });
  }

  // ---- Faction roster -------------------------------------------------------------
  const ARMOR = { infantry: "Infantry", light: "Light", heavy: "Heavy", air: "Air" };
  const GLYPH = { infantry: "person-simple-walk", light: "jeep", heavy: "truck", air: "airplane-tilt" };
  const PRODUCER = {
    barracks: "Barracks", factory: "Factory", airfield: "Airfield", drone_hub: "Drone hub",
    workshop_air: "Air workshop", hq: "HQ", supply: "Supply center",
  };
  const kindOf = (u) => (u.armor === "infantry" ? "infantry" : u.armor === "air" ? "air" : "vehicle");

  function unitCard(u) {
    const kind = kindOf(u);
    // Show sprites at a size that keeps relative scale readable: infantry small, heavy kit large.
    const width = { infantry: 84, light: 150, heavy: 170, air: 150 }[u.armor] || 140;
    const art = u.art
      ? `<div class="unit__sprite" style="--w:${width}px">
           <img src="img/units/${u.id}.webp" alt="${u.name}, in-game render" loading="lazy" width="${width}">
           <span class="unit__team" style="-webkit-mask-image:url('img/units/${u.id}.team.webp');mask-image:url('img/units/${u.id}.team.webp')"></span>
         </div>`
      : `<a class="unit__wanted" href="contribute.html#art" title="This unit has no finished render yet">
           ${icon(u.faction === "IR" && u.armor === "air" ? "drone" : GLYPH[u.armor] || "cube")}Art wanted
         </a>`;
    return `<article class="unit" data-kind="${kind}">
      <div class="unit__art">${art}</div>
      <div class="unit__body">
        <div><div class="unit__name">${u.name}</div><div class="unit__id">${u.id}</div></div>
        <dl class="unit__stats">
          <div><dt>Cost</dt><dd>${fmt(u.cost)} cr</dd></div>
          <div><dt>Build</dt><dd>${fmt(u.build)} s</dd></div>
          <div><dt>HP</dt><dd>${fmt(u.hp)}</dd></div>
          <div><dt>Armor</dt><dd>${ARMOR[u.armor] || u.armor}</dd></div>
          <div><dt>Supply</dt><dd>${u.supply}</dd></div>
          <div><dt>Tier</dt><dd>T${u.tier}</dd></div>
          <div><dt>Speed</dt><dd>${fmt(u.speed)} t/s</dd></div>
          <div><dt>Weapon</dt><dd>${u.weapon || "Unarmed"}</dd></div>
        </dl>
      </div>
    </article>`;
  }

  $$("[data-roster]").forEach((host) => {
    if (!R) return;
    const faction = host.dataset.roster;
    const list = R.units.filter((u) => u.faction === faction);
    host.innerHTML = list.map(unitCard).join("");
    const count = $(`[data-roster-count="${faction}"]`);
    if (count) {
      const withArt = list.filter((u) => u.art).length;
      count.textContent = `${list.length} units from pkg/content/rules.json. ${withArt} have finished in-game renders; the rest need art.`;
    }
    const chips = $(`[data-roster-filter="${faction}"]`);
    if (chips) {
      chips.addEventListener("click", (e) => {
        const btn = e.target.closest(".chip");
        if (!btn) return;
        $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
        const want = btn.dataset.kind;
        $$(".unit", host).forEach((card) => (card.hidden = want !== "all" && card.dataset.kind !== want));
      });
    }
  });

  // ---- Mechanics tables --------------------------------------------------------------
  const armorHost = $("[data-armor-table]");
  if (armorHost && R) {
    const classes = ["small", "auto", "cannon", "antiarmor", "shell", "antiair", "airground"];
    const names = { small: "Small arms", auto: "Autocannon", cannon: "Tank cannon", antiarmor: "Anti-armor", shell: "Artillery shell", antiair: "Anti-air", airground: "Air-to-ground" };
    const armors = ["infantry", "light", "heavy", "structure", "air"];
    const get = (w, a) => R.armor.find((x) => x.weapon === w && x.armor === a);
    armorHost.innerHTML = `<table>
      <thead><tr><th scope="col">Weapon class</th>${armors.map((a) => `<th scope="col" class="num">${a[0].toUpperCase() + a.slice(1)}</th>`).join("")}</tr></thead>
      <tbody>${classes.map((w) => `<tr><th scope="row">${names[w]}</th>${armors.map((a) => {
        const m = get(w, a);
        if (!m || m.mult === 0) return `<td class="num off">No</td>`;
        return `<td class="num${m.mult >= 1 ? " strong" : ""}">${m.mult.toFixed(2)}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table>`;
  }

  const weaponHost = $("[data-weapon-table]");
  if (weaponHost && R) {
    weaponHost.innerHTML = `<table>
      <thead><tr><th scope="col">ID</th><th scope="col">Class</th><th scope="col" class="num">Damage</th><th scope="col" class="num">Interval s</th><th scope="col" class="num">Range tiles</th><th scope="col" class="num">Ammo</th><th scope="col" class="num">Splash</th></tr></thead>
      <tbody>${R.weapons.map((w) => `<tr>
        <th scope="row" class="mono">${w.id}</th><td>${w.kind}</td>
        <td class="num">${fmt(w.damage)}${w.volley > 1 ? ` ×${w.volley}` : ""}</td>
        <td class="num">${fmt(w.interval)}</td><td class="num">${fmt(w.min)}-${fmt(w.max)}</td>
        <td class="num">${w.ammo ? w.ammo : "Unlimited"}</td><td class="num">${w.splash ? fmt(w.splash) : "-"}</td></tr>`).join("")}</tbody></table>`;
  }

  const buildingHost = $("[data-building-table]");
  if (buildingHost && R) {
    buildingHost.innerHTML = `<table>
      <thead><tr><th scope="col">Building</th><th scope="col" class="num">Credits</th><th scope="col" class="num">Seconds</th><th scope="col" class="num">HP</th><th scope="col" class="num">Footprint</th><th scope="col" class="num">Power</th></tr></thead>
      <tbody>${R.buildings.map((b) => `<tr>
        <th scope="row">${b.name}</th><td class="num">${fmt(b.cost)}</td><td class="num">${fmt(b.build)}</td><td class="num">${fmt(b.hp)}</td>
        <td class="num">${b.w}×${b.h}</td><td class="num${b.power.startsWith("+") ? " strong" : ""}">${b.power}</td></tr>`).join("")}</tbody></table>`;
  }

  // ---- Tabs (campaigns) -----------------------------------------------------------------
  $$("[role=tablist]").forEach((list) => {
    const tabs = $$("[role=tab]", list);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
      if (focus) tab.focus();
    };
    list.addEventListener("click", (e) => { const t = e.target.closest("[role=tab]"); if (t) select(t); });
    list.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length], true);
      if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length], true);
    });
  });

  // ---- Scroll reveal and section tracking (IntersectionObserver only) ------------------
  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));

    const spyLinks = $$("[data-spy] a[href^='#']");
    if (spyLinks.length) {
      const map = new Map(spyLinks.map((a) => [a.getAttribute("href").slice(1), a]));
      // On any crossing, mark the last section whose top has passed 40% of the viewport.
      const sections = [...map.keys()].map((id) => document.getElementById(id)).filter(Boolean);
      const update = () => {
        const line = window.innerHeight * 0.4;
        let current = sections[0];
        for (const el of sections) if (el.getBoundingClientRect().top <= line) current = el;
        spyLinks.forEach((a) => a.classList.toggle("is-active", a === map.get(current.id)));
        const active = map.get(current.id);
        const list = active.closest("ul, ol");
        if (list && list.scrollWidth > list.clientWidth) {
          list.scrollTo({ left: active.offsetLeft - 16, behavior: "smooth" });
        }
      };
      const spy = new IntersectionObserver(update, { rootMargin: "-40% 0px -59% 0px" });
      sections.forEach((el) => spy.observe(el));
      update();
    }
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }
})();
