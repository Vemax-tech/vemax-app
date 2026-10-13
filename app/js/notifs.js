// Sino de notificações do portal: leads novos, propostas respondidas, cadastros pendentes e avaliações.
// Recebe as dependências por parâmetro (evita import circular com ui.js).
export async function initNotifs({ sb, h, modal, icon, side, ctx, root }) {
  const btn = h('button', { class: 'navi', type: 'button', 'aria-label': 'Notificações' }, icon('bell'), 'Notificações');
  const pill = h('span', { class: 'pill', hidden: true });
  btn.append(pill);
  const baseTitle = document.title;
  let items = [], seen = new Date(ctx.profile.notif_visto_em || 0), mounted = false;

  const unread = () => items.filter((n) => new Date(n.criado_em) > seen).length;
  const paint = () => {
    const n = unread();
    pill.hidden = n === 0; pill.textContent = n > 9 ? '9+' : String(n);
    btn.setAttribute('aria-label', n ? `Notificações, ${n} nova(s)` : 'Notificações');
    document.title = (n ? `(${n}) ` : '') + baseTitle.replace(/^\(\d+\)\s/, '');
  };
  const load = async () => {
    const { data, error } = await sb.from('notificacoes').select('*').order('criado_em', { ascending: false }).limit(30);
    if (error) return;   // migration 011 ainda não aplicada: o sino simplesmente não aparece
    const prefs = ctx.profile.notif_prefs || {};           // Configurações > Notificações: {contatos: false} silencia o módulo
    items = (data || []).filter((n) => prefs[n.modulo] !== false);
    if (!mounted) { side.querySelector('.spacer')?.before(btn); mounted = true; }
    paint();
  };

  btn.addEventListener('click', () => {
    const before = seen;
    modal('Notificações', items.length
      ? h('ul', { class: 'ul-list' }, items.map((n) => h('li', {},
        h('a', { class: 't', href: root + n.link }, (new Date(n.criado_em) > before ? '● ' : '') + n.titulo),
        h('div', { class: 'small muted' }, new Date(n.criado_em).toLocaleString('pt-BR')))))
      : h('p', { class: 'muted' }, 'Nada por aqui ainda.'),
    (close) => h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Fechar')));
    // marca como vistas (guarda no perfil para valer em qualquer dispositivo)
    seen = new Date(); paint();
    sb.from('profiles').update({ notif_visto_em: seen.toISOString() }).eq('id', ctx.user.id).then(() => {});
  });

  await load();
  setInterval(() => { if (!document.hidden) load(); }, 60000);
}
