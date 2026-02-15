#!/bin/bash
# =============================================================
# HypernovaLabs Pods - Build Release Script
# =============================================================
# Este script compila todo y genera el instalador firmado
# para actualizaciones automaticas via Tauri updater.
#
# USO:
#   ./build-release.sh
#
# PREREQUISITOS:
#   1. Haber generado las claves de firma (una sola vez):
#      cd pods/web-ui && npx @tauri-apps/cli signer generate -w ~/.tauri/hnl-pods-v2.key
#
#   2. Tener la clave privada en ~/.tauri/hnl-pods-v2.key
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEY_FILE="$HOME/.tauri/hnl-pods-v2.key"

echo "=========================================="
echo " HypernovaLabs Pods - Build Release"
echo "=========================================="

# Verificar que existe la clave de firma
if [ ! -f "$KEY_FILE" ]; then
    echo ""
    echo "ERROR: No se encontro la clave de firma en: $KEY_FILE"
    echo ""
    echo "Genera las claves primero ejecutando:"
    echo "  cd pods/web-ui && npx @tauri-apps/cli signer generate -w ~/.tauri/hnl-pods-v2.key"
    echo ""
    echo "Luego copia la clave publica que te muestre y pegala en:"
    echo "  pods/web-ui/src-tauri/tauri.conf.json -> plugins.updater.pubkey"
    echo ""
    exit 1
fi

# Leer la clave privada
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

# Paso 1: Compilar backend Rust
echo ""
echo "[1/3] Compilando backend Rust..."
cd "$SCRIPT_DIR/pods/rust-backend"
cargo build --release
echo "      Backend compilado OK"

# Paso 2: Copiar binario al sidecar de Tauri
echo ""
echo "[2/3] Copiando binario al sidecar..."
cp target/release/pods-backend.exe \
   "$SCRIPT_DIR/pods/web-ui/src-tauri/binaries/pods-backend-x86_64-pc-windows-msvc.exe"
echo "      Binario copiado OK"

# Paso 3: Build Tauri (frontend + instalador firmado)
echo ""
echo "[3/3] Construyendo instalador Tauri (firmado)..."
cd "$SCRIPT_DIR/pods/web-ui"
npm run tauri:build

echo ""
echo "=========================================="
echo " Build completado!"
echo "=========================================="
echo ""
echo "Instaladores generados en:"
echo "  NSIS: pods/web-ui/src-tauri/target/release/bundle/nsis/"
echo "  MSI:  pods/web-ui/src-tauri/target/release/bundle/msi/"
echo ""
echo "Para subir como release a GitHub:"
echo "  1. Sube el archivo .nsis.zip y .nsis.zip.sig"
echo "  2. Sube el archivo latest.json"
echo "  3. Crea un nuevo Release con tag v\$(cat pods/web-ui/src-tauri/tauri.conf.json | grep version | head -1 | tr -d ' \",' | cut -d: -f2)"
echo ""
