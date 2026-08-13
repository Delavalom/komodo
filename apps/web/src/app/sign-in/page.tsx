import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui";

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect("/");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <span className="text-4xl mb-4">🦎</span>
          <h1 className="text-2xl font-bold text-text tracking-tight">
            Welcome to <span className="text-accent">Komodo</span>
          </h1>
          <p className="text-sm text-text-dim mt-2 max-w-sm leading-relaxed">
            AI code reviews posted straight to your GitHub pull requests, using your own OAuth
            token.
          </p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <form
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/" });
            }}
          >
            <Button type="submit" variant="primary" className="w-full h-11">
              <svg className="size-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
              Continue with GitHub
            </Button>
          </form>

          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-dim mb-2.5">
              Requested scopes
            </p>
            <ul className="space-y-2 text-xs text-text-dim">
              <li className="flex items-start gap-2">
                <code className="shrink-0 px-1.5 py-0.5 rounded bg-surface-2 border border-border font-mono text-accent">
                  repo
                </code>
                <span className="leading-relaxed">
                  Read pull request diffs and post review comments on your behalf.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <code className="shrink-0 px-1.5 py-0.5 rounded bg-surface-2 border border-border font-mono text-accent">
                  read:user
                </code>
                <span className="leading-relaxed">Identify your account.</span>
              </li>
            </ul>
          </div>
        </div>

        <p className="text-center text-[11px] text-text-faint mt-6">
          Open source ·{" "}
          <a
            href="https://github.com/Delavalom/komodo"
            className="text-text-dim hover:text-text transition-colors underline"
          >
            MIT licensed
          </a>
        </p>
      </div>
    </div>
  );
}
