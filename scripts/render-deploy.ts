import { resolve } from 'node:path';
import { findMissingValues, readDeploymentValues } from './deploy-env.js';
import { renderDeploymentFiles } from './deploy-artifacts.js';

const DEFAULT_ENV_FILE = '.env.deploy.local';
const DEFAULT_OUTPUT_DIR = 'dist/deploy';

const envFile = resolve(process.env.DEPLOY_ENV_FILE ?? DEFAULT_ENV_FILE);
const outputDir = resolve(process.env.DEPLOY_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR);

const main = async (): Promise<boolean> => {
  let values;

  try {
    values = await readDeploymentValues(envFile);
  } catch {
    console.error(`Missing ${envFile}. Copy .env.deploy.example to .env.deploy.local first.`);
    return false;
  }

  const missingValues = findMissingValues(values);

  if (missingValues.length > 0) {
    console.error(`Missing deployment values: ${missingValues.join(', ')}`);
    return false;
  }

  await renderDeploymentFiles(values, outputDir);
  console.log(`Rendered deployment files to ${outputDir}`);
  return true;
};

const didRender = await main();

if (!didRender) {
  process.exitCode = 1;
}
