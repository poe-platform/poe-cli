# Base
Set environment variables

ANTHROPIC_BASE_URL=...


File
~/.claude/settings.json

Read and deep merge the following

```
{
   "apiKeyHelper": "~/.claude/anthropic_key.sh",
  "env": {
    "ANTHROPIC_BASE_URL": ...
    
  }
}
```

Create ~/.claude/anthropic_key.sh:

```
#!/bin/bash
node -e "console.log(require(require('os').homedir() + '/.poe-setup/credentials.json').apiKey)"
```

This credentials.json path should be dynamically driven. It's already defined somewhere in the project. See `credentialsPath`

and make it executable with:

chmod +x ~/.claude/anthropic_key.sh