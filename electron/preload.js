import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    
    // Screen Capture API
    getScreenSources: () => ipcRenderer.invoke('screen:get-sources'),
    
    // Serial API
    listPorts: () => ipcRenderer.invoke('serial:list-ports'),
    connectPort: (portPath) => ipcRenderer.invoke('serial:connect', portPath),
    disconnectPort: () => ipcRenderer.invoke('serial:disconnect'),
    writeSerial: (buffer) => ipcRenderer.send('serial:write', buffer),

    // BLE (Bluetooth LE) API
    scanBleDevices: (timeout) => ipcRenderer.invoke('ble:scan', timeout),
    connectBleDevice: (address) => ipcRenderer.invoke('ble:connect', address),
    disconnectBleDevice: () => ipcRenderer.invoke('ble:disconnect'),
    writeBle: (buffer) => ipcRenderer.send('ble:write', buffer),

    // UDP API
    discoverUdpBoard: (targetIp, port, timeout) => ipcRenderer.invoke('udp:discover', targetIp, port, timeout),
    connectUdp: (ip, port) => ipcRenderer.invoke('udp:connect', ip, port),
    disconnectUdp: () => ipcRenderer.invoke('udp:disconnect'),
    writeUdp: (buffer) => ipcRenderer.send('udp:write', buffer),

    on: (channel, callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
    },
    send: (channel, data) => ipcRenderer.send(channel, data)
});
