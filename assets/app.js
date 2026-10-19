/* EMCC incident dashboard — static site, live data from ArcGIS with a bundled fallback. */
(() => {
  'use strict';

  const SERVICE = 'https://services5.arcgis.com/XbJa06Lil6auloCa/arcgis/rest/services/Emergency_Case/FeatureServer/0/query';
  const FALLBACK = 'data/emergency_case.json';
  const PAGE = 1000;

  const FIRE = 'เพลิงไหม้';
  const TYPES = [FIRE, 'ระเบิด', 'สารเคมีรั่วไหล', 'อุบัติเหตุ', 'อื่นๆ'];
  const TYPE_VAR = { 'เพลิงไหม้': '--t-fire', 'ระเบิด': '--t-blast', 'สารเคมีรั่วไหล': '--t-chem', 'อุบัติเหตุ': '--t-acc', 'อื่นๆ': '--t-other' };
  const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
  const SLOTS = ['08.00 - 15.59 น.', '16.00 - 23.59 น.', '00.00 - 07.59 น.'];
  const QLABEL = { 1: 'ต.ค.–ธ.ค.', 2: 'ม.ค.–มี.ค.', 3: 'เม.ย.–มิ.ย.', 4: 'ก.ค.–ก.ย.' };

  const css = getComputedStyle(document.documentElement);
  const cv = (name) => css.getPropertyValue(name).trim();
  const typeColor = (t) => cv(TYPE_VAR[t] || '--t-other');
  const fmt = d3.format(',');
  const fmt1 = d3.format(',.1f');
  const pct = d3.format('.0%');
  const pct1 = d3.format('.1%');
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const NS = 'http://www.w3.org/2000/svg';

  const state = { fy: 'all', q: 'all', type: 'all', estate: 'all', sortKey: 'case', sortDir: -1, search: '' };
  let rows = [];
  let currentTypes = [];
  let fys = [];

  // ---------- data ----------
  const txt = (v) => { const s = String(v ?? '').replace(/ /g, ' ').trim(); return s && s !== '-' ? s : null; };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  function normalize(r) {
    const mi = parseInt(txt(r['เดือน']) || '', 10);
    let slot = txt(r['Rank_เวลา']);
    if (slot && slot.startsWith('24.00')) slot = '00.00 - 07.59 น.';
    const op = txt(r['ขณะเกิดเหตุมีการประกอบกิจการหรือไม่']);
    const resp = Number(r['เวลาระงับเหตุ']);
    return {
      raw: r,
      case: num(r.Case_),
      fy: r['ปีงบประมาณ'] != null ? String(r['ปีงบประมาณ']) : null,
      q: r['ไตรมาส'] != null ? String(r['ไตรมาส']) : null,
      month: mi >= 1 && mi <= 12 ? MONTHS[mi - 1] : null,
      type: txt(r['เหตุการณ์ที่เกิด']) || 'ไม่ระบุ',
      company: txt(r['บริษัท']) || '',
      estate: txt(r['สถานที่ตั้ง']),
      line: r['สายปฏิบัติการ'] != null ? String(r['สายปฏิบัติการ']) : null,
      slot,
      ftype: txt(r['Rank_ประเภทโรงงาน']),
      cause: txt(r['สาเหตุ']) || '',
      date: txt(r['วันที่']) || '',
      time: txt(r['เวลา']) || '',
      inj: num(r['จำนวนผู้บาดเจ็บ']),
      dead: num(r['จำนวนผู้เสียชีวิต']),
      // operating at the time: true / false / null (unknown)
      operating: op == null ? null : /^มีี?$/.test(op) ? true : /ไม่|เลิก|หยุด/.test(op) ? false : null,
      resp: Number.isFinite(resp) && resp > 0 ? resp : null,
      lat: Number(r.Latitude),
      lon: Number(r.Longitude),
    };
  }

  async function fetchLive() {
    const out = [];
    for (let offset = 0; offset < 50000; offset += PAGE) {
      const p = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'false', orderByFields: 'ObjectId', resultOffset: String(offset), resultRecordCount: String(PAGE), f: 'json' });
      const res = await fetch(`${SERVICE}?${p}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || 'ArcGIS error');
      const feats = j.features || [];
      out.push(...feats.map((f) => f.attributes));
      if (!j.exceededTransferLimit && feats.length < PAGE) break;
      if (!feats.length) break;
    }
    return out;
  }
  async function fetchFallback() {
    const res = await fetch(FALLBACK, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (Array.isArray(j)) return j;
    if (j.features) return j.features.map((f) => f.properties || f.attributes);
    return [];
  }
  function setStatus(kind, text) {
    $('status-dot').className = 'dot ' + kind;
    $('status-text').textContent = text;
  }
  async function load() {
    setStatus('', 'กำลังโหลดข้อมูล…');
    $('refresh').classList.add('spin');
    const time = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    try {
      const live = await fetchLive();
      if (!live.length) throw new Error('empty');
      rows = live.map(normalize);
      setStatus('live', `ข้อมูลสดจาก ArcGIS · ${fmt(rows.length)} เหตุ · ${time}`);
    } catch (e) {
      try {
        rows = (await fetchFallback()).map(normalize);
        setStatus('backup', `ใช้ไฟล์ข้อมูลสำรอง · ${fmt(rows.length)} เหตุ`);
      } catch (e2) {
        rows = [];
        setStatus('err', 'โหลดข้อมูลไม่สำเร็จ');
      }
    }
    $('refresh').classList.remove('spin');
    render();
  }
  $('refresh').addEventListener('click', load);

  // ---------- helpers ----------
  const filtered = (opt = {}) => rows.filter((r) =>
    (opt.ignoreFy || state.fy === 'all' || r.fy === state.fy) &&
    (state.q === 'all' || r.q === state.q) &&
    (opt.ignoreType || state.type === 'all' || r.type === state.type) &&
    (opt.ignoreEstate || state.estate === 'all' || r.estate === state.estate) &&
    (opt.fy == null || r.fy === opt.fy));
  const countBy = (list, key) => d3.rollup(list.filter((r) => r[key] != null), (v) => v.length, (r) => r[key]);
  const sum = (list, k) => d3.sum(list, (r) => r[k]);
  const median = (list) => d3.median(list.filter((r) => r.resp != null), (r) => r.resp);
  const set = (patch) => { Object.assign(state, patch); render(); };

  // tooltip
  const tip = $('tip');
  function showTip(ev, head, lines) {
    tip.replaceChildren(el('div', 'h', head));
    for (const [c, name, val] of lines) {
      const r = el('div', 'r');
      if (c) { const s = el('span', 'sw'); s.style.background = c; r.append(s); }
      if (name) r.append(el('span', null, name));
      r.append(el('b', null, val));
      tip.append(r);
    }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY - h - 10;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
    if (y < 8) y = ev.clientY + 16;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  addEventListener('scroll', hideTip, { passive: true });

  // ---------- header controls ----------
  $('fy-prev').addEventListener('click', () => {
    const i = state.fy === 'all' ? fys.length : fys.indexOf(state.fy);
    if (i > 0) set({ fy: fys[i - 1] });
  });
  $('fy-next').addEventListener('click', () => {
    if (state.fy === 'all') return;
    const i = fys.indexOf(state.fy);
    set({ fy: i < fys.length - 1 ? fys[i + 1] : 'all' });
  });
  $('f-type').addEventListener('change', (e) => set({ type: e.target.value }));
  $('f-estate').addEventListener('change', (e) => set({ estate: e.target.value }));
  $('reset').addEventListener('click', () => set({ fy: 'all', q: 'all', type: 'all', estate: 'all' }));

  // nav pills: smooth scroll + highlight the section in view
  const navs = [...document.querySelectorAll('[data-nav]')];
  navs.forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href')).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => { if (en.isIntersecting) navs.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id)); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['overview', 'map-section', 'cases-section'].forEach((id) => io.observe($(id)));
  }

  function drawControls(types) {
    $('fy-val').textContent = state.fy === 'all' ? 'ทุกปี' : state.fy;
    $('fy-prev').disabled = state.fy === fys[0];
    $('fy-next').disabled = state.fy === 'all';
    const qs = $('f-q');
    qs.replaceChildren(...['all', '1', '2', '3', '4'].map((q) => {
      const b = el('button', 'qbtn'); b.type = 'button';
      b.setAttribute('aria-pressed', state.q === q ? 'true' : 'false');
      b.append(el('span', 'pick-k', q === 'all' ? 'ไตรมาส' : QLABEL[q]), el('span', 'pick-v', q === 'all' ? 'ทั้งปี' : 'Q' + q));
      b.addEventListener('click', () => set({ q }));
      return b;
    }));
    const ts = $('f-type');
    const tc = countBy(filtered({ ignoreType: true }), 'type');
    ts.replaceChildren(new Option('ทั้งหมด', 'all'), ...types.map((t) => new Option(`${t} (${fmt(tc.get(t) || 0)})`, t)));
    ts.value = state.type;
    ts.parentElement.classList.toggle('on', state.type !== 'all');
    const es = $('f-estate');
    const ec = countBy(filtered({ ignoreEstate: true }), 'estate');
    const names = [...new Set(rows.map((r) => r.estate).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    es.replaceChildren(new Option(`ทุกนิคม (${fmt(names.length)} แห่ง)`, 'all'), ...names.map((n) => new Option(`${n} (${fmt(ec.get(n) || 0)})`, n)));
    es.value = state.estate;
    es.parentElement.classList.toggle('on', state.estate !== 'all');
    $('reset').hidden = state.fy === 'all' && state.q === 'all' && state.type === 'all' && state.estate === 'all';
  }

  // ---------- charts ----------
  const ARROW_UP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 11.5l7-7M5.5 4.5h6v6"/></svg>';
  const ARROW_DN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 4.5l7 7M11.5 5.5v6h-6"/></svg>';

  /* column with 4px rounded top, square at the baseline */
  function col(svg, x, base, w, h, fill) {
    const r = Math.min(4, w / 2, h);
    return svg.append('path').attr('fill', fill)
      .attr('d', h <= 0 ? '' : `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + w - r}Q${x + w},${base - h} ${x + w},${base - h + r}V${base}Z`);
  }

  /* Yearly column chart: grey for other years, teal for the selected year (charcoal when all
     years are shown), and a dot under each column — red up / green down vs the year before. */
  function yearBars(box, data, fmtV, unit) {
    box.replaceChildren();
    if (!data.length) return;
    const W = Math.max(240, box.clientWidth), H = 150, top = 16, dotY = H - 26, base = dotY - 12;
    const x = d3.scaleBand(data.map((d) => d.y), [0, W]).padding(0.16);
    const max = d3.max(data, (d) => d.v) || 1;
    const y = d3.scaleLinear([0, max], [base, top]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    data.forEach((d, i) => {
      const sel = state.fy !== 'all' && d.y === state.fy;
      const fill = state.fy === 'all' ? cv('--bar') : sel ? cv('--bar-hi') : cv('--past');
      const h = Math.max(d.v ? 2 : 0, base - y(d.v));
      col(svg, x(d.y), base, x.bandwidth(), h, fill);
      if (sel || (state.fy === 'all' && x.bandwidth() > 24)) {
        svg.append('text').attr('x', x(d.y) + x.bandwidth() / 2).attr('y', base - h - 4).attr('text-anchor', 'middle')
          .attr('font-size', 12).attr('font-weight', 600).attr('fill', cv('--fg')).text(fmtV(d.v));
      }
      const prev = i ? data[i - 1].v : null;
      const dc = prev == null || d.v === prev ? cv('--past') : d.v > prev ? cv('--red') : cv('--green');
      svg.append('circle').attr('cx', x(d.y) + x.bandwidth() / 2).attr('cy', dotY).attr('r', 4).attr('fill', dc);
      svg.append('text').attr('x', x(d.y) + x.bandwidth() / 2).attr('y', H - 4).attr('text-anchor', 'middle')
        .attr('font-size', 12.5).attr('fill', sel ? cv('--fg') : cv('--faint')).attr('font-weight', sel ? 700 : 400).text(d.y.slice(-2));
      svg.append('rect').attr('x', x(d.y) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', 0).attr('height', H).attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .on('mousemove', (ev) => {
          const lines = [[null, '', `${fmtV(d.v)} ${unit}`]];
          if (prev != null) lines.push([dc, 'เทียบปีก่อน', `${d.v - prev > 0 ? '+' : ''}${fmtV(d.v - prev)}`]);
          showTip(ev, `ปีงบประมาณ ${d.y}`, lines);
        })
        .on('mouseleave', hideTip)
        .on('click', () => { hideTip(); set({ fy: state.fy === d.y ? 'all' : d.y }); });
    });
  }

  /* metric block: title + trend arrow, big value, "previous year" line, yearly bars */
  function metric(box, o) {
    box.replaceChildren();
    const head = el('div', 'm-head');
    head.append(el('span', 'm-title', o.title));
    let delta = null;
    if (o.prev != null && o.cur != null) delta = o.cur - o.prev;
    if (delta != null) {
      const a = el('span', 'arrow ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'));
      a.innerHTML = delta >= 0 ? ARROW_UP : ARROW_DN;
      a.title = delta > 0 ? 'เพิ่มขึ้นจากปีก่อน' : delta < 0 ? 'ลดลงจากปีก่อน' : 'เท่ากับปีก่อน';
      head.append(a);
    }
    const val = el('div', 'm-val');
    val.append(el('b', null, o.cur == null ? '—' : o.fmt(o.cur)), document.createTextNode(o.unit + (o.extra || '')));
    const pm = el('div', 'm-pm');
    if (delta != null) {
      const ch = o.prev ? delta / o.prev : null;
      pm.append(document.createTextNode(`ปีงบ ${o.prevFy}: ${o.fmt(o.prev)} | `),
        el('span', delta > 0 ? 'up' : delta < 0 ? 'down' : null, ch == null ? (delta > 0 ? `+${o.fmt(delta)}` : '—') : `${delta > 0 ? '+' : ''}${pct1(ch)}`));
    } else {
      pm.textContent = o.note || '';
    }
    const ch = el('div', 'm-chart');
    box.append(head, val, pm, ch);
    yearBars(ch, o.series, o.fmt, o.unit.trim());
  }

  /* monthly columns for the fiscal year order; dots compare with the same month a year earlier */
  function monthBars(box, cur, prevMap, months) {
    box.replaceChildren();
    const W = Math.max(240, box.clientWidth), H = 170, top = 16, dotY = H - 26, base = dotY - 12;
    const vals = months.map((m) => cur.get(m) || 0);
    if (!d3.sum(vals)) { box.append(el('div', 'empty', 'ไม่มีเหตุในช่วงที่เลือก')); return; }
    const x = d3.scaleBand(months, [0, W]).padding(0.16);
    const y = d3.scaleLinear([0, d3.max(vals)], [base, top]);
    const mx = d3.max(vals);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    months.forEach((m, i) => {
      const v = vals[i], h = Math.max(v ? 2 : 0, base - y(v));
      col(svg, x(m), base, x.bandwidth(), h, v === mx ? cv('--bar-hi') : cv('--bar'));
      if (v) svg.append('text').attr('x', x(m) + x.bandwidth() / 2).attr('y', base - h - 4).attr('text-anchor', 'middle').attr('font-size', 12).attr('font-weight', 600).attr('fill', cv('--fg')).text(v);
      let dc = cv('--past'), pv = null;
      if (prevMap) { pv = prevMap.get(m) || 0; dc = v === pv ? cv('--past') : v > pv ? cv('--red') : cv('--green'); }
      svg.append('circle').attr('cx', x(m) + x.bandwidth() / 2).attr('cy', dotY).attr('r', 4).attr('fill', dc);
      if (x.step() >= 30 || i % 2 === 0) svg.append('text').attr('x', x(m) + x.bandwidth() / 2).attr('y', H - 4).attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', cv('--faint')).text(m);
      svg.append('rect').attr('x', x(m) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', 0).attr('height', H).attr('fill', 'transparent')
        .on('mousemove', (ev) => showTip(ev, m, pv == null ? [[null, '', `${v} ครั้ง`]] : [[null, '', `${v} ครั้ง`], [dc, `ปีก่อน`, `${pv} ครั้ง`]]))
        .on('mouseleave', hideTip);
    });
  }

  /* horizontal bars: label at left, thin bar, value right after the bar */
  function hbars(box, items, opt = {}) {
    const max = d3.max(items, (d) => d.n) || 1;
    const wrap = el('div', 'hbars');
    for (const d of items) {
      const row = el(opt.onClick ? 'button' : 'div', 'hb');
      if (opt.onClick) {
        row.type = 'button'; row.classList.add('click');
        row.addEventListener('click', () => opt.onClick(d));
        if (opt.selected) { row.classList.add(d.label === opt.selected ? 'sel' : 'dim'); row.setAttribute('aria-pressed', d.label === opt.selected ? 'true' : 'false'); }
      }
      const l = el('span', 'l', d.label); l.title = d.label;
      const t = el('span', 't'); const f = el('span', 'f');
      const w = d.n / max;
      const lab = el('span', 'v', fmt(d.n));
      if (opt.total) lab.append(el('small', null, pct(d.n / opt.total)));
      f.style.width = `max(3px, calc(${w} * (100% - ${opt.total ? 5 : 2.6}rem)))`;
      if (d.color) f.style.background = d.color;
      t.append(f, lab);
      row.append(l, t); wrap.append(row);
    }
    box.replaceChildren(items.length ? wrap : el('div', 'empty', 'ไม่มีเหตุในช่วงที่เลือก'));
  }

  /* donut + legend (time of day) */
  function donut(box, items, total) {
    box.replaceChildren();
    if (!total) { box.append(el('div', 'empty', 'ไม่มีเหตุในช่วงที่เลือก')); return; }
    const colors = [cv('--t-day'), cv('--t-eve'), cv('--t-night')];
    const wrap = el('div', 'donut');
    const S = 150, R = 70, r = 46;
    const svg = d3.select(wrap).append('svg').attr('viewBox', `0 0 ${S} ${S}`).attr('class', 'donut-svg');
    const g = svg.append('g').attr('transform', `translate(${S / 2},${S / 2})`);
    const arcs = d3.pie().sort(null).value((d) => d.n)(items);
    const arc = d3.arc().innerRadius(r).outerRadius(R);
    arcs.forEach((a, i) => {
      g.append('path').attr('d', arc(a)).attr('fill', colors[i]).attr('stroke', '#fff').attr('stroke-width', 2)
        .on('mousemove', (ev) => showTip(ev, a.data.label, [[colors[i], '', `${fmt(a.data.n)} ครั้ง · ${pct1(a.data.n / total)}`]]))
        .on('mouseleave', hideTip);
    });
    g.append('text').attr('text-anchor', 'middle').attr('y', 4).attr('font-size', 24).attr('font-weight', 700).attr('fill', cv('--fg')).attr('font-family', cv('--font-num')).text(fmt(total));
    g.append('text').attr('text-anchor', 'middle').attr('y', 24).attr('font-size', 13).attr('fill', cv('--faint')).text('ครั้ง');
    const leg = el('div', 'donut-leg');
    items.forEach((d, i) => {
      const row = el('div', 'dl');
      const sw = el('span', 'sw'); sw.style.background = colors[i];
      const t = el('div'); t.append(el('div', 'dl-l', d.label), el('div', 'dl-v', `${fmt(d.n)} ครั้ง · ${pct1(d.n / total)}`));
      row.append(sw, t); leg.append(row);
    });
    wrap.append(leg);
    box.append(wrap);
  }

  /* small progress rings */
  function rings(box, items) {
    box.replaceChildren(...items.map((it) => {
      const w = el('div', 'ring');
      w.append(el('div', 'ring-t', it.title));
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 92 92');
      const R = 36, C = 2 * Math.PI * R, p = it.den ? it.num / it.den : 0;
      svg.innerHTML = `<circle cx="46" cy="46" r="${R}" fill="none" stroke="${cv('--track')}" stroke-width="10"/>` +
        `<circle cx="46" cy="46" r="${R}" fill="none" stroke="${it.color}" stroke-width="10" stroke-linecap="${p > 0 && p < 1 ? 'round' : 'butt'}" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 46 46)"/>`;
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', '46'); t.setAttribute('y', '51'); t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '16'); t.setAttribute('font-weight', '700'); t.setAttribute('fill', cv('--fg'));
      t.textContent = it.den ? pct1(p) : '—';
      svg.append(t);
      w.append(svg, el('div', 'ring-s', it.den ? `${fmt(it.num)} จาก ${fmt(it.den)} เหตุ` : 'ไม่มีข้อมูล'));
      return w;
    }));
  }

  const validPt = (r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.lat > 5 && r.lat < 21 && r.lon > 97 && r.lon < 106;
  const PIN = '<svg class="pin" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

  /* table row → scroll to the map, fly to the incident, open its popup, ring it */
  function showOnMap(r) {
    focusCase = r.case;
    document.querySelectorAll('#tbody tr.focus').forEach((t) => t.classList.remove('focus'));
    const row = [...document.querySelectorAll('#tbody tr')].find((t) => t.dataset.case === String(r.case));
    if (row) row.classList.add('focus');
    if (!map || !validPt(r)) { showToast(`Case ${r.case} ไม่มีพิกัดในข้อมูล จึงแสดงบนแผนที่ไม่ได้`); return; }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('map-section').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    ringLayer.clearLayers();
    const ring = L.circleMarker([r.lat, r.lon], { radius: 22, color: cv('--hi'), weight: 3, fill: false, className: 'focus-ring', interactive: false });
    ring.addTo(ringLayer);
    const mk = markers.get(r.case);
    const go = () => {
      map.flyTo([r.lat, r.lon], Math.max(map.getZoom(), 15), { duration: reduce ? 0 : 1.2 });
      map.once('moveend', () => { if (mk) { mk.bringToFront(); mk.openPopup(); } });
    };
    setTimeout(go, reduce ? 0 : 350);
    $('map-focus').hidden = false;
    $('map-focus-text').textContent = `Case ${r.case} · ${r.company || 'ไม่ระบุบริษัท'} · ${r.date}`;
  }
  function clearFocus() {
    focusCase = null;
    if (ringLayer) ringLayer.clearLayers();
    if (map) map.closePopup();
    $('map-focus').hidden = true;
    document.querySelectorAll('#tbody tr.focus').forEach((t) => t.classList.remove('focus'));
    lastFitKey = '';
    drawMap(filtered(), currentTypes);
  }
  let toastT;
  function showToast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // ---------- estate parcels (EPP_2026_V1) ----------
  /* 18k land parcels, so they load per visible area from zoom PARCEL_ZOOM up, simplified by esri-leaflet. */
  const PARCELS = 'https://services5.arcgis.com/XbJa06Lil6auloCa/arcgis/rest/services/EPP_2026_V1/FeatureServer/0';
  const PARCEL_ZOOM = 13;
  const PARCEL_KINDS = [
    { key: 'ind', label: 'เขตอุตสาหกรรม', fill: '#9aa0a8', test: (d) => /อุตสาหกรรม|โรงงาน|คลังสินค้า|พาณิชย/.test(d) },
    { key: 'green', label: 'พื้นที่สีเขียว', fill: '#3c9a4e', test: (d) => /สีเขียว|สวน|แนวกันชน|buffer/i.test(d) },
    { key: 'util', label: 'สาธารณูปโภค / สำนักงาน', fill: '#3f6fb5', test: (d) => /สาธารณูปโภค|ราชการ|สำนักงาน|ถนน|บำบัด|ประปา/.test(d) },
    { key: 'other', label: 'อื่นๆ', fill: '#c9ccd1', test: () => true },
  ];
  const parcelKind = (d) => PARCEL_KINDS.find((k) => k.test(d || ''));
  let parcels = null, parcelLoading = false, parcelError = false;
  const parcelStroke = () => (bases.imagery && map.hasLayer(bases.imagery) ? '#ffffff' : '#4a4d52');
  function parcelStyle(f) {
    const k = parcelKind(f.properties.Discription);
    return { color: parcelStroke(), weight: 1, opacity: 0.85, fillColor: k.fill, fillOpacity: k.key === 'ind' ? 0.12 : 0.22 };
  }
  function parcelPopup(l) {
    const p = l.feature.properties, box = el('div');
    box.append(el('div', 'pop-h', p.IEAT ? `นิคมฯ ${p.IEAT}` : 'ขอบเขตนิคมอุตสาหกรรม'));
    const add = (k, v) => { if (v && String(v).trim()) { const d = el('div', 'pop-m'); d.append(el('b', null, k + ' '), document.createTextNode(String(v).trim())); box.append(d); } };
    add('แปลง', p.Name_Parcel);
    add('การใช้ที่ดิน', p.Discription);
    add('ผู้ประกอบการ', p.mercant_name);
    add('ประเภทกิจการ', p.factory_work_desc);
    add('สถานะ', p.build_status);
    return box;
  }
  function parcelNote() {
    const n = $('parcel-note');
    if (!map || !parcels) { n.textContent = ''; return; }
    if (!$('parcels-on').checked) { n.textContent = ''; return; }
    if (parcelError) { n.textContent = 'โหลดขอบเขตนิคมฯ ไม่ได้ในขณะนี้'; return; }
    if (map.getZoom() < PARCEL_ZOOM) { n.textContent = 'ซูมเข้าใกล้นิคมฯ (หรือเลือกนิคมฯ ในตัวกรอง) เพื่อดูขอบเขตแปลงที่ดิน'; return; }
    n.replaceChildren(el('span', null, parcelLoading ? 'กำลังโหลดขอบเขตนิคมฯ…' : 'ขอบเขตนิคมฯ:'),
      ...PARCEL_KINDS.map((k) => { const s = el('span', 'pk'); const w = el('span', 'ps'); w.style.background = k.fill + '55'; s.append(w, document.createTextNode(k.label)); return s; }));
  }
  function initParcels() {
    if (!L.esri) return;
    map.createPane('parcels').style.zIndex = 350; // below incident points (overlayPane = 400)
    parcels = L.esri.featureLayer({
      url: PARCELS, pane: 'parcels', minZoom: PARCEL_ZOOM, simplifyFactor: 0.35, precision: 6,
      fields: ['OBJECTID', 'IEAT', 'Name_Parcel', 'Discription', 'mercant_name', 'factory_work_desc', 'build_status'],
      style: parcelStyle,
    });
    parcels.bindPopup(parcelPopup, { maxWidth: 320 });
    parcels.on('loading', () => { parcelLoading = true; parcelNote(); });
    parcels.on('load', () => { parcelLoading = false; parcelError = false; parcelNote(); });
    parcels.on('requesterror', () => { parcelLoading = false; parcelError = true; parcelNote(); });
    parcels.addTo(map);
    map.on('zoomend', parcelNote);
    $('parcels-on').addEventListener('change', (e) => { if (e.target.checked) parcels.addTo(map); else map.removeLayer(parcels); parcelNote(); });
    parcelNote();
  }

  // ---------- map ----------
  let map, layer, ringLayer;
  let markers = new Map();
  let focusCase = null;
  const bases = {};
  function initMap() {
    if (typeof L === 'undefined') { $('map').replaceChildren(el('div', 'empty', 'โหลดแผนที่ไม่ได้')); return; }
    map = L.map('map', { scrollWheelZoom: false }).setView([13.2, 101.0], 8);
    bases.gray = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }),
    ]);
    bases.imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri, Maxar, Earthstar Geographics' });
    bases.gray.addTo(map);
    layer = L.layerGroup().addTo(map);
    ringLayer = L.layerGroup().addTo(map);
    document.querySelectorAll('#basemap .seg-btn').forEach((b) => b.addEventListener('click', () => {
      Object.values(bases).forEach((l) => map.removeLayer(l));
      bases[b.dataset.base].addTo(map);
      document.querySelectorAll('#basemap .seg-btn').forEach((o) => o.setAttribute('aria-pressed', o === b ? 'true' : 'false'));
      if (parcels) parcels.setStyle(parcelStyle);
    }));
    initParcels();
  }
  let lastFitKey = '';
  function drawMap(list, types) {
    $('legend').replaceChildren(...types.map((t) => { const s = el('span'); const w = el('span', 'sw'); w.style.background = typeColor(t); s.append(w, document.createTextNode(t)); return s; }));
    if (!map) return;
    layer.clearLayers();
    markers = new Map();
    const pts = list.filter(validPt);
    pts.sort((a, b) => (a.inj + a.dead) - (b.inj + b.dead));
    for (const r of pts) {
      const mk = L.circleMarker([r.lat, r.lon], { radius: 5 + Math.min(9, Math.sqrt(r.inj + r.dead * 3) * 2), color: '#fff', weight: 1.5, fillColor: typeColor(r.type), fillOpacity: 0.88 });
      const pop = el('div');
      pop.append(el('div', 'pop-h', r.company || 'ไม่ระบุบริษัท'), el('div', 'pop-m', `${r.type} · ${r.date} ${r.time}`),
        el('div', 'pop-m', r.estate || ''), el('div', null, r.cause), el('div', 'pop-m', `บาดเจ็บ ${r.inj} · เสียชีวิต ${r.dead}`));
      mk.bindPopup(pop, { maxWidth: 320 });
      mk.addTo(layer);
      markers.set(r.case, mk);
    }
    if (focusCase != null && !markers.has(focusCase)) { focusCase = null; ringLayer.clearLayers(); $('map-focus').hidden = true; }
    $('map-note').textContent = `${fmt(pts.length)} จุดในช่วงที่เลือก · คลิกจุดเพื่อดูรายละเอียด · ขนาดตามจำนวนผู้บาดเจ็บและเสียชีวิต`;
    const key = [state.fy, state.q, state.type, state.estate].join('|');
    if (pts.length && key !== lastFitKey) {
      map.fitBounds(L.latLngBounds(pts.map((r) => [r.lat, r.lon])).pad(0.15), { maxZoom: state.estate === 'all' ? 11 : 14 });
      lastFitKey = key;
    }
  }

  // ---------- table ----------
  document.querySelectorAll('#tbl [data-sort]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sort;
    if (state.sortKey === k) state.sortDir = -state.sortDir; else { state.sortKey = k; state.sortDir = k === 'inj' || k === 'dead' ? -1 : 1; }
    drawTable();
  }));
  $('search').addEventListener('input', (e) => { state.search = e.target.value.trim().toLowerCase(); drawTable(); });
  function drawTable() {
    const q = state.search;
    const list = filtered().filter((r) => !q || [r.company, r.estate, r.cause, r.type].join(' ').toLowerCase().includes(q));
    const k = state.sortKey, dir = state.sortDir;
    list.sort((a, b) => {
      const va = a[k] ?? '', vb = b[k] ?? '';
      const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'th');
      return (c || a.case - b.case) * dir;
    });
    document.querySelectorAll('#tbl th').forEach((th, i) => {
      const b = th.querySelector('button');
      th.setAttribute('aria-sort', b && b.dataset.sort === k && i !== 1 ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    });
    const frag = document.createDocumentFragment();
    for (const r of list) {
      const tr = el('tr');
      const hasPt = validPt(r);
      tr.tabIndex = 0;
      tr.dataset.case = String(r.case);
      tr.className = 'row' + (hasPt ? '' : ' nopt') + (r.case === focusCase ? ' focus' : '');
      tr.title = hasPt ? 'คลิกเพื่อดูจุดเกิดเหตุบนแผนที่' : 'เหตุนี้ไม่มีพิกัดในข้อมูล';
      tr.addEventListener('click', () => showOnMap(r));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showOnMap(r); } });
      const c0 = el('td', 'case');
      if (hasPt) c0.innerHTML = PIN;
      c0.append(document.createTextNode(String(r.case)));
      tr.append(c0, el('td', null, r.date));
      const ev = el('td'); const p = el('span', 'pill'); p.style.setProperty('--pc', typeColor(r.type));
      p.append(el('span', 'sw'), document.createTextNode(r.type)); ev.append(p); tr.append(ev);
      tr.append(el('td', 'hide-sm', r.company), el('td', null, r.estate || ''), el('td', 'hide-sm cause', r.cause),
        el('td', 'n' + (r.inj ? ' inj-pos' : ''), String(r.inj)), el('td', 'n' + (r.dead ? ' dead-pos' : ''), String(r.dead)));
      frag.append(tr);
    }
    $('tbody').replaceChildren(frag);
    $('cases-note').textContent = `แสดง ${fmt(list.length)} รายการ · คลิกแถวเพื่อดูจุดเกิดเหตุบนแผนที่ · คลิกหัวตารางเพื่อเรียงลำดับ`;
  }

  // ---------- render ----------
  function render() {
    hideTip();
    fys = [...new Set(rows.map((r) => r.fy).filter(Boolean))].sort();
    const present = new Set(rows.map((r) => r.type));
    const types = TYPES.filter((t) => present.has(t)).concat([...present].filter((t) => !TYPES.includes(t)));
    if (state.fy !== 'all' && !fys.includes(state.fy)) state.fy = 'all';
    if (state.estate !== 'all' && !rows.some((r) => r.estate === state.estate)) state.estate = 'all';
    if (state.type !== 'all' && !present.has(state.type)) state.type = 'all';
    drawControls(types);

    const cur = filtered();
    const prevFy = state.fy !== 'all' ? String(Number(state.fy) - 1) : null;
    const prev = prevFy && fys.includes(prevFy) ? filtered({ ignoreFy: true, fy: prevFy }) : null;
    const yAll = filtered({ ignoreFy: true });
    const byFy = (f) => fys.map((y) => ({ y, v: f(yAll.filter((r) => r.fy === y)) }));
    const n = cur.length, inj = sum(cur, 'inj'), dead = sum(cur, 'dead');

    // period + takeaway
    const fyRange = fys.length ? `${fys[0]}–${fys[fys.length - 1]}` : '';
    let period = state.fy === 'all' ? `ปีงบประมาณ ${fyRange}` : `ปีงบประมาณ ${state.fy} (1 ต.ค. ${Number(state.fy) - 1} – 30 ก.ย. ${state.fy})`;
    if (state.q !== 'all') period = (state.fy === 'all' ? `ปีงบประมาณ ${fyRange}` : `ปีงบประมาณ ${state.fy}`) + ` · ไตรมาส ${state.q} (${QLABEL[state.q]})`;
    $('period').textContent = period;
    const take = $('take'); take.replaceChildren();
    const B = (t) => el('b', null, t), T = (t) => document.createTextNode(t);
    if (!rows.length) take.append(T('ยังไม่มีข้อมูล'));
    else if (!n) take.append(T('ไม่พบเหตุในช่วงที่เลือก'));
    else {
      if (state.estate !== 'all') take.append(T(`นิคม${state.estate} `));
      if (state.type !== 'all') take.append(T(`เหตุ${state.type} `));
      take.append(T('เกิดเหตุ '), B(fmt(n)), T(' ครั้ง'));
      if (state.type === 'all') {
        const top = [...countBy(cur, 'type')].sort((a, b) => b[1] - a[1])[0];
        if (top) take.append(T(` ส่วนใหญ่เป็น${top[0]} `), B(fmt(top[1])), T(' ครั้ง'));
      }
      take.append(T(' · บาดเจ็บ '), B(fmt(inj)), T(' ราย เสียชีวิต '), B(fmt(dead)), T(' ราย'));
    }

    const allNote = `รวมปีงบประมาณ ${fyRange} · กราฟแสดงรายปี`;
    // column 1
    metric($('m-n'), { title: 'จำนวนเหตุ', cur: n, prev: prev ? prev.length : null, prevFy, unit: ' ครั้ง', fmt, note: allNote, series: byFy((l) => l.length) });
    const tc = countBy(cur, 'type');
    hbars($('ch-type'), types.map((t) => ({ label: t, n: tc.get(t) || 0, color: state.type === 'all' || state.type === t ? typeColor(t) : cv('--past') })).filter((d) => d.n), { total: n });
    const byEst = d3.rollup(filtered({ ignoreEstate: true }).filter((r) => r.estate), (v) => v.length, (r) => r.estate);
    hbars($('ch-estate'), [...byEst].map(([k, v]) => ({ label: k, n: v })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'th')), {
      selected: state.estate === 'all' ? null : state.estate,
      onClick: (d) => set({ estate: state.estate === d.label ? 'all' : d.label }),
    });

    // column 2
    metric($('m-inj'), { title: 'ผู้บาดเจ็บ', cur: inj, prev: prev ? sum(prev, 'inj') : null, prevFy, unit: ' ราย', fmt, note: allNote, series: byFy((l) => sum(l, 'inj')) });
    metric($('m-dead'), { title: 'ผู้เสียชีวิต', cur: dead, prev: prev ? sum(prev, 'dead') : null, prevFy, unit: ' ราย', fmt, note: allNote, series: byFy((l) => sum(l, 'dead')) });
    const opKnown = cur.filter((r) => r.operating != null);
    rings($('rings'), [
      { title: 'มีผู้บาดเจ็บ', num: cur.filter((r) => r.inj > 0).length, den: n, color: cv('--t-inj') },
      { title: 'มีผู้เสียชีวิต', num: cur.filter((r) => r.dead > 0).length, den: n, color: cv('--red') },
      { title: 'ขณะประกอบกิจการ', num: opKnown.filter((r) => r.operating).length, den: opKnown.length, color: cv('--bar-hi') },
    ]);

    // column 3
    const mc = countBy(cur, 'month');
    const prevMc = prev ? countBy(prev, 'month') : null;
    const months = state.q === 'all' ? MONTHS : MONTHS.slice((Number(state.q) - 1) * 3, Number(state.q) * 3);
    monthBars($('ch-month'), mc, prevMc, months);
    $('month-hint').textContent = prevMc ? `จุดเทียบเดือนเดียวกันปีงบ ${prevFy}` : 'แท่งสีเข้มคือเดือนที่เกิดเหตุมากที่สุด';
    const sc = countBy(cur, 'slot');
    donut($('ch-slot'), SLOTS.map((s) => ({ label: s, n: sc.get(s) || 0 })), d3.sum(SLOTS, (s) => sc.get(s) || 0));
    const lc = countBy(cur, 'line');
    hbars($('ch-line'), ['1', '2', '3'].map((l) => ({ label: 'ปก.' + l, n: lc.get(l) || 0 })), { total: n });

    // column 4
    const fireOn = state.type === 'all' || state.type === FIRE;
    const fireOf = (l) => l.filter((r) => r.type === FIRE).length;
    metric($('m-fire'), { title: 'เพลิงไหม้', cur: fireOn ? fireOf(cur) : 0, prev: prev && fireOn ? fireOf(prev) : null, prevFy, unit: ' ครั้ง',
      extra: fireOn && n ? ` · ${pct(fireOf(cur) / n)} ของเหตุทั้งหมด` : '', fmt, note: allNote, series: fireOn ? byFy(fireOf) : [] });
    const mr = median(cur), pr = prev ? median(prev) : null;
    metric($('m-resp'), { title: 'เวลาระงับเหตุ (ค่ามัธยฐาน)', cur: mr ?? null, prev: pr ?? null, prevFy, unit: ' นาที',
      extra: ` · จาก ${fmt(cur.filter((r) => r.resp != null).length)} เหตุที่มีข้อมูล`, fmt: (v) => fmt1(v).replace(/\.0$/, ''), note: allNote,
      series: byFy((l) => median(l) || 0) });
    hbars($('ch-ftype'), [...countBy(cur, 'ftype')].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([k, v]) => ({ label: 'ประเภท ' + k, n: v })));

    currentTypes = types;
    drawMap(cur, types);
    drawTable();
  }

  let rt, lastW = innerWidth;
  addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rt); rt = setTimeout(() => rows.length && render(), 150); });

  $('map-focus-clear').addEventListener('click', clearFocus);
  $('map-focus-back').addEventListener('click', () => {
    const row = document.querySelector('#tbody tr.focus');
    if (!row) return;
    row.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    row.focus({ preventScroll: true });
  });
  initMap();
  // Wait for the login gate (assets/auth.js) before fetching data.
  (window.emccReady || Promise.resolve()).then(load);
})();
