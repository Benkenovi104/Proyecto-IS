// Consultar historial de compras, descargar QRs, transferir y solicitar reembolso (pantalla 4 de Stitch).
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Cabecera } from '../../components/Cabecera';
import { CodigoQR, PatenteMercosur } from '../../components/Pases';
import { useToast } from '../../components/Toast';
import { Aviso, Boton, Cargando, Chip, cx, Icono, Vacio } from '../../components/ui';
import { api, mensajeError } from '../../lib/api';
import { dni, fechaCorta, fechaHoraCorta, fechaLarga, hora, pesos } from '../../lib/formato';
import type { Compra, Entrada, MisCompras as DatosMisCompras, Notificacion, Pase, PreviewReembolso, Voucher } from '../../lib/tipos';
import { useCarga } from '../../lib/useCarga';
import { PestanasComprador } from './PestanasComprador';

const MOTIVOS = [
  'Imposibilidad de asistencia por fuerza mayor o viaje',
  'Error involuntario en la selección de fecha',
  'Cambio de planes / Otro motivo personal',
];

export default function MisCompras() {
  const { usuario } = useAuth();
  const toast = useToast();
  const { hash } = useLocation();
  const { datos, setDatos, error, cargando, recargar } = useCarga(() => api.get<DatosMisCompras>('/compras/mias'), [usuario?.id]);
  const [accion, setAccion] = useState<{ tipo: 'transferir' | 'reembolso'; compraId: number; entradaId?: number } | null>(null);

  useEffect(() => {
    if (datos && hash) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [datos, hash]);

  const responder = async (transferenciaId: number, respuesta: 'aceptar' | 'rechazar' | 'cancelar') => {
    try {
      setDatos(await api.post<DatosMisCompras>(`/transferencias/${transferenciaId}/${respuesta}`));
      toast(
        respuesta === 'aceptar'
          ? 'Aceptaste la entrada: ya tenés tu nuevo código QR'
          : respuesta === 'rechazar'
            ? 'Rechazaste la transferencia'
            : 'Cancelaste la transferencia: seguís siendo el titular',
      );
    } catch (e) {
      toast(mensajeError(e), 'error');
      recargar();
    }
  };

  return (
    <>
      <Cabecera />
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <PestanasComprador activa="mis-compras" />
        {error && <Aviso tono="peligro">{error}</Aviso>}
        {cargando && !datos && <Cargando texto="Cargando tus compras…" />}

        {datos && datos.transferenciasPendientes.length > 0 && (
          <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
            <h2 className="flex items-center gap-2 text-title-sm text-amber-200">
              <Icono nombre="move_to_inbox" className="text-[22px] text-amber-400" /> Te transfirieron entradas
            </h2>
            {datos.transferenciasPendientes.map((t) => (
              <div key={t.id} className="flex flex-col justify-between gap-3 rounded-lg border border-nv-line bg-surface-container p-4 md:flex-row md:items-center">
                <div className="text-body-md">
                  <p className="text-on-surface">
                    <strong>{t.cedente.nombre}</strong> te quiere transferir una entrada para <strong>{t.entrada.funcion.evento.nombre}</strong>
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    {t.entrada.sector} · {t.entrada.ubicacion} · {fechaLarga(t.entrada.funcion.fechaHora)} {hora(t.entrada.funcion.fechaHora)} hs
                  </p>
                  <p className="mt-1 text-[11px] text-outline">Al aceptar se anula el QR de quien te la envía y se emite uno nuevo a tu nombre.</p>
                </div>
                <div className="flex gap-2">
                  <Boton variante="fantasma" icono="close" onClick={() => responder(t.id, 'rechazar')}>
                    Rechazar
                  </Boton>
                  <Boton variante="primario" icono="check" onClick={() => responder(t.id, 'aceptar')}>
                    Aceptar entrada
                  </Boton>
                </div>
              </div>
            ))}
          </section>
        )}

        {datos && !datos.compras.length && !datos.entradasRecibidas.length && (
          <Vacio icono="confirmation_number" titulo="Todavía no tenés compras">
            Elegí una función en la cartelera y reservá tus ubicaciones.
          </Vacio>
        )}

        {datos?.compras.map((compra, i) => (
          <CompraDetallada
            key={compra.id}
            compra={compra}
            abierta={compra.estado === 'PAGADA' || i === 0 || hash === `#compra-${compra.id}`}
            accion={accion?.compraId === compra.id ? accion : null}
            onAccion={setAccion}
            onActualizar={(c) => setDatos((d) => (d ? { ...d, compras: d.compras.map((x) => (x.id === c.id ? c : x)) } : d))}
            onCancelarTransferencia={(id) => responder(id, 'cancelar')}
            onRecargar={recargar}
          />
        ))}

        {datos && datos.entradasRecibidas.length > 0 && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-headline-md text-white">
              <Icono nombre="redeem" className="text-secondary" /> Entradas recibidas por transferencia
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {datos.entradasRecibidas.map((e) => (
                <TarjetaEntrada
                  key={e.id}
                  entrada={e}
                  subtitulo={`${e.funcion.evento.nombre} · ${fechaCorta(e.funcion.fechaHora)} ${hora(e.funcion.fechaHora)} hs · cedida por ${e.cedidaPor.nombre}`}
                />
              ))}
            </div>
          </section>
        )}

        <BandejaCorreo />
      </main>
    </>
  );
}

