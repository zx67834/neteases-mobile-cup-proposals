/**
 * Strip common Markdown markers so notices / lessons / minutes show as plain text
 * (no visible # ** * ` etc.).
 */
export function stripPlainMarkup(raw: string): string {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1$2')
    .replace(/(^|[^\w_])_([^_\n]+)_(?=[^\w_]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```\w*\n?/g, '').replace(/```/g, ''),
    )
    .replace(/^[-*+]\s+/gm, '· ')
    .replace(/^\s*---+\s*$/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // leftover markers if model emitted unpaired syntax
    .replace(/\*{1,2}/g, '')
    .replace(/_{1,2}/g, '')
    .replace(/`+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
