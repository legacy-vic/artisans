/* Family trees for the Artisans vault. The same file draws them in Obsidian and on the wiki. */
const FamilyTree = (() => {
  const BOX = 118, GAP = 30, LANE = 12, DROP = 18, LINE = 17, PAD = 14, MARGIN = 6, CHARS = 15;

  // ---- Reading the text -------------------------------------------------
  // Parent + Parent > Child, Child     + married   ~ unmarried   ? suspected couple
  //                                    > child     ~> adopted    ?> suspected child
  const STYLE = { "~": "dotted", "?": "dashed", "~>": "dotted", "?>": "dashed" };
  function parse(source) {
    const people = new Map(), unions = new Map();
    const person = raw => {
      const [name, label] = raw.replace(/\[\[|\]\]/g, "").split("|").map(s => s.trim());
      if (!name) throw new Error("A name is missing.");
      const key = name.toLowerCase();
      if (!people.has(key)) people.set(key, { key, name, label: label || name.split("/").pop() });
      else if (label) people.get(key).label = label;
      return people.get(key);
    };
    const union = (partners, style) => {
      const id = partners.map(p => p.key).sort().join("\n");
      if (!unions.has(id)) unions.set(id, { partners, style, children: [] });
      return unions.get(id);
    };
    for (const raw of source.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(/\s*(\?>|~>|-*>)\s*/);
      let parents = null;
      for (let i = 0; i < parts.length; i += 2) {
        const couples = parts[i].split(",").filter(s => s.trim()).map(text => {
          const bits = text.trim().split(/\s+([+~?])\s+/);
          if (bits.length > 3) throw new Error(`Only two partners at a time: "${text.trim()}". Give each marriage its own line.`);
          return { who: bits.filter((_, n) => n % 2 === 0).map(person), style: STYLE[bits[1]] || "" };
        });
        if (!couples.length) throw new Error(`A name is missing in "${line}".`);
        if (i + 2 < parts.length && couples.length > 1) throw new Error(`Only one couple can come before an arrow: "${line}".`);
        for (const c of couples) {
          if (parents && !parents.children.some(k => k.p === c.who[0])) {
            parents.children.push({ p: c.who[0], style: STYLE[parts[i - 1]] || "" });
          }
          if (c.who.length > 1 && c.who[0] === c.who[1]) throw new Error(`"${c.who[0].name}" is married to themselves.`);
        }
        const made = couples.map(c => c.who.length > 1 || i + 2 < parts.length ? union(c.who, c.style) : null);
        parents = made[0];
      }
    }
    if (!people.size) throw new Error("Nothing to draw yet. Try: Parent + Parent > Child, Child");
    return { people: [...people.values()], unions: [...unions.values()] };
  }

  // ---- Generations ------------------------------------------------------
  function cluster(people, unions) {           // everyone joined by marriage shares a row
    const up = new Map(people.map(p => [p, p]));
    const top = p => { while (up.get(p) !== p) p = up.get(p); return p; };
    for (const u of unions) if (u.partners[1]) up.set(top(u.partners[0]), top(u.partners[1]));
    const made = new Map();
    for (const p of people) {
      const t = top(p);
      if (!made.has(t)) made.set(t, { people: [], kids: new Set(), row: 0 });
      made.get(t).people.push(p);
      p.c = made.get(t);
    }
    for (const u of unions) for (const k of u.children) u.partners[0].c.kids.add(k.p.c);
    return [...made.values()];
  }

  function onLoop(start) {
    const seen = new Set(), todo = [...start.kids];
    while (todo.length) {
      const c = todo.pop();
      if (c === start) return true;
      if (!seen.has(c)) { seen.add(c); todo.push(...c.kids); }
    }
    return false;
  }

  function arrange(people, unions) {
    let clusters = cluster(people, unions);
    // Marrying one's own ancestor cannot be drawn in rows: that person gets a second box.
    for (let loop; (loop = clusters.find(onLoop));) {
      const u = unions.find(u => u.partners[1] && u.partners[0].c === loop && !u.partners.some(p => p.copy));
      if (!u) throw new Error(`"${loop.people[0].name}" is listed as their own ancestor.`);
      const copy = { ...u.partners[0], copy: true };
      u.partners = [copy, u.partners[1]];
      people.push(copy);
      clusters = cluster(people, unions);
    }
    const parents = new Map(clusters.map(c => [c, []]));
    for (const c of clusters) for (const k of c.kids) parents.get(k).push(c);
    const depth = c => c.depth ??= Math.max(-1, ...parents.get(c).map(depth)) + 1;
    clusters.forEach(c => { c.row = depth(c); });
    // Families that marry in start just above the person who married.
    for (const c of [...clusters].sort((a, b) => b.row - a.row)) {
      if (!parents.get(c).length && c.kids.size) c.row = Math.min(...[...c.kids].map(k => k.row)) - 1;
    }
    for (const c of clusters) c.people = inline(c.people, unions);
    // A line that skips a generation passes through an empty spot in each row between.
    for (const u of [...unions]) {
      u.children = u.children.map(k => {
        let next = k;
        for (let r = k.p.c.row - 1; r > u.partners[0].c.row; r--) {
          const spot = { spot: true, style: k.style };
          spot.c = { people: [spot], kids: new Set([next.p.c]), row: r };
          clusters.push(spot.c);
          unions.push({ partners: [spot], children: [next] });
          next = { p: spot, style: k.style };
        }
        return next;
      });
    }
    return clusters;
  }

  function inline(people, unions) {            // spouses in a line, most-married in the middle
    if (people.length === 1) return people;
    const near = new Map(people.map(p => [p, []]));
    for (const { partners: [a, b] } of unions) if (b && near.has(a)) { near.get(a).push(b); near.get(b).push(a); }
    const mid = people.reduce((a, b) => near.get(b).length > near.get(a).length ? b : a);
    const seen = new Set([mid]);
    const walk = p => { seen.add(p); return [p, ...near.get(p).flatMap(q => seen.has(q) ? [] : walk(q))]; };
    const sides = near.get(mid).map(q => seen.has(q) ? [] : walk(q)).filter(s => s.length);
    return sides.length === 1 ? [mid, ...sides[0]] : [...sides[0].reverse(), mid, ...sides.slice(1).flat()];
  }

  // ---- Places -----------------------------------------------------------
  const width = p => p.spot ? 10 : BOX;
  function measure(c) {
    let x = 0;
    for (const p of c.people) { p.off = x + width(p) / 2; x += width(p) + GAP; }
    c.w = x - GAP;
  }

  function place(rows, unions, rounds) {
    for (const row of rows) { row.forEach(measure); }
    const at = u => (u.partners[0].x + u.partners[u.partners.length - 1].x) / 2;
    const put = (c, x) => { c.x = x; for (const p of c.people) p.x = x + p.off; };
    for (const row of rows) { let x = 0; for (const c of row) { if (c.x === undefined || rounds.fresh) put(c, x); else put(c, c.x); x += c.w + GAP; } }
    for (let n = 0; n < rounds.n; n++) {
      const order = n % 2 ? rows : [...rows].reverse();
      for (const row of order) {
        const want = row.map(c => ({ sum: 0, n: 0 }));
        const index = new Map(row.map((c, i) => [c, i]));
        const pull = (c, x) => { const w = want[index.get(c)]; w.sum += x; w.n++; };
        for (const u of unions) {
          if (!u.children.length) continue;
          const xs = u.children.map(k => k.p.x), mid = (Math.min(...xs) + Math.max(...xs)) / 2, here = at(u);
          const pc = u.partners[0].c;
          if (index.has(pc)) pull(pc, pc.x + mid - here);
          for (const k of u.children) if (index.has(k.p.c)) pull(k.p.c, k.p.c.x + here - mid);
        }
        // Nearest places to the wanted ones that keep the order and spacing.
        let edge = 0;
        const blocks = [];
        row.forEach((c, i) => {
          const w = want[i].n || .05;
          blocks.push({ v: (want[i].n ? want[i].sum / want[i].n : c.x) - edge, w, items: [[c, edge]] });
          edge += c.w + GAP;
          while (blocks.length > 1 && blocks[blocks.length - 2].v > blocks[blocks.length - 1].v) {
            const b = blocks.pop(), a = blocks[blocks.length - 1];
            a.v = (a.v * a.w + b.v * b.w) / (a.w + b.w);
            a.w += b.w;
            a.items.push(...b.items);
          }
        });
        for (const b of blocks) for (const [c, e] of b.items) put(c, b.v + e);
      }
    }
  }

  // Bars in the space below a row, stacked so that they do not run into each other.
  function bars(rows, unions) {
    const gaps = rows.map(() => ({ list: [], lanes: 0, brackets: 0, crossings: 0 }));
    for (const u of unions) {
      const row = rows[u.partners[0].c.row], c = u.partners[0].c, gap = gaps[c.row];
      const [a, b] = [u.partners[0], u.partners[u.partners.length - 1]];
      u.x = (a.x + b.x) / 2;
      u.bracket = Math.abs(c.people.indexOf(a) - c.people.indexOf(b)) > 1 ? ++gap.brackets : 0;
      if (!u.children.length) continue;
      const xs = u.children.map(k => k.p.x);
      gap.list.push({ u, xs, lo: Math.min(u.x, ...xs), hi: Math.max(u.x, ...xs) });
    }
    const inside = (x, b) => x > b.lo - 1 && x < b.hi + 1;
    const over = (a, b) => (inside(b.u.x, a) ? 1 : 0) + a.xs.filter(x => inside(x, b)).length;   // a drawn above b
    for (const gap of gaps) {
      const stack = [];
      for (const b of gap.list) {
        let best = 0, least = Infinity;
        for (let i = 0; i <= stack.length; i++) {
          const n = stack.reduce((s, o, j) => s + (j < i ? over(o, b) : over(b, o)), 0);
          if (n < least) { least = n; best = i; }
        }
        stack.splice(best, 0, b);
        gap.crossings += least;
      }
      stack.forEach((b, i) => {
        b.lane = 0;
        for (const o of stack.slice(0, i)) if (o.lo < b.hi + 8 && b.lo < o.hi + 8) b.lane = Math.max(b.lane, o.lane + 1);
        b.u.lane = b.lane;
        gap.lanes = Math.max(gap.lanes, b.lane + 1);
      });
    }
    return gaps;
  }

  function cost(rows, unions) {
    place(rows, unions, { n: 16, fresh: true });
    let total = bars(rows, unions).reduce((s, g) => s + g.crossings * 300, 0);
    for (const u of unions) {
      const xs = u.children.map(k => k.p.x);
      if (!xs.length) continue;
      total += Math.max(u.x, ...xs) - Math.min(u.x, ...xs) + Math.abs(u.x - (Math.min(...xs) + Math.max(...xs)) / 2);
      for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1]) total += 260;      // keep children as written
      if (u.partners[1] && u.partners[0].x > u.partners[1].x) total += 15;
    }
    const all = rows.flat();
    return total + .2 * (Math.max(...all.map(c => c.x + c.w)) - Math.min(...all.map(c => c.x)));
  }

  function order(clusters, unions) {
    const rows = [];
    for (const c of clusters) (rows[c.row] ??= []);
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    const placed = new Set(), parentOf = new Map();
    for (const u of unions) for (const k of u.children) parentOf.set(k.p, u);
    const visit = c => {
      if (placed.has(c)) return;
      placed.add(c);
      rows[c.row].push(c);
      for (const p of c.people) {
        if (parentOf.has(p)) visit(parentOf.get(p).partners[0].c);
        for (const u of unions) if (u.partners.includes(p)) u.children.forEach(k => visit(k.p.c));
      }
    };
    [...clusters].sort((a, b) => a.row - b.row).forEach(visit);

    const save = () => [rows.map(r => [...r]), new Map(clusters.map(c => [c, [...c.people]]))];
    const load = ([r, p]) => { r.forEach((row, i) => { rows[i] = [...row]; }); for (const [c, list] of p) c.people = [...list]; };
    const follow = from => {                   // lower rows line up under their parents
      for (let r = from + 1; r < rows.length; r++) {
        const key = new Map(rows[r].map((c, i) => {
          const xs = c.people.filter(p => parentOf.has(p)).map(p => parentOf.get(p)).map(u => [rows[u.partners[0].c.row].indexOf(u.partners[0].c), u.children.findIndex(k => k.p.c === c)]);
          return [c, xs.length ? xs.reduce((s, [a, b]) => s + a + (b + 1) / 100, 0) / xs.length : i];
        }));
        rows[r].sort((a, b) => key.get(a) - key.get(b));
      }
    };
    let best, state, budget;
    const attempt = change => {
      if (budget-- <= 0) return;
      change();
      const c = cost(rows, unions);
      if (c < best - .5) { best = c; state = save(); } else load(state);
    };
    const improve = () => {
      best = cost(rows, unions); state = save(); budget = 1200;
      for (let pass = 0, before = Infinity; pass < 6 && best < before - .5 && budget > 0; pass++) {
        before = best;
        for (let r = 0; r < rows.length; r++) {
          for (const c of [...rows[r]]) {
            if (c.people.length > 1) attempt(() => c.people.reverse());
            for (let to = 0; to < rows[r].length; to++) {
              const move = () => { const row = rows[r]; row.splice(row.indexOf(c), 1); row.splice(to, 0, c); };
              if (rows[r].indexOf(c) === to) continue;
              attempt(move);
              if (r + 1 < rows.length) attempt(() => { move(); follow(r); });
            }
          }
        }
      }
      load(state);
      return [best, state];
    };
    // Mirrored is sometimes better, as it can put children in the order they were written.
    const first = improve();
    rows.forEach(r => r.reverse());
    clusters.forEach(c => c.people.reverse());
    const second = improve();
    load(second[0] < first[0] - .5 ? second[1] : first[1]);
    place(rows, unions, { n: 200, fresh: true });
    return rows;
  }

  // ---- Drawing ----------------------------------------------------------
  function lineCount(text) {
    let lines = 1, used = 0;
    for (const word of text.split(/\s+/)) {
      if (used && used + 1 + word.length > CHARS) { lines++; used = 0; }
      lines += Math.max(0, Math.ceil(word.length / CHARS) - 1);
      used += (used ? 1 : 0) + word.length;
    }
    return lines;
  }

  function layout(source) {
    const { people, unions } = parse(source);
    const rows = order(arrange(people, unions), unions);
    const gaps = bars(rows, unions);
    const all = rows.flat().flatMap(c => c.people);
    const left = Math.min(...all.map(p => p.x - width(p) / 2)) - MARGIN;
    for (const p of all) p.x = Math.round(p.x - left) + .5;
    const tops = [], heights = [];
    let y = MARGIN;
    rows.forEach((row, r) => {
      tops[r] = y;
      heights[r] = Math.max(2, ...row.flatMap(c => c.people).filter(p => !p.spot).map(p => lineCount(p.label))) * LINE + PAD;
      y += heights[r];
      if (r < rows.length - 1 || gaps[r].brackets) y += DROP * 2 + Math.max(0, gaps[r].lanes - 1) * LANE + gaps[r].brackets * 9;
    });
    const lines = [], draw = (d, style) => lines.push({ d, style });
    // Someone with two sets of parents (one suspected, say) is joined at two points.
    const joins = new Map(), joined = new Map();
    for (const u of unions) for (const k of u.children) joins.set(k.p, (joins.get(k.p) || []).concat(u));
    for (const [p, list] of joins) {
      [...list].sort((a, b) => a.x - b.x).forEach((u, i) => {
        if (!joined.has(u)) joined.set(u, new Map());
        joined.get(u).set(p, p.x + (i - (list.length - 1) / 2) * 24);
      });
    }
    const ports = new Map();
    const port = p => { const n = (ports.get(p) || 0) + 1; ports.set(p, n); return p.x + (n % 2 ? 1 : -1) * 10 * Math.ceil(n / 2); };
    for (const u of unions) {
      const a = u.partners[0], b = u.partners[1], r = a.c.row;
      const base = tops[r] + heights[r];
      u.x = b ? Math.round((a.x + b.x) / 2) + .5 : a.x;
      let from = a.spot ? tops[r] : base;
      if (b && u.bracket) {
        from = base + u.bracket * 9 + .5;
        draw(`M${port(a)} ${base}V${from}H${port(b)}V${base}`, u.style);
      } else if (b) {
        from = Math.round(tops[r] + heights[r] / 2) + .5;
        draw(`M${a.x} ${from}H${b.x}`, u.style);
      }
      if (!u.children.length) continue;
      const bar = base + gaps[r].brackets * 9 + DROP + (u.lane || 0) * LANE + .5;
      const styles = new Set(u.children.map(k => k.style)), faint = styles.size === 1 ? u.children[0].style : "";
      // A child almost straight below is joined by a straight line.
      const xs = u.children.map(k => joined.get(u).get(k.p)).map((x, i) => !u.children[i].p.spot && Math.abs(x - u.x) < 8 ? u.x : x);
      draw(`M${u.x} ${from}V${bar}`, faint);
      if (xs.some(x => x !== u.x)) draw(`M${Math.min(u.x, ...xs)} ${bar}H${Math.max(u.x, ...xs)}`, faint);
      u.children.forEach((k, i) => draw(`M${xs[i]} ${bar}V${tops[r + 1]}`, k.style));
    }
    return {
      width: Math.ceil(Math.max(...all.map(p => p.x + width(p) / 2)) + MARGIN), height: y + MARGIN, lines,
      boxes: all.filter(p => !p.spot).map(p => ({ p, x: p.x - BOX / 2, y: tops[p.c.row], w: BOX, h: heights[p.c.row] })),
    };
  }

  // link(person) gives an element to put in the box, or null when there is no such note.
  function render(source, { subject = "", link }) {
    const root = document.createElement("div");
    root.className = "family-tree";
    let t;
    try { t = layout(source); } catch (e) {
      root.classList.add("ft-error");
      root.textContent = `Family tree: ${e.message}`;
      return root;
    }
    const canvas = document.createElement("div");
    canvas.className = "ft-canvas";
    Object.assign(canvas.style, { width: `${t.width}px`, height: `${t.height}px` });
    const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", t.width);
    svg.setAttribute("height", t.height);
    svg.setAttribute("aria-hidden", "true");
    for (const l of t.lines) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", l.d);
      if (l.style) path.setAttribute("class", `ft-${l.style}`);
      svg.append(path);
    }
    canvas.append(svg);
    let self = null;
    for (const b of t.boxes) {
      const box = document.createElement("div"), me = b.p.key.split("/").pop() === subject.toLowerCase();
      const inner = me ? null : link(b.p);
      box.className = "ft-box" + (me ? " ft-self" : inner ? "" : " ft-plain");
      Object.assign(box.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      box.append(inner || b.p.label);
      if (me) self ??= b;
      canvas.append(box);
    }
    root.append(canvas);
    // The key lists only the kinds of line this tree uses.
    const used = new Set(t.lines.map(l => l.style)), key = document.createElement("div");
    for (const [style, text] of [["dashed", "Suspected or disputed"], ["dotted", "Unmarried or adopted"]]) {
      if (!used.has(style)) continue;
      const item = document.createElement("span"), swatch = document.createElement("i");
      swatch.className = `ft-swatch ft-swatch-${style}`;
      item.append(swatch, text);
      key.append(item);
    }
    key.className = "ft-key";
    if (key.firstChild) root.append(key);
    if (self && typeof ResizeObserver !== "undefined") {      // wide trees start on this character
      const watch = new ResizeObserver(() => {
        if (!root.clientWidth) return;
        root.scrollLeft = self.x + self.w / 2 - root.clientWidth / 2;
        watch.disconnect();
      });
      watch.observe(root);
    }
    return root;
  }
  // "from Some Note" borrows the first tree in that note. Trees inside callouts are never borrowed.
  const borrowed = source => source.trim().match(/^from\s+(?:\[\[)?([^\n\]|]+?)(?:\]\])?$/i)?.[1];
  const find = text => text.replace(/\r\n/g, "\n").match(/^```+[ \t]*family\b[^\n]*\n([\s\S]*?)^```/m)?.[1];
  return { render, layout, borrowed, find };
})();

