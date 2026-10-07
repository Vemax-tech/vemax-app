// Gera os entregáveis: PDF, Excel e pacote Power BI (CSV). Uso: npm install && node build.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const D = require('./data.js');
const C = require('./charts.js');
const ExcelJS = require('exceljs');

const OUT = path.join(__dirname, '..', 'output');
const PBI = path.join(OUT, 'powerbi');
const TMP = path.join(OUT, '.tmp');
[OUT, PBI, TMP].forEach((p) => fs.mkdirSync(p, { recursive: true }));
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);

/* ---------------- cálculo ---------------- */
const pesosPadrao = Object.fromEntries(D.criterios.map((c) => [c.chave, c.peso]));
const score = (n, pesos = pesosPadrao) => { let s = 0, w = 0; D.criterios.forEach((c) => { s += n.notas[c.chave][0] * pesos[c.chave]; w += pesos[c.chave]; }); return s / w; };
const rankOf = (pesos) => [...D.nichos].map((n) => ({ n, s: score(n, pesos) })).sort((a, b) => b.s - a.s);
const base = rankOf();
const cenRank = D.cenarios.map((c) => ({ ...c, rank: rankOf(c.pesos || pesosPadrao) }));
const nFatos = (n) => Object.values(n.notas).filter((x) => x[1] === 'F').length;
const srcMap = Object.fromEntries(D.fontes.map((f) => [f.id, f]));
const tag = (ids) => ids.split(',').map((s) => s.trim()).filter(Boolean).map((i) => `<span class="src">${i}</span>`).join('');
const f1 = (n) => C.fmt(n, 2);

/* ---------------- gráficos ---------------- */
const charts = {
  ranking: C.hbar(base.map((r) => ({ label: r.n.nome, value: r.s })), { w: 640, max: 10, dec: 2, title: 'Pontuação ponderada (0–10) — cenário padrão', labelW: 180 }),
  radar: C.radar(D.criterios.map((c) => c.nome.split(' (')[0].split(' /')[0]), base.slice(0, 3).map((r) => ({ name: r.n.nome, values: D.criterios.map((c) => r.n.notas[c.chave][0]) })), { size: 420, title: 'Perfil dos 3 primeiros colocados' }),
  setores: C.hbar([
    { label: 'Serviços', value: 3.16 }, { label: 'Comércio', value: 1.05 }, { label: 'Indústria', value: 0.378 },
    { label: 'Agropecuária', value: 0.038 }], { w: 640, unit: ' mi', dec: 2, title: 'Pequenos negócios abertos em 2025, por setor (milhões)' }),
  porte: C.hbar([{ label: 'MEI', value: 3.81 }, { label: 'Microempresa (ME)', value: 0.933 }, { label: 'Pequeno porte (EPP)', value: 0.209 }], { w: 640, unit: ' mi', dec: 2, title: 'Pequenos negócios abertos em 2025, por porte (milhões)' }),
  controle: C.hbar([{ label: 'Planilha no computador', value: 30 }, { label: 'Anotações em caderno', value: 25 }, { label: 'App/sistema digital', value: 20 }, { label: 'Contador', value: 13 }, { label: 'Nenhum controle', value: 10 }], { w: 640, unit: '%', max: 40, title: 'Como pequenos negócios controlam as finanças (Sebrae)' }),
  ia: C.hbar([{ label: '2024', value: 65529 }, { label: '2025', value: 93475 }], { w: 640, title: 'Estimativa de empresas (10+ ocupados) que usaram IA' }),
  crm: C.groupedBars([{ label: 'Total', values: [25, 31] }, { label: 'Pequenas (10–49)', values: [23, 29] }, { label: 'Médias (50–249)', values: [38, 41] }, { label: 'Grandes (250+)', values: [50, 56] }], ['2024', '2025'], { w: 640, h: 250, max: 100, title: 'Empresas que usam pacotes de CRM, por porte' }),
};

