// "How are they related?": works out what one person is to another.
const Kinship = (() => {
  const pick = (g, m, f, n) => g === "m" ? m : g === "f" ? f : n;
  const great = n => n <= 0 ? "" : n === 1 ? "great-" : n === 2 ? "great-great-" : `${n}x great-`;
  const nth = n => ["", "first", "second", "third", "fourth", "fifth", "sixth"][n] ?? `${n}th`;
  const times = n => n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;

  // What someone is, a steps below a shared ancestor, to someone b steps below them.
  function term(a, b, g, half) {
    const h = half ? "half-" : "";
    if (a === 0 && b === 1) return pick(g, "father", "mother", "parent");
    if (a === 0) return great(b - 2) + pick(g, "grandfather", "grandmother", "grandparent");
    if (b === 0 && a === 1) return pick(g, "son", "daughter", "child");
    if (b === 0) return great(a - 2) + pick(g, "grandson", "granddaughter", "grandchild");
    if (a === 1 && b === 1) return h + pick(g, "brother", "sister", "sibling");
    if (a === 1) return h + great(b - 2) + pick(g, "uncle", "aunt", "aunt or uncle");
    if (b === 1) return h + great(a - 2) + pick(g, "nephew", "niece", "niece or nephew");
    const apart = Math.abs(a - b);
    return `${h}${nth(Math.min(a, b) - 1)} cousin${apart ? ` ${times(apart)} removed` : ""}`;
  }

  function load(data) {
    const n = data.people.length, up = Array.from({ length: n }, () => []), down = Array.from({ length: n }, () => []);
    const wed = Array.from({ length: n }, () => []), other = Array.from({ length: n }, () => []);
    for (const [c, p, s] of data.parents) { up[c].push([p, s]); down[p].push([c, s]); }
    for (const [x, y, s] of data.unions) { wed[x].push([y, s]); wed[y].push([x, s]); }
    for (const [ward, g] of data.wards) { other[ward].push([g, "guardian"]); other[g].push([ward, "ward"]); }
    for (const [x, y, r] of data.relatives) { other[x].push([y, r || "relative"]); other[y].push([x, "relative"]); }
    const halves = new Set(data.half.map(h => h.join()));
    const name = i => data.people[i][0], sex = i => data.people[i][2];

    // Every ancestor, with the shortest line up to them. Lines by blood come before suspected or adopted ones.
    function ancestors(x, loose) {
      const found = new Map([[x, { line: [x], marks: [] }]]), queue = [x];
      while (queue.length) {
        const k = queue.shift(), at = found.get(k);
        for (const [p, s] of up[k]) {
          if (found.has(p) || (s && !loose)) continue;
          found.set(p, { line: [...at.line, p], marks: s ? [...at.marks, s] : at.marks });
          queue.push(p);
        }
      }
      return found;
    }
    function isHalf(x, y) {                       // x, y: the two children where the lines part
      if (halves.has([Math.min(x, y), Math.max(x, y)].join())) return true;
      const real = k => up[k].filter(([p, s]) => !s && name(p) !== "an unnamed parent").map(([p]) => p);
      const a = real(x), b = real(y);
      return a.length > 1 && b.length > 1 && a.filter(p => b.includes(p)).length === 1;
    }
    function blood(x, y) {
      for (const loose of [false, true]) {
        const a = ancestors(x, loose), b = ancestors(y, loose);
        let best = null;
        for (const [k, va] of a) {
          const vb = b.get(k);
          if (!vb) continue;
          const far = va.line.length + vb.line.length;
          if (!best || far < best.far) best = { far, k, va, vb };
        }
        if (best) {
          const { va, vb } = best, la = va.line, lb = vb.line;
          const half = la.length > 1 && lb.length > 1 && isHalf(la.at(-2), lb.at(-2));
          const marks = [...new Set([...va.marks, ...vb.marks])];
          let word = term(la.length - 1, lb.length - 1, sex(x), half);
          if (marks.includes("adopted")) word = word === "father" || word === "mother" || word === "parent" ? "adoptive " + word : "adopted " + word;
          return { word, unsure: marks.includes("suspected"), line: [...la, ...lb.slice(0, -1).reverse()], weight: la.length + lb.length };
        }
      }
      return null;
    }
    const spouse = (i, s) => s === "" ? pick(sex(i), "husband", "wife", "spouse") : s === "rumored" ? "rumored lover" : "lover";
    const union = (x, y) => wed[x].find(([k]) => k === y)?.[1];

    // What x is to y: { word, by, line }. "by" is the in-law in the middle.
    function relate(x, y) {
      const s = union(x, y);
      const b = blood(x, y), out = [];
      if (b) out.push({ text: `${b.unsure ? "suspected " : ""}${b.word}`, line: b.line });
      if (s !== undefined) out.unshift({ text: spouse(x, s), line: [x, y] });
      const tie = other[y].find(([k]) => k === x);
      if (tie) out.push({ text: tie[1], line: [x, y] });
      if (out.length) return out;
      let best = null;
      const take = c => { if (!best || c.weight < best.weight) best = c; };
      for (const [m, st] of wed[x]) {                          // married to a relation of y
        const r = blood(m, y);
        if (r) take({ weight: r.weight + (st ? 2 : 0), text: inlaw(x, st, r, "by"), or: [spouse(x, st), m, r], line: [x, ...r.line] });
      }
      for (const [m, st] of wed[y]) {                          // a relation of y's spouse
        const r = blood(x, m);
        if (r) take({ weight: r.weight + (st ? 2 : 0), text: inlaw(x, st, r, "of"), or: [r.word, m, { word: spouse(y, st) }], line: [...r.line, y] });
      }
      if (best) {
        const [first, m, second] = best.or;
        return [{ text: best.text || `${first} of ${name(m)}`, then: best.text ? "" : `${name(m)} is the ${second.word} of ${name(y)}`, line: best.line }];
      }
      const line = chain(x, y);                                // longer chains would tie nearly everyone together
      return line && line.length <= 4 ? [{ text: "", line }] : [];
    }
    function inlaw(x, st, r, way) {                            // the few with a word of their own
      if (st || r.unsure) return "";
      const g = sex(x), w = r.word;
      if (way === "by") {
        if (/^(son|daughter|child)$/.test(w)) return pick(g, "son-in-law", "daughter-in-law", "child-in-law");
        if (/^(brother|sister|sibling)$/.test(w)) return pick(g, "brother-in-law", "sister-in-law", "sibling-in-law");
        if (/^(father|mother|parent)$/.test(w)) return pick(g, "stepfather", "stepmother", "stepparent");
        if (/^(uncle|aunt|aunt or uncle)$/.test(w)) return pick(g, "uncle", "aunt", "aunt or uncle") + " by marriage";
      } else {
        if (/^(father|mother|parent)$/.test(w)) return w + "-in-law";
        if (/^(brother|sister|sibling)$/.test(w)) return w + "-in-law";
        if (/^(son|daughter|child)$/.test(w)) return "step" + w;
        if (/^(nephew|niece|niece or nephew)$/.test(w)) return w + " by marriage";
      }
      return "";
    }
    function chain(x, y) {                                     // any ties at all, shortest first
      const from = new Map([[x, null]]), queue = [x];
      while (queue.length) {
        const k = queue.shift();
        if (k === y) break;
        for (const [m] of [...up[k], ...down[k], ...wed[k], ...other[k]]) if (!from.has(m)) { from.set(m, k); queue.push(m); }
      }
      if (!from.has(y)) return null;
      const line = [];
      for (let k = y; k !== null; k = from.get(k)) line.unshift(k);
      return line;
    }
    function step(x, y) {                                      // what y is to x, for the drawn line
      const mark = s => s === "suspected" ? "suspected " : s === "adopted" ? "adoptive " : "";
      const p = up[x].find(([k]) => k === y), c = down[x].find(([k]) => k === y);
      if (p) return mark(p[1]) + pick(sex(y), "father", "mother", "parent");
      if (c) return mark(c[1]).replace("adoptive", "adopted") + pick(sex(y), "son", "daughter", "child");
      const s = union(x, y);
      if (s !== undefined) return spouse(y, s);
      return other[x].find(([k]) => k === y)?.[1] ?? "";
    }
    return { relate, step, people: data.people };
  }
  return { load, term };
})();

