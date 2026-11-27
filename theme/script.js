// Search, hover previews, random article, sortable tables, menu and theme.
const root = document.body.dataset.root;
const $ = (s, el = document) => el.querySelector(s);
const fold = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").toLowerCase();

// The index is loaded only when something needs it.
let indexPromise;
function loadIndex() {
  return indexPromise ??= new Promise((done, fail) => {
    const s = document.createElement("script");
    s.src = root + "search-index.js";
    s.onload = () => {
      for (const p of window.WIKI_INDEX) {
        p.key = fold(p.t);
        p.alt = p.a.map(fold);
        p.text = fold(p.b);
      }
      done(window.WIKI_INDEX);
    };
    s.onerror = () => { indexPromise = null; fail(new Error("index")); };
    document.head.append(s);
  });
}

// ---- Search ----
const box = $("#search"), results = $("#results");
let chosen = -1;
function score(p, q) {
  if (p.key === q) return 100;
  if (p.alt.includes(q)) return 90;
  if (p.key.startsWith(q)) return 80;
  if (p.alt.some(a => a.startsWith(q))) return 70;
  if (p.key.includes(q)) return 60;
  if (p.alt.some(a => a.includes(q))) return 50;
  const words = q.split(/\s+/).filter(Boolean);
  return words.every(w => p.text.includes(w) || p.key.includes(w)) ? 10 : 0;
}
async function search() {
  const q = fold(box.value.trim());
  chosen = -1;
  if (!q) { results.hidden = true; return; }
  let index;
  try { index = await loadIndex(); } catch { return; }
  if (fold(box.value.trim()) !== q) return;   // typed on while loading
  const hits = index.map(p => [score(p, q), p]).filter(h => h[0])
    .sort((a, b) => b[0] - a[0] || a[1].t.localeCompare(b[1].t)).slice(0, 12);
  results.replaceChildren(...hits.map(([, p]) => {
    const li = document.createElement("li"), a = document.createElement("a"), small = document.createElement("small");
    a.href = root + p.u;
    a.textContent = p.t;
    if (p.n) {
      const note = document.createElement("em");
      note.className = "uncategorized";
      note.textContent = p.n;
      a.append(" ", note);
    }
    small.textContent = p.s || p.f;
    a.append(small);
    li.append(a);
    return li;
  }));
  if (!hits.length) {
    const li = document.createElement("li");
    li.className = "none";
    li.textContent = "No articles match.";
    results.append(li);
  }
  results.hidden = false;
}
box.addEventListener("input", search);
box.addEventListener("focus", search);
box.addEventListener("keydown", e => {
  const links = [...results.querySelectorAll("a")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!links.length) return;
    chosen = (chosen + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
    links.forEach((a, i) => a.classList.toggle("on", i === chosen));
    links[chosen].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter" && links.length) {
    location.href = links[Math.max(chosen, 0)].href;
  } else if (e.key === "Escape") {
    results.hidden = true;
  }
});
document.addEventListener("click", e => { if (!e.target.closest(".search")) results.hidden = true; });
document.addEventListener("keydown", e => {
  if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); box.focus(); }
});

// ---- Random article ----
$("#random").addEventListener("click", async e => {
  e.preventDefault();
  const pool = (await loadIndex()).filter(p => p.b);
  location.href = root + pool[Math.floor(Math.random() * pool.length)].u;
});

// ---- Hover previews ----
const card = $("#preview");
let timer;
if (matchMedia("(hover: hover)").matches) {
  document.addEventListener("mouseover", e => {
    const link = e.target.closest("a.wikilink");
    clearTimeout(timer);
    if (!link) { card.hidden = true; return; }
    timer = setTimeout(async () => {
      const index = await loadIndex().catch(() => []);
      const page = index.find(p => new URL(root + p.u, location.href).pathname === link.pathname);
      if (!page || !page.s || !link.matches(":hover")) return;
      const name = document.createElement("strong");
      name.textContent = page.t;
      card.replaceChildren(name, page.s + (page.b.length > page.s.length ? "…" : ""));
      if (page.i) card.prepend(Object.assign(document.createElement("img"), { src: root + page.i, alt: "" }));
      card.style.setProperty("--preview", page.c);
      card.hidden = false;
      const r = link.getBoundingClientRect();
      const left = Math.min(r.left, innerWidth - card.offsetWidth - 16);
      const below = r.bottom + card.offsetHeight + 12 < innerHeight;
      card.style.left = `${Math.max(8, left) + scrollX}px`;
      card.style.top = `${(below ? r.bottom + 6 : r.top - card.offsetHeight - 6) + scrollY}px`;
    }, 350);
  });
}

