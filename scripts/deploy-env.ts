import { readFile } from 'node:fs/promises';

export type DeploymentValues = Record<string, string>;

type Assignment = {
  key: string;
  value: string;
};

export const REQUIRED_DEPLOYMENT_VALUES = [
  'DEPLOY_DOMAIN',
  'DEPLOY_SERVER_IP',
  'DEPLOY_SSH_USER',
  'DEPLOY_SERVICE_USER',
  'DEPLOY_APP_DIR',
  'DEPLOY_NODE_PATH',
  'DEPLOY_FOUNDRY_DATA_DIR',
];

const isMeaningfulLine = (line: string): boolean => {
  const isBlank = line.length === 0;
  const isComment = line.startsWith('#');
  return !isBlank && !isComment;
};

const parseAssignment = (line: string): Assignment | null => {
  const separator = line.indexOf('=');
  const hasKey = separator > 0;

  if (!hasKey) {
    return null;
  }

  return {
    key: line.slice(0, separator).trim(),
    value: line.slice(separator + 1).trim(),
  };
};

const removeWrappingQuotes = (value: string): string => {
  const hasEnoughCharacters = value.length >= 2;
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
  const hasMatchingQuotes = hasDoubleQuotes || hasSingleQuotes;

  if (!hasEnoughCharacters || !hasMatchingQuotes) {
    return value;
  }

  return value.slice(1, -1);
};

const parseEnv = (text: string): DeploymentValues => {
  const assignments = text
    .split(/\r?\n/)
    .map((rawLine) => rawLine.trim())
    .filter(isMeaningfulLine)
    .map(parseAssignment)
    .filter((assignment): assignment is Assignment => assignment !== null);

  return Object.fromEntries(assignments.map(({ key, value }) => [key, removeWrappingQuotes(value)]));
};

export const readDeploymentValues = async (envFile: string): Promise<DeploymentValues> => {
  const environment = await readFile(envFile, 'utf8');
  return parseEnv(environment);
};

export const findMissingValues = (values: DeploymentValues): string[] =>
  REQUIRED_DEPLOYMENT_VALUES.filter((key) => !values[key]);
