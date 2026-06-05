import { createTask, getUserTasks, updateTask, deleteTask, Task } from "./task.service";

// ─── Types ────────────────────────────────────────────────────────────────────
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

// ─── In-memory per-user conversation history ─────────────────────────────────
const sessions: Record<number, GeminiContent[]> = {};

export const getSession = (userId: number): GeminiContent[] => {
  if (!sessions[userId]) sessions[userId] = [];
  return sessions[userId];
};

export const clearSession = (userId: number): void => {
  sessions[userId] = [];
};

// ─── System prompt ────────────────────────────────────────────────────────────
const buildSystemPrompt = (tasks: Task[]): string => {
  const now = new Date();
  const timeStr = now.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  const taskList = tasks.length === 0
    ? "No tasks currently scheduled."
    : tasks.map(t => {
      const d = new Date(t.scheduled_at);
      const label = d.toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      });
      return `  • [ID:${t.id}] "${t.title}" — ${label} (completed: ${t.completed})`;
    }).join("\n");

  return `You are Auralist, a friendly conversational AI voice assistant for a Voice-Controlled Task Manager.
Current date/time: ${timeStr}

CURRENT TASK LIST:
${taskList}

=== STRICT BEHAVIOUR RULES ===

1. VOICE OUTPUT: Respond in plain spoken English only. No markdown, no bullet symbols, no asterisks, no backticks. Write short natural sentences for Text-to-Speech.

2. TIME RESOLUTION: Resolve ALL relative time expressions to absolute ISO 8601 datetimes using the current date/time above.
   Examples: "tomorrow at 7 AM" → next calendar day 07:00:00 | "evening" alone → 18:00:00 | "morning" alone → 09:00:00 | "afternoon" alone → 14:00:00 | "tonight" → 20:00:00

3. TOOL USAGE IS MANDATORY: You MUST call the appropriate tool to perform any operation. Never say "I created it" or "I deleted it" without first calling the tool. After calling tools, speak the confirmation conversationally.

4. MULTI-TASK CREATION: When the user requests multiple tasks in one message, call create_task separately for EACH task before generating your spoken reply.

5. CONTEXT RESOLUTION:
   - "the previous one" / "the last one" / "it" → most recently created or mentioned task in conversation history
   - "the second one" / "the first one" → task at that position in the task list sorted by scheduled time
   - "the LinkedIn task" / "the gym task" → semantic match on task title keywords
   - "my evening workout" → task with "workout" or "gym" in title scheduled between 17:00–22:00

6. DELETE CONFIRMATION (MANDATORY — never skip):
   a. When the user asks to delete, identify the task and ask: "I found [title] at [time]. Shall I go ahead and delete it?"
   b. Do NOT call delete_task in the same turn as the request.
   c. Only call delete_task in the NEXT turn when the user says "yes", "sure", "go ahead", "ok", "do it", "confirm".
   d. If user says "no", "cancel", "stop" — abort and say so.

7. UNCLEAR REQUESTS: If you cannot resolve which task the user means, ask a specific clarifying question. Example: "I couldn't find a 9:30 task. Did you mean the 9:15 Gym task?"

8. AGENDA SUMMARY: Speak conversationally. Example: "You have a product sync at 10 AM and a LinkedIn post at 5 PM this evening."

9. GRACEFUL ERROR HANDLING: If a tool returns an error, acknowledge it naturally and offer to retry.`;
};

// ─── Tool declarations ────────────────────────────────────────────────────────
const TOOLS = [{
  functionDeclarations: [
    {
      name: "create_task",
      description: "Creates a new task. Call ONCE PER TASK even when creating multiple tasks in one user message.",
      parameters: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING", description: "Short task title e.g. 'Gym session'" },
          scheduled_at: { type: "STRING", description: "Absolute ISO 8601 datetime e.g. '2026-06-05T07:00:00'" },
          description: { type: "STRING", description: "Optional details about the task" },
        },
        required: ["title", "scheduled_at"],
      },
    },
    {
      name: "update_task",
      description: "Updates an existing task by ID. Use for reschedule, rename, or mark complete/incomplete.",
      parameters: {
        type: "OBJECT",
        properties: {
          task_id: { type: "NUMBER", description: "Numeric ID of the task to update" },
          title: { type: "STRING", description: "New title (omit to keep current)" },
          scheduled_at: { type: "STRING", description: "New absolute ISO 8601 datetime (omit to keep current)" },
          completed: { type: "BOOLEAN", description: "true = mark done, false = mark undone" },
        },
        required: ["task_id"],
      },
    },
    {
      name: "delete_task",
      description: "Permanently deletes a task. ONLY call this AFTER the user has explicitly confirmed deletion in their message.",
      parameters: {
        type: "OBJECT",
        properties: {
          task_id: { type: "NUMBER", description: "Numeric ID of the task to delete" },
        },
        required: ["task_id"],
      },
    },
    {
      name: "get_tasks",
      description: "Fetches the latest task list from the database. Call this to refresh after any mutation or when asked about tasks.",
      parameters: {
        type: "OBJECT",
        properties: {
          filter: { type: "STRING", description: "Optional filter: 'today', 'tomorrow', 'morning', 'afternoon', 'evening', 'all'" },
        },
      },
    },
  ],
}];

