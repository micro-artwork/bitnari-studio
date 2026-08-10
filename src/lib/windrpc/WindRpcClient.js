import protobuf from 'protobufjs';

export function cobsEncode(inputData) {
    const input = (inputData && inputData.length !== undefined) ? Uint8Array.from(inputData) : new Uint8Array(inputData || 0);
    const output = [];
    let codeIndex = 0;
    let code = 1;

    output.push(0);

    for (let i = 0; i < input.length; i++) {
        if (input[i] !== 0) {
            output.push(input[i]);
            code++;
        }

        if (input[i] === 0 || code === 0xFF) {
            output[codeIndex] = code;
            codeIndex = output.length;
            output.push(0);
            code = 1;
        }
    }

    output[codeIndex] = code;
    return new Uint8Array(output);
}

export function cobsDecode(inputData) {
    const input = (inputData && inputData.length !== undefined) ? Uint8Array.from(inputData) : new Uint8Array(inputData || 0);
    const output = [];
    let i = 0;

    while (i < input.length) {
        let code = input[i];
        if (code === 0) break;

        i++;
        for (let j = 1; j < code; j++) {
            if (i < input.length) {
                output.push(input[i++]);
            }
        }

        if (code < 0xFF && i < input.length && input[i] !== 0) {
            output.push(0);
        }
    }

    return new Uint8Array(output);
}

export const RPC_ID = {
    COMMON_PING: 0x0601,
    COMMON_GET_DEVICE_INFO: 0x0602,
    CONFIG_SET_WIFI_CONFIG: 0x0701,
    CONFIG_CLEAR_WIFI_CONFIG: 0x0702,
    CONFIG_GET_WIFI_STATUS: 0x0703,
    LED_DISPLAY_PIXELS: 0x0801,
    LED_SET_PIXELS: 0x0802,
    POWER_READ_POWER_INFO: 0x0901,
    POWER_SUBSCRIBE_POWER_INFO: 0x0902,
    POWER_POWER_INFO: 0x0982,
};

export const PROTO_SCHEMA = {
    "nested": {
        "StatusCode": {
            "values": {
                "NONE": 0,
                "CANCELLED": 1,
                "UNKNOWN": 2,
                "INVALID_ARGUMENT": 3,
                "DEADLINE_EXCEEDED": 4,
                "NOT_FOUND": 5,
                "ALREADY_EXISTS": 6,
                "PERMISSION_DENIED": 7,
                "RESOURCE_EXHAUSTED": 8,
                "FAILED_PRECONDITION": 9,
                "ABORTED": 10,
                "OUT_OF_RANGE": 11,
                "UNIMPLEMENTED": 12,
                "INTERNAL": 13,
                "UNAVAILABLE": 14,
                "DATA_LOSS": 15,
                "UNAUTHENTICATED": 16,
                "INVALID_DATA_FORMAT": 17,
                "MISSING_REQUIRED_FIELD": 18,
                "VERSION_MISMATCH": 19
            }
        },
        "Empty": {
            "fields": {}
        },
        "Subscribe": {
            "fields": {
                "enable": {
                    "id": 1,
                    "type": "bool"
                },
                "data": {
                    "id": 2,
                    "type": "bytes"
                }
            }
        },
        "Status": {
            "fields": {
                "code": {
                    "id": 1,
                    "type": "int32"
                },
                "message": {
                    "id": 2,
                    "type": "string"
                },
                "details": {
                    "id": 3,
                    "type": "bytes"
                }
            }
        },
        "PingResponse": {
            "fields": {
                "core_version_code": {
                    "id": 1,
                    "type": "uint32"
                },
                "core_version_name": {
                    "id": 2,
                    "type": "string"
                },
                "spec_version_code": {
                    "id": 3,
                    "type": "uint32"
                },
                "spec_version_name": {
                    "id": 4,
                    "type": "string"
                }
            }
        },
        "DeviceInfo": {
            "fields": {
                "manufacturer_name": {
                    "id": 1,
                    "type": "string"
                },
                "model_number": {
                    "id": 2,
                    "type": "string"
                },
                "serial_number": {
                    "id": 3,
                    "type": "string"
                },
                "hw_revision": {
                    "id": 4,
                    "type": "string"
                },
                "fw_revision": {
                    "id": 5,
                    "type": "string"
                }
            }
        },
        "WifiConfig": {
            "fields": {
                "ssid": {
                    "id": 1,
                    "type": "string"
                },
                "psk": {
                    "id": 2,
                    "type": "string"
                }
            }
        },
        "WifiStatus": {
            "fields": {
                "connected": {
                    "id": 1,
                    "type": "bool"
                },
                "ssid": {
                    "id": 2,
                    "type": "string"
                },
                "ip_addr": {
                    "id": 3,
                    "type": "string"
                }
            }
        },
        "PixelData": {
            "fields": {
                "colors": {
                    "id": 1,
                    "type": "fixed32",
                    "rule": "repeated"
                }
            }
        },
        "PixelChunk": {
            "fields": {
                "offset": {
                    "id": 1,
                    "type": "uint32"
                },
                "colors": {
                    "id": 2,
                    "type": "fixed32",
                    "rule": "repeated"
                },
                "display": {
                    "id": 3,
                    "type": "bool"
                }
            }
        },
        "PowerInfo": {
            "fields": {
                "voltage_mill": {
                    "id": 1,
                    "type": "int32"
                },
                "ampere_mill": {
                    "id": 2,
                    "type": "int32"
                },
                "watt_mill": {
                    "id": 3,
                    "type": "int32"
                }
            }
        }
    }
};

