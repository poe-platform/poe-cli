# Configs

## ~/.config/opencode/config.json

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
      "poe": {
        "npm": "@ai-sdk/openai-compatible",
        "name": "poe.com",
        "options": {
            "baseURL": "https://api.poe.com/v1"
        },
        "models": {
            "Claude-Sonnet-4.5": {
                "name": "Claude Sonnet 4.5"
            },
            "GPT-5.1-Codex": {
                "name": "GPT-5.1-Codex"
            }
        }
      }
  }
}
```

## ~/.local/share/opencode/auth.json

```json
{
  "poe": {
    "type": "api",
    "key": <API_KEY>
  }
```



# Verify

`opencode models` should include "poe/Claude-Sonnet-4.5"
`opencode run "Output only: Hello" --model poe/Claude-Sonnet-4.5` should output Hello