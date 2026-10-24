// Editor gráfico de mapa de sala y playas (pantalla 1 de Stitch).
// Dibujar escenario y definir sectores, cargar mapa de butacas y gestionar playas de estacionamiento.
import { type FormEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Cabecera } from '../../components/Cabecera';
import { COLORES, MapaSala, PALETA, type SectorDibujo } from '../../components/MapaSala';
import { useToast } from '../../components/Toast';
import { Aviso, Boton, Campo, Cargando, cx, Icono, Modal } from '../../components/ui';
import { api, mensajeError } from '../../lib/api';
import { numero } from '../../lib/formato';
import type { Geometria, Playa, SalaDetalle, SalaListado } from '../../lib/tipos';
import { useCarga } from '../../lib/useCarga';
import { NavAdmin } from './NavAdmin';

interface SectorEdit extends SectorDibujo {
  id: number | string; // string = sector nuevo todavía no guardado
  codigo: string;
  cupoMaximo: number;
  puertaAcceso: string;
  entradasEmitidas: number;
}
interface Mapa {
  escenario: Geometria & { nombre: string };
  sectores: SectorEdit[];
}
type Seleccion = number | string | 'escenario' | null;

const deSala = (s: SalaDetalle): Mapa => ({
  escenario: s.escenario
    ? { nombre: s.escenario.nombre, posX: s.escenario.posX, posY: s.escenario.posY, ancho: s.escenario.ancho, alto: s.escenario.alto }
    : { nombre: 'Escenario Principal', posX: 180, posY: 24, ancho: 500, alto: 105 },
  sectores: s.sectores.map((x) => ({
    id: x.id,
    codigo: x.codigo,
    nombre: x.nombre,
    numerado: x.numerado,
    color: x.color,
    forma: x.forma,
    filas: x.filas,
    butacasPorFila: x.butacasPorFila,
    cupo: x.cupoMaximo,
    cupoMaximo: x.cupoMaximo,
    posX: x.posX,
    posY: x.posY,
    ancho: x.ancho,
    alto: x.alto,
    puertaAcceso: x.puertaAcceso ?? '',
    entradasEmitidas: x.entradasEmitidas,
  })),
});

const capacidad = (s: SectorEdit) => (s.numerado ? s.filas * s.butacasPorFila : s.cupoMaximo);
const redondear = (v: number, paso: number) => Math.round(v / paso) * paso;

export default function EditorSala() {
  const { id } = useParams();
  const { datos: salas, recargar: recargarSalas } = useCarga(() => api.get<SalaListado[]>('/admin/salas'), []);
  if (!id) {
    if (!salas) return (<><Cabecera /><Cargando /></>);
    return salas[0] ? <Navigate to={`/admin/salas/${salas[0].id}`} replace /> : <EditorVacio onCreada={recargarSalas} />;
  }
  return <Editor salaId={Number(id)} salas={salas ?? []} recargarSalas={recargarSalas} />;
}

function EditorVacio({ onCreada }: { onCreada: () => void }) {
  const [abierto, setAbierto] = useState(true);
  return (
    <>
      <Cabecera subbarra={<NavAdmin />} />
      <main className="mx-auto max-w-xl p-8">
        <Boton variante="primario" icono="add" onClick={() => setAbierto(true)}>
          Crear la primera sala
        </Boton>
      </main>
      <ModalNuevaSala abierto={abierto} onCerrar={() => setAbierto(false)} onCreada={onCreada} />
    </>
  );
}

