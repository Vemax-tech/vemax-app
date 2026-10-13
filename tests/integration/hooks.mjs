import { pathToFileURL } from 'node:url';
import path from 'node:path';
const STUB = pathToFileURL(path.join(process.env.SMOKE_DIR, 'fake-supabase.mjs')).href;
export async function resolve(specifier, context, next) {
  if (/^\.{1,2}\/(.*\/)?supabase\.js$/.test(specifier)) return { url: STUB, shortCircuit: true };
  return next(specifier, context);
}
