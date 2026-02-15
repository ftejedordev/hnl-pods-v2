import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import { PrivateRoute } from '@/components/Auth/PrivateRoute';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { LoginPage } from '@/pages/Auth/LoginPage';
import { RegisterPage } from '@/pages/Auth/RegisterPage';
import { AgentsPage } from '@/pages/Dashboard/AgentsPage';
import { McpManagementPage } from '@/pages/Dashboard/McpManagementPage';
import { DocumentsPage } from '@/pages/Dashboard/DocumentsPage';
import { FlowsPage } from '@/pages/Dashboard/FlowsPage';
import { FlowBuilderPage } from '@/pages/Dashboard/FlowBuilderPage';
import { LLMsPage } from '@/pages/Dashboard/LLMsPage';
import StartupLoader from '@/components/StartupLoader';
import { SystemDependenciesCheck } from '@/components/SystemDependenciesCheck';
import { checkForUpdatesOnStartup, setupPeriodicUpdateChecks } from '@/utils/updater';

// Componente para escuchar eventos de autenticación
function AuthEventListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleUnauthorized = () => {
      // Navegar al login sin recargar la página
      navigate('/login', { replace: true });
    };

    // Escuchar evento de autenticación no autorizada
    window.addEventListener('auth:unauthorized', handleUnauthorized);

    // Cleanup: remover listener al desmontar
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [navigate]);

  return null; // Este componente no renderiza nada
}

function App() {
  const [dependenciesChecked, setDependenciesChecked] = useState(false);
  const [servicesReady, setServicesReady] = useState(false);

  // Check for updates on startup and setup periodic checks
  useEffect(() => {
    if (servicesReady) {
      // Check for updates 5 seconds after services are ready
      checkForUpdatesOnStartup();

      // Setup periodic checks every 6 hours
      setupPeriodicUpdateChecks(6);
    }
  }, [servicesReady]);

  // Step 1: Check system dependencies (Node.js, NPX, UV)
  if (!dependenciesChecked) {
    return (
      <ThemeProvider>
        <SystemDependenciesCheck onSuccess={() => setDependenciesChecked(true)} />
      </ThemeProvider>
    );
  }

  // Step 2: Show startup loader until all services are ready
  if (!servicesReady) {
    return (
      <ThemeProvider>
        <StartupLoader onReady={() => setServicesReady(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          {/* Listener de eventos de autenticación */}
          <AuthEventListener />

          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Flow Builder - Full Screen Routes */}
            <Route path="/flows/new" element={
              <PrivateRoute>
                <FlowBuilderPage />
              </PrivateRoute>
            } />
            <Route path="/flows/edit/:flowId" element={
              <PrivateRoute>
                <FlowBuilderPage />
              </PrivateRoute>
            } />

            {/* Protected routes */}
            <Route path="/dashboard/*" element={
              <PrivateRoute>
                <DashboardLayout>
                  <Routes>
                    <Route path="agents" element={<AgentsPage />} />
                    <Route path="mcp" element={<McpManagementPage />} />
                    <Route path="documents" element={<DocumentsPage />} />
                    <Route path="flows" element={<FlowsPage />} />
                    <Route path="llms" element={<LLMsPage />} />
                    <Route path="" element={<Navigate to="agents" replace />} />
                  </Routes>
                </DashboardLayout>
              </PrivateRoute>
            } />

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
        <Toaster />
      </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
