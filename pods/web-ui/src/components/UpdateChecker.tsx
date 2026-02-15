import { useEffect, useState } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

export function UpdateChecker() {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Check for updates 3 seconds after app loads
    const timer = setTimeout(async () => {
      if (checking) return;

      setChecking(true);

      try {
        console.log('Checking for updates...');
        const update = await check();

        if (update) {
          console.log(`Update available: ${update.currentVersion} -> ${update.version}`);

          // Build update message with release notes
          const releaseNotes = update.body || 'Sin notas de versión';
          const confirmMessage = `Nueva versión disponible: ${update.version}\n\nNotas de la versión:\n${releaseNotes}\n\n¿Desea descargar e instalar la actualización ahora?`;

          // Show confirmation dialog
          const confirmed = await ask(confirmMessage, {
            title: 'Actualización Disponible',
            kind: 'info',
            okLabel: 'Sí, actualizar',
            cancelLabel: 'Ahora no'
          });

          if (confirmed) {
            console.log('User confirmed update installation');

            try {
              // Stop sidecar services before installing to avoid locked files
              console.log('Stopping services before update...');
              await invoke('shutdown_services');
              console.log('Services stopped');

              // Small delay to ensure processes are fully terminated
              await new Promise(resolve => setTimeout(resolve, 1500));

              // Download and install the update
              console.log('Downloading update...');
              let downloaded = 0;
              let contentLength = 0;

              await update.downloadAndInstall((event) => {
                switch (event.event) {
                  case 'Started':
                    contentLength = event.data.contentLength!;
                    console.log(`Download started - Size: ${contentLength} bytes`);
                    break;
                  case 'Progress':
                    downloaded += event.data.chunkLength;
                    const percentage = (downloaded / contentLength) * 100;
                    console.log(`Downloaded: ${percentage.toFixed(2)}%`);
                    break;
                  case 'Finished':
                    console.log('Download finished');
                    break;
                }
              });

              console.log('Update downloaded successfully - restarting app...');

              // Show success message
              await message('La actualización se ha descargado. La aplicación se reiniciará para aplicar los cambios.', {
                title: 'Actualización Lista',
                kind: 'info'
              });

              // Relaunch the app to apply the update
              await relaunch();
            } catch (error) {
              console.error('Failed to download and install update:', error);

              await message(`No se pudo descargar la actualización: ${error}`, {
                title: 'Error de Actualización',
                kind: 'error'
              });
            }
          } else {
            console.log('User cancelled update');
          }
        } else {
          console.log('No updates available - you\'re on the latest version');
        }
      } catch (error) {
        console.warn('Failed to check for updates:', error);
      } finally {
        setChecking(false);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // This component doesn't render anything
  return null;
}
