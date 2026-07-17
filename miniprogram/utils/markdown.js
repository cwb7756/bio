// utils/markdown.js
// 轻量 Markdown 解析器：将 AI 回复文本解析为块级节点数组，供 WXML 双层 wx:for 渲染
// 支持语法：标题(#/##/###)、加粗(**text**)、行内代码(`code`)、代码块(```)、
//          无序列表(-/*)、有序列表(1.)、引用(>)、普通段落
// 流式友好：未闭合的标记按普通文本容错处理，可对不完整文本反复全量解析

// 解析行内语法 -> segments: [{ type: 'text'|'bold'|'code'|'link'|'image', text?, url?, alt? }]
function parseInline(text) {
  const segments = [];
  // 第一步：按行内代码 `code` 拆分
  const codeRe = /`([^`]+)`/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = codeRe.exec(text))) {
    if (m.index > last) parts.push({ isCode: false, val: text.slice(last, m.index) });
    parts.push({ isCode: true, val: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ isCode: false, val: text.slice(last) });

  // 第二步：非代码部分处理图片 ![](url)、链接 [](url)、加粗 **text**
  // 注意：图片正则在链接之前，确保 ![alt](url) 不会被误匹配为链接
  const combinedRe = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.isCode) {
      segments.push({ type: 'code', text: p.val });
      continue;
    }
    let l = 0;
    let mm;
    combinedRe.lastIndex = 0;
    while ((mm = combinedRe.exec(p.val))) {
      if (mm.index > l) segments.push({ type: 'text', text: p.val.slice(l, mm.index) });
      if (mm[1] !== undefined) {
        // 图片: ![alt](url)
        segments.push({ type: 'image', alt: mm[1], url: mm[2] });
      } else if (mm[3] !== undefined) {
        // 链接: [text](url)
        segments.push({ type: 'link', text: mm[3], url: mm[4] });
      } else {
        // 加粗: **text**
        segments.push({ type: 'bold', text: mm[5] });
      }
      l = mm.index + mm[0].length;
    }
    if (l < p.val.length) segments.push({ type: 'text', text: p.val.slice(l) });
  }

  if (segments.length === 0) segments.push({ type: 'text', text: '' });
  return segments;
}

// 解析整段文本 -> blocks: [{ type: 'h1'|'h2'|'h3'|'p'|'li'|'oli'|'quote'|'code',
//                              segments?, text?, lang?, num? }]
function parseMarkdown(text) {
  if (!text) return [];
  const lines = String(text).split('\n');
  const blocks = [];
  let inCode = false;
  let codeLang = '';
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 代码块内部：原样累积，直到闭合 ```
    if (inCode) {
      if (/^```/.test(trimmed)) {
        blocks.push({ type: 'code', text: codeLines.join('\n'), lang: codeLang });
        inCode = false;
        codeLines = [];
        codeLang = '';
      } else {
        codeLines.push(line);
      }
      continue;
    }

    // 代码块开始
    if (/^```/.test(trimmed)) {
      inCode = true;
      codeLang = trimmed.slice(3).trim();
      codeLines = [];
      continue;
    }

    // 空行跳过（块间距由样式控制）
    if (!trimmed) continue;

    let m;
    if ((m = trimmed.match(/^(#{1,3})\s+(.*)$/))) {
      blocks.push({ type: 'h' + m[1].length, segments: parseInline(m[2]) });
    } else if ((m = trimmed.match(/^[-*]\s+(.*)$/))) {
      blocks.push({ type: 'li', segments: parseInline(m[1]) });
    } else if ((m = trimmed.match(/^(\d+)[.、]\s*(.*)$/))) {
      blocks.push({ type: 'oli', num: m[1], segments: parseInline(m[2]) });
    } else if ((m = trimmed.match(/^>\s?(.*)$/))) {
      blocks.push({ type: 'quote', segments: parseInline(m[1]) });
    } else {
      blocks.push({ type: 'p', segments: parseInline(trimmed) });
    }
  }

  // 流式场景：代码块未闭合时，把已累积内容作为代码块输出
  if (inCode && codeLines.length) {
    blocks.push({ type: 'code', text: codeLines.join('\n'), lang: codeLang });
  }

  return blocks;
}

module.exports = { parseMarkdown };
