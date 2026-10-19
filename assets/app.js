/* IEAT EMCC incident dashboard — static site, live data from ArcGIS with a bundled fallback. */
(() => {
  'use strict';

  const SERVICE = 'https://services5.arcgis.com/XbJa06Lil6auloCa/arcgis/rest/services/Emergency_Case/FeatureServer/0/query';
  const FALLBACK = 'data/emergency_case.json';
  const PAGE = 1000;

  const FIRE = 'เพลิงไหม้';
  const TYPES = [FIRE, 'ระเบิด', 'สารเคมีรั่วไหล', 'อุบัติเหตุ', 'อื่นๆ'];
  const TYPE_VAR = { 'เพลิงไหม้': '--t-fire', 'ระเบิด': '--t-blast', 'สารเคมีรั่วไหล': '--t-chem', 'อุบัติเหตุ': '--t-acc', 'อื่นๆ': '--t-other' };
  const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
  const SLOTS = ['00.00 - 07.59 น.', '08.00 - 15.59 น.', '16.00 - 23.59 น.'];

  const css = getComputedStyle(document.documentElement);
  const cv = (name) => css.getPropertyValue(name).trim();
  const typeColor = (t) => cv(TYPE_VAR[t] || '--t-other');
  const fmt = d3.format(',');
  const pct = d3.format('.0%');
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  const state = { fy: 'all', q: 'all', type: 'all', estate: 'all', sortKey: 'case', sortDir: -1, search: '' };
  let rows = [];

  // ---------- data ----------
  const txt = (v) => { const s = String(v ?? '').replace(/ /g, ' ').trim(); return s && s !== '-' ? s : null; };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  function normalize(r) {
    const mi = parseInt(txt(r['เดือน']) || '', 10);
    let slot = txt(r['Rank_เวลา']);
    if (slot && slot.startsWith('24.00')) slot = SLOTS[0];
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
      setStatus('live', `ข้อมูลสดจาก ArcGIS · ${fmt(rows.length)} เหตุ · โหลดเมื่อ ${time}`);
    } catch (e) {
      try {
        rows = (await fetchFallback()).map(normalize);
        setStatus('backup', `ใช้ไฟล์ข้อมูลสำรอง (เชื่อมต่อ ArcGIS ไม่ได้) · ${fmt(rows.length)} เหตุ`);
      } catch (e2) {
        rows = [];
        setStatus('err', 'โหลดข้อมูลไม่สำเร็จ ลองกด "โหลดใหม่"');
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

  // tooltip
  const tip = $('tip');
  function showTip(ev, head, lines) {
    tip.replaceChildren(el('div', 'h', head));
    for (const [c, name, val] of lines) {
      const r = el('div', 'r');
      if (c) { const s = el('span', 'sw'); s.style.background = c; r.append(s); }
      r.append(el('span', null, name), el('b', null, val));
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

  // ---------- filters ----------
  function chip(label, pressed, onClick, color) {
    const b = el('button', 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    if (color) { const s = el('span', 'sw'); s.style.background = color; b.append(s); }
    b.append(document.createTextNode(label));
    b.addEventListener('click', onClick);
    return b;
  }
  const set = (patch) => { Object.assign(state, patch); render(); };
  $('reset').addEventListener('click', () => set({ fy: 'all', q: 'all', type: 'all', estate: 'all' }));
  $('f-estate').addEventListener('change', (e) => set({ estate: e.target.value }));

  function drawFilters(fys, types) {
    $('f-fy').replaceChildren(chip('ทั้งหมด', state.fy === 'all', () => set({ fy: 'all' })),
      ...fys.map((y) => chip(y, state.fy === y, () => set({ fy: y }))));
    $('f-q').replaceChildren(chip('ทั้งหมด', state.q === 'all', () => set({ q: 'all' })),
      ...['1', '2', '3', '4'].map((q) => chip('Q' + q, state.q === q, () => set({ q }))));
    $('f-type').replaceChildren(chip('ทั้งหมด', state.type === 'all', () => set({ type: 'all' })),
      ...types.map((t) => chip(t, state.type === t, () => set({ type: t }), typeColor(t))));
    $('reset').hidden = state.fy === 'all' && state.q === 'all' && state.type === 'all' && state.estate === 'all';
    // estate dropdown: every estate in the data, A–Z, with its count for the other filters
    const sel = $('f-estate');
    const counts = countBy(filtered({ ignoreEstate: true }), 'estate');
    const names = [...new Set(rows.map((r) => r.estate).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    sel.replaceChildren(new Option(`ทุกนิคม (${fmt(names.length)} แห่ง)`, 'all'),
      ...names.map((n) => new Option(`${n} (${fmt(counts.get(n) || 0)})`, n)));
    sel.value = state.estate;
    sel.classList.toggle('on', state.estate !== 'all');
  }

  // ---------- charts ----------
  function stacked(box, cats, series, getN, highlight) {
    box.replaceChildren();
    const W = Math.max(280, box.clientWidth), H = 290, m = { t: 26, r: 4, b: 34, l: 36 };
    const totals = cats.map((c) => d3.sum(series, (s) => getN(c, s)));
    if (!d3.sum(totals)) { box.append(el('div', 'empty', 'ไม่มีเหตุในช่วงที่เลือก')); return; }
    const y = d3.scaleLinear([0, Math.max(4, d3.max(totals))], [H - m.b, m.t]).nice();
    const x = d3.scaleBand(cats, [m.l, W - m.r]).padding(0.28);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('transform', `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(d3.format('d')))
      .attr('font-size', null).attr('font-family', null)
      .call((g) => g.select('.domain').remove());
    const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(8))
      .attr('font-size', null).attr('font-family', null);
    // thin x labels if they collide
    const ticks = xa.selectAll('.tick text').nodes();
    const widest = d3.max(ticks, (t) => t.getComputedTextLength()) || 0;
    const step = Math.ceil((widest + 8) / x.step());
    if (step > 1) ticks.forEach((t, i) => { if (i % step) t.remove(); });
    const bw = Math.min(34, x.bandwidth());
    cats.forEach((c, i) => {
      let acc = 0;
      const g = svg.append('g').attr('opacity', highlight && highlight !== c ? 0.35 : 1);
      series.forEach((s) => {
        const n = getN(c, s); if (!n) return;
        g.append('rect').attr('x', x(c) + (x.bandwidth() - bw) / 2).attr('width', bw)
          .attr('y', y(acc + n)).attr('height', Math.max(0, y(acc) - y(acc + n) - 1))
          .attr('rx', 3).attr('fill', typeColor(s));
        acc += n;
      });
      if (totals[i]) svg.append('text').attr('x', x(c) + x.bandwidth() / 2).attr('y', y(totals[i]) - 6)
        .attr('text-anchor', 'middle').attr('fill', cv('--fg')).attr('font-size', 15).attr('font-weight', 700).attr('font-family', cv('--font')).text(totals[i]);
      svg.append('rect').attr('x', x(c)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.t - m.b)
        .attr('fill', 'transparent')
        .on('mousemove', (ev) => showTip(ev, `${c} · รวม ${totals[i]} ครั้ง`,
          series.filter((s) => getN(c, s)).map((s) => [typeColor(s), s, fmt(getN(c, s))])))
        .on('mouseleave', hideTip);
    });
  }

  function hbars(box, items, total, opt = {}) {
    const max = d3.max(items, (d) => d.n) || 1;
    const wrap = el('div', 'bars');
    for (const d of items) {
      const row = el(opt.onClick ? 'button' : 'div', 'bar');
      if (opt.onClick) {
        row.type = 'button'; row.classList.add('click');
        row.addEventListener('click', () => opt.onClick(d));
        if (opt.selected) { row.classList.add(d.label === opt.selected ? 'sel' : 'dim'); row.setAttribute('aria-pressed', d.label === opt.selected ? 'true' : 'false'); }
      }
      const l = el('span', 'l', d.label); l.title = d.label;
      const t = el('span', 't'); const f = el('span', 'f');
      f.style.width = (d.n / max * 100) + '%'; f.style.background = d.color || cv('--bar');
      t.append(f);
      const v = el('span', 'v', fmt(d.n));
      if (total) v.append(el('small', null, pct(d.n / total)));
      row.append(l, t, v); wrap.append(row);
    }
    box.replaceChildren(items.length ? wrap : el('div', 'empty', 'ไม่มีเหตุในช่วงที่เลือก'));
  }

  // ---------- sparkline (mini bars, one per fiscal year) ----------
  function spark(box, data, color, unit) {
    box.replaceChildren();
    if (!data.length || !d3.sum(data, (d) => d.v)) return;
    const W = 160, H = 46, gap = 3;
    const bw = Math.max(3, (W - gap * (data.length - 1)) / data.length);
    const max = d3.max(data, (d) => d.v) || 1;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'none');
    data.forEach((d, i) => {
      const h = Math.max(2, d.v / max * (H - 2));
      const on = state.fy === 'all' ? i === data.length - 1 : d.y === state.fy;
      svg.append('rect').attr('x', i * (bw + gap)).attr('y', H - h).attr('width', bw).attr('height', h).attr('rx', 2)
        .attr('fill', color).attr('opacity', on ? 1 : 0.28)
        .on('mousemove', (ev) => showTip(ev, `ปีงบประมาณ ${d.y}`, [[color, '', `${fmt(d.v)} ${unit}`]]))
        .on('mouseleave', hideTip);
    });
  }

  // ---------- map ----------
  let map, layer;
  const bases = {};
  function initMap() {
    if (typeof L === 'undefined') { $('map').replaceChildren(el('div', 'empty', 'โหลดแผนที่ไม่ได้')); return; }
    map = L.map('map', { scrollWheelZoom: false, attributionControl: true }).setView([13.2, 101.0], 8);
    bases.gray = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }),
    ]);
    bases.imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri, Maxar, Earthstar Geographics' });
    bases.gray.addTo(map);
    layer = L.layerGroup().addTo(map);
    document.querySelectorAll('#basemap .seg-btn').forEach((b) => b.addEventListener('click', () => {
      Object.values(bases).forEach((l) => map.removeLayer(l));
      bases[b.dataset.base].addTo(map);
      document.querySelectorAll('#basemap .seg-btn').forEach((o) => o.setAttribute('aria-pressed', o === b ? 'true' : 'false'));
    }));
  }
  let lastFitKey = '';
  function drawMap(list) {
    if (!map) return;
    layer.clearLayers();
    const pts = list.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.lat > 5 && r.lat < 21 && r.lon > 97 && r.lon < 106);
    pts.sort((a, b) => (a.inj + a.dead) - (b.inj + b.dead));
    for (const r of pts) {
      const c = typeColor(r.type);
      const mk = L.circleMarker([r.lat, r.lon], { radius: 5 + Math.min(9, Math.sqrt(r.inj + r.dead * 3) * 2), color: '#fff', weight: 1.5, fillColor: c, fillOpacity: 0.85 });
      const pop = el('div');
      pop.append(el('div', 'pop-h', r.company || 'ไม่ระบุบริษัท'),
        el('div', 'pop-m', `${r.type} · ${r.date} ${r.time}`),
        el('div', 'pop-m', r.estate || ''),
        el('div', null, r.cause),
        el('div', 'pop-m', `บาดเจ็บ ${r.inj} · เสียชีวิต ${r.dead}`));
      mk.bindPopup(pop, { maxWidth: 300 });
      mk.addTo(layer);
    }
    $('map-note').textContent = `${fmt(pts.length)} จุดในช่วงที่เลือก · คลิกจุดเพื่อดูรายละเอียด · ขนาดตามจำนวนผู้บาดเจ็บและเสียชีวิต`;
    const key = [state.fy, state.q, state.type, state.estate].join('|');
    if (pts.length && key !== lastFitKey) {
      map.fitBounds(L.latLngBounds(pts.map((r) => [r.lat, r.lon])).pad(0.15), { maxZoom: 11 });
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
    document.querySelectorAll('#tbl th').forEach((th) => {
      const b = th.querySelector('button');
      th.setAttribute('aria-sort', b && b.dataset.sort === k && th.textContent !== 'วันที่' ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    });
    const frag = document.createDocumentFragment();
    for (const r of list) {
      const tr = el('tr');
      tr.append(el('td', null, String(r.case)), el('td', null, r.date));
      const ev = el('td'); const p = el('span', 'pill'); p.style.setProperty('--pc', typeColor(r.type)); const s = el('span', 'sw');
      p.append(s, document.createTextNode(r.type)); ev.append(p); tr.append(ev);
      tr.append(el('td', 'hide-sm', r.company), el('td', null, r.estate || ''), el('td', 'hide-sm cause', r.cause),
        el('td', 'n' + (r.inj ? ' inj-pos' : ''), String(r.inj)), el('td', 'n' + (r.dead ? ' dead-pos' : ''), String(r.dead)));
      frag.append(tr);
    }
    $('tbody').replaceChildren(frag);
    $('cases-note').textContent = `แสดง ${fmt(list.length)} รายการ · คลิกหัวตารางเพื่อเรียงลำดับ`;
  }

  // ---------- render ----------
  function render() {
    hideTip();
    const fys = [...new Set(rows.map((r) => r.fy).filter(Boolean))].sort();
    const present = new Set(rows.map((r) => r.type));
    const types = TYPES.filter((t) => present.has(t)).concat([...present].filter((t) => !TYPES.includes(t)));
    if (state.fy !== 'all' && !fys.includes(state.fy)) state.fy = 'all';
    if (state.estate !== 'all' && !rows.some((r) => r.estate === state.estate)) state.estate = 'all';
    drawFilters(fys, types);

    const cur = filtered();
    const n = cur.length, inj = sum(cur, 'inj'), dead = sum(cur, 'dead');
    const fire = cur.filter((r) => r.type === FIRE).length;
    $('k-n').textContent = fmt(n);
    $('k-inj').textContent = fmt(inj);
    $('k-dead').textContent = fmt(dead);
    $('k-fire').textContent = state.type === 'all' || state.type === FIRE ? fmt(fire) : '0';
    const prevFy = state.fy !== 'all' ? String(Number(state.fy) - 1) : null;
    const prev = prevFy && fys.includes(prevFy) ? filtered({ ignoreFy: true, fy: prevFy }) : null;
    const sub = (id, cnow, cprev) => {
      const box = $(id); box.replaceChildren();
      if (!prev) { box.textContent = state.fy === 'all' ? (fys.length ? `ปีงบประมาณ ${fys[0]}–${fys[fys.length - 1]}` : '') : 'ไม่มีข้อมูลปีก่อนหน้า'; return; }
      const d = cnow - cprev;
      const tag = el('span', d > 0 ? 'up' : d < 0 ? 'down' : null, d > 0 ? `▲ ${fmt(d)}` : d < 0 ? `▼ ${fmt(-d)}` : 'เท่าเดิม');
      box.append(tag, document.createTextNode(` จากปีงบ ${prevFy} (${fmt(cprev)})`));
    };
    sub('k-n-sub', n, prev ? prev.length : 0);
    sub('k-inj-sub', inj, prev ? sum(prev, 'inj') : 0);
    sub('k-dead-sub', dead, prev ? sum(prev, 'dead') : 0);
    // sparklines: yearly trend under the other filters, selected year highlighted
    const yAll = filtered({ ignoreFy: true });
    const byFy = (f) => fys.map((y) => ({ y, v: f(yAll.filter((r) => r.fy === y)) }));
    spark($('s-n'), byFy((l) => l.length), cv('--brand'), 'ครั้ง');
    spark($('s-inj'), byFy((l) => sum(l, 'inj')), cv('--warn'), 'ราย');
    spark($('s-dead'), byFy((l) => sum(l, 'dead')), cv('--bad'), 'ราย');
    spark($('s-fire'), state.type === 'all' || state.type === FIRE ? byFy((l) => l.filter((r) => r.type === FIRE).length) : [], cv('--t-fire'), 'ครั้ง');
    $('k-fire-sub').textContent = n && (state.type === 'all' || state.type === FIRE) ? `${pct(fire / n)} ของเหตุทั้งหมด` : '';

    // takeaway
    const take = $('take'); take.replaceChildren();
    const period = (state.fy === 'all' ? (fys.length ? `ปีงบประมาณ ${fys[0]}–${fys[fys.length - 1]}` : '') : `ปีงบประมาณ ${state.fy}`) + (state.q === 'all' ? '' : ` ไตรมาส ${state.q}`) + (state.estate === 'all' ? '' : ` ที่นิคม${state.estate}`);
    const B = (t) => el('b', null, t), T = (t) => document.createTextNode(t);
    if (!rows.length) take.append(T('ยังไม่มีข้อมูล'));
    else if (!n) take.append(T(`ไม่พบเหตุใน${period}`));
    else {
      take.append(T(`${period} เกิดเหตุ `), B(fmt(n)), T(' ครั้ง'));
      if (state.type === 'all') {
        const top = [...countBy(cur, 'type')].sort((a, b) => b[1] - a[1])[0];
        if (top) take.append(T(` ส่วนใหญ่เป็น${top[0]} `), B(fmt(top[1])), T(' ครั้ง'));
      }
      const te = state.estate === 'all' && [...countBy(cur, 'estate')].sort((a, b) => b[1] - a[1])[0];
      if (te) take.append(T(` เกิดบ่อยที่สุดที่${te[0]} `), B(fmt(te[1])), T(' ครั้ง'));
      take.append(T(dead ? ' มีผู้เสียชีวิต ' : ' ไม่มีผู้เสียชีวิต'));
      if (dead) take.append(B(fmt(dead)), T(' ราย'));
    }

    // year + month
    const shown = state.type === 'all' ? types : [state.type];
    const yl = filtered({ ignoreFy: true });
    const ym = d3.rollup(yl, (v) => v.length, (r) => r.fy, (r) => r.type);
    stacked($('ch-year'), fys, shown, (c, s) => ym.get(c)?.get(s) || 0, state.fy === 'all' ? null : state.fy);
    const mm = d3.rollup(cur.filter((r) => r.month), (v) => v.length, (r) => r.month, (r) => r.type);
    const months = state.q === 'all' ? MONTHS : MONTHS.slice((Number(state.q) - 1) * 3, Number(state.q) * 3);
    stacked($('ch-month'), months, shown, (c, s) => mm.get(c)?.get(s) || 0, null);
    $('month-note').textContent = (state.fy === 'all' ? 'รวมทุกปีงบประมาณ' : `ปีงบประมาณ ${state.fy}`) + ' · ปีงบประมาณเริ่มเดือนตุลาคม';

    // breakdowns
    const sc = countBy(cur, 'slot');
    hbars($('ch-slot'), SLOTS.map((s) => ({ label: s, n: sc.get(s) || 0 })), n);
    const lc = countBy(cur, 'line');
    hbars($('ch-line'), ['1', '2', '3'].map((l) => ({ label: 'ปก.' + l, n: lc.get(l) || 0 })), n);
    hbars($('ch-ftype'), [...countBy(cur, 'ftype')].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6)
      .map(([k, v]) => ({ label: 'ประเภท ' + k, n: v })));
    const byEst = d3.group(filtered({ ignoreEstate: true }).filter((r) => r.estate), (r) => r.estate);
    hbars($('ch-estate'), [...byEst].map(([k, v]) => {
      const dom = [...d3.rollup(v, (x) => x.length, (r) => r.type)].sort((a, b) => b[1] - a[1])[0][0];
      return { label: k, n: v.length, color: typeColor(dom) };
    }).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'th')), 0, {
      selected: state.estate === 'all' ? null : state.estate,
      onClick: (d) => set({ estate: state.estate === d.label ? 'all' : d.label }),
    });
    $('estate-note').textContent = state.estate === 'all'
      ? 'เรียงจากมากไปน้อย สีบอกประเภทเหตุที่พบมากที่สุด คลิกชื่อนิคมเพื่อกรอง'
      : `กำลังกรองเฉพาะ${state.estate} คลิกอีกครั้งเพื่อดูทุกนิคม`;

    drawMap(cur);
    drawTable();
  }

  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => rows.length && render(), 150); });

  initMap();
  load();
})();
