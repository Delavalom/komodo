import Link from "next/link";
import { notFound } from "next/navigation";

import type { PostCollection } from "@/lib/marketing-types";
import { getPost, getRelatedPosts } from "@/lib/data/marketing/queries";
import { shortDate } from "@/lib/utils";

import { PostRow, Prose } from "./blocks";
import { Figure } from "./figures";
import {
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  MonoLabel,
  Section,
  SectionRule,
} from "./ui";

/**
 * Post detail, shared by /blog/[slug] and /content-library/[slug].
 * docs/SPEC-MARKETING.md §M9.1, §M9.2.
 *
 * Library articles carry a table-of-contents rail; blog posts do not.
 */
export function PostPageView({
  collection,
  slug,
}: {
  collection: PostCollection;
  slug: string;
}) {
  const post = getPost(collection, slug);
  if (!post) notFound();

  const related = getRelatedPosts(post);
  const base = collection === "blog" ? "/blog" : "/content-library";
  const toc =
    collection === "content-library"
      ? post.body.filter((b) => b.kind === "h2").map((b) => b.text)
      : [];

  return (
    <>
      <Section tone="dark" grid={false} className="border-b border-current/10">
        <GridBackdrop variant="cross" />
        <Container>
          <div className="max-w-4xl py-20">
            <Link
              href={base}
              className="font-label text-[11px] uppercase tracking-[0.18em] opacity-60 underline underline-offset-4"
            >
              <span aria-hidden>←</span>{" "}
              {collection === "blog" ? "Blog" : "Content Library"}
            </Link>
            <MonoLabel className="mt-8 block opacity-60">
              {post.category}
            </MonoLabel>
            <DisplayHeading as="h1" size="lg" className="pt-4">
              {post.title}
            </DisplayHeading>
            <p className="max-w-3xl pt-6 text-lg leading-relaxed opacity-75">
              {post.dek}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-10">
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center bg-mkt-axolotl font-label text-[11px] text-mkt-basalt"
              >
                {post.author
                  .split(" ")
                  .map((w) => w[0])
                  .join("")}
              </span>
              <MonoLabel className="opacity-70">{post.author}</MonoLabel>
              <MonoLabel className="opacity-45">
                {shortDate(post.publishedAt)} · {post.readingMinutes} min read
              </MonoLabel>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div
            className={
              toc.length
                ? "grid gap-12 py-16 lg:grid-cols-[minmax(0,0.25fr)_minmax(0,1fr)]"
                : "py-16"
            }
          >
            {toc.length ? (
              <nav
                aria-label="On this page"
                className="h-max lg:sticky lg:top-28"
              >
                <MonoLabel className="block pb-4 opacity-55">
                  On this page
                </MonoLabel>
                <ul className="space-y-2 border-l border-current/15 pl-4">
                  {toc.map((entry) => (
                    <li
                      key={entry}
                      className="text-sm leading-snug opacity-65 transition-opacity hover:opacity-100"
                    >
                      {entry}
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            <article className="max-w-3xl">
              <Prose blocks={post.body} />
              <div className="pt-12">
                <Figure
                  variant="contour"
                  seed={`post-${post.slug}`}
                  caption={`fig 1. ${post.title.toLowerCase()}`}
                />
              </div>
              <p className="pt-10 text-xs leading-relaxed opacity-45">
                Placeholder editorial written for this clone — see
                docs/SPEC-MARKETING.md §M12.3.
              </p>
            </article>
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-t border-current/10">
        <Container>
          <SectionRule>Keep reading</SectionRule>
          <div className="pb-16">
            {related.map((other) => (
              <PostRow
                key={other.slug}
                href={`${base}/${other.slug}`}
                category={other.category}
                title={other.title}
                dek={other.dek}
                meta={shortDate(other.publishedAt)}
              />
            ))}
          </div>
        </Container>
      </Section>

      <CtaBand heading="Point Greptile at one busy repository and read the comments." />
    </>
  );
}
