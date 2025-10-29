# Fully Automated API Configuration Management

JavaScript scripts to create and remove API configurations in Roo Code with **zero manual setup required**. These scripts automatically handle VSCode settings configuration.

## Understanding Roo Code Configuration Storage

### Default Storage (Built-in)

By default, Roo Code stores all configuration in **VSCode's Secret Storage** (encrypted), not in a file:

- **macOS**: Keychain
- **Linux**: Secret Service API (libsecret)
- **Windows**: Credential Manager

This is secure and automatic - no file management needed.

### Optional File-Based Auto-Import

The scripts in this document use an **optional auto-import feature** that:
1. Creates a configuration file at `~/Documents/roo-config.json`
2. Configures VSCode to automatically import settings from this file on startup
3. Allows programmatic configuration management via scripts

**Important**: The `~/Documents/roo-config.json` file only exists if you create it using these scripts. It's not the default storage location.

## How Auto-Import Works

The scripts automatically:
1. Create/modify the configuration file at `~/Documents/roo-config.json`
2. Update VSCode settings to set `roo-cline.autoImportSettingsPath` to point to this file
3. On VSCode restart, Roo Code imports settings from the file into its secure storage

## Create API Configuration

### JavaScript Script

Save as `create-api-config.js`:

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function getVSCodeSettingsPath() {
  const platform = os.platform();
  const home = os.homedir();
  
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  } else if (platform === 'linux') {
    return path.join(home, '.config', 'Code', 'User', 'settings.json');
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA, 'Code', 'User', 'settings.json');
  }
  return null;
}

function configureVSCodeSettings() {
  const settingsPath = getVSCodeSettingsPath();
  if (!settingsPath) {
    console.log('⚠️  Could not determine VSCode settings path');
    return false;
  }
  
  try {
    // Create directory if needed
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    
    // Read or create settings
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    
    // Add auto-import path
    settings['roo-cline.autoImportSettingsPath'] = '~/Documents/roo-config.json';
    
    // Write back
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    
    console.log('✅ VSCode settings auto-configured');
    return true;
  } catch (error) {
    console.log(`⚠️  Could not update VSCode settings: ${error.message}`);
    return false;
  }
}

function createConfig(name, apiKey, baseUrl = 'https://api.openai.com/v1', modelId = 'gpt-4') {
  const configFile = path.join(os.homedir(), 'Documents', 'roo-config.json');
  
  // Generate unique ID
  const configId = crypto.createHash('md5').update(Date.now().toString()).digest('hex').substring(0, 10);
  
  // Read existing or create new
  let config;
  if (fs.existsSync(configFile)) {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } else {
    config = {
      providerProfiles: {
        currentApiConfigName: '',
        apiConfigs: {},
        modeApiConfigs: {}
      }
    };
  }
  
  // Add new config
  config.providerProfiles.apiConfigs[name] = {
    id: configId,
    apiProvider: 'openai',
    openAiApiKey: apiKey,
    openAiModelId: modelId,
    openAiBaseUrl: baseUrl,
    rateLimitSeconds: 0,
    diffEnabled: true
  };
  
  // Set as current
  config.providerProfiles.currentApiConfigName = name;
  
  // Write back
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  
  console.log(`✅ Created config: ${name}`);
  console.log(`   ID: ${configId}`);
  console.log(`   Model: ${modelId}`);
  console.log(`   URL: ${baseUrl}`);
  
  // Auto-configure VSCode
  configureVSCodeSettings();
  
  console.log('\n🔄 Restart VSCode to apply changes');
  console.log('   No manual configuration needed!');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node create-api-config.js <name> <api-key> [base-url] [model-id]');
    process.exit(1);
  }
  
  const [name, apiKey, baseUrl, modelId] = args;
  createConfig(name, apiKey, baseUrl, modelId);
}

module.exports = { createConfig };
```

**Usage:**
```bash
chmod +x create-api-config.js

# Create with defaults
node create-api-config.js my-config sk-your-key-here

