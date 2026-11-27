// The small web of an article and what it's linked with.
window.drawConnections = (holder, index, links) => {
  const MOST = 16, W = 720, H = 440;
  const slug = u => u.replace(/^wiki\/|\.html$/g, "");
  const me = index.findIndex(p => slug(p.u) === holder.dataset.page);
  if (me < 0) return;
  const near = new Map(), tie = (k, n) => { if (k !== me) near.set(k, (near.get(k) ?? 0) + n); };
  links[me].forEach(k => tie(k, 2));
  links.forEach((to, k) => { if (to.includes(me)) tie(k, 2); });
  const has = (a, b) => links[a].includes(b) || links[b].includes(a);
  const all = [...near.keys()];
  // The best connected among themselves are kept.
  const worth = k => near.get(k) * 2 + all.filter(o => o !== k && has(o, k)).length;
  const kept = all.sort((a, b) => worth(b) - worth(a) || a - b).slice(0, MOST);
  const nodes = [me, ...kept].map((k, i) => ({ k, x: W / 2 + (i ? Math.cos(i * 2.4) * (90 + i * 9) : 0), y: H / 2 + (i ? Math.sin(i * 2.4) * (60 + i * 7) : 0) }));
  const edges = [];
  nodes.forEach((a, i) => nodes.forEach((b, j) => { if (j > i && has(a.k, b.k)) edges.push([a, b, i === 0]); }));
  for (const n of nodes) n.n = edges.filter(e => e[0] === n || e[1] === n).length || 1;
  for (const n of nodes) n.w = Math.min(150, index[n.k].t.length * 7 + 22);
  for (let t = 0; t < 320; t++) {
    const cool = 1 - t / 320;
    for (const a of nodes) for (const b of nodes) {
      if (a === b) continue;
      const dx = a.x - b.x || .1, dy = (a.y - b.y || .1) * 1.5, d = Math.hypot(dx, dy);
      const push = Math.min(14, 26000 / (d * d)) * cool;
      a.x += dx / d * push * 1.6; a.y += dy / d * push * .9;
      // Boxes must not sit on one another.
      const gx = (a.w + b.w) / 2 + 8 - Math.abs(a.x - b.x), gy = 32 - Math.abs(a.y - b.y);
      if (gx > 0 && gy > 0) { if (gy < gx) a.y += Math.sign(a.y - b.y || 1) * gy / 3; else a.x += Math.sign(a.x - b.x || 1) * gx / 3; }
    }
    for (const [a, b, own] of edges) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, pull = (d - (own ? 190 : 170)) * .03 * cool / Math.sqrt(Math.max(a.n, b.n));
      a.x += dx / d * pull; a.y += dy / d * pull; b.x -= dx / d * pull; b.y -= dy / d * pull;
    }
    for (const n of nodes) {
      n.x = Math.min(W - n.w / 2 - 4, Math.max(n.w / 2 + 4, n.x));
      n.y = Math.min(H - 18, Math.max(18, n.y));
    }
    nodes[0].x = W / 2; nodes[0].y = H / 2;
  }
  const NS = "http://www.w3.org/2000/svg", make = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.append(el);
    return el;
  };
  const box = document.createElement("div");
  box.className = "web";
  const svg = make("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Connected articles" }, box);
  for (const [a, b, own] of edges) make("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: own ? "own" : "" }, svg);
  nodes.forEach((n, i) => {
    const p = index[n.k], g = make(i ? "a" : "g", i ? { href: document.body.dataset.root + p.u } : { class: "self" }, svg);
    g.style.setProperty("--node", p.c);
    make("rect", { x: n.x - n.w / 2, y: n.y - 13, width: n.w, height: 26, rx: 5 }, g);
    const text = make("text", { x: n.x, y: n.y + 4.5 }, g);
    const room = Math.floor((n.w - 14) / 6.6);
    text.textContent = p.t.length > room ? p.t.slice(0, room - 1).trim() + "…" : p.t;
    make("title", {}, g).textContent = p.t + (p.s ? " — " + p.s.slice(0, 120) : "");
  });
  holder.append(box);
  if (all.length > MOST) {
    const note = document.createElement("p");
    note.className = "edited";
    note.textContent = `The ${MOST} closest of ${all.length} linked articles.`;
    holder.append(note);
  }
};
