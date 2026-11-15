import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DeploymentValues } from './deploy-env.js';

type GeneratedFile = {
  filename: string;
  content: string;
  mode?: number;
};

const TEMPLATE_DIRECTORY = 'deploy';
const DEPLOYMENT_TEMPLATES = ['foundry.nginx', 'foundry-mcp.service'];

const renderTemplate = (template: string, values: DeploymentValues): string =>
  template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) => {
    const value = values[key];

    if (value === undefined) {
      throw new Error(`No value for ${key}`);
    }

    return value;
  });

const renderTemplateFile = async (filename: string, values: DeploymentValues, outputDir: string): Promise<void> => {
  const templatePath = resolve(TEMPLATE_DIRECTORY, filename);
  const outputPath = resolve(outputDir, filename);
  const template = await readFile(templatePath, 'utf8');
  const renderedTemplate = renderTemplate(template, values);

  await writeFile(outputPath, renderedTemplate);
};

const createCodexConfig = (domain: string): string =>
  `# Generated locally from .env.deploy.local; do not commit.\n\n[mcp_servers.foundry]\nurl = "https://${domain}/mcp"\nbearer_token_env_var = "FOUNDRY_MCP_KEY"\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n`;

const createConnectionEnvironment = (values: DeploymentValues): string =>
  `DEPLOY_SERVER_IP=${values.DEPLOY_SERVER_IP}\nDEPLOY_SSH_USER=${values.DEPLOY_SSH_USER}\n`;

const createGeneratedFiles = (values: DeploymentValues): GeneratedFile[] => [
  {
    filename: 'codex.config.toml',
    content: createCodexConfig(values.DEPLOY_DOMAIN),
  },
  {
    filename: 'ssh-connection.env',
    content: createConnectionEnvironment(values),
    mode: 0o600,
  },
];

const writeGeneratedFile = async ({ filename, content, mode }: GeneratedFile, outputDir: string): Promise<void> => {
  const outputPath = resolve(outputDir, filename);
  const options = mode === undefined ? undefined : { mode };

  await writeFile(outputPath, content, options);
};

export const renderDeploymentFiles = async (values: DeploymentValues, outputDir: string): Promise<void> => {
  await mkdir(outputDir, { recursive: true });

  await Promise.all(DEPLOYMENT_TEMPLATES.map((filename) => renderTemplateFile(filename, values, outputDir)));

  const generatedFiles = createGeneratedFiles(values);
  await Promise.all(generatedFiles.map((file) => writeGeneratedFile(file, outputDir)));
};
