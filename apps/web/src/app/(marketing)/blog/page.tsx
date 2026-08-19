import type { Metadata } from "next";

import { PostRow } from "@/components/marketing/blocks";
import { Contour } from "@/components/marketing/figures";
import {
  Container,
  DisplayHeading,
  PosterHeading,
  Section,
} from "@/components/marketing/ui";
import { getLatestPosts, getPosts } from "@/lib/data/marketing/queries";
import { shortDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Greptile Blog — Notes on code review and the agents doing it",
  description:
    "Research notes, engineering write-ups and product releases from the team building Greptile.",
};

/** docs/SPEC-MARKETING.md §M9.1. */
export default function BlogIndexPage() {
  const latest = getLatestPosts("blog", 4);
  const all = getPosts("blog");

  return (
    <>
      <Section tone="dark" grid={false} className="border-b border-current/10">
        <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden>
          <Contour seed="blog-hero" className="h-full w-full" />
        </div>
        <Container>
          <div className="relative py-28 text-center">
            <PosterHeading className="text-mkt-pollen">
              The Greptile Blog.
            </PosterHeading>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="grid gap-10 py-16 lg:grid-cols-[minmax(0,0.3fr)_minmax(0,1fr)]">
            <DisplayHeading size="lg" className="poster-type">
              Latest
            </DisplayHeading>
            <div className="border-t border-current/10">
              {latest.map((post, i) => (
                <PostRow
                  key={post.slug}
                  index={i}
                  href={`/blog/${post.slug}`}
                  category={post.category}
                  title={post.title}
                  dek={post.dek}
                  meta={`${shortDate(post.publishedAt)} · ${post.readingMinutes} min read`}
                />
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <Section grid={false} className="border-t border-current/10">
        <Container>
          <div className="py-16">
            <DisplayHeading size="md" className="pb-8">
              All Posts
            </DisplayHeading>
            <div className="border-t border-current/10">
              {all.map((post) => (
                <PostRow
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  category={post.category}
                  title={post.title}
                  dek={post.dek}
                  meta={`${shortDate(post.publishedAt)} · ${post.author}`}
                />
              ))}
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