function Editor({ salaId, salas, recargarSalas }: { salaId: number; salas: SalaListado[]; recargarSalas: () => void }) {
  const navegar = useNavigate();
  const toast = useToast();
  const { datos: sala, setDatos: setSala, error } = useCarga(() => api.get<SalaDetalle>(`/admin/salas/${salaId}`), [salaId]);

  // Mapa editable con historial para deshacer / rehacer
  const [historial, setHistorial] = useState<{ pasos: Mapa[]; indice: number }>({ pasos: [], indice: 0 });
  const mapa = historial.pasos[historial.indice] ?? null;
  const [borrador, setBorrador] = useState<Mapa | null>(null); // durante un arrastre
  const visible = borrador ?? mapa;
  const [guardadoIndice, setGuardadoIndice] = useState(0);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [zoom, setZoom] = useState(1);
  const [cuadricula, setCuadricula] = useState(true);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [guardando, setGuardando] = useState(false);
  const [nuevaSala, setNuevaSala] = useState(false);
  const svgRef = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ id: Seleccion; accion: 'mover' | 'redimensionar'; inicio: { x: number; y: number }; original: Geometria; base: Mapa } | null>(null);

  const reiniciarHistorial = useCallback((s: SalaDetalle) => {
    setHistorial({ pasos: [deSala(s)], indice: 0 });
    setGuardadoIndice(0);
  }, []);

  // Solo al cambiar de sala: editar datos o playas no debe descartar cambios del mapa sin guardar
  useEffect(() => {
    if (!sala) return;
    reiniciarHistorial(sala);
    setSeleccion(sala.sectores[0]?.id ?? 'escenario');
  }, [sala?.id, reiniciarHistorial]);

  const sinGuardar = historial.indice !== guardadoIndice;

  const aplicar = useCallback((cambio: (m: Mapa) => Mapa) => {
    setHistorial((h) => {
      const actual = h.pasos[h.indice];
      if (!actual) return h;
      const pasos = [...h.pasos.slice(0, h.indice + 1), cambio(actual)].slice(-60);
      return { pasos, indice: pasos.length - 1 };
    });
  }, []);

  const deshacer = () => setHistorial((h) => ({ ...h, indice: Math.max(0, h.indice - 1) }));
  const rehacer = () => setHistorial((h) => ({ ...h, indice: Math.min(h.pasos.length - 1, h.indice + 1) }));

  useEffect(() => {
    const atajos = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z') (e.preventDefault(), deshacer());
      if (e.key === 'y') (e.preventDefault(), rehacer());
    };
    window.addEventListener('keydown', atajos);
    return () => window.removeEventListener('keydown', atajos);
  }, []);

  const avisarSalida = useCallback((e: BeforeUnloadEvent) => sinGuardar && e.preventDefault(), [sinGuardar]);
  useEffect(() => {
    window.addEventListener('beforeunload', avisarSalida);
    return () => window.removeEventListener('beforeunload', avisarSalida);
  }, [avisarSalida]);

  const actualizarSector = (id: number | string, cambios: Partial<SectorEdit>) =>
    aplicar((m) => ({ ...m, sectores: m.sectores.map((s) => (s.id === id ? { ...s, ...cambios, cupo: cambios.cupoMaximo ?? s.cupoMaximo } : s)) }));
  const actualizarEscenario = (cambios: Partial<Mapa['escenario']>) => aplicar((m) => ({ ...m, escenario: { ...m.escenario, ...cambios } }));

  // ── Arrastrar y redimensionar ──
  const puntoSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current?.querySelector('svg');
    if (!svg) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const t = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: Math.round(t.x), y: Math.round(t.y) };
  };

  const alPresionar = (e: PointerEvent<SVGElement>, id: Seleccion, accion: 'mover' | 'redimensionar') => {
    if (!mapa) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSeleccion(id);
    const elemento = id === 'escenario' ? mapa.escenario : mapa.sectores.find((s) => s.id === id);
    if (!elemento) return;
    arrastre.current = { id, accion, inicio: puntoSvg(e), original: { posX: elemento.posX, posY: elemento.posY, ancho: elemento.ancho, alto: elemento.alto }, base: mapa };
  };

  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const p = puntoSvg(e);
    setCursor(p);
    const a = arrastre.current;
    if (!a || !sala) return;
    const paso = cuadricula ? 10 : 1;
    const dx = p.x - a.inicio.x;
    const dy = p.y - a.inicio.y;
    const g =
      a.accion === 'mover'
        ? {
            ...a.original,
            posX: Math.max(0, Math.min(sala.ancho - a.original.ancho, redondear(a.original.posX + dx, paso))),
            posY: Math.max(0, Math.min(sala.alto - a.original.alto, redondear(a.original.posY + dy, paso))),
          }
        : {
            ...a.original,
            ancho: Math.max(40, Math.min(sala.ancho - a.original.posX, redondear(a.original.ancho + dx, paso))),
            alto: Math.max(30, Math.min(sala.alto - a.original.posY, redondear(a.original.alto + dy, paso))),
          };
    setBorrador(
      a.id === 'escenario'
        ? { ...a.base, escenario: { ...a.base.escenario, ...g } }
        : { ...a.base, sectores: a.base.sectores.map((s) => (s.id === a.id ? { ...s, ...g } : s)) },
    );
  };

  const alSoltar = () => {
    if (arrastre.current && borrador) {
      const final = borrador;
      aplicar(() => final);
    }
    arrastre.current = null;
    setBorrador(null);
  };

  // ── Altas, bajas y guardado ──
  const nuevoSector = (forma: 'RECT' | 'TRAPECIO') => {
    if (!mapa) return;
    const n = mapa.sectores.length + 1;
    const id = `nuevo-${Date.now()}`;
    aplicar((m) => ({
      ...m,
      sectores: [
        ...m.sectores,
        {
          id,
          codigo: `SEC-NEW-${String(n).padStart(2, '0')}`,
          nombre: `Nuevo sector ${n}`,
          numerado: true,
          color: COLORES[n % COLORES.length],
          forma,
          filas: 2,
          butacasPorFila: 8,
          cupo: 16,
          cupoMaximo: 16,
          posX: 40,
          posY: 40,
          ancho: 220,
          alto: 110,
          puertaAcceso: '',
          entradasEmitidas: 0,
        },
      ],
    }));
    setSeleccion(id);
  };

  const duplicar = (s: SectorEdit) => {
    const id = `nuevo-${Date.now()}`;
    aplicar((m) => ({
      ...m,
      sectores: [...m.sectores, { ...s, id, codigo: `${s.codigo}-B`, nombre: `${s.nombre} (copia)`, posX: Math.min(s.posX + 30, 800), posY: Math.min(s.posY + 30, 600), entradasEmitidas: 0 }],
    }));
    setSeleccion(id);
  };

  const eliminar = (s: SectorEdit) => {
    if (s.entradasEmitidas) {
      toast(`"${s.nombre}" tiene ${s.entradasEmitidas} entradas emitidas: no se puede eliminar`, 'error');
      return;
    }
    aplicar((m) => ({ ...m, sectores: m.sectores.filter((x) => x.id !== s.id) }));
    setSeleccion('escenario');
  };

  const guardarMapa = async () => {
    if (!mapa) return;
    setGuardando(true);
    try {
      const actualizada = await api.put<SalaDetalle>(`/admin/salas/${salaId}/mapa`, {
        escenario: mapa.escenario,
        sectores: mapa.sectores.map((s) => ({
          id: typeof s.id === 'number' ? s.id : undefined,
          codigo: s.codigo,
          nombre: s.nombre,
          numerado: s.numerado,
          cupoMaximo: capacidad(s),
          filas: s.numerado ? s.filas : 0,
          butacasPorFila: s.numerado ? s.butacasPorFila : 0,
          color: s.color,
          forma: s.forma,
          posX: s.posX,
          posY: s.posY,
          ancho: s.ancho,
          alto: s.alto,
          puertaAcceso: s.puertaAcceso || null,
        })),
      });
      // Los sectores nuevos reciben id al guardarse: se reubica la selección por código
      const codigoSeleccion = seleccion !== 'escenario' ? mapa.sectores.find((s) => s.id === seleccion)?.codigo : null;
      setSala(actualizada);
      reiniciarHistorial(actualizada);
      if (codigoSeleccion) setSeleccion(actualizada.sectores.find((s) => s.codigo === codigoSeleccion.toUpperCase())?.id ?? null);
      toast('Diseño geométrico de la sala guardado. Las matrices de butacas se regeneraron.');
    } catch (e) {
      toast(mensajeError(e), 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (error) return (<><Cabecera subbarra={<NavAdmin />} /><main className="p-8"><Aviso tono="peligro">{error}</Aviso></main></>);
  if (!sala || !visible) return (<><Cabecera subbarra={<NavAdmin />} /><Cargando texto="Cargando sala…" /></>);

  const sector = typeof seleccion === 'number' || (typeof seleccion === 'string' && seleccion !== 'escenario') ? visible.sectores.find((s) => s.id === seleccion) : undefined;
  const bloqueado = !!sector?.entradasEmitidas;
  const capacidadTotal = visible.sectores.reduce((a, s) => a + capacidad(s), 0);
  const herramienta = (icono: string, titulo: string, onClick: () => void, activo = false) => (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick} className={cx('rounded p-1.5 transition-colors', activo ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface')}>
      <Icono nombre={icono} className="text-[18px]" />
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <Cabecera
        subbarra={
          <>
            <div className="flex flex-wrap items-center gap-3 text-body-sm">
              <NavAdmin />
              <select
                aria-label="Sala"
                className="campo w-auto py-1 text-label-md"
                value={salaId}
                onChange={(e) => {
                  if (sinGuardar && !confirm('Hay cambios sin guardar. ¿Cambiar de sala igualmente?')) return;
                  navegar(`/admin/salas/${e.target.value}`);
                }}
              >
                {salas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} ({s.direccion})
                  </option>
                ))}
              </select>
              <Boton className="py-1" icono="add" onClick={() => setNuevaSala(true)}>
                Nueva sala
              </Boton>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-nv-line bg-surface-container-lowest p-1">
              {herramienta('arrow_selector_tool', 'Selección (mover y redimensionar)', () => {}, true)}
              {herramienta('rectangle', 'Crear sector rectangular', () => nuevoSector('RECT'))}
              {herramienta('pentagon', 'Crear sector trapecial', () => nuevoSector('TRAPECIO'))}
              {herramienta('theaters', 'Seleccionar escenario', () => setSeleccion('escenario'), seleccion === 'escenario')}
              <span className="mx-1 h-4 w-px bg-nv-line" />
              <button type="button" aria-label="Alejar" className="px-1 font-mono text-on-surface-variant hover:text-white" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}>
                -
              </button>
              <span className="w-12 text-center font-mono text-[11px] text-primary">{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="Acercar" className="px-1 font-mono text-on-surface-variant hover:text-white" onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(1)))}>
                +
              </button>
              <span className="mx-1 h-4 w-px bg-nv-line" />
              <label className="flex cursor-pointer items-center gap-1.5 px-1.5 text-[11px] text-on-surface-variant">
                <input type="checkbox" className="form-checkbox h-3 w-3 rounded border-nv-line-strong bg-nv-page text-primary-container focus:ring-0" checked={cuadricula} onChange={(e) => setCuadricula(e.target.checked)} />
                Cuadrícula
              </label>
              <span className="mx-1 h-4 w-px bg-nv-line" />
              {herramienta('undo', 'Deshacer (Ctrl+Z)', deshacer)}
              {herramienta('redo', 'Rehacer (Ctrl+Y)', rehacer)}
            </div>
            <div className="flex items-center gap-3">
              <span className={cx('flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-label-md', sinGuardar ? 'border-amber-800/40 bg-amber-950/30 text-amber-300' : 'border-emerald-800/40 bg-emerald-950/30 text-emerald-400')}>
                <span className={cx('h-1.5 w-1.5 rounded-full', sinGuardar ? 'bg-amber-400' : 'bg-emerald-400')} />
                {sinGuardar ? 'Cambios sin guardar' : 'Mapa guardado'}
              </span>
              <Boton variante="primario" icono="save" className="py-1.5" cargando={guardando} disabled={!sinGuardar} onClick={guardarMapa}>
                Guardar mapa de sala
              </Boton>
            </div>
          </>
        }
      />

      <main className="flex flex-1 flex-col overflow-hidden xl:flex-row">
        {/* Panel izquierdo: datos de la sala y playas */}
        <aside className="w-full flex-shrink-0 space-y-3.5 overflow-y-auto border-nv-line bg-surface-container-lowest p-3.5 xl:w-[325px] xl:border-r">
          <DatosSala sala={sala} onActualizada={setSala} onCambio={recargarSalas} />
          <Playas sala={sala} onActualizada={setSala} />
        </aside>

        {/* Lienzo */}
        <section className="relative flex min-h-[560px] min-w-0 flex-1 flex-col bg-nv-canvas">
          <div className="flex h-6 items-center justify-between border-b border-nv-line bg-surface-container-lowest px-8 font-mono text-[10px] text-outline">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i}>{Math.round((i * sala.ancho) / 9)}px</span>
            ))}
          </div>
          <div
            ref={svgRef}
            className={cx('relative flex-1 overflow-auto p-8', cuadricula && 'cuadricula-cad')}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerLeave={alSoltar}
          >
            <div className="absolute right-4 top-2 z-10 flex items-center gap-2 rounded-md border border-nv-line-strong bg-surface-container-lowest/90 px-2.5 py-1 font-mono text-[11px] text-on-surface-variant backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              Cursor: X=<strong className="text-white">{cursor.x}</strong>, Y=<strong className="text-white">{cursor.y}</strong>
              <span className="text-outline">|</span> Escala: 1m = 25px
            </div>
            {/* Al 100% o menos el lienzo se ajusta al ancho disponible; con zoom mayor se desplaza */}
            <div
              className="relative mx-auto mt-4 rounded-3xl border border-dashed border-indigo-500/30 bg-slate-950/40 p-2"
              style={{ width: sala.ancho * zoom + 16, maxWidth: zoom <= 1 ? '100%' : undefined }}
            >
              <div className="absolute -top-3 left-6 rounded border border-indigo-500/30 bg-nv-canvas px-2 font-mono text-[10px] uppercase tracking-wider text-indigo-400">
                Perímetro de {sala.nombre} ({sala.ancho} x {sala.alto} px)
              </div>
              <MapaSala
                modo="edicion"
                ancho={sala.ancho}
                alto={sala.alto}
                escenario={visible.escenario}
                sectores={visible.sectores}
                seleccionado={seleccion}
                onSeleccionar={setSeleccion}
                onPointerDownElemento={alPresionar}
              />
            </div>
          </div>
          <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-4 rounded-lg border border-nv-line bg-surface-container-lowest/95 p-2.5 text-[11px] shadow-xl backdrop-blur">
            <span className="text-label-xs uppercase text-outline">Referencias:</span>
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="h-3 w-3 rounded border border-indigo-400 bg-indigo-600" /> Escenario
            </span>
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="h-3 w-3 rounded border border-cyan-400 bg-indigo-900" /> Sector numerado
            </span>
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="h-3 w-3 rounded border border-dashed border-emerald-400 bg-emerald-950" /> Sector sin numerar (cupo)
            </span>
          </div>
        </section>

        {/* Inspector de propiedades */}
        <aside className="w-full flex-shrink-0 space-y-4 overflow-y-auto border-nv-line bg-surface-container-lowest p-4 xl:w-[340px] xl:border-l">
          <div className="flex items-center justify-between border-b border-nv-line pb-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-label-md uppercase tracking-wider text-white">
                <Icono nombre="tune" className="text-[18px] text-cyan-400" /> Inspector de Propiedades
              </h2>
              <span className="text-[11px] text-cyan-400">Elemento seleccionado: {seleccion === 'escenario' ? 'Escenario' : (sector?.nombre ?? 'ninguno')}</span>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
          </div>

          {seleccion === 'escenario' && (
            <div className="space-y-3">
              <Campo etiqueta="Nombre del escenario">
                <input className="campo" value={visible.escenario.nombre} onChange={(e) => actualizarEscenario({ nombre: e.target.value })} />
              </Campo>
              <GeometriaCampos g={visible.escenario} onCambio={actualizarEscenario} />
              <Aviso tono="info">Este es el escenario base de la sala. El organizador puede elegir una variante por función.</Aviso>
            </div>
          )}

          {sector && (
            <div className="space-y-3">
              <Campo etiqueta="Nombre del sector">
                <input className="campo" value={sector.nombre} onChange={(e) => actualizarSector(sector.id, { nombre: e.target.value })} />
              </Campo>
              <Campo etiqueta="Identificador / código único">
                <input className="campo-mono uppercase text-cyan-300" value={sector.codigo} onChange={(e) => actualizarSector(sector.id, { codigo: e.target.value.toUpperCase() })} />
              </Campo>
              <div>
                <span className="etiqueta">Color en mapa y entradas</span>
                <div className="flex items-center gap-2">
                  {COLORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      onClick={() => actualizarSector(sector.id, { color: c })}
                      className={cx('h-6 w-6 rounded-full transition-transform hover:scale-110', PALETA[c].clase, sector.color === c && 'ring-2 ring-white ring-offset-2 ring-offset-surface-container-lowest')}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-nv-line bg-surface-container-low p-2.5">
                <span className="etiqueta">Geometría vectorial</span>
                <GeometriaCampos g={sector} onCambio={(g) => actualizarSector(sector.id, g)} />
                <Campo etiqueta="Forma geométrica SVG" className="mt-2">
                  <select className="campo py-1 text-body-sm" value={sector.forma} onChange={(e) => actualizarSector(sector.id, { forma: e.target.value })}>
                    <option value="RECT">Polígono rectangular</option>
                    <option value="TRAPECIO">Polígono trapecial</option>
                    <option value="ARCO">Arco curvo de estadio</option>
                  </select>
                </Campo>
              </div>

              <div className="rounded-lg border border-nv-line bg-surface-container-low p-3">
                <span className="mb-2 block text-label-md text-on-surface">Tipo y modalidad de sector</span>
                {bloqueado && <p className="mb-2 text-[11px] text-amber-300">Tiene {sector.entradasEmitidas} entradas emitidas: la modalidad y la matriz no se pueden cambiar.</p>}
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-nv-line bg-nv-page p-1 text-[11px]">
                  {[true, false].map((num) => (
                    <button
                      key={String(num)}
                      type="button"
                      disabled={bloqueado}
                      onClick={() => actualizarSector(sector.id, num ? { numerado: true, filas: sector.filas || 2, butacasPorFila: sector.butacasPorFila || 8 } : { numerado: false, cupoMaximo: capacidad(sector) || 500 })}
                      className={cx('rounded-md px-2 py-1.5 text-center font-semibold disabled:cursor-not-allowed', sector.numerado === num ? 'bg-primary-container text-white shadow' : 'text-on-surface-variant hover:text-on-surface')}
                    >
                      {num ? '● Numerado (butacas)' : 'Sin numerar (cupo)'}
                    </button>
                  ))}
                </div>
                <div className="mt-3 space-y-2 border-t border-nv-line pt-2.5">
                  {sector.numerado ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Campo etiqueta="Cantidad filas" ayuda={`Filas: A…${String.fromCharCode(64 + Math.min(26, sector.filas || 1))}`}>
                        <input type="number" min={1} max={40} disabled={bloqueado} className="campo-mono py-1" value={sector.filas} onChange={(e) => actualizarSector(sector.id, { filas: Math.max(1, Math.min(40, Number(e.target.value))) })} />
                      </Campo>
                      <Campo etiqueta="Butacas por fila" ayuda={`1 al ${sector.butacasPorFila} por fila`}>
                        <input type="number" min={1} max={60} disabled={bloqueado} className="campo-mono py-1" value={sector.butacasPorFila} onChange={(e) => actualizarSector(sector.id, { butacasPorFila: Math.max(1, Math.min(60, Number(e.target.value))) })} />
                      </Campo>
                    </div>
                  ) : (
                    <Campo etiqueta="Cupo máximo (personas)">
                      <input type="number" min={1} className="campo-mono py-1" value={sector.cupoMaximo} onChange={(e) => actualizarSector(sector.id, { cupoMaximo: Math.max(1, Number(e.target.value)) })} />
                    </Campo>
                  )}
                  <div className="flex items-center justify-between rounded border border-cyan-800/40 bg-cyan-950/30 p-2 text-body-sm text-cyan-300">
                    <span>Capacidad del sector:</span>
                    <strong className="font-mono text-body-md text-cyan-200">
                      {numero(capacidad(sector))} {sector.numerado ? 'butacas' : 'personas'}
                    </strong>
                  </div>
                </div>
              </div>

              <Campo etiqueta="Puerta de acceso sugerida">
                <input className="campo" placeholder="Ej: Molinete 3 - Acceso Norte VIP" value={sector.puertaAcceso} onChange={(e) => actualizarSector(sector.id, { puertaAcceso: e.target.value })} />
              </Campo>
              <div className="grid grid-cols-2 gap-2 border-t border-nv-line pt-3">
                <Boton onClick={() => duplicar(sector)} icono="content_copy">
                  Duplicar
                </Boton>
                <Boton variante="peligro" icono="delete" onClick={() => eliminar(sector)}>
                  Eliminar
                </Boton>
              </div>
            </div>
          )}
          {!sector && seleccion !== 'escenario' && <p className="text-body-sm text-on-surface-variant">Hacé clic en un sector o en el escenario del lienzo para editarlo.</p>}

          <Boton variante="exito" icono="save" className="w-full py-2.5" cargando={guardando} disabled={!sinGuardar} onClick={guardarMapa}>
            Guardar mapa de sala definitivo
          </Boton>
        </aside>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-nv-line bg-surface-container-lowest px-4 py-1 text-[11px] text-on-surface-variant">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Servidor: online
          </span>
          <span>
            Sectores totales: <strong className="text-white">{visible.sectores.length}</strong>
          </span>
          <span>
            Capacidad configurada: <strong className="text-white">{numero(capacidadTotal)} personas</strong> (máx. legal {numero(sala.capacidad)})
          </span>
          <span>
            Playas asociadas: <strong className="text-cyan-400">{sala.playas.filter((p) => p.habilitada).length} habilitadas ({numero(sala.playas.filter((p) => p.habilitada).reduce((a, p) => a + p.capacidadTotal, 0))} autos)</strong>
          </span>
        </div>
        <span className="font-mono text-[10px] text-outline">Código sala: {sala.codigo}</span>
      </footer>

      <ModalNuevaSala abierto={nuevaSala} onCerrar={() => setNuevaSala(false)} onCreada={recargarSalas} />
    </div>
  );
}

