<div align="center">

# 📟 HNL Pods CLI

**Interfaz de linea de comandos para ejecutar flujos, chatear con agentes AI y gestionar configuraciones**

![Go](https://img.shields.io/badge/Go-1.23-00ADD8?style=for-the-badge&logo=go)
![Cobra](https://img.shields.io/badge/Framework-Cobra-blue?style=for-the-badge)
![Bubbletea](https://img.shields.io/badge/TUI-Bubbletea-ff69b4?style=for-the-badge)

</div>

---

## 📋 Requisitos

- Go 1.23+

## 🔨 Compilacion

```bash
cd pods/cli
go mod tidy
go build -o pod.exe .
```

Para instalarlo como sidecar de Tauri:
```bash
cp pod.exe ../web-ui/src-tauri/binaries/pod-x86_64-pc-windows-msvc.exe
```

---

## ⚙️ Configuracion Inicial

```bash
pod config set api http://localhost:8000   # Configurar endpoint
pod login                                  # Autenticarse
pod config show                            # Ver configuracion
```

> [!NOTE]
> El archivo de configuracion se guarda en `~/.config/pods-cli/config.json`

---

## 🚀 Comandos

### 📋 Flujos

```bash
pod list                                   # Listar flujos disponibles
pod list --all                             # Incluir flujos inactivos
pod run <flow> key1 val1 key2 val2         # Ejecutar flujo con variables
pod run <flow> --timeout 600               # Ejecutar con timeout personalizado
pod run <flow> --no-stream                 # Ejecutar sin streaming
pod help <flow>                            # Ver detalles de un flujo
```

### 💬 Chat

```bash
pod chat                                   # Chat interactivo con agente
pod chat sessions                          # Listar sesiones de chat
pod chat history <session-id>              # Ver historial de una sesion
pod ask "tu pregunta"                      # Pregunta rapida (sin sesion)
```

### 🤖 Agentes

```bash
pod agent list                             # Listar agentes con LLMs asignados
pod agent info <nombre>                    # Ver detalles de un agente
pod agent set-llm <agente> <id>            # Asignar LLM a un agente
```

### 🧠 LLMs

```bash
pod llm list                               # Listar configuraciones LLM
pod llm providers                          # Ver proveedores disponibles
pod llm test <id>                          # Probar conectividad
pod llm create                             # Crear LLM (interactivo)
pod llm delete <id>                        # Eliminar configuracion
```

### 📂 Gestion de Flujos

```bash
pod flow create <nombre>                   # Crear nuevo flujo
pod flow clone <origen> <dest>             # Clonar flujo existente
pod flow edit <nombre>                     # Editar flujo
pod flow delete <nombre>                   # Eliminar flujo
pod flow export <nombre>                   # Exportar a YAML/JSON
pod flow import <archivo>                  # Importar desde archivo
```

### 🔧 Configuracion

```bash
pod config show                            # Ver configuracion actual
pod config set api <url>                   # Cambiar endpoint
pod config set token <jwt>                 # Cambiar token
pod config set openrouter-key <key>        # Key para resumenes predictivos
pod config reset                           # Restaurar valores por defecto
```

---

## 🏳️ Flags Globales

| Flag | Descripcion |
|:-----|:------------|
| `-v, --verbose` | Salida detallada |
| `--api <url>` | Endpoint del backend |
| `--token <jwt>` | Token de autenticacion |
| `--json` | Salida en formato JSON |
| `--no-color` | Desactivar colores |

---

## 📦 Dependencias

| Paquete | Uso |
|:--------|:----|
| `spf13/cobra` | Framework CLI |
| `charmbracelet/bubbletea` | Interfaz TUI interactiva |
| `charmbracelet/glamour` | Renderizado de markdown |
| `charmbracelet/lipgloss` | Estilos de terminal |
| `charmbracelet/huh` | Formularios interactivos |

---

## 🌐 Endpoints API Utilizados

| Metodo | Ruta | Descripcion |
|:------:|:-----|:------------|
| `POST` | `/auth/login` | Autenticacion |
| `GET` | `/api/cli/flows` | Listar flujos |
| `POST` | `/api/cli/flows/{name}/execute` | Ejecutar flujo |
| `GET` | `/api/cli/flows/{name}/help` | Detalles del flujo |
| `GET` | `/api/executions/{id}/stream` | Streaming SSE |
| `POST` | `/api/cli/chat/sessions` | Crear sesion de chat |
| `POST` | `/api/cli/chat/sessions/{id}/messages` | Enviar mensaje |
| `GET` | `/api/agents` | Listar agentes |
| `GET` | `/api/llms` | Listar LLMs |
