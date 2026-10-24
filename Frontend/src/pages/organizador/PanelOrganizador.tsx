// Gestión de evento, tarifas y reportes (pantalla 2 de Stitch).
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { BarraLateral, Cabecera } from '../../components/Cabecera';
import { PALETA } from '../../components/MapaSala';
import { useToast } from '../../components/Toast';
import { Aviso, Boton, Campo, Cargando, Chip, cx, Icono, Interruptor, Modal, Progreso, Vacio } from '../../components/ui';
import { api, descargar, ErrorApi, mensajeError } from '../../lib/api';
import { desdeInputFechaHora, fechaCorta, fechaLarga, hora, NOMBRE_CATEGORIA, numero, pesos, porcentaje } from '../../lib/formato';
import type { Categoria, ConfigFuncion, PanelOrganizador as DatosPanel } from '../../lib/tipos';
import { useCarga } from '../../lib/useCarga';

type BorradorTarifa = { precio: string; descuento: string; vigenciaHasta: string };
type BorradorPlaya = { habilitada: boolean; precio: string; cupo: string };

const aEntero = (v: string) => Number(v.replace(/\D/g, '')) || 0;
const fechaInput = (iso: string) => iso.slice(0, 10);

export default function PanelOrganizador() {
  const { id } = useParams();
  const { datos: panel, recargar: recargarPanel } = useCarga(() => api.get<DatosPanel>('/org/panel'), []);
  const [nuevaFuncion, setNuevaFuncion] = useState(false);

  if (!id) {
    if (!panel) return (<><Cabecera /><Cargando /></>);
    const primera = panel.eventos.flatMap((e) => e.funciones).find((f) => f.estado === 'PUBLICADA') ?? panel.eventos[0]?.funciones[0];
    if (primera) return <Navigate to={`/organizador/funciones/${primera.id}`} replace />;
    return (
      <>
        <Cabecera />
        <main className="mx-auto max-w-2xl p-8">
          <Vacio icono="event" titulo="Todavía no programaste funciones">
            <Boton variante="primario" icono="add" className="mt-3" onClick={() => setNuevaFuncion(true)}>
              Programar función
            </Boton>
          </Vacio>
        </main>
        <ModalNuevaFuncion abierto={nuevaFuncion} panel={panel} onCerrar={() => setNuevaFuncion(false)} onCreada={recargarPanel} />
      </>
    );
  }
  return <GestionFuncion funcionId={Number(id)} panel={panel} recargarPanel={recargarPanel} />;
}

