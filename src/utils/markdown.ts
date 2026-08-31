import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,       // Disable HTML tags in source
  xhtmlOut: false,   // Use '/' to close single tags (<br />).
  breaks: true,      // Convert '\n' in paragraphs into <br>
  linkify: true,     // Autoconvert URL-like text to links
  typographer: true,
});

// 可以在这里添加插件，比如 highlight.js 代码高亮

type MarkdownTokenLike = {
  type: string;
  content: string;
  children: MarkdownTokenLike[] | null;
}

const inlineTokenToText = (token: MarkdownTokenLike): string => {
  if (token.children?.length) {
    return token.children.map(inlineTokenToText).join('');
  }
  if (token.type === 'softbreak' || token.type === 'hardbreak') return '\n';
  if (token.type === 'text' || token.type === 'code_inline' || token.type === 'html_inline' || token.type === 'image') {
    return token.content;
  }
  return '';
}

export function renderMarkdown(content: string): string {
  if (!content) return '';
  return md.render(content);
}

export function markdownToPlainText(content: string): string {
  if (!content) return '';

  const blocks: string[] = [];
  const tokens = md.parse(content, {}) as MarkdownTokenLike[];

  for (const token of tokens) {
    if (token.type === 'inline') {
      const text = inlineTokenToText(token);
      if (text) blocks.push(text);
    } else if (token.type === 'fence' || token.type === 'code_block' || token.type === 'html_block') {
      if (token.content) blocks.push(token.content);
    }
  }

  // 正文粘贴只取 Markdown 的可见文本，纯标记内容保留原文避免整段丢失。
  return blocks.join('\n\n').trim() || content.trim();
}
