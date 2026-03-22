# SSL Certificate Updater for Salt Stack

Automated SSL certificate updates via Salt Stack and Node.js.

## Quick Start

```bash
# 1. Copy files
sudo cp salt/states/cert_update.sls /srv/salt/
sudo mkdir -p /srv/salt/scripts
sudo cp scripts/update_certificates.js /srv/salt/scripts/
sudo chmod +x /srv/salt/scripts/update_certificates.js
sudo cp salt/pillar/certificates.sls /srv/pillar/
sudo cp salt/pillar/top.sls /srv/pillar/

# 2. Edit configuration
sudo nano /srv/pillar/certificates.sls  # Set your URL

# 3. Deploy
sudo salt '*' saltutil.refresh_pillar
sudo salt '*' state.apply cert_update
```

## Usage

```bash
salt '*' state.apply cert_update              # All servers
salt 'web-*' state.apply cert_update          # Pattern match
salt -G 'role:webserver' state.apply cert_update  # By grain
```

## Manual Run

```bash
node scripts/update_certificates.js --url "https://server.com/certs/" --target-dir "/etc/ssl/certs" --cert-name "server.crt" --key-name "server.key"
```
