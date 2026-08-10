import { spawn } from 'child_process';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BleService {
    constructor() {
        this.process = null;
        this.isReady = false;
        this.onDataCallback = null;
        this.onStatusCallback = null;
        this.onScanResultCallback = null;
        this.onConnectStatusCallback = null;

        this.scanResolver = null;
        this.connectResolver = null;
        this.disconnectResolver = null;

        this._ensureProcess();
    }

    _ensureProcess() {
        if (this.process && !this.process.killed) {
            return;
        }

        const scriptPath = path.join(__dirname, 'ble_bridge.py');
        const pythonBin = process.platform === 'win32' ? 'python' : 'python3';

        console.log(`[BleService] Spawning Python BLE Bridge: ${pythonBin} ${scriptPath}`);

        try {
            this.process = spawn(pythonBin, [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const rl = readline.createInterface({
                input: this.process.stdout,
                terminal: false
            });

            rl.on('line', (line) => {
                this._handlePythonLine(line);
            });

            this.process.stderr.on('data', (data) => {
                console.warn(`[BleService Python Stderr]: ${data.toString().trim()}`);
            });

            this.process.on('close', (code) => {
                console.log(`[BleService] Python bridge exited with code ${code}`);
                this.isReady = false;
                this.process = null;
                if (this.onConnectStatusCallback) {
                    this.onConnectStatusCallback({ connected: false, address: null, reason: 'Process exited' });
                }
            });

            this.process.on('error', (err) => {
                console.error('[BleService] Failed to start Python BLE bridge:', err);
                this.isReady = false;
            });
        } catch (err) {
            console.error('[BleService] Exception spawning Python bridge:', err);
        }
    }

    _sendCommand(cmdObj) {
        this._ensureProcess();
        if (this.process && this.process.stdin.writable) {
            this.process.stdin.write(JSON.stringify(cmdObj) + '\n');
        } else {
            console.error('[BleService] Cannot send command, Python stdin not writable.');
        }
    }

    _handlePythonLine(line) {
        if (!line || !line.trim()) return;

        try {
            const msg = JSON.parse(line.trim());
            const event = msg.event;

            if (event === 'ready') {
                console.log(`[BleService] Python BLE Bridge Ready (PID: ${msg.pid})`);
                this.isReady = true;
            } else if (event === 'scan_result') {
                console.log(`[BleService] Scan result received (${msg.devices?.length || 0} devices)`);
                if (this.scanResolver) {
                    this.scanResolver(msg.devices || []);
                    this.scanResolver = null;
                }
                if (this.onScanResultCallback) {
                    this.onScanResultCallback(msg.devices || []);
                }
            } else if (event === 'connected') {
                console.log(`[BleService] Connected to ${msg.address}`);
                if (this.connectResolver) {
                    this.connectResolver({ success: true, address: msg.address });
                    this.connectResolver = null;
                }
                if (this.onConnectStatusCallback) {
                    this.onConnectStatusCallback({ connected: true, address: msg.address });
                }
            } else if (event === 'disconnected') {
                console.log(`[BleService] Disconnected from ${msg.address}`);
                if (this.disconnectResolver) {
                    this.disconnectResolver(true);
                    this.disconnectResolver = null;
                }
                if (this.onConnectStatusCallback) {
                    this.onConnectStatusCallback({ connected: false, address: msg.address, reason: msg.reason });
                }
            } else if (event === 'data') {
                if (msg.data && this.onDataCallback) {
                    const buffer = Buffer.from(msg.data, 'base64');
                    this.onDataCallback(buffer);
                }
            } else if (event === 'status') {
                console.log(`[BleService Status]: ${msg.message}`);
                if (this.onStatusCallback) {
                    this.onStatusCallback(msg.message);
                }
            } else if (event === 'error') {
                console.error(`[BleService Error]: ${msg.message}`);
                if (this.scanResolver) {
                    this.scanResolver([]);
                    this.scanResolver = null;
                }
                if (this.connectResolver) {
                    this.connectResolver({ success: false, error: msg.message });
                    this.connectResolver = null;
                }
            }
        } catch (err) {
            console.error('[BleService] Failed to parse line from Python:', line, err);
        }
    }

    async scanDevices(timeout = 30) {
        this._sendCommand({ command: 'scan', timeout });
        return { success: true };
    }

    async connectDevice(address) {
        return new Promise((resolve) => {
            this.connectResolver = resolve;
            this._sendCommand({ command: 'connect', address });

            setTimeout(() => {
                if (this.connectResolver) {
                    console.warn('[BleService] Connect timeout reached in Node.js manager.');
                    this.connectResolver({ success: false, error: 'Connection timeout' });
                    this.connectResolver = null;
                }
            }, 12000);
        });
    }

    async disconnectDevice() {
        return new Promise((resolve) => {
            this.disconnectResolver = resolve;
            this._sendCommand({ command: 'disconnect' });

            setTimeout(() => {
                if (this.disconnectResolver) {
                    this.disconnectResolver(true);
                    this.disconnectResolver = null;
                }
            }, 3000);
        });
    }

    writeRaw(dataBuffer) {
        const buf = Buffer.isBuffer(dataBuffer) ? dataBuffer : Buffer.from(dataBuffer);
        const b64Data = buf.toString('base64');
        this._sendCommand({ command: 'write', data: b64Data });
    }

    destroy() {
        if (this.process) {
            console.log('[BleService] Destroying Python BLE bridge process...');
            this._sendCommand({ command: 'exit' });
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.process.kill('SIGKILL');
                }
                this.process = null;
            }, 500);
        }
    }
}

export const bleService = new BleService();
