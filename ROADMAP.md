<!-- Must keep this document up to date -->
# Roadmap

## chat experience (vscode and preview + cli)

- [ ] Receiving message / response should be blocking. 
    - It should support streaming or when not streaming, show nice loading indicator
    - The send message button should replace with stop button

## cli

- [x] add another alias `poe-code` for interactive CLI
- [x] `help` is broken in interactive mode
- [x] can you roll own terminal markdown renderer and add support for that. For unsupported formatting, you can just render as plaintext. 
- [x] spawn should support also poe-code (poe-cli agent)
- [ ] key-up should rotate through history messages, like old school irc client

## vscode extension (and preview)

- [ ] tool calling visual @improvements
    - format arguments nicer, not just json dump
    - show the response from the tool
    - the block should be minimal, collapsible, collapsed per default
- [ ] @ to select files
- [ ] use Tailwind for UI components
- [ ] previous chat history should be working
- [ ] key-up should rotate through history messages, like old school irc client
- [ ] The spacing in preview is missing. Add some spacing so it doesn't look to chunked together.

## issue-resolution-agent

- [ ] It should run pr checks, and currently doesn't
- [ ] support tag `poe-code` aliased to agent `poe-cli agent`

## Poe Agent
- [ ] Ability to spawn any supported sub-agents (including new worktrees)
    - only configured agents are exposed as options, see below
- [ ] configure utility should store in the own json config file also which agents are config and offer those dynamically in the tool description
