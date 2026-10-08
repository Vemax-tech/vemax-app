// Comparador de nichos: matriz de notas ponderadas, ranking e radar
import { sb } from '../supabase.js';
import { start, h, run, pageHead, tabs, empty, formModal, toast, icon } from '../ui.js';
import { MERCADO_TABS } from './mercado.js';

const SVG = 'http://www.w3.org/2000/svg';
const COLORS = ['#F5B301', '#A3C16A', '#D9794A', '#8FB8C9'];
const sv = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); kids.forEach((k2) => e.append(k2)); return e; };

export const init = () => start('mercado/', 'Nichos e comparador', async (ctx, view) => {
  const canEdit = ctx.can('mercado', 'editar');
  const [nichos, crit, notas, fontes] = await Promise.all([
    run(sb.from('nichos').select('id,nome,alvo').order('nome')),
    run(sb.from('criterios').select('*').order('ordem')),
    run(sb.from('notas_nicho').select('*')),
    run(sb.from('fontes').select('id,titulo,nicho_id')),
  ]);
  const N = nichos || [], C = crit || [], notaMap = new Map((notas || []).map((n) => [n.nicho_id + n.criterio_id, n]));
  const out = h('div', { class: 'stack' });

  const score = (nid) => {
    let s = 0, w = 0, verified = 0, rated = 0;
    C.forEach((c) => { const n = notaMap.get(nid + c.id); if (!n) return; rated++; s += n.nota * c.peso; w += Number(c.peso); if (n.evidencia || n.fonte_id) verified++; });
    return { score: w ? s / w : null, rated, verified };
  };
  const unverified = (n) => !(n.evidencia || n.fonte_id);

  const editCell = (nicho, c) => {
    const cur = notaMap.get(nicho.id + c.id);
    const fs = (fontes || []).filter((f) => f.nicho_id === nicho.id);
    formModal({
      title: `${nicho.nome} — ${c.nome}`,
      fields: [
        { name: 'nota', label: 'Nota (0 a 10) — deixe vazio para remover', type: 'number', min: 0, max: 10, step: 0.5, value: cur?.nota ?? '' },
        { name: 'evidencia', label: 'Evidência / justificativa (obrigatória para a nota ser "verificada")', type: 'textarea', value: cur?.evidencia },
        { name: 'fonte_id', label: 'Fonte cadastrada neste nicho', type: 'select', nullable: true, value: cur?.fonte_id, options: [['', '— nenhuma —'], ...fs.map((f) => [f.id, f.titulo])] },
      ],
      onSubmit: async (v) => {
        if (v.nota == null) {
          if (cur && !(await run(sb.from('notas_nicho').delete().match({ nicho_id: nicho.id, criterio_id: c.id }), 'Nota removida.'))) return false;
          notaMap.delete(nicho.id + c.id);
        } else {
          const row = await run(sb.from('notas_nicho').upsert({ nicho_id: nicho.id, criterio_id: c.id, ...v }, { onConflict: 'nicho_id,criterio_id' }).select().single(), 'Nota salva.');
          if (!row) return false; notaMap.set(nicho.id + c.id, row);
        }
        draw();
      },
    });
  };

  const radar = (top) => {
    const S = 260, cx = S / 2, cy = S / 2, R = 92, n = C.length;
    const pt = (i, v) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [cx + Math.cos(a) * R * v / 10, cy + Math.sin(a) * R * v / 10]; };
    const svg = sv('svg', { viewBox: `0 0 ${S} ${S}`, class: 'radar', role: 'img', 'aria-label': 'Gráfico radar dos nichos mais bem pontuados', width: '100%', style: 'max-width:340px' });
    [2.5, 5, 7.5, 10].forEach((l) => svg.append(sv('polygon', { class: 'ax', points: C.map((_, i) => pt(i, l).join(',')).join(' ') })));
    C.forEach((c, i) => { const [x, y] = pt(i, 10); svg.append(sv('line', { class: 'ax', x1: cx, y1: cy, x2: x, y2: y })); const [tx, ty] = pt(i, 12.4); const t = sv('text', { x: tx, y: ty, 'text-anchor': tx < cx - 4 ? 'end' : tx > cx + 4 ? 'start' : 'middle' }); t.textContent = c.nome.split(/[ (/]/)[0]; svg.append(t); });
    top.forEach((nz, k) => svg.append(sv('polygon', { points: C.map((c, i) => pt(i, notaMap.get(nz.id + c.id)?.nota ?? 0).join(',')).join(' '), fill: COLORS[k], 'fill-opacity': .15, stroke: COLORS[k], 'stroke-width': 1.6 })));
    return svg;
  };

  function draw() {
    const ranked = N.map((nz) => ({ ...nz, ...score(nz.id) })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    if (!N.length) { out.replaceChildren(empty('Cadastre nichos para começar a comparar.')); return; }
    const top = ranked.filter((r) => r.score != null).slice(0, 4);

    const matrix = h('div', { class: 'tw' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Nicho'),
        C.map((c) => h('th', { title: c.nome }, c.nome.split(' (')[0], h('div', {}, canEdit
          ? h('input', { class: 'wi', type: 'number', min: 0, step: 0.5, value: c.peso, 'aria-label': 'Peso de ' + c.nome, onchange: async (e) => {
            const v = Math.max(0, Number(e.target.value) || 0);
            if (await run(sb.from('criterios').update({ peso: v }).eq('id', c.id))) { c.peso = v; draw(); }
          } })
          : h('span', { class: 'small muted' }, 'peso ' + c.peso))),
        ), h('th', {}, 'Pontuação'))),
      h('tbody', {}, ranked.map((r) => h('tr', {},
        h('td', {}, h('a', { class: 't', href: 'nicho.html?id=' + r.id }, (r.alvo ? '★ ' : '') + r.nome), h('div', { class: 'small muted' }, `${r.rated}/${C.length} critérios · ${r.verified} verificados`)),
        C.map((c) => { const n = notaMap.get(r.id + c.id);
          return h('td', {}, h('button', { class: 'cell' + (n ? (unverified(n) ? ' unv' : '') : ' none'), style: 'background:none', disabled: !canEdit && !n, title: n ? (unverified(n) ? 'Não verificada: sem evidência/fonte' : n.evidencia || 'Com fonte') : 'Sem nota', onclick: () => canEdit && editCell(r, c) }, n ? n.nota : '+')); }),
        h('td', {}, r.score != null ? h('b', { class: 'grad' }, r.score.toFixed(2)) : '—'))))));

    out.replaceChildren(
      h('div', { class: 'card' }, h('h2', {}, 'Ranking ponderado'), h('p', { class: 'small muted' }, 'Média das notas ponderada pelos pesos, considerando só os critérios avaliados. Notas tracejadas ainda não têm evidência ou fonte.'),
        h('div', { class: 'bars', style: 'margin-top:16px' }, ranked.map((r) => h('div', { class: 'bar' }, h('span', {}, (r.alvo ? '★ ' : '') + r.nome), h('div', { style: 'background:rgba(245,179,1,.08);border-radius:7px' }, h('i', { style: `width:${r.score != null ? r.score * 10 : 0}%` })), h('b', {}, r.score != null ? r.score.toFixed(1) : '—'))))),
      top.length ? h('div', { class: 'card' }, h('h2', {}, 'Perfil dos mais bem pontuados'), h('div', { class: 'row', style: 'align-items:flex-start;margin-top:10px' }, radar(top),
        h('div', { class: 'legend' }, top.map((t, k) => h('span', { style: `--c:${COLORS[k]}` }, `${t.nome} (${t.score.toFixed(1)})`))))) : null,
      h('div', {}, h('h2', { style: 'margin-bottom:12px' }, 'Matriz de notas'), matrix));
  }

  const exportCsv = () => {
    const esc = (s) => `"${String(s ?? '').replaceAll('"', '""')}"`;
    const lines = [['Nicho', ...C.map((c) => c.nome), 'Pontuação'].map(esc).join(';')];
    N.forEach((nz) => lines.push([nz.nome, ...C.map((c) => notaMap.get(nz.id + c.id)?.nota ?? ''), score(nz.id).score?.toFixed(2) ?? ''].map(esc).join(';')));
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })), download: 'comparador-nichos.csv' });
    a.click(); URL.revokeObjectURL(a.href);
  };

  view.append(pageHead('Inteligência de Mercado', 'Nichos e comparador', 'Compare mercados por critérios com peso e evidência.',
    h('button', { class: 'btn', onclick: exportCsv }, 'Exportar CSV'),
    h('button', { class: 'btn', onclick: () => window.print() }, 'Imprimir / PDF'),
    canEdit && h('button', { class: 'btn primary', onclick: () => formModal({ title: 'Novo nicho', fields: [{ name: 'nome', label: 'Nome do nicho', required: true }, { name: 'descricao', label: 'Descrição', type: 'textarea' }],
      onSubmit: async (v) => { const r = await run(sb.from('nichos').insert(v).select().single(), 'Nicho criado.'); if (!r) return false; location.href = 'nicho.html?id=' + r.id; } }) }, icon('plus'), 'Novo nicho')),
    tabs(MERCADO_TABS, 'nichos.html'), out);
  draw();
});
