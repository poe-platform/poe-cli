# Poe Code UI - Tailwind-Only Implementation
## Zero Custom CSS Philosophy

> **Rule**: If Tailwind can do it, use Tailwind. Custom CSS ONLY for VSCode theme variables.

---

## Design Principles

### 1. Clarity Over Decoration
- Every element serves a purpose
- Use subtle borders (/20, /40) instead of heavy lines
- Embrace whitespace for breathing room
- Let content be the focus

### 2. Smooth & Responsive
- All interactions feel instant (transition on everything)
- Hover states that feel alive (opacity, scale, border changes)
- Consistent timing (Tailwind's default transitions)
- 60fps animations

### 3. Visual Hierarchy
- Font weights: regular (400), medium (500), semibold (600), bold (700)
- Size scale: text-xs (11px), text-sm (14px), text-base (16px), text-lg (18px)
- Spacing: 4px increments (gap-2, gap-3, gap-4, p-4, p-6)
- Clear parent-child relationships

### 4. Delightful Interactions
- Buttons lift on hover (hover:opacity-90)
- Cards respond to cursor (hover:border-accent/40)
- Icons scale in containers (group-hover:scale-110)
- Inputs show focus clearly (ring-2 ring-accent/10)

### 5. Professional Polish
- Consistent border-radius: rounded-lg (8px), rounded-xl (12px), rounded-2xl (16px)
- Subtle shadows: shadow-sm, shadow-md, shadow-lg, shadow-xl
- Opacity for variations: /10, /20, /40, /80, /90
- Backdrop blur for overlays (backdrop-blur-sm)

---

## The ONLY Custom CSS Needed

### Single CSS File: `tailwind.css`

```css
/* vscode-extension/src/webview/styles/tailwind.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* VSCode theme mappings - ONLY custom CSS in entire project */
    --surface: var(--vscode-editor-background);
    --surface-raised: var(--vscode-editorWidget-background);
    --text: var(--vscode-editor-foreground);
    --text-muted: var(--vscode-descriptionForeground);
    --border: var(--vscode-panel-border);
    --accent: var(--vscode-button-background);
    --accent-fg: var(--vscode-button-foreground);
    --success: var(--vscode-gitDecoration-addedResourceForeground);
    --error: var(--vscode-errorForeground);
  }
}
```

**That's it. One file. Nine variables. Done.**

---

## Tailwind Config

```javascript
// tailwind.config.cjs
module.exports = {
  content: ['./vscode-extension/src/webview/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: 'var(--surface)', raised: 'var(--surface-raised)' },
        text: { DEFAULT: 'var(--text)', muted: 'var(--text-muted)' },
        border: 'var(--border)',
        accent: { DEFAULT: 'var(--accent)', fg: 'var(--accent-fg)' },
        success: 'var(--success)',
        error: 'var(--error)',
      },
    },
  },
};
```

---

## Component Implementations (Pure Tailwind)

### Header

```tsx
<header className="flex items-center justify-between border-b border-border/20 bg-surface-raised/80 px-5 py-3 backdrop-blur">
  <div className="flex items-center gap-2.5">
    <img src={logoUrl} className="h-7 w-7 rounded-lg shadow-sm" alt="Poe" />
    <span className="text-sm font-semibold">Poe Code</span>
  </div>
  
  {/* Icon-only buttons with tooltips */}
  <div className="flex gap-1">
    <button
      className="group relative rounded-lg p-2 text-text-muted transition hover:bg-surface-raised hover:text-text"
      aria-label="Chat History"
    >
      <ClockIcon className="h-5 w-5" />
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-2 py-1 text-xs opacity-0 transition group-hover:opacity-100">
        History
      </span>
    </button>
    
    <button
      className="group relative rounded-lg p-2 text-text-muted transition hover:bg-surface-raised hover:text-text"
      aria-label="Settings"
    >
      <Cog6ToothIcon className="h-5 w-5" />
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-2 py-1 text-xs opacity-0 transition group-hover:opacity-100">
        Settings
      </span>
    </button>
    
    <button
      className="group relative rounded-lg p-2 text-text-muted transition hover:bg-surface-raised hover:text-text"
      aria-label="New Chat"
    >
      <PlusCircleIcon className="h-5 w-5" />
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-2 py-1 text-xs opacity-0 transition group-hover:opacity-100">
        New Chat
      </span>
    </button>
  </div>
</header>
```

### Message Bubbles

```tsx
{/* User */}
<div className="ml-12 rounded-2xl border border-border/20 bg-surface-raised p-4 transition hover:border-border/40">
  <div className="mb-3 flex items-center gap-3">
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white shadow-sm">
      U
    </div>
    <span className="text-xs font-semibold">You</span>
  </div>
  <div className="text-sm leading-relaxed">{content}</div>
</div>

{/* Assistant */}
<div className="rounded-2xl border border-border/20 bg-surface-raised p-4 transition hover:border-border/40">
  <div className="mb-3 flex items-center gap-3">
    <img src={logoUrl} className="h-8 w-8 rounded-full shadow-sm" alt="Poe" />
    <span className="text-xs font-semibold">Poe</span>
    <span className="ml-auto rounded bg-accent/10 px-2 py-0.5 text-[11px] text-text-muted">
      {model}
    </span>
  </div>
  <div className="prose prose-sm text-sm leading-relaxed">{content}</div>
</div>
```

### Welcome Screen

```tsx
<div className="mx-auto max-w-2xl px-6 py-12">
  <div className="mb-12 text-center">
    <img src={logoUrl} className="mx-auto mb-6 h-20 w-20 rounded-2xl shadow-lg" alt="Poe" />
    <h2 className="mb-3 text-3xl font-bold">Welcome to Poe Code</h2>
    <p className="text-base text-text-muted">
      Configure models, choose strategies, ship code faster.
    </p>
  </div>
  
  <div className="grid gap-4 sm:grid-cols-3">
    {[
      { icon: SparklesIcon, title: 'Strategies', desc: 'Smart, mixed, or fixed routing' },
      { icon: CubeIcon, title: 'Models', desc: 'Pin providers or use custom IDs' },
      { icon: CommandLineIcon, title: 'Workflows', desc: 'Tools, diffs, MCP actions' },
    ].map(({ icon: Icon, title, desc }) => (
      <div key={title} className="group cursor-pointer rounded-2xl border border-border/20 bg-surface-raised p-6 transition hover:border-accent/40 hover:shadow-md">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 transition group-hover:scale-110">
          <Icon className="h-6 w-6 text-accent" />
        </div>
        <h3 className="mb-2 font-semibold">{title}</h3>
        <p className="text-xs text-text-muted">{desc}</p>
      </div>
    ))}
  </div>
</div>
```

### Settings Panel

```tsx
<div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={close}>
  <div className="fixed right-0 top-0 bottom-0 w-full max-w-md border-l border-border bg-surface-raised shadow-2xl" onClick={e => e.stopPropagation()}>
    
    <div className="border-b border-border/20 px-6 py-6">
      <h2 className="mb-1 text-lg font-semibold">Settings</h2>
      <p className="text-xs text-text-muted">Choose model and strategy</p>
    </div>
    
    <div className="space-y-8 overflow-y-auto px-6 py-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Default model</h3>
        
        <button className="w-full rounded-xl border border-accent bg-accent/10 px-4 py-3 text-left ring-2 ring-accent/10">
          <div className="font-medium">Claude Sonnet 4.5</div>
          <div className="text-xs font-mono text-text-muted">claude-sonnet-4.5</div>
        </button>
        
        <button className="w-full rounded-xl border border-border/40 bg-surface px-4 py-3 text-left transition hover:border-accent/40">
          <div className="font-medium">GPT-4</div>
          <div className="text-xs font-mono text-text-muted">gpt-4</div>
        </button>
        
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Custom model"
            className="flex-1 rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
          <button className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg transition hover:opacity-90">
            Use
          </button>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Strategy</h3>
            <p className="text-xs text-text-muted">Let Poe choose models</p>
          </div>
          <label className="relative inline-flex cursor-pointer">
            <input type="checkbox" className="peer sr-only" />
            <div className="peer h-6 w-11 rounded-full border border-border/40 bg-surface transition peer-checked:bg-accent">
              <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
            </div>
          </label>
        </div>
        
        <button className="w-full rounded-xl border border-accent bg-surface-raised px-4 py-3 text-left">
          <div className="flex justify-between">
            <span className="text-sm font-semibold">Smart</span>
            <span className="text-xs font-semibold text-accent">Active</span>
          </div>
          <p className="mt-1 text-xs text-text-muted">AI picks best model</p>
        </button>
      </div>
    </div>
    
    <div className="border-t border-border/20 px-6 py-4">
      <div className="flex justify-between">
        <button className="rounded-lg border border-border/40 px-3 py-2 text-xs font-medium transition hover:bg-surface-raised">
          MCP Config
        </button>
        <button className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-fg transition hover:opacity-90">
          Done
        </button>
      </div>
    </div>
  </div>
</div>
```

### Composer (Message Input)

```tsx
<div className="border-t border-border/20 bg-surface px-5 py-4">
  <div className="flex items-end gap-3">
    <textarea
      className="flex-1 resize-none rounded-xl border border-border/40 bg-surface-raised px-4 py-3 text-sm leading-relaxed focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
      placeholder="Ask Poe..."
      rows={1}
      style={{ minHeight: '44px', maxHeight: '200px' }}
    />
    
    {/* Icon-only send button */}
    <button
      className="group relative flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-fg transition hover:opacity-90"
      aria-label="Send message"
    >
      <PaperAirplaneIcon className="h-5 w-5" />
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-2 py-1 text-xs opacity-0 transition group-hover:opacity-100">
        Send
      </span>
    </button>
  </div>
</div>
```

### Buttons

```tsx
{/* Primary */}
<button className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:opacity-90">
  Primary
</button>

{/* Secondary */}
<button className="rounded-xl border border-border/40 bg-surface-raised px-4 py-2.5 text-sm font-medium transition hover:border-border/60">
  Secondary
</button>

{/* Ghost */}
<button className="rounded-xl px-4 py-2.5 text-sm font-medium text-text-muted transition hover:bg-surface-raised hover:text-text">
  Ghost
</button>

{/* Icon only with tooltip */}
<button className="group relative rounded-xl p-2.5 text-text-muted transition hover:bg-surface-raised hover:text-text">
  <Cog6ToothIcon className="h-5 w-5" />
  <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-2 py-1 text-xs opacity-0 transition group-hover:opacity-100">
    Settings
  </span>
</button>

{/* Danger */}
<button className="rounded-xl bg-error px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90">
  Delete
</button>
```

### Input

```tsx
<input
  className="w-full rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
  placeholder="Type here..."
/>
```

### Toast

```tsx
<div className="pointer-events-auto min-w-80 rounded-xl border border-border/40 bg-surface-raised/90 p-4 shadow-xl backdrop-blur">
  <div className="flex items-center gap-3">
    <CheckCircleIcon className="h-5 w-5 text-success" />
    <div className="flex-1 text-sm">File saved</div>
    <button className="rounded p-1 text-text-muted transition hover:bg-surface-raised">
      <XMarkIcon className="h-5 w-5" />
    </button>
  </div>
</div>
```

---

## Patterns

### Opacity Scale
```tsx
/10  // Subtle tint
/20  // Light border
/40  // Default border
/80  // Translucent bg
/90  // Almost opaque
```

### Common Combos
```tsx
// Card
className="rounded-2xl border border-border/20 bg-surface-raised p-4 transition hover:border-border/40"

// Button
className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-90"

// Input
className="rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10"
```

---

## Tooltip Pattern

All icon buttons should have tooltips:

```tsx
<button className="group relative rounded-xl p-2.5 text-text-muted transition hover:bg-surface-raised hover:text-text">
  <IconComponent className="h-5 w-5" />
  <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-2 py-1 text-xs opacity-0 transition group-hover:opacity-100">
    Tooltip Text
  </span>
</button>
```

**Tooltip positioning**:
- Top buttons: `-bottom-8` (tooltip below)
- Bottom buttons: `-top-8` (tooltip above)
- Always: `left-1/2 -translate-x-1/2` (centered)

---

## Icon Library

Use **Heroicons** (outline variant by default):

```tsx
import {
  ClockIcon,           // History
  Cog6ToothIcon,       // Settings
  PlusCircleIcon,      // New Chat
  PaperAirplaneIcon,   // Send
  SparklesIcon,        // AI features
  CubeTransparentIcon, // Models
  CommandLineIcon,     // Code/Terminal
} from '@heroicons/react/24/outline';
```

---

## Setup

```bash
npm install @heroicons/react tailwindcss
```

```
vscode-extension/src/webview/
├── styles/
│   └── tailwind.css    # Only custom CSS
└── components/
    └── *.tsx           # Pure Tailwind
```

---

## Rules

1. NO custom CSS (except theme vars)
2. NO @apply
3. Icon buttons MUST have tooltips
4. Use rounded-xl (12px) for modern feel
5. Opacity for all variations (/10, /20, /40, /80, /90)
6. `transition` on all interactive elements
7. `group` + `group-hover:` for tooltips

---

*Last updated: 2025-10-31*
*Version: 2.0 - Tailwind Only*