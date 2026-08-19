import type { Metadata } from "next";

import { PostRow } from "@/components/marketing/blocks";
import {
  Container,
  CtaBand,
  DisplayHeading,
  GridBackdrop,
  PosterHeading,
  Section,
} from "@/components/marketing/ui";
import { getPosts } from "@/lib/data/marketing/queries";
import { shortDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Content Library",
  description:
    "Guides and comparisons on code review, code quality and the tools around them.",
};

/** docs/SPEC-MARKETING.md §M9.2. */
export default function ContentLibraryPage() {
  const posts = getPosts("content-library");

  return (
    <>
      <Section grid={false} className="border-b border-current/10">
        <GridBackdrop variant="both" />
        <Container>
          <div className="py-24 text-center">
            <PosterHeading>Content Library.</PosterHeading>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="py-16">
            <DisplayHeading size="md" className="pb-8">
              All Posts
            </DisplayHeading>
            <div className="border-t border-current/10">
              {posts.map((post) => (
                <PostRow
                  key={post.slug}
                  href={`/content-library/${post.slug}`}
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

      <CtaBand heading="See Greptile in action on your own repository." />
    </>
  );
}
