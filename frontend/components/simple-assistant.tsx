"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  SquarePen,
} from "lucide-react";
import type {
  Agent,
  AuthenticatedUser,
  ChatCompletionResponse,
  ChatMessage,
  DashboardBootstrapResponse,
  PermissionMap,
  TaskHistoryItem,
  TaskResponse,
  TokenInfo,
} from "@/components/dashboard/types";

export type { AuthenticatedUser } from "@/components/dashboard/types";

const apiBaseUrl = "/api/backend";

const actionStarters = [
  "Flag my urgent emails and draft a reply to my boss about tomorrow's review.",
  "Plan my calendar around two deep work blocks tomorrow afternoon.",
  "Analyze Nvidia and summarize the biggest market signals before lunch.",
];

const suggestionCards = [
  {
    id: "status",
    label: "Ask",
    mode: "assistant" as const,
    prompt: "Explain how this project uses Auth0, permissions, and short-lived tokens.",
  },
  {
    id: "email",
    label: "Action",
    mode: "action" as const,
    prompt: actionStarters[0],
  },
  {
    id: "schedule",
    label: "Action",
    mode: "action" as const,
    prompt: actionStarters[1],
  },
  {
    id: "market",
    label: "Action",
    mode: "action" as const,
    prompt: actionStarters[2],
  },
];

const welcomeMessage = {
  id: "welcome",
  role: "assistant" as const,
  content:
    "I can answer questions through the backend chat route or run protected actions through the task broker. Pick a suggestion or type your next request below.",
};

type ComposerMode = "assistant" | "action";

