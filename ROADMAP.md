<!-- Must keep this document up to date -->
# Roadmap

## vscode extension

- 

## cli

- [ ] add another alias `poe-code` for interactive CLI
- [ ] `help` is broken in interactive mode
- [ ] can you roll own terminal markdown renderer and add support for that. For unsupported formatting, you can just render as plaintext. 

## vscode extension

- [ ] tool calling visual @improvements
    - format arguments nicer, not just json dump
    - show the response from the tool
    - the block should be minimal, collapsible, collapsed per default
- [ ] @ to select files
- [ ] use Tailwind for UI components
- [ ] previous chat history should be working

## issue-resolution-agent

- [ ] It should run pr checks, and currently doesn't
- [ ] support poe-code agent `poe-cli agent`

## Poe Agent
- [ ] Ability to spawn any supported sub-agents (including new worktrees) (add specialized tool for this)
- [ ] configure utility should store in the own json config file also which agents are config and offer those dynamically in the tool description
