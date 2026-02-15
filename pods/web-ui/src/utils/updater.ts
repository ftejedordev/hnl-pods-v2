import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Check for application updates
 * @param silent If true, won't show alert if already updated
 */
export async function checkForUpdates(silent = false) {
  try {
    console.log('🔍 Checking for updates...');

    const update = await check();

    if (update?.available) {
      console.log(`✨ New version available: ${update.version}`);
      console.log(`📝 Release notes:\n${update.body}`);

      const shouldUpdate = window.confirm(
        `🎉 New version ${update.version} available!\n\n` +
        `${update.body}\n\n` +
        `Would you like to download and install it now?`
      );

      if (shouldUpdate) {
        console.log('⬇️ Downloading update...');

        // Show a simple loading message
        const loadingMsg = document.createElement('div');
        loadingMsg.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 20px 40px;
          border-radius: 10px;
          z-index: 99999;
          font-family: system-ui;
        `;
        loadingMsg.textContent = 'Downloading update...';
        document.body.appendChild(loadingMsg);

        try {
          await update.downloadAndInstall();

          loadingMsg.textContent = 'Installation complete. Restarting...';

          console.log('✅ Installation complete. Restarting app...');

          // Wait a bit before restarting
          await new Promise(resolve => setTimeout(resolve, 1000));

          await relaunch();
        } catch (error) {
          document.body.removeChild(loadingMsg);
          throw error;
        }
      }
    } else {
      if (!silent) {
        alert('✅ You are using the latest version');
      }
      console.log('✅ App is up to date');
    }
  } catch (error) {
    console.error('❌ Error checking for updates:', error);

    if (!silent) {
      alert('Error checking for updates. Please try again later.');
    }
  }
}

/**
 * Check for updates on app startup (silent mode)
 */
export function checkForUpdatesOnStartup() {
  // Wait a bit after startup to not interfere with initialization
  setTimeout(() => {
    checkForUpdates(true);
  }, 5000); // Wait 5 seconds after app starts
}

/**
 * Setup periodic update checks
 * @param intervalHours How often to check (default: 6 hours)
 */
export function setupPeriodicUpdateChecks(intervalHours = 6) {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  setInterval(() => {
    checkForUpdates(true);
  }, intervalMs);
}
