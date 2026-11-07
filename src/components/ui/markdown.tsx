import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";

/**
 * Safe renderer for model-generated markdown: raw HTML is dropped, images and
 * iframes are disallowed, and links are limited to http(s) and open safely.
 */
export function Markdown({ children, compact, className }: { children: string; compact?: boolean; className?: string }) {
  return (
    <div className={clsx("ada-prose", compact && "compact", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img", "iframe", "script", "style"]}
        unwrapDisallowed
        urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : "")}
        components={{
          a: ({ href, children: c }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {c}
              </a>
            ) : (
              <span>{c}</span>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
