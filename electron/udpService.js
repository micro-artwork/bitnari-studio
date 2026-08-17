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
    async discoverBoard(targetIp = null, port = 5000, timeoutMs = 4500, onProgress = null) {
        return new Promise((resolve) => {
            const probeSocket = dgram.createSocket('udp4');
            let isResolved = false;
            let sweepTimer = null;

            const cleanup = () => {
                if (sweepTimer) {
                    clearInterval(sweepTimer);
                    sweepTimer = null;
                }
                try {
                    probeSocket.close();
                } catch (e) {}
            };

            const overallTimer = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    cleanup();
                    resolve({ success: false, error: 'No Bitnari Wi-Fi Server detected' });
                }
            }, timeoutMs);

            probeSocket.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.error('[UdpService] Probe socket bind error (Port in use):', err.message);
                } else {
                    console.debug('[UdpService] Subnet probe socket notice:', err.message);
                }
            });

            probeSocket.on('message', (msg, rinfo) => {
                if (!isResolved && msg && msg.length >= 6) {
                    isResolved = true;
                    clearTimeout(overallTimer);
                    console.log(`[UdpService] Discovered board at ${rinfo.address}:${rinfo.port}`);
                    if (onProgress && typeof onProgress === 'function') {
                        onProgress({
                            found: { ip: rinfo.address, port: rinfo.port || port },
                            percent: 100,
                            status: `Found Bitnari Board: ${rinfo.address}:${rinfo.port || port}`
                        });
                    }
                    setTimeout(() => {
                        cleanup();
                        resolve({
                            success: true,
                            ip: rinfo.address,
                            port: rinfo.port || port
                        });
                    }, 250);
                }
            });

            probeSocket.bind(() => {
                try {
                    probeSocket.setBroadcast(true);
                    const pingFrame = Buffer.from([0x01, 0x06, 0x01, 0x00, 0x00, 0x00]);

                    const targetList = [];
                    targetList.push('255.255.255.255');
                    if (targetIp) {
                        targetList.push(targetIp);
                    }

                    const interfaces = os.networkInterfaces();
                    for (const name in interfaces) {
                        for (const net of interfaces[name] || []) {
                            if (net.family === 'IPv4' && !net.internal) {
                                const parts = net.address.split('.');
                                if (parts.length === 4) {
                                    const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
                                    targetList.push(`${subnet}.255`);
                                    for (let i = 1; i <= 254; i++) {
                                        targetList.push(`${subnet}.${i}`);
                                    }
                                }
                            }
                        }
                    }

                    const uniqueTargets = [...new Set(targetList)];
                    let currentIndex = 0;
                    const batchSize = 10;

                    sweepTimer = setInterval(() => {
                        if (isResolved || currentIndex >= uniqueTargets.length) {
                            clearInterval(sweepTimer);
                            sweepTimer = null;
                            return;
                        }

                        const batch = uniqueTargets.slice(currentIndex, currentIndex + batchSize);
                        currentIndex += batch.length;
                        const percent = Math.min(99, Math.round((currentIndex / uniqueTargets.length) * 100));

                        for (const host of batch) {
                            probeSocket.send(pingFrame, 0, pingFrame.length, port, host, () => {});
                        }

                        if (onProgress && typeof onProgress === 'function') {
                            onProgress({
                                currentIp: batch[batch.length - 1],
                                scanned: currentIndex,
                                total: uniqueTargets.length,
                                percent,
                                status: `Probing ${batch[batch.length - 1]} (${currentIndex}/${uniqueTargets.length})`
                            });
                        }
                    }, 25);
                } catch (err) {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(overallTimer);
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
