import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { User, Lock, AlertCircle } from 'lucide-react';
import podsLogo from '@/assets/pods-logo.png';

export function LoginPage() {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await login(credentials);
      navigate('/dashboard');
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-50">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center bg-purple-50">
        {/* Decorative circles */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-200/60 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-teal-200/40 rounded-full blur-3xl animate-pulse [animation-delay:2s]" />
        <div className="absolute top-2/3 left-1/3 w-64 h-64 bg-violet-200/50 rounded-full blur-3xl animate-pulse [animation-delay:4s]" />

        <div className="relative z-10 text-center px-12">
          <img src={podsLogo} alt="Pods" className="w-32 h-32 mx-auto mb-6 drop-shadow-lg" />
          <h1 className="text-4xl font-bold text-gray-800 mb-1">
            Hypernova<span className="text-purple-600">Labs</span>
          </h1>
          <p className="text-2xl font-light text-gray-500 mb-4">Pods</p>
          <p className="text-base text-gray-400">Orquestación de agentes AI</p>
        </div>
      </div>

      {/* Right panel - Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-6 sm:mb-8">
            <img src={podsLogo} alt="Pods" className="w-20 h-20 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-800">
              Hypernova<span className="text-purple-600">Labs</span>
            </h1>
            <p className="text-lg font-light text-gray-500">Pods</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="mb-6 sm:mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Iniciar Sesión</h2>
              <p className="text-sm text-gray-400 mt-1">Ingresa tus credenciales para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-gray-600">
                  Usuario
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={credentials.username}
                    onChange={handleInputChange}
                    required
                    placeholder="Ingresa tu usuario"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-gray-600">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={credentials.password}
                    onChange={handleInputChange}
                    required
                    placeholder="Ingresa tu contraseña"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-lg font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-400">
              ¿No tienes una cuenta?{' '}
              <Link
                to="/register"
                className="text-purple-600 hover:text-purple-700 font-medium transition-colors"
              >
                Regístrate
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
