// Validações de entrada reutilizadas pelo portal e pelo site. Funções puras (sem DOM nem banco), testadas em tests/.
// IMPORTANTE: validar no navegador é só conveniência. As mesmas regras existem no banco (CHECK/trigger, migration 014),
// que é quem realmente barra dados inválidos.

// ---------- e-mail e telefone (mesmas regras de public.email_ok / public.telefone_ok) ----------
export const emailOk = (s) => { const v = String(s ?? ''); return v === '' || (v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)); };
export const emailValido = (s) => String(s ?? '').trim() !== '' && emailOk(String(s).trim());
export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
export const telefoneOk = (s) => { const v = String(s ?? ''); return v === '' || (/^[0-9+()\s.-]{8,40}$/.test(v) && soDigitos(v).length >= 8 && soDigitos(v).length <= 15); };
export const telefoneValido = (s) => String(s ?? '').trim() !== '' && telefoneOk(String(s).trim());
/** Contato do formulário público: e-mail OU telefone. */
export const contatoValido = (s) => { const v = String(s ?? '').trim(); return v !== '' && (emailOk(v) || telefoneOk(v)); };

// ---------- CPF e CNPJ (com dígitos verificadores) ----------
export function cpfValido(s) {
  const d = soDigitos(s);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (n) => { let t = 0; for (let i = 0; i < n; i++) t += Number(d[i]) * (n + 1 - i); return ((t * 10) % 11) % 10; };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}
export function cnpjValido(s) {
  const d = soDigitos(s);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dig = (n) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let t = 0; for (let i = 0; i < n; i++) t += Number(d[i]) * pesos[i]; const r = t % 11; return r < 2 ? 0 : 11 - r; };
  return dig(12) === Number(d[12]) && dig(13) === Number(d[13]);
}
/** Vazio é permitido (campo opcional); preenchido precisa ser CPF ou CNPJ válido. */
export const documentoOk = (s) => { const d = soDigitos(s); return d === '' || cpfValido(d) || cnpjValido(d); };

// ---------- senha ----------
const COMUNS = ['123456', '1234567', '12345678', '123456789', '1234567890', '12345678910', 'senha', 'senha123', 'senha1234', 'password', 'password1', 'qwerty', 'qwertyuiop', 'abc123', 'abcd1234', '111111', '000000', '1q2w3e4r', 'admin', 'admin123', 'vemax', 'vemax123', 'mudar123', 'brasil', 'brasil123', 'iloveyou', 'letmein', 'welcome', 'welcome1'];
/** Regra mínima de senha: 10+ caracteres, não pode ser comum, repetida, sequência simples nem conter o e-mail. */
export function avaliarSenha(senha, email = '') {
  const s = String(senha ?? ''), motivos = [];
  if (s.length < 10) motivos.push(`Use pelo menos 10 caracteres (faltam ${10 - s.length}).`);
  if (s.length > 128) motivos.push('Use no máximo 128 caracteres.');
  const baixa = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (COMUNS.some((c) => baixa === c || (baixa.length <= c.length + 3 && baixa.includes(c) && c.length >= 6))) motivos.push('Essa senha é muito comum. Escolha outra.');
  if (s.length >= 4 && /^(.)\1+$/.test(s)) motivos.push('Não use o mesmo caractere repetido.');
  if (s.length >= 6 && ('0123456789'.includes(s) || 'abcdefghijklmnopqrstuvwxyz'.includes(s.toLowerCase()) || '9876543210'.includes(s))) motivos.push('Não use uma sequência simples.');
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && s.toLowerCase().includes(local)) motivos.push('A senha não deve conter o seu e-mail.');
  return { ok: motivos.length === 0, motivos };
}

// ---------- buscas ----------
/** Deixa só letras, números, espaço e @ . + - : o texto entra em filtros do PostgREST e não pode carregar vírgula, parênteses ou curinga. */
export const limparBusca = (q) => String(q ?? '').replace(/[^\p{L}\p{N}\s@.+-]/gu, ' ').replace(/\s+/g, ' ').trim();
/** Escapa curingas do LIKE/ILIKE (% e _) para procurar o texto literal. */
export const escaparLike = (s) => String(s ?? '').replace(/[\\%_]/g, (c) => '\\' + c);