if (typeof document !== "undefined" && window.WIKI_KIN) {
  const kin = Kinship.load(window.WIKI_KIN), form = document.querySelector(".relate"), out = document.querySelector(".related");
  const flat = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").toLowerCase().trim();
  const index = new Map();
  kin.people.forEach((p, i) => { if (p[3] && !index.has(flat(p[0]))) index.set(flat(p[0]), i); });
  const person = i => {
    const [name, url] = kin.people[i];
    const el = document.createElement(url ? "a" : "span");
    if (url) { el.href = url; el.className = "wikilink"; }
    el.textContent = name;
    return el;
  };
  const say = (...parts) => { const p = document.createElement("p"); p.append(...parts); return p; };
  function answer() {
    const a = index.get(flat(form.a.value)), b = index.get(flat(form.b.value));
    out.replaceChildren();
    if (a === undefined || b === undefined) return;
    if (a === b) return out.append(say("That's the same person."));
    history.replaceState(null, "", `#${encodeURIComponent(form.a.value)}/${encodeURIComponent(form.b.value)}`);
    const found = kin.relate(a, b);
    if (!found.length) return out.append(say("No close tie between them is recorded."));
    for (const r of found) {
      const main = r.text
        ? r.then ? say(person(a), ` is the ${r.text}, and ${r.then}.`) : say(person(a), " is the ", strong(r.text), " of ", person(b), ".")
        : say("They're tied this way:");
      main.className = "verdict";
      const line = document.createElement("ol");
      line.className = "kin-line";
      r.line.forEach((k, n) => {
        const li = document.createElement("li");
        if (n) {
          const small = document.createElement("small");
          small.textContent = kin.step(r.line[n - 1], k);
          li.append(small);
        }
        li.append(person(k));
        line.append(li);
      });
      out.append(main, line);
    }
  }
  function strong(text) { const el = document.createElement("strong"); el.textContent = text; return el; }
  form.addEventListener("input", answer);
  form.addEventListener("submit", e => { e.preventDefault(); answer(); });
  form.querySelector(".swap").addEventListener("click", () => { [form.a.value, form.b.value] = [form.b.value, form.a.value]; answer(); });
  const [a, b] = location.hash.slice(1).split("/").map(decodeURIComponent);
  if (a && b) { form.a.value = a; form.b.value = b; answer(); }
}
