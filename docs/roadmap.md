# Roadmap

- [x] Standardize lifecycle hooks naming across filenames, variables, tests, docs
- [] Model management in constants 
    - list: frontier models (used by opencode in the list)
    - string: default frontier model (used by opencode)
    - list: claude-code-only-models
    - string: default claude-code model - claude-sonnet-4.5
    - list: codex-only models
    - string: default codex model - gpt-5.1-contex
    - no other raw string mentions of models should exist
- [] spawn --model <model> cli option, that would be passed through to the agent
    - claude --model claude-sonnet-4-5
    - codex --model o3
    - opencode --model poe/claude-sonnet-4-5
- [] claude-code has this interactive selection, all configurations should support it, respect the default, but offer options. Based on the model management in constants
- [] github issue resolver
    - [] it does post some weird comment on the Issue Poe Code bot selected. Remove this comment
    - [] agent shold get the whole conversation in issue, not just the title/description. Make this a script that will format it
    - [] add tags model:<model> so the model can be overwritten and passed to agent, optional
