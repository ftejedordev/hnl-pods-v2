# HypernovaLabs Pods

Aplicacion de escritorio para orquestacion de agentes AI, ejecucion de flujos y herramientas MCP. Construida con Rust + React + Tauri.

## Arquitectura

```
hnl-pods-v2/
├── pods/
│   ├── rust-backend/    # API REST en Rust (Axum) — puerto 8000
│   ├── web-ui/          # App de escritorio React 19 + Tauri 2
│   └── cli/             # CLI en Go (comando pod)
```

### Stack Tecnologico

| Componente | Tecnologia |
|------------|-----------|
| Backend | Rust, Axum 0.8, Tokio |
| Base de datos | MongoDB 8.0 (embebido como sidecar) |
| Frontend | React 19, TypeScript, Vite 7, TailwindCSS |
| Escritorio | Tauri 2.8 |
| CLI | Go 1.23, Cobra, Bubbletea TUI |
| MCP SDK | rmcp 0.15 (transportes stdio + HTTP) |
| Auth | JWT (HS256) + bcrypt + encriptacion Fernet |
| Crypto | Pure Rust (aes, cbc, hmac, sha2) — sin OpenSSL |

## Prerequisitos

- **Node.js** 18+ (con npm/npx)
- **Rust** 1.75+ (con cargo)
- **Go** 1.23+ (para el CLI, opcional)
- **MongoDB** — viene embebido en la app, no necesitas instalarlo

## Desarrollo

### Opcion 1: Tauri Dev Mode (recomendado)

Abre la app de escritorio completa con hot-reload en el frontend:

```bash
cd pods/web-ui
npm install
npm run tauri:dev
```

- Los cambios en React se actualizan al instante (Vite hot-reload)
- Backend + MongoDB arrancan automaticamente como sidecars
- Si cambias codigo del backend Rust, reconstruye con:

```bash
cd pods/rust-backend
cargo build --release
cp target/release/pods-backend.exe ../web-ui/src-tauri/binaries/pods-backend-x86_64-pc-windows-msvc.exe
```

Y reinicia `tauri:dev`.

### Opcion 2: Todo por separado (mas rapido para desarrollo del backend)

**Terminal 1 — MongoDB:**
```bash
# Windows (usando el mongod incluido)
pods/web-ui/src-tauri/binaries/mongod-x86_64-pc-windows-msvc.exe \
  --dbpath C:/Users/$USER/AppData/Roaming/com.hypernovalabs.pods/mongodb \
  --bind_ip 127.0.0.1 --port 27017
```

**Terminal 2 — Backend Rust:**
```bash
cd pods/rust-backend

export DB_URI_MONGO="mongodb://localhost:27017/hypernova_pods"
export JWT_SECRET_KEY="hypernova_secret_key_2024_pods"
export ENCRYPTION_KEY="hypernova_encryption_key_2024_pods"
export PORT=8000
export RUST_LOG=info,pods_backend=debug

cargo run
```

O con auto-reload al guardar archivos:
```bash
cargo install cargo-watch   # solo la primera vez
cargo watch -x run
```

**Terminal 3 — Frontend React:**
```bash
cd pods/web-ui
npm install   # solo la primera vez
npm run dev
```

Abre `http://localhost:5173` en el navegador.

### Variables de Entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `DB_URI_MONGO` | `mongodb://localhost:27017/hypernova_pods` | Conexion a MongoDB |
| `JWT_SECRET_KEY` | `hypernova_secret_key_2024_pods` | Clave para firmar JWT |
| `ENCRYPTION_KEY` | `hypernova_encryption_key_2024_pods` | Clave Fernet para encriptar API keys |
| `PORT` | `8000` | Puerto HTTP del backend |
| `RUST_LOG` | `info` | Nivel de logs (ej: `info,pods_backend=debug`) |
| `JWT_EXPIRE_MINUTES` | `10080` | Expiracion del token (7 dias) |