/* ---------------- PNG (Edge headless) ---------------- */
function svgToPng(svg, w, h, file) {
  const html = path.join(TMP, 'c.html');
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">${svg}</body>`);
  execFileSync(EDGE, ['--headless', '--disable-gpu', '--hide-scrollbars', `--screenshot=${file}`, `--window-size=${w},${h}`, '--force-device-scale-factor=2', 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
}

/* ---------------- relatório HTML → PDF ---------------- */
function html() {
  const hoje = '07/10/2026';
  const top = base[0], last = base[base.length - 1];
  const cenTab = `<table class="t"><thead><tr><th>Cenário</th>${base.map((_, i) => `<th>${i + 1}º</th>`).join('')}</tr></thead><tbody>${cenRank.map((c) => `<tr><td><b>${c.nome}</b></td>${c.rank.map((r) => `<td>${r.n.nome}<br><span class="m">${f1(r.s)}</span></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const heatTab = `<table class="t heat"><thead><tr><th>Nicho</th>${D.criterios.map((c) => `<th>${c.nome.split(' (')[0]}<br><span class="m">peso ${c.peso}</span></th>`).join('')}<th>Pontuação</th></tr></thead><tbody>${base.map((r) => `<tr><td><b>${r.n.nome}</b></td>${D.criterios.map((c) => { const [v, t] = r.n.notas[c.chave]; return `<td style="background:${C.heat(v)}">${v}${t === 'I' ? '<sup>i</sup>' : ''}</td>`; }).join('')}<td><b>${f1(r.s)}</b></td></tr>`).join('')}</tbody></table><p class="note"><sup>i</sup> = nota baseada em inferência (sem dado direto). Notas sem marca estão ancoradas em fato com fonte.</p>`;
  const conf = `<table class="t"><thead><tr><th>Nicho</th><th>Notas ancoradas em fato</th><th>Notas inferidas</th><th>Leitura</th></tr></thead><tbody>${base.map((r) => { const f = nFatos(r.n); return `<tr><td><b>${r.n.nome}</b></td><td>${f} de 8</td><td>${8 - f} de 8</td><td>${f >= 4 ? 'Confiança moderada' : f === 3 ? 'Confiança baixa-moderada' : 'Confiança baixa — validar'}</td></tr>`; }).join('')}</tbody></table>`;

  const ficha = (n, i) => `
  <section class="page">
    <h2>4.${i + 1} ${n.nome}</h2>
    <p class="lead">${n.resumo}</p>
    <h3>Fatos levantados</h3>
    <table class="t"><tbody>${n.fatos.map(([t, s]) => `<tr><td>${t}</td><td class="w">${tag(s)}</td></tr>`).join('')}</tbody></table>
    <div class="cols">
      <div><h3>Problemas reais identificados</h3><ul>${n.problemas.map(([t, k, s]) => `<li>${t} <span class="k ${k}">${k === 'F' ? 'FATO' : 'INFERÊNCIA'}</span> ${tag(s || '')}</li>`).join('')}</ul></div>
      <div><h3>Necessidades tecnológicas não atendidas</h3><ul>${n.necessidades.map(([t, k]) => `<li>${t} <span class="k ${k}">${k === 'F' ? 'FATO' : 'INFERÊNCIA'}</span></li>`).join('')}</ul></div>
    </div>
    <h3>Concorrentes e soluções existentes</h3>
    <table class="t"><thead><tr><th>Concorrente</th><th>O que oferece</th><th>Evidência</th><th>Fonte</th><th>Ameaça</th></tr></thead><tbody>${n.concorrentes.map((c) => `<tr><td><b>${c[0]}</b></td><td>${c[1]}</td><td>${c[2]}</td><td>${tag(c[3] === '—' ? '' : c[3]) || '—'}</td><td>${c[4]}</td></tr>`).join('')}</tbody></table>
    <div class="cols">
      <div><h3>Oportunidades</h3><ul>${n.oportunidades.map((t) => `<li>${t}</li>`).join('')}</ul></div>
      <div><h3>Riscos</h3><ul>${n.riscos.map((t) => `<li>${t}</li>`).join('')}</ul></div>
    </div>
    <h3>Notas e justificativas</h3>
    <table class="t sm"><thead><tr><th>Critério</th><th>Nota</th><th>Base</th><th>Justificativa</th><th>Fontes</th></tr></thead><tbody>${D.criterios.map((c) => { const [v, t, s, j] = n.notas[c.chave]; return `<tr><td>${c.nome}</td><td style="background:${C.heat(v)}"><b>${v}</b></td><td>${t === 'F' ? 'Fato' : 'Inferência'}</td><td>${j}</td><td>${tag(s)}</td></tr>`; }).join('')}</tbody></table>
  </section>`;

  const consol = `<table class="t"><thead><tr><th>Operação</th><th>Segmento</th><th>Evidência</th><th>Fonte</th></tr></thead><tbody>
    <tr><td>Locaweb (LWSA) → Bling</td><td>ERP p/ comércio</td><td>R$ 524,3 milhões</td><td>${tag('S16')}</td></tr>
    <tr><td>Visma → Conta Azul</td><td>ERP p/ PMEs</td><td>~US$ 300 mi; ~100 mil PMEs; anúncio 01/08/2025</td><td>${tag('S17')}</td></tr>
    <tr><td>Afya → iClinic</td><td>Gestão de clínicas</td><td>R$ 182,7 milhões</td><td>${tag('S14')}</td></tr>
    <tr><td>Afya → Shosp</td><td>Gestão de clínicas</td><td>R$ 77,7 milhões</td><td>${tag('S15')}</td></tr>
    <tr><td>Doctoralia → Feegow</td><td>Gestão de clínicas</td><td>Valor não divulgado (21/07/2022)</td><td>${tag('S13')}</td></tr>
    <tr><td>Warburg Pincus → Superlógica</td><td>Gestão condominial</td><td>R$ 300 mi (2020) + R$ 150 mi (2023); 8 aquisições desde 2019</td><td>${tag('S10')}</td></tr></tbody></table>`;

  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Pesquisa de Mercado — Nichos Empresariais no Brasil</title>
<style>
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; } body { font: 10.4pt/1.5 'Segoe UI', Arial, sans-serif; color: #1A1307; margin: 0; }
h1 { font-size: 30pt; line-height: 1.1; margin: 0 0 8pt; } h2 { font-size: 19pt; margin: 0 0 8pt; padding-bottom: 5pt; border-bottom: 2pt solid #F5B301; } h3 { font-size: 11.5pt; margin: 14pt 0 5pt; color: #8A5A00; }
.page { break-before: page; } .lead { font-size: 11.5pt; color: #3a3224; }
.cover { height: 255mm; display: flex; flex-direction: column; justify-content: center; background: linear-gradient(135deg,#fff 60%,#FFF4D6); padding: 0 8mm; border-left: 6pt solid #F5B301; }
.eyebrow { text-transform: uppercase; letter-spacing: .2em; font-size: 9pt; color: #8A5A00; font-weight: 700; margin-bottom: 10pt; } .m { color: #6B6252; font-size: 8.5pt; font-weight: 400; }
table.t { width: 100%; border-collapse: collapse; margin: 5pt 0 8pt; font-size: 9pt; break-inside: auto; } .t th { background: #1A1307; color: #FFE9A8; text-align: left; padding: 4pt 6pt; font-weight: 600; font-size: 8.5pt; } .t td { padding: 4pt 6pt; border-bottom: 1px solid #E6DFCF; vertical-align: top; } .t tr { break-inside: avoid; } .t.sm { font-size: 8.4pt; } .t.heat td { text-align: center; } .t.heat td:first-child { text-align: left; } td.w { width: 70pt; text-align: right; white-space: nowrap; }
.src { display: inline-block; font-size: 7pt; background: #FFF1C2; color: #6a4700; border-radius: 3pt; padding: 0 3pt; margin-left: 2pt; font-weight: 700; }
.k { font-size: 6.8pt; font-weight: 700; border-radius: 3pt; padding: 0 3pt; letter-spacing: .04em; } .k.F { background: #E1EED2; color: #2f5a1a; } .k.I { background: #F1E6D0; color: #7a5a22; }
ul { margin: 3pt 0 6pt 14pt; padding: 0; } li { margin-bottom: 3pt; } .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt; } .cols > div { min-width: 0; }
.note { font-size: 8pt; color: #6B6252; } .box { background: #FFF8E3; border-left: 4pt solid #F5B301; padding: 8pt 10pt; margin: 8pt 0; break-inside: avoid; } .charts { display: grid; gap: 8pt; } svg { max-width: 100%; height: auto; }
.callout { background: #1A1307; color: #FFF8E7; border-radius: 6pt; padding: 10pt 12pt; margin: 8pt 0; } .callout b { color: #F5B301; }
.src-list li { font-size: 8.4pt; } .src-list a { color: #1A1307; word-break: break-all; }
</style>
<body>
<section class="cover"><div class="eyebrow">Pesquisa estratégica de mercado</div><h1>Nichos empresariais no Brasil<br>problemas, tecnologia e oportunidades</h1>
<p class="lead">Comparativo de seis nichos para uma empresa de desenvolvimento de software sob medida.</p><p class="m">Vemax · Data-base das fontes: ${hoje} · Documento de apoio à decisão — pesquisa de fontes públicas, sem entrevistas.</p></section>

<section class="page"><h2>1. Sumário executivo</h2>
<div class="callout"><b>Resposta curta:</b> nenhum nicho se destaca com folga. <b>${base[0].n.nome}</b> (${f1(base[0].s)}), <b>${base[1].n.nome}</b> (${f1(base[1].s)}) e <b>${base[2].n.nome}</b> (${f1(base[2].s)}) formam um grupo líder em empate técnico; <b>${last.n.nome}</b> fica por último nos quatro cenários testados.</div>
<ul>
<li><b>Empate técnico no topo.</b> A diferença entre o 1º e o 3º colocado é de ${f1(base[0].s - base[2].s)} ponto na escala 0–10 e a ordem muda conforme os pesos (seção 5). As notas são em parte inferência; não use o ranking como decisão final.</li>
<li><b>Evidência mais forte de demanda por desenvolvimento externo:</b> entre as empresas com 10+ ocupados que usam IA, <b>56%</b> contrataram fornecedores externos para modificar ou desenvolver sistemas, e as empresas que usam IA saltaram de ~65,5 mil (2024) para ~93,5 mil (2025) ${tag('S02,S03')}. Vale apenas para empresas com 10+ ocupados.</li>
<li><b>Maior volume com menor maturidade digital: prestadores de serviço.</b> 63,8% das aberturas de pequenos negócios em 2025 (3,16 milhões) e só 20% dos pequenos negócios controlam as finanças por app ou sistema ${tag('S01,S08')}. Contrapeso: 76,9% das aberturas são MEI, o que sugere ticket baixo (inferência).</li>
<li><b>Software de prateleira em consolidação:</b> comércio (Bling, Conta Azul), clínicas (iClinic, Shosp, Feegow) e condomínios (Superlógica) são dominados por grupos capitalizados (seção 6). Entrar com ERP/prontuário próprio é desvantajoso; a brecha está em integração, automação e IA sobre esses sistemas (inferência).</li>
<li><b>Condomínios:</b> menor pontuação em todos os cenários — incumbente forte, mercado digitalizado e tamanho incerto (327 mil segundo a uCondo vs. mais de 500 mil segundo outra estimativa) ${tag('S09,S10,S11')}.</li>
<li><b>Limite principal:</b> só 2 a 4 das 8 notas de cada nicho se apoiam em dado direto; <b>disposição a pagar</b> não tem dado público em nenhum nicho. Validar com entrevistas antes de investir.</li>
</ul>
<div class="charts">${charts.ranking}</div>
</section>

<section class="page"><h2>2. Metodologia e limites</h2>
<ul>
<li><b>Escopo:</b> seis nichos (comércio, prestadores de serviço, condomínios, clínicas, empresas com 10+ ocupados, novos negócios), Brasil, fontes públicas acessadas em ${hoje}.</li>
<li><b>Fontes:</b> priorizadas estatísticas oficiais (IBGE, Sebrae, Cetic.br/CGI.br) e levantamentos de associações; imprensa especializada para operações de mercado; estudos de fornecedores só com ressalva. Cada fonte tem nível de confiança (Alta/Média/Baixa) e observações na seção 9.</li>
<li><b>Fato × inferência:</b> toda afirmação com número traz código de fonte [Sxx]. O que é análise nossa está marcado como <span class="k I">INFERÊNCIA</span>.</li>
<li><b>Comparador:</b> 8 critérios, nota 0–10, pesos editáveis. Pontuação = média ponderada. Cada nota diz se é <i>Fato</i> ou <i>Inferência</i>. Quatro cenários de peso testam a robustez.</li>
<li><b>Lacunas assumidas:</b> sem dados de ticket/preço, sem entrevistas, sem universo de clínicas, sem mapeamento de software houses concorrentes (seção 8).</li>
<li><b>Nada foi inventado ou preenchido por estimativa própria sem rótulo.</b> Valores derivados são indicados como tal.</li>
</ul>
<div class="box"><b>Atenção a dois vieses das fontes.</b> (1) A pesquisa TIC Empresas cobre só empresas com 10+ ocupados — não representa MEI e microempresas, que são a maior parte dos negócios. (2) O Censo Condominial é publicado por uma empresa do setor (uCondo), e a pesquisa sobre faltas em clínicas, por um fornecedor de software (Conclínica).</div>
<h3>Critérios e pesos padrão</h3><table class="t"><thead><tr><th>Critério</th><th>Peso</th><th>Como ler</th></tr></thead><tbody>${D.criterios.map((c) => `<tr><td>${c.nome}</td><td>${c.peso}</td><td>${c.desc}</td></tr>`).join('')}</tbody></table>
</section>

<section class="page"><h2>3. Panorama: o universo de pequenos negócios</h2>
<p>Em 2025 foram abertas 5,14 milhões de empresas no Brasil; 96,5% (4,95 milhões) eram pequenos negócios, +25,7% sobre 2021 ${tag('S01')}. O Sudeste concentrou 50,1% das aberturas ${tag('S01')}.</p>
<div class="charts">${charts.setores}${charts.porte}${charts.controle}</div>
<p class="note">Pelo texto do Sebrae, serviços (63,8%), comércio (21,1%), indústria (7,6%) e agropecuária (0,8%) somam 93,3%; o restante (construção e outros) não é detalhado no trecho lido. Fontes: ${tag('S01,S08')}.</p>
<h3>Tecnologia nas empresas formais com 10+ ocupados</h3><div class="charts">${charts.crm}${charts.ia}</div>
<p class="note">CRM por porte: valores lidos do texto de gráficos do PDF (conferir no site do Cetic.br). IA: 65.529 empresas em 2024 e 93.475 em 2025 ${tag('S02,S03')}.</p>
</section>

${D.nichos.map(ficha).join('')}

<section class="page"><h2>5. Comparador e ranking</h2>
${heatTab}
<div class="charts" style="grid-template-columns:1fr 1fr;align-items:start">${charts.ranking}${charts.radar}</div>
<h3>Sensibilidade: o ranking muda com os pesos?</h3>${cenTab}
<p class="note">Cenários: Padrão (pesos do portal); Iguais (todos 1); Receita (tamanho 1,5, pagar 2, recorrência 2, digitalização 0,5); Entrada fácil (concorrência 2, aquisição 2, digitalização 1,5, aderência 1,5, tamanho 0,5, recorrência 0,5).</p>
<h3>Quão confiável é cada nota?</h3>${conf}
</section>

<section class="page"><h2>6. Concorrência e consolidação</h2>
<p>Nos nichos de comércio, clínicas e condomínios, o software de gestão padronizado está nas mãos de grupos que captaram ou foram comprados por valores relevantes. A leitura estratégica abaixo é <span class="k I">INFERÊNCIA</span>: competir de frente por ERP, prontuário ou gestão condominial exige capital e base instalada que uma empresa pequena não tem; o espaço está no que esses produtos não entregam sob medida.</p>
${consol}
<p class="note">Números de clientes de fornecedores são alegações das próprias empresas ${tag('S10,S13,S17,S19,S20')}.</p>
</section>

<section class="page"><h2>7. Recomendações e próximos passos</h2>
<div class="box"><b>Hipóteses a validar</b> (todas inferência; nenhuma dispensa entrevistas).</div>
<ol>
<li><b>Empresas com 10–249 ocupados:</b> automação de fluxos, integrações e IA aplicada. Melhor encaixe e melhor evidência de contratação externa; validar tamanho do mercado e concorrência de software houses (lacunas).</li>
<li><b>Prestadores de serviço por vertical:</b> escolher 1–2 ofícios (ex.: oficinas, assistência técnica, clínicas pequenas de estética) e testar agenda + orçamento + WhatsApp com IA. Validar se o ticket sustenta o modelo.</li>
<li><b>Clínicas — camada de automação sobre sistemas existentes:</b> confirmação/reagendamento e relacionamento. Antes, mapear LGPD e normas do CFM (não pesquisados).</li>
<li><b>Comércio:</b> apenas como integração entre ERP e canais; não construir ERP.</li>
<li><b>Condomínios:</b> despriorizar nesta fase.</li>
</ol>
<h3>Próximas pesquisas sugeridas</h3>
<ul><li>Entrevistar 8–10 donos por nicho priorizado (dor real, ferramentas atuais, quanto pagam hoje).</li><li>Consultar o CNES/DATASUS para dimensionar clínicas e consultórios.</li><li>Mapear 10 software houses concorrentes (preço, nicho, portfólio) nos nichos priorizados.</li><li>Extrair as tabelas do TIC Empresas 2025 (ERP por porte/setor) diretamente do site do Cetic.br.</li></ul>
</section>

<section class="page"><h2>8. Lacunas e dados não encontrados</h2><ul>${D.lacunas.map((l) => `<li>${l}</li>`).join('')}</ul></section>

<section class="page"><h2>9. Fontes</h2><p class="note">Todas acessadas em ${hoje}. Confiança: avaliação nossa sobre autoria, metodologia e possível viés.</p>
<ol class="src-list">${D.fontes.map((f) => `<li><b>[${f.id}]</b> ${f.titulo}. <i>${f.tipo}.</i> Confiança: <b>${f.conf}</b>. ${f.obs}<br><a href="${f.url}">${f.url}</a></li>`).join('')}</ol></section>
</body></html>`;
}

/* ---------------- Power BI (CSV) ---------------- */
function csv(rows) { const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`; return '\ufeff' + rows.map((r) => r.map(q).join(';')).join('\r\n'); }
function powerbi() {
  const w = (n, rows) => fs.writeFileSync(path.join(PBI, n), csv(rows));
  w('dim_nichos.csv', [['nicho_id', 'nicho', 'resumo'], ...D.nichos.map((n) => [n.id, n.nome, n.resumo])]);
  w('dim_criterios.csv', [['criterio_id', 'criterio', 'peso_padrao', 'descricao'], ...D.criterios.map((c) => [c.chave, c.nome, c.peso, c.desc])]);
  w('fact_notas.csv', [['nicho_id', 'criterio_id', 'nota', 'base', 'fontes', 'justificativa'], ...D.nichos.flatMap((n) => D.criterios.map((c) => { const [v, t, s, j] = n.notas[c.chave]; return [n.id, c.chave, v, t === 'F' ? 'Fato' : 'Inferência', s, j]; }))]);
  w('fact_cenarios.csv', [['cenario', 'nicho_id', 'pontuacao', 'posicao'], ...cenRank.flatMap((c) => c.rank.map((r, i) => [c.nome, r.n.id, r.s.toFixed(4), i + 1]))]);
  w('dim_cenarios_pesos.csv', [['cenario', 'criterio_id', 'peso'], ...cenRank.flatMap((c) => D.criterios.map((k) => [c.nome, k.chave, (c.pesos || pesosPadrao)[k.chave]]))]);
  w('fact_fatos.csv', [['nicho_id', 'fato', 'fonte_id'], ...D.nichos.flatMap((n) => n.fatos.map(([t, s]) => [n.id, t, s]))]);
  w('fact_concorrentes.csv', [['nicho_id', 'concorrente', 'oferta', 'evidencia', 'fonte_id', 'ameaca'], ...D.nichos.flatMap((n) => n.concorrentes.map((c) => [n.id, ...c]))]);
  w('dim_fontes.csv', [['fonte_id', 'titulo', 'url', 'tipo', 'confianca', 'observacao', 'data_acesso'], ...D.fontes.map((f) => [f.id, f.titulo, f.url, f.tipo, f.conf, f.obs, f.acesso])]);
  w('fact_macro.csv', [['indicador', 'categoria', 'valor', 'unidade', 'fonte_id'],
    ['Pequenos negócios abertos 2025', 'Serviços', 3.16, 'milhões', 'S01'], ['Pequenos negócios abertos 2025', 'Comércio', 1.05, 'milhões', 'S01'], ['Pequenos negócios abertos 2025', 'Indústria', 0.378, 'milhões', 'S01'], ['Pequenos negócios abertos 2025', 'Agropecuária', 0.038, 'milhões', 'S01'],
    ['Aberturas 2025 por porte', 'MEI', 3.81, 'milhões', 'S01'], ['Aberturas 2025 por porte', 'ME', 0.933, 'milhões', 'S01'], ['Aberturas 2025 por porte', 'EPP', 0.209, 'milhões', 'S01'],
    ['Controle financeiro', 'Planilha', 30, '%', 'S08'], ['Controle financeiro', 'Caderno', 25, '%', 'S08'], ['Controle financeiro', 'App/sistema', 20, '%', 'S08'], ['Controle financeiro', 'Contador', 13, '%', 'S08'], ['Controle financeiro', 'Nenhum', 10, '%', 'S08'],
    ['Empresas que usam IA (estimativa)', '2024', 65529, 'empresas', 'S02'], ['Empresas que usam IA (estimativa)', '2025', 93475, 'empresas', 'S03'],
    ['CRM 2024', 'Total', 25, '%', 'S03'], ['CRM 2024', 'Pequenas', 23, '%', 'S03'], ['CRM 2024', 'Médias', 38, '%', 'S03'], ['CRM 2024', 'Grandes', 50, '%', 'S03'],
    ['CRM 2025', 'Total', 31, '%', 'S03'], ['CRM 2025', 'Pequenas', 29, '%', 'S03'], ['CRM 2025', 'Médias', 41, '%', 'S03'], ['CRM 2025', 'Grandes', 56, '%', 'S03']]);
  fs.writeFileSync(path.join(PBI, 'LEIA-ME.md'), `# Pacote Power BI

Não foi possível gerar um arquivo .pbix neste ambiente (o Power BI Desktop não está disponível). Esta pasta contém o **modelo de dados pronto** para importar.

## Montagem (10 minutos)
1. Power BI Desktop → **Obter dados → Texto/CSV**. Importe todos os .csv desta pasta (delimitador ponto e vírgula, UTF-8).
2. **Modelo** → crie relações (um-para-muitos, filtro único):
   - dim_nichos[nicho_id] → fact_notas[nicho_id], fact_cenarios[nicho_id], fact_fatos[nicho_id], fact_concorrentes[nicho_id]
   - dim_criterios[criterio_id] → fact_notas[criterio_id], dim_cenarios_pesos[criterio_id]
   - dim_fontes[fonte_id] → fact_fatos[fonte_id], fact_concorrentes[fonte_id], fact_macro[fonte_id]
3. Medidas DAX:

\`\`\`
Pontuação padrão =
DIVIDE(
  SUMX(fact_notas, fact_notas[nota] * RELATED(dim_criterios[peso_padrao])),
  SUMX(fact_notas, RELATED(dim_criterios[peso_padrao]))
)

% notas com fato =
DIVIDE(CALCULATE(COUNTROWS(fact_notas), fact_notas[base] = "Fato"), COUNTROWS(fact_notas))
\`\`\`
4. Visuais sugeridos: barras (nicho × Pontuação padrão), radar (critério × nota, filtro por nicho), matriz (nicho × critério com formatação condicional na nota), tabela de cenários (fact_cenarios) e cartões de fact_macro.
`);
}

/* ---------------- Excel ---------------- */
async function excel(pngRank, pngRadar) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'Vemax'; wb.created = new Date();
  const GOLD = 'FFF5B301', DARKC = 'FF1A1307', CREAM = 'FFFFF4D6';
  const hdr = (row) => { row.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFE9A8' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARKC } }; c.alignment = { vertical: 'middle', wrapText: true }; }); row.height = 28; };
  const wrap = { vertical: 'top', wrapText: true };

  /* Matriz (editável, com fórmulas) */
  const m = wb.addWorksheet('Matriz', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
  m.getCell('A1').value = 'Matriz de notas (0–10) — edite notas e pesos; as pontuações recalculam'; m.getCell('A1').font = { bold: true, size: 14 };
  m.getCell('A2').value = 'Células amarelas = pesos editáveis. Nota com asterisco na aba Evidências = inferência.'; m.getCell('A2').font = { italic: true, color: { argb: 'FF6B6252' } };
  m.getRow(3).values = ['Peso →', ...D.criterios.map((c) => c.peso)];
  m.getRow(3).eachCell((c, i) => { if (i > 1) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2A8' } }; c.font = { bold: true }; c.alignment = { horizontal: 'center' }; } });
  m.getRow(4).values = ['Nicho', ...D.criterios.map((c) => c.nome), 'Pontuação ponderada', 'Posição'];
  hdr(m.getRow(4));
  const NR = D.nichos.length;
  D.nichos.forEach((n, i) => {
    const r = 5 + i; const s = base.find((b) => b.n.id === n.id).s;
    m.getRow(r).values = [n.nome, ...D.criterios.map((c) => n.notas[c.chave][0])];
    m.getCell(r, 10).value = { formula: `SUMPRODUCT(B${r}:I${r},$B$3:$I$3)/SUM($B$3:$I$3)`, result: s };
    m.getCell(r, 11).value = { formula: `RANK(J${r},$J$5:$J$${4 + NR})`, result: base.findIndex((b) => b.n.id === n.id) + 1 };
    m.getCell(r, 10).numFmt = '0.00'; m.getCell(r, 10).font = { bold: true };
    for (let k = 2; k <= 9; k++) m.getCell(r, k).alignment = { horizontal: 'center' };
  });
  m.addConditionalFormatting({ ref: `B5:I${4 + NR}`, rules: [{ type: 'colorScale', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 5 }, { type: 'num', value: 10 }], color: [{ argb: 'FFFFFFFF' }, { argb: 'FFFFE08A' }, { argb: 'FFD9962B' }] }] });
  m.addConditionalFormatting({ ref: `J5:J${4 + NR}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 10 }], color: { argb: 'FFF5B301' }, gradient: false }] });
  m.getColumn(1).width = 28; for (let k = 2; k <= 9; k++) m.getColumn(k).width = 15; m.getColumn(10).width = 18; m.getColumn(11).width = 10;

  /* Dashboard */
  const d = wb.addWorksheet('Dashboard', { views: [{ showGridLines: false }] }); wb.worksheets.unshift(wb.worksheets.pop());
  d.columns = [{ width: 3 }, { width: 30 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  d.mergeCells('B2:I2'); d.getCell('B2').value = 'Pesquisa de mercado — nichos empresariais no Brasil'; d.getCell('B2').font = { bold: true, size: 20, color: { argb: DARKC } };
  d.mergeCells('B3:I3'); d.getCell('B3').value = 'Painel comparativo · fontes públicas acessadas em 07/10/2026 · pontuação recalcula a partir da aba Matriz'; d.getCell('B3').font = { color: { argb: 'FF6B6252' } };
  const kpi = (cell, label, val) => { d.getCell(cell).value = label; d.getCell(cell).font = { size: 9, color: { argb: 'FF6B6252' } }; const [c, r] = [cell.replace(/\d/g, ''), +cell.replace(/\D/g, '') + 1]; d.getCell(c + r).value = val; d.getCell(c + r).font = { bold: true, size: 15 }; [d.getCell(cell), d.getCell(c + r)].forEach((x) => { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } }; }); };
  d.mergeCells('B5:C5'); d.mergeCells('B6:C6'); d.mergeCells('D5:E5'); d.mergeCells('D6:E6'); d.mergeCells('F5:G5'); d.mergeCells('F6:G6'); d.mergeCells('H5:I5'); d.mergeCells('H6:I6');
  kpi('B5', 'Nicho com maior pontuação', { formula: `INDEX(Matriz!A5:A${4 + NR},MATCH(MAX(Matriz!J5:J${4 + NR}),Matriz!J5:J${4 + NR},0))`, result: base[0].n.nome });
  kpi('D5', 'Maior pontuação', { formula: `MAX(Matriz!J5:J${4 + NR})`, result: base[0].s }); d.getCell('D6').numFmt = '0.00';
  kpi('F5', 'Nichos analisados', NR);
  kpi('H5', 'Notas ancoradas em fato', `${D.nichos.reduce((a, n) => a + nFatos(n), 0)} de ${NR * 8}`);
  d.getRow(8).values = [null, 'Nicho', 'Pontuação', 'Posição', 'Notas c/ fato'];
  [2, 3, 4, 5].forEach((k) => { const c = d.getCell(8, k); c.font = { bold: true, color: { argb: 'FFFFE9A8' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARKC } }; });
  D.nichos.forEach((n, i) => { const r = 9 + i, mr = 5 + i; d.getCell(r, 2).value = { formula: `Matriz!A${mr}`, result: n.nome }; d.getCell(r, 3).value = { formula: `Matriz!J${mr}`, result: base.find((b) => b.n.id === n.id).s }; d.getCell(r, 3).numFmt = '0.00'; d.getCell(r, 4).value = { formula: `Matriz!K${mr}`, result: base.findIndex((b) => b.n.id === n.id) + 1 }; d.getCell(r, 5).value = `${nFatos(n)} de 8`; d.getCell(r, 4).alignment = { horizontal: 'center' }; d.getCell(r, 5).alignment = { horizontal: 'center' }; });
  d.addConditionalFormatting({ ref: `C9:C${8 + NR}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 10 }], color: { argb: 'FFF5B301' }, gradient: false }] });
  d.getRow(17).values = [null, 'Sensibilidade — posição por cenário']; d.getCell('B17').font = { bold: true, size: 12 };
  d.getRow(18).values = [null, 'Nicho', ...cenRank.map((c) => c.nome)]; for (let k = 2; k <= 6; k++) { const c = d.getCell(18, k); c.font = { bold: true, color: { argb: 'FFFFE9A8' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARKC } }; c.alignment = { wrapText: true }; } d.getRow(18).height = 30;
  D.nichos.forEach((n, i) => { const r = 19 + i; d.getCell(r, 2).value = n.nome; cenRank.forEach((c, k) => { d.getCell(r, 3 + k).value = c.rank.findIndex((x) => x.n.id === n.id) + 1; d.getCell(r, 3 + k).alignment = { horizontal: 'center' }; }); });
  d.addConditionalFormatting({ ref: `C19:F${18 + NR}`, rules: [{ type: 'colorScale', cfvo: [{ type: 'num', value: 1 }, { type: 'num', value: NR }], color: [{ argb: 'FFF5B301' }, { argb: 'FFFFFFFF' }] }] });
  d.getCell('B26').value = 'A ordem muda com os pesos: trate o ranking como indicativo. Condomínios fica em último nos quatro cenários.'; d.getCell('B26').font = { italic: true, color: { argb: 'FF6B6252' } };
  const i1 = wb.addImage({ filename: pngRank, extension: 'png' }), i2 = wb.addImage({ filename: pngRadar, extension: 'png' });
  d.addImage(i1, { tl: { col: 1, row: 27 }, ext: { width: 640, height: 250 } });
  d.addImage(i2, { tl: { col: 1, row: 41 }, ext: { width: 420, height: 470 } });

  /* Evidências */
  const e = wb.addWorksheet('Evidências', { views: [{ state: 'frozen', ySplit: 1 }] });
  e.addRow(['Nicho', 'Critério', 'Nota', 'Base', 'Fontes', 'Justificativa']); hdr(e.getRow(1));
  D.nichos.forEach((n) => D.criterios.forEach((c) => { const [v, t, s, j] = n.notas[c.chave]; const r = e.addRow([n.nome, c.nome, v, t === 'F' ? 'Fato' : 'Inferência', s, j]); r.eachCell((x) => (x.alignment = wrap)); if (t === 'I') r.getCell(4).font = { italic: true, color: { argb: 'FF7A5A22' } }; }));
  [24, 30, 8, 12, 14, 80].forEach((w, i) => (e.getColumn(i + 1).width = w)); e.autoFilter = 'A1:F1';

  const sheetTable = (name, head, rows, widths) => { const s = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] }); s.addRow(head); hdr(s.getRow(1)); rows.forEach((r) => s.addRow(r).eachCell((x) => (x.alignment = wrap))); widths.forEach((w, i) => (s.getColumn(i + 1).width = w)); s.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.length } }; return s; };
  sheetTable('Fatos', ['Nicho', 'Fato levantado', 'Fonte'], D.nichos.flatMap((n) => n.fatos.map(([t, s]) => [n.nome, t, s])), [24, 110, 14]);
  sheetTable('Fichas', ['Nicho', 'Tipo', 'Item', 'Base', 'Fonte'], D.nichos.flatMap((n) => [
    ...n.problemas.map(([t, k, s]) => [n.nome, 'Problema real', t, k === 'F' ? 'Fato' : 'Inferência', s || '']),
    ...n.necessidades.map(([t, k]) => [n.nome, 'Necessidade não atendida', t, k === 'F' ? 'Fato' : 'Inferência', '']),
    ...n.oportunidades.map((t) => [n.nome, 'Oportunidade', t, 'Inferência', '']),
    ...n.riscos.map((t) => [n.nome, 'Risco', t, 'Inferência', ''])]), [24, 24, 100, 12, 12]);
  sheetTable('Concorrentes', ['Nicho', 'Concorrente', 'O que oferece', 'Evidência', 'Fonte', 'Ameaça'], D.nichos.flatMap((n) => n.concorrentes.map((c) => [n.nome, ...c])), [24, 30, 40, 55, 10, 12]);
  const f = sheetTable('Fontes', ['ID', 'Fonte', 'Tipo', 'Confiança', 'Observação', 'URL', 'Acesso'], D.fontes.map((x) => [x.id, x.titulo, x.tipo, x.conf, x.obs, x.url, x.acesso]), [7, 60, 36, 12, 70, 60, 12]);
  f.eachRow((r, i) => { if (i > 1) r.getCell(6).value = { text: r.getCell(6).value, hyperlink: r.getCell(6).value }; });
  sheetTable('Lacunas', ['#', 'Lacuna ou limitação'], D.lacunas.map((l, i) => [i + 1, l]), [5, 140]);
  await wb.xlsx.writeFile(path.join(OUT, 'planilha-mercado-nichos.xlsx'));
}

/* ---------------- execução ---------------- */
(async () => {
  powerbi();
  const pr = path.join(TMP, 'rank.png'), pd = path.join(TMP, 'radar.png');
  svgToPng(charts.ranking, 640, 220, pr); svgToPng(charts.radar, 420, 470, pd);
  await excel(pr, pd);
  const htmlFile = path.join(TMP, 'relatorio.html');
  fs.writeFileSync(htmlFile, html());
  execFileSync(EDGE, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${path.join(OUT, 'relatorio-mercado-nichos.pdf')}`, 'file:///' + htmlFile.replace(/\\/g, '/')], { stdio: 'ignore' });
  fs.copyFileSync(htmlFile, path.join(OUT, 'relatorio-mercado-nichos.html'));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('ok ->', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
