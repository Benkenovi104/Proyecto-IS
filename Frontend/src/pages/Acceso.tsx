// Iniciar sesión y Registrarse (compradores).
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { RUTA_INICIO, useAuth } from '../auth/AuthContext';
import { Cabecera } from '../components/Cabecera';
import { useToast } from '../components/Toast';
import { Aviso, Boton, Campo, Icono } from '../components/ui';
import { mensajeError } from '../lib/api';
import { NOMBRE_ROL } from '../lib/formato';
import type { Rol, Usuario } from '../lib/tipos';

const DEMOS: { rol: Rol; icono: string; detalle: string }[] = [
  { rol: 'ADMINISTRADOR', icono: 'admin_panel_settings', detalle: 'Salas, mapa, playas, lista negra' },
  { rol: 'ORGANIZADOR', icono: 'calendar_month', detalle: 'Funciones, tarifas, preventa, métricas' },
  { rol: 'COMPRADOR', icono: 'shopping_bag', detalle: 'Lucas Benítez · compra, QR, transferencias' },
  { rol: 'CONTROLADOR', icono: 'qr_code_scanner', detalle: 'Escaneo en puerta, playa y barra' },
];

export default function Acceso({ modo }: { modo: 'login' | 'registro' }) {
  const { iniciarSesion, registrar, ingresarDemo, demoHabilitado } = useAuth();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const [form, setForm] = useState({ nombre: '', dni: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const continuar = (u: Usuario) => {
    toast(`Hola, ${u.nombre.split(' ')[0]}`);
    navegar(params.get('volver') ?? RUTA_INICIO[u.rol], { replace: true });
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      continuar(modo === 'login' ? await iniciarSesion(form.email, form.password) : await registrar(form));
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const demo = async (rol: Rol) => {
    try {
      const u = await ingresarDemo(rol);
      navegar(rol === 'COMPRADOR' && params.get('volver') ? params.get('volver')! : RUTA_INICIO[u.rol], { replace: true });
    } catch (err) {
      setError(mensajeError(err));
    }
  };

  const campo = (k: keyof typeof form) => ({ value: form[k], onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <>
      <Cabecera />
      <main className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-8 p-4 md:grid-cols-2 md:p-8">
        <div className="pointer-events-none absolute left-1/4 top-1/4 h-72 w-72 rounded-full bg-primary-container/20 blur-3xl" />
        <form onSubmit={enviar} className="relative space-y-4 rounded-xl border border-nv-line bg-nv-card p-6 shadow-z2">
          <div>
            <h1 className="text-headline-lg text-white">{modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta de comprador'}</h1>
            <p className="text-body-sm text-on-surface-variant">
              {modo === 'login' ? 'Accedé con tu email y contraseña.' : 'Necesitás una cuenta para comprar entradas y recibir transferencias.'}
            </p>
          </div>
          {error && <Aviso tono="peligro">{error}</Aviso>}
          {modo === 'registro' && (
            <>
              <Campo etiqueta="Nombre y apellido">
                <input className="campo" required autoComplete="name" {...campo('nombre')} />
              </Campo>
              <Campo etiqueta="DNI" ayuda="Se verifica contra el registro de derecho de admisión.">
                <input className="campo-mono" required inputMode="numeric" {...campo('dni')} />
              </Campo>
            </>
          )}
          <Campo etiqueta="Email">
            <input className="campo" type="email" required autoComplete="email" {...campo('email')} />
          </Campo>
          <Campo etiqueta="Contraseña" ayuda={modo === 'registro' ? 'Mínimo 6 caracteres.' : undefined}>
            <input className="campo" type="password" required autoComplete={modo === 'login' ? 'current-password' : 'new-password'} {...campo('password')} />
          </Campo>
          <Boton type="submit" variante="primario" className="w-full py-2.5" cargando={enviando} icono={modo === 'login' ? 'login' : 'person_add'}>
            {modo === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </Boton>
          <p className="text-center text-body-sm text-on-surface-variant">
            {modo === 'login' ? (
              <>
                ¿No tenés cuenta?{' '}
                <Link className="text-secondary hover:underline" to={`/registro${params.get('volver') ? `?volver=${params.get('volver')}` : ''}`}>
                  Registrate
                </Link>
              </>
            ) : (
              <>
                ¿Ya tenés cuenta?{' '}
                <Link className="text-secondary hover:underline" to="/login">
                  Iniciá sesión
                </Link>
              </>
            )}
          </p>
        </form>

        {demoHabilitado && (
          <section className="relative space-y-3">
            <h2 className="flex items-center gap-2 text-title-sm text-on-surface">
              <Icono nombre="bolt" className="text-tertiary" /> Acceso rápido de demostración
            </h2>
            <p className="text-body-sm text-on-surface-variant">Cuentas cargadas por el seed. También podés cambiar de rol desde la cabecera.</p>
            {DEMOS.map((d, i) => (
              <button
                key={d.rol}
                type="button"
                onClick={() => demo(d.rol)}
                className="flex w-full items-center gap-4 rounded-xl border border-nv-line bg-surface-container p-4 text-left transition hover:border-primary-container/60 hover:bg-nv-raised"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/20 text-primary">
                  <Icono nombre={d.icono} />
                </span>
                <span className="flex-1">
                  <span className="block text-label-md text-white">
                    {i + 1}. {NOMBRE_ROL[d.rol]}
                  </span>
                  <span className="block text-body-sm text-on-surface-variant">{d.detalle}</span>
                </span>
                <Icono nombre="arrow_forward" className="text-outline" />
              </button>
            ))}
          </section>
        )}
      </main>
    </>
  );
}