function GeometriaCampos({ g, onCambio }: { g: Geometria; onCambio: (g: Partial<Geometria>) => void }) {
  const campo = (k: keyof Geometria, etiqueta: string) => (
    <label>
      <span className="text-[10px] text-outline">{etiqueta}</span>
      <input type="number" className="campo-mono px-2 py-1 text-body-sm" value={Math.round(g[k])} onChange={(e) => onCambio({ [k]: Number(e.target.value) })} />
    </label>
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      {campo('posX', 'Pos X (px)')}
      {campo('posY', 'Pos Y (px)')}
      {campo('ancho', 'Ancho (px)')}
      {campo('alto', 'Alto (px)')}
    </div>
  );
}

function DatosSala({ sala, onActualizada, onCambio }: { sala: SalaDetalle; onActualizada: (s: SalaDetalle) => void; onCambio: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ nombre: sala.nombre, direccion: sala.direccion, capacidad: String(sala.capacidad) });
  useEffect(() => setF({ nombre: sala.nombre, direccion: sala.direccion, capacidad: String(sala.capacidad) }), [sala]);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      onActualizada(await api.patch<SalaDetalle>(`/admin/salas/${sala.id}`, { nombre: f.nombre, direccion: f.direccion, capacidad: Number(f.capacidad) }));
      onCambio();
      toast('Datos de la sala actualizados');
    } catch (err) {
      toast(mensajeError(err), 'error');
    }
  };
  return (
    <form onSubmit={guardar} className="rounded-lg border border-nv-line bg-surface-container p-3.5">
      <div className="mb-2.5 flex items-center justify-between border-b border-nv-line pb-2">
        <h2 className="flex items-center gap-1.5 text-label-md uppercase tracking-wider text-on-surface">
          <Icono nombre="domain" className="text-[16px] text-indigo-400" /> Información de la sala
        </h2>
        <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">ID: {sala.codigo}</span>
      </div>
      <div className="space-y-2.5">
        <Campo etiqueta="Nombre de sala">
          <input className="campo py-1.5" required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta="Dirección">
          <input className="campo py-1.5" required value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
        </Campo>
        <Campo etiqueta="Capacidad máxima legal (espectadores)">
          <input className="campo-mono py-1.5" required inputMode="numeric" value={f.capacidad} onChange={(e) => setF({ ...f, capacidad: e.target.value.replace(/\D/g, '') })} />
        </Campo>
        <Boton type="submit" className="w-full" icono="sync">
          Actualizar datos sala
        </Boton>
      </div>
    </form>
  );
}

