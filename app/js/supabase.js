import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/** Cliente descartável (sem guardar sessão): serve para conferir uma senha sem mexer na sessão em uso. */
export const clienteTemporario = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'vx-temporario' } });
