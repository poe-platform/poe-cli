# Implementation Plan

## Chat Experience (VSCode/Preview + CLI)

### Blocking message reception
- Add loading states to UI components
- Replace send button with stop button during requests
- Implement streaming response handler with visual feedback
```pseudo
if (isStreaming) showStreamingIndicator()
else showLoadingSpinner()
toggleButton(send -> stop)
```

## CLI Improvements

### Terminal markdown renderer
- Create custom renderer for supported markdown features
- Fallback to plaintext for unsupported formatting
- Integrate into CLI output pipeline

### History navigation (key-up)
- Store message history in session array
- Bind up-arrow to cycle through previous messages
- Implement IRC-style history rotation

## VSCode Extension

### Tool calling UI improvements
- Format arguments as readable key-value pairs
- Add collapsible tool response blocks (collapsed by default)
- Minimize visual footprint

### File selection (@-mentions)
- Add @ trigger for file picker
- Fuzzy search through workspace files
- Insert file references into message

### Tailwind integration
- Add Tailwind to build pipeline
- Migrate existing UI components
- Update preview styling

### Message spacing
- Add vertical spacing between message blocks
- Improve visual hierarchy

## Issue Resolution Agent

### PR checks execution
- Add PR check runner to agent workflow
- Report check results in agent output

### Tag alias support
- Map `poe-code` tag to `poe-cli agent`
- Update tag resolution logic

## Poe Agent Core

### Dynamic sub-agent spawning
- Expose configured agents in tool descriptions
- Support worktree spawning for all agent types
- Read agent list from config file

### Config management
- Store agent configuration in dedicated JSON
- Update configure utility to manage agent list
- Dynamically generate tool descriptions from config