const root = protobuf.Root.fromJSON(PROTO_SCHEMA);

// Enum: StatusCode
export const StatuscodeEnum = root.lookupEnum('StatusCode');

// Message: Empty
export const EmptyType = root.lookupType('Empty');
export function encodeEmpty(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = EmptyType.create(payload);
    return EmptyType.encode(message).finish();
}
export function decodeEmpty(binary) {
    return EmptyType.decode(binary);
}

// Message: Subscribe
export const SubscribeType = root.lookupType('Subscribe');
export function encodeSubscribe(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = SubscribeType.create(payload);
    return SubscribeType.encode(message).finish();
}
export function decodeSubscribe(binary) {
    return SubscribeType.decode(binary);
}

// Message: Status
export const StatusType = root.lookupType('Status');
export function encodeStatus(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = StatusType.create(payload);
    return StatusType.encode(message).finish();
}
export function decodeStatus(binary) {
    return StatusType.decode(binary);
}

// Message: PingResponse
export const PingresponseType = root.lookupType('PingResponse');
export function encodePingresponse(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = PingresponseType.create(payload);
    return PingresponseType.encode(message).finish();
}
export function decodePingresponse(binary) {
    return PingresponseType.decode(binary);
}

// Message: DeviceInfo
export const DeviceinfoType = root.lookupType('DeviceInfo');
export function encodeDeviceinfo(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = DeviceinfoType.create(payload);
    return DeviceinfoType.encode(message).finish();
}
export function decodeDeviceinfo(binary) {
    return DeviceinfoType.decode(binary);
}

// Message: WifiConfig
export const WificonfigType = root.lookupType('WifiConfig');
export function encodeWificonfig(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = WificonfigType.create(payload);
    return WificonfigType.encode(message).finish();
}
export function decodeWificonfig(binary) {
    return WificonfigType.decode(binary);
}

// Message: WifiStatus
export const WifistatusType = root.lookupType('WifiStatus');
export function encodeWifistatus(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = WifistatusType.create(payload);
    return WifistatusType.encode(message).finish();
}
export function decodeWifistatus(binary) {
    return WifistatusType.decode(binary);
}

// Message: PixelData
export const PixeldataType = root.lookupType('PixelData');
export function encodePixeldata(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = PixeldataType.create(payload);
    return PixeldataType.encode(message).finish();
}
export function decodePixeldata(binary) {
    return PixeldataType.decode(binary);
}

// Message: PixelChunk
export const PixelchunkType = root.lookupType('PixelChunk');
export function encodePixelchunk(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = PixelchunkType.create(payload);
    return PixelchunkType.encode(message).finish();
}
export function decodePixelchunk(binary) {
    return PixelchunkType.decode(binary);
}

// Message: PowerInfo
export const PowerinfoType = root.lookupType('PowerInfo');
export function encodePowerinfo(payload = {}) {
    if (payload instanceof Uint8Array) return payload;
    const message = PowerinfoType.create(payload);
    return PowerinfoType.encode(message).finish();
}
export function decodePowerinfo(binary) {
    return PowerinfoType.decode(binary);
}


export class WindRpcClient {
    constructor() {
        this.seqId = 0;
        this._pendingRequests = new Map();
        this._rxAccumulator = [];
        this.common = new CommonServiceClient(this);
        this.config = new ConfigServiceClient(this);
        this.led = new LedServiceClient(this);
        this.power = new PowerServiceClient(this);
    }

