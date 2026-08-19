"use client";

import { useState } from "react";
import { Building2, Clock, Mail, User, Users } from "lucide-react";

import { cn } from "@/lib/utils";

import { ChamferButton, Container, MonoLabel, Section } from "./ui";

/**
 * Contact form. docs/SPEC-MARKETING.md §M10.1.
 *
 * Inert by design (§M12.3): it validates, then shows an inline success state.
 * Nothing is posted anywhere, and no field value leaves the component.
 */
const TEAM_SIZES = [
  "Select team size",
  "1–10 engineers",
  "11–50 engineers",
  "51–200 engineers",
  "201–1000 engineers",
  "1000+ engineers",
];

type Errors = Partial<Record<"firstName" | "lastName" | "email", string>>;

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  if (sent) {
    return (
      <Section>
        <Container>
          <div className="mx-auto max-w-2xl border border-current/15 bg-current/[0.03] px-8 py-16 text-center">
            <span
              aria-hidden
              className="mx-auto mb-6 block h-3 w-3 bg-mkt-green"
            />
            <p className="font-display text-2xl font-semibold tracking-[-0.02em]">
              Thanks — that&apos;s with us.
            </p>
            <p className="mx-auto max-w-md pt-4 text-sm leading-relaxed opacity-70">
              Someone will reply within a working day. In the meantime you can
              start a trial without talking to anyone.
            </p>
            <MonoLabel className="mt-8 block opacity-45">
              This form is inert in the clone — nothing was sent.
            </MonoLabel>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-6 font-label text-[11px] uppercase tracking-[0.18em] underline underline-offset-4 opacity-60"
            >
              Back to the form
            </button>
          </div>
        </Container>
      </Section>
    );
  }

  return (
    <Section>
      <Container>
        <form
          noValidate
          className="mx-auto grid max-w-2xl gap-6 py-16"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const next: Errors = {};
            if (!String(data.get("firstName") ?? "").trim())
              next.firstName = "Required";
            if (!String(data.get("lastName") ?? "").trim())
              next.lastName = "Required";
            const email = String(data.get("email") ?? "").trim();
            if (!email) next.email = "Required";
            else if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email))
              next.email = "Enter a work email address";
            setErrors(next);
            if (Object.keys(next).length === 0) setSent(true);
          }}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              name="firstName"
              label="First Name"
              placeholder="John"
              icon={<User size={12} />}
              error={errors.firstName}
            />
            <Field
              name="lastName"
              label="Last Name"
              placeholder="Doe"
              icon={<User size={12} />}
              error={errors.lastName}
            />
            <Field
              name="email"
              label="Work Email"
              type="email"
              placeholder="john@company.com"
              icon={<Mail size={12} />}
              error={errors.email}
            />
            <Field
              name="company"
              label="Company Name"
              placeholder="Acme Inc."
              icon={<Building2 size={12} />}
            />
          </div>

          <label className="block">
            <FieldLabel icon={<Users size={12} />}>
              How many engineers?
            </FieldLabel>
            <select
              name="teamSize"
              defaultValue={TEAM_SIZES[0]}
              className="mt-2 w-full border border-current/20 bg-transparent px-4 py-3 font-label text-sm outline-none focus:border-mkt-green"
            >
              {TEAM_SIZES.map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <FieldLabel icon={<Clock size={12} />}>
              What would be helpful for us to know before the call?
            </FieldLabel>
            <textarea
              name="notes"
              rows={5}
              placeholder="Tell us about your team, your codebase, and what you're looking to achieve..."
              className="mt-2 w-full resize-y border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-mkt-green"
            />
          </label>

          <div>
            <ChamferButton type="submit" tone="green">
              Send it
            </ChamferButton>
          </div>
        </form>
      </Container>
    </Section>
  );
}

function FieldLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 opacity-70">
      <span aria-hidden>{icon}</span>
      <MonoLabel>{children}</MonoLabel>
    </span>
  );
}

function Field({
  name,
  label,
  placeholder,
  icon,
  type = "text",
  error,
}: {
  name: string;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  type?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <FieldLabel icon={icon}>{label}</FieldLabel>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={cn(
          "mt-2 w-full border bg-transparent px-4 py-3 text-sm outline-none focus:border-mkt-green",
          error ? "border-mkt-bloom" : "border-current/20",
        )}
      />
      {error ? (
        <MonoLabel className="mt-1 block text-mkt-bloom">{error}</MonoLabel>
      ) : null}
    </label>
  );
}
