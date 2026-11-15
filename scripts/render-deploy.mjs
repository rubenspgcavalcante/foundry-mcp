import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const envFile = resolve(process.env.DEPLOY_ENV_FILE ?? '.env.deploy.local');
const outputDir = resolve(process.env.DEPLOY_OUTPUT_DIR ?? 'dist/deploy');

function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

let values;
try {
  values = parseEnv(await readFile(envFile, 'utf8'));
} catch {
  console.error(`Missing ${envFile}. Copy .env.deploy.example to .env.deploy.local first.`);
  process.exit(1);
}

const required = [
  'DEPLOY_DOMAIN',
  'DEPLOY_SERVER_IP',
  'DEPLOY_SSH_USER',
  'DEPLOY_SERVICE_USER',
  'DEPLOY_APP_DIR',
  'DEPLOY_NODE_PATH',
  'DEPLOY_FOUNDRY_DATA_DIR',
];
const missing = required.filter((key) => !values[key]);
if (missing.length > 0) {
  console.error(`Missing deployment values: ${missing.join(', ')}`);
  process.exit(1);
}

const render = (template) =>
  template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`No value for ${key}`);
    return values[key];
  });

await mkdir(outputDir, { recursive: true });
for (const filename of ['foundry.nginx', 'foundry-mcp.service']) {
  const template = await readFile(resolve('deploy', filename), 'utf8');
  await writeFile(resolve(outputDir, filename), render(template));
}

const codexConfig = `# Generated locally from .env.deploy.local; do not commit.\n\n[mcp_servers.foundry]\nurl = "https://${values.DEPLOY_DOMAIN}/mcp"\nbearer_token_env_var = "FOUNDRY_MCP_KEY"\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n`;
await writeFile(resolve(outputDir, 'codex.config.toml'), codexConfig);

const connection = `DEPLOY_SERVER_IP=${values.DEPLOY_SERVER_IP}\nDEPLOY_SSH_USER=${values.DEPLOY_SSH_USER}\n`;
await writeFile(resolve(outputDir, 'ssh-connection.env'), connection, { mode: 0o600 });

console.log(`Rendered deployment files to ${outputDir}`);