export default function SimpleAssistant({ user }: { user: AuthenticatedUser }) {
  const [mode, setMode] = useState<ComposerMode>("assistant");
  const [prompt, setPrompt] = useState(actionStarters[0]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [result, setResult] = useState<TaskResponse | null>(null);
  const [chatInput, setChatInput] = useState("What matters most in this project today?");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const feedRef = useRef<HTMLDivElement | null>(null);

  const trimmedPrompt = prompt.trim();
  const trimmedChatInput = chatInput.trim();
  const preview = result?.parsed_task ?? inferRoute(trimmedPrompt);
  const scopeCount = Object.values(permissions).flat().length;
  const visibleScopes = result?.token?.scopes ?? permissions[preview.agent_id] ?? [];
  const recentHistory = history.slice(0, 6);
  const showSuggestions = chatMessages.length === 1 && !result;

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const dashboardData = await fetchJson<DashboardBootstrapResponse>(
          `${apiBaseUrl}/dashboard/bootstrap`
        );

        if (!cancelled) {
          setAgents(dashboardData.agents);
          setHistory(dashboardData.history);
          setPermissions(dashboardData.permissions);
          setTokenInfo(dashboardData.token_info);
        }
      } catch (caughtError: unknown) {
        if (!cancelled) {
          const message =
            caughtError instanceof Error
              ? caughtError.message
              : "Start FastAPI on port 8000 or set API_BASE_URL in the frontend environment.";

          setError(`Dashboard load failed. ${message}`);
        }
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = feedRef.current;
    if (!element) {
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, result, error, chatError, isPending, isChatLoading]);

  function resetWorkspace() {
    setMode("assistant");
    setPrompt(actionStarters[0]);
    setChatInput("What matters most in this project today?");
    setResult(null);
    setError(null);
    setChatError(null);
    setChatMessages([welcomeMessage]);
  }

  function handleSuggestion(modeValue: ComposerMode, value: string) {
    setMode(modeValue);
    if (modeValue === "assistant") {
      setChatInput(value);
      return;
    }
    setPrompt(value);
  }

  function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedPrompt || isPending) {
      return;
    }

    setMode("action");
    setError(null);

    startTransition(async () => {
      try {
        const data = await fetchJson<TaskResponse>(`${apiBaseUrl}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input_text: trimmedPrompt }),
        });
        const updatedHistory = await fetchJson<TaskHistoryItem[]>(`${apiBaseUrl}/history`);
        setResult(data);
        setHistory(updatedHistory);
      } catch (caughtError: unknown) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Task submission failed.";

        setError(
          `${message} If you want real providers next, I can wire them once you share the credentials.`
        );
      }
    });
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedChatInput || isChatLoading) {
      return;
    }

    setMode("assistant");
    setChatError(null);
    setChatMessages((currentMessages) => [
      ...currentMessages,
      createChatMessage("user", trimmedChatInput),
    ]);
    setChatInput("");
    setIsChatLoading(true);

    void fetchJson<ChatCompletionResponse>(`${apiBaseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: trimmedChatInput }),
    })
      .then((data) => {
        setChatMessages((currentMessages) => [
          ...currentMessages,
          createChatMessage("assistant", data.response),
        ]);
      })
      .catch((caughtError: unknown) => {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "The assistant request failed. Confirm the backend and local model are running.";

        setChatError(message);
        setChatMessages((currentMessages) => [
          ...currentMessages,
          createChatMessage(
            "assistant",
            "I couldn't answer just now. Check the backend logs, then try again."
          ),
        ]);
      })
      .finally(() => {
        setIsChatLoading(false);
      });
  }

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-slate-900 dark:bg-[#111111] dark:text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1440px] gap-4 p-4 sm:p-6">
        <aside className="hidden w-72 shrink-0 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#171717] lg:flex lg:flex-col">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Authorized to Act
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Authorized Assistant</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              A simpler workspace for asking questions and running protected actions.
            </p>
          </div>

          <button
            type="button"
            onClick={resetWorkspace}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-white/[0.08] dark:text-slate-100">
                {getInitials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {user.email ?? user.sub}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Auth0 active
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Recent actions
            </p>
            <div className="mt-3 space-y-2">
              {recentHistory.length > 0 ? (
                recentHistory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setMode("action");
                      setPrompt(item.input_text);
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                  >
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {labelAgent(item.parsed_task.agent_id)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {item.input_text}
                    </p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                      {formatTimestamp(item.created_at)}
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-sm leading-6 text-slate-500 dark:border-white/10 dark:text-slate-400">
                  Protected actions will appear here after the first run.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Status
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>{agents.length} agents ready</p>
              <p>{scopeCount} scopes published</p>
              <p>
                {tokenInfo?.ttl_minutes
                  ? `${tokenInfo.ttl_minutes} minute tokens`
                  : "Auth0 session active"}
              </p>
            </div>
          </div>

          <a
            href="/auth/logout"
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </a>
        </aside>

        <section className="flex min-h-[calc(100vh-2rem)] min-w-0 flex-1 flex-col rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#171717]">
          <header className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                ChatGPT-style workspace
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Ask or act from one thread</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <HeaderPill icon={ShieldCheck} label="Auth0 protected" />
              <HeaderPill icon={Bot} label="/chat ready" />
              <HeaderPill icon={Sparkles} label={`${agents.length} agents`} />
            </div>
          </header>

          <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              {showSuggestions ? (
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Start with a prompt
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                    One assistant, two modes.
                  </h3>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {suggestionCards.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => handleSuggestion(card.mode, card.prompt)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          {card.label}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                          {card.prompt}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {chatMessages.map((message) => (
                <ChatBubble key={message.id} role={message.role} content={message.content} />
              ))}

              {isChatLoading ? (
                <ChatBubble role="assistant" content="Thinking through that request..." />
              ) : null}

              {isPending ? (
                <SystemCard
                  title="Running protected action"
                  description="Routing the request, checking policy, and waiting for the backend result."
                />
              ) : null}

              {result ? (
                <TaskResultCard
                  inputText={trimmedPrompt}
                  result={result}
                  tokenInfo={tokenInfo}
                  visibleScopes={visibleScopes}
                />
              ) : null}

              {error ? <SystemCard title="Action error" description={error} tone="danger" /> : null}
              {chatError ? (
                <SystemCard title="Assistant error" description={chatError} tone="danger" />
              ) : null}
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-4 dark:border-white/10 sm:px-6">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-3 flex flex-wrap gap-2">
                <ModeButton
                  active={mode === "assistant"}
                  icon={SquarePen}
                  label="Ask assistant"
                  onClick={() => setMode("assistant")}
                />
                <ModeButton
                  active={mode === "action"}
                  icon={Sparkles}
                  label="Run action"
                  onClick={() => setMode("action")}
                />
              </div>

              {mode === "assistant" ? (
                <form onSubmit={handleChatSubmit}>
                  <Composer
                    value={chatInput}
                    onChange={setChatInput}
                    placeholder="Message the assistant..."
                    submitLabel={isChatLoading ? "Thinking..." : "Send"}
                    disabled={!trimmedChatInput || isChatLoading}
                  />
                </form>
              ) : (
                <form onSubmit={handleTaskSubmit}>
                  <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      Next route: {labelAgent(preview.agent_id)}
                    </p>
                    <p className="mt-1 leading-6">
                      {preview.action} on {preview.resource}
                      {tokenInfo?.issuer ? ` via ${tokenInfo.issuer}` : ""}.
                    </p>
                  </div>
                  <Composer
                    value={prompt}
                    onChange={setPrompt}
                    placeholder="Describe the action you want the broker to run..."
                    submitLabel={isPending ? "Running..." : "Run action"}
                    disabled={!trimmedPrompt || isPending}
                  />
                </form>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {(mode === "assistant"
                  ? suggestionCards.filter((card) => card.mode === "assistant")
                  : suggestionCards.filter((card) => card.mode === "action")
                ).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSuggestion(card.mode, card.prompt)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
                  >
                    {card.prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Composer({
  value,
  onChange,
  placeholder,
  submitLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  submitLabel: string;
  disabled: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full resize-none bg-transparent px-2 py-2 text-sm leading-7 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
        placeholder={placeholder}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Shift workflows between conversation and protected execution without leaving this thread.
        </p>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {submitLabel}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Bot;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function HeaderPill({
  icon: Icon,
  label,
}: {
  icon: typeof ShieldCheck;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function ChatBubble({
  role,
  content,
}: {
  role: ChatMessage["role"];
  content: string;
}) {
  return (
    <div
      className={`rounded-[28px] px-5 py-4 ${
        role === "assistant"
          ? "border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]"
          : "ml-auto max-w-[90%] bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
        {role === "assistant" ? "Assistant" : "You"}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{content}</p>
    </div>
  );
}

function SystemCard({
  title,
  description,
  tone = "neutral",
}: {
  title: string;
  description: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={`rounded-[28px] border px-5 py-4 ${
        tone === "danger"
          ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-100"
          : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{title}</p>
      <p className="mt-2 text-sm leading-7">{description}</p>
    </div>
  );
}

function TaskResultCard({
  inputText,
  result,
  tokenInfo,
  visibleScopes,
}: {
  inputText: string;
  result: TaskResponse;
  tokenInfo: TokenInfo | null;
  visibleScopes: string[];
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Protected action
          </p>
          <h3 className="mt-2 text-lg font-semibold">
            {result.result?.summary ?? "Action completed"}
          </h3>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
            result.permission_granted
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-300/10 dark:text-emerald-200"
              : "bg-amber-100 text-amber-700 dark:bg-amber-300/10 dark:text-amber-200"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {result.permission_granted ? "Permission granted" : "Denied"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetaItem label="Prompt" value={inputText} />
        <MetaItem label="Agent" value={labelAgent(result.parsed_task.agent_id)} />
        <MetaItem label="Action" value={result.parsed_task.action} />
        <MetaItem label="Resource" value={result.parsed_task.resource} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111111]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Audit trail
        </p>
        <div className="mt-3 space-y-2">
          {result.audit_trail.map((entry, index) => (
            <div key={`${entry}-${index}`} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                {index + 1}
              </span>
              <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{entry}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {visibleScopes.map((scope) => (
          <span
            key={scope}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-slate-600 dark:border-white/10 dark:bg-[#111111] dark:text-slate-300"
          >
            {scope}
          </span>
        ))}
        {visibleScopes.length === 0 ? (
          <span className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-slate-400 dark:border-white/10 dark:text-slate-500">
            No scopes returned
          </span>
        ) : null}
      </div>

      {result.token || tokenInfo?.note ? (
        <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          <Clock3 className="h-4 w-4" />
          {result.token
            ? `Expires ${new Date(result.token.expires_at).toLocaleString()}`
            : tokenInfo?.note}
        </div>
      ) : null}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#111111]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}

function inferRoute(inputText: string) {
  const normalized = inputText.toLowerCase();
  if (["email", "mail", "send", "draft", "reply"].some((term) => normalized.includes(term))) {
    return {
      agent_id: "email-agent",
      action: normalized.includes("draft") ? "draft" : "send",
      resource: "gmail-api",
      confidence: "high" as const,
      reasoning: "The request looks like email work, so the email agent is the best fit.",
    };
  }
  if (["calendar", "meeting", "schedule", "invite"].some((term) => normalized.includes(term))) {
    return {
      agent_id: "calendar-agent",
      action: ["show", "check", "read"].some((term) => normalized.includes(term))
        ? "read"
        : "schedule",
      resource: "google-calendar",
      confidence: "high" as const,
      reasoning: "The request reads like a scheduling task, so the calendar agent is most likely.",
    };
  }
  return {
    agent_id: "finance-agent",
    action: "analyze",
    resource: "market-data",
    confidence: "medium" as const,
    reasoning:
      "This falls back to the finance agent because it does not match email or calendar language.",
  };
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | { detail?: unknown } | null;
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload ? payload.detail : null;
    throw new Error(
      typeof detail === "string" ? detail : `Request failed with status ${response.status}`
    );
  }
  return payload as T;
}

function createChatMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function labelAgent(agentId: string) {
  return agentId
    .split("-")
    .map((segment) => `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`)
    .join(" ");
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recent";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
