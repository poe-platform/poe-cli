# Roadmap

## Store current configurations

- [ ] credentials.json should store configured services as configured_services: { "opencode": { "version": "", "files"}}
- [ ] when running checks for binaries, run <binary> --version and extract the version semver from response

## Provider versioning

Different versions of coding assistants require different setups. The version is the agent version e.g. claude --version

- [ ] Add ability to define multiple versions of service, follow semver patterns
    - each should have something like * to match all
    - we'll need like >1.0.0
    - all functions like configure / remove / spawn
    - we should be able to reuse them if needed
- [ ] we'll need "doctor" command that will check versions of all installed agents and removes the old, and adds new