## Crear el Instalador

### 1. Compilar el backend Rust

```bash
cd pods/rust-backend
cargo build --release
```

### 2. Copiar el binario a los sidecars de Tauri

```bash
cp target/release/pods-backend.exe \
   ../web-ui/src-tauri/binaries/pods-backend-x86_64-pc-windows-msvc.exe
```

### 3. Construir el instalador Tauri

```bash
cd pods/web-ui
npm run tauri:build
```

Los instaladores se generan en:
```
pods/web-ui/src-tauri/target/release/bundle/
├── nsis/HypernovaLabs Pods_1.0.0_x64-setup.exe   # Instalador NSIS
└── msi/HypernovaLabs Pods_1.0.0_x64_en-US.msi    # Instalador MSI
```

### Compilar el CLI de Go (opcional)

```bash
cd pods/cli
go build -o pod.exe .
cp pod.exe ../web-ui/src-tauri/binaries/pod-x86_64-pc-windows-msvc.exe
```

## Estructura del Proyecto

### Backend (`pods/rust-backend/`)

```
src/
├── main.rs              # Entry point, servidor Axum
├── config.rs            # Configuracion desde env vars
├── error.rs             # Tipos de error → respuestas HTTP
├── state.rs             # AppState (MongoDB, MCP manager, servicios)
├── auth/
│   ├── jwt.rs           # Crear/validar JWT (HS256)
│   ├── password.rs      # Hash/verify bcrypt
│   ├── encryption.rs    # Fernet encrypt/decrypt (Rust puro)
│   └── middleware.rs    # Extractor AuthUser (Bearer token)
├── models/              # Modelos de datos (Serde)
│   ├── user.rs          # Usuario y auth
│   ├── agent.rs         # Agentes AI
│   ├── llm.rs           # Proveedores/config LLM
│   ├── flow.rs          # Flujos, pasos, ejecuciones
│   ├── flow_events.rs   # 25+ tipos de evento SSE
│   ├── chat.rs          # Sesiones/mensajes de chat
│   ├── mcp_connection.rs # Conexiones MCP
│   └── mcp_tools.rs     # Descubrimiento/ejecucion de tools MCP
├── routes/              # Endpoints HTTP (~60 total)
│   ├── auth.rs          # /auth/register, /auth/login, /auth/me
│   ├── agents.rs        # CRUD /api/agents
│   ├── llms.rs          # CRUD /api/llms + /providers + /test
│   ├── mcp.rs           # CRUD /api/mcp-server-connections + tools
│   ├── flows.rs         # CRUD /api/flows + execute
│   ├── executions.rs    # /api/executions + stream SSE
│   ├── cli.rs           # /api/cli (flujos + chat)
│   └── status.rs        # /status, /health
├── services/
│   ├── mcp_session.rs         # Sesion MCP (stdio/HTTP via rmcp)
│   ├── mcp_session_manager.rs # Pool de sesiones + limpieza automatica
│   ├── flow_service.rs        # Ejecucion de flujos + broadcast SSE
│   ├── agent_api_client/      # Clientes de proveedores LLM
│   │   └── providers/         # Anthropic, OpenAI, OpenRouter, Custom, Claude CLI
│   └── flow_executor/         # Handlers de pasos (LLM, tool, condicion, paralelo)
└── startup/
    ├── default_agents.rs      # 7 agentes HNL por defecto
    ├── default_mcp_servers.rs # 5 servidores MCP por defecto
    └── default_flows.rs       # Flujo default: GitHub Issue Resolution
```

### Frontend (`pods/web-ui/`)

```
src/
├── pages/
│   ├── Auth/             # Login, Register
│   └── Dashboard/
│       ├── AgentsPage    # Gestionar agentes AI
│       ├── FlowsPage    # Listar/gestionar flujos
│       ├── FlowBuilderPage # Editor visual de flujos (XyFlow)
│       ├── LLMsPage      # Configurar proveedores LLM
│       ├── McpManagementPage # Conexiones MCP
│       └── DocumentsPage  # Gestion de documentos/RAG
├── components/           # 64 componentes React
├── hooks/                # React Query hooks (useFlows, useLLMs, etc.)
├── api/                  # Clientes Axios
├── types/                # Tipos TypeScript
└── lib/                  # Utilidades, query client
```

