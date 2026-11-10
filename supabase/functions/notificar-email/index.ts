// Edge Function: envia por e-mail (Resend) cada notificação criada no portal
// (lead novo, proposta aceita/recusada, avaliação recebida, cadastro pendente, alerta de segurança).
//
// Disparo: Database > Webhooks > tabela `notificacoes`, evento INSERT, método POST,
// URL da função, header "x-webhook-secret: <WEBHOOK_SECRET>".
//
// Secrets: RESEND_API_KEY, NOTIFY_TO (e-mails separados por vírgula), NOTIFY_FROM, WEBHOOK_SECRET.
// Opcional: SITE_URL (ex.: https://seudominio.com.br, sem barra final) para incluir o link do portal no e-mail.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const oneLine = (s: unknown, max: number) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const LINK_OK = /^[a-z0-9\/_-]{0,60}$/;   // só caminhos internos do portal, ex.: contatos/
const MAX_CORPO = 20_000;                 // bytes: um aviso de notificação tem poucas centenas

/** Compara dois textos sem revelar, pelo tempo de resposta, em que posição eles diferem. */
async function iguaisSeguro(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = Deno.env.get('WEBHOOK_SECRET') ?? '';
  const enviado = req.headers.get('x-webhook-secret') ?? '';
  if (!secret || !(await iguaisSeguro(enviado, secret))) return new Response('forbidden', { status: 403 });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_CORPO) return new Response('payload too large', { status: 413 });

  let body: any;
  try { body = JSON.parse((await req.text()).slice(0, MAX_CORPO)); } catch { return new Response('bad request', { status: 400 }); }
  const n = body?.record ?? body;   // webhook do Supabase envia { type, table, record }
  const titulo = oneLine(n?.titulo, 200);
  if (!titulo) return new Response('ignored');

  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFY_FROM');
  const to = (Deno.env.get('NOTIFY_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key || !from || !to.length) return new Response('not configured', { status: 500 });

  const link = LINK_OK.test(String(n?.link ?? '')) ? String(n.link) : '';
  const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
  const url = site && link ? `${site}/app/${link}` : site ? `${site}/app/` : '';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to,
      subject: `[Vemax] ${titulo}`,
      html: `<p>${esc(titulo)}</p>${url ? `<p><a href="${esc(url)}">Abrir no portal</a></p>` : ''}`,
      text: titulo + (url ? `\n\nAbrir no portal: ${url}` : ''),
    }),
  });
  return new Response(res.ok ? 'ok' : 'erro no envio', { status: res.ok ? 200 : 502 });
});