// ---------- arquivos ----------
const EXT_BLOQUEADAS = new Set(['html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'jsx', 'exe', 'bat', 'cmd', 'com', 'sh', 'ps1', 'psm1', 'vbs', 'jar', 'msi', 'dll', 'scr', 'php', 'asp', 'aspx', 'jsp', 'lnk', 'reg', 'hta', 'apk']);
/** Que "assinatura" (primeiros bytes) cada extensão aceita. */
const EXT_ASSINATURA = { pdf: ['pdf'], png: ['png'], jpg: ['jpeg'], jpeg: ['jpeg'], gif: ['gif'], webp: ['webp'], zip: ['zip'], docx: ['zip'], xlsx: ['zip'], pptx: ['zip'], odt: ['zip'], ods: ['zip'], pbix: ['zip'], doc: ['ole'], xls: ['ole'], ppt: ['ole'], csv: ['texto'], txt: ['texto'], json: ['texto'], md: ['texto'] };
/** Descobre o tipo real pelos primeiros bytes (não confia em extensão nem em MIME enviado pelo navegador). */
export function tipoPorAssinatura(b) {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b || []);
  const eq = (...v) => v.every((x, i) => u[i] === x);
  if (u.length >= 5 && eq(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'pdf';
  if (u.length >= 8 && eq(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (u.length >= 3 && eq(0xff, 0xd8, 0xff)) return 'jpeg';
  if (u.length >= 6 && eq(0x47, 0x49, 0x46, 0x38) && (u[4] === 0x37 || u[4] === 0x39) && u[5] === 0x61) return 'gif';
  if (u.length >= 12 && eq(0x52, 0x49, 0x46, 0x46) && u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) return 'webp';
  if (u.length >= 4 && eq(0x50, 0x4b, 0x03, 0x04)) return 'zip';
  if (u.length >= 8 && eq(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'ole';
  if (u.length > 0 && !u.slice(0, 512).includes(0)) return 'texto';       // sem byte nulo nos primeiros 512: parece texto
  return null;
}
/**
 * Confere nome, tamanho e conteúdo de um arquivo antes do envio. `bytes` = primeiros bytes do arquivo.
 * Rejeita extensão perigosa ou duplicada (arquivo.pdf.exe), extensão desconhecida e conteúdo que não bate com a extensão.
 */
export function validarArquivo({ name, size }, bytes, { maxBytes = 50 * 1024 * 1024, permitidas = Object.keys(EXT_ASSINATURA) } = {}) {
  const nome = String(name ?? '');
  if (!nome || nome.length > 200 || /[\u0000-\u001f\\/]/.test(nome)) return { ok: false, erro: 'Nome de arquivo inválido.' };
  const partes = nome.toLowerCase().split('.');
  if (partes.length < 2) return { ok: false, erro: 'O arquivo precisa ter extensão (ex.: .pdf).' };
  if (partes.slice(1).some((p) => EXT_BLOQUEADAS.has(p))) return { ok: false, erro: 'Esse tipo de arquivo não é permitido por segurança.' };
  const ext = partes[partes.length - 1];
  if (!permitidas.includes(ext) || !EXT_ASSINATURA[ext]) return { ok: false, erro: `Arquivo .${ext} não é aceito. Tipos aceitos: ${permitidas.join(', ')}.` };
  if (!(size > 0)) return { ok: false, erro: 'O arquivo está vazio.' };
  if (size > maxBytes) return { ok: false, erro: `O arquivo passa de ${Math.round(maxBytes / 1048576)} MB.` };
  const real = tipoPorAssinatura(bytes);
  if (!real || !EXT_ASSINATURA[ext].includes(real)) return { ok: false, erro: `O conteúdo não parece ser um arquivo .${ext} de verdade.` };
  return { ok: true, ext };
}

// ---------- mensagens de erro ----------
/**
 * Traduz um erro do Supabase/Postgres para uma frase segura para a tela. Nunca mostra o texto cru do banco
 * (nomes de tabela, coluna ou constraint), só mensagens que nós mesmos escrevemos nas funções (código P0001).
 */
export function mensagemErro(err, padrao = 'Não foi possível concluir. Tente de novo; se continuar, avise o administrador.') {
  if (!err) return padrao;
  const cod = String(err.code || err.status || ''), msg = String(err.message || '');
  if (cod === '42501' || /row-level security|permission denied/i.test(msg)) return 'Sem permissão para esta ação.';
  if (cod === '23505') return 'Já existe um registro igual (nome, documento ou código repetido).';
  if (cod === '23514') {
    if (/email/i.test(msg)) return 'E-mail inválido.';
    if (/telefone/i.test(msg)) return 'Telefone inválido. Use apenas números, espaços, parênteses, + e -.';
    if (/documento/i.test(msg)) return 'CPF ou CNPJ inválido.';
    return 'Algum campo está em formato inválido. Confira os dados e tente de novo.';
  }
  if (cod === '23503') return 'Este registro está ligado a outros e não pode ser usado ou removido assim.';
  if (cod === '23502') return 'Falta preencher um campo obrigatório.';
  if (cod === '22001') return 'Algum texto está longo demais.';
  if (cod === '22P02' || cod === '22007' || cod === '22008') return 'Algum valor está em formato inválido.';
  if (cod === 'PGRST116') return 'Registro não encontrado.';
  if (cod === 'PGRST301' || cod === '401' || /jwt/i.test(msg)) return 'Sua sessão expirou. Entre novamente.';
  if (cod === '429') return 'Muitas tentativas. Aguarde alguns minutos.';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  if (cod === 'P0001' && msg && msg.length <= 200) return msg;      // mensagens escritas por nós nas funções do banco
  return padrao;
}

/** Espera (em segundos) imposta pela tela de login depois de erros seguidos: 0 até 2 erros, depois 5 s, 10 s, 20 s… até 5 min.
 *  É só desestímulo na interface: o bloqueio de verdade é do Supabase Auth (limite de requisições por IP). */
export const esperaLogin = (falhas) => (falhas < 3 ? 0 : Math.min(300, 5 * 2 ** (falhas - 3)));
