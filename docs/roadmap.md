# Roadmap

## Split out install

Most of the time, users don't want to install, but the installation is super useful for CI/CD

- [ ] split out into separate command, don't run automatically
- [ ] the configure should not have a check for install at all, it should just execute
- [ ] update the github workflows

## Issue resolution triggers

- [ ] Change the triggers for issue resolver e.g. claude-code to agent:claude-code

## Generated labels

- [ ] add npm task to generate labels
    - it should generate the github workflow labels definition
    - it should generate label for each service that has spawn option
    - it should defined colors, use the lightmode colors
    - write it into doc, after adding a new provider, run the task

## Disabled providers

- [ ] Add option to disable the service (similar to branding) disabled=true
- [ ] disable roo code

## Github bot

- [ ] Configure a Github bot with following features
    - The repo must have defined POE_API_TOKEN (or whatever is the current name) otherwise throw exception
    - Name is `Poe Code`, is should have a logo from images here beta/vscode-extension/poe-logo.png
    - When issue assigned, agent will execute issue resolver
- [ ] It must support various label
    - agent:<service>
    - when not provided it will execute the first coding agent as default 
        `spawn --yes`
        `configure --yes`
    - poe-code - the default showing the options 1, 2, 3, should show (default) for the first agent
    - no concept of default, just take first