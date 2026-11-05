// Mapa vectorial (SVG) de la sala: escenario, sectores y butacas.
// Lo usan el editor del administrador (modo "edicion") y el portal del comprador (modo "compra").
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { letraFila } from '../lib/formato';
import type { Geometria } from '../lib/tipos';

export const PALETA: Record<string, { relleno: string; borde: string; texto: string; butaca: string; clase: string }> = {
  indigo: { relleno: 'rgba(79,70,229,0.16)', borde: '#6366f1', texto: '#a5b4fc', butaca: '#4f46e5', clase: 'bg-indigo-500' },
  cyan: { relleno: 'rgba(6,182,212,0.12)', borde: '#22d3ee', texto: '#67e8f9', butaca: '#0891b2', clase: 'bg-cyan-400' },
  emerald: { relleno: 'rgba(16,185,129,0.12)', borde: '#10b981', texto: '#6ee7b7', butaca: '#059669', clase: 'bg-emerald-500' },
  amber: { relleno: 'rgba(245,158,11,0.12)', borde: '#f59e0b', texto: '#fcd34d', butaca: '#d97706', clase: 'bg-amber-500' },
  rose: { relleno: 'rgba(244,63,94,0.12)', borde: '#f43f5e', texto: '#fda4af', butaca: '#e11d48', clase: 'bg-rose-500' },
  purple: { relleno: 'rgba(168,85,247,0.12)', borde: '#a855f7', texto: '#d8b4fe', butaca: '#9333ea', clase: 'bg-purple-500' },
};
export const COLORES = Object.keys(PALETA);
const paleta = (color: string) => PALETA[color] ?? PALETA.indigo;

export const COLOR_SELECCION = '#2dd4bf';
const COLOR_OCUPADA = '#334155';

/** Unidades de dibujo por metro: la geometría se guarda en estas unidades y el editor la muestra en metros. */
export const PX_POR_METRO = 20;

/**
 * Textos, márgenes y controles están pensados para un plano de 43 x 32 m (860 x 640). En predios de otra medida
 * crecen o se achican en proporción, así el mapa se lee igual cuando se ajusta a la pantalla.
 */
export const escalaPlano = (ancho: number, alto: number) => Math.max(ancho / 860, alto / 640);

/** Metros entre puntos de la cuadrícula: 1 m en el plano de referencia, más en predios grandes para que no se amontonen. */
export const pasoCuadricula = (ancho: number, alto: number) => [1, 2, 5, 10, 20].find((m) => m >= 0.75 * escalaPlano(ancho, alto)) ?? 50;

export interface SectorDibujo extends Geometria {
  id: number | string;
  nombre: string;
  numerado: boolean;
  color: string;
  forma: string;
  filas: number;
  butacasPorFila: number;
  cupo?: number;
  precio?: number | null;
  disponibles?: number;
  butacas?: { id: number; fila: string; numero: number; posX: number; posY: number; ocupada: boolean }[];
}

const PAD = { arriba: 28, lados: 14, abajo: 10 };

/** Posiciones de butacas: las de la API (compra) o una matriz calculada (edición). */
function butacasDe(s: SectorDibujo) {
  if (s.butacas?.length) return s.butacas;
  if (!s.numerado || s.filas < 1 || s.butacasPorFila < 1) return [];
  const lista = [];
  for (let f = 0; f < s.filas; f++) {
    for (let n = 1; n <= s.butacasPorFila; n++) {
      lista.push({ id: -(f * 1000 + n), fila: letraFila(f), numero: n, posX: (n - 0.5) / s.butacasPorFila, posY: (f + 0.5) / s.filas, ocupada: false });
    }
  }
  return lista;
}

function contorno(s: Geometria & { forma: string }) {
  const { posX: x, posY: y, ancho: w, alto: h } = s;
  if (s.forma === 'TRAPECIO') {
    const d = w * 0.06;
    return `M ${x} ${y} L ${x + w} ${y} L ${x + w - d} ${y + h} L ${x + d} ${y + h} Z`;
  }
  if (s.forma === 'ARCO') {
    return `M ${x} ${y} Q ${x + w / 2} ${y + h * 0.35} ${x + w} ${y} L ${x + w} ${y + h} Q ${x + w / 2} ${y + h * 1.25} ${x} ${y + h} Z`;
  }
  return null;
}

interface Props {
  ancho: number;
  alto: number;
  escenario: Geometria & { nombre: string };
  sectores: SectorDibujo[];
  modo: 'compra' | 'edicion';
  cuadricula?: boolean;
  /** Edición */
  seleccionado?: number | string | 'escenario' | null;
  onPointerDownElemento?: (e: PointerEvent<SVGElement>, id: number | string | 'escenario', accion: 'mover' | 'redimensionar') => void;
  onSeleccionar?: (id: number | string | 'escenario') => void;
  /** Compra */
  seleccionadas?: Set<number>;
  onButaca?: (sector: SectorDibujo, butacaId: number) => void;
  onSector?: (sector: SectorDibujo) => void;
  extra?: ReactNode;
}

