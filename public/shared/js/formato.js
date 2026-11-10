// Formatação e cálculos puros compartilhados pelo site, pelo portal e pelos próximos módulos:
// datas (sempre 'YYYY-MM-DD'), dinheiro, parcelamento e normalização de texto.
// Sem DOM e sem banco, para ser testado em Node (`npm test`).

// ---------- datas (calculadas em UTC para não variar com o fuso) ----------
const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const fromISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
/** Hoje no fuso do navegador (a equipe trabalha no horário local), no formato ISO de data. */
export const hojeISO = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const addDias = (iso, n) => { const d = fromISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
/** Soma meses mantendo o dia; se o mês de destino for mais curto, usa o último dia (31/01 + 1 mês = 28 ou 29/02). */
export const addMeses = (iso, n) => {
  const d = fromISO(iso), dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return toISO(d);
};
export const diffDias = (a, b) => Math.round((fromISO(a) - fromISO(b)) / 864e5);   // a - b, em dias
/** Dias desde um timestamp (ISO completo) até agora. */
export const diasDesde = (ts, now = Date.now()) => Math.floor((now - new Date(ts).getTime()) / 864e5);

/** Entende prazos escritos à mão ("6 semanas", "30 dias", "2 meses") e devolve a data de entrega a partir de hoje; null se não entender. */
export function prazoDeTexto(txt, hoje = hojeISO()) {
  const m = /(\d{1,3})\s*(dias?|semanas?|mes(?:es)?)\b/.exec(String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].startsWith('dia') ? addDias(hoje, n) : m[2].startsWith('sem') ? addDias(hoje, n * 7) : addMeses(hoje, n);
}

/** Intervalos prontos de filtro. Devolve {de, ate} (inclusive) ou {} para "todos". */
export function periodo(chave, hoje = hojeISO()) {
  const [y, m] = hoje.split('-').map(Number);
  const ult = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  switch (chave) {
    case 'mes': return { de: `${y}-${pad(m)}-01`, ate: `${y}-${pad(m)}-${pad(ult(y, m))}` };
    case 'mes_anterior': { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return { de: `${yy}-${pad(mm)}-01`, ate: `${yy}-${pad(mm)}-${pad(ult(yy, mm))}` }; }
    case '30d': return { de: addDias(hoje, -29), ate: hoje };
    case '90d': return { de: addDias(hoje, -89), ate: hoje };
    case 'ano': return { de: `${y}-01-01`, ate: `${y}-12-31` };
    default: return {};
  }
}
/** `iso` pode ser data pura ou timestamp; timestamp vira a data local (22h do último dia do mês ainda conta nesse mês). */
export const dentro = (iso, { de, ate } = {}) => {
  if (!iso) return false;
  const dia = String(iso).length > 10 ? hojeISO(new Date(iso)) : String(iso);
  return (!de || dia >= de) && (!ate || dia <= ate);
};

// ---------- dinheiro ----------
export const brl = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const cents = (v) => Math.round(Number(v) * 100);
export const soma = (rows, campo) => rows.reduce((t, r) => t + cents(r[campo] ?? 0), 0) / 100;

/** Divide `valor` em n parcelas mensais. A diferença de centavos vai para a última, então a soma fecha exatamente. */
export function parcelar(valor, n, primeiroVenc) {
  const total = cents(valor);
  if (!Number.isInteger(n) || n < 1 || n > 60 || !(total > 0)) return [];
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    parcela: i + 1, total_parcelas: n,
    valor: (i === n - 1 ? total - base * (n - 1) : base) / 100,
    vencimento: addMeses(primeiroVenc, i),
  }));
}

// ---------- texto ----------
export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SUFIXOS = /\b(ltda|me|mei|epp|eireli|sa|s a|cia|company)\b/g;
/** Nome comparável: sem acento, caixa, pontuação nem sufixo societário. "Padaria Pão Doce Ltda." == "padaria pao doce". */
export const normNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').replace(SUFIXOS, ' ').replace(/\s+/g, ' ').trim();
export const normEmail = (s) => String(s || '').trim().toLowerCase();
export const urlValida = (s) => { try { const u = new URL(String(s)); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } };
/** Chave técnica estável a partir de um nome ("Redes sociais" -> "redes_sociais"). */
export const slug = (s) => semAcento(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

/** Valor de um campo do banco para exibir em CSV/planilha sem quebrar (aspas, quebras de linha e fórmulas). */
export const csvCell = (v) => {
  if (typeof v === 'number') return String(v);
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;      // evita injeção de fórmula ao abrir no Excel
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
