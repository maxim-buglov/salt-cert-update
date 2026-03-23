certificates:
  url: 'https://cert-server.example.com/certs/'
  target_dir: '/etc/ssl/certs'
  cert_name: 'server.crt'
  key_name: 'server.key'
  backup_dir: '/etc/ssl/backup'
  restart_service: 'nginx'  # optional: nginx, apache2, httpd
  timeout: 30