    // Standalone COBS utilities
    static cobsEncode(data) { return cobsEncode(data); }
    static cobsDecode(data) { return cobsDecode(data); }
    cobsEncode(data) { return cobsEncode(data); }
    cobsDecode(data) { return cobsDecode(data); }

    getNextSeqId() {
        this.seqId = (this.seqId + 1) & 0xFFFF;
        return this.seqId;
    }

    resetAccumulator() {
        this._rxAccumulator = [];
        for (const [seqId, pending] of this._pendingRequests.entries()) {
            pending.reject(new Error('Transport reset'));
        }
        this._pendingRequests.clear();
    }

    buildFrame(rpcId, payloadBytes = new Uint8Array(0)) {
        return this.buildRawFrame(rpcId, payloadBytes);
    }

    // Build raw frame: [RPC_ID:2][SEQ_ID:2][PAYLOAD_LEN:2] + PAYLOAD
    buildRawFrame(rpcId, payloadBytes = new Uint8Array(0)) {
        const seqId = this.getNextSeqId();
        const payloadLen = payloadBytes.length;
        const header = new Uint8Array(6);
        header[0] = rpcId & 0xFF;
        header[1] = (rpcId >> 8) & 0xFF;
        header[2] = seqId & 0xFF;
        header[3] = (seqId >> 8) & 0xFF;
        header[4] = payloadLen & 0xFF;
        header[5] = (payloadLen >> 8) & 0xFF;

        const rawPacket = new Uint8Array(6 + payloadLen);
        rawPacket.set(header, 0);
        if (payloadLen > 0) rawPacket.set(payloadBytes, 6);
        return rawPacket;
    }

    // Build COBS framed packet: [COBS_DATA] + 0x00
    buildCobsFrame(rpcId, payloadBytes = new Uint8Array(0)) {
        const rawPacket = this.buildRawFrame(rpcId, payloadBytes);
        const encoded = cobsEncode(rawPacket);
        const framed = new Uint8Array(encoded.length + 1);
        framed.set(encoded, 0);
        framed[encoded.length] = 0;
        return framed;
    }

    // Process raw UDP/datagram packet directly
    receiveRawDatagram(bytes, onNotification) {
        if (!bytes) return;
        const decoded = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
        if (decoded && decoded.length >= 6) {
            this._dispatchFrame(decoded, onNotification);
        }
    }

    receiveFrame(frame, onNotification) {
        this.receiveRawDatagram(frame, onNotification);
    }

    // Accumulate stream bytes until 0x00 delimiter, then decode COBS
    receiveBytes(bytes, onNotification) {
        if (!bytes) return;
        const incoming = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
        for (let i = 0; i < incoming.length; i++) {
            const b = incoming[i];
            if (b === 0x00) {
                if (this._rxAccumulator.length > 0) {
                    const cobsPacket = new Uint8Array(this._rxAccumulator);
                    this._rxAccumulator = [];
                    try {
                        const decoded = cobsDecode(cobsPacket);
                        if (decoded && decoded.length >= 6) {
                            this._dispatchFrame(decoded, onNotification);
                        }
                    } catch (err) {
                        console.warn('[WindRPC] COBS decode error:', err);
                    }
                }
            } else {
                this._rxAccumulator.push(b);
                if (this._rxAccumulator.length > 4096) {
                    this._rxAccumulator = [];
                }
            }
        }
    }

    _dispatchFrame(decoded, onNotification) {
        if (decoded.length < 6) return;
        const rpcId = decoded[0] | (decoded[1] << 8);
        const seqId = decoded[2] | (decoded[3] << 8);
        const payLen = decoded[4] | (decoded[5] << 8);
        const payload = decoded.slice(6, 6 + payLen);

        if (rpcId === 0x0601) {
            try {
                const pingResp = (typeof decodePingResponse === 'function') ? decodePingResponse(payload) : null;
                if (pingResp) {
                    console.log(`[WindRPC Ping Response] Core: v${pingResp.coreVersionName || '0.1.0'} (${pingResp.coreVersionCode ?? 100}), Spec: v${pingResp.specVersionName || '1.0.0'} (${pingResp.specVersionCode ?? 10000})`);
                }
            } catch (err) {
                // ignore
            }
        }

        const pending = this._pendingRequests.get(seqId);
        if (pending) {
            this._pendingRequests.delete(seqId);
            if (rpcId === 0x0000) {
                try {
                    const status = (typeof decodeStatus === 'function') ? decodeStatus(payload) : { code: -1, message: 'Server error' };
                    pending.reject(new Error(`[WindRPC Status Error ${status.code}] ${status.message || 'Server error'}`));
                } catch (err) {
                    pending.reject(new Error(`[WindRPC Status Error] Unknown server error (rpcId=0x0000)`));
                }
            } else {
                pending.resolve({ rpcId, seqId, payload });
            }
            return;
        }

        if (onNotification && typeof onNotification === 'function') {
            onNotification({ rpcId, seqId, payload });
        }
    }

