"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { FaqItem } from "@/lib/marketing-types";
import { cn } from "@/lib/utils";

import { DisplayHeading } from "./ui";

/**
 * The FAQ accordion. docs/SPEC-MARKETING.md §M4.11.
 *
 * Dashed rule between rows, chevron on the right, one row open at a time.
 * State is local rather than in the URL: the original does not deep-link an
 * open question, so neither do we.
 */
export function Faq({
  items,
  heading = "FAQ",
  footer = true,
}: {
  items: FaqItem[];
  heading?: string | null;
  footer?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mx-auto w-full max-w-4xl py-20">
      {heading ? (
        <DisplayHeading size="lg" className="pb-10 text-center">
          {heading}
        </DisplayHeading>
      ) : null}

      <div>
        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={item.question}
              className="border-b border-dashed border-current/25"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-6 py-5 text-left"
              >
                <span className="font-display text-base font-semibold tracking-[-0.01em] lg:text-lg">
                  {item.question}
                </span>
                <ChevronDown
                  size={18}
                  aria-hidden
                  className={cn(
                    "shrink-0 opacity-55 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen ? (
                <p className="max-w-3xl pb-6 text-[15px] leading-relaxed opacity-75">
                  {item.answer}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {footer ? (
        <p className="pt-10 text-center text-sm opacity-65">
          Can&apos;t find your answer here?{" "}
          <Link href="/contact" className="underline underline-offset-4">
            Get in touch
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
