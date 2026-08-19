import type { Metadata } from "next";

import { PostPageView } from "@/components/marketing/post-page";
import { getPost, getPosts } from "@/lib/data/marketing/queries";

export function generateStaticParams() {
  return getPosts("blog").map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost("blog", slug);
  return post
    ? { title: post.title, description: post.dek }
    : { title: "Post not found" };
}

/** docs/SPEC-MARKETING.md §M9.1. */
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PostPageView collection="blog" slug={slug} />;
}
