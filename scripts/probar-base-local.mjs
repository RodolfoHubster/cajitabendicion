// Las pruebas de la base (supabase/pruebas/reglas.sql) en TU computadora,
// sin tocar ninguna base de Supabase: ni la real ni la de pruebas.
//
// Levanta un Postgres de verdad en memoria (PGlite), le pone un "auth"
// que imita el de Supabase, corre la receta y luego las pruebas. Al
// terminar se tira todo.
//
//   npm run test:base                 schema.sql completo desde cero
//   npm run test:base -- --migraciones
//       lo que ya esta en el ultimo commit + las migraciones nuevas que
//       todavia no se han subido: el camino que va a seguir la base real
//
// Lo que NO cubre: dos personas al MISMO tiempo. PGlite es una sola
// conexion; para eso estan scripts/prueba-concurrencia.mjs y
// scripts/prueba-escaneo.mjs, contra la base de pruebas.

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const RAIZ = fileURLToPath(new URL('../', import.meta.url))
const leer = (ruta) => readFileSync(`${RAIZ}${ruta}`, 'utf8')

//  Supabase trae el esquema "auth" y pgcrypto en "extensions". Aqui se
//  imita lo minimo que la receta y las pruebas usan.
const AUTH = `
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;

create schema auth;
create table auth.users (
  instance_id        uuid,
  id                 uuid primary key default gen_random_uuid(),
  aud                text,
  role               text,
  email              text,
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb,
  raw_user_meta_data jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  last_sign_in_at    timestamptz
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create role anon;
create role authenticated;
create role service_role;
`

//  Las pruebas se hacen "como" la primera cuenta admin de la tabla personal.
const SEMILLA = `
insert into auth.users (id, email, aud, role)
values ('11111111-1111-1111-1111-111111111111', 'admin.prueba.cb@gmail.com', 'authenticated', 'authenticated');

insert into personal (usuario_id, rol)
values ('11111111-1111-1111-1111-111111111111', 'admin')
on conflict (usuario_id) do update set rol = 'admin', activo = true;
`

//  "alter database postgres" solo tiene sentido en Supabase; aqui la zona
//  se pone en la sesion.
const sinAlterDatabase = (sql) => sql.replace(/alter database postgres set timezone to 'America\/Los_Angeles';/g, '')

async function correr(db, nombre, sql) {
  try {
    await db.exec(sql)
    console.log(`  ok  ${nombre}`)
  } catch (e) {
    console.log(`  X   ${nombre}\n      ${e.message}`)
    process.exit(1)
  }
}

const porMigraciones = process.argv.includes('--migraciones')

const db = new PGlite({ extensions: { pgcrypto } })
await db.exec(`set timezone to 'America/Los_Angeles'`)
//  Como en Supabase: pgcrypto vive en extensions y esta en el search_path.
await db.exec('set search_path to "$user", public, extensions')

await correr(db, 'auth de mentiras (como el de Supabase)', AUTH)

if (!porMigraciones) {
  await correr(db, 'supabase/schema.sql completo', sinAlterDatabase(leer('supabase/schema.sql')))
} else {
  //  Las migraciones que el ultimo commit todavia no conoce.
  const enCommit = execSync('git ls-tree --name-only HEAD supabase/migraciones/', { cwd: RAIZ, encoding: 'utf8' })
  //  En el orden del LEEME.md, no en orden alfabetico: dos del mismo dia
  //  pueden depender una de la otra (filas necesita permisos).
  const ordenLeeme = [...leer('supabase/migraciones/LEEME.md').matchAll(/^\| `(\d{4}-[^`]+\.sql)` \|/gm)].map((m) => m[1])
  const posicion = (archivo) => (ordenLeeme.includes(archivo) ? ordenLeeme.indexOf(archivo) : Infinity)
  const nuevas = readdirSync(`${RAIZ}supabase/migraciones`)
    .filter((archivo) => archivo.endsWith('.sql') && !enCommit.includes(archivo))
    .sort((a, b) => posicion(a) - posicion(b) || a.localeCompare(b))

  const cabeza = execSync('git show HEAD:supabase/schema.sql', { cwd: RAIZ, encoding: 'utf8', maxBuffer: 50e6 })
  await correr(db, 'schema.sql del ultimo commit', sinAlterDatabase(cabeza))

  if (nuevas.length === 0) console.log('  (no hay migraciones nuevas sin subir)')
  for (const archivo of nuevas) {
    await correr(db, `migracion ${archivo}`, leer(`supabase/migraciones/${archivo}`))
    await correr(db, `migracion ${archivo}, otra vez (se puede repetir)`, leer(`supabase/migraciones/${archivo}`))
  }
}

await correr(db, 'una cuenta admin para las pruebas', SEMILLA)

try {
  await db.exec(leer('supabase/pruebas/reglas.sql'))
  console.log('\nLas pruebas terminaron sin su error de resultado: algo raro paso.')
  process.exit(1)
} catch (e) {
  const mensaje = e.message ?? String(e)
  if (!mensaje.startsWith('PRUEBAS:')) {
    console.log(`\nLAS PRUEBAS NO CORRIERON:\n${mensaje}`)
    process.exit(1)
  }
  const [encabezado, ...lineas] = mensaje.split('\n')
  const fallidas = lineas.filter((linea) => linea.startsWith('✗'))
  console.log(`\n${encabezado}`)
  if (fallidas.length) console.log(fallidas.join('\n'))
  if (process.argv.includes('--todas')) console.log(lineas.join('\n'))
  process.exit(fallidas.length ? 1 : 0)
}
