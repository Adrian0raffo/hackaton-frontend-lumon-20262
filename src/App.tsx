import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { useAuth } from "./auth/AuthContext";
import { FilesPage } from "./pages/FilesPage";
import { GridPage } from "./pages/GridPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { StatusPage } from "./pages/StatusPage";

function Private({ children, permission }: { children: ReactNode; permission?: string }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  if (permission && !session.user.permissions.includes(permission)) {
    return <main className="grid min-h-screen place-items-center bg-[#081b19] p-6 text-center text-emerald-100"><div><h1 className="text-2xl">Sin permiso</h1><p className="mt-2">Tu cuenta no puede abrir esta sala.</p><Link className="mt-4 inline-block text-emerald-300 underline" to="/files">Volver</Link></div></main>;
  }
  return children;
}

export function App() {
  const { restoring } = useAuth();
  if (restoring) return <main role="status" className="grid min-h-screen place-items-center bg-[#081b19] text-emerald-100">Restaurando sesión…</main>;
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Private><Navigate to="/files" replace /></Private>} />
      <Route path="/inicio" element={<Private><HomePage /></Private>} />
      <Route path="/files" element={<Private permission="files:read"><FilesPage /></Private>} />
      <Route path="/files/:id/refine" element={<Private permission="files:read"><GridPage /></Private>} />
      <Route path="/estado" element={<Private><StatusPage /></Private>} />
      <Route path="*" element={<main className="grid min-h-screen place-items-center bg-[#081b19] p-6 text-center text-emerald-100"><div><p className="text-sm uppercase tracking-[0.3em] text-emerald-400">404</p><h1 className="mt-3 text-3xl font-semibold">Esta sala no existe</h1><Link className="mt-5 inline-block text-emerald-300 underline" to="/files">Volver a archivos</Link></div></main>} />
    </Routes>
  );
}
