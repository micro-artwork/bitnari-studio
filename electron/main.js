import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  screen,
  Menu,
  Tray,
  nativeImage,
} from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { serialService } from './serialService.js';
import { bleService } from './bleService.js';
import { udpService } from './udpService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let tray = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

// Disable background throttling for background ambient streaming
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,LazyFrameLoading,TimeoutUI');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createTray() {
  if (tray) return;

  try {
    const trayIconPath = path.join(__dirname, 'assets/bitnari-32.png');
    tray = new Tray(trayIconPath);
    tray.setToolTip('Bitnari Studio');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Bitnari Studio',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.error('[Main] Failed to create System Tray:', err);
  }
}

function createWindow() {
  const appIconPath = path.join(__dirname, 'assets/bitnari.ico');

  mainWindow = new BrowserWindow({
    width: 1460,
    height: 1085,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    show: false,
    icon: appIconPath,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  const devUrl = 'http://localhost:5173';
  const prodFile = path.join(__dirname, '../build/index.html');

  if (isDev) {
    mainWindow.loadURL(devUrl).catch(() => {
      console.log('Failed to load dev server, retrying in 1s...');
      setTimeout(() => mainWindow.loadURL(devUrl), 1000);
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });

    mainWindow.webContents.on('did-fail-load', () => {
      setTimeout(() => mainWindow?.loadURL(devUrl), 1000);
    });
  } else {
    mainWindow.loadFile(prodFile);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Remove default top window menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);

  // Enable Screen Capture handler for getDisplayMedia in Electron
  if (session.defaultSession) {
    session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        desktopCapturer
          .getSources({ types: ['screen'] })
          .then((sources) => {
            if (sources.length > 0) {
              callback({ video: sources[0], audio: 'loopback' });
            } else {
              callback({});
            }
          })
          .catch((err) => {
            console.error('[Main] setDisplayMediaRequestHandler error:', err);
            callback({});
          });
      },
    );
  }

  // IPC Handlers
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-platform', () => process.platform);

  // Desktop Capturer Handlers
  ipcMain.handle('screen:get-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const displays = screen.getAllDisplays();

    return sources.map((s, idx) => {
      const display =
        displays.find((d) => d.id.toString() === s.display_id) ||
        displays[idx] ||
        displays[0];
      return {
        id: s.id,
        name: s.name,
        displayId: s.display_id,
        width: display ? display.bounds.width : 1920,
        height: display ? display.bounds.height : 1080,
        rotation: display ? display.rotation : 0, // 0, 90, 180, 270 degrees
        isPrimary: display
          ? display.bounds.x === 0 && display.bounds.y === 0
          : idx === 0,
      };
    });
  });

  // Serial Port Handlers
  ipcMain.handle('serial:list-ports', async () => {
    return await serialService.listPorts();
  });

  ipcMain.handle('serial:connect', async (_, portPath) => {
    return await serialService.connectPort(portPath);
  });

  ipcMain.handle('serial:disconnect', async () => {
    return await serialService.disconnectPort();
  });

  ipcMain.on('serial:write', (_, buffer) => {
    serialService.writeRaw(buffer);
  });

  serialService.onDataCallback = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('serial:data', Array.from(data));
    }
  };

  // BLE (Bluetooth LE) Handlers
  ipcMain.removeHandler('ble:scan');
  ipcMain.removeHandler('ble:connect');
  ipcMain.removeHandler('ble:disconnect');

  ipcMain.handle('ble:scan', async (_, timeout) => {
    return await bleService.scanDevices(timeout);
  });

  ipcMain.handle('ble:connect', async (_, address) => {
    return await bleService.connectDevice(address);
  });

  ipcMain.handle('ble:disconnect', async () => {
    return await bleService.disconnectDevice();
  });

  ipcMain.on('ble:write', (_, buffer) => {
    bleService.writeRaw(buffer);
  });

  bleService.onDataCallback = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ble:data', Array.from(data));
    }
  };

  bleService.onScanResultCallback = (devices) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ble:scan-results', devices);
    }
  };

  // UDP RPC Handlers
  ipcMain.handle('udp:discover', async (event, targetIp, port, timeoutMs) => {
    if (typeof targetIp === 'number') {
      timeoutMs = port;
      port = targetIp;
      targetIp = null;
    }
    return await udpService.discoverBoard(targetIp, port, timeoutMs, (progress) => {
      try {
        event.sender.send('udp:discover:progress', progress);
      } catch (e) {}
    });
  });

  ipcMain.handle('udp:connect', async (_, ip, port) => {
    return await udpService.connectTarget(ip, port);
  });

  ipcMain.handle('udp:disconnect', async () => {
    return await udpService.disconnect();
  });

  ipcMain.on('udp:write', (_, buffer) => {
    udpService.writeRaw(buffer);
  });

  udpService.onDataCallback = (data, ip) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('udp:data', Array.from(data), ip);
    }
  };

  bleService.onConnectStatusCallback = (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ble:status', status);
    }
  };

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit();
  }
});

app.on('will-quit', () => {
  bleService.destroy();
});