// ---- Tables ----
for (const table of document.querySelectorAll("table.sortable")) {
  const body = table.tBodies[0];
  table.querySelectorAll("th button").forEach((button, col) => button.addEventListener("click", () => {
    const th = button.parentElement;
    const dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
    table.querySelectorAll("th").forEach(h => h.removeAttribute("aria-sort"));
    th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
    const text = row => row.cells[col].textContent.trim().replace(/^~\s*/, "");   // "~20" sorts as 20
    [...body.rows].sort((a, b) => {
      const x = text(a), y = text(b);
      if (!x || !y) return !x - !y;             // blanks always last
      return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) * dir;
    }).forEach(row => body.append(row));
  }));
}
for (const bar of document.querySelectorAll(".filters")) {
  const rows = [...document.querySelectorAll("table.sortable tbody tr")], input = $(".filter", bar), shown = $(".shown", bar);
  const picks = [...bar.querySelectorAll("select")];
  const apply = () => {
    const q = fold(input.value.trim());
    rows.forEach(r => {
      r.hidden = !fold(r.textContent).includes(q)
        || picks.some(s => s.value && !(r.getAttribute("data-" + s.dataset.filter) ?? "").split("|").includes(s.value));
    });
    if (shown) shown.textContent = q || picks.some(s => s.value) ? `${rows.filter(r => !r.hidden).length} of ${rows.length}` : "";
  };
  bar.addEventListener("input", apply);
  apply();
}

