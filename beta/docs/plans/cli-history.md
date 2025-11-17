# CLI Key-Up History Rotation Plan

## Current State
- Interactive CLI built with Ink/React (`src/cli/interactive.tsx`)
- Uses `useInput` hook for keyboard events (line 216)
- Text input handled by `ink-text-input` component (line 512)
- File picker has arrow key navigation (lines 250-278)
- No history rotation currently implemented

## Implementation Plan

### 1. Add History State
- Add state to track user message history
- Add index pointer for current position in history

```ts
const [messageHistory, setMessageHistory] = useState<string[]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);
```

### 2. Capture User Messages
- When user submits input, save to history array
- Reset history index to -1 (not browsing)

```ts
// In handleSubmit()
setMessageHistory(prev => [...prev, trimmedInput]);
setHistoryIndex(-1);
```

### 3. Handle Up Arrow Key
- Intercept up arrow in `useInput` when NOT in file picker
- Navigate backwards through history (increase index)
- Update input field with historical message

```ts
if (key.upArrow && !showFilePicker && !isResponding) {
  const newIdx = Math.min(historyIndex + 1, messageHistory.length - 1);
  setHistoryIndex(newIdx);
  updateInput(messageHistory[messageHistory.length - 1 - newIdx]);
}
```

### 4. Handle Down Arrow Key
- Navigate forwards through history (decrease index)
- When index reaches -1, clear input (back to current)

```ts
if (key.downArrow && !showFilePicker && !isResponding && historyIndex > -1) {
  const newIdx = historyIndex - 1;
  setHistoryIndex(newIdx);
  updateInput(newIdx === -1 ? "" : messageHistory[messageHistory.length - 1 - newIdx]);
}
```

### 5. Reset on Manual Edit
- When user types (not arrow keys), exit history mode
- Set index back to -1 if they manually change input

## Files to Modify
- `src/cli/interactive.tsx` - Add history state and arrow key handlers

## Edge Cases
- Don't rotate during file picker (already handled)
- Don't rotate when AI is responding
- Empty inputs shouldn't be saved to history
- Preserve file picker arrow key behavior
