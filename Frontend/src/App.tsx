import { lazy, type ReactNode, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RUTA_INICIO, useAuth } from './auth/AuthContext';
import { Cabecera } from './components/Cabecera';
import { Cargando, Vacio } from './components/ui';
import type { Rol } from './lib/tipos';
import Acceso from './pages/Acceso';
import Cartelera from './pages/comprador/Cartelera';

// Las vistas de cada rol se cargan bajo demanda (el lector QR solo lo baja el controlador)
const Comprar = lazy(() => import('./pages/comprador/Comprar'));
const MisCompras = lazy(() => import('./pages/comprador/MisCompras'));
const PanelOrganizador = lazy(() => import('./pages/organizador/PanelOrganizador'));
const EditorSala = lazy(() => import('./pages/admin/EditorSala'));
const ListaNegra = lazy(() => import('./pages/admin/ListaNegra'));
const Usuarios = lazy(() => import('./pages/admin/Usuarios'));
const ControlAcceso = lazy(() => import('./pages/control/ControlAcceso'));

/** Restringe una ruta a ciertos roles; sin sesión, manda al login y vuelve después. */
function Requiere({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { usuario, listo } = useAuth();
  const { pathname } = useLocation();
  if (!listo && !usuario) return <Cargando />;
  if (!usuario) return <Navigate to={`/login?volver=${encodeURIComponent(pathname)}`} replace />;
  if (!roles.includes(usuario.rol)) {
    return (
      <>
        <Cabecera />
        <main className="mx-auto max-w-xl p-8">
          <Vacio icono="lock" titulo="Esta sección no corresponde a tu rol">
            <Link className="text-secondary hover:underline" to={RUTA_INICIO[usuario.rol]}>
              Ir a mi inicio
            </Link>
          </Vacio>
        </main>
      </>
    );
  }
  return <>{children}</>;
}

function Inicio() {
  const { usuario } = useAuth();
  return <Navigate to={usuario ? RUTA_INICIO[usuario.rol] : '/cartelera'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Cargando />}>
      <Rutas />
    </Suspense>
  );
}

function Rutas() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/login" element={<Acceso modo="login" />} />
      <Route path="/registro" element={<Acceso modo="registro" />} />

      <Route path="/cartelera" element={<Cartelera />} />
      <Route path="/funciones/:id" element={<Comprar />} />
      <Route path="/mis-compras" element={<Requiere roles={['COMPRADOR']}><MisCompras /></Requiere>} />

      <Route path="/organizador" element={<Requiere roles={['ORGANIZADOR', 'ADMINISTRADOR']}><PanelOrganizador /></Requiere>} />
      <Route path="/organizador/funciones/:id" element={<Requiere roles={['ORGANIZADOR', 'ADMINISTRADOR']}><PanelOrganizador /></Requiere>} />

      <Route path="/admin/salas" element={<Requiere roles={['ADMINISTRADOR']}><EditorSala /></Requiere>} />
      <Route path="/admin/salas/:id" element={<Requiere roles={['ADMINISTRADOR']}><EditorSala /></Requiere>} />
      <Route path="/admin/lista-negra" element={<Requiere roles={['ADMINISTRADOR']}><ListaNegra /></Requiere>} />
      <Route path="/admin/usuarios" element={<Requiere roles={['ADMINISTRADOR']}><Usuarios /></Requiere>} />

      <Route path="/control" element={<Requiere roles={['CONTROLADOR', 'ADMINISTRADOR']}><ControlAcceso /></Requiere>} />

      <Route
        path="*"
        element={
          <>
            <Cabecera />
            <main className="mx-auto max-w-xl p-8">
              <Vacio icono="explore_off" titulo="Página no encontrada">
                <Link className="text-secondary hover:underline" to="/">
                  Volver al inicio
                </Link>
              </Vacio>
            </main>
          </>
        }
      />
    </Routes>
  );
}
