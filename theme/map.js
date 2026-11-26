// The world map: zoom, pan, layers, search and the card for a place.
{
  const atlas = document.getElementById("atlas"), svg = atlas.querySelector("svg"), card = atlas.querySelector(".atlas-card");
  const info = JSON.parse(document.getElementById("atlas-info").textContent);
  const W = +atlas.dataset.width, H = +atlas.dataset.height;
  const pins = [...svg.querySelectorAll(".m-places a")], realms = [...svg.querySelectorAll(".m-realms a")];
  const names = svg.querySelector(".m-names");
  const MAX = 9;
  let view = { x: 0, y: 0, w: W, h: H };

  // ---- View ----
  const ratio = () => atlas.clientHeight / atlas.clientWidth;
  const whole = () => {                       // the smallest view that shows the whole map
    const w = Math.max(W, H / ratio());
    return { x: (W - w) / 2, y: (H - w * ratio()) / 2, w, h: w * ratio() };
  };
  function clamp(v) {
    const most = whole().w;
    const w = Math.min(most, Math.max(W / MAX / 1.6, v.w)), h = w * ratio();
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const hold = (c, size, full) => size >= full ? full / 2 : Math.min(full - size / 2, Math.max(size / 2, c));
    return { x: hold(cx, w, W) - w / 2, y: hold(cy, h, H) - h / 2, w, h };
  }
  function show(v) {
    view = clamp(v);
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    const px = view.w / atlas.clientWidth;    // map units per screen pixel
    const zoom = whole().w / view.w, small = atlas.clientWidth < 620;
    atlas.style.setProperty("--pin", px * Math.min(1.35, (small ? .62 : .8) + zoom * .1));
    atlas.style.setProperty("--px", px);
    atlas.dataset.level = zoom < (small ? 1.8 : 1.35) ? 1 : zoom < (small ? 3.4 : 2.4) ? 2 : 3;
    names.style.opacity = zoom > 5 ? .25 : 1;
  }
  function zoomAt(factor, cx, cy) {           // cx, cy: 0 to 1 across the box
    const w = view.w / factor, h = w * ratio();
    show({ x: view.x + (view.w - w) * cx, y: view.y + (view.h - h) * cy, w, h });
  }
  let gliding = 0;
  function glide(to) {
    to = clamp(to);
    cancelAnimationFrame(gliding);
    if (document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return show(to);
    const from = { ...view }, start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / 450), e = 1 - (1 - t) ** 3;
      show({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      if (t < 1) gliding = requestAnimationFrame(step);
    };
    gliding = requestAnimationFrame(step);
  }

  // ---- The card ----
  function select(id, go) {
    const p = info[id];
    if (!p) return;
    for (const el of [...pins, ...realms]) el.classList.toggle("on", el.dataset.id === id);
    const title = document.createElement("strong"), kind = document.createElement("small");
    const text = document.createElement("p"), link = document.createElement("a"), close = document.createElement("button");
    title.textContent = p.t;
    kind.textContent = [p.k, p.r].filter(Boolean).join(" · ");
    text.textContent = p.s || "Little has been written about this place yet.";
    link.href = p.u;
    link.textContent = "Read the article";
    close.type = "button";
    close.className = "close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.onclick = deselect;
    card.replaceChildren(close, title, kind, text, link);
    card.hidden = false;
    if (!go) return;
    if (p.b) {
      const w = Math.max((p.b[2] - p.b[0]) * 1.25, (p.b[3] - p.b[1]) * 1.25 / ratio());
      glide({ x: (p.b[0] + p.b[2] - w) / 2, y: (p.b[1] + p.b[3] - w * ratio()) / 2, w, h: w * ratio() });
    } else {
      const w = Math.min(view.w, 480);
      glide({ x: p.x - w / 2, y: p.y - w * ratio() / 2, w, h: w * ratio() });
    }
  }
  function deselect() {
    card.hidden = true;
    for (const el of [...pins, ...realms]) el.classList.remove("on");
  }

  // ---- Pointer ----
  const held = new Map();
  let moved = 0, pinch = 0;
  svg.addEventListener("pointerdown", e => {
    if (e.button) return;
    if (!held.size) moved = 0;
    held.set(e.pointerId, [e.clientX, e.clientY]);
    cancelAnimationFrame(gliding);
    pinch = 0;
  });
  addEventListener("pointermove", e => {
    const was = held.get(e.pointerId);
    if (!was) return;
    const box = atlas.getBoundingClientRect(), px = view.w / box.width;
    if (held.size === 1) {
      const dx = e.clientX - was[0], dy = e.clientY - was[1];
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) show({ ...view, x: view.x - dx * px, y: view.y - dy * px });
    }
    held.set(e.pointerId, [e.clientX, e.clientY]);
    if (held.size === 2) {
      const [a, b] = [...held.values()], gap = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomAt(gap / pinch, ((a[0] + b[0]) / 2 - box.left) / box.width, ((a[1] + b[1]) / 2 - box.top) / box.height);
      pinch = gap;
      moved = 99;
    }
  });
  for (const kind of ["pointerup", "pointercancel"]) addEventListener(kind, e => { held.delete(e.pointerId); pinch = 0; });
  svg.addEventListener("dragstart", e => e.preventDefault());
  svg.addEventListener("click", e => {
    const el = e.target.closest("a");
    if (e.ctrlKey || e.metaKey) return;       // opens the article in a new tab
    e.preventDefault();
    if (moved > 4) return;
    if (e.shiftKey) {                         // for adding pins to wiki.toml
      const box = atlas.getBoundingClientRect();
      const x = Math.round(view.x + (e.clientX - box.left) / box.width * view.w);
      const y = Math.round(view.y + (e.clientY - box.top) / box.height * view.h);
      card.replaceChildren(`x = ${x}, y = ${y}`);
      card.hidden = false;
      return;
    }
    if (!el) return deselect();
    // Enter or a second click on the chosen place opens its article.
    if (e.detail === 0 && el.classList.contains("on")) location.href = info[el.dataset.id].u;
    else if (e.detail === 2) location.href = info[el.dataset.id].u;
    else select(el.dataset.id, e.detail === 0);
    history.replaceState(null, "", "#" + el.dataset.id);
  });
  // The wheel zooms, but the page can still be scrolled past a fully zoomed-out map.
  atlas.addEventListener("wheel", e => {
    if (e.target.closest(".atlas-card, .atlas-layers")) return;
    const out = e.deltaY > 0;
    if (out && view.w >= whole().w - 1) return;
    e.preventDefault();
    cancelAnimationFrame(gliding);
    const box = atlas.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? .05 : .0016)), (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
  }, { passive: false });

  // ---- Buttons, layers, search ----
  for (const b of atlas.querySelectorAll("[data-zoom]")) b.addEventListener("click", () => {
    const f = +b.dataset.zoom;
    if (!f) return glide(whole());
    const w = view.w / f, h = w * ratio();
    glide({ x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2, w, h });
  });
  for (const box of atlas.querySelectorAll("[data-layer]")) {
    const apply = () => atlas.classList.toggle("no-" + box.dataset.layer, !box.checked);
    box.addEventListener("change", apply);
    apply();
  }
  if (atlas.clientWidth < 620) atlas.querySelector(".atlas-layers").open = false;
  const find = document.querySelector(".atlas-find"), field = find.querySelector("input");
  const flat = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").toLowerCase().trim();
  function search(exact) {
    const q = flat(field.value), ids = Object.keys(info);
    if (!q) return;
    const id = ids.find(i => flat(info[i].t) === q) ?? (exact ? null : ids.find(i => flat(info[i].t).startsWith(q)) ?? ids.find(i => flat(info[i].t).includes(q)));
    if (id) { select(id, true); history.replaceState(null, "", "#" + id); }
  }
  find.addEventListener("submit", e => { e.preventDefault(); search(false); });
  field.addEventListener("input", () => search(true));
  for (const b of document.querySelectorAll("[data-go]")) b.addEventListener("click", () => {
    select(b.dataset.go, true);
    atlas.scrollIntoView({ block: "center" });
  });
  const fromHash = () => { const id = decodeURIComponent(location.hash.slice(1)); if (info[id]) select(id, true); };
  addEventListener("hashchange", fromHash);
  let width = atlas.clientWidth;
  new ResizeObserver(() => {
    const full = view.w >= W - 1 && width === atlas.clientWidth;
    width = atlas.clientWidth;
    show(full ? whole() : { ...view, h: view.w * ratio() });
  }).observe(atlas);
  show(whole());
  fromHash();
}
