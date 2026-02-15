# Build & Release - HypernovaLabs Pods

## Requisitos previos

- Node.js + npm
- Rust toolchain (`rustup`, `cargo`)
- Tauri CLI (`npm install @tauri-apps/cli`)
- Clave de firma en `~/.tauri/hnl-pods-v2.key`
- Repo GitHub: `ftejedordev/hnl-pods-v2`

## 1. Actualizar la version

Editar `pods/web-ui/src-tauri/tauri.conf.json`:

```json
"version": "X.Y.Z",
```

## 2. Compilar el backend Rust (si hubo cambios)

```bash
cd pods/rust-backend
cargo build --release
```

Copiar el binario al directorio de sidecars de Tauri:

```bash
cp target/release/pods-backend.exe ../web-ui/src-tauri/binaries/pods-backend-x86_64-pc-windows-msvc.exe
```

## 3. Build de Tauri

```bash
cd pods/web-ui
TAURI_PRIVATE_KEY=$(cat ~/.tauri/hnl-pods-v2.key) TAURI_PRIVATE_KEY_PASSWORD="" npm run tauri:build
```

> **IMPORTANTE:** La variable de entorno es `TAURI_PRIVATE_KEY`, NO `TAURI_SIGNING_PRIVATE_KEY`.

Los archivos generados quedan en:

```
src-tauri/target/release/bundle/nsis/
├── HypernovaLabs Pods_X.Y.Z_x64-setup.exe        # Instalador
├── HypernovaLabs Pods_X.Y.Z_x64-setup.nsis.zip   # Zip para auto-updater
```

## 4. Firmar el instalador

Si el build no genero el archivo `.sig` automaticamente, firmar manualmente:

```bash
cd pods/web-ui
TAURI_PRIVATE_KEY=$(cat ~/.tauri/hnl-pods-v2.key) TAURI_PRIVATE_KEY_PASSWORD="" npx tauri signer sign "src-tauri/target/release/bundle/nsis/HypernovaLabs Pods_X.Y.Z_x64-setup.nsis.zip"
```

Esto genera:
- `HypernovaLabs Pods_X.Y.Z_x64-setup.nsis.zip.sig`
- Imprime la **firma publica** en consola (la necesitas para `latest.json`)

## 5. Crear latest.json

Crear el archivo `latest.json` con la firma del paso anterior:

```json
{
  "version": "X.Y.Z",
  "notes": "- Cambio 1\n- Cambio 2",
  "pub_date": "2026-MM-DDTHH:MM:SSZ",
  "platforms": {
    "windows-x86_64": {
      "signature": "<FIRMA DEL PASO 4>",
      "url": "https://github.com/ftejedordev/hnl-pods-v2/releases/download/vX.Y.Z/HypernovaLabs.Pods_X.Y.Z_x64-setup.nsis.zip"
    }
  }
}
```

> **Nota:** En la URL, los espacios se reemplazan por puntos: `HypernovaLabs.Pods` (no `HypernovaLabs Pods`).

## 6. Subir release a GitHub

1. Ir a https://github.com/ftejedordev/hnl-pods-v2/releases/new
2. Tag: `vX.Y.Z`
3. Titulo: `vX.Y.Z`
4. Subir 3 archivos:
   - `HypernovaLabs Pods_X.Y.Z_x64-setup.exe` (instalador directo)
   - `HypernovaLabs Pods_X.Y.Z_x64-setup.nsis.zip` (para auto-updater)
   - `latest.json` (manifiesto del updater)
5. Publicar release

## 7. Verificar auto-updater

1. Abrir la app con la version anterior instalada
2. La app chequea automaticamente el endpoint:
   ```
   https://github.com/ftejedordev/hnl-pods-v2/releases/latest/download/latest.json
   ```
3. Si detecta version nueva, muestra dialogo de actualizacion
4. Al instalar, el hook NSIS mata procesos (mongod, backend, etc.) antes de extraer archivos

## Referencia rapida

| Paso | Comando |
|------|---------|
| Build | `TAURI_PRIVATE_KEY=$(cat ~/.tauri/hnl-pods-v2.key) TAURI_PRIVATE_KEY_PASSWORD="" npm run tauri:build` |
| Firmar | `TAURI_PRIVATE_KEY=$(cat ~/.tauri/hnl-pods-v2.key) TAURI_PRIVATE_KEY_PASSWORD="" npx tauri signer sign "ruta/al/archivo.nsis.zip"` |
| Generar clave nueva | `npx tauri signer generate -w ~/.tauri/hnl-pods-v2.key` |

## Estructura de archivos clave

```
pods/web-ui/
├── src-tauri/
│   ├── tauri.conf.json          # Version, updater config, endpoints
│   ├── windows/hooks.nsh        # NSIS hooks (mata procesos antes de instalar)
│   ├── binaries/
│   │   ├── pods-backend-x86_64-pc-windows-msvc.exe
│   │   ├── mongod-x86_64-pc-windows-msvc.exe
│   │   └── pod-x86_64-pc-windows-msvc.exe
│   └── target/release/bundle/nsis/   # Output del build
~/.tauri/
└── hnl-pods-v2.key             # Clave privada de firma (NO commitear)
```

## Troubleshooting

### No se genera el archivo .sig
La variable `TAURI_PRIVATE_KEY` no esta seteada o esta vacia. Verificar:
```bash
echo $TAURI_PRIVATE_KEY | head -c 20
```

### Error "archivos bloqueados" al actualizar
El hook NSIS en `windows/hooks.nsh` mata los procesos automaticamente. Si sigue fallando, agregar mas procesos al `NSIS_HOOK_PREINSTALL`.

### El updater no detecta la nueva version
- Verificar que `latest.json` sea accesible publicamente
- Verificar que la version en `latest.json` sea mayor que la instalada
- Verificar que la firma corresponda al `.nsis.zip` subido

### Repo privado
El auto-updater no puede descargar de repos privados sin autenticacion. Opciones:
- Hacer el repo publico
- Usar un servidor propio para hospedar los releases
- Configurar un proxy con token de GitHub
