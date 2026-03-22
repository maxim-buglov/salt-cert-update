const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

class Logger {
    static info(message) {
        console.log(`${colors.green}[INFO]${colors.reset} ${new Date().toISOString()} - ${message}`);
    }

    static error(message) {
        console.error(`${colors.red}[ERROR]${colors.reset} ${new Date().toISOString()} - ${message}`);
    }

    static warning(message) {
        console.warn(`${colors.yellow}[WARNING]${colors.reset} ${new Date().toISOString()} - ${message}`);
    }

    static debug(message) {
        console.log(`${colors.blue}[DEBUG]${colors.reset} ${new Date().toISOString()} - ${message}`);
    }
}

class CertificateUpdater {
    constructor(options) {
        this.url = options.url;
        this.targetDir = options.targetDir || '/etc/ssl/certs';
        this.certName = options.certName || 'certificate.crt';
        this.keyName = options.keyName || 'private.key';
        this.timeout = options.timeout || 30000;
    }

    async downloadFile(url, destination) {
        return new Promise((resolve, reject) => {
            Logger.info(`File download started: ${url}`);

            const protocol = url.startsWith('https') ? https : http;
            const tempFile = destination + '.tmp';
            const file = fs.createWriteStream(tempFile);

            const request = protocol.get(url, { timeout: this.timeout }, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP error: ${response.statusCode}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        try {
                            fs.renameSync(tempFile, destination);
                            Logger.info(`File successfully saved: ${destination}`);
                            resolve(true);
                        } catch (error) {
                            reject(error);
                        }
                    });
                });
            });

            request.on('error', (error) => {
                fs.unlink(tempFile, () => {});
                reject(error);
            });

            request.on('timeout', () => {
                request.destroy();
                fs.unlink(tempFile, () => {});
                reject(new Error('Download timeout'));
            });
        });
    }

    async runCommand(command, args) {
        return new Promise((resolve, reject) => {
            const process = spawn(command, args);
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(new Error(`Command exited with code ${code}: ${stderr}`));
                }
            });

            process.on('error', (error) => {
                reject(error);
            });
        });
    }

    async validateCertificate(certPath) {
        try {
            Logger.info('Checking certificate validity');
            const result = await this.runCommand('openssl', [
                'x509', '-in', certPath, '-text', '-noout'
            ]);
            Logger.info('✓ Certificate is valid');
            return true;
        } catch (error) {
            Logger.error(`✗ Certificate is invalid: ${error.message}`);
            return false;
        }
    }

    async validateKey(keyPath) {
        try {
            Logger.info('Checking private key validity');
            const result = await this.runCommand('openssl', [
                'rsa', '-in', keyPath, '-check', '-noout'
            ]);
            Logger.info('✓ Private key is valid');
            return true;
        } catch (error) {
            Logger.error(`✗ Private key is invalid: ${error.message}`);
            return false;
        }
    }

    async verifyKeyAndCertMatch(certPath, keyPath) {
        try {
            Logger.info('Checking key and certificate match');

            const certResult = await this.runCommand('openssl', [
                'x509', '-noout', '-modulus', '-in', certPath
            ]);

            const keyResult = await this.runCommand('openssl', [
                'rsa', '-noout', '-modulus', '-in', keyPath
            ]);

            if (certResult.stdout === keyResult.stdout) {
                Logger.info('✓ Key matches certificate');
                return true;
            } else {
                Logger.error('✗ Key does NOT match certificate');
                return false;
            }
        } catch (error) {
            Logger.error(`Error checking key and certificate match: ${error.message}`);
            return false;
        }
    }

    setPermissions(filePath, mode) {
        try {
            fs.chmodSync(filePath, mode);
            Logger.info(`Set permissions ${mode.toString(8)} for ${filePath}`);
            return true;
        } catch (error) {
            Logger.error(`Failed to set permissions: ${error.message}`);
            return false;
        }
    }

    buildUrls() {
        let certUrl, keyUrl;

        if (this.url.endsWith('/')) {
            // URL ends with /, append file names
            certUrl = this.url + this.certName;
            keyUrl = this.url + this.keyName;
        } else if (this.url.includes('{filename}')) {
            // URL contains placeholder
            certUrl = this.url.replace('{filename}', this.certName);
            keyUrl = this.url.replace('{filename}', this.keyName);
        } else {
            // Use URL directly
            certUrl = this.url;
            keyUrl = this.url;
        }

        return { certUrl, keyUrl };
    }

    async updateCertificates() {
        Logger.info('Starting certificate update');

        try {
            if (!fs.existsSync(this.targetDir)) {
                Logger.info(`Creating directory: ${this.targetDir}`);
                fs.mkdirSync(this.targetDir, { recursive: true, mode: 0o755 });
            }

            const { certUrl, keyUrl } = this.buildUrls();

            const certPath = path.join(this.targetDir, this.certName);
            const keyPath = path.join(this.targetDir, this.keyName);

            let success = true;

            try {
                await this.downloadFile(certUrl, certPath);
                
                if (!await this.validateCertificate(certPath)) {
                    Logger.error('Deleting invalid certificate');
                    fs.unlinkSync(certPath);
                    success = false;
                } else {
                    this.setPermissions(certPath, 0o644);
                }
            } catch (error) {
                Logger.error(`Failed to download certificate: ${error.message}`);
                success = false;
            }

            try {
                await this.downloadFile(keyUrl, keyPath);
                
                if (!await this.validateKey(keyPath)) {
                    Logger.error('Deleting invalid key');
                    fs.unlinkSync(keyPath);
                    success = false;
                } else {
                    this.setPermissions(keyPath, 0o600);
                }
            } catch (error) {
                Logger.error(`Failed to download key: ${error.message}`);
                success = false;
            }

            if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
                if (!await this.verifyKeyAndCertMatch(certPath, keyPath)) {
                    Logger.error('Key and certificate do not match!');
                    success = false;
                }
            }

            if (success) {
                Logger.info('✓ Certificates successfully updated');
                return 0;
            } else {
                Logger.error('✗ Error updating certificates');
                return 1;
            }
        } catch (error) {
            Logger.error(`Critical error: ${error.message}`);
            return 1;
        }
    }
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        url: null,
        targetDir: '/etc/ssl/certs',
        certName: 'certificate.crt',
        keyName: 'private.key',
        timeout: 30000
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--url':
                options.url = args[++i];
                break;
            case '--target-dir':
                options.targetDir = args[++i];
                break;
            case '--cert-name':
                options.certName = args[++i];
                break;
            case '--key-name':
                options.keyName = args[++i];
                break;
            case '--timeout':
                options.timeout = parseInt(args[++i]) * 1000;
                break;
            case '-h':
            case '--help':
                console.log(`
Usage: node update_certificates.js --url URL [OPTIONS]

Options:
  --url URL              URL to download certificates (required)
  --target-dir DIR       Target directory (default: /etc/ssl/certs)
  --cert-name NAME       Certificate file name (default: certificate.crt)
  --key-name NAME        Key file name (default: private.key)
  --timeout SEC          Download timeout in seconds (default: 30)
  -h, --help            Show this help
                `);
                process.exit(0);
            default:
                console.error(`Unknown option: ${args[i]}`);
                process.exit(1);
        }
    }

    if (!options.url) {
        console.error('Error: URL not specified. Use --url');
        process.exit(1);
    }

    return options;
}

async function main() {
    const options = parseArgs();
    const updater = new CertificateUpdater(options);
    const exitCode = await updater.updateCertificates();
    process.exit(exitCode);
}

if (require.main === module) {
    main().catch((error) => {
        Logger.error(`Unhandled error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { CertificateUpdater, Logger };
