import type { Metadata } from "next";

import { PostPageView } from "@/components/marketing/post-page";
import { getPost, getPosts } from "@/lib/data/marketing/queries";

export function generateStaticParams() {
  return getPosts("content-library").map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost("content-library", slug);
  return post
    ? { title: post.title, description: post.dek }
    : { title: "Article not found" };
}

/** docs/SPEC-MARKETING.md §M9.2. */
export default async function LibraryArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PostPageView collection="content-library" slug={slug} />;
}
