// Edge Function: avisa a equipe por e-mail (Resend) quando um contato novo chega ao site.
// Secrets necessários: RESEND_API_KEY, NOTIFY_TO (e-mails separados por vírgula), NOTIFY_FROM, WEBHOOK_SECRET.
// Ligue em Database > Webhooks: tabela contatos_site, evento INSERT, header "x-webhook-secret: <WEBHOOK_SECRET>".
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 });
  const { record: c } = await req.json();
  if (!c) return new Response('ignored');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('NOTIFY_FROM'),
      to: Deno.env.get('NOTIFY_TO')!.split(',').map((s) => s.trim()),
      subject: `Novo contato no site: ${String(c.nome).slice(0, 80)}`,
      html: `<p><b>${esc(c.nome)}</b> (${esc(c.contato)})</p><p>${esc(c.mensagem)}</p>${c.problema ? `<p>Problema: ${esc(c.problema)}</p>` : ''}`,
    }),
  });
  return new Response(res.ok ? 'ok' : 'erro no envio', { status: res.ok ? 200 : 502 });
});
