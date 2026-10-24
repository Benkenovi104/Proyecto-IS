// Seleccionar ubicaciones en el mapa, adicionales y pago (actividad 3.1).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Cabecera } from '../../components/Cabecera';
import { COLOR_SELECCION, MapaSala, PALETA, type SectorDibujo } from '../../components/MapaSala';
import { useToast } from '../../components/Toast';
import { Aviso, Boton, Cargando, Chip, cx, Icono, Modal } from '../../components/ui';
import { api, ErrorApi, mensajeError } from '../../lib/api';
import { cuentaRegresiva, fechaLarga, hora, pesos } from '../../lib/formato';
import type { Compra, DetalleFuncion } from '../../lib/tipos';
import { useAhora, useCarga } from '../../lib/useCarga';
import { PestanasComprador } from './PestanasComprador';

const MAX_ENTRADAS = 6;
const PATENTE_VALIDA = /^([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})$/;
const normalizarPatente = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');

type Simulacion = 'APROBADO' | 'RECHAZADO' | 'SIN_RESPUESTA';

export default function Comprar() {
  const { id } = useParams();
  const funcionId = Number(id);
  const { usuario } = useAuth();
  const navegar = useNavigate();
  const toast = useToast();
  const ahora = useAhora();

  const { datos: funcion, setDatos: setFuncion, error, recargar } = useCarga(() => api.get<DetalleFuncion>(`/funciones/${funcionId}`), [funcionId, usuario?.id]);
  const reserva = funcion?.miReserva ?? null;
  const [ocupado, setOcupado] = useState(false);

  // Adicionales (estado local; se sincronizan con la reserva en el backend)
  const [conEstacionamiento, setConEstacionamiento] = useState(false);
  const [tarifaId, setTarifaId] = useState<number | null>(null);
  const [patente, setPatente] = useState('');
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const inicializado = useRef<number | null>(null);

  // Al cargar una reserva existente, recuperar sus adicionales
  useEffect(() => {
    if (!funcion) return;
    if (!tarifaId && funcion.estacionamiento[0]) setTarifaId(funcion.estacionamiento[0].tarifaId);
    if (reserva && inicializado.current !== reserva.id) {
      inicializado.current = reserva.id;
      const pase = reserva.pases[0];
      setConEstacionamiento(!!pase);
      if (pase) {
        setTarifaId(pase.tarifaId);
        setPatente(pase.patente);
      }
      setCantidades(Object.fromEntries(reserva.voucher?.items.map((i) => [i.productoId, i.cantidad]) ?? []));
    }
  }, [funcion, reserva, tarifaId]);

  const actualizarReserva = (compra: Compra | null) => setFuncion((f) => (f ? { ...f, miReserva: compra } : f));

  const exigirComprador = () => {
    if (!usuario) {
      toast('Ingresá con tu cuenta para reservar ubicaciones', 'info');
      navegar(`/login?volver=/funciones/${funcionId}`);
      return false;
    }
    if (usuario.rol !== 'COMPRADOR') {
      toast('Solo las cuentas de comprador pueden reservar entradas', 'error');
      return false;
    }
    return true;
  };

  /** `bloquear`: deshabilita el mapa y los botones mientras dura la operación (no se usa al sincronizar adicionales). */
  const ejecutar = async (accion: () => Promise<unknown>, bloquear = true) => {
    if (bloquear) setOcupado(true);
    try {
      await accion();
    } catch (e) {
      toast(mensajeError(e), 'error');
      if (e instanceof ErrorApi && e.status === 410) actualizarReserva(null);
    } finally {
      if (bloquear) setOcupado(false);
      recargar();
    }
  };

  const agregar = (sectorId: number, butacaId?: number) => {
    if (!exigirComprador()) return;
    if ((reserva?.entradas.length ?? 0) >= MAX_ENTRADAS) {
      toast(`Límite alcanzado: máximo ${MAX_ENTRADAS} entradas por persona para esta función`, 'error');
      return;
    }
    ejecutar(async () => actualizarReserva(await api.post<Compra>('/compras/reserva/entradas', { funcionId, sectorId, butacaId })));
  };

  const quitar = (entradaId: number) =>
    reserva && ejecutar(async () => actualizarReserva((await api.delete<{ compra: Compra | null }>(`/compras/${reserva.id}/entradas/${entradaId}`)).compra));

  const alTocarButaca = (sector: SectorDibujo, butacaId: number) => {
    const mia = reserva?.entradas.find((e) => e.butaca?.id === butacaId);
    if (mia) quitar(mia.id);
    else agregar(Number(sector.id), butacaId);
  };

  const patenteNormalizada = normalizarPatente(patente);
  const patenteOk = PATENTE_VALIDA.test(patenteNormalizada);

  const cuerpoAdicionales = (cant = cantidades, estac = conEstacionamiento) => ({
    estacionamiento: estac && tarifaId && patenteOk ? [{ tarifaId, patente: patenteNormalizada }] : [],
    consumiciones: Object.entries(cant).map(([productoId, cantidad]) => ({ productoId: Number(productoId), cantidad })),
  });

  const sincronizar = async (cuerpo = cuerpoAdicionales()) => {
    if (!reserva) return null;
    const compra = await api.put<Compra>(`/compras/${reserva.id}/adicionales`, cuerpo);
    actualizarReserva(compra);
    return compra;
  };

  const cambiarCantidad = (productoId: number, delta: number) => {
    const actual = cantidades[productoId] ?? 0;
    const nuevo = Math.max(0, Math.min(20, actual + delta));
    const proximas = { ...cantidades, [productoId]: nuevo };
    setCantidades(proximas);
    if (reserva) ejecutar(() => sincronizar(cuerpoAdicionales(proximas)), false);
  };

  // Pago
  const [pasarela, setPasarela] = useState(false);
  const [simulacion, setSimulacion] = useState<Simulacion>('APROBADO');
  const [pagando, setPagando] = useState(false);
  const [pendiente, setPendiente] = useState<Compra | null>(null);

  const abrirPago = async () => {
    if (!reserva) return;
    if (conEstacionamiento && !patenteOk) {
      toast('Ingresá una patente válida (AB 123 CD o ABC 123) para el pase de estacionamiento', 'error');
      return;
    }
    setOcupado(true);
    try {
      await sincronizar();
      setPasarela(true);
    } catch (e) {
      toast(mensajeError(e), 'error');
    } finally {
      setOcupado(false);
    }
  };

  const pagar = async () => {
    if (!reserva) return;
    setPagando(true);
    try {
      const compra = await api.post<Compra>(`/compras/${reserva.id}/pagar`, { simular: simulacion });
      setPasarela(false);
      if (compra.estado === 'PAGADA') {
        toast('¡Compra exitosa! Tus códigos QR ya están en Mis Compras');
        navegar(`/mis-compras#compra-${compra.id}`);
      } else {
        setPendiente(compra);
        toast('La pasarela no respondió: el pago quedó pendiente de confirmación', 'info');
      }
    } catch (e) {
      toast(mensajeError(e), 'error');
      if (e instanceof ErrorApi && e.status === 410) {
        setPasarela(false);
        recargar();
      }
    } finally {
      setPagando(false);
    }
  };

  // Esperar la confirmación tardía de la pasarela (webhook)
  useEffect(() => {
    if (!pendiente) return;
    const t = setInterval(async () => {
      try {
        const compra = await api.get<Compra>(`/compras/${pendiente.id}`);
        if (compra.estado === 'PAGADA') {
          clearInterval(t);
          toast('La pasarela confirmó tu pago. ¡Compra exitosa!');
          navegar(`/mis-compras#compra-${compra.id}`);
        } else if (compra.estado === 'VENCIDA') {
          clearInterval(t);
          setPendiente(null);
          toast('La pasarela no confirmó el pago a tiempo; la reserva se liberó', 'error');
          recargar();
        }
      } catch {
        // reintenta en el próximo ciclo
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pendiente, navegar, recargar, toast]);

  // Vencimiento de la reserva en pantalla
  const restante = reserva?.estado === 'RESERVADA' ? cuentaRegresiva(reserva.fechaExpiracionReserva, ahora) : null;
  const avisado = useRef<number | null>(null);
  useEffect(() => {
    if (reserva?.estado === 'RESERVADA' && restante === null && avisado.current !== reserva.id) {
      avisado.current = reserva.id;
      toast('El tiempo de reserva de 10:00 min expiró. Las butacas se liberaron.', 'error');
      setPasarela(false);
      setTimeout(recargar, 1500);
    }
  }, [restante, reserva, recargar, toast]);

  const seleccionadas = useMemo(() => new Set(reserva?.entradas.flatMap((e) => (e.butaca ? [e.butaca.id] : [])) ?? []), [reserva]);

  if (error) {
    return (
      <>
        <Cabecera />
        <main className="mx-auto max-w-3xl p-8">
          <Aviso tono="peligro">{error}</Aviso>
        </main>
      </>
    );
  }
  if (!funcion) {
    return (
      <>
        <Cabecera />
        <Cargando texto="Cargando mapa de la sala…" />
      </>
    );
  }

  const tarifa = funcion.estacionamiento.find((t) => t.tarifaId === tarifaId);
  const totalEntradas = reserva?.totales.entradas ?? 0;
  const totalEstacionamiento = conEstacionamiento && tarifa ? tarifa.precio : 0;
  const totalConsumiciones = funcion.consumiciones.reduce((a, p) => a + (cantidades[p.id] ?? 0) * p.precio, 0);
  const total = totalEntradas + totalEstacionamiento + totalConsumiciones;
  const precios = funcion.sectores.flatMap((s) => (s.precio ? [s.precio] : []));
  const cantidadEntradas = reserva?.entradas.length ?? 0;
  const numeradosGrandes = funcion.sectores.filter((s) => s.numerado && s.precio && s.cupo > 40);

  return (
    <>
      <Cabecera />
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <PestanasComprador
          activa="cartelera"
          derecha={
            restante ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-label-md text-amber-300">
                <Icono nombre="timer" className="text-[18px]" />
                Reserva Activa: <strong className="font-mono text-body-lg text-white">{restante}</strong> min
              </div>
            ) : reserva?.estado === 'PENDIENTE_PAGO' || pendiente ? (
              <Chip tono="alerta" punto pulso>
                Pago pendiente de confirmación
              </Chip>
            ) : null
          }
        />

        {/* Cabecera del evento */}
        <section className="relative overflow-hidden rounded-xl border border-primary-container/30 bg-gradient-to-r from-surface-container via-indigo-950/60 to-surface-container p-6 shadow-xl">
          <div className="relative flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {funcion.estado !== 'PUBLICADA' ? (
                  <Chip tono="alerta">Vista previa · {funcion.estado}</Chip>
                ) : (
                  <Chip tono="exito">{funcion.sectores.some((s) => s.descuento) ? 'Preventa con descuento' : 'Venta online'}</Chip>
                )}
                <span className="text-body-sm text-on-surface-variant">{funcion.sala.nombre}</span>
              </div>
              <h1 className="text-headline-xl-mobile font-black tracking-tight text-white md:text-headline-xl">{funcion.evento.nombre}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-4 text-body-md text-on-surface-variant">
                <span className="flex items-center gap-1.5">
                  <Icono nombre="calendar_today" className="text-[18px] text-primary" /> {fechaLarga(funcion.fechaHora)} - {hora(funcion.fechaHora)} hs
                </span>
                <span className="flex items-center gap-1.5">
                  <Icono nombre="location_on" className="text-[18px] text-rose-400" /> {funcion.sala.direccion}
                </span>
              </p>
            </div>
            <div className="md:text-right">
              <span className="block text-body-sm text-on-surface-variant">Entradas desde</span>
              <span className="font-mono text-headline-xl font-black text-emerald-400">{pesos(precios.length ? Math.min(...precios) : null)}</span>
              <span className="block text-[11px] text-on-surface-variant">Máximo {MAX_ENTRADAS} entradas por persona</span>
            </div>
          </div>
        </section>

        {pendiente && (
          <Aviso tono="alerta" icono="hourglass_top" titulo="Esperando la confirmación de la pasarela de pagos">
            Tus ubicaciones siguen retenidas mientras la pasarela responde (se extienden 5 minutos una única vez). Te llevamos a Mis Compras apenas se confirme.
          </Aviso>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Mapa */}
          <section className="flex flex-col rounded-xl bg-surface-container p-5 shadow-xl lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-nv-line pb-3">
              <div>
                <h2 className="flex items-center gap-2 text-title-sm text-white">
                  <Icono nombre="touch_app" className="text-[20px] text-primary" /> Seleccioná tus ubicaciones en el mapa
                </h2>
                <p className="text-body-sm text-on-surface-variant">Hacé clic en las butacas o sectores para agregarlos a tu reserva (máx. {MAX_ENTRADAS} entradas).</p>
              </div>
              <div className="flex items-center gap-3 text-body-sm text-on-surface-variant">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-slate-700" /> Ocupado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-indigo-500" /> Libre
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full shadow-sm" style={{ background: COLOR_SELECCION }} /> Tu selección
                </span>
              </div>
            </div>
            <div className={cx('relative mt-4 overflow-hidden rounded-lg border border-nv-line bg-surface-container-lowest p-3', ocupado && 'opacity-80')}>
              <MapaSala
                modo="compra"
                ancho={funcion.sala.ancho}
                alto={funcion.sala.alto}
                escenario={funcion.escenario}
                sectores={funcion.sectores.filter((s) => s.precio !== null)}
                seleccionadas={seleccionadas}
                onButaca={alTocarButaca}
                onSector={(s) => agregar(Number(s.id))}
              />
              {ocupado && <Icono nombre="progress_activity" className="absolute right-4 top-4 animate-spin text-secondary" />}
            </div>
            {/* Selección asistida: alternativa accesible y liviana al mapa (riesgos R-08 y R-12) */}
            {numeradosGrandes.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
                <span className="text-label-xs uppercase text-outline">Mejor ubicación disponible:</span>
                {numeradosGrandes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={ocupado || s.disponibles === 0}
                    onClick={() => agregar(s.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-nv-line bg-surface-container-low px-2.5 py-1 text-label-md text-on-surface hover:border-primary-container disabled:opacity-40"
                  >
                    <span className={cx('h-2 w-2 rounded-full', PALETA[s.color]?.clase)} />
                    {s.nombre} · {pesos(s.precio)}
                    <Icono nombre="add" className="text-[16px] text-secondary" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Checkout */}
          <div className="space-y-4 lg:col-span-4">
            <section className="space-y-4 rounded-xl bg-surface-container p-5 shadow-xl">
              <div className="flex items-center justify-between border-b border-nv-line pb-2">
                <h3 className="flex items-center gap-2 text-title-sm text-white">
                  <Icono nombre="shopping_cart" className="text-[20px] text-primary" /> Tu Selección
                </h3>
                <Chip tono="info">
                  {cantidadEntradas} / {MAX_ENTRADAS} Entradas
                </Chip>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {!reserva?.entradas.length ? (
                  <p className="py-4 text-center text-body-sm italic text-on-surface-variant">
                    Todavía no seleccionaste entradas.
                    <br />
                    Hacé clic en las butacas o sectores.
                  </p>
                ) : (
                  reserva.entradas.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border border-nv-line bg-surface-container-lowest p-2 text-body-sm">
                      <div>
                        <div className="font-semibold text-on-surface">{e.sector.nombre}</div>
                        <div className="text-[11px] text-on-surface-variant">{e.butaca ? `Fila ${e.butaca.fila} • Butaca ${e.butaca.fila}${e.butaca.numero}` : 'Cupo general (sin numerar)'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-tertiary">{pesos(e.precio)}</span>
                        {reserva.estado === 'RESERVADA' && (
                          <button type="button" onClick={() => quitar(e.id)} disabled={ocupado} className="text-outline transition hover:text-red-400" aria-label={`Quitar ${e.sector.nombre}`}>
                            <Icono nombre="delete" className="text-[18px]" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between border-t border-nv-line pt-2 text-body-sm">
                <span className="text-on-surface-variant">Subtotal Entradas:</span>
                <span className="font-mono text-title-sm text-white">{pesos(totalEntradas)}</span>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-primary-container/30 bg-surface-container p-5 shadow-xl">
              <div className="flex items-center gap-2 border-b border-nv-line pb-2">
                <span className="rounded bg-amber-500/20 p-1 text-amber-400">
                  <Icono nombre="add_circle" className="text-[18px]" />
                </span>
                <div>
                  <h3 className="text-label-md text-white">Adicionales Anticipados</h3>
                  <p className="text-[11px] text-on-surface-variant">Ahorrá tiempo y asegurá tu lugar antes del evento</p>
                </div>
              </div>

              {funcion.estacionamiento.length > 0 && (
                <div className="space-y-2.5 rounded-lg border border-nv-line bg-surface-container-lowest p-3">
                  <div className="flex items-center justify-between">
                    <label className="flex cursor-pointer items-center gap-2 text-label-md text-on-surface">
                      <input
                        type="checkbox"
                        className="form-checkbox rounded border-nv-line-strong bg-nv-page text-primary-container focus:ring-0"
                        checked={conEstacionamiento}
                        disabled={!reserva}
                        onChange={(e) => {
                          setConEstacionamiento(e.target.checked);
                          if (!e.target.checked && reserva?.pases.length) ejecutar(() => sincronizar(cuerpoAdicionales(cantidades, false)), false);
                        }}
                      />
                      <Icono nombre="directions_car" className="text-[18px] text-secondary" /> Pase Estacionamiento
                    </label>
                    <span className="font-mono text-label-md text-secondary">+{pesos(tarifa?.precio ?? funcion.estacionamiento[0].precio)}</span>
                  </div>
                  {conEstacionamiento && (
                    <div className="space-y-2 border-t border-nv-line pt-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-on-surface-variant">Playa asignada:</span>
                        <select className="campo py-1.5 text-body-sm" value={tarifaId ?? ''} onChange={(e) => setTarifaId(Number(e.target.value))}>
                          {funcion.estacionamiento.map((t) => (
                            <option key={t.tarifaId} value={t.tarifaId} disabled={t.disponibles === 0}>
                              {t.playa} — {pesos(t.precio)} · {t.disponibles} cupos disp.
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-on-surface-variant">Patente del vehículo (obligatoria):</span>
                        <input
                          className={cx('campo-mono py-1.5 uppercase text-secondary', patente && !patenteOk && 'border-red-500/60')}
                          placeholder="Ej: AB 123 CD"
                          value={patente}
                          maxLength={10}
                          onChange={(e) => setPatente(e.target.value.toUpperCase())}
                          onBlur={() => patenteOk && reserva && ejecutar(() => sincronizar(), false)}
                        />
                        {patente && !patenteOk && <span className="mt-1 block text-[11px] text-red-400">Formato Mercosur (AB 123 CD) o anterior (ABC 123)</span>}
                      </label>
                    </div>
                  )}
                </div>
              )}

              {funcion.consumiciones.length > 0 && (
                <div className="space-y-2.5 rounded-lg border border-nv-line bg-surface-container-lowest p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-label-md text-on-surface">
                      <Icono nombre="restaurant" className="text-[18px] text-amber-400" /> Consumiciones en Preventa
                    </span>
                    <Chip tono="exito">Precio preventa</Chip>
                  </div>
                  {funcion.consumiciones.map((p) => {
                    const cantidad = cantidades[p.id] ?? 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-container p-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-medium text-white">{p.nombre}</div>
                          <div className="text-[11px] text-on-surface-variant">
                            <span className="font-mono">{pesos(p.precio)}</span>
                            {p.precioLista && <span className="ml-1.5 font-mono text-outline line-through">{pesos(p.precioLista)}</span>}
                            {p.stock < 50 && <span className="ml-1.5 text-amber-400">¡Quedan {p.stock}!</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" aria-label={`Quitar ${p.nombre}`} disabled={!reserva || ocupado || cantidad === 0} onClick={() => cambiarCantidad(p.id, -1)} className="h-7 w-7 rounded bg-surface-container-high font-bold text-on-surface hover:bg-surface-bright disabled:opacity-40">
                            -
                          </button>
                          <span className="w-4 text-center font-mono font-bold text-white">{cantidad}</span>
                          <button type="button" aria-label={`Agregar ${p.nombre}`} disabled={!reserva || ocupado || p.stock === 0} onClick={() => cambiarCantidad(p.id, 1)} className="h-7 w-7 rounded bg-surface-container-high font-bold text-on-surface hover:bg-surface-bright disabled:opacity-40">
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!reserva && <p className="text-[11px] text-outline">Elegí al menos una ubicación para sumar adicionales.</p>}

              <div className="space-y-3 border-t border-nv-line pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-label-md text-on-surface-variant">TOTAL A PAGAR:</span>
                  <span className="font-mono text-headline-lg font-black text-emerald-400">{pesos(total)}</span>
                </div>
                <Boton
                  variante={reserva?.estado === 'RESERVADA' ? 'exito' : 'secundario'}
                  icono="credit_card"
                  className="w-full py-3 text-body-md"
                  disabled={!reserva || reserva.estado !== 'RESERVADA' || !restante}
                  cargando={ocupado && !!reserva}
                  onClick={abrirPago}
                >
                  Pagar con Pasarela Externa
                </Boton>
                <p className="text-center text-[10px] text-outline">Transacción segura procesada por la pasarela de pagos externa.</p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Modal abierto={pasarela} onCerrar={() => !pagando && setPasarela(false)} titulo="Pasarela de pagos" icono="account_balance">
        <div className="space-y-4">
          <div className="rounded-lg border border-nv-line bg-nv-page p-3 text-body-sm">
            <div className="flex justify-between text-on-surface-variant">
              <span>Orden {reserva?.codigo}</span>
              <span>{reserva?.entradas.length} entrada(s)</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-on-surface">Total a cobrar</span>
              <span className="font-mono text-headline-md text-emerald-400">{pesos(reserva?.totales.total ?? total)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block">
              <span className="etiqueta">Titular de la tarjeta</span>
              <input className="campo" defaultValue={usuario?.nombre} />
            </label>
            <label className="col-span-2 block">
              <span className="etiqueta">Número de tarjeta</span>
              <input className="campo-mono" defaultValue="4509 9535 6623 3704" inputMode="numeric" />
            </label>
            <label className="block">
              <span className="etiqueta">Vencimiento</span>
              <input className="campo-mono" defaultValue="11/30" />
            </label>
            <label className="block">
              <span className="etiqueta">CVV</span>
              <input className="campo-mono" defaultValue="123" type="password" />
            </label>
          </div>
          <fieldset className="rounded-lg border border-dashed border-amber-500/40 p-3">
            <legend className="px-1 text-label-xs uppercase text-amber-400">Simulación de la pasarela</legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['APROBADO', 'Aprobado', 'check_circle'],
                  ['RECHAZADO', 'Rechazado', 'cancel'],
                  ['SIN_RESPUESTA', 'Sin respuesta', 'hourglass_top'],
                ] as const
              ).map(([valor, texto, icono]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setSimulacion(valor)}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-label-md transition',
                    simulacion === valor ? 'border-primary-container bg-primary-container/20 text-white shadow-glow' : 'border-nv-line text-on-surface-variant hover:border-nv-line-strong',
                  )}
                >
                  <Icono nombre={icono} className="text-[20px]" />
                  {texto}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-outline">Los datos de la tarjeta no se envían: la pasarela es un servicio externo simulado para la demo.</p>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" onClick={() => setPasarela(false)} disabled={pagando}>
              Cancelar
            </Boton>
            <Boton variante="exito" icono="lock" cargando={pagando} onClick={pagar}>
              Confirmar pago {pesos(reserva?.totales.total ?? total)}
            </Boton>
          </div>
        </div>
      </Modal>
    </>
  );
}
