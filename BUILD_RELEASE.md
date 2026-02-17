# Build & Release - HypernovaLabs Pods

Guia completa para compilar y distribuir la app en Windows y macOS.

## Arquitectura del proyecto

```
pods/
├── rust-backend/          # Backend API (Rust/Axum) → sidecar "pods-backend"
├── cli/                   # CLI tool (Go)           → sidecar "pod"
├── web-ui/                # Frontend (React/Vite)   → app Tauri
│   ├── src/               # React source
│   ├── src-tauri/         # Tauri shell (Rust)
│   │   ├── src/
│   │   │   ├── lib.rs              # Setup, puertos dinamicos, commands
│   │   │   ├── database_manager.rs # Manejo de mongod sidecar
│   │   │   └── backend_manager.rs  # Manejo de pods-backend sidecar
│   │   ├── binaries/               # ⬇ Sidecars pre-compilados
│   │   │   ├── pods-backend-{TARGET_TRIPLE}[.exe]
│   │   │   ├── mongod-{TARGET_TRIPLE}[.exe]
│   │   │   ├── pod-{TARGET_TRIPLE}[.exe]
│   │   │   └── chromium/           # Chromium embebido para Playwright
│   │   │       ├── chrome-win/     #   Windows
│   │   │       └── chrome-mac/     #   macOS
│   │   ├── icons/                  # Iconos de la app
│   │   ├── windows/hooks.nsh       # NSIS hooks (solo Windows)
│   │   ├── Entitlements.plist      # Permisos macOS
│   │   └── tauri.conf.json         # Config de Tauri
│   └── .env                        # Variables para dev mode
```

## Target triples por plataforma

Tauri usa el target triple del sistema para encontrar los sidecars:

| Plataforma | Target triple | Ext |
|------------|---------------|-----|
| Windows x64 | `x86_64-pc-windows-msvc` | `.exe` |
| macOS Intel | `x86_64-apple-darwin` | (ninguna) |
| macOS Apple Silicon | `aarch64-apple-darwin` | (ninguna) |

Ejemplo: el backend en Windows se llama `pods-backend-x86_64-pc-windows-msvc.exe`, en Mac ARM es `pods-backend-aarch64-apple-darwin`.

Para saber tu target triple:
```bash
rustc -vV | grep host
```

---

## Parte 1: Build en Windows

### 1.1 Requisitos previos

