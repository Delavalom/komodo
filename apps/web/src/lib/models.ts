/** Models offered by the cloud app, with rough per-review credit ranges. */
export interface ModelOption {
  id: string;
  label: string;
  vendor: string;
  hint: string;
}

export const MODELS: ModelOption[] = [
  {
    id: "anthropic/claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    vendor: "Anthropic",
    hint: "15–80 credits",
  },
  {
    id: "anthropic/claude-opus-4-5",
    label: "Claude Opus 4.5",
    vendor: "Anthropic",
    hint: "50–300 credits",
  },
  { id: "openai/gpt-5.1", label: "GPT-5.1", vendor: "OpenAI", hint: "20–100 credits" },
  {
    id: "openai/gpt-5.1-codex",
    label: "GPT-5.1 Codex",
    vendor: "OpenAI",
    hint: "30–150 credits",
  },
  { id: "google/gemini-3-pro", label: "Gemini 3 Pro", vendor: "Google", hint: "10–60 credits" },
  {
    id: "deepseek/deepseek-v3.2",
    label: "DeepSeek V3.2",
    vendor: "DeepSeek",
    hint: "5–20 credits",
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

export function modelLabel(id: string | null): string {
  if (!id) return "—";
  return MODELS.find((m) => m.id === id)?.label ?? (id.includes("/") ? id.split("/")[1] : id);
}
