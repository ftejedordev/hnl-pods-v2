# HypernovaLabs Pods

Aplicación de escritorio para gestión de agentes de IA, empaquetada con Tauri v2.

## Arquitectura

- **Frontend**: React + TypeScript + Vite
- **Backend**: FastAPI (Python) compilado con PyInstaller
- **Base de datos**: MongoDB embebido
- **Empaquetado**: Tauri v2.8.5

## Requisitos

### Para desarrollo
- Node.js 18+
- Rust 1.70+
- Python 3.11+
- PyInstaller 6.16.0

### Para generar el instalador
- Todo lo anterior, más:
- MongoDB 7.0.14 portable (descarga manual)

## Estructura de binarios

```
src-tauri/binaries/
├── mcp-server-x86_64-apple-darwin    # ✅ Incluido en repo (29MB)
├── mongod-aarch64-apple-darwin       # ❌ NO en repo - descargar manualmente
└── mongod-x86_64-apple-darwin        # ❌ NO en repo - descargar manualmente
```

## Instalación

### 1. Clonar y preparar dependencias

```bash
# Clonar repositorio
git clone <repo-url>
cd pods/web-ui

# Instalar dependencias Node
npm install

# Instalar dependencias Rust (automático con Tauri)
```

### 2. Descargar MongoDB (REQUERIDO)

El binario de MongoDB **NO** está en el repositorio por su tamaño (156-164MB).

**Opción A - Descarga directa:**
```bash
# Para ARM64 (M1/M2/M3)
curl -O https://fastdl.mongodb.org/osx/mongodb-macos-aarch64-7.0.14.tgz
tar -xzf mongodb-macos-aarch64-7.0.14.tgz
cp mongodb-macos-aarch64-7.0.14/bin/mongod src-tauri/binaries/mongod-aarch64-apple-darwin

# Para x86_64 (Intel)
curl -O https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-7.0.14.tgz
tar -xzf mongodb-macos-x86_64-7.0.14.tgz
cp mongodb-macos-x86_64-7.0.14/bin/mongod src-tauri/binaries/mongod-x86_64-apple-darwin
```

**Opción B - Usar MongoDB local:**
```bash
# Si ya tienes MongoDB instalado
cp /usr/local/bin/mongod src-tauri/binaries/mongod-aarch64-apple-darwin
```

### 3. Compilar backend (si no existe)

El binario `mcp-server` está en el repo, pero si necesitas recompilarlo:

```bash
cd ../mcp-server
pip install pyinstaller==6.16.0
pyinstaller hypernova-pods.spec
cp dist/mcp-server ../web-ui/src-tauri/binaries/mcp-server-x86_64-apple-darwin
```

## Desarrollo

```bash
npm run tauri dev
```

Esto iniciará:
1. Servidor de desarrollo Vite (frontend)
2. MongoDB en puerto 27017 (embebido)
3. Backend FastAPI en puerto 8000 (embebido)

## Generar instalador

### Prerequisitos
- ✅ Todos los binarios en `src-tauri/binaries/`
- ✅ MongoDB descargado (paso 2)

### Comando

```bash
npm run tauri build
```

### Salida

```
src-tauri/target/release/bundle/
├── macos/
│   └── HypernovaLabs Pods.app    # Aplicación (216MB)
└── dmg/
    └── HypernovaLabs Pods_1.0.0_x64.dmg  # Instalador
```

## Cómo funciona el empaquetado

### Binarios embebidos (sidecars)
Tauri empaqueta los binarios como "sidecars" que se ejecutan junto a la aplicación:

1. **mongod**: Base de datos local
   - Puerto: `127.0.0.1:27017`
   - Datos: `~/Library/Application Support/com.hypernovalabs.pods/mongodb/`
   - Inicia/detiene con la app

2. **mcp-server**: Backend FastAPI
   - Puerto: `127.0.0.1:8000`
   - Variables de entorno configuradas automáticamente

### Proceso de inicio
1. Usuario abre la app
2. Tauri inicia MongoDB
3. Espera 3 segundos (arranque de MongoDB)
4. Inicia backend FastAPI
5. Frontend muestra splash screen verificando servicios
6. Cuando todos están listos, muestra la UI principal

### Gestión de procesos
- Los procesos se gestionan desde Rust (`database_manager.rs`, `backend_manager.rs`)
- Se detienen automáticamente al cerrar la app
- Healthchecks cada segundo durante el inicio

## Distribución a otros computadores

### En el computador de desarrollo
```bash
git add .
git commit -m "Empaquetado con Tauri"
git push
```

### En otro computador
```bash
# 1. Clonar
git clone <repo-url>
cd pods/web-ui
npm install

# 2. Descargar MongoDB (ver paso 2 arriba)
# Esto es REQUERIDO

# 3. Build
npm run tauri build
```

## Troubleshooting

### Error: "mongod not found"
- Verifica que los binarios existan en `src-tauri/binaries/`
- Verifica permisos de ejecución: `chmod +x src-tauri/binaries/mongod-*`

### Error: "Failed to start MongoDB"
- Puerto 27017 puede estar ocupado
- Verifica que no haya otra instancia de MongoDB corriendo

### App se congela en splash screen
- Revisa logs de consola (Cmd+Option+I en desarrollo)
- Verifica que los 3 servicios estén corriendo
- Healthcheck falla después de 30 segundos

## Tamaño del bundle

- **App completa**: ~216MB
  - Tauri runtime: 23MB
  - Backend (mcp-server): 29MB
  - MongoDB: 164MB

## Tecnologías

- [Tauri v2](https://v2.tauri.app/) - Framework desktop
- [React 18](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [FastAPI](https://fastapi.tiangolo.com/) - Backend
- [MongoDB 7.0](https://www.mongodb.com/) - Base de datos
- [PyInstaller](https://pyinstaller.org/) - Compilador Python

## Licencia

Privado - HypernovaLabs