# Create with custom URL and model
node create-api-config.js azure-config sk-key https://your.openai.azure.com gpt-4
```

## Remove API Configuration

### JavaScript Script

Save as `remove-api-config.js`:

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

function removeConfig(name) {
  const configFile = path.join(os.homedir(), 'Documents', 'roo-config.json');
  
  if (!fs.existsSync(configFile)) {
    console.error(`Error: Config file not found at ${configFile}`);
    process.exit(1);
  }
  
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  
  if (!config.providerProfiles.apiConfigs[name]) {
    console.error(`Error: Config '${name}' not found`);
    process.exit(1);
  }
  
  // Remove config
  delete config.providerProfiles.apiConfigs[name];
  
  // If it was the current config, clear it
  if (config.providerProfiles.currentApiConfigName === name) {
    const remaining = Object.keys(config.providerProfiles.apiConfigs);
    config.providerProfiles.currentApiConfigName = remaining[0] || '';
  }
  
  // Write back
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  
  console.log(`✅ Removed config: ${name}`);
  console.log('🔄 Restart VSCode to apply changes');
}

if (require.main === module) {
  if (process.argv.length < 3) {
    console.log('Usage: node remove-api-config.js <name>');
    process.exit(1);
  }
  
  removeConfig(process.argv[2]);
}

module.exports = { removeConfig };
```

**Usage:**
```bash
node remove-api-config.js my-config
```

## List Configurations

### JavaScript Script

Save as `list-api-configs.js`:

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const configFile = path.join(os.homedir(), 'Documents', 'roo-config.json');

if (!fs.existsSync(configFile)) {
  console.log('No configurations found');
  process.exit(0);
}

const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

console.log('API Configurations:');
console.log('='.repeat(50));

for (const [name, cfg] of Object.entries(config.providerProfiles.apiConfigs)) {
  console.log(`\n${name}`);
  console.log(`  ID: ${cfg.id || 'N/A'}`);
  console.log(`  Provider: ${cfg.apiProvider || 'N/A'}`);
  console.log(`  Model: ${cfg.openAiModelId || 'N/A'}`);
  console.log(`  URL: ${cfg.openAiBaseUrl || 'N/A'}`);
}

const current = config.providerProfiles.currentApiConfigName;
console.log(`\nCurrent: ${current}`);
```

**Usage:**
```bash
node list-api-configs.js
```

## Quick Reference

```bash
# Create configuration
node create-api-config.js my-config sk-your-key-here

# Create with custom settings
node create-api-config.js azure sk-key https://your.azure.com gpt-4

# List all configurations
node list-api-configs.js

# Remove configuration
node remove-api-config.js my-config

# After any change, restart VSCode
```

## Manual Configuration of Auto-Import

If you prefer to configure the auto-import path manually instead of using the scripts:

### Via VSCode UI

1. Open VSCode Settings (Cmd/Ctrl + ,)
2. Search for "roo-cline.autoImportSettingsPath"
3. Set the value to your config file path (e.g., `~/Documents/roo-config.json`)
4. Restart VSCode

### Via CLI (settings.json)

Edit your VSCode settings file directly:

**macOS:**
```bash
# Edit settings
code ~/Library/Application\ Support/Code/User/settings.json

# Add this line:
# "roo-cline.autoImportSettingsPath": "~/Documents/roo-config.json"
```

**Linux:**
```bash
# Edit settings
code ~/.config/Code/User/settings.json

# Add this line:
# "roo-cline.autoImportSettingsPath": "~/Documents/roo-config.json"
```

**Windows (PowerShell):**
```powershell
# Edit settings
code $env:APPDATA\Code\User\settings.json

# Add this line:
# "roo-cline.autoImportSettingsPath": "~/Documents/roo-config.json"
```

### Via Command Line (One-liner)

**macOS/Linux:**
```bash
# Add auto-import path to VSCode settings
echo '"roo-cline.autoImportSettingsPath": "~/Documents/roo-config.json"' | \
  jq -s '.[0] * .[1]' ~/Library/Application\ Support/Code/User/settings.json - > /tmp/settings.json && \
  mv /tmp/settings.json ~/Library/Application\ Support/Code/User/settings.json
```

**Note**: Requires `jq` to be installed. Adjust path for Linux (`~/.config/Code/User/settings.json`).

## Notes

- All scripts modify `~/Documents/roo-config.json` (optional auto-import file)
- **VSCode settings are automatically configured** by the scripts - no manual setup needed
- Changes take effect after VSCode restart
- API keys in the auto-import file are stored in plain text - keep file secure (`chmod 600 ~/Documents/roo-config.json`)
- Scripts preserve existing configurations when adding new ones
- Works on macOS, Linux, and Windows
- **Remember**: The auto-import file is optional. Without it, Roo Code uses VSCode's secure encrypted storage