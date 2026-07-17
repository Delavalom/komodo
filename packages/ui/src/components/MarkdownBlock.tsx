import { marked } from "marked";
import { useMemo } from "react";

interface Props {
  content: string;
}

export function MarkdownBlock({ content }: Props) {
  const html = useMemo(() => {
    const result = marked.parse(content);
    // marked.parse is synchronous when no async extensions are configured
    return typeof result === "string" ? result : "";
  }, [content]);

  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
