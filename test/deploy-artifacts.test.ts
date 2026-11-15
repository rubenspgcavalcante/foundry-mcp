import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDeploymentFiles } from '../scripts/deploy-artifacts.js';
import type { DeploymentValues } from '../scripts/deploy-env.js';

const temporaryDirectories: string[] = [];

const deploymentValues: DeploymentValues = {
  DEPLOY_DOMAIN: 'foundry.example.test',
  DEPLOY_SERVER_IP: '203.0.113.10',
  DEPLOY_SSH_USER: 'deploy',
  DEPLOY_SERVICE_USER: 'foundry',
  DEPLOY_APP_DIR: '/opt/foundry-mcp',
  DEPLOY_NODE_PATH: '/usr/bin/node',
  DEPLOY_FOUNDRY_DATA_DIR: '/srv/foundry/data',
};

const createOutputDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'foundry-mcp-deploy-'));
  temporaryDirectories.push(directory);
  return join(directory, 'nested', 'deploy');
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('renderDeploymentFiles', () => {
  it('creates and renders deployment templates and generated configuration files', async () => {
    const outputDirectory = await createOutputDirectory();

    await renderDeploymentFiles(deploymentValues, outputDirectory);

    const nginxConfig = await readFile(join(outputDirectory, 'foundry.nginx'), 'utf8');
    const serviceUnit = await readFile(join(outputDirectory, 'foundry-mcp.service'), 'utf8');
    const codexConfig = await readFile(join(outputDirectory, 'codex.config.toml'), 'utf8');
    const connectionEnvironment = await readFile(join(outputDirectory, 'ssh-connection.env'), 'utf8');

    assert.match(nginxConfig, /server_name foundry\.example\.test www\.foundry\.example\.test;/);
    assert.doesNotMatch(nginxConfig, /\{\{[A-Z0-9_]+\}\}/);
    assert.match(serviceUnit, /WorkingDirectory=\/opt\/foundry-mcp/);
    assert.match(serviceUnit, /ExecStart=\/usr\/bin\/node \/opt\/foundry-mcp\/dist\/index\.js/);
    assert.match(serviceUnit, /User=foundry/);
    assert.match(serviceUnit, /FOUNDRY_DATA_DIR=\/srv\/foundry\/data/);
    assert.match(codexConfig, /url = "https:\/\/foundry\.example\.test\/mcp"/);
    assert.match(codexConfig, /bearer_token_env_var = "FOUNDRY_MCP_KEY"/);
    assert.equal(connectionEnvironment, 'DEPLOY_SERVER_IP=203.0.113.10\nDEPLOY_SSH_USER=deploy\n');
  });

  it('writes the SSH connection environment with owner-only permissions', async () => {
    const outputDirectory = await createOutputDirectory();

    await renderDeploymentFiles(deploymentValues, outputDirectory);

    const fileStats = await stat(join(outputDirectory, 'ssh-connection.env'));

    assert.equal(fileStats.mode & 0o777, 0o600);
  });
});