### CLI (`pods/cli/`)

```bash
pod login                        # Autenticarse
pod list                         # Listar flujos disponibles
pod run <flow> [--var key=val]   # Ejecutar flujo con streaming SSE
pod chat                         # Chat interactivo con agente
pod ask "pregunta"               # Pregunta rapida
pod agent list                   # Listar agentes
pod llm list                     # Listar configs LLM
pod flow clone/delete/edit       # Gestion de flujos
pod config                       # Configuracion del CLI
```

## Endpoints Principales

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/auth/register` | Registrar usuario |
| POST | `/auth/login` | Login, devuelve JWT |
| GET | `/auth/me` | Info del usuario actual |
| GET | `/api/agents` | Listar agentes |
| POST | `/api/agents` | Crear agente |
| GET/PUT/DELETE | `/api/agents/:id` | CRUD de agente |
| GET | `/api/llms/providers` | Proveedores LLM disponibles |
| POST | `/api/llms/:id/test` | Probar conexion LLM |
| GET | `/api/mcp-server-connections` | Listar conexiones MCP |
| GET | `/api/mcp-server-connections/:id/tools` | Descubrir tools MCP |
| POST | `/api/mcp-server-connections/:id/tools/execute` | Ejecutar tool MCP |
| POST | `/api/flows/:id/execute` | Ejecutar flujo |
| GET | `/api/executions/:id/stream` | Stream de eventos SSE |
| GET | `/health` | Health check |

## Servidores MCP por Defecto

| Nombre | Transporte | Descripcion |
|--------|-----------|-------------|
| Filesystem MCP | stdio (npx) | Operaciones de archivos via `@modelcontextprotocol/server-filesystem` |
| Bash Commands MCP | stdio (npx) | Ejecucion de comandos shell via `bash-mcp` |
| Playwright MCP | stdio (npx) | Automatizacion de navegador via `@playwright/mcp` |
| SonarQube MCP | internal | Analisis de calidad de codigo (built-in) |
| MuleSoft MCP | stdio (npx) | MuleSoft Anypoint Platform (inactivo por defecto) |

## Agentes por Defecto

7 agentes AI preconfigurados: **BUGZ** (debugging), **JAX** (DevOps), **LEX** (legal/compliance), **MAX** (project management), **NOX** (seguridad), **TESS** (testing), **ZEE** (generacion de codigo).

## Proveedores LLM

- **Anthropic** — Claude (Sonnet 4.5, Opus 4.6, Haiku 3.5)
- **OpenAI** — GPT-4o, GPT-4 Turbo, o1
- **OpenRouter** — Router multi-modelo
- **Custom** — Cualquier API compatible con OpenAI
- **Claude CLI** — Claude CLI local como proveedor

## Logs

Los logs de la aplicacion estan en:
```
# Windows
C:\Users\<usuario>\AppData\Local\com.hypernovalabs.pods\logs\HypernovaLabs Pods.log

# macOS
~/Library/Logs/com.hypernovalabs.pods/HypernovaLabs Pods.log
```

Los logs incluyen `[Backend]` (API Rust), `[MongoDB stdout]` (base de datos) y `[Backend stderr]` (salida de servidores MCP).

## Base de Datos

Los datos se almacenan en:
```
# Windows
C:\Users\<usuario>\AppData\Roaming\com.hypernovalabs.pods\mongodb\

# macOS
~/Library/Application Support/com.hypernovalabs.pods/mongodb/
```

Colecciones: `users`, `agents`, `llms`, `mcp_server_connections`, `flows`, `flow_executions`, `flow_events`
