# Hostinger SSH from the Linux keyring

This memo describes how to connect to the Hostinger Foundry server without
putting the SSH password in `.bashrc`, a script, or shell history.

Copy `.env.deploy.example` to `.env.deploy.local` and keep the local file
private. It holds your domain, server address, and deployment paths.

```bash
cp .env.deploy.example .env.deploy.local
${EDITOR:-nano} .env.deploy.local
```

Use the `DEPLOY_SERVER_IP` value from that file in the commands below.

## Store the password in Seahorse / Secret Service

```bash
read -rsp "Hostinger SSH password: " SSH_PASS
printf '%s' "$SSH_PASS" | secret-tool store \
  --label="Hostinger SSH password" \
  service hostinger-ssh \
  host YOUR_SERVER_IP \
  user root
unset SSH_PASS
```

Verify that an entry exists without printing the password:

```bash
test -n "$(secret-tool lookup service hostinger-ssh host YOUR_SERVER_IP user root)" \
  && echo "SSH password stored"
```

## Configure SSH to retrieve it

Create `$HOME/.local/bin/hostinger-ssh-askpass` with this content:

```sh
#!/bin/sh
exec secret-tool lookup service hostinger-ssh host YOUR_SERVER_IP user root
```

Then make it executable:

```bash
chmod 700 "$HOME/.local/bin/hostinger-ssh-askpass"
```

## Connect from any new terminal

```bash
export SSH_ASKPASS="$HOME/.local/bin/hostinger-ssh-askpass"
export SSH_ASKPASS_REQUIRE=force
export DISPLAY=:0

setsid -w ssh \
  -o IdentitiesOnly=yes \
  -o PubkeyAuthentication=no \
  -o PreferredAuthentications=password \
  root@YOUR_SERVER_IP
```

## Deploy files with the same authentication

```bash
setsid -w scp \
  -o IdentitiesOnly=yes \
  -o PubkeyAuthentication=no \
  -o PreferredAuthentications=password \
  -r dist root@YOUR_SERVER_IP:/opt/foundry-mcp/
```

After deploying the Foundry MCP build:

```bash
setsid -w ssh \
  -o IdentitiesOnly=yes \
  -o PubkeyAuthentication=no \
  -o PreferredAuthentications=password \
  root@YOUR_SERVER_IP \
  'systemctl restart foundry-mcp && sleep 2 && curl -fsS http://127.0.0.1:8765/health'
```

Do not put the password itself in `.bashrc`; the helper only retrieves it
from the local keyring when SSH asks for it.
