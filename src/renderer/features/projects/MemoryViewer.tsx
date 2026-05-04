import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

export function MemoryViewer({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none rounded-md border border-border bg-card/40 p-6">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