function GestionFuncion({ funcionId, panel, recargarPanel }: { funcionId: number; panel: DatosPanel | null; recargarPanel: () => void }) {
  const navegar = useNavigate();
  const toast = useToast();
  const { datos: cfg, error, recargar, cargando } = useCarga(() => api.get<ConfigFuncion>(`/org/funciones/${funcionId}`), [funcionId]);
  const [tarifas, setTarifas] = useState<Record<number, BorradorTarifa>>({});
  const [playas, setPlayas] = useState<Record<number, BorradorPlaya>>({});
  const [exigePatente, setExigePatente] = useState(true);
  const [apertura, setApertura] = useState('');
  const [playaVista, setPlayaVista] = useState<number | null>(null);
  const [sinPrecio, setSinPrecio] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [modal, setModal] = useState<'escenario' | 'funcion' | { producto: ConfigFuncion['productos'][number] | null } | null>(null);
  const [actualizado, setActualizado] = useState(Date.now());
  const refs = { tarifas: useRef<HTMLDivElement>(null), metricas: useRef<HTMLElement>(null), arriba: useRef<HTMLElement>(null) };

  // Cargar borradores cuando llega la configuración
  useEffect(() => {
    if (!cfg) return;
    setActualizado(Date.now());
    setTarifas(
      Object.fromEntries(
        cfg.sectores.map((s) => [
          s.id,
          {
            precio: s.tarifa ? String(s.tarifa.precio) : '',
            descuento: s.tarifa?.descuento ? String(s.tarifa.descuento.porcentaje) : '',
            vigenciaHasta: s.tarifa?.descuento ? fechaInput(s.tarifa.descuento.vigenciaHasta) : '',
          },
        ]),
      ),
    );
    setPlayas(
      Object.fromEntries(
        cfg.playas.map((p) => [p.id, { habilitada: !!p.tarifa, precio: p.tarifa ? String(p.tarifa.precio) : '', cupo: p.tarifa ? String(p.tarifa.cupoHabilitado) : String(p.capacidadTotal) }]),
      ),
    );
    setExigePatente(cfg.funcion.exigePatente);
    setApertura(cfg.funcion.aperturaPlaya ?? '');
    setPlayaVista((v) => v ?? cfg.playas.find((p) => p.tarifa)?.id ?? cfg.playas[0]?.id ?? null);
  }, [cfg]);

  const precioFinal = (b: BorradorTarifa) => {
    const base = aEntero(b.precio);
    const desc = Number(b.descuento) || 0;
    const vigente = desc > 0 && (!b.vigenciaHasta || new Date(`${b.vigenciaHasta}T23:59:59-03:00`) >= new Date());
    return vigente ? Math.round(base * (1 - desc / 100)) : base;
  };

  const guardar = async (silencioso = false) => {
    if (!cfg) return false;
    setGuardando(true);
    try {
      await api.put(`/org/funciones/${funcionId}/tarifas`, {
        tarifas: cfg.sectores.map((s) => {
          const b = tarifas[s.id];
          const desc = Number(b?.descuento) || 0;
          return {
            sectorId: s.id,
            precio: aEntero(b?.precio ?? ''),
            descuento: desc > 0 && b.vigenciaHasta ? { porcentaje: desc, vigenciaHasta: new Date(`${b.vigenciaHasta}T23:59:59-03:00`).toISOString() } : null,
          };
        }),
      });
      await api.put(`/org/funciones/${funcionId}/estacionamiento`, {
        exigePatente,
        aperturaPlaya: apertura || null,
        playas: cfg.playas.map((p) => ({
          playaId: p.id,
          habilitada: playas[p.id]?.habilitada ?? false,
          precio: aEntero(playas[p.id]?.precio ?? ''),
          cupoHabilitado: aEntero(playas[p.id]?.cupo ?? ''),
        })),
      });
      if (!silencioso) toast('Cambios de la función guardados');
      setSinPrecio([]);
      await recargar();
      return true;
    } catch (e) {
      toast(mensajeError(e), 'error');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const cambiarPublicacion = async (publicar: boolean) => {
    if (publicar && !(await guardar(true))) return;
    try {
      await api.post(`/org/funciones/${funcionId}/${publicar ? 'publicar' : 'despublicar'}`);
      toast(publicar ? 'La función está visible en la cartelera del portal' : 'Función despublicada: oculta para los compradores', publicar ? 'exito' : 'info');
      setSinPrecio([]);
      recargar();
      recargarPanel();
    } catch (e) {
      toast(mensajeError(e), 'error');
      if (e instanceof ErrorApi && e.code === 'SECTORES_SIN_PRECIO') {
        setSinPrecio(e.details as number[]);
        refs.tarifas.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const evento = panel?.eventos.find((e) => e.funciones.some((f) => f.id === funcionId));
  const ir = (r: keyof typeof refs) => refs[r].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const subbarra = (
    <>
      <div className="flex flex-wrap items-center gap-space-md text-body-sm">
        <nav aria-label="Ruta" className="hidden items-center gap-1 text-on-surface-variant md:flex">
          <span>Mis Eventos</span>
          <Icono nombre="chevron_right" className="text-[14px]" />
          <span className="max-w-[180px] truncate">{cfg?.evento.nombre ?? '…'}</span>
          <Icono nombre="chevron_right" className="text-[14px]" />
          <span className="font-medium text-secondary">Programación de Funciones</span>
        </nav>
        <div className="flex items-center gap-space-sm">
          <label className="flex items-center gap-1 rounded border border-outline-variant/30 bg-surface-container px-2 py-0.5">
            <Icono nombre="festival" className="text-[16px] text-secondary" />
            <select
              aria-label="Evento"
              className="max-w-[200px] cursor-pointer truncate border-0 bg-transparent py-0.5 pl-1 pr-6 text-label-md text-on-surface focus:ring-0"
              value={evento?.id ?? ''}
              onChange={(e) => {
                const f = panel?.eventos.find((x) => x.id === Number(e.target.value))?.funciones[0];
                if (f) navegar(`/organizador/funciones/${f.id}`);
              }}
            >
              {panel?.eventos.map((e) => (
                <option key={e.id} value={e.id} className="bg-surface-container">
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 rounded border border-outline-variant/30 bg-surface-container px-2 py-0.5">
            <Icono nombre="event" className="text-[16px] text-primary" />
            <select
              aria-label="Función"
              className="max-w-[230px] cursor-pointer truncate border-0 bg-transparent py-0.5 pl-1 pr-6 text-label-md text-on-surface focus:ring-0"
              value={funcionId}
              onChange={(e) => navegar(`/organizador/funciones/${e.target.value}`)}
            >
              {evento?.funciones.map((f) => (
                <option key={f.id} value={f.id} className="bg-surface-container">
                  {fechaLarga(f.fechaHora)} - {hora(f.fechaHora)} hs {f.estado !== 'PUBLICADA' ? `(${f.estado.toLowerCase()})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-space-md">
        <span className="flex items-center gap-1.5 text-label-xs text-tertiary">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-tertiary" /> Servidor sincronizado
        </span>
        <Boton icono="save" className="py-1" cargando={guardando} onClick={() => guardar()}>
          Guardado rápido
        </Boton>
      </div>
    </>
  );

  const lateral = (
    <BarraLateral
      grupos={[
        {
          titulo: 'Operación del Evento',
          items: [
            { icono: 'dashboard', texto: 'Resumen General', onClick: () => ir('metricas') },
            { icono: 'calendar_today', texto: 'Programación de Funciones', activo: true, onClick: () => ir('arriba') },
            { icono: 'stadium', texto: 'Sectores y Precios', onClick: () => ir('tarifas') },
            { icono: 'group', texto: 'Control de Aforo', onClick: () => ir('metricas') },
            { icono: 'monitoring', texto: 'Reporte de Ventas', onClick: () => cfg && descargar(`/org/funciones/${funcionId}/reporte.csv`, `reporte-${cfg.funcion.codigo}.csv`) },
            { icono: 'add_circle', texto: 'Programar Nueva Función', onClick: () => setModal('funcion') },
          ],
        },
        {
          titulo: 'Configuración Promotor',
          items: [
            { icono: 'hub', texto: 'Canales de Distribución', deshabilitado: true },
            { icono: 'account_balance_wallet', texto: 'Liquidaciones y Finanzas', deshabilitado: true },
            { icono: 'settings', texto: 'Ajustes del Organizador', deshabilitado: true },
          ],
        },
      ]}
      pie={
        <div className="rounded-lg border border-outline-variant/30 bg-surface-container p-space-sm">
          <div className="flex items-center gap-2 text-secondary">
            <Icono nombre="support_agent" className="text-[18px]" />
            <span className="text-label-md">Soporte Operativo</span>
          </div>
          <p className="mt-1 text-body-sm leading-snug text-on-surface-variant">Línea técnica de guardia 24/7 para festivales.</p>
        </div>
      }
    />
  );

  if (error) {
    return (
      <>
        <Cabecera subbarra={subbarra} />
        <div className="flex">
          {lateral}
          <main className="flex-1 p-gutter">
            <Aviso tono="peligro">{error}</Aviso>
          </main>
        </div>
      </>
    );
  }

  const m = cfg?.metricas;
  const publicada = cfg?.funcion.estado === 'PUBLICADA';
  const playa = cfg?.playas.find((p) => p.id === playaVista);
  const borradorPlaya = playa ? playas[playa.id] : undefined;
  const escenario = cfg?.escenarios.find((e) => e.id === cfg.funcion.escenarioId);

  return (
    <>
      <Cabecera subbarra={subbarra} />
      <div className="flex">
        {lateral}
        <main className="min-w-0 flex-1 bg-surface-container-lowest p-4 lg:p-gutter">
          {!cfg ? (
            <Cargando />
          ) : (
            <div className={cx('flex w-full flex-col space-y-space-lg text-on-surface', cargando && 'opacity-90')}>
              {/* Cabecera de la función */}
              <section ref={refs.arriba} className="relative w-full scroll-mt-32 overflow-hidden rounded-lg bg-surface-container shadow-2xl">
                <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary-container/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-secondary-container/15 blur-3xl" />
                <div className="relative flex flex-col gap-space-lg p-space-lg sm:p-gutter-lg">
                  <div className="flex flex-wrap items-center justify-between gap-space-md">
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <span className="rounded bg-primary-container/20 px-2.5 py-1 text-label-xs uppercase tracking-wider text-primary-fixed">{NOMBRE_CATEGORIA[cfg.evento.categoria]}</span>
                      <span className="text-outline">•</span>
                      <span className="flex items-center gap-1.5 text-label-md text-on-surface-variant">
                        <Icono nombre="verified" className="text-[16px] text-secondary" />
                        Productora: <strong className="font-semibold text-on-surface">{cfg.evento.productora}</strong>
                      </span>
                      <span className="text-outline">•</span>
                      <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono text-label-xs text-secondary-fixed">ID: {cfg.funcion.codigo}</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg bg-surface-container-lowest/80 px-4 py-2">
                      <div className="flex flex-col items-end">
                        <span className={cx('flex items-center gap-1.5 text-label-md', publicada ? 'text-tertiary' : 'text-outline')}>
                          <span className={cx('h-2 w-2 rounded-full', publicada ? 'animate-ping bg-tertiary' : 'bg-outline')} />
                          {publicada ? 'En venta online al público' : cfg.funcion.estado === 'BORRADOR' ? 'Borrador' : 'Despublicada'}
                        </span>
                        <span className="text-label-xs font-normal text-on-surface-variant">{publicada ? 'Función publicada (visible en cartelera)' : 'Venta pausada en el portal'}</span>
                      </div>
                      <Interruptor activo={publicada} onCambio={cambiarPublicacion} etiqueta="Publicar función" />
                    </div>
                  </div>
                  <div className="flex flex-col justify-between gap-space-lg lg:flex-row lg:items-end">
                    <div className="space-y-2">
                      {cfg.evento.descripcion && <p className="text-label-xs uppercase tracking-widest text-secondary">{cfg.evento.descripcion}</p>}
                      <h1 className="text-headline-xl-mobile tracking-tight text-on-surface md:text-headline-xl">{cfg.evento.nombre}</h1>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-body-md text-on-surface-variant">
                        <div className="flex items-center gap-2 text-on-surface">
                          <Icono nombre="calendar_today" className="text-[20px] text-secondary" />
                          <span className="font-semibold text-white">{fechaLarga(cfg.funcion.fechaHora)}</span>
                          <span className="text-label-md text-outline">— {hora(cfg.funcion.fechaHora)} hs</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Icono nombre="stadium" className="text-[20px] text-primary" />
                          <span>{cfg.sala.nombre}</span>
                          <span className="text-label-xs font-normal text-outline">({cfg.sala.direccion})</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded bg-surface-container-high px-2.5 py-0.5 text-label-md text-on-surface">
                          <Icono nombre="group" className="text-[16px] text-tertiary" />
                          Capacidad: <strong className="text-white">{numero(cfg.sala.capacidad)} pers.</strong>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <Boton icono="architecture" className="py-2.5" onClick={() => setModal('escenario')}>
                        Ajustar layout de escenario
                        {escenario && !escenario.esBase && <span className="rounded bg-secondary-container px-1.5 py-0.5 text-[10px] font-bold text-on-secondary-container">variante</span>}
                      </Boton>
                      <Boton icono="visibility" className="py-2.5" onClick={() => window.open(`/funciones/${funcionId}`, '_blank')}>
                        Previsualizar portal
                      </Boton>
                      <Boton variante="primario" icono="save" className="py-2.5" cargando={guardando} onClick={() => guardar()}>
                        Guardar cambios de función
                      </Boton>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid w-full grid-cols-1 items-start gap-space-md lg:grid-cols-12">
                {/* Tarifas por sector */}
                <div ref={refs.tarifas} className="flex min-w-0 scroll-mt-32 flex-col space-y-space-md rounded-lg bg-surface-container p-space-lg shadow-xl lg:col-span-5">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div>
                      <h2 className="flex items-center gap-2 text-headline-md text-on-surface">
                        <Icono nombre="payments" className="text-[20px] text-secondary" /> Tarifas por Sector
                      </h2>
                      <p className="mt-1 text-body-sm text-on-surface-variant">
                        Precios y promociones por sector heredados del <span className="font-medium text-on-surface">{cfg.sala.nombre}</span>.
                      </p>
                    </div>
                    <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono text-[11px] text-outline">{cfg.sectores.length} sectores</span>
                  </div>
                  <div className="space-y-space-sm">
                    {cfg.sectores.map((s) => {
                      const b = tarifas[s.id] ?? { precio: '', descuento: '', vigenciaHasta: '' };
                      const actualizar = (cambios: Partial<BorradorTarifa>) => setTarifas((t) => ({ ...t, [s.id]: { ...b, ...cambios } }));
                      const final = precioFinal(b);
                      const conDescuento = final !== aEntero(b.precio);
                      const vencido = !!b.descuento && !!b.vigenciaHasta && !conDescuento;
                      return (
                        <div key={s.id} className={cx('space-y-space-xs rounded bg-surface-container-low p-space-md transition-colors hover:bg-surface-container-high/60', sinPrecio.includes(s.id) && 'ring-2 ring-red-500/70')}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={cx('h-2.5 w-2.5 rounded-full', PALETA[s.color]?.clase)} />
                              <h3 className="text-title-sm text-white">{s.nombre}</h3>
                            </div>
                            <span className={cx('rounded px-2 py-0.5 text-label-xs uppercase', s.numerado ? 'bg-tertiary-container/30 text-tertiary' : 'bg-surface-container text-on-surface-variant')}>
                              {s.numerado ? `Numerado (${numero(s.cupo)} butacas)` : `Sin numerar (cupo: ${numero(s.cupo)})`}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-2">
                            <label>
                              <span className="etiqueta">Precio base</span>
                              <input className="campo-mono px-2.5 py-1.5 text-label-md" inputMode="numeric" placeholder="$ 0" value={b.precio ? `$ ${numero(aEntero(b.precio))}` : ''} onChange={(e) => actualizar({ precio: String(aEntero(e.target.value) || '') })} />
                            </label>
                            <label>
                              <span className="etiqueta">Descuento %</span>
                              <input className="campo-mono px-2.5 py-1.5 text-label-md text-tertiary" inputMode="numeric" placeholder="0" value={b.descuento} onChange={(e) => actualizar({ descuento: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                            </label>
                            <div>
                              <span className="etiqueta">Precio final</span>
                              <div className={cx('rounded bg-surface-container-highest px-2.5 py-2 font-mono text-label-md', conDescuento ? 'text-tertiary' : 'text-white')}>{b.precio ? pesos(final) : '—'}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-on-surface-variant">
                            {b.descuento ? (
                              <label className={cx('flex items-center gap-1', vencido && 'text-error')}>
                                <Icono nombre={vencido ? 'timer_off' : 'schedule'} className="text-[14px]" />
                                {vencido ? 'Promo vencida el' : 'Vigencia promo hasta'}
                                <input type="date" className="campo-mono w-auto px-1.5 py-0.5 text-[11px]" value={b.vigenciaHasta} onChange={(e) => actualizar({ vigenciaHasta: e.target.value })} />
                              </label>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Icono nombre="event_busy" className="text-[14px] text-outline" /> Sin descuento por tramo
                              </span>
                            )}
                            <span className={cx('font-medium', s.vendidas >= s.cupo ? 'text-tertiary' : 'text-secondary')}>
                              {s.vendidas >= s.cupo ? '100% Sold Out' : `${numero(s.vendidas)} / ${numero(s.cupo)} vendidos`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-outline">Para quitar un descuento dejá el porcentaje vacío. Los cambios de precio aplican a las reservas nuevas.</p>
                </div>

                {/* Estacionamiento */}
                <div className="flex min-w-0 flex-col space-y-space-md rounded-lg bg-surface-container p-space-lg shadow-xl lg:col-span-4">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div>
                      <h2 className="flex items-center gap-2 text-headline-md text-on-surface">
                        <Icono nombre="local_parking" className="text-[20px] text-secondary" /> Pases de Estacionamiento
                      </h2>
                      <p className="mt-1 text-body-sm text-on-surface-variant">Cocheras y acceso vehicular habilitados para esta función.</p>
                    </div>
                    <Chip tono={Object.values(playas).some((p) => p.habilitada) ? 'exito' : 'neutro'}>{Object.values(playas).some((p) => p.habilitada) ? 'Activo' : 'Inactivo'}</Chip>
                  </div>
                  {!cfg.playas.length ? (
                    <Aviso tono="info">La sala no tiene playas cargadas. El administrador las define en el editor de la sala.</Aviso>
                  ) : (
                    <>
                      <Campo etiqueta="Playa de la sala">
                        <select className="campo" value={playaVista ?? ''} onChange={(e) => setPlayaVista(Number(e.target.value))}>
                          {cfg.playas.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre} (capacidad: {p.capacidadTotal}) {playas[p.id]?.habilitada ? '· habilitada' : ''}
                            </option>
                          ))}
                        </select>
                      </Campo>
                      {playa && borradorPlaya && (
                        <>
                          <label className="flex items-center justify-between rounded bg-surface-container-low p-2.5 text-label-md">
                            <span>Habilitar para esta función</span>
                            <Interruptor
                              activo={borradorPlaya.habilitada}
                              etiqueta="Habilitar playa"
                              deshabilitado={!playa.habilitadaEnSala}
                              onCambio={(v) => setPlayas((p) => ({ ...p, [playa.id]: { ...borradorPlaya, habilitada: v } }))}
                            />
                          </label>
                          {playa.usoExclusivo && <p className="text-[11px] text-amber-300">Playa de uso exclusivo (VIP / prensa).</p>}
                          <div className={cx('grid grid-cols-2 gap-3', !borradorPlaya.habilitada && 'pointer-events-none opacity-40')}>
                            <label>
                              <span className="etiqueta">Tarifa por pase</span>
                              <input className="campo-mono" inputMode="numeric" value={borradorPlaya.precio ? `$ ${numero(aEntero(borradorPlaya.precio))}` : ''} placeholder="$ 0" onChange={(e) => setPlayas((p) => ({ ...p, [playa.id]: { ...borradorPlaya, precio: String(aEntero(e.target.value) || '') } }))} />
                            </label>
                            <label>
                              <span className="etiqueta">Cupo habilitado</span>
                              <input className="campo-mono" inputMode="numeric" value={borradorPlaya.cupo} onChange={(e) => setPlayas((p) => ({ ...p, [playa.id]: { ...borradorPlaya, cupo: e.target.value.replace(/\D/g, '') } }))} />
                            </label>
                          </div>
                          <div className="space-y-2 rounded bg-surface-container-low p-space-md">
                            <div className="flex items-center justify-between text-label-xs">
                              <span className="font-normal text-on-surface-variant">Cupo asignado vs. capacidad física</span>
                              <span className="font-mono text-secondary">
                                {aEntero(borradorPlaya.cupo)} / {playa.capacidadTotal} ({porcentaje(aEntero(borradorPlaya.cupo), playa.capacidadTotal)})
                              </span>
                            </div>
                            <Progreso valor={aEntero(borradorPlaya.cupo)} total={playa.capacidadTotal} className="h-2.5" />
                            <p className="text-[11px] leading-tight text-outline">
                              {playa.tarifa ? `${playa.tarifa.reservados} pases vendidos o reservados.` : 'Sin pases emitidos.'} {playa.capacidadTotal - aEntero(borradorPlaya.cupo)} cocheras quedan para producción y acreditados.
                            </p>
                          </div>
                        </>
                      )}
                      <label className="flex cursor-pointer items-start gap-3 rounded bg-surface-container-low p-2 transition-colors hover:bg-surface-container-high">
                        <input type="checkbox" className="form-checkbox mt-0.5 h-4 w-4 rounded border-0 bg-surface-container-lowest text-primary-container focus:ring-secondary" checked={exigePatente} onChange={(e) => setExigePatente(e.target.checked)} />
                        <span>
                          <span className="block text-label-md text-on-surface">Exigir patente obligatoria en checkout</span>
                          <span className="block text-[11px] text-on-surface-variant">Permite validar el ingreso por QR o por lectura de matrícula.</span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 rounded bg-surface-container-lowest p-2.5 text-body-sm text-on-surface-variant">
                        <Icono nombre="alarm" className="text-[18px] text-secondary" />
                        Apertura de playa:
                        <input type="time" className="campo-mono w-auto px-2 py-0.5" value={apertura} onChange={(e) => setApertura(e.target.value)} /> hs
                      </label>
                      <div className="mt-auto flex items-center justify-between rounded bg-gradient-to-r from-secondary-container/20 to-primary-container/20 p-space-md">
                        <div>
                          <span className="block text-label-xs uppercase tracking-wider text-on-surface-variant">Recaudación potencial</span>
                          <span className="font-mono text-headline-md text-secondary">
                            {pesos(Object.values(playas).reduce((a, p) => a + (p.habilitada ? aEntero(p.precio) * aEntero(p.cupo) : 0), 0))}
                          </span>
                        </div>
                        <Icono nombre="directions_car" className="text-[28px] text-secondary-fixed" />
                      </div>
                    </>
                  )}
                </div>

                {/* Preventa gastronómica */}
                <div className="flex min-w-0 flex-col space-y-space-md rounded-lg bg-surface-container p-space-lg shadow-xl lg:col-span-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-headline-md text-on-surface">
                      <Icono nombre="fastfood" className="text-[20px] text-tertiary" /> Preventa Gastronómica
                    </h2>
                    <p className="mt-1 text-body-sm text-on-surface-variant">Entrega exprés por voucher QR en barras del predio (catálogo del evento).</p>
                  </div>
                  <div className="space-y-space-sm">
                    {cfg.productos.length === 0 && <p className="text-body-sm text-outline">Sin productos en preventa.</p>}
                    {cfg.productos.map((p) => {
                      const ahorro = p.precioLista ? Math.round((1 - p.precioPreventa / p.precioLista) * 100) : 0;
                      const bajo = p.stockDisponible < 100;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setModal({ producto: p })}
                          className={cx('w-full space-y-1.5 rounded bg-surface-container-low p-3 text-left transition-colors hover:bg-surface-container-high', !p.activo && 'opacity-50')}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <h4 className="text-label-md leading-tight text-white">{p.nombre}</h4>
                            <span
                              className={cx(
                                'whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                                !p.activo ? 'bg-surface-container-highest text-outline' : bajo ? 'bg-amber-500/20 text-amber-300' : 'bg-tertiary-container/30 text-tertiary',
                              )}
                            >
                              {!p.activo ? 'Inactivo' : bajo ? 'Stock bajo' : 'Activo'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-mono text-title-sm text-white">{pesos(p.precioPreventa)}</span>
                            {p.precioLista && <span className="font-mono text-[11px] text-outline line-through">{pesos(p.precioLista)}</span>}
                            {ahorro > 0 && <span className="rounded bg-tertiary/10 px-1 text-[10px] font-bold uppercase text-tertiary">-{ahorro}% ahorro</span>}
                          </div>
                          <div className="flex items-center justify-between pt-0.5 text-[11px] text-on-surface-variant">
                            <span className={cx('flex items-center gap-1 font-mono', bajo && 'text-amber-300')}>
                              <Icono nombre={bajo ? 'warning' : 'inventory_2'} className="text-[13px]" /> Stock: <strong>{numero(p.stockDisponible)} u.</strong>
                            </span>
                            <span className="text-outline">{numero(p.vendidos)} vendidos</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <Boton className="mt-auto w-full py-2.5 text-tertiary" icono="add_box" onClick={() => setModal({ producto: null })}>
                    Nuevo producto al catálogo
                  </Boton>
                </div>
              </section>

              {/* Métricas */}
              {m && (
                <section ref={refs.metricas} className="w-full scroll-mt-32 space-y-space-md rounded-lg bg-surface-container p-space-lg shadow-2xl">
                  <div className="flex flex-col justify-between gap-space-md pb-2 md:flex-row md:items-center">
                    <div>
                      <h2 className="flex items-center gap-2 text-headline-lg tracking-tight text-on-surface">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-tertiary" /> Métricas de Ventas en Vivo (Función {fechaCorta(cfg.funcion.fechaHora)})
                      </h2>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-body-sm text-on-surface-variant">
                        Monitoreo transaccional de taquilla, estacionamiento y barras.
                        <span className="text-outline">•</span>
                        <span className="font-mono text-secondary">Actualizado: {hora(new Date(actualizado).toISOString())} hs</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-space-sm">
                      <Boton icono="refresh" onClick={recargar} cargando={cargando}>
                        Sincronizar
                      </Boton>
                      <Boton variante="suave" className="text-secondary" icono="download" onClick={() => descargar(`/org/funciones/${funcionId}/reporte.csv`, `reporte-${cfg.funcion.codigo}.csv`)}>
                        Exportar reporte contable (CSV)
                      </Boton>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-4">
                    <Kpi titulo="Recaudación bruta total" chip={`+${numero(m.entradas.ultimas24h)} entradas 24 h`} barra="bg-primary-container">
                      <div className="font-mono text-headline-xl text-white">{pesos(m.recaudacion.total)}</div>
                      <Desglose filas={[['Entradas:', pesos(m.recaudacion.entradas), 'text-white'], ['Estacionamiento:', pesos(m.recaudacion.estacionamiento), 'text-secondary'], ['Consumiciones:', pesos(m.recaudacion.consumiciones), 'text-tertiary'], ['Reembolsado:', pesos(m.recaudacion.reembolsado), 'text-outline']]} />
                    </Kpi>
                    <Kpi titulo="Entradas vendidas" chip={`${porcentaje(m.entradas.vendidas, m.entradas.cupo)} ocupado`} chipColor="bg-secondary-container/20 text-secondary" barra="bg-secondary">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-headline-xl text-white">{numero(m.entradas.vendidas)}</span>
                        <span className="font-mono text-title-sm text-outline">/ {numero(m.entradas.cupo)} cupo</span>
                      </div>
                      <Progreso valor={m.entradas.vendidas} total={m.entradas.cupo} className="my-2" />
                      <Desglose
                        filas={m.entradas.porSector.map((s) => [`${s.nombre}:`, `${numero(s.vendidas)}/${numero(s.cupo)} (${porcentaje(s.vendidas, s.cupo)})`, s.vendidas >= s.cupo ? 'font-bold text-tertiary' : 'text-white'])}
                      />
                    </Kpi>
                    <Kpi titulo="Pases estacionamiento" chip={porcentaje(m.estacionamiento.vendidos, m.estacionamiento.cupo)} barra="bg-tertiary">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-headline-xl text-white">{numero(m.estacionamiento.vendidos)}</span>
                        <span className="font-mono text-title-sm text-outline">/ {numero(m.estacionamiento.cupo)} pases</span>
                      </div>
                      <Progreso valor={m.estacionamiento.vendidos} total={m.estacionamiento.cupo} color="bg-tertiary" className="my-2" />
                      <Desglose
                        filas={[
                          ['Ingreso generado:', pesos(m.recaudacion.estacionamiento), 'font-bold text-tertiary'],
                          ['Cocheras libres:', `${numero(m.estacionamiento.libres)} disponibles`, 'text-white'],
                          ['Patentes registradas:', `${m.estacionamiento.patentesRegistradas} de ${m.estacionamiento.vendidos}`, 'text-secondary'],
                        ]}
                      />
                    </Kpi>
                    <Kpi titulo="Vouchers gastronomía" chip={`${Math.round(m.consumiciones.conversion * 100)}% conv.`} chipColor="bg-primary-container/20 text-primary-fixed" barra="bg-indigo-500">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-headline-xl text-white">{numero(m.consumiciones.vouchers)}</span>
                        <span className="text-title-sm text-outline">vouchers</span>
                      </div>
                      <Progreso valor={m.consumiciones.vouchers} total={Math.max(1, m.consumiciones.comprasPagadas)} color="bg-primary-container" className="my-2" />
                      <Desglose
                        filas={[
                          ...m.consumiciones.porProducto.slice(0, 2).map((p) => [`${p.nombre}:`, `${numero(p.cantidad)} u.`, 'text-white'] as [string, string, string]),
                          ['Conversión checkout:', `${Math.round(m.consumiciones.conversion * 100)} de c/ 100 compras`, 'font-bold text-primary-fixed'],
                        ]}
                      />
                    </Kpi>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-container-lowest/60 px-4 py-2.5 text-[12px] text-on-surface-variant">
                    <div className="flex items-center gap-2">
                      <Icono nombre="cloud_done" className="text-[16px] text-secondary" />
                      Pasarela de pagos enlazada a la cuenta de recaudación de <strong className="text-white">{cfg.evento.productora}</strong>.
                    </div>
                    <div className="flex items-center gap-3 text-outline">
                      <span>
                        Ingresos registrados: <strong className="text-white">{numero(m.entradas.ingresadas)}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Vouchers canjeados: <strong className="text-white">{numero(m.consumiciones.canjeados)}</strong>
                      </span>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </main>
      </div>

      {cfg && (
        <>
          <ModalEscenario abierto={modal === 'escenario'} cfg={cfg} onCerrar={() => setModal(null)} onListo={recargar} />
          <ModalProducto
            abierto={typeof modal === 'object' && modal !== null}
            producto={typeof modal === 'object' && modal ? modal.producto : null}
            eventoId={cfg.evento.id}
            onCerrar={() => setModal(null)}
            onListo={recargar}
          />
        </>
      )}
      <ModalNuevaFuncion abierto={modal === 'funcion'} panel={panel} onCerrar={() => setModal(null)} onCreada={recargarPanel} />
    </>
  );
}

function Kpi({ titulo, chip, chipColor = 'bg-tertiary-container/30 text-tertiary', barra, children }: { titulo: string; chip: string; chipColor?: string; barra: string; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col justify-between space-y-3 overflow-hidden rounded-lg bg-surface-container-low p-space-md">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label-md uppercase tracking-wider text-on-surface-variant">{titulo}</span>
        <span className={cx('whitespace-nowrap rounded px-2 py-0.5 font-mono text-[11px] font-bold', chipColor)}>{chip}</span>
      </div>
      <div>{children}</div>
      <div className={cx('h-1 w-full rounded-full', barra)} />
    </div>
  );
}

function Desglose({ filas }: { filas: [string, string, string][] }) {
  return (
    <div className="mt-1 space-y-0.5 text-[11px] text-on-surface-variant">
      {filas.map(([k, v, clase]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="truncate">{k}</span>
          <span className={cx('whitespace-nowrap font-mono', clase)}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function ModalEscenario({ abierto, cfg, onCerrar, onListo }: { abierto: boolean; cfg: ConfigFuncion; onCerrar: () => void; onListo: () => void }) {
  const toast = useToast();
  const [elegido, setElegido] = useState(cfg.funcion.escenarioId);
  useEffect(() => setElegido(cfg.funcion.escenarioId), [cfg.funcion.escenarioId, abierto]);
  const guardar = async () => {
    try {
      await api.patch(`/org/funciones/${cfg.funcion.id}`, { escenarioId: elegido });
      toast('Escenario de la función actualizado');
      onCerrar();
      onListo();
    } catch (e) {
      toast(mensajeError(e), 'error');
    }
  };
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Ajustar escenario de la función" icono="architecture">
      <p className="mb-3 text-body-sm text-on-surface-variant">Elegí uno de los diseños de escenario que el administrador cargó para {cfg.sala.nombre}.</p>
      <div className="space-y-2">
        {cfg.escenarios.map((e) => (
          <label key={e.id} className={cx('flex cursor-pointer items-center gap-3 rounded-lg border p-3', elegido === e.id ? 'border-primary-container bg-primary-container/10' : 'border-nv-line')}>
            <input type="radio" name="escenario" className="form-radio border-nv-line-strong bg-nv-page text-primary-container" checked={elegido === e.id} onChange={() => setElegido(e.id)} />
            <span className="flex-1 text-body-md text-on-surface">{e.nombre}</span>
            {e.esBase && <Chip tono="neutro">Base</Chip>}
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="fantasma" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton variante="primario" icono="check" onClick={guardar}>
          Aplicar
        </Boton>
      </div>
    </Modal>
  );
}

function ModalProducto({ abierto, producto, eventoId, onCerrar, onListo }: { abierto: boolean; producto: ConfigFuncion['productos'][number] | null; eventoId: number; onCerrar: () => void; onListo: () => void }) {
  const toast = useToast();
  const vacio = { nombre: '', descripcion: '', precioPreventa: '', precioLista: '', stockDisponible: '', activo: true };
  const [f, setF] = useState(vacio);
  useEffect(() => {
    if (!abierto) return;
    setF(
      producto
        ? {
            nombre: producto.nombre,
            descripcion: producto.descripcion ?? '',
            precioPreventa: String(producto.precioPreventa),
            precioLista: producto.precioLista ? String(producto.precioLista) : '',
            stockDisponible: String(producto.stockDisponible),
            activo: producto.activo,
          }
        : vacio,
    );
    // eslint-disable-next-line
  }, [abierto, producto]);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const cuerpo = {
      nombre: f.nombre,
      descripcion: f.descripcion || null,
      precioPreventa: aEntero(f.precioPreventa),
      precioLista: aEntero(f.precioLista) || null,
      stockDisponible: aEntero(f.stockDisponible),
      activo: f.activo,
    };
    try {
      if (producto) await api.patch(`/org/productos/${producto.id}`, cuerpo);
      else await api.post(`/org/eventos/${eventoId}/productos`, cuerpo);
      toast(producto ? 'Producto actualizado' : 'Producto agregado al catálogo');
      onCerrar();
      onListo();
    } catch (err) {
      toast(mensajeError(err), 'error');
    }
  };

  const eliminar = async () => {
    if (!producto) return;
    try {
      await api.delete(`/org/productos/${producto.id}`);
      toast(producto.vendidos ? 'El producto tenía ventas: se dio de baja del catálogo' : 'Producto eliminado');
      onCerrar();
      onListo();
    } catch (err) {
      toast(mensajeError(err), 'error');
    }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={producto ? 'Editar producto' : 'Nuevo producto en preventa'} icono="fastfood">
      <form onSubmit={guardar} className="space-y-3">
        <Campo etiqueta="Nombre">
          <input className="campo" required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej: 1x Doble Burger + Cerveza 500cc" />
        </Campo>
        <Campo etiqueta="Descripción">
          <input className="campo" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
        </Campo>
        <div className="grid grid-cols-3 gap-3">
          <Campo etiqueta="Precio preventa">
            <input className="campo-mono" required inputMode="numeric" value={f.precioPreventa} onChange={(e) => setF({ ...f, precioPreventa: e.target.value.replace(/\D/g, '') })} />
          </Campo>
          <Campo etiqueta="Precio en barra">
            <input className="campo-mono" inputMode="numeric" value={f.precioLista} onChange={(e) => setF({ ...f, precioLista: e.target.value.replace(/\D/g, '') })} />
          </Campo>
          <Campo etiqueta="Stock">
            <input className="campo-mono" required inputMode="numeric" value={f.stockDisponible} onChange={(e) => setF({ ...f, stockDisponible: e.target.value.replace(/\D/g, '') })} />
          </Campo>
        </div>
        <label className="flex items-center justify-between rounded-lg bg-nv-page p-2.5 text-label-md">
          Disponible en el checkout
          <Interruptor activo={f.activo} etiqueta="Producto activo" onCambio={(v) => setF({ ...f, activo: v })} />
        </label>
        <div className="flex justify-between gap-2 pt-2">
          {producto ? (
            <Boton variante="peligro" icono="delete" onClick={eliminar}>
              Eliminar
            </Boton>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Boton variante="fantasma" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" icono="save">
              Guardar
            </Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function ModalNuevaFuncion({ abierto, panel, onCerrar, onCreada }: { abierto: boolean; panel: DatosPanel | null; onCerrar: () => void; onCreada: () => void }) {
  const toast = useToast();
  const navegar = useNavigate();
  const [eventoId, setEventoId] = useState<string>('nuevo');
  const [evento, setEvento] = useState({ nombre: '', categoria: 'RECITAL' as Categoria, descripcion: '' });
  const [salaId, setSalaId] = useState<string>('');
  const [fecha, setFecha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const salas = useMemo(() => panel?.salas ?? [], [panel]);

  useEffect(() => {
    if (abierto && panel) {
      setEventoId(panel.eventos[0] ? String(panel.eventos[0].id) : 'nuevo');
      setSalaId(salas[0] ? String(salas[0].id) : '');
    }
  }, [abierto, panel, salas]);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      let id = Number(eventoId);
      if (eventoId === 'nuevo') id = (await api.post<{ id: number }>('/org/eventos', evento)).id;
      const funcion = await api.post<{ id: number }>('/org/funciones', { eventoId: id, salaId: Number(salaId), fechaHora: desdeInputFechaHora(fecha) });
      toast('Función programada en borrador. Definí precios por sector y publicala.');
      onCerrar();
      onCreada();
      navegar(`/organizador/funciones/${funcion.id}`);
    } catch (err) {
      toast(mensajeError(err), 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Programar función" icono="event">
      <form onSubmit={crear} className="space-y-3">
        <Campo etiqueta="Evento">
          <select className="campo" value={eventoId} onChange={(e) => setEventoId(e.target.value)}>
            {panel?.eventos.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.nombre}
              </option>
            ))}
            <option value="nuevo">+ Crear evento nuevo…</option>
          </select>
        </Campo>
        {eventoId === 'nuevo' && (
          <div className="space-y-3 rounded-lg border border-dashed border-nv-line-strong p-3">
            <Campo etiqueta="Nombre del evento">
              <input className="campo" required value={evento.nombre} onChange={(e) => setEvento({ ...evento, nombre: e.target.value })} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Categoría">
                <select className="campo" value={evento.categoria} onChange={(e) => setEvento({ ...evento, categoria: e.target.value as Categoria })}>
                  {(Object.keys(NOMBRE_CATEGORIA) as Categoria[]).map((c) => (
                    <option key={c} value={c}>
                      {NOMBRE_CATEGORIA[c]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Descripción">
                <input className="campo" value={evento.descripcion} onChange={(e) => setEvento({ ...evento, descripcion: e.target.value })} />
              </Campo>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Sala">
            <select className="campo" required value={salaId} onChange={(e) => setSalaId(e.target.value)}>
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Fecha y hora">
            <input className="campo-mono" type="datetime-local" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
        </div>
        <Aviso tono="info">Se verifica que la sala esté libre en esa fecha y hora. La función se crea en borrador.</Aviso>
        <div className="flex justify-end gap-2">
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" icono="add" cargando={enviando}>
            Programar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
