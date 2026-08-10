import dgram from 'dgram';
import os from 'os';

class UdpService {
    constructor() {
        this.socket = null;
        this.targetIp = null;
        this.targetPort = 5000;
        this.onDataCallback = null;
    }

    /**
     * Broadcasts WindRPC PING (0x0601) to 255.255.255.255, subnet broadcast, and optional targetIp to find connected board.
     */
    async discoverBoard(targetIp = null, port = 5000, timeoutMs = 3500) {
        return new Promise((resolve) => {
            const probeSocket = dgram.createSocket('udp4');
            let isResolved = false;

            const cleanup = () => {
                try {
                    probeSocket.close();
                } catch (e) {}
            };

            const timer = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    resolve({ success: false, error: 'UDP discovery timed out' });
                }
            }, timeoutMs);

            probeSocket.on('error', (err) => {
                console.error('[UdpService] Probe error:', err);
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timer);
                    cleanup();
                    resolve({ success: false, error: err.message });
                }
            });

            probeSocket.on('message', (msg, rinfo) => {
                if (!isResolved && msg && msg.length >= 5) {
                    isResolved = true;
                    clearTimeout(timer);
                    console.log(`[UdpService] Discovered board at ${rinfo.address}:${rinfo.port}`);
                    cleanup();
                    resolve({
                        success: true,
                        ip: rinfo.address,
                        port: rinfo.port || port
                    });
                }
            });

            probeSocket.bind(() => {
                try {
                    probeSocket.setBroadcast(true);
                    // Raw WindRPC PING datagram (5 bytes: 06 01 00 01 00 - RPC 0x0601, SEQ 0x0001, LEN 0)
                    const pingFrame = Buffer.from([0x06, 0x01, 0x00, 0x01, 0x00]);

                    const targets = new Set(['255.255.255.255']);
                    if (targetIp) {
                        targets.add(targetIp);
                    }

                    const interfaces = os.networkInterfaces();
                    for (const name in interfaces) {
                        for (const net of interfaces[name] || []) {
                            if (net.family === 'IPv4' && !net.internal) {
                                const parts = net.address.split('.');
                                if (parts.length === 4) {
                                    targets.add(`${parts[0]}.${parts[1]}.${parts[2]}.255`);
                                    targets.add(`${parts[0]}.${parts[1]}.255.255`);
                                }
                            }
                        }
                    }

                    for (const targetHost of targets) {
                        probeSocket.send(pingFrame, 0, pingFrame.length, port, targetHost, (err) => {
                            if (err) {
                                // Ignore socket errors for invalid broadcast addresses
                            }
                        });
                    }
                } catch (err) {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timer);
                        cleanup();
                        resolve({ success: false, error: err.message });
                    }
                }
            });
        });
    }

    async connectTarget(ip, port = 5000) {
        if (this.socket) {
            await this.disconnect();
        }

        return new Promise((resolve, reject) => {
            this.targetIp = ip;
            this.targetPort = port;
            this.socket = dgram.createSocket('udp4');

            this.socket.on('error', (err) => {
                console.error('[UdpService] Socket error:', err);
            });

            this.socket.on('message', (data, rinfo) => {
                if (this.onDataCallback) {
                    this.onDataCallback(data, rinfo.address);
                }
            });

            this.socket.bind(() => {
                console.log(`[UdpService] Bound UDP socket to communicate with ${ip}:${port}`);
                resolve(true);
            });
        });
    }

    async disconnect() {
        if (this.socket) {
            try {
                this.socket.close();
            } catch (e) {}
            this.socket = null;
        }
        this.targetIp = null;
        console.log('[UdpService] Disconnected UDP session.');
        return true;
    }

    writeRaw(dataBuffer, targetIpOverride = null) {
        const destIp = targetIpOverride || this.targetIp;
        if (!this.socket || !destIp) {
            console.warn('[UdpService] writeRaw called without active UDP socket or target IP');
            return;
        }

        const buf = Buffer.isBuffer(dataBuffer) ? dataBuffer : Buffer.from(dataBuffer);
        this.socket.send(buf, 0, buf.length, this.targetPort, destIp, (err) => {
            if (err) {
                console.error('[UdpService] UDP send error:', err);
            }
        });
    }
}

export const udpService = new UdpService();
