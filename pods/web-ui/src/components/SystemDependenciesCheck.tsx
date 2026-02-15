import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface Dependency {
  path?: string;
  version?: string;
  available: boolean;
  optional?: boolean;
  error?: string;
}

interface DependenciesStatus {
  node: Dependency | null;
  npx: Dependency | null;
  uv: Dependency | null;
  all_ok: boolean;
  missing: string[];
  path_env?: string;
}

interface SystemDependenciesCheckProps {
  onSuccess: () => void;
}

export function SystemDependenciesCheck({ onSuccess }: SystemDependenciesCheckProps) {
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [dependencies, setDependencies] = useState<DependenciesStatus | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Wait 3 seconds before first check to allow Rust validation and backend startup
    const initialDelay = retryCount === 0 ? 3000 : 2000;
    const timer = setTimeout(() => {
      checkDependencies();
    }, initialDelay);
    return () => clearTimeout(timer);
  }, [retryCount]);

  const checkDependencies = async () => {
    try {
      // Get system dependencies from Rust via Tauri IPC
      const rustDeps = await invoke<{
        node_bin_dir: string | null;
        npx_bin_dir: string | null;
        uv_bin_dir: string | null;
        node_version: string | null;
        npx_version: string | null;
        uv_version: string | null;
      }>('get_system_dependencies');

      console.log('Got dependencies from Rust:', rustDeps);

      // Transform Rust data to React component format
      const deps: DependenciesStatus = {
        node: rustDeps.node_version ? {
          path: rustDeps.node_bin_dir || 'Unknown',
          version: rustDeps.node_version,
          available: true
        } : null,
        npx: rustDeps.npx_version ? {
          path: rustDeps.npx_bin_dir || 'Unknown',
          version: rustDeps.npx_version,
          available: true
        } : null,
        uv: rustDeps.uv_version ? {
          path: rustDeps.uv_bin_dir || 'Unknown',
          version: rustDeps.uv_version,
          available: true,
          optional: true
        } : {
          available: false,
          optional: true
        },
        all_ok: !!(rustDeps.node_version && rustDeps.npx_version),
        missing: []
      };

      if (!rustDeps.node_version) deps.missing.push('Node.js');
      if (!rustDeps.npx_version) deps.missing.push('NPX');

      setDependencies(deps);

      if (deps.all_ok) {
        setStatus('success');
        setTimeout(() => onSuccess(), 1000);
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Failed to get dependencies from Rust:', error);

      // If we can't get dependencies, retry a few times
      if (retryCount < 10) {
        setTimeout(() => setRetryCount(retryCount + 1), 2000);
      } else {
        setStatus('error');
        setDependencies({
          node: null,
          npx: null,
          uv: null,
          all_ok: false,
          missing: ['No se pudo obtener información de dependencias'],
        });
      }
    }
  };

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-purple-300 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-white mb-2">
            Verificando Dependencias del Sistema
          </h2>
          <p className="text-purple-200">
            Comprobando Node.js, NPX y UV...
          </p>
          {retryCount > 0 && (
            <p className="text-purple-300 text-sm mt-2">
              Esperando servicios... ({retryCount}/10)
            </p>
          )}
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-900 via-green-800 to-emerald-900">
        <div className="text-center">
          <CheckCircle2 className="w-16 h-16 text-green-300 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-white mb-2">
            ✅ Dependencias Verificadas
          </h2>
          <p className="text-green-200">
            Todas las dependencias del sistema están disponibles
          </p>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-900 via-red-800 to-rose-900 p-6">
      <div className="max-w-2xl w-full bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20">
        <div className="text-center mb-6">
          <AlertCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-white mb-2">
            ⚠️ Dependencias del Sistema Requeridas
          </h2>
          <p className="text-red-100">
            HypernovaLabs Pods requiere las siguientes herramientas instaladas en tu sistema
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {/* Node.js Status */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex items-start gap-3">
              {dependencies?.node?.available ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-white">Node.js</h3>
                {dependencies?.node?.available ? (
                  <>
                    <p className="text-sm text-green-200">
                      ✓ Instalado: {dependencies.node.version}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {dependencies.node.path}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-red-200">
                    ✗ No encontrado - Requerido para ejecutar MCP servers
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* NPX Status */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex items-start gap-3">
              {dependencies?.npx?.available ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-white">NPX</h3>
                {dependencies?.npx?.available ? (
                  <>
                    <p className="text-sm text-green-200">
                      ✓ Instalado: {dependencies.npx.version}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {dependencies.npx.path}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-red-200">
                    ✗ No encontrado - Viene incluido con Node.js
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* UV Status (Optional) */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex items-start gap-3">
              {dependencies?.uv?.available ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-white">
                  UV <span className="text-xs text-gray-400">(Opcional)</span>
                </h3>
                {dependencies?.uv?.available ? (
                  <>
                    <p className="text-sm text-green-200">
                      ✓ Instalado: {dependencies.uv.version}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {dependencies.uv.path}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-yellow-200">
                    ⚠ No encontrado - Opcional para MCP servers basados en Python
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-white mb-2">Pasos para instalar:</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-red-100">
            <li>
              Visita{' '}
              <a
                href="https://nodejs.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-200 hover:text-white underline inline-flex items-center gap-1"
              >
                nodejs.org
                <ExternalLink className="w-3 h-3" />
              </a>{' '}
              y descarga el instalador LTS
            </li>
            <li>Ejecuta el instalador y sigue las instrucciones</li>
            <li>
              (Opcional) Para UV, visita{' '}
              <a
                href="https://docs.astral.sh/uv/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-200 hover:text-white underline inline-flex items-center gap-1"
              >
                astral.sh/uv
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>Reinicia HypernovaLabs Pods</li>
          </ol>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setRetryCount(retryCount + 1)}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
          >
            Reintentar Verificación
          </button>
          <a
            href="https://nodejs.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-lg transition-colors text-center border border-white/20"
          >
            Descargar Node.js
          </a>
        </div>

        {/* Debug info (collapsible) */}
        {dependencies?.path_env && (
          <details className="mt-6 text-xs">
            <summary className="text-gray-400 cursor-pointer hover:text-gray-300">
              Información de Debug
            </summary>
            <pre className="mt-2 p-3 bg-black/30 rounded text-gray-300 overflow-x-auto text-[10px]">
              PATH: {dependencies.path_env}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
