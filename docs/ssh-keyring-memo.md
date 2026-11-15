# Publish and deploy the self-hosted Foundry MCP

This is the repeatable, sanitized workflow for publishing this branch to a
personal fork and deploying it beside Foundry VTT. Replace every
`YOUR_...` value with your own value. Never commit the local deployment file,
MCP tokens, API keys, SSH passwords, or private keys.

## 1. Create the fork and publish the branch

Fork the upstream repository on GitHub, then configure the fork as a second
remote. Keep `origin` pointed at upstream.

```bash
git remote add fork https://github.com/YOUR_GITHUB_USER/foundry-mcp.git
git push -u fork feat/v818-bridge-adapter
```

If `fork` already exists:

```bash
git remote set-url fork https://github.com/YOUR_GITHUB_USER/foundry-mcp.git
git push -u fork feat/v818-bridge-adapter
```

Authenticate GitHub with the GitHub CLI, a credential manager, or an SSH key.
Never put a GitHub token in a remote URL.

## 2. Prepare private deployment settings

The repository contains generic templates in [deploy/](../deploy/). Copy the
example environment file and fill it with private infrastructure values:

```bash
cp .env.deploy.example .env.deploy.local
${EDITOR:-nano} .env.deploy.local
```

Example values:

```dotenv
DEPLOY_DOMAIN=YOUR_DOMAIN
DEPLOY_SERVER_IP=YOUR_SERVER_IP
DEPLOY_SSH_USER=root
DEPLOY_SERVICE_USER=root
DEPLOY_APP_DIR=/opt/foundry-mcp
DEPLOY_NODE_PATH=/path/to/node
DEPLOY_FOUNDRY_DATA_DIR=/opt/foundry-data/Data
```

`.env.deploy.local` is gitignored. Confirm this before publishing:

```bash
git check-ignore -v .env.deploy.local
```

## 3. Create the two separate MCP keys

These keys have different purposes and must not be confused.

### Key A: Foundry bridge API key

In Foundry VTT, open the Foundry API Bridge module settings and use **Get API
Key**. The generated key normally starts with `pk_`.

This key authenticates the Foundry API Bridge module to the self-hosted MCP
server. Store it only in `/etc/foundry-mcp.env` on the server:

```dotenv
MCP_BRIDGE_API_KEY=pk_REPLACE_WITH_YOUR_BRIDGE_KEY
```

Configure the Foundry module API WebSocket URL as:

```text
wss://YOUR_DOMAIN/foundry
```

Put the `pk_...` value in the module’s **API Key** field. Do not commit it or
put it in the public WebSocket URL.

### Key B: MCP client bearer token

Generate a separate random token for Codex or another MCP client:

```bash
MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
printf '%s' "$MCP_AUTH_TOKEN" | secret-tool store \
  --label="Foundry MCP bearer token" \
  service foundry-mcp \
  key FOUNDRY_MCP_KEY
unset MCP_AUTH_TOKEN
```

The same value must be placed in `/etc/foundry-mcp.env` on the server:

```dotenv
MCP_AUTH_TOKEN=REPLACE_WITH_THE_KEYRING_TOKEN
MCP_BRIDGE_API_KEY=pk_REPLACE_WITH_YOUR_BRIDGE_KEY
```

The bearer token authenticates MCP clients; the `pk_...` key authenticates
the Foundry bridge. They must be different values.

## 4. Store the SSH password in the Linux keyring

This keeps the SSH password out of `.bashrc`, scripts, and shell history:

```bash
read -rsp "Hostinger SSH password: " SSH_PASS
printf '%s' "$SSH_PASS" | secret-tool store \
  --label="Hostinger SSH password" \
  service hostinger-ssh \
  host YOUR_SERVER_IP \
  user YOUR_SSH_USER
unset SSH_PASS
```

Verify it without printing the password:

```bash
test -n "$(secret-tool lookup service hostinger-ssh host YOUR_SERVER_IP user YOUR_SSH_USER)" \
  && echo "SSH password stored"
```

Create `$HOME/.local/bin/hostinger-ssh-askpass`:

```sh
#!/bin/sh
exec secret-tool lookup service hostinger-ssh host YOUR_SERVER_IP user YOUR_SSH_USER
```

Then:

