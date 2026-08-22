import { SerialPort } from 'serialport';

class SerialService {
    constructor() {
        this.port = null;
        this.isWriting = false;
        this.queue = [];
        this.onDataCallback = null;
    }

    async listPorts() {
        try {
            console.log('[SerialService] Calling SerialPort.list()...');
            const ports = await SerialPort.list();
            console.log('[SerialService] SerialPort.list() result:', JSON.stringify(ports, null, 2));

            const result = ports.map(p => ({
                path: p.path,
                manufacturer: p.manufacturer || 'Serial Device',
                friendlyName: p.friendlyName || p.path,
                pnpId: p.pnpId || '',
                vendorId: p.vendorId || '',
                productId: p.productId || ''
            }));

            console.log('[SerialService] Processed ports count:', result.length);
            return result;
        } catch (err) {
            console.error('[SerialService] Error calling SerialPort.list():', err);
            return [];
        }
    }

    async connectPort(portPath, baudRate = 921600) {
        if (this.port && this.port.isOpen) {
            await this.disconnectPort();
        }

        return new Promise((resolve, reject) => {
            console.log(`[SerialService] Attempting connection to ${portPath} @ ${baudRate}...`);
            this.port = new SerialPort({
                path: portPath,
                baudRate: baudRate,
                autoOpen: false
            });

            this.port.open((err) => {
                if (err) {
                    console.error('[SerialService] Failed to open port:', err);
                    return reject(err);
                }
                console.log(`[SerialService] Successfully connected to ${portPath} @ ${baudRate}`);

                this.port.on('data', (data) => {
                    if (this.onDataCallback) {
                        this.onDataCallback(data);
                    }
                });

                resolve(true);
            });
        });
    }

    async disconnectPort() {
        if (!this.port || !this.port.isOpen) {
            this.queue = [];
            this.isWriting = false;
            return true;
        }

        return new Promise((resolve) => {
            this.pendingBuffer = null;
            this.isWriting = false;
            this.queue = [];
            this.port.close((err) => {
                if (err) {
                    console.error('[SerialService] Error closing port:', err);
                }
                this.port = null;
                console.log('[SerialService] Disconnected port.');
                resolve(true);
            });
        });
    }

    /**
     * Non-blocking, drop-tail serial write guard.
     * Prevents serial buffer overflow & latency buildup at high frame rates.
     */
    writeRaw(dataBuffer) {
        if (!this.port || !this.port.isOpen) {
            return;
        }

        const buf = Buffer.isBuffer(dataBuffer) ? dataBuffer : Buffer.from(dataBuffer);

        if (this.isWriting) {
            // Keep up to 8 packets in queue so RPC requests are never dropped
            if (this.queue.length >= 8) {
                this.queue.shift();
            }
            this.queue.push(buf);
            return;
        }

        this._doWrite(buf);
    }

    _doWrite(buf) {
        if (!this.port || !this.port.isOpen) {
            this.isWriting = false;
            this.queue = [];
            return;
        }

        this.isWriting = true;
        this.port.write(buf, (err) => {
            if (err) {
                console.error('[SerialService] Serial write error:', err);
            }
            this.isWriting = false;

            if (this.queue.length > 0 && this.port && this.port.isOpen) {
                const nextBuf = this.queue.shift();
                this._doWrite(nextBuf);
            }
        });
    }
}

export const serialService = new SerialService();