function CompraDetallada({
  compra,
  abierta: abiertaInicial,
  accion,
  onAccion,
  onActualizar,
  onCancelarTransferencia,
  onRecargar,
}: {
  compra: Compra;
  abierta: boolean;
  accion: { tipo: 'transferir' | 'reembolso'; entradaId?: number } | null;
  onAccion: (a: { tipo: 'transferir' | 'reembolso'; compraId: number; entradaId?: number } | null) => void;
  onActualizar: (c: Compra) => void;
  onCancelarTransferencia: (id: number) => void;
  onRecargar: () => void;
}) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  const articulo = useRef<HTMLElement>(null);

  /** Descargar QRs de la compra: imprime solo esta orden (el navegador permite guardarla como PDF). */
  const descargarQR = () => {
    setAbierta(true);
    requestAnimationFrame(() => {
      articulo.current?.setAttribute('data-imprimir', '');
      document.body.classList.add('imprimiendo');
      window.print();
      document.body.classList.remove('imprimiendo');
      articulo.current?.removeAttribute('data-imprimir');
    });
  };
  const limite =new Date(new Date(compra.funcion.fechaHora).getTime() - 48 * 3600_000);
  const enPlazo = Date.now() < limite.getTime();
  // La transferencia no tiene la ventana de 48 h: vale hasta que empieza la función
  const transferible = compra.estado === 'PAGADA' && Date.now() < new Date(compra.funcion.fechaHora).getTime();
  const estado =
    compra.estado === 'PAGADA'
      ? { tono: 'exito' as const, texto: 'Compra confirmada', icono: 'check_circle' }
      : compra.estado === 'REEMBOLSADA'
        ? { tono: 'alerta' as const, texto: 'Reembolsada', icono: 'undo' }
        : { tono: 'alerta' as const, texto: 'Pago pendiente', icono: 'hourglass_top' };
  const entradaTransferir = accion?.tipo === 'transferir' ? compra.entradas.find((e) => e.id === accion.entradaId) : undefined;

  return (
    <article ref={articulo} id={`compra-${compra.id}`} className="scroll-mt-24 space-y-6">
      <header className="relative overflow-hidden rounded-xl border border-primary-container/30 bg-gradient-to-r from-surface-container via-indigo-950/50 to-surface-container p-6 shadow-xl">
        <div className="relative flex flex-col justify-between gap-4 border-b border-nv-line pb-4 md:flex-row md:items-center">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Chip tono={estado.tono} icono={estado.icono}>
                {estado.texto}
              </Chip>
              <span className="rounded border border-primary-container/30 bg-primary-container/10 px-2 py-0.5 font-mono text-label-md text-primary">ORDEN #{compra.codigo}</span>
              <span className="text-body-sm text-on-surface-variant">
                Realizada el {fechaLarga(compra.fecha).replace(/^\S+ /, '')} • {hora(compra.fecha)} hs
              </span>
            </div>
            <h2 className="text-headline-xl-mobile font-black tracking-tight text-white md:text-headline-xl">{compra.funcion.evento.nombre}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-4 text-body-md text-on-surface-variant">
              <span className="flex items-center gap-1.5">
                <Icono nombre="calendar_today" className="text-[18px] text-primary" /> {fechaLarga(compra.funcion.fechaHora)} - {hora(compra.funcion.fechaHora)} hs
              </span>
              <span className="flex items-center gap-1.5">
                <Icono nombre="location_on" className="text-[18px] text-rose-400" /> {compra.funcion.sala.nombre} ({compra.funcion.sala.direccion})
              </span>
            </p>
          </div>
          <div className="flex items-end justify-between gap-1 text-right md:flex-col md:justify-center">
            <span className="text-body-sm text-on-surface-variant">Titular de Cuenta</span>
            <span className="text-title-sm text-white">{compra.comprador.nombre}</span>
            <span className="rounded border border-secondary/20 bg-secondary/10 px-2 py-0.5 font-mono text-label-md text-secondary">DNI {dni(compra.comprador.dni)}</span>
          </div>
        </div>
        <div className="relative mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Aviso tono="info" className="flex-1">
            <strong>Instrucciones de acceso:</strong> presentá cada código QR en su punto de acceso (molinete de entrada, barrera del estacionamiento o barra de comidas). Podés transferir tu entrada o pedir la
            devolución hasta 48 h antes del show.
          </Aviso>
          <div className="flex items-center gap-1 self-end md:self-auto">
            {compra.estado === 'PAGADA' && (
              <button type="button" onClick={descargarQR} className="flex items-center gap-1 rounded-lg px-3 py-2 text-label-md text-secondary hover:bg-surface-container-high">
                <Icono nombre="download" className="text-[18px]" /> Descargar QR (PDF)
              </button>
            )}
            <button type="button" onClick={() => setAbierta((a) => !a)} className="flex items-center gap-1 rounded-lg px-3 py-2 text-label-md text-on-surface-variant hover:bg-surface-container-high">
              {abierta ? 'Ocultar códigos' : 'Ver códigos QR'}
              <Icono nombre={abierta ? 'expand_less' : 'expand_more'} className="text-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {abierta && (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {compra.entradas
              .filter((e) => e.estado !== 'ANULADA' || e.reembolsada)
              .map((e) => (
                <TarjetaEntrada
                  key={e.id}
                  entrada={e}
                  enPlazo={enPlazo && compra.estado === 'PAGADA'}
                  transferible={transferible}
                  onTransferir={() => onAccion({ tipo: 'transferir', compraId: compra.id, entradaId: e.id })}
                  onReembolso={() => onAccion({ tipo: 'reembolso', compraId: compra.id, entradaId: e.id })}
                  onCancelarTransferencia={onCancelarTransferencia}
                />
              ))}
            {compra.pases.filter((p) => p.estado !== 'ANULADA' || compra.estado === 'REEMBOLSADA').map((p) => (
              <TarjetaPase key={p.id} pase={p} apertura={compra.funcion.aperturaPlaya} />
            ))}
            {compra.voucher && <TarjetaVoucher voucher={compra.voucher} />}
          </div>

          {entradaTransferir && (
            <PanelTransferencia entrada={entradaTransferir} onCerrar={() => onAccion(null)} onListo={() => { onAccion(null); onRecargar(); }} />
          )}
          {compra.estado === 'PAGADA' && (accion?.tipo === 'reembolso' || compra.entradas.some((e) => e.estado === 'VIGENTE' && e.esTitular)) && (
            <PanelReembolso compra={compra} entradaId={accion?.tipo === 'reembolso' ? accion.entradaId : undefined} limite={limite} onListo={(c) => { onAccion(null); onActualizar(c); }} />
          )}
          {compra.reembolsos.length > 0 && (
            <div className="rounded-xl border border-nv-line bg-surface-container p-4 text-body-sm">
              <h3 className="mb-2 flex items-center gap-2 text-label-md text-on-surface">
                <Icono nombre="receipt_long" className="text-[18px] text-secondary" /> Reembolsos de esta orden
              </h3>
              {compra.reembolsos.map((r) => (
                <p key={r.id} className="flex flex-wrap justify-between gap-2 border-t border-nv-line py-2 text-on-surface-variant first:border-0">
                  <span>
                    {fechaHoraCorta(r.fechaSolicitud)} · {r.motivo}
                  </span>
                  <span className="font-mono text-emerald-400">
                    {pesos(r.montoReintegrado)} · {r.estado} {r.idTransaccionReintegro && `(${r.idTransaccionReintegro})`}
                  </span>
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function FilaDato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-nv-line bg-surface-container-lowest/70 p-2 text-body-sm">
      <span className="text-on-surface-variant">{etiqueta}</span>
      {children}
    </div>
  );
}

function CabeceraTarjeta({ icono, color, etiqueta, titulo, estado }: { icono: string; color: string; etiqueta: string; titulo: string; estado: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-nv-line pb-3">
      <div className="flex items-center gap-2">
        <span className={cx('rounded-lg p-1.5', color)}>
          <Icono nombre={icono} className="text-[20px]" />
        </span>
        <div>
          <span className={cx('text-label-xs uppercase', color.split(' ').find((c) => c.startsWith('text-')))}>{etiqueta}</span>
          <h3 className="text-label-md text-white">{titulo}</h3>
        </div>
      </div>
      {estado}
    </div>
  );
}

function TarjetaEntrada({
  entrada: e,
  subtitulo,
  enPlazo,
  transferible,
  onTransferir,
  onReembolso,
  onCancelarTransferencia,
}: {
  entrada: Entrada;
  subtitulo?: string;
  enPlazo?: boolean;
  transferible?: boolean;
  onTransferir?: () => void;
  onReembolso?: () => void;
  onCancelarTransferencia?: (id: number) => void;
}) {
  const cedida = !e.esTitular && e.estado !== 'ANULADA';
  const estado =
    e.estado === 'USADA' ? (
      <Chip tono="neutro" icono="done_all">Utilizada</Chip>
    ) : e.reembolsada ? (
      <Chip tono="alerta" icono="undo">Reembolsada</Chip>
    ) : cedida ? (
      <Chip tono="neutro" icono="send">Transferida</Chip>
    ) : e.transferenciaPendiente ? (
      <Chip tono="alerta" punto pulso>Transferencia pendiente</Chip>
    ) : (
      <Chip tono="exito" punto pulso>Entrada activa</Chip>
    );

  return (
    <div className="flex flex-col justify-between space-y-4 rounded-xl border border-nv-line bg-surface-container p-5 shadow-xl transition hover:border-primary-container/40">
      <div>
        <CabeceraTarjeta icono="confirmation_number" color="bg-primary-container/20 text-primary" etiqueta={e.sector.numerado ? 'Entrada / Butaca' : 'Entrada general'} titulo={e.sector.nombre} estado={estado} />
        {subtitulo && <p className="mt-2 text-[11px] text-on-surface-variant">{subtitulo}</p>}
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-nv-line bg-surface-container-lowest p-4">
          <CodigoQR
            valor={e.qr}
            tipo="ENTRADA"
            anulado={e.estado === 'USADA' ? 'Usada' : e.reembolsada ? 'Reembolsada' : cedida ? 'Transferida' : undefined}
          />
          {e.codigo && (
            <div className="mt-3 w-full space-y-1 text-center">
              <div className="flex items-center justify-center gap-1.5 rounded border border-primary-container/30 bg-indigo-950/60 px-2 py-1 font-mono text-label-md text-primary">
                <Icono nombre="qr_code" className="text-[16px]" /> ID: #{e.codigo}
              </div>
              {e.hash && <div className="font-mono text-[10px] tracking-tight text-outline">HASH: {e.hash}</div>}
            </div>
          )}
        </div>
        <div className="mt-4 space-y-2">
          <FilaDato etiqueta="Ubicación:">
            <span className="rounded border border-primary-container/30 bg-primary-container/20 px-2 py-0.5 font-bold text-primary">{e.butaca ? `Fila ${e.butaca.fila}, Butaca ${e.butaca.fila}${e.butaca.numero}` : 'Sin numerar'}</span>
          </FilaDato>
          <FilaDato etiqueta="Titular actual:">
            <span className="text-right font-medium text-on-surface">
              {e.titular.nombre} (DNI {dni(e.titular.dni)})
            </span>
          </FilaDato>
          {e.sector.puertaAcceso && (
            <FilaDato etiqueta="Puerta de acceso:">
              <span className="text-right font-semibold text-emerald-400">{e.sector.puertaAcceso}</span>
            </FilaDato>
          )}
          {e.usadaEn && (
            <FilaDato etiqueta="Ingreso registrado:">
              <span className="font-mono text-on-surface">{fechaHoraCorta(e.usadaEn)}</span>
            </FilaDato>
          )}
        </div>
      </div>
      {e.esTitular && e.estado === 'VIGENTE' && onTransferir && (
        <div className="space-y-2 border-t border-nv-line pt-3">
          {e.transferenciaPendiente ? (
            <>
              <Aviso tono="alerta" icono="schedule_send">
                Esperando que <strong>{e.transferenciaPendiente.destinatario.nombre}</strong> acepte la entrada. Hasta entonces tu QR sigue vigente.
              </Aviso>
              <Boton variante="fantasma" icono="cancel_schedule_send" className="w-full" onClick={() => onCancelarTransferencia?.(e.transferenciaPendiente!.id)}>
                Cancelar transferencia
              </Boton>
            </>
          ) : (
            <>
              <Boton variante="primario" icono="send" className="w-full" disabled={!transferible} onClick={onTransferir}>
                Transferir Entrada
              </Boton>
              <div className="flex items-center justify-between gap-2">
                <Boton variante="peligro" icono="undo" className="flex-1" disabled={!enPlazo} onClick={onReembolso}>
                  Solicitar Reembolso
                </Boton>
                <Chip tono={enPlazo ? 'exito' : 'peligro'} icono={enPlazo ? 'check' : 'block'}>
                  {enPlazo ? '>48 hs para la función' : 'Plazo vencido'}
                </Chip>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaPase({ pase: p, apertura }: { pase: Pase; apertura: string | null }) {
  const estado =
    p.estado === 'USADA' ? <Chip tono="neutro" icono="done_all">Ingresado</Chip> : p.estado === 'ANULADA' ? <Chip tono="alerta" icono="undo">Reembolsado</Chip> : <Chip tono="vivo" punto pulso>Pase activo</Chip>;
  return (
    <div className="flex flex-col justify-between space-y-4 rounded-xl border border-nv-line bg-surface-container p-5 shadow-xl transition hover:border-secondary/40">
      <div>
        <CabeceraTarjeta icono="directions_car" color="bg-secondary/15 text-secondary" etiqueta="Acceso vehicular" titulo="Pase de Estacionamiento" estado={estado} />
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-nv-line bg-surface-container-lowest p-4">
          <CodigoQR valor={p.qr} tipo="PASE" anulado={p.estado === 'USADA' ? 'Usado' : p.estado === 'ANULADA' ? 'Anulado' : undefined} />
          {p.codigo && (
            <div className="mt-3 w-full space-y-1 text-center">
              <div className="flex items-center justify-center gap-1.5 rounded border border-secondary/30 bg-cyan-950/60 px-2 py-1 font-mono text-label-md text-secondary">
                <Icono nombre="directions_car" className="text-[16px]" /> ID: #{p.codigo}
              </div>
              {p.hash && <div className="font-mono text-[10px] tracking-tight text-outline">HASH: {p.hash}</div>}
            </div>
          )}
        </div>
        <div className="mt-4 space-y-2">
          <FilaDato etiqueta="Ubicación asignada:">
            <span className="text-right font-bold text-white">{p.playa.nombre}</span>
          </FilaDato>
          <FilaDato etiqueta="Vehículo registrado:">
            <PatenteMercosur patente={p.patente} />
          </FilaDato>
          {apertura && (
            <FilaDato etiqueta="Horario y acceso:">
              <span className="font-medium text-secondary">Válido desde {apertura} hs</span>
            </FilaDato>
          )}
        </div>
      </div>
      <div className="border-t border-nv-line pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-secondary/20 bg-secondary/10 p-2.5 text-[11px] text-secondary-fixed">
          <Icono nombre="verified_user" className="text-[18px] text-secondary" />
          Escaneá el QR en el lector de la barrera vehicular. También se valida por patente.
        </div>
      </div>
    </div>
  );
}

function TarjetaVoucher({ voucher: v }: { voucher: Voucher }) {
  const estado =
    v.estado === 'USADA' ? <Chip tono="neutro" icono="done_all">Canjeado</Chip> : v.estado === 'ANULADA' ? <Chip tono="alerta" icono="undo">Reembolsado</Chip> : <Chip tono="alerta" punto pulso>Disponible para canje</Chip>;
  return (
    <div className="flex flex-col justify-between space-y-4 rounded-xl border border-nv-line bg-surface-container p-5 shadow-xl transition hover:border-amber-500/40">
      <div>
        <CabeceraTarjeta icono="local_bar" color="bg-amber-500/20 text-amber-400" etiqueta="Preventa gastronómica" titulo="Voucher de Consumición" estado={estado} />
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-nv-line bg-surface-container-lowest p-4">
          <CodigoQR valor={v.qr} tipo="VOUCHER" anulado={v.estado === 'USADA' ? 'Canjeado' : v.estado === 'ANULADA' ? 'Anulado' : undefined} />
          {v.codigo && (
            <div className="mt-3 w-full space-y-1 text-center">
              <div className="flex items-center justify-center gap-1.5 rounded border border-amber-500/30 bg-amber-950/60 px-2 py-1 font-mono text-label-md text-amber-400">
                <Icono nombre="restaurant" className="text-[16px]" /> VOUCHER: #{v.codigo}
              </div>
              <div className="font-mono text-[10px] tracking-tight text-outline">PIN DE SEGURIDAD: {v.pin}</div>
            </div>
          )}
        </div>
        <div className="mt-4 space-y-2">
          <div className="rounded-lg border border-nv-line bg-surface-container-lowest/70 p-2.5 text-body-sm">
            <span className="mb-0.5 block text-[11px] text-on-surface-variant">Ítems incluidos:</span>
            {v.items.map((i) => (
              <span key={i.productoId} className="block font-bold text-white">
                {i.cantidad}x {i.nombre}
              </span>
            ))}
          </div>
          <FilaDato etiqueta="Puntos de canje:">
            <span className="font-semibold text-amber-300">Barras del predio</span>
          </FilaDato>
        </div>
      </div>
      <div className="border-t border-nv-line pt-3">
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
          <Icono nombre="info" className="text-[18px] text-amber-400" />
          Canje independiente: no hace falta validar la entrada al show.
        </div>
      </div>
    </div>
  );
}

function PanelTransferencia({ entrada, onCerrar, onListo }: { entrada: Entrada; onCerrar: () => void; onListo: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [doc, setDoc] = useState('');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    setEnviando(true);
    try {
      await api.post(`/entradas/${entrada.id}/transferencias`, { dni: doc.replace(/\D/g, '') || undefined, email: email.trim() || undefined });
      toast(`Le enviamos la entrada a ${nombre || email || `DNI ${doc}`}. Cuando la acepte, tu QR quedará anulado.`);
      onListo();
    } catch (e) {
      toast(mensajeError(e), 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="animate-entrar space-y-5 rounded-xl border border-primary-container/40 bg-surface-container p-6 shadow-2xl">
      <div className="flex flex-col justify-between gap-3 border-b border-nv-line pb-3 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary-container/30 bg-primary-container/20 text-primary">
            <Icono nombre="send" />
          </div>
          <div>
            <h3 className="text-title-sm text-white">Transferencia Segura de Entrada #{entrada.codigo}</h3>
            <p className="text-body-sm text-on-surface-variant">Reasigná la titularidad de tu entrada a otra persona registrada en TicketFr.</p>
          </div>
        </div>
        <span className="self-start rounded-full border border-primary-container/30 bg-indigo-950 px-3 py-1 font-mono text-label-md text-primary md:self-auto">
          {entrada.sector.nombre} • {entrada.butaca ? `Fila ${entrada.butaca.fila}, Butaca ${entrada.butaca.fila}${entrada.butaca.numero}` : 'Sin numerar'}
        </span>
      </div>
      <Aviso tono="alerta" titulo="¡Atención! Anulación del código QR actual">
        Cuando el destinatario acepte, se <strong>anulará permanentemente tu código QR (#{entrada.codigo})</strong> y se emitirá un <strong>nuevo QR único</strong> a su nombre. El destinatario tiene que estar
        registrado y no puede superar 6 entradas para la función.
      </Aviso>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-label-md font-medium text-on-surface-variant">Nombre y apellido del destinatario</span>
          <input className="campo" placeholder="Ej: Mariana Rojas" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-label-md font-medium text-on-surface-variant">DNI del destinatario</span>
          <input className="campo-mono" placeholder="Número de documento" value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-label-md font-medium text-on-surface-variant">Email del destinatario</span>
          <input className="campo" type="email" placeholder="ejemplo@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-nv-line pt-3">
        <Boton variante="fantasma" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="primario" icono="verified_user" cargando={enviando} disabled={!doc && !email}>
          Confirmar y Reasignar Titularidad
        </Boton>
      </div>
    </form>
  );
}

function PanelReembolso({ compra, entradaId, limite, onListo }: { compra: Compra; entradaId?: number; limite: Date; onListo: (c: Compra) => void }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [soloUna, setSoloUna] = useState(!!entradaId);
  const [enviando, setEnviando] = useState(false);
  const consulta = soloUna && entradaId ? `?entradas=${entradaId}` : '';
  const { datos: preview } = useCarga(() => api.get<PreviewReembolso>(`/compras/${compra.id}/reembolso${consulta}`), [compra.id, consulta, compra.entradas.length]);

  useEffect(() => setSoloUna(!!entradaId), [entradaId]);

  const confirmar = async () => {
    if (!preview) return;
    setEnviando(true);
    try {
      const actualizada = await api.post<Compra>(`/compras/${compra.id}/reembolsos`, { entradaIds: preview.entradasSeleccionadas, motivo });
      toast(`Reembolso aprobado: reintegramos ${pesos(preview.total)}. Los QR devueltos quedaron anulados.`);
      onListo(actualizada);
    } catch (e) {
      toast(mensajeError(e), 'error');
    } finally {
      setEnviando(false);
    }
  };

  const cantidadVigentes = compra.entradas.filter((e) => e.estado === 'VIGENTE' && e.esTitular).length;

  return (
    <section className="space-y-5 rounded-xl border border-nv-line bg-surface-container p-6 shadow-xl">
      <div className="flex flex-col justify-between gap-3 border-b border-nv-line pb-3 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/20 text-rose-400">
            <Icono nombre="undo" />
          </div>
          <div>
            <h3 className="text-title-sm text-white">Garantía de Devolución y Reembolso</h3>
            <p className="text-body-sm text-on-surface-variant">Reintegro total de lo devuelto hasta 48 horas antes de la función.</p>
          </div>
        </div>
        <Chip tono={preview?.reembolsable ? 'exito' : 'peligro'} icono="schedule">
          {Date.now() < limite.getTime() ? `Plazo habilitado: vence ${fechaHoraCorta(limite.toISOString())} hs` : 'Plazo vencido'}
        </Chip>
      </div>

      {preview && !preview.reembolsable ? (
        <Aviso tono="peligro" titulo="Esta compra no se puede devolver">
          {preview.motivo}
        </Aviso>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-nv-line bg-surface-container-lowest p-4">
            <div className="flex items-center justify-between border-b border-nv-line pb-2 text-label-md text-on-surface">
              <span>Desglose detallado de la orden:</span>
              <span className="font-mono text-[11px] text-outline">ORD #{compra.codigo}</span>
            </div>
            {cantidadVigentes > 1 && entradaId && (
              <div className="flex gap-2 text-[11px]">
                <button type="button" onClick={() => setSoloUna(true)} className={cx('rounded px-2 py-1', soloUna ? 'bg-primary-container text-white' : 'bg-surface-container text-on-surface-variant')}>
                  Solo la entrada elegida
                </button>
                <button type="button" onClick={() => setSoloUna(false)} className={cx('rounded px-2 py-1', !soloUna ? 'bg-primary-container text-white' : 'bg-surface-container text-on-surface-variant')}>
                  Toda la orden
                </button>
              </div>
            )}
            <div className="space-y-2 text-body-sm">
              {!preview ? (
                <p className="text-outline">Calculando…</p>
              ) : (
                preview.items.map((i, idx) => (
                  <div key={idx} className="flex items-center justify-between text-on-surface-variant">
                    <span>{i.concepto}:</span>
                    <span className="font-mono font-semibold text-white">{pesos(i.monto)}</span>
                  </div>
                ))
              )}
              {preview && !preview.incluyeAdicionales && (compra.pases.length > 0 || compra.voucher) && (
                <p className="text-[11px] text-outline">El estacionamiento y las consumiciones se devuelven junto con la última entrada de la orden.</p>
              )}
              <div className="flex items-center justify-between border-t border-nv-line pt-2 text-title-sm">
                <span className="text-on-surface">Total a reintegrar:</span>
                <span className="font-mono text-headline-md font-extrabold text-emerald-400">{pesos(preview?.total ?? 0)}</span>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-label-md font-medium text-on-surface-variant">Motivo de la solicitud de devolución</span>
              <select className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {MOTIVOS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <div className="rounded-lg border border-nv-line bg-surface-container-lowest p-3 text-[11px] leading-relaxed text-on-surface-variant">
              <strong className="mb-0.5 block text-on-surface">Política y condiciones del organizador:</strong>
              La devolución anula los códigos QR devueltos y libera automáticamente tus butacas y cupos. El reintegro se procesa al medio de pago original.
            </div>
            <div className="flex justify-end">
              <Boton variante="peligro" className="!bg-rose-600 !text-white hover:!bg-rose-500" icono="undo" cargando={enviando} disabled={!preview?.reembolsable} onClick={confirmar}>
                Confirmar Solicitud de Reembolso ({pesos(preview?.total ?? 0)})
              </Boton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function BandejaCorreo() {
  const [abierta, setAbierta] = useState(false);
  const { datos } = useCarga(() => (abierta ? api.get<Notificacion[]>('/notificaciones') : Promise.resolve(null)), [abierta]);
  return (
    <section className="rounded-xl border border-dashed border-outline-variant/50 p-4">
      <button type="button" onClick={() => setAbierta((a) => !a)} className="flex w-full items-center justify-between text-left text-label-md text-on-surface-variant hover:text-on-surface">
        <span className="flex items-center gap-2">
          <Icono nombre="mail" className="text-[20px] text-secondary" /> Bandeja de correo (servicio de mailing simulado)
        </span>
        <Icono nombre={abierta ? 'expand_less' : 'expand_more'} />
      </button>
      {abierta && (
        <div className="mt-3 space-y-2">
          {!datos ? (
            <p className="text-body-sm text-outline">Cargando…</p>
          ) : datos.length === 0 ? (
            <p className="text-body-sm text-outline">No recibiste correos.</p>
          ) : (
            datos.map((n) => (
              <div key={n.id} className="rounded-lg bg-surface-container p-3 text-body-sm">
                <div className="flex justify-between gap-2">
                  <strong className="text-on-surface">{n.asunto}</strong>
                  <span className="whitespace-nowrap font-mono text-[11px] text-outline">{fechaHoraCorta(n.fecha)}</span>
                </div>
                <p className="mt-1 text-on-surface-variant">{n.cuerpo}</p>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
