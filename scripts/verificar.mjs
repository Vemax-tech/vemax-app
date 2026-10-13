// Verificação estática do projeto (substitui um "lint" num projeto sem build):
//  1. todo .js do site e do portal passa em `node --check`;
//  2. todo import relativo aponta para um arquivo que existe;
//  3. toda página do portal importa um módulo que existe e chama uma função que ele exporta;
//  4. todo item do menu aponta para uma página que existe;
//  5. as migrations são numeradas em sequência, sem buracos.
// Uso: npm run check
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

// 1) sintaxe
const js = [...listar(path.join(RAIZ, 'app'), (p) => p.endsWith('.js')), ...listar(path.join(RAIZ, 'assets'), (p) => p.endsWith('.js')), ...listar(path.join(RAIZ, 'tests'), (p) => p.endsWith('.js')), ...listar(path.join(RAIZ, 'scripts'), (p) => p.endsWith('.mjs'))];
for (const f of js) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) falha(`Sintaxe: ${rel(f)}\n${r.stderr.split('\n').slice(0, 4).join('\n')}`);
}

// 2) imports relativos
for (const f of js.filter((x) => x.includes(`${path.sep}app${path.sep}`))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    if (!existsSync(path.resolve(path.dirname(f), m[1]))) falha(`Import quebrado em ${rel(f)}: ${m[1]}`);
  }
}

// 3) páginas do portal
const paginas = listar(path.join(RAIZ, 'app'), (p) => p.endsWith('.html'));
for (const f of paginas) {
  const src = readFileSync(f, 'utf8');
  const m = /import\s*\{\s*(\w+)\s*\}\s*from\s*'([^']+)'/.exec(src);
  if (!m) { if (!f.includes(`${path.sep}login${path.sep}`)) falha(`Página sem módulo: ${rel(f)}`); continue; }
  const alvo = path.resolve(path.dirname(f), m[2]);
  if (!existsSync(alvo)) { falha(`Página ${rel(f)} importa módulo inexistente: ${m[2]}`); continue; }
  if (!new RegExp(`export\\s+(?:const|async function|function)\\s+${m[1]}\\b`).test(readFileSync(alvo, 'utf8'))) falha(`Página ${rel(f)}: o módulo não exporta ${m[1]}`);
  if (!/name="robots" content="noindex/.test(src)) falha(`Página sem noindex: ${rel(f)}`);
}

// 4) menu
const ui = readFileSync(path.join(RAIZ, 'app/js/ui.js'), 'utf8');
const nav = ui.slice(ui.indexOf('const NAV = ['), ui.indexOf('];', ui.indexOf('const NAV = [')));
for (const m of nav.matchAll(/\[\s*'([^']*)'\s*,\s*'[^']+'\s*,\s*'(\w+)'/g)) {
  const destino = path.join(RAIZ, 'app', m[1], 'index.html');
  if (!existsSync(destino)) falha(`Menu aponta para página inexistente: ${m[1]}`);
  if (!new RegExp(`\\b${m[2]}:\\s*'<`).test(ui)) falha(`Ícone do menu não definido: ${m[2]}`);
}

// 5) migrations
const migr = readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((n) => n.endsWith('.sql')).sort();
migr.forEach((n, i) => { if (!n.startsWith(String(i + 1).padStart(3, '0') + '_')) falha(`Migrations fora de sequência: esperado ${String(i + 1).padStart(3, '0')}_, achei ${n}`); });

if (erros.length) { console.error(`✗ ${erros.length} problema(s):\n\n` + erros.join('\n\n')); process.exit(1); }
console.log(`✓ ${js.length} arquivos JS com sintaxe válida, ${paginas.length} páginas do portal, ${migr.length} migrations em sequência.`);
