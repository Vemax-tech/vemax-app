// Gráficos SVG sem dependências (usados no PDF e exportados como PNG para o Excel)
const AMBER = '#C98A00', GOLD = '#F5B301', DARK = '#1A1307', MUTED = '#6B6252', GRID = '#E6DFCF';
const SERIES = ['#C98A00', '#4F7A3A', '#B5532B', '#3E7C8F', '#7A5C9E', '#8A8A8A'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n, d = 0) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Barras horizontais. items: [{label, value, note?, color?}] */
function hbar(items, { w = 640, max, unit = '', dec = 0, title = '', rowH = 30, labelW = 190 } = {}) {
  const m = max ?? Math.max(...items.map((i) => i.value));
  const h = items.length * rowH + (title ? 34 : 10);
  const top = title ? 30 : 4, bw = w - labelW - 80;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Segoe UI, Arial, sans-serif">`;
  if (title) s += `<text x="0" y="16" font-size="13" font-weight="700" fill="${DARK}">${esc(title)}</text>`;
  items.forEach((it, i) => {
    const y = top + i * rowH, len = Math.max(2, (it.value / m) * bw);
    s += `<text x="0" y="${y + 16}" font-size="11.5" fill="${DARK}">${esc(it.label)}</text>`;
    s += `<rect x="${labelW}" y="${y + 4}" width="${bw}" height="16" rx="8" fill="#F3EEE0"/>`;
    s += `<rect x="${labelW}" y="${y + 4}" width="${len}" height="16" rx="8" fill="${it.color || AMBER}"/>`;
    s += `<text x="${labelW + bw + 8}" y="${y + 17}" font-size="11.5" font-weight="700" fill="${DARK}">${fmt(it.value, dec)}${unit}</text>`;
  });
  return s + '</svg>';
}

/** Barras agrupadas verticais. groups: [{label, values:[v1,v2]}], series: [nome1,nome2] */
function groupedBars(groups, series, { w = 640, h = 260, max = 100, unit = '%', title = '' } = {}) {
  const pad = { l: 34, r: 10, t: title ? 40 : 16, b: 44 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const gw = iw / groups.length, bw = Math.min(34, (gw - 20) / series.length);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="Segoe UI, Arial, sans-serif">`;
  if (title) s += `<text x="0" y="16" font-size="13" font-weight="700" fill="${DARK}">${esc(title)}</text>`;
  [0, 25, 50, 75, 100].forEach((t) => { const y = pad.t + ih - (t / max) * ih; if (t > max) return; s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}" stroke="${GRID}"/><text x="${pad.l - 6}" y="${y + 4}" font-size="10" text-anchor="end" fill="${MUTED}">${t}</text>`; });
  groups.forEach((g, gi) => {
    const x0 = pad.l + gi * gw + (gw - bw * series.length) / 2;
    g.values.forEach((v, si) => {
      const bh = (v / max) * ih, x = x0 + si * bw, y = pad.t + ih - bh;
      s += `<rect x="${x}" y="${y}" width="${bw - 3}" height="${bh}" rx="3" fill="${SERIES[si]}"/><text x="${x + (bw - 3) / 2}" y="${y - 4}" font-size="10" font-weight="700" text-anchor="middle" fill="${DARK}">${fmt(v)}${unit}</text>`;
    });
    s += `<text x="${pad.l + gi * gw + gw / 2}" y="${h - 24}" font-size="11" text-anchor="middle" fill="${DARK}">${esc(g.label)}</text>`;
  });
  series.forEach((n, i) => { s += `<rect x="${pad.l + i * 110}" y="${h - 14}" width="10" height="10" rx="2" fill="${SERIES[i]}"/><text x="${pad.l + i * 110 + 15}" y="${h - 5}" font-size="10.5" fill="${MUTED}">${esc(n)}</text>`; });
  return s + '</svg>';
}

/** Radar. axes: [nomes], datasets: [{name, values}] (0–10) */
function radar(axes, datasets, { size = 380, title = '' } = {}) {
  const cx = size / 2, cy = size / 2 + (title ? 10 : 0), R = size / 2 - 78, n = axes.length;
  const pt = (i, v) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [cx + Math.cos(a) * R * v / 10, cy + Math.sin(a) * R * v / 10]; };
  const H = size + (title ? 20 : 0) + 24 * Math.ceil(datasets.length / 2);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${H}" width="${size}" height="${H}" font-family="Segoe UI, Arial, sans-serif">`;
  if (title) s += `<text x="0" y="14" font-size="13" font-weight="700" fill="${DARK}">${esc(title)}</text>`;
  [2, 4, 6, 8, 10].forEach((l) => { s += `<polygon points="${axes.map((_, i) => pt(i, l).join(',')).join(' ')}" fill="none" stroke="${GRID}"/>`; });
  axes.forEach((a, i) => {
    const [x, y] = pt(i, 10), [tx, ty] = pt(i, 11.8);
    s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${GRID}"/><text x="${tx}" y="${ty + 3}" font-size="10" fill="${MUTED}" text-anchor="${tx < cx - 6 ? 'end' : tx > cx + 6 ? 'start' : 'middle'}">${esc(a)}</text>`;
  });
  datasets.forEach((d, k) => { s += `<polygon points="${d.values.map((v, i) => pt(i, v).join(',')).join(' ')}" fill="${SERIES[k]}" fill-opacity=".14" stroke="${SERIES[k]}" stroke-width="2"/>`; });
  datasets.forEach((d, k) => { const x = 8 + (k % 2) * (size / 2), y = size + (title ? 20 : 0) + 6 + Math.floor(k / 2) * 22; s += `<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${SERIES[k]}"/><text x="${x + 15}" y="${y + 9}" font-size="11" fill="${DARK}">${esc(d.name)}</text>`; });
  return s + '</svg>';
}

/** Cor de célula para heatmap 0–10 (âmbar). */
function heat(v) { const t = Math.max(0, Math.min(1, v / 10)); const r = Math.round(255 - t * 38), g = Math.round(246 - t * 118), b = Math.round(222 - t * 200); return `rgb(${r},${g},${b})`; }

module.exports = { hbar, groupedBars, radar, heat, fmt, esc, SERIES, AMBER, GOLD, DARK, MUTED };
