// Banco de teste: Postgres real em memória (PGlite) com as migrations do projeto e simulações das partes do Supabase
// que as migrations usam (auth.users, auth.uid(), auth.jwt(), auth.sessions, auth.mfa_factors, storage e os papéis anon/authenticated).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Sobe o banco de teste e aplica as migrations em ordem alfabética.
 * `migracoes` é a pasta das migrations (relativa à raiz do repositório ou absoluta) — assim um módulo novo,
 * com o seu próprio conjunto de migrations, reusa este mesmo harness.
 * `ate` para de aplicar depois desse nome de arquivo (serve para testar o estado antes de uma migration).
 */
export async function criarBanco({ ate, migracoes = 'supabase/migrations' } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, email_confirmed_at timestamptz);
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz not null default now());
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text not null default 'unverified', factor_type text not null default 'totp');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated, public;
  `);
  const dir = path.isAbsolute(migracoes) ? migracoes : path.join(REPO, migracoes);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (ate && f > ate) break;
    try { await db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { throw new Error(`Migration ${f} falhou: ${e.message}`); }
  }
  return db;
}

/** Executa como um papel do Supabase. ctx = {uid, sid (id da sessão), aal, ip}. Sem uid roda como visitante (anon). */
export function papeis(db) {
  const as = async (ctx, sql, params) => {
    const c = typeof ctx === 'string' || ctx == null ? { uid: ctx } : ctx;
    const claims = c.uid ? JSON.stringify({ sub: c.uid, role: 'authenticated', aal: c.aal || 'aal1', session_id: c.sid ?? null }) : '{}';
    const headers = c.ip ? JSON.stringify({ 'cf-connecting-ip': c.ip }) : '';
    await db.exec(`set role ${c.uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${c.uid || ''}', false), set_config('request.jwt.claims', '${claims}', false), set_config('request.headers', '${headers}', false);`);
    try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
  };
  const tenta = async (ctx, sql, p) => { try { return { r: await as(ctx, sql, p) }; } catch (e) { return { erro: e.message }; } };
  return { as, tenta, q: (sql, p) => db.query(sql, p) };
}

export function relatorio() {
  let falhas = 0, total = 0;
  return {
    ok(cond, msg) { total++; if (!cond) { falhas++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); },
    fim(nome) { console.log(`\n${falhas ? '✗ ' + falhas + ' falha(s) em ' + nome : '✓ ' + nome + ': ' + total + ' verificações ok'}`); process.exit(falhas ? 1 : 0); },
  };
}
