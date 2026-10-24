// Buscar eventos (cartelera de funciones publicadas).
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cabecera } from '../../components/Cabecera';
import { Aviso, Cargando, Chip, Icono, Vacio } from '../../components/ui';
import { api } from '../../lib/api';
import { fechaLarga, hora, NOMBRE_CATEGORIA, numero, pesos } from '../../lib/formato';
import type { Categoria, FuncionCartelera } from '../../lib/tipos';
import { useCarga } from '../../lib/useCarga';
import { PestanasComprador } from './PestanasComprador';

const RANGOS = {
  '': 'Cualquier fecha',
  semana: 'Próximos 7 días',
  mes: 'Próximos 30 días',
  despues: 'Más adelante',
} as const;

function rangoFechas(rango: keyof typeof RANGOS): Record<string, string> {
  const ahora = Date.now();
  const dia = 86_400_000;
  if (rango === 'semana') return { hasta: new Date(ahora + 7 * dia).toISOString() };
  if (rango === 'mes') return { hasta: new Date(ahora + 30 * dia).toISOString() };
  if (rango === 'despues') return { desde: new Date(ahora + 30 * dia).toISOString() };
  return {};
}

export default function Cartelera() {
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState<{ q: string; categoria: string; rango: keyof typeof RANGOS }>({ q: '', categoria: '', rango: '' });
  const [categoria, setCategoria] = useState('');
  const [rango, setRango] = useState<keyof typeof RANGOS>('');

  const { datos, error, cargando } = useCarga(() => {
    const params = new URLSearchParams({ q: filtros.q, categoria: filtros.categoria, ...rangoFechas(filtros.rango) });
    return api.get<FuncionCartelera[]>(`/eventos?${params}`);
  }, [filtros]);

  const filtrar = (e: FormEvent) => {
    e.preventDefault();
    setFiltros({ q: texto.trim(), categoria, rango });
  };

  const [destacada, ...resto] = datos ?? [];

  return (
    <>
      <Cabecera />
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <PestanasComprador activa="cartelera" />

        <form onSubmit={filtrar} className="flex flex-col items-center justify-between gap-3 rounded-xl bg-surface-container p-4 shadow-lg md:flex-row">
          <label className="relative w-full md:w-96">
            <span className="sr-only">Buscar</span>
            <Icono nombre="search" className="absolute left-3 top-2.5 text-[20px] text-outline" />
            <input value={texto} onChange={(e) => setTexto(e.target.value)} className="campo pl-10" placeholder="Buscar artista, evento, banda o sala..." />
          </label>
          <div className="flex w-full items-center gap-2 md:w-auto">
            <select aria-label="Categoría" className="campo md:w-48" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas las Categorías</option>
              {(Object.keys(NOMBRE_CATEGORIA) as Categoria[]).map((c) => (
                <option key={c} value={c}>
                  {NOMBRE_CATEGORIA[c]}
                </option>
              ))}
            </select>
            <select aria-label="Fecha" className="campo md:w-44" value={rango} onChange={(e) => setRango(e.target.value as keyof typeof RANGOS)}>
              {Object.entries(RANGOS).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-primary-container px-4 py-2 text-label-md text-white hover:bg-indigo-500">
              Filtrar
            </button>
          </div>
        </form>

        {error && <Aviso tono="peligro">{error}</Aviso>}
        {cargando && !datos && <Cargando texto="Buscando funciones…" />}
        {datos && datos.length === 0 && (
          <Vacio icono="event_busy" titulo="No encontramos funciones">
            Probá con otra búsqueda o quitá los filtros.
          </Vacio>
        )}

        {destacada && (
          <Link
            to={`/funciones/${destacada.id}`}
            className="group relative block overflow-hidden rounded-xl border border-primary-container/30 bg-gradient-to-r from-surface-container via-indigo-950/60 to-surface-container p-6 shadow-xl transition hover:border-primary-container/60"
          >
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-container/20 blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Chip tono="exito">{destacada.hayDescuento ? 'Preventa con descuento' : 'Próxima función'}</Chip>
                  <Chip tono="info">{NOMBRE_CATEGORIA[destacada.evento.categoria]}</Chip>
                  <span className="text-body-sm text-on-surface-variant">{destacada.sala.nombre}</span>
                </div>
                <h2 className="text-headline-xl-mobile font-black tracking-tight text-white md:text-headline-xl">{destacada.evento.nombre}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-4 text-body-md text-on-surface-variant">
                  <span className="flex items-center gap-1.5">
                    <Icono nombre="calendar_today" className="text-[18px] text-primary" /> {fechaLarga(destacada.fechaHora)} - {hora(destacada.fechaHora)} hs
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icono nombre="location_on" className="text-[18px] text-rose-400" /> {destacada.sala.direccion}
                  </span>
                </p>
              </div>
              <div className="text-left md:text-right">
                <span className="block text-body-sm text-on-surface-variant">Entradas desde</span>
                <span className="font-mono text-headline-xl font-black text-emerald-400">{pesos(destacada.precioDesde)}</span>
                <span className="block text-[11px] text-on-surface-variant">Máximo 6 entradas por persona</span>
                <span className="mt-2 inline-flex items-center gap-1 text-label-md text-secondary group-hover:underline">
                  Elegir ubicaciones <Icono nombre="arrow_forward" className="text-[16px]" />
                </span>
              </div>
            </div>
          </Link>
        )}

        {resto.length > 0 && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resto.map((f) => (
              <Link
                key={f.id}
                to={`/funciones/${f.id}`}
                className="group flex flex-col justify-between gap-4 rounded-xl border border-nv-line bg-surface-container p-5 shadow-lg transition hover:border-primary-container/50 hover:bg-nv-raised"
              >
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Chip tono="info">{NOMBRE_CATEGORIA[f.evento.categoria]}</Chip>
                    {f.hayDescuento && <Chip tono="exito">Descuento</Chip>}
                  </div>
                  <h3 className="text-headline-md text-white">{f.evento.nombre}</h3>
                  <p className="mt-1 line-clamp-2 text-body-sm text-on-surface-variant">{f.evento.descripcion}</p>
                </div>
                <div className="space-y-1 text-body-sm text-on-surface-variant">
                  <p className="flex items-center gap-1.5">
                    <Icono nombre="calendar_today" className="text-[16px] text-primary" /> {fechaLarga(f.fechaHora)} · {hora(f.fechaHora)} hs
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Icono nombre="stadium" className="text-[16px] text-secondary" /> {f.sala.nombre}
                  </p>
                </div>
                <div className="flex items-end justify-between border-t border-nv-line pt-3">
                  <div>
                    <span className="block text-label-xs uppercase text-outline">Desde</span>
                    <span className="font-mono text-title-sm text-emerald-400">{pesos(f.precioDesde)}</span>
                  </div>
                  <span className="text-body-sm text-on-surface-variant">{f.disponibles > 0 ? `${numero(f.disponibles)} disponibles` : 'Agotado'}</span>
                </div>
              </Link>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
