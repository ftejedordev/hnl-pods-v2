import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { initializeApiBaseUrl } from '@/lib/api';

interface ServiceHealth {
  mongodb: boolean;
  backend: boolean;
  all_healthy: boolean;
}

interface StartupLoaderProps {
  onReady: () => void;
}

export default function StartupLoader({ onReady }: StartupLoaderProps) {
  const [status, setStatus] = useState('Iniciando servicios...');
  const [services, setServices] = useState<ServiceHealth>({
    mongodb: false,
    backend: false,
    all_healthy: false,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let checkInterval: NodeJS.Timeout;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max

    const checkServices = async () => {
      try {
        const health = await invoke<ServiceHealth>('check_services_health');
        setServices(health);

        if (health.mongodb && health.backend) {
          setStatus('Configurando conexión...');
          clearInterval(checkInterval);
          await initializeApiBaseUrl();
          setStatus('Todos los servicios listos');
          setTimeout(() => {
            onReady();
          }, 500);
        } else {
          // Update status based on what's running
          const statusParts = [];
          if (!health.mongodb) statusParts.push('MongoDB');
          if (!health.backend) statusParts.push('Backend');
          setStatus(`Esperando: ${statusParts.join(', ')}...`);
        }
      } catch (err) {
        console.error('Error checking services:', err);
        attempts++;
        if (attempts >= maxAttempts) {
          setError('Error: No se pudieron iniciar los servicios. Por favor, reinicia la aplicación.');
          clearInterval(checkInterval);
        }
      }
    };

    // Start checking immediately
    checkServices();

    // Check every second
    checkInterval = setInterval(checkServices, 1000);

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [onReady]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
      <div className="text-center p-8">
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-purple-500/20 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-purple-400 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>

          <h1 className="text-4xl font-bold text-white mb-2">
            HypernovaLabs Pods
          </h1>

          <p className="text-purple-300 text-lg mb-8">{status}</p>
        </div>

        {error ? (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-red-400">{error}</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-md mx-auto">
            <ServiceStatus
              name="MongoDB"
              isReady={services.mongodb}
            />
            <ServiceStatus
              name="Backend API"
              isReady={services.backend}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface ServiceStatusProps {
  name: string;
  isReady: boolean;
}

function ServiceStatus({ name, isReady }: ServiceStatusProps) {
  return (
    <div className="flex items-center justify-between bg-white/5 backdrop-blur-sm rounded-lg px-4 py-3 border border-white/10">
      <span className="text-white font-medium">{name}</span>
      <div className="flex items-center gap-2">
        {isReady ? (
          <>
            <span className="text-green-400 text-sm">Listo</span>
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          </>
        ) : (
          <>
            <span className="text-yellow-400 text-sm">Iniciando...</span>
            <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
          </>
        )}
      </div>
    </div>
  );
}