    sendRequest(rpcId, payloadBytes, sendFn, timeoutMs = 2000) {
        const frame = this.buildFrame(rpcId, payloadBytes);
        const reqSeqId = this.seqId;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pendingRequests.delete(reqSeqId);
                reject(new Error(`RPC timeout: rpcId=0x${rpcId.toString(16)}`));
            }, timeoutMs);
            this._pendingRequests.set(reqSeqId, {
                resolve: (v) => { clearTimeout(timer); resolve(v); },
                reject:  (e) => { clearTimeout(timer); reject(e); },
            });
            sendFn(frame);
        });
    }
}

// ─────────────────────────────────────────────
// Service: common
// ─────────────────────────────────────────────
export class CommonServiceClient {
    constructor(client) {
        this.client = client;
    }

    /**
     * Builds a binary packet frame for ping (no payload).
     * @returns {Uint8Array} ready-to-send frame
     */
    buildPingFrame() {
        return this.client.buildFrame(RPC_ID.COMMON_PING);
    }

    /**
     * Sends ping and returns a Promise that resolves with the response.
     * Registers a pending entry so the response frame is matched by seqId.
     * @param {function} sendFn - function(frame: Uint8Array) that writes to transport
     * @param {number} [timeoutMs=2000] - response timeout in milliseconds
     * @returns {Promise<{rpcId: number, seqId: number, payload: Uint8Array}>>}
     */
    sendPing(sendFn, timeoutMs = 2000) {
        const payloadBytes = new Uint8Array(0);
        return this.client.sendRequest(RPC_ID.COMMON_PING, payloadBytes, sendFn, timeoutMs);
    }

    /**
     * Builds a binary packet frame for get_device_info (no payload).
     * @returns {Uint8Array} ready-to-send frame
     */
    buildGetDeviceInfoFrame() {
        return this.client.buildFrame(RPC_ID.COMMON_GET_DEVICE_INFO);
    }

    /**
     * Sends get_device_info and returns a Promise that resolves with the response.
     * Registers a pending entry so the response frame is matched by seqId.
     * @param {function} sendFn - function(frame: Uint8Array) that writes to transport
     * @param {number} [timeoutMs=2000] - response timeout in milliseconds
     * @returns {Promise<{rpcId: number, seqId: number, payload: Uint8Array}>>}
     */
    sendGetDeviceInfo(sendFn, timeoutMs = 2000) {
        const payloadBytes = new Uint8Array(0);
        return this.client.sendRequest(RPC_ID.COMMON_GET_DEVICE_INFO, payloadBytes, sendFn, timeoutMs);
    }

}

// ─────────────────────────────────────────────
// Service: config
// ─────────────────────────────────────────────
export class ConfigServiceClient {
    constructor(client) {
        this.client = client;
    }

    /**
     * Builds a binary packet frame for set_wifi_config.
     * @param {{ ssid, psk }} payload - WifiConfig message
     * @returns {Uint8Array} ready-to-send frame
     */
    buildSetWifiConfigFrame(payload = {}) {
        const payloadBytes = encodeWificonfig(payload);
        return this.client.buildFrame(RPC_ID.CONFIG_SET_WIFI_CONFIG, payloadBytes);
    }

    /**
     * Sends set_wifi_config and returns a Promise that resolves with the response.
     * Registers a pending entry so the response frame is matched by seqId.
     * @param {{ ssid, psk }} payload - WifiConfig message
     * @param {function} sendFn - function(frame: Uint8Array) that writes to transport
     * @param {number} [timeoutMs=2000] - response timeout in milliseconds
     * @returns {Promise<{rpcId: number, seqId: number, payload: Uint8Array}>>}
     */
    sendSetWifiConfig(payload = {}, sendFn, timeoutMs = 2000) {
        const payloadBytes = encodeWificonfig(payload);
        return this.client.sendRequest(RPC_ID.CONFIG_SET_WIFI_CONFIG, payloadBytes, sendFn, timeoutMs);
    }

