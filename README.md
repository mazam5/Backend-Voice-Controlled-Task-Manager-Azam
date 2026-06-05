# Auralist Backend — Voice Controlled Task Manager

This is the backend server for **Auralist**, an AI-powered task management assistant. It exposes REST API endpoints for authentication and task operations, alongside a WebSocket server that coordinates real-time Speech-to-Text inputs and processes them through an autonomous Gemini AI agent loop.

---

## 🚀 Key Features

1. **AI Agent Loop (Function Calling)**:
   - Powered by Gemini (`gemini-3.5-flash` with fallbacks to other Flash versions).
   - Uses function calling to inspect, create, update, and delete tasks from the database.
   - Dynamic prompt formatting integrates current user tasks and relative time parsing (e.g., "tomorrow at 7 PM" resolves to ISO 8601 absolute times).
   - Strict safety rules (e.g., explicit confirmation before deleting tasks).

2. **Hybrid Database System**:
   - Automatically attempts to connect to **PostgreSQL**.
   - If PostgreSQL is offline or unconfigured, the system automatically falls back to a **local JSON database (`data/db.json`)** to ensure seamless operation.

3. **Real-time WebSockets**:
   - Dedicated socket listener handles user connection authentication, streaming state feedback (`thinking`, `response`), and keep-alive ping-pong.

4. **REST API**:
   - Secure routing protected by JWT authentication and custom CORS configurations.
   - Multimodal audio chat endpoint for offline voice recording uploads.

---

## 📁 Project Structure

```text
Backend-Voice-Controlled-Task-Manager-Azam/
├── data/                    # JSON database fallback storage
├── src/
│   ├── config/              # Configuration (db, gemini, websocket)
│   ├── controllers/         # Request handling logic (auth, task, voice)
│   ├── middleware/          # Express middleware (auth verification)
│   ├── routes/              # Express REST routing endpoints
│   ├── services/            # Core business logic:
│   │   ├── gemini.service.ts # Gemini LLM agent, system prompt, tool definitions
│   │   ├── task.service.ts   # Task CRUD abstractions
│   │   └── user.service.ts   # User management logic
│   ├── types/               # Type declarations
│   ├── app.ts               # Express configuration
│   └── server.ts            # Application bootstrapper
├── .env                     # Configuration variables (gitignored)
├── .example.env             # Environment template
├── nodemon.json             # Dev server config
├── package.json             # NPM dependencies & scripts
└── tsconfig.json            # TypeScript configuration
```

---

## 🛠️ Prerequisites

- **Node.js** (v18 or higher recommended)
- **NPM** (v9 or higher)
- **PostgreSQL** (optional: if unavailable, fallback local JSON db is activated automatically)
- **Gemini API Key**: Retrieve one from [Google AI Studio](https://aistudio.google.com/)

---

## 📥 Setup Instructions

### 1. Install Dependencies

Run the following command inside the backend root folder:

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the backend root directory (based on `.example.env`):

```ini
PORT=5000
FRONTEND_URL=http://localhost:5173

# Database configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_agent_task_manager
DB_USER=postgres
DB_PASSWORD=your_postgresql_password

# Authentication
JWT_SECRET=your_jwt_signing_secret_key

# Gemini AI Studio Key
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Run the Server

Use one of the following commands depending on your environment:

- **Development (Hot Reloading)**:

  ```bash
  npm run dev
  ```

- **Production Build**:

  ```bash
  npm run build
  npm start
  ```

---

## 🔌 API Documentation

### REST API Endpoints

#### 🔓 Public Endpoints

- **POST** `/api/auth/register` — Create a new account.

- **POST** `/api/auth/login` — Sign in and retrieve JWT.

#### 🔒 Authenticated Endpoints (Bearer token in `Authorization` header)

- **GET** `/api/tasks` — Fetch user's agenda tasks.

- **POST** `/api/tasks` — Manually create a task.
- **PATCH** `/api/tasks/:id` — Update/Toggle a task.
- **DELETE** `/api/tasks/:id` — Delete a task.
- **POST** `/api/voice/chat` — Upload audio recording directly for task updates.
- **POST** `/api/voice/reset` — Reset AI conversation context.

---

## 🧠 Detailed Agent Architecture & Function Calling

The core of the server lies in **[src/services/gemini.service.ts](src/services/gemini.service.ts)**.

### LLM Tool Definitions

The Gemini model is provided with four declarations to interact with the system:

1. `create_task(title, scheduled_at, description)`: Schedules tasks with absolute times.
2. `update_task(task_id, title, scheduled_at, completed)`: Alters scheduling or completion status.
3. `delete_task(task_id)`: Deletes tasks (invoked only after confirmation).
4. `get_tasks(filter)`: Retrieves the task list.

### Conversational Agent Loop

When a user sends a transcript via WebSocket:

1. The server fetches the user's latest task list.
2. A system prompt is compiled, including the **current time** and the current state of tasks.
3. The server makes a request to the Gemini API (`gemini-3.5-flash` with fallbacks).
4. The model responds. If it requests a tool execution:
   - The tool is executed on the server database.
   - The tool result is injected back into the conversation logs.
   - The loop runs again (up to 8 times max) until the model decides to stop calling tools and outputs a spoken response.
5. The final spoken text, updated task list, and operation logs are streamed back to the client.
