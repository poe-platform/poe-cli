# CLI History Navigation Plan

## Overview
Implement IRC-style arrow key navigation to cycle through previous messages in the CLI input.

## Components

### History Storage
- Maintain array of submitted messages in memory
- Max size configurable (default: 100)
- Persist to `.claude/history` file between sessions

### Navigation State
- Current position in history array
- Temporary buffer for unsent message when navigating away
- Reset position on submit

### Input Handler
- Up arrow: move back in history, save current input first time
- Down arrow: move forward, restore temp buffer at end
- On edit during history view: preserve current history item
- On submit: append to history, reset position

### Pseudocode
```
onKeyUp:
  if pos == -1: tempBuf = currentInput
  pos = max(0, pos - 1)
  input.value = history[pos]
```

## Files to Modify
- `src/cli/input.ts` or equivalent readline wrapper
- `src/cli/state.ts` for history array management
- `src/config/` for history persistence

## Edge Cases
- Empty history array
- Duplicate consecutive messages (skip or include?)
- Multi-line messages handling
- Clear history command