    /**
     * Builds a binary packet frame for clear_wifi_config (no payload).
     * @returns {Uint8Array} ready-to-send frame
     */
    buildClearWifiConfigFrame() {
        return this.client.buildFrame(RPC_ID.CONFIG_CLEAR_WIFI_CONFIG);
    }

    /**
     * Sends clear_wifi_config and returns a Promise that resolves with the response.
     * Registers a pending entry so the response frame is matched by seqId.
     * @param {function} sendFn - function(frame: Uint8Array) that writes to transport
     * @param {number} [timeoutMs=2000] - response timeout in milliseconds
     * @returns {Promise<{rpcId: number, seqId: number, payload: Uint8Array}>>}
     */
    sendClearWifiConfig(sendFn, timeoutMs = 2000) {
        const payloadBytes = new Uint8Array(0);
        return this.client.sendRequest(RPC_ID.CONFIG_CLEAR_WIFI_CONFIG, payloadBytes, sendFn, timeoutMs);
    }

    /**
     * Builds a binary packet frame for get_wifi_status (no payload).
     * @returns {Uint8Array} ready-to-send frame
     */
    buildGetWifiStatusFrame() {
        return this.client.buildFrame(RPC_ID.CONFIG_GET_WIFI_STATUS);
    }

    /**
     * Sends get_wifi_status and returns a Promise that resolves with the response.
     * Registers a pending entry so the response frame is matched by seqId.
     * @param {function} sendFn - function(frame: Uint8Array) that writes to transport
     * @param {number} [timeoutMs=2000] - response timeout in milliseconds
     * @returns {Promise<{rpcId: number, seqId: number, payload: Uint8Array}>>}
     */
    sendGetWifiStatus(sendFn, timeoutMs = 2000) {
        const payloadBytes = new Uint8Array(0);
        return this.client.sendRequest(RPC_ID.CONFIG_GET_WIFI_STATUS, payloadBytes, sendFn, timeoutMs);
    }

}

// ─────────────────────────────────────────────
// Service: led
// ─────────────────────────────────────────────
export class LedServiceClient {
    constructor(client) {
        this.client = client;
    }

    /**
     * Builds a binary packet frame for display_pixels.
     * @param {{ colors }} payload - PixelData message
     * @returns {Uint8Array} ready-to-send frame
     */
    buildDisplayPixelsFrame(payload = {}) {
        const payloadBytes = encodePixeldata(payload);
        return this.client.buildFrame(RPC_ID.LED_DISPLAY_PIXELS, payloadBytes);
    }

    /**
     * Builds a binary packet frame for set_pixels.
     * @param {{ offset, colors, display }} payload - PixelChunk message
     * @returns {Uint8Array} ready-to-send frame
     */
    buildSetPixelsFrame(payload = {}) {
        const payloadBytes = encodePixelchunk(payload);
        return this.client.buildFrame(RPC_ID.LED_SET_PIXELS, payloadBytes);
    }

}

// ─────────────────────────────────────────────
// Service: power
// ─────────────────────────────────────────────
export class PowerServiceClient {
    constructor(client) {
        this.client = client;
    }

    /**
     * Builds a binary packet frame for read_power_info (no payload).
     * @returns {Uint8Array} ready-to-send frame
     */
    buildReadPowerInfoFrame() {
        return this.client.buildFrame(RPC_ID.POWER_READ_POWER_INFO);
    }

    /**
     * Sends read_power_info and returns a Promise that resolves with the response.
     * Registers a pending entry so the response frame is matched by seqId.
     * @param {function} sendFn - function(frame: Uint8Array) that writes to transport
     * @param {number} [timeoutMs=2000] - response timeout in milliseconds
     * @returns {Promise<{rpcId: number, seqId: number, payload: Uint8Array}>>}
     */
    sendReadPowerInfo(sendFn, timeoutMs = 2000) {
        const payloadBytes = new Uint8Array(0);
        return this.client.sendRequest(RPC_ID.POWER_READ_POWER_INFO, payloadBytes, sendFn, timeoutMs);
    }

    /**
     * Builds a binary packet frame for power_info (no payload).
     * @returns {Uint8Array} ready-to-send frame
     */
    buildPowerInfoFrame() {
        return this.client.buildFrame(RPC_ID.POWER_POWER_INFO);
    }

}


export const windRpcClient = new WindRpcClient();