const conTeclado = (accion: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    accion();
  }
};

export function MapaSala(p: Props) {
  const edicion = p.modo === 'edicion';
  const e = p.escenario;
  const selEscenario = p.seleccionado === 'escenario';
  const k = escalaPlano(p.ancho, p.alto);
  const pad = { arriba: PAD.arriba * k, lados: PAD.lados * k, abajo: PAD.abajo * k };
  // Cuadrícula: un punto por paso y una línea con referencia en metros cada 5 pasos
  const paso = pasoCuadricula(p.ancho, p.alto) * PX_POR_METRO;
  const guia = 5 * paso;
  const tirador = (x: number, y: number, id: number | string | 'escenario') =>
    edicion && p.seleccionado === id ? (
      <rect
        x={x - 5 * k}
        y={y - 5 * k}
        width={10 * k}
        height={10 * k}
        fill="#fff"
        stroke="#0284c7"
        strokeWidth={1.5 * k}
        className="cursor-nwse-resize"
        onPointerDown={(ev) => p.onPointerDownElemento?.(ev, id, 'redimensionar')}
      />
    ) : null;

  return (
    <svg viewBox={`0 0 ${p.ancho} ${p.alto}`} className="h-full w-full select-none" role="img" aria-label="Mapa de la sala">
      {p.cuadricula && (
        <g className="pointer-events-none">
          <defs>
            <pattern id="grilla" width={paso} height={paso} patternUnits="userSpaceOnUse">
              <circle cx={k} cy={k} r={k} fill="rgba(99,102,241,0.18)" />
            </pattern>
            <pattern id="grilla-guia" width={guia} height={guia} patternUnits="userSpaceOnUse">
              <path d={`M ${guia} 0 H 0 V ${guia}`} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={k} />
            </pattern>
          </defs>
          <rect width={p.ancho} height={p.alto} fill="url(#grilla)" />
          <rect width={p.ancho} height={p.alto} fill="url(#grilla-guia)" />
          {Array.from({ length: Math.ceil(p.ancho / guia) - 1 }, (_, i) => (i + 1) * guia).map((x) => (
            <text key={`x${x}`} x={x + 3 * k} y={10 * k} fill="#64748b" fontSize={9 * k}>
              {x / PX_POR_METRO} m
            </text>
          ))}
          {Array.from({ length: Math.ceil(p.alto / guia) - 1 }, (_, i) => (i + 1) * guia).map((y) => (
            <text key={`y${y}`} x={3 * k} y={y - 3 * k} fill="#64748b" fontSize={9 * k}>
              {y / PX_POR_METRO} m
            </text>
          ))}
        </g>
      )}

      {/* Escenario */}
      <g
        className={edicion ? 'cursor-move' : undefined}
        onPointerDown={edicion ? (ev) => p.onPointerDownElemento?.(ev, 'escenario', 'mover') : undefined}
        onClick={edicion ? () => p.onSeleccionar?.('escenario') : undefined}
      >
        <path
          d={`M ${e.posX} ${e.posY + e.alto} L ${e.posX + e.ancho * 0.15} ${e.posY + e.alto + 18 * k} L ${e.posX + e.ancho * 0.85} ${e.posY + e.alto + 18 * k} L ${e.posX + e.ancho} ${e.posY + e.alto} Z`}
          fill="#1e1b4b"
          stroke="#818cf8"
          strokeWidth={1.5 * k}
        />
        <rect
          x={e.posX}
          y={e.posY}
          width={e.ancho}
          height={e.alto}
          rx={10 * k}
          fill="#312e81"
          stroke={selEscenario ? '#38bdf8' : '#818cf8'}
          strokeWidth={(selEscenario ? 3 : 2) * k}
          style={{ filter: `drop-shadow(0 0 ${14 * k}px rgba(99,102,241,0.35))` }}
        />
        <text x={e.posX + e.ancho / 2} y={e.posY + e.alto / 2 + 5 * k} fill="#fff" fontSize={14 * k} fontWeight={700} letterSpacing={3 * k} textAnchor="middle">
          ESCENARIO
        </text>
        {edicion && (
          <text x={e.posX + e.ancho / 2} y={e.posY + e.alto / 2 + 22 * k} fill="#a5b4fc" fontSize={10 * k} textAnchor="middle" opacity={0.8}>
            {e.nombre}
          </text>
        )}
      </g>
      {tirador(e.posX + e.ancho, e.posY + e.alto, 'escenario')}

      {/* Sectores */}
      {p.sectores.map((s) => {
        const c = paleta(s.color);
        const sel = edicion && p.seleccionado === s.id;
        const forma = contorno(s);
        const butacas = butacasDe(s);
        const anchoInterno = s.ancho - pad.lados * 2;
        const altoInterno = s.alto - pad.arriba - pad.abajo;
        const radio = s.numerado && butacas.length ? Math.max(2.5 * k, Math.min(10 * k, Math.min(anchoInterno / s.butacasPorFila, altoInterno / Math.max(1, s.filas)) * 0.38)) : 0;
        const angosto = s.ancho < 200 * k;
        const agotado = !edicion && s.disponibles === 0;
        const etiqueta = `${s.nombre.toUpperCase()}${!edicion && s.precio ? ` ($${s.precio.toLocaleString('es-AR')})` : ''}`;
        const clickSector = !edicion && !s.numerado && !agotado ? () => p.onSector?.(s) : undefined;
        const props = {
          fill: c.relleno,
          stroke: sel ? '#38bdf8' : c.borde,
          strokeWidth: (sel ? 3 : 1.5) * k,
          strokeDasharray: s.numerado ? undefined : `${6 * k} ${4 * k}`,
          style: sel ? { filter: `drop-shadow(0 0 ${16 * k}px rgba(56,189,248,0.45))` } : undefined,
        };
        return (
          <g key={s.id} opacity={agotado ? 0.5 : 1}>
            <g
              className={edicion ? 'cursor-move' : clickSector ? 'cursor-pointer transition-opacity hover:opacity-90' : undefined}
              onPointerDown={edicion ? (ev) => p.onPointerDownElemento?.(ev, s.id, 'mover') : undefined}
              onClick={edicion ? () => p.onSeleccionar?.(s.id) : clickSector}
              role={clickSector ? 'button' : undefined}
              tabIndex={clickSector ? 0 : undefined}
              aria-label={clickSector ? `Agregar una entrada de ${s.nombre}` : undefined}
              onKeyDown={clickSector ? conTeclado(clickSector) : undefined}
            >
              {forma ? <path d={forma} {...props} /> : <rect x={s.posX} y={s.posY} width={s.ancho} height={s.alto} rx={10 * k} {...props} />}
              <text x={s.posX + s.ancho / 2} y={s.posY + 18 * k} fill={c.texto} fontSize={(angosto ? 9 : 11) * k} fontWeight={700} textAnchor="middle">
                {angosto ? s.nombre.toUpperCase() : etiqueta}
              </text>
              {!s.numerado && (
                <>
                  <text x={s.posX + s.ancho / 2} y={s.posY + s.alto / 2 + 4 * k} fill={c.texto} fontSize={11 * k} textAnchor="middle" opacity={0.85}>
                    {edicion ? `Sector sin numerar · cupo ${s.cupo?.toLocaleString('es-AR') ?? ''}` : agotado ? 'AGOTADO' : 'Tocá para sumar una entrada (sin numerar)'}
                  </text>
                  {!edicion && !agotado && (
                    <>
                      <rect x={s.posX + s.ancho / 2 - 60 * k} y={s.posY + s.alto / 2 + 16 * k} width={120 * k} height={22 * k} rx={4 * k} fill={c.butaca} />
                      <text x={s.posX + s.ancho / 2} y={s.posY + s.alto / 2 + 31 * k} fill="#fff" fontSize={10 * k} fontWeight={700} textAnchor="middle">
                        + Agregar entrada
                      </text>
                    </>
                  )}
                </>
              )}
            </g>

            {/* Butacas */}
            {butacas.map((b) => {
              const cx = s.posX + pad.lados + b.posX * anchoInterno;
              const cy = s.posY + pad.arriba + b.posY * altoInterno;
              const mia = p.seleccionadas?.has(b.id);
              const ocupada = b.ocupada && !mia;
              const elegir = !edicion && !ocupada ? () => p.onButaca?.(s, b.id) : undefined;
              return (
                <g
                  key={b.id}
                  className={elegir ? 'cursor-pointer' : ocupada ? 'cursor-not-allowed' : undefined}
                  onClick={elegir}
                  role={elegir ? 'button' : undefined}
                  tabIndex={elegir ? 0 : undefined}
                  aria-label={!edicion ? `Butaca ${b.fila}${b.numero}${ocupada ? ' ocupada' : mia ? ' seleccionada' : ' libre'}` : undefined}
                  aria-pressed={elegir ? !!mia : undefined}
                  onKeyDown={elegir ? conTeclado(elegir) : undefined}
                >
                  <title>{`${s.nombre} · ${b.fila}${b.numero}${ocupada ? ' (ocupada)' : ''}`}</title>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radio}
                    fill={mia ? COLOR_SELECCION : ocupada ? COLOR_OCUPADA : c.butaca}
                    stroke={mia ? '#99f6e4' : 'none'}
                    strokeWidth={mia ? 2 * k : 0}
                    className={elegir ? 'transition-[r] hover:brightness-125' : undefined}
                  />
                  {radio >= 7 * k && (
                    <text x={cx} y={cy + 3 * k} fill={ocupada ? '#64748b' : '#fff'} fontSize={(radio >= 9 * k ? 8 : 6.5) * k} textAnchor="middle" className="pointer-events-none">
                      {ocupada ? 'X' : `${b.fila}${b.numero}`}
                    </text>
                  )}
                </g>
              );
            })}
            {tirador(s.posX + s.ancho, s.posY + s.alto, s.id)}
          </g>
        );
      })}
      {p.extra}
    </svg>
  );
}
