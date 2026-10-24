// Panel de control de acceso y canje QR (pantalla 5 de Stitch, actividad 3.5).
import { Html5Qrcode } from 'html5-qrcode';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { BarraLateral, Cabecera } from '../../components/Cabecera';
import { PatenteMercosur, Perforado } from '../../components/Pases';
import { useToast } from '../../components/Toast';
import { Aviso, Boton, Cargando, Chip, cx, Icono, Progreso } from '../../components/ui';
import { api, ErrorApi, mensajeError } from '../../lib/api';
import { dni, fechaCorta, fechaHoraCorta, fechaLarga, horaSegundos, numero, porcentaje } from '../../lib/formato';
import type { Padron, PuntoControl, RegistroValidacion, ResultadoValidacion, ResumenControl } from '../../lib/tipos';
import { useCarga } from '../../lib/useCarga';
import { colaPendiente, guardarPadron, padronLocal, vaciarCola, validarOffline } from './offline';

const CLAVE_FUNCION = 'ticketfr.control.funcion';
const NOMBRE_PUNTO: Record<PuntoControl, string> = { PUERTA: 'Puerta de Sala', ESTACIONAMIENTO: 'Ingreso Estacionamiento', BARRA: 'Barra Gastronómica' };

type Funcion = { id: number; codigo: string; fechaHora: string; evento: string; sala: string };

