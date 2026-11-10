import { Navigate, Route, Routes, useLocation } from "react-router";
import { useAuth } from "./auth/AuthContext";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";

function PrivateHome() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    return (
      <Navigate
        to="/login"
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    );
  }
  return <HomePage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateHome />} />
      <Route
        path="*"
        element={
          <main className="grid min-h-screen place-items-center p-6 text-center">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">404</p>
              <h1 className="mt-3 text-3xl font-semibold">Esta sala no existe</h1>
              <a className="mt-5 inline-block underline" href="/">Volver al inicio</a>
            </div>
          </main>
        }
      />
    </Routes>
  );
}
