import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/lib/api';

const LICENSE_CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

interface LicenseGuardProps {
  children: React.ReactNode;
}

export function LicenseGuard({ children }: LicenseGuardProps) {
  const { isAuthenticated } = useAuth();
  const [licenseActive, setLicenseActive] = useState<boolean | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkLicense = useCallback(async () => {
    try {
      const { active } = await authApi.checkLicense();
      setLicenseActive(active);
    } catch {
      // Fail-closed: network error or backend unreachable → block
      setLicenseActive(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      // Reset state when not authenticated so it re-checks on next login
      setLicenseActive(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial check
    checkLicense();

    // Periodic check every 2 minutes
    intervalRef.current = setInterval(checkLicense, LICENSE_CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, checkLicense]);

  // Not authenticated → don't guard (public routes pass through)
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Still loading initial check
  if (licenseActive === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // License inactive → block
  if (!licenseActive) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 text-center px-8 max-w-md">
          <div className="text-8xl" role="img" aria-label="sad face">
            😞
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            No tienes licencia o suscripción
          </h1>
          <p className="text-muted-foreground">
            Contacta al administrador para activar tu cuenta
          </p>
        </div>
      </div>
    );
  }

  // License active → render app
  return <>{children}</>;
}
