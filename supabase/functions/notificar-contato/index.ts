// Edge Function (LEGADA — prefira `notificar-email`, que cobre este caso e os demais avisos do portal).
// Avisa a equipe por e-mail (Resend) quando um contato novo chega ao site.
// Secrets necessários: RESEND_API_KEY, NOTIFY_TO (e-mails separados por vírgula), NOTIFY_FROM, WEBHOOK_SECRET.
// Ligue em Database > Webhooks: tabela contatos_site, evento INSERT, header "x-webhook-secret: <WEBHOOK_SECRET>".
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const oneLine = (s: unknown, max: number) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
const MAX_CORPO = 20_000;

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
  if (!secret || !(await iguaisSeguro(req.headers.get('x-webhook-secret') ?? '', secret))) return new Response('forbidden', { status: 403 });
  if (Number(req.headers.get('content-length') ?? 0) > MAX_CORPO) return new Response('payload too large', { status: 413 });

  let c: any;
  try { c = JSON.parse((await req.text()).slice(0, MAX_CORPO))?.record; } catch { return new Response('bad request', { status: 400 }); }
  if (!c) return new Response('ignored');

  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFY_FROM');
  const to = (Deno.env.get('NOTIFY_TO') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key || !from || !to.length) return new Response('not configured', { status: 500 });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to,
      subject: `Novo contato no site: ${oneLine(c.nome, 80)}`,
      html: `<p><b>${esc(oneLine(c.nome, 120))}</b> (${esc(oneLine(c.contato, 160))})</p><p>${esc(oneLine(c.mensagem, 2000))}</p>${c.problema ? `<p>Problema: ${esc(oneLine(c.problema, 2000))}</p>` : ''}`,
    }),
  });
  return new Response(res.ok ? 'ok' : 'erro no envio', { status: res.ok ? 200 : 502 });
});
