<div align="center">

# ⚛️ HNL Pods - Web UI

**Aplicacion de escritorio para gestionar agentes AI, flujos de trabajo, conexiones MCP y proveedores LLM**

![React](https://img.shields.io/badge/React-19.1.0-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript)
![Tauri](https://img.shields.io/badge/Tauri-2.8-FFC131?style=for-the-badge&logo=tauri)
![Vite](https://img.shields.io/badge/Vite-7.0-646CFF?style=for-the-badge&logo=vite)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=for-the-badge&logo=tailwindcss)

</div>

---

## 📋 Requisitos

- **Node.js** 18+
- **Rust** 1.75+ (para compilar Tauri)

---

## 💻 Desarrollo

### 🖥️ Tauri Dev Mode (app de escritorio con hot-reload)

```bash
npm install
npm run tauri:dev
```

> [!TIP]
> Esto levanta la app completa: MongoDB + Backend Rust + Frontend con hot-reload.

### 🌐 Solo Frontend (contra backend externo)

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en el navegador. Requiere que el backend este corriendo en `http://localhost:8000`.

### 🔌 Modo externo (sin servicios embebidos)

```bash
npm run tauri:dev:external
```

Levanta la app Tauri sin iniciar MongoDB ni backend (usa `SKIP_EMBEDDED_SERVICES=true`).

---

## 📜 Scripts

| Script | Descripcion |
|:-------|:------------|
| `npm run dev` | 🔥 Servidor Vite (solo frontend) |
| `npm run build` | 📦 Build de produccion |
| `npm run lint` | 🔍 ESLint |
| `npm run tauri:dev` | 🖥️ App completa con hot-reload |
| `npm run tauri:dev:external` | 🔌 App sin servicios embebidos |
| `npm run tauri:build` | 📦 Generar instalador |

---

## 📄 Paginas

| Pagina | Descripcion |
|:------:|:------------|
| 🔐 Login / Register | Autenticacion |
| 📋 Flows | Listar y gestionar flujos |
| 🎨 Flow Builder | Editor visual de flujos (XyFlow) |
| 🤖 Agents | Gestionar agentes AI |
| 🧠 LLMs | Configurar proveedores LLM |
| 🔌 MCP | Conexiones a servidores MCP |
| 📄 Documents | Gestion de documentos (RAG) |
| ⏰ Routines | Rutinas programadas |

---

## 🗂️ Estructura

```
src/
├── pages/
│   ├── Auth/                   # 🔐 Login, Register
│   └── Dashboard/
│       ├── FlowsPage.tsx       # 📋 Lista de flujos
│       ├── FlowBuilderPage.tsx # 🎨 Editor visual
│       ├── AgentsPage.tsx      # 🤖 Agentes AI
│       ├── LLMsPage.tsx        # 🧠 Proveedores LLM
│       ├── McpManagementPage   # 🔌 Conexiones MCP
│       ├── DocumentsPage.tsx   # 📄 Documentos/RAG
│       └── RoutinesPage.tsx    # ⏰ Rutinas
│
├── components/                 # 🧩 60+ componentes
│   ├── FlowBuilder/            #    Editor visual (12 componentes)
│   ├── ui/                     #    Componentes base (Radix UI)
│   ├── Agent/                  #    Grid, Card, Form, Table
│   ├── MCP/                    #    Card, Tools, DirectTest
│   ├── FlowExecution/          #    Monitor en tiempo real
│   └── Layout/                 #    DashboardLayout
│
├── hooks/                      # 🪝 React Query hooks
│   ├── useFlows.ts
│   ├── useLLMs.ts
│   ├── useAgents.ts
│   ├── useMcpConnections.ts
│   └── useDocuments.ts
│
├── api/                        # 🌐 Clientes Axios
├── types/                      # 📝 Tipos TypeScript
├── lib/                        # 🔧 Utilidades, queryClient
└── utils/                      # 🛠️ Updater, helpers
```

---

## 🛠️ Stack

| Tecnologia | Version | Uso |
|:-----------|:-------:|:----|
| ![React](https://img.shields.io/badge/-React-61DAFB?style=flat-square&logo=react&logoColor=black) | 19.1.0 | UI |
| ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) | 5.8.3 | Tipado |
| ![Vite](https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=vite&logoColor=white) | 7.0.4 | Build tool |
| ![TailwindCSS](https://img.shields.io/badge/-Tailwind-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) | 3.4.0 | Estilos |
| `@tanstack/react-query` | 5.83.0 | Data fetching + cache |
| `@xyflow/react` | 12.0.0 | Editor visual de flujos |
| `react-hook-form` | 7.60.0 | Formularios |
| `Radix UI` | — | Componentes accesibles |
| `lucide-react` | — | Iconos |

---

## 🔧 Tauri

### Plugins

| Plugin | Descripcion |
|:-------|:------------|
| `tauri-plugin-dialog` | 💬 Dialogos nativos |
| `tauri-plugin-process` | ⚙️ Control de procesos |
| `tauri-plugin-updater` | 🔄 Auto-actualizaciones via GitHub Releases |
| `tauri-plugin-shell` | 🐚 Ejecucion de sidecars |

### Sidecars (binarios embebidos)

```
src-tauri/binaries/
├── 🗄️ mongod-x86_64-pc-windows-msvc.exe       # MongoDB embebido
├── 🦀 pods-backend-x86_64-pc-windows-msvc.exe  # Backend Rust
└── 📟 pod-x86_64-pc-windows-msvc.exe           # CLI de Go
```

### Recursos
- 🎭 `chromium/` — Navegador para Playwright MCP

---

## 📦 Build del Instalador

```bash
npm run tauri:build
```

Genera instaladores en:
```
src-tauri/target/release/bundle/
├── nsis/   # 💿 Instalador NSIS (.exe)
└── msi/    # 💿 Instalador MSI
```
