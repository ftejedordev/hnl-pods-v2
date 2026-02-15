# HNL Pods - Backend Rust

API REST construida con Axum que reemplaza el backend Python (FastAPI). Maneja autenticacion, agentes AI, flujos de trabajo, conexiones MCP y proveedores LLM.

## Requisitos

- Rust 1.75+
- MongoDB 8.0 (viene embebido como sidecar en la app de escritorio)

## Desarrollo

### Con la app Tauri (recomendado)

El backend se compila y copia como sidecar:

```bash
cargo build --release
cp target/release/pods-backend.exe ../web-ui/src-tauri/binaries/pods-backend-x86_64-pc-windows-msvc.exe
```

Luego ejecutar `npm run tauri:dev` desde `pods/web-ui/`.

### Standalone (mas rapido para iterar)

```bash
# Terminal 1: MongoDB
pods/web-ui/src-tauri/binaries/mongod-x86_64-pc-windows-msvc.exe \
  --dbpath C:/Users/$USER/AppData/Roaming/com.hypernovalabs.pods/mongodb \
  --bind_ip 127.0.0.1 --port 27017

# Terminal 2: Backend
cd pods/rust-backend
export DB_URI_MONGO="mongodb://localhost:27017/hypernova_pods"
export JWT_SECRET_KEY="hypernova_secret_key_2024_pods"
export ENCRYPTION_KEY="hypernova_encryption_key_2024_pods"
export PORT=8000
export RUST_LOG=info,pods_backend=debug
cargo run
```

Con auto-reload:
```bash
cargo install cargo-watch
cargo watch -x run
```

## Variables de Entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `DB_URI_MONGO` | `mongodb://localhost:27017/hypernova_pods` | Conexion MongoDB |
| `JWT_SECRET_KEY` | `hypernova_secret_key_2024_pods` | Clave para firmar JWT |
| `ENCRYPTION_KEY` | `hypernova_encryption_key_2024_pods` | Clave Fernet para encriptar API keys |
| `PORT` | `8000` | Puerto HTTP |
| `RUST_LOG` | `info` | Nivel de logs |
| `JWT_EXPIRE_MINUTES` | `10080` | Expiracion del token (7 dias) |

## Estructura

```
src/
├── main.rs                     # Entry point, servidor Axum
├── config.rs                   # Variables de entorno
├── error.rs                    # AppError → respuestas HTTP
├── state.rs                    # AppState (MongoDB, MCP, servicios)
├── auth/
│   ├── jwt.rs                  # JWT HS256
│   ├── password.rs             # bcrypt hash/verify
│   ├── encryption.rs           # Fernet puro en Rust (AES-CBC + HMAC-SHA256)
│   └── middleware.rs           # Extractor AuthUser (Bearer token)
├── models/                     # Structs Serde (compatibles con Python)
│   ├── user.rs, agent.rs, llm.rs, flow.rs
│   ├── flow_events.rs          # 25+ tipos de evento SSE
│   ├── chat.rs, mcp_connection.rs, mcp_tools.rs
├── routes/                     # ~40 endpoints HTTP
│   ├── auth.rs                 # /auth/register, /auth/login, /auth/me
│   ├── agents.rs               # CRUD /api/agents
│   ├── llms.rs                 # CRUD /api/llms + /providers + /test
│   ├── mcp.rs                  # CRUD + tools + execute
│   ├── flows.rs                # CRUD + execute
│   ├── executions.rs           # List, get, cancel, approve, stream SSE
│   ├── cli.rs                  # Endpoints para el CLI (chat + flows)
│   └── status.rs, health.rs, functions.rs, mcp_client.rs
├── services/
│   ├── mcp_session.rs          # Sesion MCP (stdio/HTTP via rmcp)
│   ├── mcp_session_manager.rs  # Pool de sesiones + limpieza automatica
│   ├── flow_service.rs         # Ejecucion de flujos + broadcast SSE
│   ├── agent_api_client/       # Clientes de proveedores LLM
│   │   └── providers/          # Anthropic, OpenAI, OpenRouter, Custom, Claude CLI
│   └── flow_executor/          # Handlers de pasos
│       └── step_handlers/      # LLM, tool, condicion, paralelo, aprobacion, feedback
└── startup/
    ├── default_agents.rs       # 7 agentes HNL por defecto
    ├── default_mcp_servers.rs  # 5 servidores MCP por defecto
    └── default_flows.rs        # Flujo default: GitHub Issue Resolution
```

## Dependencias Principales

| Crate | Version | Uso |
|-------|---------|-----|
| axum | 0.8 | Framework HTTP |
| mongodb | =3.2.2 | Driver MongoDB (rustls, sin OpenSSL) |
| tokio | 1.x | Runtime async |
| jsonwebtoken | 9 | JWT HS256 |
| bcrypt | 0.17 | Hash de passwords |
| reqwest | 0.12 | Cliente HTTP para LLM APIs (rustls) |
| rmcp | 0.15 | SDK MCP (stdio + HTTP) |
| serde / serde_json | 1.x | Serializacion JSON |
| tower-http | 0.6 | CORS middleware |

> **Nota:** Todo el crypto es pure-Rust. No requiere OpenSSL en Windows.

## Proveedores LLM

| Proveedor | API | Modelos |
|-----------|-----|---------|
| Anthropic | api.anthropic.com | Claude Sonnet 4.5, Opus 4.6, Haiku 3.5 |
| OpenAI | api.openai.com | GPT-4o, GPT-4 Turbo, o1 |
| OpenRouter | openrouter.ai | Multi-modelo |
| Custom | Configurable | Cualquier API compatible OpenAI |
| Claude CLI | Subproceso local | Claude CLI |

## Colecciones MongoDB

`users`, `agents`, `llms`, `mcp_server_connections`, `flows`, `flow_executions`, `flow_events`

## Build Release

```bash
cargo build --release
```

El binario se genera en `target/release/pods-backend.exe` (~21 MB).

Perfil de release: `opt-level=3`, LTO habilitado, binarios stripped.
