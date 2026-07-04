import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { prepareMarkdownForView } from '../contentUtils';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export default function MarkdownView({ content, className = '' }: MarkdownViewProps) {
  const prepared = prepareMarkdownForView(content);
  if (!prepared) return null;

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{prepared}</ReactMarkdown>
    </div>
  );
}
