{% set config = salt['pillar.get']('certificates', {}) %}

# Deploy script
/usr/local/bin/update_certificates.js:
  file.managed:
    - source: salt://scripts/update_certificates.js
    - mode: 755

# Run update
update_certificates:
  cmd.run:
    - name: node /usr/local/bin/update_certificates.js --url "{{ config.get('url') }}" --target-dir "{{ config.get('target_dir', '/etc/ssl/certs') }}" --cert-name "{{ config.get('cert_name', 'certificate.crt') }}" --key-name "{{ config.get('key_name', 'private.key') }}"
    - require:
      - file: /usr/local/bin/update_certificates.js

# Restart service (optional)
{% if config.get('restart_service') %}
{{ config.get('restart_service') }}:
  service.running:
    - watch:
      - cmd: update_certificates
{% endif %}

