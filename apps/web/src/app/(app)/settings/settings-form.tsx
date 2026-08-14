"use client";

import { useState, useTransition } from "react";
import { Button, SettingGroup, SettingRow, Toggle, cn, useToast } from "@/components/ui";
import { MODELS } from "@/lib/models";
import { REVIEW_PROFILES, type ReviewProfile, type Settings } from "@/lib/settings-shared";
import { updateSettings } from "./actions";

export function SettingsForm({ initial, login }: { initial: Settings; login: string }) {
  // `saved` is the last-persisted state; `draft` is what the user is editing.
  // Comparing the two derives the dirty flag — no effect, no duplicated source of truth.
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const dirty =
    draft.defaultModel !== saved.defaultModel ||
    draft.postToGithubDefault !== saved.postToGithubDefault ||
    draft.reviewProfile !== saved.reviewProfile;

  function apply() {
    startTransition(async () => {
      const result = await updateSettings(draft);
      if (result.ok) {
        setSaved(draft);
        toast.success("Settings saved");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-5 pb-24">
      <SettingGroup title="Reviews">
        <SettingRow
          title="Review profile"
          description="Quiet surfaces only the most important findings. Assertive reports more, which some reviewers find nitpicky."
        >
          <div className="grid sm:grid-cols-3 gap-2">
            {REVIEW_PROFILES.map((p) => {
              const selected = draft.reviewProfile === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, reviewProfile: p.id as ReviewProfile })}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-colors",
                    selected
                      ? "border-accent-border bg-accent-dim"
                      : "border-border bg-elevated hover:border-border-strong",
                  )}
                >
                  <span
                    className={cn(
                      "block text-[13px] font-medium",
                      selected ? "text-accent" : "text-text",
                    )}
                  >
                    {p.label}
                  </span>
                  <span className="block text-[11px] text-text-dim mt-1 leading-relaxed">
                    {p.description}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingRow>

        <SettingRow
          title="Post reviews to GitHub"
          description="When on, new reviews default to publishing findings as a pull request review. You can override this per review."
          control={
            <Toggle
              checked={draft.postToGithubDefault}
              onChange={(next) => setDraft({ ...draft, postToGithubDefault: next })}
              label="Post reviews to GitHub"
            />
          }
        />

        <SettingRow
          title="Default model"
          description="Preselected on the new review screen."
          control={
            <select
              value={draft.defaultModel}
              onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
              className="h-9 min-w-52 rounded-lg border border-border bg-elevated px-3 text-sm text-text focus:outline-none focus:border-accent-border focus:ring-2 focus:ring-accent/20"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          }
        />
      </SettingGroup>

      <SettingGroup title="Account">
        <SettingRow
          title="GitHub account"
          description="Reviews are fetched and posted with this account's OAuth token."
          control={<span className="text-sm font-mono text-text-muted">{login}</span>}
        />
        <SettingRow
          title="Granted scopes"
          description="Change these by reinstalling the OAuth app on GitHub."
          control={
            <span className="flex gap-1.5">
              {["repo", "read:user"].map((scope) => (
                <code
                  key={scope}
                  className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-accent"
                >
                  {scope}
                </code>
              ))}
            </span>
          }
        />
      </SettingGroup>

      {/* Sticky unsaved-changes bar */}
      {dirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3 shadow-2xl">
          <span className="text-sm text-text">You have unsaved changes</span>
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() => setDraft(saved)}
          >
            Reset
          </Button>
          <Button variant="primary" size="sm" disabled={pending} onClick={apply}>
            {pending ? "Saving…" : "Apply changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
