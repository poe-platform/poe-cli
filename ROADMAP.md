<!-- Must keep this document up to date -->
# Roadmap

## CLI

- [ ] `login` should mention where to get teh api key https://poe.com/api_key. WHen pasting the key, it should not be shown (treat as password)
- [ ] Add option `spawn` analogous to configure/remove
    - it should take prompt and any arbitrary arguments that are passed through to the agent call
    - this must live in the service definition
    - we should utilize it for the checks like this thing `Output exactly: CLAUDE_CODE_OK`
    - not all agents support it, only claude-code, codex, opencode


## Extension redesign

- [ ] Single pane layout, only the chat interface
- [ ] Dedicated chat history page
- [ ] Top right menu items (from right)
    - New message
    - Settings
    - Chat history
- [ ] Smaller font

## WIP (do not implement) Poe Agent
- [ ] Ability to spawn any supported sub-agents (add specialized tool for this)
- [ ] configure utility should store in the own json config file also which agents are config and offer those dynamically in the tool description

## Code quality

- [ ] make sure that `credentialsPath` `.poe-setup/credentials.json` is defined in 1 single place, so it can be changed easily