```bash
chmod 700 "$HOME/.local/bin/hostinger-ssh-askpass"
export SSH_ASKPASS="$HOME/.local/bin/hostinger-ssh-askpass"
export SSH_ASKPASS_REQUIRE=force
export DISPLAY=:0
```

Test the connection:

```bash
setsid -w ssh \
  -o IdentitiesOnly=yes \
  -o PubkeyAuthentication=no \
  -o PreferredAuthentications=password \
  YOUR_SSH_USER@YOUR_SERVER_IP
```

## 5. Build and render private deployment artifacts

Run:

```bash
npm ci
npm run build:deploy
```

This builds the server and runs [render-deploy.ts](../scripts/render-deploy.ts).
It reads `.env.deploy.local` and creates ignored files in `dist/deploy/`:

- `foundry.nginx` with the real domain and certificate paths;
- `foundry-mcp.service` with the real server paths and Node executable;
- `codex.config.toml` with the real MCP URL;
- `ssh-connection.env` with the SSH host and user, mode `0600`.

The generated directory is ignored and is for deployment only.

## 6. Install or update the server

Copy the compiled server and rendered service configuration:

```bash
setsid -w scp \
  -o IdentitiesOnly=yes \
  -o PubkeyAuthentication=no \
  -o PreferredAuthentications=password \
  -r dist YOUR_SSH_USER@YOUR_SERVER_IP:YOUR_APP_DIR/

setsid -w scp \
  dist/deploy/foundry-mcp.service \
  YOUR_SSH_USER@YOUR_SERVER_IP:/tmp/foundry-mcp.service
```

On the server, create `/etc/foundry-mcp.env` with the two keys from step 3,
then install and start the service:

```bash
install -m 644 /tmp/foundry-mcp.service /etc/systemd/system/foundry-mcp.service
systemctl daemon-reload
systemctl enable --now foundry-mcp
```

Do not copy `/etc/foundry-mcp.env` into the repository or a public artifact.

## 7. Configure Nginx and TLS

Copy the rendered Nginx configuration:

```bash
setsid -w scp \
  dist/deploy/foundry.nginx \
  YOUR_SSH_USER@YOUR_SERVER_IP:/etc/nginx/sites-available/foundry-mcp
```

On the server:

```bash
ln -sf /etc/nginx/sites-available/foundry-mcp /etc/nginx/sites-enabled/foundry-mcp
nginx -t
systemctl reload nginx
```

Obtain and renew TLS certificates with Certbot for your own domain. The
certificate and private-key files stay on the server and are never committed.

The resulting routes are:

```text
https://YOUR_DOMAIN/mcp       MCP HTTP endpoint
wss://YOUR_DOMAIN/foundry    Foundry bridge WebSocket endpoint
```

## 8. Configure Codex or another MCP client

The renderer creates `dist/deploy/codex.config.toml`. Merge its MCP server
entry into the client’s local configuration:

```toml
[mcp_servers.foundry]
url = "https://YOUR_DOMAIN/mcp"
bearer_token_env_var = "FOUNDRY_MCP_KEY"
```

Make sure the client process can read the keyring-backed environment variable.
For shell-launched VS Code, source the shell configuration before launching
it. Never put the bearer token directly in the TOML file.

## 9. Verify the deployment

On the server:

```bash
curl -fsS http://127.0.0.1:8765/health
journalctl -u foundry-mcp -n 50 --no-pager
```

The health response should report `foundryConnected: true` after Foundry and
the bridge module connect. Then test a read-only MCP tool, such as listing
scenes or searching a compendium.

## 10. Troubleshooting

- `401 Unauthorized`: the client’s `FOUNDRY_MCP_KEY` does not match
  `MCP_AUTH_TOKEN` in `/etc/foundry-mcp.env`.
- `foundryConnected: false`: check the Foundry WebSocket URL, module API key,
  Nginx WebSocket forwarding, and `journalctl -u foundry-mcp`.
- SSH asks for a password: export the askpass variables and run SSH through
  `setsid -w`.
- `npm run build:deploy` says the env file is missing: copy
  `.env.deploy.example` to `.env.deploy.local` and fill every required value.
- A generated file contains `{{...}}`: add the variable to
  `.env.deploy.local` and run `npm run render:deploy` again.
