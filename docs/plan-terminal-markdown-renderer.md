# Plan: Terminal Markdown Renderer

## Goal
Implement custom terminal markdown renderer for CLI to replace current renderer, supporting basic formatting with plaintext fallback for unsupported features.

## Implementation Steps

1. **Create markdown renderer module** (`src/cli/markdown-renderer.ts`)
   - Parse markdown AST using existing library or simple regex
   - Map markdown elements to terminal ANSI codes
   - Fallback to plaintext for unsupported formatting

2. **Support core formatting**
   ```
   # Headers -> bold + color
   **bold** -> ANSI bold
   *italic* -> ANSI italic (or underline if not supported)
   `code` -> different color/background
   ```code blocks``` -> indented + colored
   - lists -> prefix with bullets
   Links -> show URL in brackets
   ```

3. **Integration points**
   - Replace current markdown renderer in CLI message display
   - Update `src/cli/interactive.ts` or equivalent
   - Ensure works with streaming responses

4. **Testing**
   - Test various markdown inputs
   - Verify ANSI codes render correctly in different terminals
   - Check plaintext fallback works

## Files to modify
- Create: `src/cli/markdown-renderer.ts`
- Modify: CLI message rendering logic (likely in `src/cli/`)
