# VSCode History Navigation Plan

## Overview
Add arrow key navigation to rotate through previous messages in the input box.

## Implementation Steps

### 1. Message History Store
- Track submitted messages in array
- Max size limit (e.g., 50 messages)
- Current position index

### 2. Input Box Key Handler
- Listen for `onDidChangeKey` or similar VSCode input events
- Detect Up/Down arrow keys
- Handle Cmd/Ctrl modifiers if needed

### 3. Navigation Logic
```
onKeyUp: index--, show history[index]
onKeyDown: index++, show history[index] or restore draft
bounds: clamp(index, 0, history.length)
restore: save current input as draft when entering history
```

### 4. State Management
- Persist draft when navigating away
- Restore draft when navigating past end
- Clear draft on submit

### 5. Edge Cases
- Empty history
- Multi-line input handling
- Cursor position (only trigger at start/end of input)
- Don't trigger if dropdown/autocomplete is open

## Files to Modify
- Input handler/webview message handler
- Extension state/context storage
- Webview UI component (if React-based input)

## Testing
- Navigate through history
- Edit historical message
- Submit edited message
- Multi-line inputs don't interfere
