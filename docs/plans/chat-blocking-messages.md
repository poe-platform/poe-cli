# Chat Blocking Messages Implementation Plan

## Goal
Block new user messages while assistant is responding, show loading state, and allow stopping mid-response.

## Core Components

### 1. Message State Management
- Add `isAssistantResponding` boolean to chat state
- Set true on message send, false on completion/error/stop
- Disable input when true

### 2. Loading Indicators

**CLI:**
- Spinner component during streaming
- Update on each chunk: `spinner.text = partialResponse`

**VSCode/Preview:**
- Show typing indicator bubble
- Stream text into message container with cursor animation
- Disable textarea + submit button when responding

### 3. Stop Button

**State:**
```ts
abortController = new AbortController()
onStop: () => abortController.abort()
```

**UI:**
- Replace submit button with stop button when `isAssistantResponding`
- CLI: Ctrl+C handler or inline stop option
- VSCode: Stop button in message input area

**Backend:**
```ts
signal: abortController.signal
if (signal.aborted) throw new AbortError()
// stream.destroy() on abort
```

### 4. Implementation Order
1. Add abort controller to message sending flow
2. Wire up state management (responding flag)
3. Add loading indicators to each UI
4. Implement stop button with abort logic
5. Test edge cases (network issues, rapid stops, etc.)

### 5. Edge Cases
- Handle stop during tool execution (graceful cleanup)
- Prevent message send while aborting (debounce)
- Clear partial responses on stop vs keep them
- Reconnection after abort