export default function ControlAcceso() {
  const { usuario, cerrarSesion } = useAuth();
  const navegar = useNavigate();
  const toast = useToast();
  const { datos: funciones } = useCarga(() => api.get<Funcion[]>('/control/funciones'), []);
  const [funcionId, setFuncionId] = useState<number | null>(() => Number(localStorage.getItem(CLAVE_FUNCION)) || null);
  const [punto, setPunto] = useState<PuntoControl>('PUERTA');
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [padronInfo, setPadronInfo] = useState<Padron | null>(null);

  useEffect(() => {
    if (!funciones?.length) return;
    if (!funcionId || !funciones.some((f) => f.id === funcionId)) setFuncionId(funciones[0].id);
  }, [funciones, funcionId]);
  useEffect(() => {
    if (!funcionId) return;
    try {
      localStorage.setItem(CLAVE_FUNCION, String(funcionId));
    } catch {
      // preferencia no persistida
    }
    setPadronInfo(padronLocal(funcionId));
    setPendientes(colaPendiente(funcionId).length);
  }, [funcionId]);

  const { datos: resumen, recargar } = useCarga(
    () => (funcionId ? api.get<ResumenControl>(`/control/funciones/${funcionId}/resumen`) : Promise.resolve(null)),
    [funcionId],
  );

  // Latido cada 5 s para detectar la caída de conexión
  useEffect(() => {
    const latido = async () => {
      try {
        await api.get('/health');
        setOnline(true);
      } catch {
        setOnline(false);
      }
    };
    latido();
    const t = setInterval(latido, 5000);
    return () => clearInterval(t);
  }, []);

  const sincronizarPadron = useCallback(async () => {
    if (!funcionId) return;
    try {
      const padron = await api.get<Padron>(`/control/funciones/${funcionId}/padron`);
      guardarPadron(padron);
      setPadronInfo(padron);
      toast(`Padrón sincronizado: ${numero(padron.codigos.length)} códigos guardados en el dispositivo`);
    } catch (e) {
      toast(mensajeError(e), 'error');
    }
  }, [funcionId, toast]);

  // Al recuperar la conexión, enviar los ingresos registrados sin conexión
  const enviarCola = useCallback(async () => {
    if (!funcionId) return;
    const cola = colaPendiente(funcionId);
    if (!cola.length) return;
    try {
      const r = await api.post<{ aplicadas: number; conflictos: ResultadoValidacion[] }>('/control/sincronizar', { funcionId, operaciones: cola });
      vaciarCola(funcionId);
      setPendientes(0);
      toast(`Conciliación: ${r.aplicadas} ingresos aplicados${r.conflictos.length ? `, ${r.conflictos.length} con conflicto` : ''}`, r.conflictos.length ? 'error' : 'exito');
      recargar();
    } catch {
      // sigue sin conexión: se reintenta con el próximo latido
    }
  }, [funcionId, recargar, toast]);
  useEffect(() => {
    if (online && pendientes) enviarCola();
  }, [online, pendientes, enviarCola]);

  // ── Validación ──
  const [codigo, setCodigo] = useState('');
  const [validando, setValidando] = useState(false);
  const [ultimos, setUltimos] = useState<{ aprobado?: ResultadoValidacion; rechazado?: ResultadoValidacion; pase?: ResultadoValidacion; voucher?: ResultadoValidacion; destacado?: string }>({});
  const [filtro, setFiltro] = useState<'TODOS' | 'APROBADO' | 'RECHAZADO' | string>('TODOS');
  const entradaManual = useRef<HTMLInputElement>(null);

  useEffect(() => setUltimos({}), [funcionId]);

  const validar = useCallback(
    async (valor: string, confirmar = false, enPunto: PuntoControl = punto) => {
      if (!funcionId || !valor.trim()) return null;
      setValidando(true);
      let r: ResultadoValidacion;
      try {
        r = await api.post<ResultadoValidacion>('/control/validaciones', { codigo: valor, punto: enPunto, funcionId, confirmar });
      } catch (e) {
        if (!(e instanceof ErrorApi && e.status === 0)) {
          toast(mensajeError(e), 'error');
          setValidando(false);
          return null;
        }
        setOnline(false);
        r = validarOffline(funcionId, valor, enPunto, confirmar);
        setPendientes(colaPendiente(funcionId).length);
      }
      setValidando(false);
      const clave = `${r.codigo}-${Date.now()}`;
      setUltimos((u) => {
        if (r.resultado === 'RECHAZADO') return { ...u, rechazado: r, destacado: 'rechazado' + clave };
        if (r.tipo === 'PASE') return { ...u, pase: r, destacado: 'pase' + clave };
        if (r.tipo === 'VOUCHER') return { ...u, voucher: r, destacado: 'voucher' + clave };
        return { ...u, aprobado: r, destacado: 'aprobado' + clave };
      });
      if (r.confirmado || r.resultado === 'RECHAZADO') recargar();
      return r;
    },
    [funcionId, punto, recargar, toast],
  );

  const validarManual = (e?: FormEvent) => {
    e?.preventDefault();
    validar(codigo).then((r) => r && setCodigo(''));
  };

  // ── Cámara ──
  const [camara, setCamara] = useState(false);
  const lector = useRef<Html5Qrcode | null>(null);
  const ultimaLectura = useRef({ texto: '', hora: 0 });
  useEffect(() => {
    if (!camara) return;
    const instancia = new Html5Qrcode('lector-camara');
    lector.current = instancia;
    instancia
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (texto) => {
          const ahora = Date.now();
          if (texto === ultimaLectura.current.texto && ahora - ultimaLectura.current.hora < 3000) return;
          ultimaLectura.current = { texto, hora: ahora };
          validar(texto);
        },
        () => {},
      )
      .catch((err) => {
        toast(`No se pudo abrir la cámara: ${err}`, 'error');
        setCamara(false);
      });
    return () => {
      instancia
        .stop()
        .catch(() => {})
        .finally(() => instancia.clear());
      lector.current = null;
    };
  }, [camara, validar, toast]);

  // ── Simulación (toma códigos reales del padrón) ──
  const simular = async (tipo: 'valido' | 'invalido' | 'canje') => {
    if (!funcionId) return;
    let padron = padronLocal(funcionId);
    if (!padron && online) {
      padron = await api.get<Padron>(`/control/funciones/${funcionId}/padron`);
      guardarPadron(padron);
      setPadronInfo(padron);
    }
    if (!padron) return toast('Sincronizá el padrón para simular lecturas', 'error');
    const azar = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)];
    if (tipo === 'valido') {
      const item = azar(padron.codigos.filter((c) => c.tipo === 'ENTRADA' && c.estado === 'VIGENTE'));
      if (!item) return toast('No quedan entradas vigentes en el padrón', 'info');
      setPunto('PUERTA');
      validar(item.codigo, false, 'PUERTA');
    } else if (tipo === 'invalido') {
      const candidato = azar([...padron.revocados.map((r) => r.codigo), ...padron.codigos.filter((c) => c.estado === 'USADA').map((c) => c.codigo), 'ENT-00000-X0']);
      validar(candidato, false, punto);
    } else {
      const destino: PuntoControl = punto === 'ESTACIONAMIENTO' ? 'BARRA' : 'ESTACIONAMIENTO';
      const item = azar(padron.codigos.filter((c) => c.tipo === (destino === 'BARRA' ? 'VOUCHER' : 'PASE') && c.estado === 'VIGENTE'));
      if (!item) return toast('No quedan pases o vouchers vigentes en el padrón', 'info');
      setPunto(destino);
      validar(destino === 'ESTACIONAMIENTO' && item.patente ? `PAT-${item.patente}` : item.codigo, false, destino);
    }
  };

  const confirmar = async (r: ResultadoValidacion) => {
    const confirmado = await validar(r.codigo, true, r.punto);
    if (confirmado?.confirmado) {
      toast(r.punto === 'PUERTA' ? 'Molinete desbloqueado: entrada marcada como usada' : r.punto === 'ESTACIONAMIENTO' ? 'Ingreso vehicular registrado: barrera abierta' : 'Voucher canjeado: entregá los ítems');
    } else if (confirmado) {
      toast(confirmado.motivo ?? 'No se pudo confirmar', 'error');
    }
  };

  const exportarBitacora = () => {
    const filas = [['Hora', 'Código', 'Punto', 'Titular / vehículo', 'Ubicación / detalle', 'Resultado', 'Motivo', 'Latencia ms', 'Offline'], ...(resumen?.recientes ?? []).map((v) => [v.fechaHora, v.codigo, v.punto, v.titular ?? '', v.ubicacion ?? '', v.resultado, v.motivo ?? '', v.latenciaMs, v.offline ? 'sí' : 'no'])];
    const csv = '﻿' + filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `bitacora-${resumen?.funcion.codigo ?? 'control'}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  const funcion = funciones?.find((f) => f.id === funcionId);
  const t = resumen?.turno;
  const recientes = (resumen?.recientes ?? []).filter((v) => filtro === 'TODOS' || v.resultado === filtro || v.codigo === filtro);

  const subbarra = (
    <>
      <div className="flex min-w-max items-center gap-space-md">
        <div className="flex items-center gap-space-xs text-secondary">
          <Icono nombre="stadium" className="text-[18px]" />
          <span className="text-label-xs uppercase tracking-wider text-outline">Evento operativo:</span>
        </div>
        <select aria-label="Función" className="campo w-auto max-w-[260px] py-1 text-label-md" value={funcionId ?? ''} onChange={(e) => setFuncionId(Number(e.target.value))}>
          {funciones?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.evento} · {fechaCorta(f.fechaHora)}
            </option>
          ))}
        </select>
        {funcion && (
          <span className="hidden text-body-sm text-on-surface-variant xl:inline">
            {fechaLarga(funcion.fechaHora)} <span className="text-outline">|</span> {funcion.sala}
          </span>
        )}
      </div>
      <div className="flex min-w-max items-center gap-space-md">
        <span className="flex items-center gap-space-xs rounded bg-surface-container px-space-sm py-1 text-label-xs font-normal text-on-surface-variant">
          <Icono nombre="qr_code_scanner" className="text-[16px] text-secondary" /> {camara ? 'Cámara activa' : 'Lector manual / USB'}
        </span>
        <span className={cx('flex items-center gap-space-xs rounded px-space-sm py-1 text-label-xs uppercase', online ? 'bg-tertiary-container/30 text-tertiary' : 'bg-amber-500/20 text-amber-300')}>
          <Icono nombre={online ? 'sync' : 'cloud_off'} className="text-[16px]" />
          {online ? 'Online · sincronizado' : `Offline · ${pendientes} en cola`}
        </span>
      </div>
    </>
  );

  return (
    <>
      <Cabecera subbarra={subbarra} />
      <div className="flex">
        <BarraLateral
          grupos={[
            {
              items: [
                { icono: 'qr_code_2', texto: 'Escaneo y Validación', activo: true, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
                { icono: 'pin', texto: 'Búsqueda / DNI Manual', onClick: () => entradaManual.current?.focus() },
                { icono: 'group', texto: 'Monitoreo de Aforo', onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
                { icono: 'warning', texto: 'Incidencias y Bloqueos', onClick: () => (setFiltro('RECHAZADO'), document.getElementById('bitacora')?.scrollIntoView({ behavior: 'smooth' })) },
                { icono: 'cloud_done', texto: `Buffer Offline (${pendientes})`, onClick: () => (online ? enviarCola() : toast('Sin conexión: los ingresos quedan en cola', 'info')) },
              ],
            },
          ]}
          pie={
            <div className="flex flex-col gap-space-xs">
              <div className="rounded-lg bg-surface-container p-space-sm">
                <p className="text-label-xs uppercase tracking-wider text-outline">Puesto de control</p>
                <p className="text-title-sm text-on-surface">{usuario?.puntoAcceso ?? 'Sin asignar'}</p>
              </div>
              <div className="rounded-lg bg-surface-container-low p-space-sm text-label-xs">
                <span className="font-normal text-outline">Padrón local: </span>
                <span className={padronInfo ? 'text-tertiary' : 'text-amber-300'}>{padronInfo ? `${numero(padronInfo.codigos.length)} códigos · ${fechaHoraCorta(padronInfo.generadoEn)}` : 'sin sincronizar'}</span>
              </div>
              <Boton variante="suave" icono="download_for_offline" onClick={sincronizarPadron} disabled={!online}>
                Sincronizar padrón
              </Boton>
              <Boton variante="suave" icono="lock" onClick={() => (cerrarSesion(), navegar('/login'))}>
                Cerrar turno
              </Boton>
            </div>
          }
        />
        <main className="min-w-0 flex-1 bg-surface">
          {!funciones ? (
            <Cargando />
          ) : !funciones.length ? (
            <div className="p-8">
              <Aviso tono="info">No hay funciones publicadas desde hoy en adelante.</Aviso>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-space-lg px-4 py-space-md lg:px-gutter-lg">
              {!online && (
                <Aviso tono="alerta" icono="cloud_off" titulo="Modo sin conexión">
                  {padronInfo ? 'Validando contra el padrón local. Los ingresos se guardan en cola y se concilian al volver la conexión.' : 'No hay padrón sincronizado en este dispositivo: no se pueden validar códigos.'}
                </Aviso>
              )}

              {/* Selector de punto de control */}
              <section className="flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-sm">
                  <span className="h-2.5 w-2.5 animate-ping rounded-full bg-tertiary" />
                  <p className="text-label-xs uppercase tracking-widest text-outline">Terminal operativa de acceso • Selección de puesto activo</p>
                </div>
                <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
                  {(
                    [
                      ['PUERTA', 'door_front', 'Puerta de Sala (Entradas)', 'text-secondary', 'Ingresos registrados:', resumen?.puerta.ingresados ?? 0, resumen?.puerta.vendidas ?? 0, 'pax', 'bg-gradient-to-r from-primary-container to-secondary'],
                      ['ESTACIONAMIENTO', 'directions_car', 'Estacionamiento', 'text-secondary-fixed-dim', 'Ocupación de boxes:', resumen?.estacionamiento.ocupados ?? 0, resumen?.estacionamiento.cupo ?? 0, 'veh', 'bg-secondary-container'],
                      ['BARRA', 'lunch_dining', 'Barra Gastronómica', 'text-tertiary', 'Vouchers canjeados:', resumen?.barra.canjeados ?? 0, resumen?.barra.emitidos ?? 0, 'emitidos', 'bg-tertiary'],
                    ] as const
                  ).map(([valor, icono, titulo, color, etiqueta, actual, total, unidad, barra]) => {
                    const activo = punto === valor;
                    return (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => setPunto(valor)}
                        aria-pressed={activo}
                        className={cx('relative flex flex-col overflow-hidden rounded-lg p-space-md text-left transition-all', activo ? 'bg-surface-container-high shadow-lg' : 'bg-surface-container hover:bg-surface-container-high')}
                      >
                        {activo && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-secondary" />}
                        <div className="mb-space-xs flex items-center justify-between">
                          <div className={cx('flex items-center gap-space-xs', color)}>
                            <Icono nombre={icono} className="text-[20px]" />
                            <span className={cx('text-label-md uppercase tracking-wider', activo ? 'text-on-surface' : 'text-on-surface-variant')}>{titulo}</span>
                          </div>
                          <Chip tono={activo ? 'exito' : 'neutro'} punto={activo}>
                            {activo ? 'Activo' : 'En espera'}
                          </Chip>
                        </div>
                        <p className="text-title-sm text-on-surface">
                          {valor === 'PUERTA' ? (usuario?.puntoAcceso ?? 'Molinete general') : valor === 'ESTACIONAMIENTO' ? (resumen?.estacionamiento.playas.join(' / ') || 'Sin playas habilitadas') : 'Barras del predio'}
                        </p>
                        <div className="mt-space-sm flex items-center justify-between text-body-sm">
                          <span className="text-on-surface-variant">{etiqueta}</span>
                          <span className="font-bold tracking-tight text-on-surface">
                            {numero(actual)} <span className="font-normal text-outline">/ {numero(total)} {unidad}</span>
                          </span>
                        </div>
                        <Progreso valor={actual} total={total} color={barra} className="mt-1.5" />
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Escáner y validación manual */}
              <section className="grid grid-cols-1 items-stretch gap-space-lg lg:grid-cols-12">
                <div className="relative flex flex-col justify-between overflow-hidden rounded-lg bg-surface-container-lowest p-space-md shadow-2xl lg:col-span-7">
                  <div className="z-20 mb-space-sm flex flex-wrap items-center justify-between gap-space-sm">
                    <div className="flex items-center gap-space-xs rounded-full bg-surface-container-high/80 px-space-sm py-1 backdrop-blur-md">
                      <span className={cx('h-2 w-2 rounded-full', validando ? 'animate-ping bg-secondary' : 'animate-pulse bg-tertiary')} />
                      <span className="text-label-xs uppercase tracking-wider text-on-surface">
                        {validando ? 'Verificando código…' : `Listo para escanear • ${NOMBRE_PUNTO[punto]}`}
                      </span>
                    </div>
                    <Boton variante={camara ? 'primario' : 'suave'} icono={camara ? 'videocam_off' : 'videocam'} className="py-1" onClick={() => setCamara((c) => !c)}>
                      {camara ? 'Apagar cámara' : 'Usar cámara'}
                    </Boton>
                  </div>
                  <div className="relative flex h-[280px] w-full items-center justify-center overflow-hidden rounded-lg bg-surface-dim sm:h-[320px]">
                    <div className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-luminosity" style={{ backgroundImage: 'url(/img/escaner-fondo.jpg)' }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-surface-container-lowest/80" />
                    <div id="lector-camara" className={cx('absolute inset-0 z-10 [&_video]:h-full [&_video]:w-full [&_video]:object-cover', !camara && 'hidden')} />
                    {!camara && (
                      <div className="relative flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64">
                        <div className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-secondary" />
                        <div className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-secondary" />
                        <div className="absolute bottom-0 left-0 h-8 w-8 border-b-2 border-l-2 border-secondary" />
                        <div className="absolute bottom-0 right-0 h-8 w-8 border-b-2 border-r-2 border-secondary" />
                        <div className="absolute inset-x-2 h-0.5 animate-barrido bg-gradient-to-r from-transparent via-tertiary to-transparent shadow-[0_0_12px_#4edea3]" />
                        <div className="pointer-events-none flex select-none flex-col items-center gap-1 opacity-25">
                          <Icono nombre="qr_code_scanner" tam={100} className="text-on-surface-variant" />
                          <span className="text-label-xs uppercase tracking-widest text-secondary">Alinear QR en recuadro</span>
                        </div>
                        <div className="absolute right-2 top-2 font-mono text-[10px] font-bold tracking-wider text-tertiary">DECODER: ON</div>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-4 z-20 flex flex-wrap justify-center gap-space-xs px-2">
                      <button type="button" onClick={() => simular('valido')} className="flex items-center gap-1.5 rounded-xl bg-tertiary/20 px-space-md py-1.5 text-label-md uppercase tracking-wider text-tertiary backdrop-blur-md transition-all hover:bg-tertiary/30">
                        <Icono nombre="check_circle" className="text-[16px]" /> Simular QR aprobado
                      </button>
                      <button type="button" onClick={() => simular('invalido')} className="flex items-center gap-1.5 rounded-xl bg-error/20 px-space-md py-1.5 text-label-md uppercase tracking-wider text-error backdrop-blur-md transition-all hover:bg-error/30">
                        <Icono nombre="cancel" className="text-[16px]" /> Simular QR inválido
                      </button>
                      <button type="button" onClick={() => simular('canje')} className="flex items-center gap-1.5 rounded-xl bg-secondary/20 px-space-md py-1.5 text-label-md uppercase tracking-wider text-secondary backdrop-blur-md transition-all hover:bg-secondary/30">
                        <Icono nombre="sync_alt" className="text-[16px]" /> Simular auto / canje
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-space-sm text-label-xs font-normal text-outline">
                    <span className="flex items-center gap-1">
                      <Icono nombre="memory" className="text-[14px] text-secondary" /> Los lectores USB que emulan teclado escriben en el campo manual + ENTER
                    </span>
                    <span className="font-mono text-on-surface-variant">Simulaciones con códigos reales del padrón</span>
                  </div>
                </div>

                <form onSubmit={validarManual} className="flex flex-col justify-between rounded-lg bg-surface-container-low p-space-lg shadow-xl lg:col-span-5">
                  <div className="flex flex-col gap-space-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-space-xs text-primary-fixed">
                        <Icono nombre="keyboard" className="text-[20px]" />
                        <span className="text-title-sm text-on-surface">Validación Manual / DNI</span>
                      </div>
                      <span className="rounded bg-surface-container-highest px-space-xs py-0.5 text-label-xs text-on-surface-variant">CONTINGENCIA</span>
                    </div>
                    <p className="text-body-sm text-on-surface-variant">Ingresá el código impreso al pie del QR, el DNI del titular o la patente del vehículo.</p>
                    <label className="mt-space-xs flex flex-col gap-1.5">
                      <span className="text-label-xs uppercase tracking-wider text-outline">Código de entrada, voucher o patente</span>
                      <div className="relative flex items-center">
                        <input
                          ref={entradaManual}
                          className="w-full rounded-lg border-0 bg-surface-container-lowest px-space-md py-3 pr-12 font-mono text-headline-md uppercase tracking-wider text-on-surface transition-all focus:outline-none focus:ring-2 focus:ring-primary-container"
                          placeholder="Ej: #ENT-99210-A5"
                          value={codigo}
                          onChange={(e) => setCodigo(e.target.value)}
                        />
                        <button type="button" aria-label="Borrar" onClick={() => setCodigo('')} className="absolute right-3 p-1 text-outline hover:text-on-surface">
                          <Icono nombre="backspace" className="text-[20px]" />
                        </button>
                      </div>
                    </label>
                    <div className="mt-space-xs flex flex-col gap-space-xs">
                      <span className="text-label-xs uppercase text-outline">Prefijos rápidos de consulta</span>
                      <div className="grid grid-cols-4 gap-1.5 text-label-md">
                        {(['#ENT-', '#VCH-', 'DNI-', 'PAT-'] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setCodigo(p);
                              if (p === 'PAT-') setPunto('ESTACIONAMIENTO');
                              if (p === '#VCH-') setPunto('BARRA');
                              if (p === '#ENT-' || p === 'DNI-') setPunto('PUERTA');
                              entradaManual.current?.focus();
                            }}
                            className="rounded bg-surface-container py-2 text-center font-mono font-bold text-on-surface transition-all hover:bg-surface-container-high"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-space-md flex flex-col gap-space-xs">
                    <button type="submit" disabled={validando || !codigo.trim()} className="flex w-full items-center justify-center gap-space-xs rounded-lg bg-primary-container py-3 text-title-sm text-on-primary-container shadow-md transition-all hover:bg-primary-container/80 disabled:opacity-50">
                      <Icono nombre="verified" className="text-[22px]" /> Validar código
                    </button>
                    <div className="flex items-center justify-between px-1 text-label-xs font-normal text-outline">
                      <span>Atajo de teclado: [ENTER]</span>
                      <span className={cx('flex items-center gap-1', online ? 'text-tertiary' : 'text-amber-300')}>
                        <span className={cx('h-1.5 w-1.5 rounded-full', online ? 'bg-tertiary' : 'bg-amber-300')} /> {online ? 'Servidor de validación OK' : 'Validando con padrón local'}
                      </span>
                    </div>
                  </div>
                </form>
              </section>

              {/* Resultados */}
              <div className="flex items-center justify-between pt-space-xs">
                <div>
                  <h2 className="text-headline-md tracking-tight text-on-surface">Paneles de resultado de validación en tiempo real</h2>
                  <p className="text-body-sm text-on-surface-variant">Último acceso aprobado, último rechazo y último canje / ingreso vehicular del turno.</p>
                </div>
                <div className="flex items-center gap-space-xs rounded-full bg-surface-container px-space-md py-1">
                  <Icono nombre="history" className="text-[16px] text-secondary" />
                  <span className="text-label-xs font-normal text-on-surface-variant">Últimos eventos en vivo</span>
                </div>
              </div>
              <section className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-3">
                <TarjetaAprobado r={ultimos.aprobado} destacado={ultimos.destacado?.startsWith('aprobado')} onConfirmar={confirmar} validando={validando} />
                <TarjetaRechazado r={ultimos.rechazado} destacado={ultimos.destacado?.startsWith('rechazado')} onTrazabilidad={(c) => (setFiltro(c), document.getElementById('bitacora')?.scrollIntoView({ behavior: 'smooth' }))} />
                <TarjetaCanje pase={ultimos.pase} voucher={ultimos.voucher} destacado={ultimos.destacado?.startsWith('pase') || ultimos.destacado?.startsWith('voucher')} onConfirmar={confirmar} validando={validando} />
              </section>

              {/* Bitácora */}
              <section id="bitacora" className="flex scroll-mt-32 flex-col gap-space-md rounded-lg bg-surface-container-low p-space-lg shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-space-sm">
                  <div className="flex items-center gap-space-sm">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-container text-secondary">
                      <Icono nombre="list_alt" className="text-[18px]" />
                    </div>
                    <div>
                      <h3 className="text-title-sm text-on-surface">Registro reciente de validaciones</h3>
                      <p className="text-body-sm text-on-surface-variant">Trazabilidad auditada de la función (todos los puestos).</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-space-xs">
                    <select aria-label="Filtrar por estado" className="campo w-auto py-1.5 text-label-md" value={['TODOS', 'APROBADO', 'RECHAZADO'].includes(filtro) ? filtro : 'CODIGO'} onChange={(e) => setFiltro(e.target.value)}>
                      <option value="TODOS">Todos los estados</option>
                      <option value="APROBADO">Aprobados</option>
                      <option value="RECHAZADO">Rechazados</option>
                      {!['TODOS', 'APROBADO', 'RECHAZADO'].includes(filtro) && <option value="CODIGO">Código {filtro}</option>}
                    </select>
                    <Boton variante="suave" icono="file_download" onClick={exportarBitacora}>
                      Exportar bitácora
                    </Boton>
                  </div>
                </div>
                <TablaBitacora filas={recientes} />
              </section>

              {/* Métricas del turno */}
              <section className="flex flex-col items-center justify-between gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-2xl lg:flex-row">
                <div className="flex items-center gap-space-md">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-container text-on-primary-container shadow-md">
                    <Icono nombre="troubleshoot" className="text-[24px]" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-space-xs">
                      <span className="text-title-sm text-on-surface">Turno de {usuario?.nombre} • Métricas de puesto</span>
                      <Chip tono={online ? 'exito' : 'alerta'}>{online ? 'Online' : 'Offline'}</Chip>
                    </div>
                    <div className="flex items-center gap-space-xs text-body-sm text-on-surface-variant">
                      <Icono nombre="database" className="text-[16px] text-tertiary" />
                      {padronInfo ? `Padrón local listo para modo offline (${numero(padronInfo.codigos.length)} códigos)` : 'Sincronizá el padrón para habilitar el modo offline'}
                    </div>
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-space-md sm:grid-cols-4 lg:w-auto">
                  <Metrica titulo="Lecturas totales" valor={numero(t?.lecturas ?? 0)} unidad="escaneos" />
                  <Metrica titulo="Aprobados" valor={numero(t?.aprobados ?? 0)} unidad="pax" color="text-tertiary" pct={t ? porcentaje(t.aprobados, t.lecturas) : undefined} />
                  <Metrica titulo="Rechazados" valor={numero(t?.rechazados ?? 0)} unidad="bloqueos" color="text-error" pct={t ? porcentaje(t.rechazados, t.lecturas) : undefined} />
                  <Metrica titulo="Velocidad promedio" valor={((t?.latenciaPromedioMs ?? 0) / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 })} unidad="seg / escaneo" color="text-secondary" />
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function Metrica({ titulo, valor, unidad, color = 'text-on-surface', pct }: { titulo: string; valor: string; unidad: string; color?: string; pct?: string }) {
  return (
    <div className="flex flex-col rounded bg-surface-container p-space-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label-xs uppercase tracking-wider text-outline">{titulo}</span>
        {pct && <span className={cx('text-label-xs', color)}>{pct}</span>}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={cx('font-mono text-headline-md', color)}>{valor}</span>
        <span className="text-label-xs font-normal text-on-surface-variant">{unidad}</span>
      </div>
    </div>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-body-sm text-on-surface-variant">{etiqueta}</span>
      <span className="text-right text-body-sm">{children}</span>
    </div>
  );
}

function Esperando({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-on-surface-variant">
      <Icono nombre="qr_code_scanner" className="text-[40px] text-outline" />
      <span className="text-body-sm">{texto}</span>
    </div>
  );
}

function marco(destacado: boolean | undefined) {
  return cx('relative flex flex-col overflow-hidden rounded-lg bg-surface-container-low shadow-2xl transition-all duration-300', destacado && 'ring-2 ring-white/30 animate-entrar');
}

function TarjetaAprobado({ r, destacado, onConfirmar, validando }: { r?: ResultadoValidacion; destacado?: boolean; onConfirmar: (r: ResultadoValidacion) => void; validando: boolean }) {
  return (
    <article className={marco(destacado)}>
      <div className="h-2 w-full bg-tertiary" />
      <div className="flex flex-col gap-space-md p-space-lg">
        <div className="flex items-start justify-between">
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-tertiary/15 px-space-sm py-1 text-label-md uppercase tracking-wider text-tertiary">
            <Icono nombre="check_circle" className="text-[18px]" /> Acceso autorizado
          </div>
          {r && <span className="font-mono text-label-xs font-normal text-outline">{r.latenciaMs} ms{r.offline ? ' · offline' : ''}</span>}
        </div>
        {!r ? (
          <Esperando texto="Escaneá una entrada en la puerta de sala" />
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-label-xs uppercase tracking-wider text-tertiary">Entrada a sala</span>
              <h3 className="text-headline-md text-on-surface">{r.sector ?? 'Entrada'}</h3>
              <div className="inline-flex items-center gap-space-xs text-title-sm text-secondary">
                <Icono nombre="airline_seat_recline_extra" className="text-[18px]" /> {r.ubicacion}
              </div>
            </div>
            <div className="flex flex-col gap-space-xs rounded bg-surface-container p-space-md">
              <Fila etiqueta="Titular de la entrada:">
                <strong className="text-title-sm text-on-surface">{r.titular?.nombre}</strong>
              </Fila>
              <Fila etiqueta="Documento (DNI):">
                <span className="font-mono font-bold text-on-surface">{dni(r.titular?.dni)}</span>
              </Fila>
              <Fila etiqueta="Código QR:">
                <span className="font-mono text-label-xs text-secondary">#{r.codigo}</span>
              </Fila>
              {r.puertaAcceso && (
                <Fila etiqueta="Punto de control asignado:">
                  <span className="font-semibold text-tertiary">{r.puertaAcceso}</span>
                </Fila>
              )}
            </div>
            <Perforado fondo="bg-surface" />
            <div className="flex flex-col gap-space-xs">
              {r.confirmado ? (
                <div className="flex w-full items-center justify-center gap-space-xs rounded-lg bg-surface-container-highest px-space-md py-3.5 text-title-sm text-on-surface-variant">
                  <Icono nombre="done_all" className="text-[24px]" /> Entrada utilizada correctamente
                </div>
              ) : (
                <button type="button" disabled={validando} onClick={() => onConfirmar(r)} className="flex w-full items-center justify-center gap-space-xs rounded-lg bg-tertiary px-space-md py-3.5 text-title-sm text-on-tertiary shadow-lg shadow-tertiary/20 transition-all hover:brightness-110 disabled:opacity-60">
                  <Icono nombre="lock_open" className="text-[24px]" /> Marcar como usada (desbloquear molinete)
                </button>
              )}
              <div className="flex items-center justify-between px-1 font-mono text-label-xs font-normal text-outline">
                <span>{r.usadoEn ? `Timestamp: ${horaSegundos(r.usadoEn)} - ${fechaCorta(r.usadoEn)}` : 'Verificado, pendiente de ingreso'}</span>
                <span className="font-bold text-tertiary">{r.confirmado ? 'Paso físico: LISTO' : 'Esperando'}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function TarjetaRechazado({ r, destacado, onTrazabilidad }: { r?: ResultadoValidacion; destacado?: boolean; onTrazabilidad: (codigo: string) => void }) {
  const estado: Record<string, string> = {
    REVOCADO: 'QR anulado / revocado',
    USADA: 'Ya utilizado',
    ANULADA: 'Anulado',
    LISTA_NEGRA: 'Lista negra',
    FIRMA_INVALIDA: 'Firma inválida',
    INEXISTENTE: 'Inexistente',
    FORMATO_INVALIDO: 'Formato inválido',
    VIGENTE: 'Punto o función incorrectos',
  };
  return (
    <article className={marco(destacado)}>
      <div className="h-2 w-full bg-error" />
      <div className="flex flex-col gap-space-md p-space-lg">
        <div className="flex items-start justify-between">
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-error/15 px-space-sm py-1 text-label-md uppercase tracking-wider text-error">
            <Icono nombre="gpp_bad" className="text-[18px]" /> Acceso denegado
          </div>
          {r && <span className="rounded bg-error-container px-space-xs py-0.5 text-label-xs uppercase text-on-error-container">Alerta</span>}
        </div>
        {!r ? (
          <Esperando texto="Sin rechazos en este turno" />
        ) : (
          <>
            <div className="flex flex-col gap-1.5 rounded bg-error-container/20 p-space-md">
              <div className="flex items-center gap-space-xs text-error">
                <Icono nombre="warning" className="text-[20px]" />
                <span className="text-title-sm">Bloqueo de seguridad inmediato</span>
              </div>
              <p className="text-body-sm font-semibold leading-snug text-error">{r.motivo}</p>
            </div>
            <div className="flex flex-col gap-space-xs rounded bg-surface-container p-space-md">
              <Fila etiqueta="Código detectado:">
                <span className="font-mono font-bold text-on-surface">#{r.codigo}</span>
              </Fila>
              <Fila etiqueta="Estado del ticket:">
                <span className="rounded bg-error/20 px-space-xs py-0.5 text-label-xs uppercase text-error">{estado[r.estadoCodigo] ?? r.estadoCodigo}</span>
              </Fila>
              {r.titular && (
                <Fila etiqueta="Titular registrado:">
                  <span className="font-semibold text-on-surface">
                    {r.titular.nombre} {r.titular.dni && `(DNI ${dni(r.titular.dni)})`}
                  </span>
                </Fila>
              )}
              {r.revocacion && (
                <>
                  <Fila etiqueta="Motivo de anulación:">
                    <span className="font-semibold text-on-surface">{r.revocacion.motivo === 'TRANSFERENCIA' ? 'Entrada reasignada a nuevo titular' : 'Reembolso de la compra'}</span>
                  </Fila>
                  <Fila etiqueta="Momento de revocación:">
                    <span className="font-mono text-label-xs font-normal text-outline">
                      {fechaCorta(r.revocacion.fecha)} - {horaSegundos(r.revocacion.fecha)} hs
                    </span>
                  </Fila>
                </>
              )}
              {r.usadoEn && (
                <Fila etiqueta="Uso anterior:">
                  <span className="font-mono text-label-xs font-normal text-outline">
                    {fechaCorta(r.usadoEn)} - {horaSegundos(r.usadoEn)} hs
                  </span>
                </Fila>
              )}
            </div>
            <Perforado fondo="bg-surface" />
            <div className="grid grid-cols-2 gap-space-xs">
              <Boton variante="secundario" icono="history" onClick={() => onTrazabilidad(r.codigo)}>
                Ver trazabilidad
              </Boton>
              <Boton variante="peligro" icono="content_copy" onClick={() => navigator.clipboard?.writeText(r.codigo)}>
                Copiar código
              </Boton>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function TarjetaCanje({ pase, voucher, destacado, onConfirmar, validando }: { pase?: ResultadoValidacion; voucher?: ResultadoValidacion; destacado?: boolean; onConfirmar: (r: ResultadoValidacion) => void; validando: boolean }) {
  return (
    <article className={marco(destacado)}>
      <div className="h-2 w-full bg-secondary" />
      <div className="flex flex-col gap-space-md p-space-lg">
        <div className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-secondary/15 px-space-sm py-1 text-label-md uppercase tracking-wider text-secondary">
          <Icono nombre="stars" className="text-[18px]" /> Canje y control operativo
        </div>
        <div className="flex flex-col gap-space-xs rounded bg-surface-container p-space-md">
          <div className="flex items-center justify-between">
            <span className="text-label-xs uppercase tracking-wider text-secondary">1. Control de acceso vehicular</span>
            {pase && <span className="font-mono text-label-xs text-on-surface-variant">#{pase.codigo}</span>}
          </div>
          {!pase ? (
            <p className="py-3 text-body-sm text-outline">Esperando patente o pase de estacionamiento…</p>
          ) : (
            <>
              <div className="mt-1 flex items-center justify-between gap-2">
                {pase.patente && <PatenteMercosur patente={pase.patente} grande />}
                <div className="flex flex-col items-end text-right">
                  <span className="text-label-xs font-normal text-outline">Playa asignada:</span>
                  <span className="text-title-sm text-on-surface">{pase.playa}</span>
                  <span className={cx('mt-0.5 text-label-xs', pase.confirmado ? 'text-outline' : 'text-tertiary')}>{pase.confirmado ? '● Ingreso registrado' : '● Habilitado - abrir barrera'}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={pase.confirmado || validando}
                onClick={() => onConfirmar(pase)}
                className="mt-2 flex w-full items-center justify-center gap-space-xs rounded-lg bg-surface-container-high px-space-md py-2 text-label-md text-on-surface transition-all hover:bg-surface-variant disabled:opacity-50"
              >
                <Icono nombre="sensor_door" className="text-[18px] text-tertiary" /> {pase.confirmado ? 'Barrera abierta' : 'Registrar ingreso vehicular y abrir barrera'}
              </button>
            </>
          )}
        </div>
        <div className="flex flex-col gap-space-xs rounded bg-surface-container p-space-md">
          <div className="flex items-center justify-between">
            <span className="text-label-xs uppercase tracking-wider text-secondary">2. Voucher gastronómico</span>
            {voucher && <span className="font-mono text-label-xs text-on-surface-variant">#{voucher.codigo}</span>}
          </div>
          {!voucher ? (
            <p className="py-3 text-body-sm text-outline">Esperando voucher en la barra…</p>
          ) : (
            <>
              <div className="mt-1 flex items-center gap-space-sm">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-surface-container-high text-secondary">
                  <Icono nombre="fastfood" className="text-[28px]" />
                </div>
                <div className="flex flex-col">
                  {voucher.items.map((i) => (
                    <p key={i.nombre} className="text-title-sm leading-snug text-on-surface">
                      {i.cantidad}x {i.nombre}
                    </p>
                  ))}
                  <span className="text-body-sm text-on-surface-variant">
                    PIN seguro: <strong className="font-mono text-secondary">{voucher.pin}</strong> · {voucher.titular?.nombre}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={voucher.confirmado || validando}
                onClick={() => onConfirmar(voucher)}
                className="mt-2 flex w-full items-center justify-center gap-space-xs rounded-lg bg-secondary-container px-space-md py-2.5 text-label-md text-on-secondary shadow-md transition-all hover:bg-secondary disabled:opacity-50"
              >
                <Icono nombre="redeem" className="text-[18px]" /> {voucher.confirmado ? 'Voucher canjeado' : 'Marcar voucher como canjeado y entregar ítems'}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function TablaBitacora({ filas }: { filas: RegistroValidacion[] }) {
  if (!filas.length) return <p className="py-6 text-center text-body-sm text-outline">Sin validaciones registradas para este filtro.</p>;
  const estado = (v: RegistroValidacion) =>
    v.resultado === 'RECHAZADO'
      ? { texto: 'Rechazado', clase: 'bg-error-container/40 text-error', punto: 'bg-error' }
      : v.punto === 'ESTACIONAMIENTO'
        ? { texto: 'Barrera abierta', clase: 'bg-secondary-container/30 text-secondary', punto: 'bg-secondary' }
        : v.punto === 'BARRA'
          ? { texto: 'Canjeado', clase: 'bg-tertiary-container/30 text-tertiary', punto: 'bg-tertiary' }
          : { texto: 'Aprobado', clase: 'bg-tertiary-container/30 text-tertiary', punto: 'bg-tertiary' };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-surface-container-highest text-label-xs uppercase tracking-wider text-outline">
            <th className="px-space-sm py-2.5">Hora</th>
            <th className="px-space-sm py-2.5">Código</th>
            <th className="px-space-sm py-2.5">Tipo de control</th>
            <th className="px-space-sm py-2.5">Titular / vehículo</th>
            <th className="px-space-sm py-2.5">Ubicación / detalle</th>
            <th className="px-space-sm py-2.5 text-center">Estado</th>
            <th className="px-space-sm py-2.5 text-right">Latencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container text-body-sm">
          {filas.map((v) => {
            const e = estado(v);
            return (
              <tr key={v.id} className="transition-colors hover:bg-surface-container/60" title={v.motivo ?? undefined}>
                <td className="px-space-sm py-3 font-mono text-outline">{horaSegundos(v.fechaHora)}</td>
                <td className="px-space-sm py-3 font-mono font-bold text-on-surface">#{v.codigo}</td>
                <td className="px-space-sm py-3 text-on-surface-variant">{NOMBRE_PUNTO[v.punto]}</td>
                <td className="px-space-sm py-3 font-semibold text-on-surface">{v.titular ?? '—'}</td>
                <td className={cx('px-space-sm py-3', v.resultado === 'RECHAZADO' ? 'text-on-surface-variant' : 'text-secondary')}>{v.resultado === 'RECHAZADO' ? v.motivo : v.ubicacion}</td>
                <td className="px-space-sm py-3 text-center">
                  <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-xl px-space-xs py-0.5 text-label-xs uppercase', e.clase)}>
                    <span className={cx('h-1.5 w-1.5 rounded-full', e.punto)} /> {e.texto}
                    {v.offline && ' · offline'}
                  </span>
                </td>
                <td className="px-space-sm py-3 text-right font-mono text-tertiary">{(v.latenciaMs / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 })}s</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