function Playas({ sala, onActualizada }: { sala: SalaDetalle; onActualizada: (s: SalaDetalle) => void }) {
  const toast = useToast();
  const [nueva, setNueva] = useState({ nombre: '', capacidad: '' });
  const [editando, setEditando] = useState<Playa | null>(null);

  const refrescar = async () => onActualizada(await api.get<SalaDetalle>(`/admin/salas/${sala.id}`));
  const ejecutar = async (accion: () => Promise<unknown>, mensaje: string) => {
    try {
      await accion();
      await refrescar();
      toast(mensaje);
    } catch (e) {
      toast(mensajeError(e), 'error');
    }
  };

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    ejecutar(async () => {
      await api.post(`/admin/salas/${sala.id}/playas`, { nombre: nueva.nombre, capacidadTotal: Number(nueva.capacidad) });
      setNueva({ nombre: '', capacidad: '' });
    }, 'Playa agregada al registro');
  };

  return (
    <div className="flex flex-col rounded-lg border border-nv-line bg-surface-container p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 border-b border-nv-line pb-2">
        <Icono nombre="local_parking" className="text-[16px] text-cyan-400" />
        <h2 className="text-label-md uppercase tracking-wider text-on-surface">Playas de estacionamiento</h2>
      </div>
      <p className="mb-2 text-[11px] leading-tight text-on-surface-variant">Configuración física permanente de los estacionamientos del predio:</p>
      <div className="mb-3 space-y-2">
        {sala.playas.length === 0 && <p className="text-body-sm text-outline">Sin playas cargadas.</p>}
        {sala.playas.map((p) => (
          <div key={p.id} className="flex flex-col space-y-1.5 rounded-lg border border-nv-line bg-surface-container-lowest p-2.5 transition-colors hover:border-nv-line-strong">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-label-md text-on-surface">
                <span className={cx('h-1.5 w-1.5 rounded-full', p.usoExclusivo ? 'bg-amber-400' : 'bg-cyan-400')} />
                {p.nombre}
              </span>
              <span
                className={cx(
                  'whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium',
                  !p.habilitada ? 'border-nv-line text-outline' : p.usoExclusivo ? 'border-amber-800/40 bg-amber-950/40 text-amber-300' : 'border-emerald-800/40 bg-emerald-950/40 text-emerald-400',
                )}
              >
                {!p.habilitada ? 'Deshabilitada' : p.usoExclusivo ? 'Uso exclusivo' : 'Habilitada'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
              <span>
                Capacidad: <strong className="text-on-surface">{numero(p.capacidadTotal)} vehículos</strong>
              </span>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label={`Editar ${p.nombre}`} className="hover:text-indigo-400" onClick={() => setEditando(p)}>
                  <Icono nombre="edit" className="text-[16px]" />
                </button>
                <button type="button" aria-label={`Eliminar ${p.nombre}`} className="hover:text-rose-400" onClick={() => confirm(`¿Eliminar ${p.nombre}?`) && ejecutar(() => api.delete(`/admin/playas/${p.id}`), 'Playa eliminada')}>
                  <Icono nombre="delete" className="text-[16px]" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={agregar} className="mb-3 rounded-lg border border-dashed border-nv-line-strong bg-nv-canvas/60 p-2.5">
        <span className="mb-1.5 block text-label-xs uppercase text-on-surface-variant">+ Añadir nueva playa</span>
        <div className="mb-1.5 grid grid-cols-2 gap-1.5">
          <input className="campo px-2 py-1 text-body-sm" required placeholder="Nombre playa…" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
          <input className="campo-mono px-2 py-1 text-body-sm" required placeholder="Capac. veh." inputMode="numeric" value={nueva.capacidad} onChange={(e) => setNueva({ ...nueva, capacidad: e.target.value.replace(/\D/g, '') })} />
        </div>
        <button type="submit" className="w-full rounded border border-cyan-700/50 bg-cyan-900/50 py-1 text-[11px] font-medium text-cyan-200 transition-colors hover:bg-cyan-800/60">
          + Añadir al registro
        </button>
      </form>
      <div className="flex items-start gap-2 rounded-lg border border-nv-line bg-surface-container-lowest p-2.5 text-[11px] leading-tight text-on-surface-variant">
        <Icono nombre="info" className="text-[16px] text-indigo-400" />
        <p>
          Estas playas quedan disponibles para que el <strong className="text-on-surface">Organizador</strong> habilite cupos y tarifas por función.
        </p>
      </div>

      <Modal abierto={!!editando} onCerrar={() => setEditando(null)} titulo="Editar playa" icono="local_parking">
        {editando && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ejecutar(
                () => api.patch(`/admin/playas/${editando.id}`, { nombre: editando.nombre, capacidadTotal: editando.capacidadTotal, usoExclusivo: editando.usoExclusivo, habilitada: editando.habilitada }),
                'Playa actualizada',
              ).then(() => setEditando(null));
            }}
            className="space-y-3"
          >
            <Campo etiqueta="Nombre">
              <input className="campo" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
            </Campo>
            <Campo etiqueta="Capacidad (vehículos)">
              <input className="campo-mono" inputMode="numeric" value={editando.capacidadTotal} onChange={(e) => setEditando({ ...editando, capacidadTotal: Number(e.target.value.replace(/\D/g, '')) })} />
            </Campo>
            <label className="flex items-center gap-2 text-body-md">
              <input type="checkbox" className="form-checkbox rounded border-nv-line-strong bg-nv-page text-primary-container" checked={editando.usoExclusivo} onChange={(e) => setEditando({ ...editando, usoExclusivo: e.target.checked })} />
              Uso exclusivo (VIP / prensa)
            </label>
            <label className="flex items-center gap-2 text-body-md">
              <input type="checkbox" className="form-checkbox rounded border-nv-line-strong bg-nv-page text-primary-container" checked={editando.habilitada} onChange={(e) => setEditando({ ...editando, habilitada: e.target.checked })} />
              Habilitada
            </label>
            <div className="flex justify-end gap-2">
              <Boton variante="fantasma" onClick={() => setEditando(null)}>
                Cancelar
              </Boton>
              <Boton type="submit" variante="primario" icono="save">
                Guardar
              </Boton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function ModalNuevaSala({ abierto, onCerrar, onCreada }: { abierto: boolean; onCerrar: () => void; onCreada: () => void }) {
  const toast = useToast();
  const navegar = useNavigate();
  const [f, setF] = useState({ nombre: '', direccion: '', capacidad: '' });
  const crear = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const sala = await api.post<SalaDetalle>('/admin/salas', { nombre: f.nombre, direccion: f.direccion, capacidad: Number(f.capacidad) });
      toast('Sala creada con su escenario base. Ahora dibujá los sectores.');
      onCerrar();
      onCreada();
      setF({ nombre: '', direccion: '', capacidad: '' });
      navegar(`/admin/salas/${sala.id}`);
    } catch (err) {
      toast(mensajeError(err), 'error');
    }
  };
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Nueva sala" icono="add_business">
      <form onSubmit={crear} className="space-y-3">
        <Campo etiqueta="Nombre">
          <input className="campo" required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta="Dirección">
          <input className="campo" required value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
        </Campo>
        <Campo etiqueta="Capacidad máxima legal">
          <input className="campo-mono" required inputMode="numeric" value={f.capacidad} onChange={(e) => setF({ ...f, capacidad: e.target.value.replace(/\D/g, '') })} />
        </Campo>
        <div className="flex justify-end gap-2">
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="primario" icono="add">
            Crear sala
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