// ---- Daily boxes on the home page ----
for (const box of document.querySelectorAll(".daily")) {
  const pool = JSON.parse($("script", box).textContent), now = new Date();
  // Days since a fixed date, in the reader's own time; stepping by a large prime goes through them all in a mixed order.
  const day = Math.floor((now - now.getTimezoneOffset() * 6e4) / 864e5);
  let n = day * 7919 % pool.length;
  const show = () => { $("div", box).innerHTML = pool[n]; };   // built from the notes, like every article
  $("button", box).hidden = pool.length < 2;
  $("button", box).addEventListener("click", () => { n = (n + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length; show(); });
  show();
}

// ---- Connections ----
const web = $(".connections");
if (web) web.addEventListener("toggle", async () => {
  if (!web.open || $(".web", web)) return;
  const stamp = new URL($("script[src*='theme/script.js']").src).search;
  const get = src => new Promise((done, fail) => document.head.append(Object.assign(document.createElement("script"), { src: root + src + stamp, onload: done, onerror: fail })));
  try {
    const [index] = await Promise.all([loadIndex(), get("links.js"), get("theme/connections.js")]);
    if (!$(".web", web)) drawConnections(web, index, window.WIKI_LINKS);
  } catch { web.append("Could not be loaded."); }
});

// ---- Pronunciations ----
for (const b of document.querySelectorAll(".say")) b.addEventListener("click", () => new Audio(b.dataset.src).play());

// ---- Swiping between articles on phones ----
{
  let start = null;
  const main = $("main"), scrolls = el => {
    for (; el && el !== main; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    return false;
  };
  main.addEventListener("touchstart", e => {
    start = e.touches.length === 1 && !e.target.closest(".atlas, input, select") && !scrolls(e.target)
      ? [e.touches[0].clientX, e.touches[0].clientY, Date.now()] : null;
  }, { passive: true });
  main.addEventListener("touchend", e => {
    if (!start || String(getSelection())) return;
    const dx = e.changedTouches[0].clientX - start[0], dy = e.changedTouches[0].clientY - start[1];
    if (Math.abs(dx) > 90 && Math.abs(dy) < 45 && Date.now() - start[2] < 500)
      document.querySelector(`.neighbours a[rel="${dx < 0 ? "next" : "prev"}"]`)?.click();
  }, { passive: true });
}

// ---- Family trees ----
const families = [...document.querySelectorAll(".family")];
if (families.length) {
  const s = document.createElement("script");
  s.src = root + "theme/familytree.js" + new URL($("script[src*='theme/script.js']").src).search;
  s.onload = () => families.forEach(figure => {
    const names = $(".diagram-names", figure), links = new Map();
    for (const li of names.children) links.set(li.dataset.name, $("a", li));
    figure.append(FamilyTree.render($("pre", figure).textContent, {
      subject: $("h1").textContent.trim(),
      link: p => {
        const a = links.get(p.key)?.cloneNode(true);
        if (a) a.textContent = p.label;
        return a ?? null;
      },
    }));
    names.hidden = true;
  });
  document.head.append(s);
}

// ---- Diagrams ----
// The drawing code is fetched only on pages that have a diagram. The checksum
// makes the browser refuse it if the file is ever altered.
const MERMAID = {
  src: "https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js",
  integrity: "sha384-zkWMJO4sgpPUzyuOgDx8HB/K55glbAwajEpk1Go2NWRuPkPA/wIhoEJTuSkmOYrV",
  crossOrigin: "anonymous",
};
const diagrams = [...document.querySelectorAll(".diagram")];
async function draw(figure, n) {
  const { svg } = await mermaid.render(`diagram-${n}`, $("pre", figure).textContent);
  const names = $(".diagram-names", figure);
  const links = new Map([...names.querySelectorAll("a")].map(a => [a.textContent.trim().toLowerCase(), a]));
  const holder = document.createElement("div");
  holder.innerHTML = svg;
  for (const label of holder.querySelectorAll(".node .nodeLabel")) {
    const link = links.get(label.textContent.trim().toLowerCase());
    if (link) (label.querySelector("p") ?? label).replaceChildren(link.cloneNode(true));
  }
  // Shrinks a little to fit; anything wider scrolls sideways.
  const art = $("svg", holder);
  art.style.minWidth = `${art.viewBox.baseVal.width * .75}px`;
  figure.append(holder);
  names.hidden = true;
}
function loadDiagrams(tries) {
  const s = Object.assign(document.createElement("script"), MERMAID);
  s.onload = async () => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral",
      fontFamily: getComputedStyle(document.body).fontFamily, flowchart: { useMaxWidth: false, curve: "step" } });
    // A collapsed callout has no size to measure, so its diagram waits until it is opened.
    for (const [n, figure] of diagrams.entries()) {
      const fold = figure.closest("details:not([open])");
      const go = () => draw(figure, n).catch(e => console.warn("Diagram not drawn:", e));
      if (fold) fold.addEventListener("toggle", go, { once: true }); else await go();
    }
  };
  s.onerror = () => { if (tries > 1) setTimeout(loadDiagrams, 1500, tries - 1); };   // the names stay listed
  document.head.append(s);
}
if (diagrams.length) loadDiagrams(3);

// ---- Menu and theme ----
$(".menu").addEventListener("click", e => {
  const open = $(".sidebar").classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", open);
});
$(".theme").addEventListener("click", () => {
  const el = document.documentElement;
  const dark = el.dataset.theme ? el.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  el.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", el.dataset.theme); } catch {}
});

// ---- Reading settings ----
{
  const panel = $(".reading .panel"), button = $(".aa");
  const open = on => { panel.hidden = !on; button.setAttribute("aria-expanded", on); };
  button.addEventListener("click", () => open(panel.hidden));
  document.addEventListener("click", e => { if (!e.target.closest(".reading")) open(false); });
  panel.addEventListener("keydown", e => { if (e.key === "Escape") { open(false); button.focus(); } });
  for (const s of panel.querySelectorAll("select")) {
    s.value = document.documentElement.dataset[s.dataset.set] ?? "";
    s.addEventListener("change", () => {
      if (s.value) document.documentElement.dataset[s.dataset.set] = s.value; else delete document.documentElement.dataset[s.dataset.set];
      try { localStorage.setItem(s.dataset.set, s.value); } catch {}
    });
  }
}
