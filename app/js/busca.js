// Busca global (Ctrl+K): procura clientes, leads, propostas, projetos, tarefas e chamados de uma vez.
// Só consulta o que a pessoa pode ver; a RLS do banco garante o resto. Recebe as dependências por parâmetro
// para não criar import circular com ui.js.
import { limparBusca } from '../../shared/js/validacao.js';

export function initBusca({ sb, h, modal, icon, side, ctx, root }) {
  const btn = h('button', { class: 'navi busca-btn', type: 'button', 'aria-label': 'Buscar (Ctrl+K)' }, icon('search'), 'Buscar', h('kbd', {}, 'Ctrl K'));
  side.querySelector('.brand')?.after(btn);

  // Cada fonte: tabela, colunas pesquisadas, permissão, rótulo, link e como mostrar o título.
  const FONTES = [
    { tipo: 'Cliente', tabela: 'clientes', cols: ['nome', 'razao_social', 'email', 'telefone', 'documento'], mod: 'clientes', titulo: (r) => r.nome, sub: (r) => r.email || r.telefone || '', href: (r) => `${root}clientes/ficha.html?id=${r.id}`, campos: 'id,nome,email,telefone' },
    { tipo: 'Lead', tabela: 'contatos_site', cols: ['nome', 'empresa', 'pessoa_contato', 'email', 'contato'], mod: 'contatos', titulo: (r) => r.empresa || r.nome, sub: (r) => r.email || r.contato || '', href: (r) => `${root}contatos/?abrir=${r.id}`, campos: 'id,nome,empresa,email,contato' },
    { tipo: 'Proposta', tabela: 'propostas', cols: ['titulo'], mod: 'contatos', titulo: (r) => r.titulo, sub: () => '', href: (r) => `${root}propostas/?abrir=${r.id}`, campos: 'id,titulo' },
    { tipo: 'Projeto', tabela: 'projetos', cols: ['titulo', 'cliente'], mod: 'projetos', titulo: (r) => r.titulo, sub: (r) => r.cliente || '', href: (r) => `${root}projetos/detalhe.html?id=${r.id}`, campos: 'id,titulo,cliente' },
    { tipo: 'Tarefa', tabela: 'tarefas', cols: ['titulo'], mod: 'projetos', titulo: (r) => r.titulo, sub: () => '', href: (r) => `${root}tarefas/?abrir=${r.id}`, campos: 'id,titulo' },
    { tipo: 'Chamado', tabela: 'chamados', cols: ['assunto'], mod: 'suporte', titulo: (r) => `#${r.numero} · ${r.assunto}`, sub: () => '', href: (r) => `${root}suporte/?abrir=${r.id}`, campos: 'id,numero,assunto' },
  ].filter((f) => ctx.can(f.mod));
  if (!FONTES.length) { btn.remove(); return; }

  const limpar = limparBusca;       // o texto entra num filtro do PostgREST: só letras, números, espaço e @ . + -

  let aberta = false;
  const abrir = () => {
    if (aberta) return; aberta = true;
    const input = h('input', { type: 'search', placeholder: 'Buscar cliente, lead, proposta, projeto, tarefa ou chamado…', 'aria-label': 'Buscar', autocomplete: 'off', maxlength: 80 });
    const lista = h('div', { style: 'margin-top:14px;min-height:60px', 'aria-live': 'polite' }, h('p', { class: 'small muted' }, 'Digite pelo menos 2 letras. Dica: Ctrl+K abre a busca em qualquer tela.'));
    let seq = 0, timer;
    const buscar = async () => {
      const q = limpar(input.value), minha = ++seq;
      if (q.length < 2) { lista.replaceChildren(h('p', { class: 'small muted' }, 'Digite pelo menos 2 letras.')); return; }
      lista.replaceChildren(h('p', { class: 'small muted' }, 'Buscando…'));
      const resultados = await Promise.all(FONTES.map(async (f) => {
        const ou = f.cols.map((c) => `${c}.ilike.%${q}%`).concat(f.tabela === 'chamados' && /^\d{1,9}$/.test(q) ? [`numero.eq.${q}`] : []).join(',');
        const { data, error } = await sb.from(f.tabela).select(f.campos).is('deleted_at', null).or(ou).limit(5);
        return error ? [] : (data || []).map((r) => ({ f, r }));
      }));
      if (minha !== seq) return;                       // chegou uma busca mais nova; descarta esta
      const todos = resultados.flat();
      lista.replaceChildren(todos.length
        ? h('ul', { class: 'ul-list' }, todos.map(({ f, r }) => h('li', { class: 'row between' },
          h('a', { class: 't', href: f.href(r) }, f.titulo(r), f.sub(r) && h('span', { class: 'small muted' }, ' · ' + f.sub(r))),
          h('span', { class: 'badge dim' }, f.tipo))))
        : h('p', { class: 'small muted' }, `Nada encontrado para “${q}”.`));
    };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(buscar, 250); });
    modal('Buscar', h('div', {}, input, lista), (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')), () => { aberta = false; });
    input.focus();
  };
  btn.addEventListener('click', abrir);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrir(); }
  });
}
