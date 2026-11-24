// Resolución de módulos para ejecutar el código de la app en Node:
// - "@/x" → src/x (probando .ts, .tsx y /index.ts)
// - imports relativos sin extensión → se prueban las mismas extensiones
// - "expo-crypto" → shim con crypto.randomUUID
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = path.join(root, 'src');
const shims = { 'expo-crypto': path.join(root, 'tests', 'helpers', 'expo-crypto.mjs') };

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

function findFile(base) {
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(isFile) ?? null;
}

export async function resolve(specifier, context, next) {
  if (shims[specifier]) return { url: pathToFileURL(shims[specifier]).href, shortCircuit: true };
  let file = null;
  if (specifier.startsWith('@/')) file = findFile(path.join(src, specifier.slice(2)));
  else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !path.extname(specifier)) {
    file = findFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
  }
  if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  return next(specifier, context);
}
