// Crea Backend/.env a partir de .env.example (con secretos aleatorios) si todavía no existe.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, '.env');

if (existsSync(destino)) {
  console.log('Backend/.env ya existe: no se modifica.');
} else {
  copyFileSync(join(raiz, '.env.example'), destino);
  const contenido = readFileSync(destino, 'utf8')
    .replace('cambiar-por-un-secreto-largo', randomBytes(24).toString('hex'))
    .replace('cambiar-por-otro-secreto-largo', randomBytes(24).toString('hex'));
  writeFileSync(destino, contenido);
  console.log('Backend/.env creado con secretos aleatorios.');
}
