// Verificação estática do projeto (substitui um "lint" num projeto sem build):
//  1. todo .js do site e do portal passa em `node --check`;
//  2. todo import relativo aponta para um arquivo que existe;
//  3. toda página do portal chama o boot.js com um módulo e uma função que existem;
//  4. regras de segurança: sem script embutido, CSP presente, supabase-js com versão exata, sem eval/innerHTML dinâmico;
//  5. todo item do menu aponta para uma página que existe;
//  6. as migrations são numeradas em sequência, sem buracos;
//  7. todo CSS, script e imagem local referenciado nas páginas existe;
//  8. o wrangler.jsonc publica só a pasta public/.
// Uso: npm run check
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(RAIZ, 'public'); // tudo o que vai ao ar
const erros = [];
const falha = (m) => erros.push(m);

function listar(dir, ok) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '.git') continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...listar(p, ok)); else if (ok(p)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(RAIZ, p).replaceAll('\\', '/');
const sep = path.sep;

// 1) sintaxe
const js = [
  ...listar(path.join(SITE, 'app'), (p) => p.endsWith('.js')),
  ...listar(path.join(SITE, 'shared/js'), (p) => p.endsWith('.js')),
  ...listar(path.join(SITE, 'assets'), (p) => p.endsWith('.js')),
  ...listar(path.join(RAIZ, 'tests'), (p) => p.endsWith('.js') || p.endsWith('.mjs')),
  ...listar(path.join(RAIZ, 'scripts'), (p) => p.endsWith('.mjs')),
];
for (const f of js) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) falha(`Sintaxe: ${rel(f)}\n${r.stderr.split('\n').slice(0, 4).join('\n')}`);
}

// 2) imports relativos (portal e módulos compartilhados: é o que quebra ao mover arquivo de pasta)
for (const f of js.filter((x) => ['app', 'shared'].some((a) => x.includes(`${sep}${a}${sep}`)))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    if (!existsSync(path.resolve(path.dirname(f), m[1]))) falha(`Import quebrado em ${rel(f)}: ${m[1]}`);
  }
}