// ─── Gemini REST call with model fallback ─────────────────────────────────────
async function callGemini(
  apiKey: string,
  history: GeminiContent[],
  systemPrompt: string
): Promise<any> {
  // Try models in order of preference
  const models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-flash-latest"];

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: history,
          tools: TOOLS,
          tool_config: { function_calling_config: { mode: "AUTO" } },
          generation_config: { temperature: 0.15, max_output_tokens: 600 },
        }),
      });

      if (res.status === 404) {
        console.warn(`Model ${model} not found, trying next...`);
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        console.warn(`⚠️ Model ${model} failed with status ${res.status}: ${body.slice(0, 200)}. Trying next...`);
        continue;
      }

      const data = await res.json();
      console.log(`✅ Gemini responded via model: ${model}`);
      return data;
    } catch (err: any) {
      console.warn(`⚠️ Model ${model} encountered exception: ${err.message}. Trying next...`);
      continue;
    }
  }

  throw new Error("All Gemini models exhausted — check your API key and quota.");
}

// ─── Main agent ───────────────────────────────────────────────────────────────
export const processGeminiVoiceAgent = async (
  userId: number,
  transcript: string,
  userApiKey?: string
): Promise<{ textResponse: string; tasks: Task[]; log?: string }> => {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No Gemini API key configured on server.");

  const history = getSession(userId);
  let tasks = await getUserTasks(userId);

  // Append the new user turn
  history.push({ role: "user", parts: [{ text: transcript }] });
  // Keep rolling window of last 40 messages (20 turns)
  if (history.length > 40) history.splice(0, history.length - 40);

  const logs: string[] = [];
  let textResponse = "";
  const MAX_LOOPS = 8; // enough for 3-task batch creation + confirmation

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    console.log(`🔄 Gemini agent loop ${loop + 1}/${MAX_LOOPS}`);

    const data = await callGemini(apiKey, history, buildSystemPrompt(tasks));

    const modelContent: GeminiContent | undefined = data.candidates?.[0]?.content;
    if (!modelContent) {
      textResponse = "Sorry, I couldn't process that. Please try again.";
      break;
    }

    // Push model reply into history
    history.push(modelContent);

    const parts: GeminiPart[] = modelContent.parts ?? [];
    const textPart = parts.find(p => p.text)?.text ?? "";
    const functionCalls = parts.filter(p => p.functionCall);

    if (textPart) textResponse = textPart;

    // No tool calls → LLM has given its final spoken reply
    if (functionCalls.length === 0) break;

    // ── Execute every tool call in this round ─────────────────────────────────
    const toolResultParts: GeminiPart[] = [];

    for (const part of functionCalls) {
      const { name, args } = part.functionCall!;
      let output: Record<string, unknown> = {};
      console.log(`🔧 Executing tool: ${name}`, JSON.stringify(args));

      try {
        if (name === "create_task") {
          const task = await createTask(
            userId,
            args.title as string,
            args.scheduled_at as string,
            (args.description as string) ?? ""
          );
          output = { status: "success", task };
          logs.push(`Created "${task.title}" [ID:${task.id}]`);
          tasks = await getUserTasks(userId);

        } else if (name === "update_task") {
          const updates: Record<string, unknown> = {};
          if (args.title !== undefined) updates.title = args.title;
          if (args.scheduled_at !== undefined) updates.scheduled_at = args.scheduled_at;
          if (args.completed !== undefined) updates.completed = args.completed;

          const updated = await updateTask(
            userId,
            Number(args.task_id),
            updates as Parameters<typeof updateTask>[2]
          );
          output = updated
            ? { status: "success", task: updated }
            : { status: "error", message: `Task ID ${args.task_id} not found` };
          if (updated) logs.push(`Updated [ID:${updated.id}] → "${updated.title}"`);
          tasks = await getUserTasks(userId);

        } else if (name === "delete_task") {
          const deleted = await deleteTask(userId, Number(args.task_id));
          output = deleted
            ? { status: "success", message: "Task deleted" }
            : { status: "error", message: `Task ID ${args.task_id} not found` };
          if (deleted) logs.push(`Deleted [ID:${args.task_id}]`);
          tasks = await getUserTasks(userId);

        } else if (name === "get_tasks") {
          tasks = await getUserTasks(userId);
          output = { status: "success", count: tasks.length, tasks };
        }
      } catch (err: any) {
        output = { status: "error", error: err.message };
        logs.push(`Tool error (${name}): ${err.message}`);
        console.error(`Tool ${name} failed:`, err);
      }

      // CRITICAL: tool responses MUST use role "user" in Gemini REST API
      toolResultParts.push({
        functionResponse: { name, response: output },
      });
    }

    // Push all tool results as a single user-role turn
    history.push({ role: "user", parts: toolResultParts });
    // Loop back so LLM generates its spoken confirmation
  }

  const finalTasks = await getUserTasks(userId);
  return {
    textResponse: textResponse || "Done.",
    tasks: finalTasks,
    ...(logs.length ? { log: logs.join(" | ") } : {}),
  };
};

export const transcribeAudio = async (
  audioBuffer: Buffer,
  mimeType: string,
  userApiKey?: string,
): Promise<string> => {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key configured on the server.');

  const base64Audio = audioBuffer.toString('base64');
  
  // Use preferred or fallback models for multimodal audio
  const models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-flash-latest"];
  
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio,
              },
            },
            {
              text: "Transcribe the spoken audio precisely in English. Respond ONLY with the transcription. Do not add any introduction, explanations, or notes. If there is no speech or it's silent, respond with an empty string.",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 1024,
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 404) {
        console.warn(`⚠️ Model ${model} not found for ASR, trying next...`);
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini ASR API error ${res.status}: ${body}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? text.trim() : '';
    } catch (err: any) {
      console.error(`Error during Gemini ASR with model ${model}:`, err.message);
      if (model === models[models.length - 1]) {
        throw err;
      }
    }
  }

  throw new Error('No available Gemini model found for ASR.');
};