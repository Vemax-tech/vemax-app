// Equipe (somente admin): usuários, papéis e permissões por módulo
import { sb } from '../supabase.js';
import { start, h, run, pageHead, empty, fmtDate, formModal } from '../ui.js';

const MODS = { mercado: 'Inteligência de Mercado', projetos: 'Projetos', contatos: 'Contatos do site', conhecimento: 'Base de conhecimento' };

export const init = () => start('equipe/', 'Equipe', async (ctx, view) => {
  const users = (await run(sb.from('profiles').select('*').order('criado_em'))) || [];
  const perms = (await run(sb.from('permissoes').select('*'))) || [];
  const logs = (await run(sb.from('atividades').select('*').order('criado_em', { ascending: false }).limit(30))) || [];
  const nameOf = (uid) => users.find((u) => u.id === uid)?.nome || '—';

  const upd = async (u, patch) => { if (u.id === ctx.user.id && ('papel' in patch || 'ativo' in patch)) return 'self'; return run(sb.from('profiles').update(patch).eq('id', u.id).select().single(), 'Atualizado.'); };

  const usersTable = h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Nome', 'Cargo', 'Papel', 'Ativo', 'Desde', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, users.map((u) => h('tr', {}, h('td', {}, h('b', {}, u.nome)), h('td', {}, u.cargo || '—'),
      h('td', {}, h('select', { 'aria-label': 'Papel de ' + u.nome, disabled: u.id === ctx.user.id, style: 'width:auto', onchange: async (e) => { if (!(await upd(u, { papel: e.target.value }))) e.target.value = u.papel; else u.papel = e.target.value; } },
        ['admin', 'membro'].map((p) => h('option', { value: p, selected: u.papel === p }, p === 'admin' ? 'Administrador' : 'Membro')))),
      h('td', {}, h('input', { type: 'checkbox', style: 'width:auto', checked: u.ativo, disabled: u.id === ctx.user.id, 'aria-label': 'Ativo: ' + u.nome, onchange: async (e) => { if (!(await upd(u, { ativo: e.target.checked }))) e.target.checked = u.ativo; else u.ativo = e.target.checked; } })),
      h('td', {}, fmtDate(u.criado_em)),
      h('td', {}, h('button', { class: 'btn sm', onclick: () => formModal({ title: 'Editar ' + u.nome, fields: [{ name: 'nome', label: 'Nome', required: true, value: u.nome }, { name: 'cargo', label: 'Cargo', value: u.cargo }],
        onSubmit: async (v) => { const r = await upd(u, v); if (!r) return false; location.reload(); } }) }, 'Editar')))))));

  const permsTable = h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Módulo (papel Membro)', 'Pode ver', 'Pode editar'].map((t) => h('th', {}, t)))),
    h('tbody', {}, Object.entries(MODS).map(([k, l]) => { const p = perms.find((x) => x.modulo === k) || { modulo: k, pode_ver: false, pode_editar: false };
      const box = (field) => h('input', { type: 'checkbox', style: 'width:auto', checked: p[field], 'aria-label': `${l}: ${field}`, onchange: async (e) => {
        const next = { ...p, [field]: e.target.checked }; if (field === 'pode_editar' && next.pode_editar) next.pode_ver = true; if (field === 'pode_ver' && !next.pode_ver) next.pode_editar = false;
        if (await run(sb.from('permissoes').upsert(next), 'Permissão salva.')) location.reload(); else e.target.checked = p[field]; } });
      return h('tr', {}, h('td', {}, l), h('td', {}, box('pode_ver')), h('td', {}, box('pode_editar'))); }))));

  view.append(pageHead('Administração', 'Equipe', 'Gerencie quem acessa o portal e o que cada papel pode fazer.'),
    h('div', { class: 'card' }, h('h2', {}, 'Como adicionar um funcionário'), h('p', { class: 'small' }, 'No painel do Supabase: Authentication → Users → Add user (ou Invite). O perfil é criado automaticamente como Membro; depois ajuste cargo e permissões aqui. O portal não tem cadastro público.')),
    h('h2', { style: 'margin:24px 0 12px' }, 'Usuários'), usersTable,
    h('h2', { style: 'margin:24px 0 12px' }, 'Permissões do papel Membro'), permsTable, h('p', { class: 'small muted', style: 'margin-top:8px' }, 'Administradores sempre têm acesso total.'),
    h('h2', { style: 'margin:24px 0 12px' }, 'Atividade recente'),
    logs.length ? h('ul', { class: 'ul-list card' }, logs.map((l) => h('li', {}, h('b', {}, nameOf(l.usuario_id)), ` ${l.acao} ${l.entidade}`, l.detalhe ? ` “${l.detalhe}”` : '', h('span', { class: 'small muted' }, ' · ' + new Date(l.criado_em).toLocaleString('pt-BR'))))) : empty('Sem atividade registrada.'));
});
