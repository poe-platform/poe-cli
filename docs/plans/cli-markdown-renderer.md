# CLI Markdown Renderer Plan

## Core Requirements
- Render markdown in terminal with ANSI escape codes
- Support headings, bold, italic, code blocks, lists, links
- Graceful fallback to plaintext for unsupported features
- Maintain monospace font compatibility

## Architecture
- Parser: CommonMark-compliant tokenizer
- Renderer: ANSI formatter with style stack
- Config: User-definable color scheme

## Implementation Steps

### 1. Parser Module
- Tokenize markdown AST using existing library (marked/unified)
- Walk tree nodes recursively
```
parseMarkdown(text) -> AST
walkNode(node, renderer) -> processChildren
```

### 2. ANSI Renderer
- Map markdown elements to ANSI codes
- Track style state (bold, italic, color)
- Handle nested formatting
```
render(node):
  applyStyle(node.type)
  renderChildren()
  resetStyle()
```

### 3. Supported Features
- **Headings**: Bold + color, size via prefix symbols
- **Emphasis**: `\x1b[1m` bold, `\x1b[3m` italic
- **Code**: Background color + monospace indicator
- **Lists**: Indent + bullet/number prefixes
- **Links**: Show as `text (url)` or underline text
- **Blockquotes**: Left border + indent

### 4. Fallback Strategy
- Detect terminal capabilities (env vars, tty check)
- Strip ANSI if NO_COLOR set or !tty
- Preserve readability without formatting

### 5. Integration Points
- Replace current markdown rendering in CLI output
- Add rendering config to settings
- Test against existing GFM output

## Edge Cases
- Nested formatting (bold+italic)
- Long lines wrapping mid-formatting
- Mixed code blocks (inline vs fenced)
- Terminal width detection for wrapping
- ANSI reset in multi-line constructs

## Testing
- Unit tests: Each markdown element type
- Integration: Full documents with mixed formatting
- Terminal compat: Various TERM values, tty/non-tty
