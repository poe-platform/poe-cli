# VSCode Extension Tailwind CSS Integration Plan

## Current State
- Tailwind 3.4.18 already integrated
- PostCSS pipeline configured
- Webpack build with css-loader + postcss-loader
- VSCode theme variables mapped to CSS custom properties

## Optimization Opportunities

### 1. Build Pipeline Enhancement
- Enable JIT mode in tailwind.config.cjs (if not already)
- Configure content paths to scan all component files
- Purge unused utilities in production
```js
// tailwind.config.cjs
content: ['./vscode-extension/src/**/*.{ts,html}']
purge: { enabled: process.env.NODE_ENV === 'production' }
```

### 2. Theme Integration
- Extend Tailwind theme with VSCode color tokens
- Create semantic utility classes (bg-surface, text-muted, etc.)
- Support light/dark mode detection
```js
// theme.extend.colors
surface: 'var(--surface)',
accent: 'var(--accent)',
```

### 3. Component Styling Strategy
**Lit Components:**
- Use Tailwind @apply in Lit's static styles for scoped utilities
- Keep reactive classes in template bindings
```ts
static styles = css`
  .button { @apply px-4 py-2 rounded bg-accent; }
`;
```

**DOM Components:**
- Direct utility classes in HTML templates
- Dynamic classes via template literals

### 4. Typography & Spacing
- Define consistent spacing scale (4px base)
- Typography utilities for VSCode font stack
- Icon sizing utilities (16px, 20px, 24px)

### 5. Hot Reload Setup
- Configure Webpack dev server with CSS hot reload
- Watch mode for Tailwind rebuilds
```bash
tailwindcss -i input.css -o output.css --watch
```

### 6. Performance
- Split CSS output (critical vs. lazy-loaded)
- Tree-shake unused Lit component styles
- Minimize CSS bundle size (<50KB)

### 7. Developer Experience
- VSCode Tailwind IntelliSense extension support
- Add prettier-plugin-tailwindcss for class sorting
- Document custom utilities in README

### 8. Testing
- Visual regression tests for theme changes
- Test light/dark mode switching
- Validate CSP compliance

## Implementation Order
1. Audit current Tailwind config and optimize content paths
2. Extend theme with VSCode design tokens
3. Refactor existing components to use semantic utilities
4. Setup hot reload for faster iteration
5. Add IntelliSense and prettier integration
6. Document patterns and best practices

## Success Metrics
- CSS bundle <50KB gzipped
- All VSCode theme colors mapped
- 100% Tailwind adoption (no custom CSS)
- Hot reload <500ms
- Zero style conflicts between Lit/DOM components