| Herramienta | Instalacion | Verificar |
|-------------|-------------|-----------|
| Rust toolchain | [rustup.rs](https://rustup.rs) | `rustc --version` |
| Node.js + npm | [nodejs.org](https://nodejs.org) (LTS) | `node --version` |
| Go | [go.dev/dl](https://go.dev/dl/) | `go version` |
| Tauri CLI | `npm install -g @tauri-apps/cli` | `npx tauri --version` |
| Visual Studio Build Tools | [visualstudio.microsoft.com](https://visualstudio.microsoft.com/visual-cpp-build-tools/) con "Desktop C++" | `cl` en Developer Command Prompt |

Clave de firma Tauri en `~/.tauri/hnl-pods-v2.key`. Si no existe:
```bash
npx tauri signer generate -w ~/.tauri/hnl-pods-v2.key
```

> **Nota sobre env vars de firma:** Tauri v2.8+ usa `TAURI_SIGNING_PRIVATE_KEY`. Versiones anteriores usaban `TAURI_PRIVATE_KEY`. El comando `tauri signer sign` todavia acepta `TAURI_PRIVATE_KEY`.

### 1.2 Actualizar la version

Editar `pods/web-ui/src-tauri/tauri.conf.json`:
```json
"version": "X.Y.Z",
```

### 1.3 Compilar el backend Rust

```bash
cd pods/rust-backend
cargo build --release
```

Copiar el binario al directorio de sidecars:
```bash
cp target/release/pods-backend.exe ../web-ui/src-tauri/binaries/pods-backend-x86_64-pc-windows-msvc.exe
```

> El backend usa `rustls-tls` en todas las dependencias (mongodb, reqwest), no requiere OpenSSL.

### 1.4 Compilar el CLI (Go)

```bash
cd pods/cli
go build -ldflags "-X main.version=X.Y.Z" -o ../web-ui/src-tauri/binaries/pod-x86_64-pc-windows-msvc.exe ./main.go
```

O usando el Makefile:
```bash
cd pods/cli
make build
cp build/pod ../web-ui/src-tauri/binaries/pod-x86_64-pc-windows-msvc.exe
```

### 1.5 MongoDB (mongod)

Descargar MongoDB Community Server desde [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community):
- Version: 8.0 (o la mas reciente estable)
- Platform: **Windows x64**
- Package: **zip** (no el MSI installer)

Extraer y copiar:
```bash
cp mongod.exe pods/web-ui/src-tauri/binaries/mongod-x86_64-pc-windows-msvc.exe
```

### 1.6 Chromium (para Playwright)

El directorio `binaries/chromium/chrome-win/` debe contener un Chromium funcional. Puedes obtenerlo de:

1. **Playwright** (recomendado):
   ```bash
   npx playwright install chromium
   # Los binarios quedan en %LOCALAPPDATA%/ms-playwright/
   # Copiar la carpeta chrome-win/ a binaries/chromium/
   ```

2. **Chromium snapshots**: [chromium.woolyss.com](https://chromium.woolyss.com)

Estructura esperada:
```
binaries/chromium/chrome-win/
├── chrome.exe
├── chrome.dll
├── icudtl.dat
├── locales/
└── ... (todos los archivos del zip)
```

### 1.7 Verificar binarios

Antes de compilar Tauri, verificar que todos los sidecars existan:
```bash
ls pods/web-ui/src-tauri/binaries/
# Debe mostrar:
#   pods-backend-x86_64-pc-windows-msvc.exe
#   mongod-x86_64-pc-windows-msvc.exe
#   pod-x86_64-pc-windows-msvc.exe
#   chromium/chrome-win/chrome.exe
```

### 1.8 Build de Tauri

```bash
cd pods/web-ui
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/hnl-pods-v2.key) TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run tauri:build
```

> **IMPORTANTE:** La variable de entorno es `TAURI_PRIVATE_KEY`, NO `TAURI_SIGNING_PRIVATE_KEY`.

Esto ejecuta automaticamente:
1. `npm run build` → compila el frontend React (Vite)
2. `cargo build --release` → compila el shell Tauri (src-tauri)
3. Empaqueta todo en un instalador NSIS

Archivos generados:
```
src-tauri/target/release/bundle/nsis/
├── HypernovaLabs Pods_X.Y.Z_x64-setup.exe        # Instalador
├── HypernovaLabs Pods_X.Y.Z_x64-setup.nsis.zip   # Zip para auto-updater
└── HypernovaLabs Pods_X.Y.Z_x64-setup.nsis.zip.sig  # Firma
```

### 1.9 Firmar (si no se genero .sig)

```bash
cd pods/web-ui
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/hnl-pods-v2.key) TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  npx tauri signer sign "src-tauri/target/release/bundle/nsis/HypernovaLabs Pods_X.Y.Z_x64-setup.nsis.zip"
```

### 1.10 Crear latest.json

```json
{
  "version": "X.Y.Z",
  "notes": "- Cambio 1\n- Cambio 2",
  "pub_date": "2026-MM-DDTHH:MM:SSZ",
  "platforms": {
    "windows-x86_64": {
      "signature": "<FIRMA_DEL_ARCHIVO_SIG>",
      "url": "https://github.com/ftejedordev/hnl-pods-v2/releases/download/vX.Y.Z/HypernovaLabs.Pods_X.Y.Z_x64-setup.nsis.zip"
    }
  }
}
```

> En la URL, los espacios se reemplazan por puntos: `HypernovaLabs.Pods` (no `HypernovaLabs Pods`).

### 1.11 Subir release a GitHub

1. Ir a https://github.com/ftejedordev/hnl-pods-v2/releases/new
2. Tag: `vX.Y.Z`
3. Titulo: `vX.Y.Z`
4. Subir archivos:
   - `HypernovaLabs Pods_X.Y.Z_x64-setup.exe` (instalador directo)
   - `HypernovaLabs Pods_X.Y.Z_x64-setup.nsis.zip` (para auto-updater)
   - `latest.json` (manifiesto del updater)
5. Publicar release

---

## Parte 2: Build en macOS

### 2.1 Requisitos previos

| Herramienta | Instalacion | Verificar |
|-------------|-------------|-----------|
| Xcode Command Line Tools | `xcode-select --install` | `cc --version` |
| Rust toolchain | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` | `rustc --version` |
| Node.js + npm | `brew install node` o [nodejs.org](https://nodejs.org) | `node --version` |
| Go | `brew install go` o [go.dev/dl](https://go.dev/dl/) | `go version` |
| Tauri CLI | `npm install -g @tauri-apps/cli` | `npx tauri --version` |

Determinar tu target triple:
```bash
rustc -vV | grep host
# Apple Silicon (M1/M2/M3/M4): aarch64-apple-darwin
# Intel Mac:                     x86_64-apple-darwin
```

En el resto de esta seccion usamos `{TRIPLE}` como placeholder. Reemplazar con tu valor real.

Clave de firma (misma que Windows, copiar del equipo Windows):
```bash
mkdir -p ~/.tauri
# Copiar hnl-pods-v2.key desde el equipo Windows
```

### 2.2 Actualizar version

Igual que Windows — editar `pods/web-ui/src-tauri/tauri.conf.json`.

### 2.3 Compilar el backend Rust

```bash
cd pods/rust-backend
cargo build --release
cp target/release/pods-backend ../web-ui/src-tauri/binaries/pods-backend-{TRIPLE}
```

Ejemplo Apple Silicon:
```bash
cp target/release/pods-backend ../web-ui/src-tauri/binaries/pods-backend-aarch64-apple-darwin
```

> Sin extension `.exe` en macOS.

### 2.4 Compilar el CLI (Go)

```bash
cd pods/cli
go build -ldflags "-X main.version=X.Y.Z" -o ../web-ui/src-tauri/binaries/pod-{TRIPLE} ./main.go
```

Ejemplo Apple Silicon:
```bash
go build -ldflags "-X main.version=X.Y.Z" -o ../web-ui/src-tauri/binaries/pod-aarch64-apple-darwin ./main.go
```

### 2.5 MongoDB (mongod)

Descargar desde [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community):
- Version: 8.0 (o la mas reciente estable)
- Platform: **macOS arm64** (Apple Silicon) o **macOS x64** (Intel)
- Package: **tgz**

```bash
tar xzf mongodb-macos-*.tgz
cp mongodb-macos-*/bin/mongod pods/web-ui/src-tauri/binaries/mongod-{TRIPLE}
```

Ejemplo Apple Silicon:
```bash
cp mongodb-macos-aarch64-8.0.*/bin/mongod pods/web-ui/src-tauri/binaries/mongod-aarch64-apple-darwin
```

### 2.6 Chromium (para Playwright)

```bash
npx playwright install chromium
```

Buscar los binarios instalados:
```bash
ls ~/Library/Caches/ms-playwright/
```

Copiar la carpeta de Chromium al proyecto:
```bash
# La estructura exacta puede variar segun version de Playwright
cp -R ~/Library/Caches/ms-playwright/chromium-*/chrome-mac \
  pods/web-ui/src-tauri/binaries/chromium/chrome-mac
```

Estructura esperada:
```
binaries/chromium/chrome-mac/
└── Chromium.app/
    └── Contents/
        └── MacOS/
            └── Chromium
```

> El path que usa `backend_manager.rs` es exactamente `chrome-mac/Chromium.app/Contents/MacOS/Chromium`.

### 2.7 Verificar binarios

```bash
ls pods/web-ui/src-tauri/binaries/
# Debe mostrar (ejemplo Apple Silicon):
#   pods-backend-aarch64-apple-darwin
#   mongod-aarch64-apple-darwin
#   pod-aarch64-apple-darwin
#   chromium/chrome-mac/Chromium.app/Contents/MacOS/Chromium

# Verificar que son ejecutables:
file pods/web-ui/src-tauri/binaries/pods-backend-aarch64-apple-darwin
# Debe decir: Mach-O 64-bit executable arm64

# Verificar permisos de ejecucion:
chmod +x pods/web-ui/src-tauri/binaries/pods-backend-aarch64-apple-darwin
chmod +x pods/web-ui/src-tauri/binaries/mongod-aarch64-apple-darwin
chmod +x pods/web-ui/src-tauri/binaries/pod-aarch64-apple-darwin
```

### 2.8 Build de Tauri

```bash
cd pods/web-ui
npm install
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/hnl-pods-v2.key) TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run tauri:build
```

Archivos generados:
```
src-tauri/target/release/bundle/
├── dmg/
│   └── HypernovaLabs Pods_X.Y.Z_aarch64.dmg    # Instalador DMG
└── macos/
    └── HypernovaLabs Pods.app/                    # App bundle
```

### 2.9 Firma y notarizacion (para distribucion)

**Sin firma (uso interno/dev):** funciona pero los usuarios veran el aviso de "desarrollador no identificado". Para abrirla: System Settings > Privacy & Security > "Open Anyway".

**Con firma (distribucion publica):** requiere Apple Developer Program ($99/ano).

```bash
# 1. Configurar identidad de firma en tauri.conf.json:
# En "bundle" > "macOS":
#   "signingIdentity": "Developer ID Application: Tu Nombre (TEAM_ID)"

# 2. Build firmado (Tauri firma automaticamente si la identidad esta configurada)
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/hnl-pods-v2.key) TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run tauri:build

# 3. Notarizar (para que Gatekeeper no bloquee):
xcrun notarytool submit "src-tauri/target/release/bundle/dmg/HypernovaLabs Pods_X.Y.Z_aarch64.dmg" \
  --apple-id "tu@email.com" \
  --team-id "TEAM_ID" \
  --password "app-specific-password" \
  --wait
```

### 2.10 Crear latest.json (multi-plataforma)

Si se distribuye para ambas plataformas, el `latest.json` incluye ambas:

```json
{
  "version": "X.Y.Z",
  "notes": "- Cambio 1\n- Cambio 2",
  "pub_date": "2026-MM-DDTHH:MM:SSZ",
  "platforms": {
    "windows-x86_64": {
      "signature": "<FIRMA_WINDOWS>",
      "url": "https://github.com/ftejedordev/hnl-pods-v2/releases/download/vX.Y.Z/HypernovaLabs.Pods_X.Y.Z_x64-setup.nsis.zip"
    },
    "darwin-aarch64": {
      "signature": "<FIRMA_MACOS_ARM>",
      "url": "https://github.com/ftejedordev/hnl-pods-v2/releases/download/vX.Y.Z/HypernovaLabs.Pods_X.Y.Z_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<FIRMA_MACOS_INTEL>",
      "url": "https://github.com/ftejedordev/hnl-pods-v2/releases/download/vX.Y.Z/HypernovaLabs.Pods_X.Y.Z_x64.app.tar.gz"
    }
  }
}
```

---

## Parte 3: Modo desarrollo

### Dev con servicios embebidos (completo)

```bash
cd pods/web-ui
npm install
npm run tauri:dev
```

Tauri levanta MongoDB + Backend con puertos dinamicos automaticamente.

### Dev con servicios externos (mas rapido)

Levantar MongoDB y Backend por separado, sin recompilar sidecars cada vez:

Terminal 1 — MongoDB:
```bash
mongod --dbpath ./data/db --port 27017
```

Terminal 2 — Backend:
```bash
cd pods/rust-backend
PORT=8000 DB_URI_MONGO=mongodb://localhost:27017/hypernova_pods cargo run
```

Terminal 3 — Tauri (sin sidecars embebidos):
```bash
cd pods/web-ui
npm run tauri:dev:external
# Equivale a: SKIP_EMBEDDED_SERVICES=true tauri dev
```

### Dev solo frontend (sin Tauri)

```bash
cd pods/web-ui
npm run dev
# Abre http://localhost:5173
# Usa los valores de .env (VITE_MCP_SERVER_URL=http://localhost:8000)
```

---

## Parte 4: Puertos dinamicos

Desde v1.0.3, la app usa puertos dinamicos en lugar de hardcodear 27017/8000.

### Como funciona

1. **Tauri setup** busca 2 puertos libres con `bind("127.0.0.1:0")`
2. MongoDB inicia en `mongo_port` (ej: 49152)
3. Backend inicia en `backend_port` (ej: 49153) con `DB_URI_MONGO=mongodb://localhost:49152/...`
4. Frontend llama `invoke('get_backend_port')` para saber a que puerto conectarse
5. `mcp_api.defaults.baseURL` se configura dinamicamente

### Archivos involucrados

| Archivo | Rol |
|---------|-----|
| `src-tauri/src/lib.rs` | `find_free_port()`, `AppState.backend_port/mongo_port`, comando `get_backend_port` |
| `src-tauri/src/database_manager.rs` | Recibe `port` en `start_mongodb()`, health check dinamico |
| `src-tauri/src/backend_manager.rs` | Recibe `backend_port` + `mongo_port`, configura env vars |
| `rust-backend/src/main.rs` | Lee `PORT` del env, bind dinamico |
| `web-ui/src/lib/api.ts` | `initializeApiBaseUrl()` llama a Tauri para obtener puerto |
| `web-ui/src/components/StartupLoader.tsx` | Llama `initializeApiBaseUrl()` despues del health check |

### Modo dev externo

Con `SKIP_EMBEDDED_SERVICES=true`, se usan los puertos default (27017/8000). No se buscan puertos libres.

---

## Referencia rapida

| Accion | Comando |
|--------|---------|
| Build backend | `cd pods/rust-backend && cargo build --release` |
| Build CLI | `cd pods/cli && go build -o pod ./main.go` |
| Build Tauri (Windows) | `TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/hnl-pods-v2.key) TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run tauri:build` |
| Build Tauri (macOS) | Mismo comando, genera `.dmg` en vez de `.exe` |
| Dev completo | `npm run tauri:dev` |
| Dev sin sidecars | `npm run tauri:dev:external` |
| Dev solo frontend | `npm run dev` |
| Firmar | `TAURI_SIGNING_PRIVATE_KEY=... npx tauri signer sign "ruta/al/archivo"` |
| Generar clave | `npx tauri signer generate -w ~/.tauri/hnl-pods-v2.key` |
| Ver target triple | `rustc -vV \| grep host` |

## Estructura de sidecars por plataforma

```
src-tauri/binaries/
├── pods-backend-x86_64-pc-windows-msvc.exe     # Windows
├── pods-backend-aarch64-apple-darwin            # macOS ARM
├── pods-backend-x86_64-apple-darwin             # macOS Intel
├── mongod-x86_64-pc-windows-msvc.exe           # Windows
├── mongod-aarch64-apple-darwin                  # macOS ARM
├── mongod-x86_64-apple-darwin                   # macOS Intel
├── pod-x86_64-pc-windows-msvc.exe              # Windows
├── pod-aarch64-apple-darwin                     # macOS ARM
├── pod-x86_64-apple-darwin                      # macOS Intel
└── chromium/
    ├── chrome-win/chrome.exe                    # Windows
    └── chrome-mac/Chromium.app/.../Chromium     # macOS
```

> Solo necesitas los binarios de TU plataforma para compilar. Tauri busca automaticamente el que corresponda a tu target triple.

## Troubleshooting

### No se genera el archivo .sig
La variable `TAURI_PRIVATE_KEY` no esta seteada o esta vacia:
```bash
echo $TAURI_PRIVATE_KEY | head -c 20
```

### Error "archivos bloqueados" al actualizar (Windows)
El hook NSIS en `windows/hooks.nsh` mata los procesos automaticamente. Si sigue fallando, agregar mas procesos al `NSIS_HOOK_PREINSTALL`.

### Error "developer not identified" (macOS)
Sin firma Apple, abrir: System Settings > Privacy & Security > "Open Anyway". Para distribucion seria, firmar y notarizar.

### El updater no detecta la nueva version
- Verificar que `latest.json` sea accesible publicamente
- Verificar que la version sea mayor que la instalada
- Verificar que la firma corresponda al archivo subido
- Verificar que el key platform en `latest.json` sea correcto (`windows-x86_64`, `darwin-aarch64`)

### Binario no encontrado al hacer build
Tauri busca el sidecar con tu target triple exacto. Verificar:
```bash
rustc -vV | grep host
ls src-tauri/binaries/ | grep pods-backend
```
Los nombres deben coincidir.

### MongoDB no inicia (macOS)
macOS puede bloquear binarios descargados. Quitar el atributo de cuarentena:
```bash
xattr -dr com.apple.quarantine pods/web-ui/src-tauri/binaries/mongod-*
```

### Repo privado
El auto-updater no puede descargar de repos privados sin autenticacion. Opciones:
- Hacer el repo publico
- Usar un servidor propio para hospedar los releases
- Configurar un proxy con token de GitHub