// ---- Obsidian -----------------------------------------------------------
if (typeof module === "object" && typeof require === "function") {
  const { Plugin, MarkdownRenderChild } = require("obsidian");
  module.exports = class extends Plugin {
    onload() {
      this.registerMarkdownCodeBlockProcessor("family", async (source, el, ctx) => {
        const here = ctx.sourcePath, subject = here.split("/").pop().replace(/\.md$/, "");
        const draw = text => el.replaceChildren(FamilyTree.render(text, {
          subject,
          link: p => {
            if (!this.app.metadataCache.getFirstLinkpathDest(p.name, here)) return null;
            const a = document.createElement("a");
            a.className = "internal-link";
            a.dataset.href = a.href = p.name;
            a.textContent = p.label;
            a.addEventListener("click", e => {
              e.preventDefault();
              e.stopPropagation();
              this.app.workspace.openLinkText(p.name, here, e.ctrlKey || e.metaKey);
            });
            a.addEventListener("mouseover", event => this.app.workspace.trigger("hover-link",
              { event, source: "preview", hoverParent: el, targetEl: a, linktext: p.name, sourcePath: here }));
            return a;
          },
        }));
        const name = FamilyTree.borrowed(source);
        if (!name) { draw(source); return; }
        const file = this.app.metadataCache.getFirstLinkpathDest(name, here);
        const borrow = async () => {
          const text = file ? FamilyTree.find(await this.app.vault.cachedRead(file)) : null;
          if (text) draw(text);
          else el.setText(`Family tree: no tree found in "${name}".`);
        };
        await borrow();
        const child = new MarkdownRenderChild(el);      // redrawn when the family's note changes
        child.registerEvent(this.app.metadataCache.on("changed", f => { if (f === file) borrow(); }));
        ctx.addChild(child);
      });
    }
  };
}