// 3) páginas do portal: cada uma chama boot.js com módulo e função que existem
const AREAS = ['app'];
const reBoot = /<script type="module" src="[^"]*js\/boot\.js" data-modulo="([a-z]+)" data-fn="(\w+)"><\/script>/;
let nPaginas = 0;
for (const area of AREAS) {
  for (const f of listar(path.join(SITE, area), (p) => p.endsWith('.html'))) {
    nPaginas++;
    const src = readFileSync(f, 'utf8');
    const m = reBoot.exec(src);
    if (!m) { if (!f.includes(`${sep}login${sep}`)) falha(`Página sem boot.js: ${rel(f)}`); continue; }
    const alvo = path.join(SITE, area, 'js/modules', m[1] + '.js');
    if (!existsSync(alvo)) { falha(`Página ${rel(f)} aponta para módulo inexistente: ${m[1]}`); continue; }
    if (!new RegExp(`export\\s+(?:const|async function|function)\\s+${m[2]}\\b`).test(readFileSync(alvo, 'utf8'))) falha(`Página ${rel(f)}: o módulo ${m[1]} não exporta ${m[2]}`);
    if (!/name="robots" content="noindex/.test(src)) falha(`Página sem noindex: ${rel(f)}`);
  }
}

// 4) segurança
// 4a) nenhuma página pode ter script embutido nem manipulador on*= em atributo (a CSP não permite)
const htmls = listar(SITE, (p) => p.endsWith('.html'));
for (const f of htmls) {
  const src = readFileSync(f, 'utf8');
  const semJsonLd = src.replace(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '');
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(semJsonLd)) falha(`Script embutido (bloqueado pela CSP): ${rel(f)}`);
  if (/\son[a-z]+\s*=\s*["']/i.test(semJsonLd)) falha(`Manipulador de evento em atributo (bloqueado pela CSP): ${rel(f)}`);
}
// 4b) cabeçalhos
const hdr = existsSync(path.join(SITE, '_headers')) ? readFileSync(path.join(SITE, '_headers'), 'utf8') : '';
for (const d of ["default-src 'self'", 'frame-ancestors', "object-src 'none'", "base-uri 'self'", 'X-Content-Type-Options: nosniff', 'Referrer-Policy', 'Strict-Transport-Security']) {
  if (!hdr.includes(d)) falha(`_headers sem: ${d}`);
}
if (/script-src[^;]*'unsafe-(inline|eval)'/.test(hdr)) falha("_headers permite 'unsafe-inline' ou 'unsafe-eval' em script-src");
// 4c) supabase-js com versão exata
const sup = readFileSync(path.join(SITE, 'app/js/supabase.js'), 'utf8');
if (!/supabase-js@\d+\.\d+\.\d+\//.test(sup)) falha('supabase-js deve ter versão exata no import (ex.: @2.117.3), nunca @2');
// 4d) código do navegador (todas as áreas, inclusive os módulos compartilhados)
// innerHTML só é aceito a partir do mapa de ícones, que é conteúdo fixo no código (ICONS[...] / icons[...]).
const iconeEstatico = (rhs) => /^(ICONS|icons)\[/.test(rhs.trim());
for (const f of js.filter((x) => ['app', 'shared', 'assets'].some((a) => x.includes(`${sep}${a}${sep}`)))) {
  const src = readFileSync(f, 'utf8');
  const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (/\beval\s*\(|new\s+Function\s*\(/.test(semComentarios)) falha(`eval/new Function em ${rel(f)}`);
  if (/service_role/.test(semComentarios)) falha(`Referência a service_role em código do navegador: ${rel(f)}`);
  const dinamico = [...semComentarios.matchAll(/\.innerHTML\s*=\s*([^;\n]+)/g)].filter((m) => !iconeEstatico(m[1]));
  if (dinamico.length) falha(`innerHTML com valor dinâmico em ${rel(f)}: ${dinamico[0][1].slice(0, 60)}`);
}

// 5) menu do portal: todo item aponta para uma página que existe e usa um ícone definido
for (const area of AREAS) {
  const ui = readFileSync(path.join(SITE, area, 'js/ui.js'), 'utf8');
  const nav = ui.slice(ui.indexOf('const NAV = ['), ui.indexOf('];', ui.indexOf('const NAV = [')));
  for (const m of nav.matchAll(/\[\s*'([^']*)'\s*,\s*'[^']+'\s*,\s*'(\w+)'/g)) {
    if (!existsSync(path.join(SITE, area, m[1], 'index.html'))) falha(`Menu de ${area} aponta para página inexistente: ${m[1]}`);
    if (!new RegExp(`\\b${m[2]}:\\s*'<`).test(ui)) falha(`Ícone do menu de ${area} não definido: ${m[2]}`);
  }
}

// 6) migrations
const migr = readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((n) => n.endsWith('.sql')).sort();
migr.forEach((n, i) => { if (!n.startsWith(String(i + 1).padStart(3, '0') + '_')) falha(`Migrations fora de sequência: esperado ${String(i + 1).padStart(3, '0')}_, achei ${n}`); });

// 7) referências locais nas páginas (CSS, scripts, imagens e links para outras páginas do site)
let nRefs = 0;
for (const f of htmls) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\s(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
    const ref = m[1];
    if (/^(?:[a-z]+:|\/\/|mailto:|tel:)/i.test(ref) || ref.includes('${')) continue;
    nRefs++;
    let alvo = ref.startsWith('/') ? path.join(SITE, ref) : path.resolve(path.dirname(f), ref);
    if (alvo.endsWith(sep) || (existsSync(alvo) && statSync(alvo).isDirectory())) alvo = path.join(alvo, 'index.html');
    if (!existsSync(alvo)) falha(`Referência quebrada em ${rel(f)}: ${ref}`);
  }
}

// 8) deploy: o Cloudflare publica só public/ (docs, banco, testes e scripts nunca vão ao ar)
const wr = readFileSync(path.join(RAIZ, 'wrangler.jsonc'), 'utf8');
if (!/"directory"\s*:\s*"\.\/public"/.test(wr)) falha('wrangler.jsonc: assets.directory deve ser "./public"');
for (const f of listar(SITE, (p) => /\.(md|sql|ts|mjs)$|package(-lock)?\.json$/.test(p))) falha(`Arquivo que não é do site dentro de public/: ${rel(f)}`);

if (erros.length) { console.error(`✗ ${erros.length} problema(s):\n\n` + erros.join('\n\n')); process.exit(1); }
console.log(`✓ ${js.length} arquivos JS com sintaxe válida, ${nPaginas} páginas do portal, ${htmls.length} páginas HTML sem script embutido e com ${nRefs} referências locais válidas, CSP presente, ${migr.length} migrations em sequência.`);
