<script>
	import { Tabs, Switch, Slider } from 'bits-ui';
	import { configStore } from '$lib/stores/configStore.svelte.js';
	import RoiPreview from '$lib/components/RoiPreview.svelte';
	import DeviceSettingsModal from '$lib/components/DeviceSettingsModal.svelte';
	import { Monitor, Cpu, Sliders, Zap, Play, Square, RefreshCw, ShieldAlert, Sparkles, SlidersHorizontal, Radio, Settings, Wifi, Search } from 'lucide-svelte';
	import { onMount } from 'svelte';

	import { windRpcClient, cobsEncode, cobsDecode, decodePowerinfo } from '$lib/windrpc/WindRpcClient.js';
	import { lerpColors, enhanceSaturation, applyPowerManagement, GammaRgb, applyGammaCorrection } from '$lib/utils/imageUtil.js';
	import { initScreenCapture, stopScreenCapture, sampleScreenColors, applyBlankMask } from '$lib/services/screenCapture.js';
	import { initAudioCapture, stopAudioCapture, getAudioAnalysis, getAudioInputDevices } from '$lib/services/audioService.js';
	import { sampleMoodLightColors, sampleAudioRhythmColors } from '$lib/services/moodLightService.js';
	import { Music, Sun, Palette, Volume2 } from 'lucide-svelte';

	let streamInterval = null;
	let streamAnimId = null;
	let streamTimeoutId = null;
	let prevColors = [];
	let liveAudioAnalysis = $state({ bass: 0, mid: 0, treble: 0, volume: 0 });
	let scanCountdown = $state(0);
	let scanTimerInterval = null;
	let showDeviceSettingsModal = $state(false);
	let activeTransportTab = $state('usb'); // 'usb' | 'udp'
	let isUdpSearching = $state(false);

	let currentGammaTable = $derived.by(() => {
		if (!configStore.gammaEnabled) return null;
		return GammaRgb.createTable(configStore.gammaR, configStore.gammaG, configStore.gammaB);
	});
	let targetUdpIp = $state('192.168.1.119');
	let discoveredUdpTarget = $state({ ip: '192.168.1.119', port: 5000 });
	let udpSearchStatusText = $state('Target Board IP Ready');
	let lastPingLatency = $state(null);

	// Power Calibration Wizard States & Helpers
	let baseIdleWatt = $state(0.5);
	let measuredRedWatt = $state(null);
	let measuredGreenWatt = $state(null);
	let measuredBlueWatt = $state(null);

	function sendTestPattern(pattern) {
		if (!configStore.isConnected) return;
		const total = configStore.totalPixels || 30;
		let hex = 0x000000;
		if (pattern === 'RED') hex = 0xFF0000;
		else if (pattern === 'GREEN') hex = 0x00FF00;
		else if (pattern === 'BLUE') hex = 0x0000FF;

		const colors = new Array(total).fill(hex);
		const frame = windRpcClient.led.buildDisplayPixelsFrame({ colors });
		sendRpcFrame(frame);
	}

	let isAutoCalibrating = $state(false);
	let autoCalibStatusText = $state('');

	async function runAutoPowerCalibration() {
		if (!configStore.isConnected || configStore.isRunning || isAutoCalibrating) return;
		isAutoCalibrating = true;
		autoCalibStatusText = '1/4: Measuring OFF Standby Power...';
		try {
			// Step 1: All OFF
			sendTestPattern('OFF');
			await delay(600);
			const resOff = await windRpcClient.power.sendReadPowerInfo((f) => sendRpcFrame(f), 3000);
			if (!resOff || resOff.rpcId === 0x0000) {
				throw new Error('Power monitoring is not supported or disabled on this board.');
			}
			let idleW = 0, idleV = 0, idleA = 0;
			if (resOff && resOff.payload) {
				const infoOff = decodePowerinfo(resOff.payload);
				idleV = (infoOff.voltage_mill || 0) / 1000.0;
				idleA = (infoOff.ampere_mill || 0) / 1000.0;
				idleW = (infoOff.watt_mill > 0) ? (infoOff.watt_mill / 1000.0) : (idleV * idleA);
			}
			baseIdleWatt = Number(idleW.toFixed(3));

			// Step 2: Red
			autoCalibStatusText = `2/4: Measuring Red Power (OFF: ${idleV.toFixed(2)}V, ${idleA.toFixed(3)}A, ${idleW.toFixed(3)}W)...`;
			sendTestPattern('RED');
			await delay(600);
			const resRed = await windRpcClient.power.sendReadPowerInfo((f) => sendRpcFrame(f), 3000);
			if (!resRed || resRed.rpcId === 0x0000) {
				throw new Error('Power monitoring is not supported or disabled on this board.');
			}
			let redW = 0, redV = 0, redA = 0;
			if (resRed && resRed.payload) {
				const infoRed = decodePowerinfo(resRed.payload);
				redV = (infoRed.voltage_mill || 0) / 1000.0;
				redA = (infoRed.ampere_mill || 0) / 1000.0;
				redW = (infoRed.watt_mill > 0) ? (infoRed.watt_mill / 1000.0) : (redV * redA);
			}
			measuredRedWatt = Number(redW.toFixed(3));

			// Step 3: Green
			autoCalibStatusText = `3/4: Measuring Green Power (Red: ${redV.toFixed(2)}V, ${redA.toFixed(3)}A, ${redW.toFixed(3)}W)...`;
			sendTestPattern('GREEN');
			await delay(600);
			const resGreen = await windRpcClient.power.sendReadPowerInfo((f) => sendRpcFrame(f), 3000);
			if (!resGreen || resGreen.rpcId === 0x0000) {
				throw new Error('Power monitoring is not supported or disabled on this board.');
			}
			let greenW = 0, greenV = 0, greenA = 0;
			if (resGreen && resGreen.payload) {
				const infoGreen = decodePowerinfo(resGreen.payload);
				greenV = (infoGreen.voltage_mill || 0) / 1000.0;
				greenA = (infoGreen.ampere_mill || 0) / 1000.0;
				greenW = (infoGreen.watt_mill > 0) ? (infoGreen.watt_mill / 1000.0) : (greenV * greenA);
			}
			measuredGreenWatt = Number(greenW.toFixed(3));

			// Step 4: Blue
			autoCalibStatusText = `4/4: Measuring Blue Power (Green: ${greenV.toFixed(2)}V, ${greenA.toFixed(3)}A, ${greenW.toFixed(3)}W)...`;
			sendTestPattern('BLUE');
			await delay(600);
			const resBlue = await windRpcClient.power.sendReadPowerInfo((f) => sendRpcFrame(f), 3000);
			if (!resBlue || resBlue.rpcId === 0x0000) {
				throw new Error('Power monitoring is not supported or disabled on this board.');
			}
			let blueW = 0, blueV = 0, blueA = 0;
			if (resBlue && resBlue.payload) {
				const infoBlue = decodePowerinfo(resBlue.payload);
				blueV = (infoBlue.voltage_mill || 0) / 1000.0;
				blueA = (infoBlue.ampere_mill || 0) / 1000.0;
				blueW = (infoBlue.watt_mill > 0) ? (infoBlue.watt_mill / 1000.0) : (blueV * blueA);
			}
			measuredBlueWatt = Number(blueW.toFixed(3));

			// Step 5: Restore OFF & Calculate
			sendTestPattern('OFF');
			calculateWattSpecs();
			autoCalibStatusText = `Power Sensor Calibration Completed! (Red: ${redA.toFixed(2)}A, Green: ${greenA.toFixed(2)}A, Blue: ${blueA.toFixed(2)}A → R:${configStore.redMaxPowerW}W, G:${configStore.greenMaxPowerW}W, B:${configStore.blueMaxPowerW}W / LED)`;
		} catch (err) {
			console.error('[AutoPowerCalib] Error:', err);
			sendTestPattern('OFF');
			autoCalibStatusText = `Power Sensor Unsupported: Power monitoring is disabled or unsupported on this board.`;
			alert(`⚠️ Power Monitoring Unsupported\n\nPower monitoring/measurement (read_power_info / subscribe_power_info) is disabled or unsupported on the connected target board (CONFIG_BITNARI_POWER_MONITORING=n).\n\nThe power measurement procedure has been aborted.`);
		} finally {
			isAutoCalibrating = false;
		}
	}

	async function subscribePowerInfo(enable = true) {
		if (!configStore.isConnected) return;
		try {
			const res = await windRpcClient.power.sendSubscribePowerInfo({ enable, intervalMs: 1000 }, (f) => sendRpcFrame(f), 3000);
			if (!res || res.rpcId === 0x0000) {
				throw new Error('Power monitoring subscription is unsupported or disabled on this board.');
			}
		} catch (err) {
			console.error('[PowerSubscribe] Error:', err);
			alert(`⚠️ Power Monitoring Unsupported\n\nPower monitoring subscription (subscribe_power_info) is disabled or unsupported on the connected target board (CONFIG_BITNARI_POWER_MONITORING=n).\n\nThe subscription request has been aborted.`);
		}
	}

	function calculateWattSpecs() {
		const total = configStore.totalPixels || 1;
		const idle = Number(baseIdleWatt) || 0;

		if (measuredRedWatt > 0 && measuredRedWatt > idle) {
			configStore.redMaxPowerW = Number(((measuredRedWatt - idle) / total).toFixed(3));
		}
		if (measuredGreenWatt > 0 && measuredGreenWatt > idle) {
			configStore.greenMaxPowerW = Number(((measuredGreenWatt - idle) / total).toFixed(3));
		}
		if (measuredBlueWatt > 0 && measuredBlueWatt > idle) {
			configStore.blueMaxPowerW = Number(((measuredBlueWatt - idle) / total).toFixed(3));
		}
	}

	// Dynamic Sync Button Background Effects
	let moodGlowColor = $derived.by(() => {
		if (configStore.moodPreset === 'WarmWhite') return 'rgba(245, 158, 11, 0.4)';
		if (configStore.moodPreset === 'Cyberpunk') return 'rgba(236, 72, 153, 0.4)';
		if (configStore.moodPreset === 'Sunset') return 'rgba(244, 63, 94, 0.4)';
		if (configStore.moodPreset === 'Forest') return 'rgba(16, 185, 129, 0.4)';
		if (configStore.moodPreset === 'Ocean') return 'rgba(2, 132, 199, 0.4)';
		if (configStore.moodPreset === 'Rainbow') return 'rgba(168, 85, 247, 0.4)';
		return configStore.moodColor || 'rgba(245, 158, 11, 0.4)';
	});

	// Rolling peak/average tracker for 16 visualizer bars for Dynamic AGC Centering
	let barPeakTracker = new Array(16).fill(0.2);

	let audioBarHeights = $derived.by(() => {
		if (!configStore.isRunning || configStore.syncMode !== 'AudioSync') {
			return [25, 40, 20, 55, 35, 30, 60, 45, 35, 70, 40, 25, 45, 30, 20, 35];
		}
		const { freqData, bass, mid, treble, volume } = liveAudioAnalysis;

		if (freqData && freqData.length > 0) {
			const numBars = 16;
			const heights = [];
			const maxBin = Math.min(freqData.length, 75); // Sample up to 10kHz

			for (let b = 0; b < numBars; b++) {
				// Logarithmic bin indexing across FFT spectrum
				const startBin = Math.floor(Math.pow(b / numBars, 1.8) * (maxBin - 2)) + 1;
				const endBin = Math.max(startBin + 1, Math.floor(Math.pow((b + 1) / numBars, 1.8) * (maxBin - 2)) + 1);

				let sum = 0;
				let count = 0;
				for (let k = startBin; k < endBin && k < freqData.length; k++) {
					sum += freqData[k];
					count++;
				}
				const rawAvg = count > 0 ? (sum / count) / 255.0 : 0;

				// Dynamic AGC Centering: Adapt peak tracking so average height centers dynamically at ~50%
				barPeakTracker[b] = barPeakTracker[b] * 0.95 + rawAvg * 0.05;
				const dynamicGain = 0.50 / Math.max(0.04, barPeakTracker[b]);

				const sensitivity = (configStore.audioSensitivity || 1.5) / 1.5;
				const normalizedVal = Math.min(1.0, rawAvg * dynamicGain * sensitivity);

				heights.push(Math.max(12, Math.min(95, Math.round(normalizedVal * 75 + 12))));
			}
			return heights;
		}

		// Fallback if raw freqData array not available
		return [
			Math.max(12, Math.min(95, bass * 120 + 10)),
			Math.max(12, Math.min(95, bass * 135 + 15)),
			Math.max(12, Math.min(95, bass * 110 + 12)),
			Math.max(12, Math.min(95, bass * 140 + 18)),
			Math.max(12, Math.min(95, mid * 130 + 10)),
			Math.max(12, Math.min(95, mid * 145 + 14)),
			Math.max(12, Math.min(95, mid * 120 + 8)),
			Math.max(12, Math.min(95, mid * 150 + 16)),
			Math.max(12, Math.min(95, mid * 135 + 12)),
			Math.max(12, Math.min(95, treble * 140 + 12)),
			Math.max(12, Math.min(95, treble * 160 + 15)),
			Math.max(12, Math.min(95, treble * 135 + 8)),
			Math.max(12, Math.min(95, treble * 155 + 14)),
			Math.max(12, Math.min(95, volume * 110 + 10)),
			Math.max(12, Math.min(95, volume * 130 + 12)),
			Math.max(12, Math.min(95, volume * 105 + 8))
		];
	});

	async function handleUdpDiscovery() {
		if (window.api && window.api.discoverUdpBoard) {
			isUdpSearching = true;
			udpSearchStatusText = 'Scanning Network & IP...';
			try {
				const probeIp = (targetUdpIp || '').trim();
				const discovery = await window.api.discoverUdpBoard(probeIp || null, 5000, 3000);
				if (discovery && discovery.success && discovery.ip) {
					discoveredUdpTarget = { ip: discovery.ip, port: discovery.port || 5000 };
					targetUdpIp = discovery.ip;
					udpSearchStatusText = `Board Discovered: ${discovery.ip}:${discovery.port || 5000}`;
				} else {
					if (probeIp) {
						discoveredUdpTarget = { ip: probeIp, port: 5000 };
						udpSearchStatusText = `Target IP (${probeIp}) Ready`;
					} else {
						discoveredUdpTarget = null;
						udpSearchStatusText = 'Wi-Fi UDP Board Not Found';
					}
				}
			} catch (err) {
				console.error('[Frontend] UDP discovery error:', err);
				udpSearchStatusText = `Discovery Error: ${err.message}`;
			} finally {
				isUdpSearching = false;
			}
		}
	}

	let filteredBleDevices = $derived.by(() => {
		const raw = configStore.availableBleDevices || [];
		const filterText = (configStore.bleNameFilter || '').trim().toLowerCase();
		if (!filterText) {
			return raw;
		}
		return raw.filter(dev => {
			const name = (dev.name || '').toLowerCase();
			const addr = (dev.address || '').toLowerCase();
			return name.includes(filterText) || addr.includes(filterText);
		});
	});

	// Sync selectedBleAddress whenever filter changes or scan finishes
	$effect(() => {
		if (configStore.connectionType === 'BLE' && !configStore.isConnected) {
			if (filteredBleDevices.length > 0) {
				const hasSelected = filteredBleDevices.some(d => d.address === configStore.selectedBleAddress);
				if (!hasSelected) {
					configStore.selectedBleAddress = filteredBleDevices[0].address;
				}
			} else {
				configStore.selectedBleAddress = '';
			}
		}
	});

	// Svelte 5 Auto-Save $effect reactor
	$effect(() => {
		const _deps = [
			configStore.syncMode,
			configStore.selectedPort,
			configStore.screenCaptureMethod,
			configStore.selectedScreenId,
			configStore.screenRotation,
			configStore.captureFrameRate,
			configStore.livePreview,
			configStore.hdrToneMapping,
			configStore.autoLetterbox,
			configStore.moodPreset,
			configStore.moodEffect,
			configStore.moodColor,
			configStore.moodSpeed,
			configStore.moodFrameRate,
			configStore.audioSource,
			configStore.selectedAudioDeviceId,
			configStore.audioSensitivity,
			configStore.audioPalette,
			configStore.audioFrameRate,
			configStore.topPixels,
			configStore.bottomPixels,
			configStore.leftPixels,
			configStore.rightPixels,
			configStore.topBlank,
			configStore.bottomBlank,
			configStore.leftBlank,
			configStore.rightBlank,
			configStore.startPoint,
			configStore.rotationDirection,
			configStore.powerMode,
			configStore.redMaxPowerW,
			configStore.greenMaxPowerW,
			configStore.blueMaxPowerW,
			configStore.brightnessPercent,
			configStore.adaptiveMaxPowerW,
			configStore.powerProtectionEnabled,
			configStore.powerProtectionWatt,
			configStore.gammaEnabled,
			configStore.gammaR,
			configStore.gammaG,
			configStore.gammaB,
			configStore.saturationBoost,
			configStore.smoothingFactor
		];
		configStore.saveConfig();
	});

	function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

	async function refreshAudioDevices() {
		const devices = await getAudioInputDevices();
		configStore.availableAudioDevices = devices;
	}

	async function refreshSerialPorts() {
		if (window.api && window.api.listPorts) {
			try {
				console.log('[Frontend] Requesting serial ports from Electron main process...');
				const ports = await window.api.listPorts();
				console.log('[Frontend] Received serial ports list:', ports);
				
				if (Array.isArray(ports)) {
					configStore.availablePorts = [...ports];

					if (ports.length > 0) {
						// Auto-select saved port if found in scanned list, otherwise default to first port
						const foundPort = ports.find(p => p.path === configStore.selectedPort);
						if (foundPort) {
							configStore.selectedPort = foundPort.path;
						} else {
							configStore.selectedPort = ports[0].path;
						}
					} else {
						configStore.selectedPort = '';
					}
				}
			} catch (err) {
				console.error('[Frontend] Failed to fetch serial ports:', err);
				configStore.availablePorts = [];
			}
		} else if (typeof navigator !== 'undefined' && navigator.serial) {
			try {
				const webPorts = await navigator.serial.getPorts();
				configStore.availablePorts = webPorts.map((p, idx) => ({
					path: `WebSerial_${idx + 1}`,
					manufacturer: 'Web Serial Device',
					friendlyName: `Web Serial Port ${idx + 1}`
				}));
			} catch (err) {
				console.warn('[Frontend] Web Serial getPorts error:', err);
			}
		}
	}

	function refreshBleDevices() {
		if (window.api && window.api.scanBleDevices) {
			if (scanTimerInterval) {
				clearInterval(scanTimerInterval);
				scanTimerInterval = null;
			}
			configStore.isBleScanning = true;
			scanCountdown = 30;

			scanTimerInterval = setInterval(() => {
				if (scanCountdown > 1) {
					scanCountdown--;
				} else {
					clearInterval(scanTimerInterval);
					scanTimerInterval = null;
					scanCountdown = 0;
					configStore.isBleScanning = false;
				}
			}, 1000);

			console.log('[Frontend] Requesting BLE device scan session (30s)...');
			window.api.scanBleDevices(30);
		}
	}

	function sendRpcFrame(frame) {
		if (configStore.connectionType === 'BLE') {
			if (window.api && window.api.writeBle) {
				window.api.writeBle(frame);
			}
		} else if (configStore.connectionType === 'UDP') {
			if (window.api && window.api.writeUdp) {
				window.api.writeUdp(frame);
			}
		} else {
			if (window.api && window.api.writeSerial) {
				// USB CDC Serial requires COBS stream framing + 0x00 delimiter
				const cobsPacket = cobsEncode(frame);
				const framed = new Uint8Array(cobsPacket.length + 1);
				framed.set(cobsPacket, 0);
				framed[cobsPacket.length] = 0;
				window.api.writeSerial(framed);
			}
		}
	}

	async function refreshScreenSources() {
		if (typeof window !== 'undefined' && window.api && window.api.getScreenSources) {
			try {
				console.log('[Frontend] Requesting screen sources from Electron main process...');
				const screens = await window.api.getScreenSources();
				console.log('[Frontend] Received screen sources list:', screens);
				if (Array.isArray(screens)) {
					configStore.availableScreens = [...screens];
					if (screens.length > 0) {
						const foundScreen = screens.find(s => s.id === configStore.selectedScreenId);
						if (foundScreen) {
							configStore.selectedScreenId = foundScreen.id;
							configStore.screenRotation = foundScreen.rotation || 0;
						} else {
							configStore.selectedScreenId = screens[0].id;
							configStore.screenRotation = screens[0].rotation || 0;
						}
					}
				}
			} catch (err) {
				console.error('[Frontend] Failed to fetch screen sources:', err);
			}
		}
	}

	async function performPingTest() {
		await delay(100); // Small delay to ensure transport is ready
		console.log(`[Ping Test] Sending Ping request via ${configStore.connectionType} (RPC ID: 0x0601)...`);
		try {
			const startTime = performance.now();
			const response = await windRpcClient.common.sendPing(
				(frame) => sendRpcFrame(frame),
				2000
			);
			const elapsed = (performance.now() - startTime).toFixed(1);
			lastPingLatency = elapsed;
			console.log(`%c[Ping Test] Ping Response OK! (${configStore.connectionType}, Latency: ${elapsed}ms)`, 'color: #10b981; font-weight: bold; font-size: 13px;', response);
		} catch (err) {
			lastPingLatency = null;
			console.warn(`%c[Ping Test] Ping Failed / Timeout (${configStore.connectionType}):`, 'color: #ef4444; font-weight: bold; font-size: 13px;', err.message);
		}
	}

	function selectTransportTab(tabName) {
		if (configStore.isConnected) return;
		activeTransportTab = tabName;
	}

	async function toggleConnect() {
		if (configStore.isConnected) {
			stopStreaming();
			await delay(150); // Grace period to drain streaming buffers before port close
			if (configStore.connectionType === 'BLE') {
				if (window.api && window.api.disconnectBleDevice) {
					await window.api.disconnectBleDevice();
				}
			} else if (configStore.connectionType === 'UDP') {
				if (window.api && window.api.disconnectUdp) {
					await window.api.disconnectUdp();
				}
			} else {
				if (window.api && window.api.disconnectPort) {
					await window.api.disconnectPort();
				}
			}
			configStore.isConnected = false;
			configStore.isRunning = false;
			windRpcClient.resetAccumulator();
			lastPingLatency = null;
		} else {
			if (activeTransportTab === 'usb') {
				configStore.connectionType = 'USB-CDC';
				if (!configStore.selectedPort) {
					alert('Please select a valid Serial (COM) Port.');
					return;
				}
				if (window.api && window.api.connectPort) {
					try {
						await window.api.connectPort(configStore.selectedPort);
						configStore.isConnected = true;
						await performPingTest();
					} catch (err) {
						alert(`Serial Port (${configStore.selectedPort}) Connection Failed: ${err.message}`);
					}
				}
			} else if (activeTransportTab === 'udp') {
				configStore.connectionType = 'UDP';
				let target = discoveredUdpTarget;
				if (!target) {
					await handleUdpDiscovery();
					target = discoveredUdpTarget;
				}
				if (target && window.api && window.api.connectUdp) {
					try {
						await window.api.connectUdp(target.ip, target.port);
						configStore.isConnected = true;
						await performPingTest();
					} catch (err) {
						alert(`Wi-Fi UDP (${target.ip}:${target.port}) Connection Failed: ${err.message}`);
					}
				} else {
					alert('Board not found on active Wi-Fi network.');
				}
			} else if (configStore.connectionType === 'BLE') {
				if (!configStore.selectedBleAddress) {
					alert('Please select a valid BLE device.');
					return;
				}
				if (window.api && window.api.connectBleDevice) {
					try {
						const res = await window.api.connectBleDevice(configStore.selectedBleAddress);
						if (res && res.success) {
							configStore.isConnected = true;
							performPingTest();
						} else {
							alert(`BLE Connection Failed: ${res?.error || 'Unknown error'}`);
						}
					} catch (err) {
						alert(`Failed to connect BLE device: ${err.message}`);
					}
				}
			}
		}
	}

	let streamSessionId = 0;
	let lastActiveSyncMode = $state(configStore.syncMode);

	// Seamless Hot-Switching: Reactively switch capture engines cleanly when mode changes during active sync
	$effect(() => {
		const curMode = configStore.syncMode;
		if (curMode !== lastActiveSyncMode) {
			lastActiveSyncMode = curMode;
			if (configStore.isRunning && configStore.isConnected) {
				startStreaming();
			}
		}
	});

	function toggleRun() {
		if (!configStore.isConnected) {
			toggleConnect();
		}
		configStore.isRunning = !configStore.isRunning;

		if (configStore.isRunning) {
			startStreaming();
		} else {
			stopStreaming();
		}
	}

	async function startStreaming() {
		const thisSession = ++streamSessionId;
		stopStreaming();
		console.log(`[Streaming] Starting sync mode: "${configStore.syncMode}" (Session #${thisSession})...`);

		if (configStore.syncMode === 'ScreenSync') {
			await initScreenCapture(configStore.selectedScreenId);
		} else if (configStore.syncMode === 'AudioSync') {
			await initAudioCapture(configStore.audioSource, configStore.selectedAudioDeviceId);
		}

		// Clean cancellation if user switched mode again while async capture initialization was in flight
		if (thisSession !== streamSessionId || !configStore.isRunning || !configStore.isConnected) {
			console.log(`[Streaming] Stale session #${thisSession} aborted cleanly.`);
			return;
		}

		let frameCount = 0;
		let lastFrameTime = performance.now();

		function streamTick() {
			if (thisSession !== streamSessionId || !configStore.isRunning || !configStore.isConnected) {
				stopStreaming();
				return;
			}

			const now = performance.now();
			let targetFPS = 60;
			if (configStore.syncMode === 'ScreenSync') {
				targetFPS = configStore.captureFrameRate || 60;
			} else if (configStore.syncMode === 'AudioSync') {
				targetFPS = configStore.audioFrameRate || 60;
			} else if (configStore.syncMode === 'MoodLight') {
				targetFPS = configStore.moodFrameRate || 30;
			}

			const targetInterval = 1000 / targetFPS;
			const elapsed = now - lastFrameTime;

			if (elapsed < targetInterval - 1) return;
			lastFrameTime = now;

			const totalPixels = configStore.totalPixels || 30;
			let rawColors = [];

			if (configStore.syncMode === 'ScreenSync') {
				rawColors = sampleScreenColors({
					topPixels: configStore.topPixels,
					bottomPixels: configStore.bottomPixels,
					leftPixels: configStore.leftPixels,
					rightPixels: configStore.rightPixels,
					topAvailable: configStore.topAvailable,
					bottomAvailable: configStore.bottomAvailable,
					leftAvailable: configStore.leftAvailable,
					rightAvailable: configStore.rightAvailable,
					topBlank: configStore.topBlank,
					bottomBlank: configStore.bottomBlank,
					leftBlank: configStore.leftBlank,
					rightBlank: configStore.rightBlank,
					startPoint: configStore.startPoint,
					rotationDirection: configStore.rotationDirection,
					autoLetterbox: configStore.autoLetterbox,
					hdrToneMapping: configStore.hdrToneMapping
				});
			} else if (configStore.syncMode === 'AudioSync') {
				liveAudioAnalysis = getAudioAnalysis(configStore.audioSensitivity);
				rawColors = sampleAudioRhythmColors(totalPixels, {
					audioPalette: configStore.audioPalette,
					audioStereoMode: configStore.audioStereoMode,
					topPixels: configStore.topPixels,
					bottomPixels: configStore.bottomPixels,
					leftPixels: configStore.leftPixels,
					rightPixels: configStore.rightPixels
				}, liveAudioAnalysis);
			} else if (configStore.syncMode === 'MoodLight') {
				rawColors = sampleMoodLightColors(totalPixels, {
					moodPreset: configStore.moodPreset,
					moodEffect: configStore.moodEffect,
					moodColor: configStore.moodColor,
					moodSpeed: configStore.moodSpeed
				});
			}

			// Apply color tuning & smoothing
			let processedColors = rawColors.map(c => enhanceSaturation(c, configStore.saturationBoost));

			// Apply Per-Channel Gamma Calibration Table
			if (currentGammaTable) {
				processedColors = applyGammaCorrection(processedColors, currentGammaTable);
			}

			if (prevColors.length === processedColors.length && configStore.smoothingFactor < 1.0) {
				processedColors = lerpColors(prevColors, processedColors, configStore.smoothingFactor);
			}

			// Apply Power Management
			let finalColors = applyPowerManagement(processedColors, {
				brightnessPercent: configStore.brightnessPercent,
				powerMode: configStore.powerMode,
				adaptiveMaxPowerW: configStore.adaptiveMaxPowerW,
				powerProtectionEnabled: configStore.powerProtectionEnabled,
				powerProtectionWatt: configStore.powerProtectionWatt,
				redMaxPowerW: configStore.redMaxPowerW,
				greenMaxPowerW: configStore.greenMaxPowerW,
				blueMaxPowerW: configStore.blueMaxPowerW
			});

			// Enforce strict Blank (blackout 0x00000000) mask on disabled/blanked edges across ALL sync modes
			finalColors = applyBlankMask(finalColors, {
				startPoint: configStore.startPoint,
				rotationDirection: configStore.rotationDirection,
				topAvailable: configStore.topAvailable,
				bottomAvailable: configStore.bottomAvailable,
				leftAvailable: configStore.leftAvailable,
				rightAvailable: configStore.rightAvailable,
				topPixels: configStore.topPixels,
				bottomPixels: configStore.bottomPixels,
				leftPixels: configStore.leftPixels,
				rightPixels: configStore.rightPixels,
				topBlank: configStore.topBlank,
				bottomBlank: configStore.bottomBlank,
				leftBlank: configStore.leftBlank,
				rightBlank: configStore.rightBlank
			});

			// Store clean final masked colors for frame smoothing
			prevColors = [...finalColors];

			// Convert array of {r, g, b} objects to uint32 hex numbers (0x00RRGGBB)
			const hexColors = finalColors.map(c => {
				const r = Math.max(0, Math.min(255, c.r || 0));
				const g = Math.max(0, Math.min(255, c.g || 0));
				const b = Math.max(0, Math.min(255, c.b || 0));
				return ((r << 16) | (g << 8) | b) >>> 0;
			});

			const frame = windRpcClient.led.buildDisplayPixelsFrame({ colors: hexColors });

			// Transmit via active transport (USB-CDC or BLE)
			sendRpcFrame(frame);

			frameCount++;
			if (frameCount % 120 === 1) {
				console.log(`[Streaming] Transmitted frame #${frameCount} (${configStore.syncMode}, ${finalColors.length} LEDs)`);
			}
		}

		// High-precision non-throttled setInterval ticker for background ambient streaming
		streamInterval = setInterval(streamTick, 10);
	}

	function stopStreaming() {
		if (streamAnimId) {
			cancelAnimationFrame(streamAnimId);
			streamAnimId = null;
		}
		if (streamTimeoutId) {
			clearTimeout(streamTimeoutId);
			streamTimeoutId = null;
		}
		if (streamInterval) {
			clearInterval(streamInterval);
			streamInterval = null;
		}
		stopScreenCapture();
		stopAudioCapture();

		// Send Clear (0x00000000) frame to turn off all LEDs when stopping sync
		if (configStore.isConnected) {
			try {
				const total = configStore.totalPixels || 30;
				const clearColors = new Array(total).fill(0x000000);
				const clearFrame = windRpcClient.led.buildDisplayPixelsFrame({ colors: clearColors });
				sendRpcFrame(clearFrame);
				console.log(`[Streaming] Transmitted clear (0x00000000) frame to turn off ${total} LEDs.`);
			} catch (err) {
				console.warn('[Streaming] Failed to send clear frame on stop:', err);
			}
		}
		console.log('[Streaming] Stopped streaming capture.');
	}

	let currentPlatform = $state('win32');

	onMount(async () => {
		if (window.api && window.api.getPlatform) {
			try {
				currentPlatform = await window.api.getPlatform();
			} catch (e) {
				console.warn('[Frontend] Failed to get platform:', e);
			}
		}

		refreshSerialPorts();
		refreshScreenSources();
		refreshAudioDevices();

		// Listen for incoming serial / BLE data from Electron main process
		if (window.api && window.api.on) {
			window.api.on('serial:data', (data) => {
				const bytesStr = Array.from(new Uint8Array(data)).map(b => b.toString(16).padStart(2, '0')).join(' ');
				console.log(`%c[Serial RX Raw Data] (${data.length} bytes): ${bytesStr}`, 'color: #3b82f6; font-weight: bold;');
				windRpcClient.receiveBytes(data, (notification) => {
					console.log('%c[WindRPC Serial Notification Received]', 'color: #10b981; font-weight: bold;', notification);
				});
			});

			window.api.on('udp:data', (data) => {
				windRpcClient.receiveRawDatagram(data, (notification) => {
					console.log('%c[WindRPC UDP Notification Received]', 'color: #10b981; font-weight: bold;', notification);
				});
			});

			window.api.on('ble:scan-result', (devices) => {
				console.log(`[Frontend] Live BLE scan result received (${devices.length} devices):`, devices);
				if (Array.isArray(devices)) {
					configStore.availableBleDevices = [...devices];
					if (devices.length > 0) {
						const found = devices.find(d => d.address === configStore.selectedBleAddress);
						if (found) {
							configStore.selectedBleAddress = found.address;
						} else if (!configStore.selectedBleAddress) {
							configStore.selectedBleAddress = devices[0].address;
						}
					}
				}
			});

			window.api.on('ble:data', (data) => {
				const bytesStr = Array.from(new Uint8Array(data)).map(b => b.toString(16).padStart(2, '0')).join(' ');
				console.log(`%c[BLE RX Raw Data] (${data.length} bytes): ${bytesStr}`, 'color: #8b5cf6; font-weight: bold;');
				windRpcClient.receiveBytes(data, (notification) => {
					console.log('%c[WindRPC BLE Notification Received]', 'color: #10b981; font-weight: bold;', notification);
				});
			});

			window.api.on('ble:status', (status) => {
				if (!status.connected && configStore.isConnected && configStore.connectionType === 'BLE') {
					console.warn('[Frontend] BLE Disconnected unexpectedly.');
					configStore.isConnected = false;
					configStore.isRunning = false;
					stopStreaming();
				}
			});
		}
	});
</script>

<div class="h-full w-full p-6 grid grid-cols-12 gap-6 overflow-y-auto">
	<!-- Left Side: Power, Connection & Interactive Preview -->
	<div class="col-span-12 lg:col-span-5 flex flex-col gap-6">
		<!-- Power Status Glass Panel -->
		<div class="glass-panel rounded-2xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group min-h-[250px]">
			<!-- Dynamic Background Effect Layer based on syncMode (Active ONLY when Play is running) -->
			{#if configStore.isRunning}
				<div class="absolute inset-0 pointer-events-none z-0 overflow-hidden transition-opacity duration-500 opacity-100">
					{#if configStore.syncMode === 'AudioSync'}
						<!-- 1. Audio Sync: Real-Time Equalizer Spectrum Bars Animation -->
						<div class="absolute inset-0 flex items-end justify-center gap-1.5 px-6 pb-2 overflow-hidden opacity-70">
							<!-- Ambient Glow Layer -->
							<div 
								class="absolute inset-0 bg-gradient-to-t from-pink-600/35 via-purple-600/20 to-transparent blur-xl transition-all duration-300"
								style="opacity: {0.5 + liveAudioAnalysis.volume * 0.5};"
							></div>
							{#each audioBarHeights as height}
								<div class="flex-1 flex flex-col items-center justify-end h-32 max-w-[14px]">
									<div 
										class="w-full bg-gradient-to-t from-pink-600 via-purple-500 to-cyan-400 rounded-t-sm transition-all duration-75 ease-out shadow-[0_0_12px_rgba(236,72,153,0.5)]"
										style="height: {height}%;"
									>
										<div class="w-full h-1 bg-cyan-300 rounded-t-sm shadow-[0_0_6px_#22d3ee]"></div>
									</div>
								</div>
							{/each}
						</div>

					{:else if configStore.syncMode === 'ScreenSync'}
						<!-- 2. Screen Sync: Sci-Fi Holographic Radar, Grid & Scanning Line -->
						<div class="absolute inset-0 overflow-hidden">
							<!-- Grid Lines Pattern -->
							<div class="absolute inset-0 bg-[radial-gradient(#6366f1_1.2px,transparent_1.2px)] [background-size:16px_16px] opacity-25"></div>
							
							<!-- Radial Ambient Glow -->
							<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl group-hover:bg-indigo-500/30 transition-all duration-500"></div>

							<!-- Expanding Radar Ripple Ring -->
							<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border border-cyan-400/50 animate-ping"></div>

							<!-- Sci-Fi HUD Corner Brackets -->
							<div class="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-indigo-500/60 rounded-tl-sm"></div>
							<div class="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-indigo-500/60 rounded-tr-sm"></div>
							<div class="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-indigo-500/60 rounded-bl-sm"></div>
							<div class="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-indigo-500/60 rounded-br-sm"></div>
						</div>

					{:else if configStore.syncMode === 'MoodLight'}
						<!-- 3. Ambient Mood Light: Fluid Color Glow Aura -->
						<div class="absolute inset-0 overflow-hidden">
							<div 
								class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full blur-3xl transition-all duration-1000 ease-in-out animate-pulse"
								style="background: radial-gradient(circle, {moodGlowColor} 0%, transparent 75%);"
							></div>
							{#if configStore.moodPreset === 'Rainbow'}
								<div class="absolute inset-0 bg-gradient-to-r from-red-500/15 via-emerald-500/15 to-sky-500/15 blur-2xl animate-pulse"></div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Foreground Card Content (Badge, Play Button, Status Text) -->
			<div class="relative z-10 flex flex-col items-center">
				<!-- Device Status Badge -->
				<div class="flex items-center gap-2 mb-4 px-3.5 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-300 shadow-md backdrop-blur-md">
					<span class="w-2 h-2 rounded-full {configStore.isRunning ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}"></span>
					{configStore.isRunning ? 'Device Active & Transmitting' : configStore.isConnected ? 'Port Opened (Standby)' : 'Disconnected'}
				</div>

				<!-- Main Run Button -->
				<button 
					onclick={toggleRun}
					class="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-2xl mb-4 cursor-pointer titlebar-no-drag
					{configStore.isRunning 
						? 'bg-gradient-to-tr from-rose-600 to-pink-500 shadow-rose-500/40 hover:shadow-rose-500/60 ring-4 ring-rose-500/20' 
						: 'bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-indigo-500/40 hover:shadow-indigo-500/60 ring-4 ring-indigo-500/20'}"
				>
					{#if configStore.isRunning}
						<Square class="w-10 h-10 text-white fill-white" />
					{:else}
						<Play class="w-10 h-10 text-white fill-white ml-1" />
					{/if}
				</button>

				<h2 class="text-xl font-bold text-zinc-100 drop-shadow-sm">{configStore.isRunning ? 'Streaming LED Sync' : 'Start Synchronization'}</h2>
				<p class="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed">
					{configStore.isRunning 
						? `Real-time LED sync stream active in ${configStore.syncMode} mode.` 
						: 'Click button to connect port and start LED synchronization.'}
				</p>
			</div>
		</div>

		<!-- Operating Sync Mode Selection Card (Left Sidebar Master Control) -->
		<div class="glass-panel rounded-2xl p-5 flex flex-col gap-3">
			<div class="flex items-center gap-2 text-xs font-semibold text-zinc-300">
				<Zap class="w-4 h-4 text-indigo-400" />
				<span>Operating Sync Mode</span>
			</div>
			
			<div class="grid grid-cols-3 gap-2">
				<button 
					onclick={() => {
						configStore.syncMode = 'ScreenSync';
						if (configStore.isRunning) startStreaming();
					}}
					class="flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all cursor-pointer titlebar-no-drag gap-1.5
					{configStore.syncMode === 'ScreenSync' 
						? 'bg-indigo-600/30 border-indigo-500/80 text-white shadow-lg shadow-indigo-500/20' 
						: 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80'}"
				>
					<Monitor class="w-5 h-5 {configStore.syncMode === 'ScreenSync' ? 'text-indigo-400' : 'text-zinc-400'}" />
					<span class="text-xs font-bold">Screen</span>
				</button>

				<button 
					onclick={() => {
						configStore.syncMode = 'AudioSync';
						if (configStore.isRunning) startStreaming();
					}}
					class="flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all cursor-pointer titlebar-no-drag gap-1.5
					{configStore.syncMode === 'AudioSync' 
						? 'bg-pink-600/30 border-pink-500/80 text-white shadow-lg shadow-pink-500/20' 
						: 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80'}"
				>
					<Music class="w-5 h-5 {configStore.syncMode === 'AudioSync' ? 'text-pink-400' : 'text-zinc-400'}" />
					<span class="text-xs font-bold">Audio</span>
				</button>

				<button 
					onclick={() => {
						configStore.syncMode = 'MoodLight';
						if (configStore.isRunning) startStreaming();
					}}
					class="flex flex-col items-center justify-center py-3 px-2 rounded-xl border transition-all cursor-pointer titlebar-no-drag gap-1.5
					{configStore.syncMode === 'MoodLight' 
						? 'bg-amber-600/30 border-amber-500/80 text-white shadow-lg shadow-amber-500/20' 
						: 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80'}"
				>
					<Sun class="w-5 h-5 {configStore.syncMode === 'MoodLight' ? 'text-amber-400' : 'text-zinc-400'}" />
					<span class="text-xs font-bold">Mood</span>
				</button>
			</div>
		</div>

		<!-- RPC Transport & Connection Box (USB-CDC / Wi-Fi UDP) -->
		<div class="glass-panel rounded-2xl p-5 flex flex-col gap-4">
			<!-- Transport Header & Tab Selector -->
			<div class="flex items-center justify-between border-b border-zinc-800/80 pb-3">
				<div class="flex items-center gap-2">
					<button
						disabled={configStore.isConnected}
						onclick={() => selectTransportTab('usb')}
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer titlebar-no-drag disabled:opacity-50 disabled:cursor-not-allowed
						{activeTransportTab === 'usb' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'text-zinc-400 hover:text-zinc-200'}"
					>
						<Cpu class="w-4 h-4" />
						<span>USB-CDC</span>
					</button>

					<button
						disabled={configStore.isConnected}
						onclick={() => { selectTransportTab('udp'); if (!discoveredUdpTarget) handleUdpDiscovery(); }}
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer titlebar-no-drag disabled:opacity-50 disabled:cursor-not-allowed
						{activeTransportTab === 'udp' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40' : 'text-zinc-400 hover:text-zinc-200'}"
					>
						<Wifi class="w-4 h-4" />
						<span>Wi-Fi UDP</span>
					</button>
				</div>

				{#if activeTransportTab === 'usb'}
					<button 
						onclick={refreshSerialPorts}
						class="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 titlebar-no-drag cursor-pointer"
					>
						<RefreshCw class="w-3 h-3" /> 
						Scan / Refresh
					</button>
				{:else}
					<button 
						onclick={handleUdpDiscovery}
						disabled={isUdpSearching}
						class="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 titlebar-no-drag cursor-pointer disabled:opacity-50"
					>
						<RefreshCw class="w-3 h-3 {isUdpSearching ? 'animate-spin' : ''}" /> 
						<span>{isUdpSearching ? 'Searching...' : 'Discover Server'}</span>
					</button>
				{/if}
			</div>

			<!-- Tab Content Body -->
			{#if activeTransportTab === 'usb'}
				<!-- USB-CDC Controls -->
				<div class="flex flex-col gap-2.5">
					<div class="flex items-center gap-3">
						<select 
							id="port-select"
							bind:value={configStore.selectedPort}
							disabled={configStore.isConnected}
							class="flex-1 bg-zinc-900/90 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-colors titlebar-no-drag cursor-pointer disabled:opacity-60"
						>
							{#if configStore.availablePorts.length === 0}
								<option value="">No COM Ports Detected (Click Refresh)</option>
							{:else}
								{#each configStore.availablePorts as port}
									<option value={port.path}>{port.path} - {port.friendlyName || port.manufacturer}</option>
								{/each}
							{/if}
						</select>
						
						<button
							onclick={toggleConnect}
							class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer titlebar-no-drag shrink-0
							{configStore.isConnected && configStore.connectionType === 'USB-CDC' ? 'bg-zinc-800 hover:bg-zinc-700 text-rose-300' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}"
						>
							{configStore.isConnected && configStore.connectionType === 'USB-CDC' ? 'Disconnect' : 'Connect'}
						</button>

						<button
							disabled={!configStore.isConnected}
							onclick={() => showDeviceSettingsModal = true}
							class="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer titlebar-no-drag shrink-0 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
							title="Device Hardware Settings"
						>
							<Settings class="w-4 h-4 text-indigo-400" />
						</button>
					</div>
				</div>
			{:else}
				<!-- Wi-Fi UDP Controls -->
				<div class="flex flex-col gap-3">
					<div class="flex items-center gap-3">
						<div class="flex-1 bg-zinc-900/90 border border-zinc-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
							<Wifi class="w-4 h-4 text-emerald-400 shrink-0" />
							<input
								type="text"
								bind:value={targetUdpIp}
								placeholder="Board IP (e.g. 192.168.1.119)"
								disabled={configStore.isConnected}
								class="bg-transparent border-none text-xs text-zinc-200 focus:outline-none w-full font-mono font-bold"
							/>
						</div>

						<button
							onclick={async () => {
								if (configStore.isConnected && configStore.connectionType === 'UDP') {
									await toggleConnect();
								} else {
									const connectIp = (targetUdpIp || '').trim() || (discoveredUdpTarget ? discoveredUdpTarget.ip : '192.168.1.119');
									if (!connectIp) {
										alert('Please enter a valid board IP address.');
										return;
									}
									console.log(`[Frontend] Connecting UDP directly to ${connectIp}:5000...`);
									await window.api.connectUdp(connectIp, 5000);
									configStore.connectionType = 'UDP';
									configStore.isConnected = true;
									discoveredUdpTarget = { ip: connectIp, port: 5000 };
									await performPingTest();
								}
							}}
							disabled={isUdpSearching}
							class="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer titlebar-no-drag shrink-0 disabled:opacity-50
							{configStore.isConnected && configStore.connectionType === 'UDP' ? 'bg-zinc-800 hover:bg-zinc-700 text-rose-300' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}"
						>
							{configStore.isConnected && configStore.connectionType === 'UDP' ? 'Disconnect' : 'Connect'}
						</button>

						<button
							disabled={!configStore.isConnected}
							onclick={() => showDeviceSettingsModal = true}
							class="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer titlebar-no-drag shrink-0 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
							title="Device Hardware Settings"
						>
							<Settings class="w-4 h-4 text-indigo-400" />
						</button>
					</div>
				</div>
			{/if}

			<!-- Bottom Connection Status Indicator Bar -->
			<div class="flex items-center justify-between text-[11px] pt-1.5 border-t border-zinc-800/60 text-zinc-400">
				<div class="flex items-center gap-2">
					<span class="w-2 h-2 rounded-full {configStore.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}"></span>
					<span>
						{#if configStore.isConnected}
							<strong class="text-zinc-200">Connected:</strong> {configStore.connectionType} {configStore.connectionType === 'UDP' && discoveredUdpTarget ? `(${discoveredUdpTarget.ip})` : ''}
						{:else}
							<strong class="text-zinc-400">Status:</strong> Disconnected
						{/if}
					</span>
				</div>

				{#if configStore.isConnected && lastPingLatency}
					<span class="text-emerald-400 font-mono font-bold">Latency: {lastPingLatency}ms</span>
				{/if}
			</div>
		</div>

		<!-- ROI & Geometry Interactive Preview -->
		<RoiPreview />
	</div>

	<!-- Right Side: Comprehensive Configuration Tabs -->
	<div class="col-span-12 lg:col-span-7 flex flex-col gap-4">
		<!-- (Preset Profile Manager Header Bar hidden per user request) -->

		<Tabs.Root value="screen" class="w-full h-full flex flex-col gap-4">
			<Tabs.List class="flex items-center gap-1.5 p-1.5 glass-panel rounded-xl overflow-x-auto">
				<Tabs.Trigger 
					value="screen" 
					class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-400 data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all cursor-pointer titlebar-no-drag whitespace-nowrap"
				>
					<Monitor class="w-4 h-4" /> Screen Capture
				</Tabs.Trigger>
				<Tabs.Trigger 
					value="audio" 
					class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-400 data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all cursor-pointer titlebar-no-drag whitespace-nowrap"
				>
					<Music class="w-4 h-4" /> Audio Rhythm
				</Tabs.Trigger>
				<Tabs.Trigger 
					value="mood" 
					class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-400 data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all cursor-pointer titlebar-no-drag whitespace-nowrap"
				>
					<Sun class="w-4 h-4" /> Mood Light
				</Tabs.Trigger>
				<Tabs.Trigger 
					value="geometry" 
					class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-400 data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all cursor-pointer titlebar-no-drag whitespace-nowrap"
				>
					<SlidersHorizontal class="w-4 h-4" /> LED Geometry
				</Tabs.Trigger>
				<Tabs.Trigger 
					value="power" 
					class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-400 data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all cursor-pointer titlebar-no-drag whitespace-nowrap"
				>
					<Zap class="w-4 h-4" /> Power & Safety
				</Tabs.Trigger>
				<Tabs.Trigger 
					value="color" 
					class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-400 data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all cursor-pointer titlebar-no-drag whitespace-nowrap"
				>
					<Sparkles class="w-4 h-4" /> Color Tuning
				</Tabs.Trigger>
			</Tabs.List>

			<!-- 1. Screen & Capture Pipeline Tab -->
			<Tabs.Content value="screen" class="glass-panel rounded-2xl p-6 flex flex-col gap-5 flex-1">
				<h3 class="text-sm font-semibold text-zinc-200 flex items-center gap-2">
					<Monitor class="w-4 h-4 text-indigo-400" /> Screen Capture & HDR Pipeline
				</h3>

				<!-- Target Display Monitor (Auto-detects resolution & orientation) -->
				<div class="flex flex-col gap-2 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex items-center justify-between">
						<label for="monitor-select" class="text-xs font-medium text-zinc-300">Target Display Monitor</label>
						<button 
							onclick={refreshScreenSources}
							class="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 titlebar-no-drag cursor-pointer"
						>
							<RefreshCw class="w-2.5 h-2.5" /> Refresh
						</button>
					</div>
					<select 
						id="monitor-select"
						bind:value={configStore.selectedScreenId}
						class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none titlebar-no-drag cursor-pointer"
					>
						{#if configStore.availableScreens.length === 0}
							<option value="">Primary Display (Auto Detected)</option>
						{:else}
							{#each configStore.availableScreens as screen}
								<option value={screen.id}>
									{screen.name} {screen.isPrimary ? '(Primary)' : ''} - {screen.width}x{screen.height} {screen.rotation ? `(${screen.rotation}° Rotation)` : ''}
								</option>
							{/each}
						{/if}
					</select>
				</div>

				<!-- Capture Method Selection (OS-Aware Engine) -->
				<div class="flex items-center justify-between p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div>
						<div class="text-sm font-medium text-zinc-200">Capture Method Engine</div>
						<div class="text-xs text-zinc-400 mt-0.5">
							{#if currentPlatform === 'win32'}
								DXGI Desktop Duplication (DirectX 11) or GDI Standard
							{:else if currentPlatform === 'darwin'}
								ScreenCaptureKit (macOS Native API Pipeline)
							{:else}
								PipeWire / X11 SHM (Linux Native API Pipeline)
							{/if}
						</div>
					</div>
					{#if currentPlatform === 'win32'}
						<select 
							bind:value={configStore.screenCaptureMethod}
							class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none titlebar-no-drag cursor-pointer"
						>
							<option value="DXGI">DXGI (DirectX 11)</option>
							<option value="GDI">GDI Standard</option>
						</select>
					{:else}
						<span class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-indigo-300">
							{currentPlatform === 'darwin' ? 'ScreenCaptureKit' : 'PipeWire / X11'}
						</span>
					{/if}
				</div>

				<!-- HDR Tone Mapping Toggle -->
				<div class="flex items-center justify-between p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div>
						<div class="text-sm font-medium text-zinc-200">ACES Filmic HDR Tone Mapping</div>
						<div class="text-xs text-zinc-400 mt-0.5">Converts ScRGB HDR linear float colors to sRGB Gamma 2.2 for vivid output.</div>
					</div>
					<button 
						type="button"
						role="switch"
						aria-label="Toggle HDR Tone Mapping"
						aria-checked={configStore.hdrToneMapping}
						onclick={() => configStore.hdrToneMapping = !configStore.hdrToneMapping}
						class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner
						{configStore.hdrToneMapping ? 'bg-indigo-600' : 'bg-zinc-700 hover:bg-zinc-600'}"
					>
						<span 
							class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out
							{configStore.hdrToneMapping ? 'translate-x-5' : 'translate-x-0'}"
						></span>
					</button>
				</div>

				<!-- Auto Letterbox Detection Toggle -->
				<div class="flex items-center justify-between p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div>
						<div class="text-sm font-medium text-zinc-200">Auto Letterbox / Pillarbox Scan</div>
						<div class="text-xs text-zinc-400 mt-0.5">0.5s scanline sampling to automatically offset ROI insets for 21:9 movies.</div>
					</div>
					<button 
						type="button"
						role="switch"
						aria-label="Toggle Auto Letterbox Scan"
						aria-checked={configStore.autoLetterbox}
						onclick={() => configStore.autoLetterbox = !configStore.autoLetterbox}
						class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner
						{configStore.autoLetterbox ? 'bg-indigo-600' : 'bg-zinc-700 hover:bg-zinc-600'}"
					>
						<span 
							class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out
							{configStore.autoLetterbox ? 'translate-x-5' : 'translate-x-0'}"
						></span>
					</button>
				</div>

				<!-- Refresh Rate Slider -->
				<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex justify-between items-center text-xs">
						<span class="text-zinc-300 font-medium">Capture Refresh Rate</span>
						<span class="text-indigo-400 font-bold">{configStore.captureFrameRate} Hz / FPS</span>
					</div>
					<input 
						type="range" min="10" max="60" step="1" 
						bind:value={configStore.captureFrameRate}
						class="w-full accent-indigo-500 cursor-pointer titlebar-no-drag"
					/>
				</div>
			</Tabs.Content>

			<!-- Audio Rhythm Sync Tab -->
			<Tabs.Content value="audio" class="glass-panel rounded-2xl p-6 flex flex-col gap-5 flex-1">
				<h3 class="text-sm font-semibold text-zinc-200 flex items-center gap-2">
					<Music class="w-4 h-4 text-pink-400" /> Audio Spectrum & Music Rhythm Sync
				</h3>

				<!-- Audio Capture Input Source Selector -->
				<div class="flex flex-col gap-2 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<label for="audio-source" class="text-xs font-medium text-zinc-300">Audio Capture Method</label>
					<select 
						id="audio-source"
						bind:value={configStore.audioSource}
						onchange={() => { if (configStore.isRunning && configStore.syncMode === 'AudioSync') startStreaming(); }}
						class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none titlebar-no-drag cursor-pointer"
					>
						<option value="SystemAudio">PC System Audio Loopback (Speakers / Games / Browser)</option>
						<option value="Microphone">Microphone Line-In (External Audio Input)</option>
					</select>
				</div>

				<!-- Real-time Equalizer Audio Activity Monitor -->
				<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex items-center justify-between text-xs font-semibold text-zinc-200">
						<span class="flex items-center gap-1.5"><Volume2 class="w-3.5 h-3.5 text-pink-400" /> Live Audio Spectrum Activity</span>
						<span class="text-pink-400 font-mono">{(liveAudioAnalysis.volume * 100).toFixed(0)}% Vol</span>
					</div>
					<div class="grid grid-cols-3 gap-3">
						<div class="flex flex-col gap-1.5">
							<div class="flex justify-between text-[11px] text-zinc-400">
								<span>Bass</span>
								<span class="text-rose-400 font-bold font-mono">{(liveAudioAnalysis.bass * 100).toFixed(0)}%</span>
							</div>
							<div class="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
								<div class="bg-rose-500 h-2.5 rounded-full transition-all duration-75" style="width: {Math.min(100, liveAudioAnalysis.bass * 100)}%"></div>
							</div>
						</div>
						<div class="flex flex-col gap-1.5">
							<div class="flex justify-between text-[11px] text-zinc-400">
								<span>Mid</span>
								<span class="text-emerald-400 font-bold font-mono">{(liveAudioAnalysis.mid * 100).toFixed(0)}%</span>
							</div>
							<div class="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
								<div class="bg-emerald-500 h-2.5 rounded-full transition-all duration-75" style="width: {Math.min(100, liveAudioAnalysis.mid * 100)}%"></div>
							</div>
						</div>
						<div class="flex flex-col gap-1.5">
							<div class="flex justify-between text-[11px] text-zinc-400">
								<span>Treble</span>
								<span class="text-sky-400 font-bold font-mono">{(liveAudioAnalysis.treble * 100).toFixed(0)}%</span>
							</div>
							<div class="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
								<div class="bg-sky-500 h-2.5 rounded-full transition-all duration-75" style="width: {Math.min(100, liveAudioAnalysis.treble * 100)}%"></div>
							</div>
						</div>
					</div>
				</div>

				<!-- Audio Palette Selection -->
				<div class="flex flex-col gap-2 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<label for="audio-palette" class="text-xs font-medium text-zinc-300">Audio Reactive Color Theme</label>
					<select 
						id="audio-palette"
						bind:value={configStore.audioPalette}
						class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none titlebar-no-drag cursor-pointer"
					>
						<option value="Party">Party Rainbow Equalizer</option>
						<option value="Neon">Cyberpunk Neon Pink & Magenta Pulse</option>
						<option value="Fire">Fire Flame Bass Pulse</option>
						<option value="Ocean">Ocean Deep Blue Wave</option>
					</select>
				</div>

				<!-- Stereo Spatial Audio Mapping Switch -->
				<div class="flex items-center justify-between p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex flex-col gap-0.5">
						<span class="text-xs font-medium text-zinc-200">Stereo Spatial Audio Mapping</span>
						<span class="text-[11px] text-zinc-400">Splits Left & Right audio channels across monitor edges for 3D soundstage immersion</span>
					</div>
					<button 
						type="button"
						role="switch"
						aria-label="Toggle Stereo Spatial Mapping"
						aria-checked={configStore.audioStereoMode}
						onclick={() => configStore.audioStereoMode = !configStore.audioStereoMode}
						class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner
						{configStore.audioStereoMode ? 'bg-pink-600' : 'bg-zinc-700 hover:bg-zinc-600'}"
					>
						<span 
							class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out
							{configStore.audioStereoMode ? 'translate-x-4' : 'translate-x-0'}"
						></span>
					</button>
				</div>

				<!-- Audio Sensitivity Slider -->
				<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex justify-between items-center text-xs">
						<span class="text-zinc-300 font-medium">Audio Sensitivity Boost</span>
						<span class="text-pink-400 font-bold">{configStore.audioSensitivity.toFixed(1)}x</span>
					</div>
					<input 
						type="range" min="0.5" max="3.0" step="0.1" 
						bind:value={configStore.audioSensitivity}
						class="w-full accent-pink-500 cursor-pointer titlebar-no-drag"
					/>
				</div>

				<!-- Audio Refresh Rate Slider -->
				<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex justify-between items-center text-xs">
						<span class="text-zinc-300 font-medium">Audio Sync Refresh Rate</span>
						<span class="text-pink-400 font-bold">{configStore.audioFrameRate} Hz / FPS</span>
					</div>
					<input 
						type="range" min="10" max="120" step="1" 
						bind:value={configStore.audioFrameRate}
						class="w-full accent-pink-500 cursor-pointer titlebar-no-drag"
					/>
				</div>
			</Tabs.Content>

			<!-- Ambient Mood Light Tab -->
			<Tabs.Content value="mood" class="glass-panel rounded-2xl p-6 flex flex-col gap-5 flex-1">
				<h3 class="text-sm font-semibold text-zinc-200 flex items-center gap-2">
					<Sun class="w-4 h-4 text-amber-400" /> Ambient Mood Light & Palette Presets
				</h3>

				<!-- Mood Preset Select Grid -->
				<div class="flex flex-col gap-2 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<label for="mood-preset" class="text-xs font-medium text-zinc-300">Mood Preset</label>
					<select 
						id="mood-preset"
						bind:value={configStore.moodPreset}
						class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none titlebar-no-drag cursor-pointer"
					>
						<option value="WarmWhite">Warm White 2700K (Reading & Comfort)</option>
						<option value="Cyberpunk">Cyberpunk Neon (Pink & Cyan)</option>
						<option value="Sunset">Sunset Glow (Warm Orange Red)</option>
						<option value="Forest">Forest Emerald (Relaxing Green)</option>
						<option value="Ocean">Deep Ocean Blue</option>
						<option value="Rainbow">Rainbow Spectrum</option>
						<option value="Custom">Custom Single Color</option>
					</select>
				</div>

				<!-- Mood Effect Pattern -->
				<div class="flex flex-col gap-2 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<label for="mood-effect" class="text-xs font-medium text-zinc-300">Animation Pattern</label>
					<select 
						id="mood-effect"
						bind:value={configStore.moodEffect}
						class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none titlebar-no-drag cursor-pointer"
					>
						<option value="Static">Static Solid Color</option>
						<option value="Breathing">Gentle Breathing</option>
						<option value="Pulse">Heartbeat Pulse</option>
						<option value="Wave">Color Wave Flow</option>
					</select>
				</div>

				{#if configStore.moodPreset === 'Custom'}
					<div class="flex items-center justify-between p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
						<span class="text-xs font-medium text-zinc-300">Custom Mood Color</span>
						<input type="color" bind:value={configStore.moodColor} class="w-10 h-8 rounded bg-zinc-800 border border-zinc-700 cursor-pointer titlebar-no-drag" />
					</div>
				{/if}

				<!-- Mood Refresh Rate Slider -->
				<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex justify-between items-center text-xs">
						<span class="text-zinc-300 font-medium">Mood Light Refresh Rate</span>
						<span class="text-amber-400 font-bold">{configStore.moodFrameRate} Hz / FPS</span>
					</div>
					<input 
						type="range" min="10" max="60" step="1" 
						bind:value={configStore.moodFrameRate}
						class="w-full accent-amber-500 cursor-pointer titlebar-no-drag"
					/>
				</div>
			</Tabs.Content>

			<!-- 2. LED Geometry & Layout Tab -->
			<Tabs.Content value="geometry" class="glass-panel rounded-2xl p-6 flex flex-col gap-5 flex-1">
				<h3 class="text-sm font-semibold text-zinc-200 flex items-center gap-2">
					<SlidersHorizontal class="w-4 h-4 text-indigo-400" /> LED Strip Layout & Orientation
				</h3>

				<!-- Start Point & Direction -->
				<div class="grid grid-cols-2 gap-4">
					<div class="flex flex-col gap-2 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
						<label for="start-point" class="text-xs font-medium text-zinc-300">LED #0 Start Corner</label>
						<select 
							id="start-point"
							bind:value={configStore.startPoint}
							class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none titlebar-no-drag cursor-pointer"
						>
							<option value="TopLeft">Top-Left Corner</option>
							<option value="TopRight">Top-Right Corner</option>
							<option value="BottomLeft">Bottom-Left Corner</option>
							<option value="BottomRight">Bottom-Right Corner</option>
						</select>
					</div>

					<div class="flex flex-col gap-2 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
						<label for="rotation-dir" class="text-xs font-medium text-zinc-300">Wiring Rotation Direction</label>
						<select 
							id="rotation-dir"
							bind:value={configStore.rotationDirection}
							class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none titlebar-no-drag cursor-pointer"
						>
							<option value="Clockwise">Clockwise</option>
							<option value="CounterClockwise">Counter-Clockwise</option>
						</select>
					</div>
				</div>

				<!-- LED Strip Position Configuration Table (1:1 Ported from C# HilightBox) -->
				<div class="flex flex-col gap-2.5 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex items-center justify-between border-b border-zinc-800 pb-2 text-xs font-semibold text-zinc-400 px-1">
						<span>LED Strip Side</span>
						<div class="flex items-center gap-6">
							<span>Status & Options</span>
							<span class="w-16 text-right">Pixel Count</span>
						</div>
					</div>

					<!-- Top Row -->
					<div class="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/40 border border-zinc-800/60">
						<span class="text-xs font-bold text-blue-300">Top</span>
						<div class="flex items-center gap-6">
							<div class="flex items-center gap-2">
								<span class="text-xs text-zinc-300 font-medium">Enable</span>
								<button type="button" role="switch" aria-label="Toggle Top Enable" aria-checked={configStore.topAvailable} onclick={() => configStore.topAvailable = !configStore.topAvailable} class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner {configStore.topAvailable ? 'bg-indigo-600' : 'bg-zinc-700 hover:bg-zinc-600'}"><span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out {configStore.topAvailable ? 'translate-x-5' : 'translate-x-0'}"></span></button>
							</div>

							<div class="flex items-center gap-2 {!configStore.topAvailable ? 'opacity-40 pointer-events-none' : ''}">
								<span class="text-xs text-amber-300 font-medium">Blank</span>
								<button type="button" role="switch" aria-label="Toggle Top Blank" aria-checked={configStore.topBlank} disabled={!configStore.topAvailable} onclick={() => configStore.topBlank = !configStore.topBlank} class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner {configStore.topBlank ? 'bg-amber-600' : 'bg-zinc-700 hover:bg-zinc-600'}"><span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out {configStore.topBlank ? 'translate-x-5' : 'translate-x-0'}"></span></button>
							</div>

							<input type="number" bind:value={configStore.topPixels} min="1" max="300" disabled={!configStore.topAvailable} class="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-right text-indigo-300 font-bold titlebar-no-drag disabled:opacity-40" />
						</div>
					</div>

					<!-- Bottom Row -->
					<div class="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/40 border border-zinc-800/60">
						<span class="text-xs font-bold text-purple-300">Bottom</span>
						<div class="flex items-center gap-6">
							<div class="flex items-center gap-2">
								<span class="text-xs text-zinc-300 font-medium">Enable</span>
								<button type="button" role="switch" aria-label="Toggle Bottom Enable" aria-checked={configStore.bottomAvailable} onclick={() => configStore.bottomAvailable = !configStore.bottomAvailable} class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner {configStore.bottomAvailable ? 'bg-indigo-600' : 'bg-zinc-700 hover:bg-zinc-600'}"><span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out {configStore.bottomAvailable ? 'translate-x-5' : 'translate-x-0'}"></span></button>
							</div>

							<div class="flex items-center gap-2 {!configStore.bottomAvailable ? 'opacity-40 pointer-events-none' : ''}">
								<span class="text-xs text-amber-300 font-medium">Blank</span>
								<button type="button" role="switch" aria-label="Toggle Bottom Blank" aria-checked={configStore.bottomBlank} disabled={!configStore.bottomAvailable} onclick={() => configStore.bottomBlank = !configStore.bottomBlank} class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner {configStore.bottomBlank ? 'bg-amber-600' : 'bg-zinc-700 hover:bg-zinc-600'}"><span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out {configStore.bottomBlank ? 'translate-x-5' : 'translate-x-0'}"></span></button>
							</div>

							<input type="number" bind:value={configStore.bottomPixels} min="1" max="300" disabled={!configStore.bottomAvailable} class="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-right text-indigo-300 font-bold titlebar-no-drag disabled:opacity-40" />
						</div>
					</div>

					<!-- Left Row -->
					<div class="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/40 border border-zinc-800/60">
						<span class="text-xs font-bold text-red-300">Left</span>
						<div class="flex items-center gap-6">
							<div class="flex items-center gap-2">
								<span class="text-xs text-zinc-300 font-medium">Enable</span>
								<button type="button" role="switch" aria-label="Toggle Left Enable" aria-checked={configStore.leftAvailable} onclick={() => configStore.leftAvailable = !configStore.leftAvailable} class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner {configStore.leftAvailable ? 'bg-indigo-600' : 'bg-zinc-700 hover:bg-zinc-600'}"><span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out {configStore.leftAvailable ? 'translate-x-5' : 'translate-x-0'}"></span></button>
							</div>

							<div class="flex items-center gap-2 {!configStore.leftAvailable ? 'opacity-40 pointer-events-none' : ''}">
								<span class="text-xs text-amber-300 font-medium">Blank</span>
								<button type="button" role="switch" aria-label="Toggle Left Blank" aria-checked={configStore.leftBlank} disabled={!configStore.leftAvailable} onclick={() => configStore.leftBlank = !configStore.leftBlank} class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner {configStore.leftBlank ? 'bg-amber-600' : 'bg-zinc-700 hover:bg-zinc-600'}"><span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out {configStore.leftBlank ? 'translate-x-5' : 'translate-x-0'}"></span></button>
							</div>

							<input type="number" bind:value={configStore.leftPixels} min="1" max="300" disabled={!configStore.leftAvailable} class="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-right text-indigo-300 font-bold titlebar-no-drag disabled:opacity-40" />
						</div>
					</div>

					<!-- Right Row -->
					<div class="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/40 border border-zinc-800/60">
						<span class="text-xs font-bold text-emerald-300">Right</span>
						<div class="flex items-center gap-6">
							<div class="flex items-center gap-2">
								<span class="text-xs text-zinc-300 font-medium">Enable</span>
								<button type="button" role="switch" aria-label="Toggle Right Enable" aria-checked={configStore.rightAvailable} onclick={() => configStore.rightAvailable = !configStore.rightAvailable} class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner {configStore.rightAvailable ? 'bg-indigo-600' : 'bg-zinc-700 hover:bg-zinc-600'}"><span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out {configStore.rightAvailable ? 'translate-x-5' : 'translate-x-0'}"></span></button>
							</div>

							<div class="flex items-center gap-2 {!configStore.rightAvailable ? 'opacity-40 pointer-events-none' : ''}">
								<span class="text-xs text-amber-300 font-medium">Blank</span>
								<button type="button" role="switch" aria-label="Toggle Right Blank" aria-checked={configStore.rightBlank} disabled={!configStore.rightAvailable} onclick={() => configStore.rightBlank = !configStore.rightBlank} class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner {configStore.rightBlank ? 'bg-amber-600' : 'bg-zinc-700 hover:bg-zinc-600'}"><span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out {configStore.rightBlank ? 'translate-x-5' : 'translate-x-0'}"></span></button>
							</div>

							<input type="number" bind:value={configStore.rightPixels} min="1" max="300" disabled={!configStore.rightAvailable} class="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-right text-indigo-300 font-bold titlebar-no-drag disabled:opacity-40" />
						</div>
					</div>
				</div>
			</Tabs.Content>

			<!-- 3. Power & Protection Tab (C# 1:1 Ported) -->
			<Tabs.Content value="power" class="glass-panel rounded-2xl p-6 flex flex-col gap-5 flex-1">
				<h3 class="text-sm font-semibold text-zinc-200 flex items-center gap-2">
					<ShieldAlert class="w-4 h-4 text-emerald-400" /> Power Management & Hardware Safety
				</h3>

				<!-- Estimated Wattage Info -->
				<div class="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
					<div>
						<div class="text-xs text-emerald-300 font-semibold">Estimated Max Power Draw</div>
						<div class="text-lg font-bold text-emerald-200 mt-0.5">{configStore.estimatedMaxWatt} Watts</div>
					</div>
					<div class="text-xs text-zinc-400">Total {configStore.totalPixels} Pixels</div>
				</div>

				<!-- Power Limiting Mode Selector (C# 1:1) -->
				<div class="flex flex-col gap-2 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<label for="power-mode" class="text-xs font-medium text-zinc-300">Power Management Mode</label>
					<select 
						id="power-mode"
						bind:value={configStore.powerMode}
						class="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none titlebar-no-drag cursor-pointer"
					>
						<option value="Static">Static Brightness Scale Mode (%)</option>
						<option value="Adaptive">Adaptive Dynamic Power Limit Mode (Watt Cap)</option>
					</select>
				</div>

				<!-- Dynamic Controls Based on Selected Power Mode -->
				{#if configStore.powerMode === 'Static'}
					<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
						<div class="flex justify-between items-center text-xs">
							<span class="text-zinc-300 font-medium">Static Brightness Scale</span>
							<span class="text-emerald-400 font-bold">{configStore.brightnessPercent}%</span>
						</div>
						<input 
							type="range" min="10" max="100" step="1" 
							bind:value={configStore.brightnessPercent}
							class="w-full accent-emerald-500 cursor-pointer titlebar-no-drag"
						/>
					</div>
				{:else}
					<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
						<div class="flex justify-between items-center text-xs">
							<span class="text-zinc-300 font-medium">Adaptive Total Power Cap</span>
							<span class="text-amber-400 font-bold">{configStore.adaptiveMaxPowerW} Watts</span>
						</div>
						<input 
							type="range" min="5" max="150" step="1" 
							bind:value={configStore.adaptiveMaxPowerW}
							class="w-full accent-amber-500 cursor-pointer titlebar-no-drag"
						/>
					</div>
				{/if}

				<!-- RGB Channel Power Specs (Watts / LED Chip) -->
				<div class="flex flex-col gap-2 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<span class="text-xs font-medium text-zinc-300 mb-1">Per-Channel LED Wattage Specs (W / LED)</span>
					<div class="grid grid-cols-3 gap-3">
						<div class="flex flex-col gap-1 p-2.5 bg-zinc-800/60 rounded-lg border border-zinc-800">
							<span class="text-[11px] text-rose-300 font-medium">Red Power (W)</span>
							<input type="number" step="0.001" min="0.001" max="1.0" bind:value={configStore.redMaxPowerW} class="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-rose-200 font-mono titlebar-no-drag" />
						</div>
						<div class="flex flex-col gap-1 p-2.5 bg-zinc-800/60 rounded-lg border border-zinc-800">
							<span class="text-[11px] text-emerald-300 font-medium">Green Power (W)</span>
							<input type="number" step="0.001" min="0.001" max="1.0" bind:value={configStore.greenMaxPowerW} class="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-emerald-200 font-mono titlebar-no-drag" />
						</div>
						<div class="flex flex-col gap-1 p-2.5 bg-zinc-800/60 rounded-lg border border-zinc-800">
							<span class="text-[11px] text-sky-300 font-medium">Blue Power (W)</span>
							<input type="number" step="0.001" min="0.001" max="1.0" bind:value={configStore.blueMaxPowerW} class="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-sky-200 font-mono titlebar-no-drag" />
						</div>
					</div>
				</div>

				<!-- Interactive Power Calibration Wizard -->
				<div class="flex flex-col gap-3.5 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs font-semibold text-zinc-200">LED Power Calibration Wizard</span>
						<button 
							type="button"
							onclick={runAutoPowerCalibration}
							disabled={!configStore.isConnected || configStore.isRunning || isAutoCalibrating}
							class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold titlebar-no-drag cursor-pointer flex items-center gap-1.5 shadow shrink-0"
							title={configStore.isRunning ? "Stop sync streaming before calibrating power" : "Power Sensor Auto Sequence"}
						>
							<Zap class="w-3.5 h-3.5 {isAutoCalibrating ? 'animate-spin' : ''}" />
							<span>{isAutoCalibrating ? 'Calibrating...' : 'Power Sensor Auto Sequence'}</span>
						</button>
					</div>

					{#if autoCalibStatusText}
						<div class="text-xs px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 font-medium animate-pulse">
							{autoCalibStatusText}
						</div>
					{/if}

					<div class="text-[11px] text-zinc-400 leading-relaxed">
						Measures standby, Red, Green, and Blue power via onboard Power sensor or USB meter to calibrate per-LED chip consumption. (Note: Full White test is omitted for overcurrent protection)
					</div>
					
					<div class="grid grid-cols-4 gap-2">
						<button 
							type="button"
							onclick={() => sendTestPattern('OFF')}
							disabled={!configStore.isConnected || configStore.isRunning || isAutoCalibrating}
							class="px-2 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:pointer-events-none text-zinc-300 text-xs font-medium titlebar-no-drag border border-zinc-700 cursor-pointer flex flex-col items-center gap-1"
							title={configStore.isRunning ? "Stop sync streaming to test patterns" : "Turn OFF LEDs"}
						>
							<span class="w-2.5 h-2.5 rounded-full bg-zinc-600"></span>
							<span>OFF (Standby)</span>
						</button>
						<button 
							type="button"
							onclick={() => sendTestPattern('RED')}
							disabled={!configStore.isConnected || configStore.isRunning || isAutoCalibrating}
							class="px-2 py-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 disabled:opacity-40 disabled:pointer-events-none text-rose-300 text-xs font-medium titlebar-no-drag border border-rose-800/50 cursor-pointer flex flex-col items-center gap-1"
							title={configStore.isRunning ? "Stop sync streaming to test patterns" : "Display Pure Red"}
						>
							<span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
							<span>Full Red</span>
						</button>
						<button 
							type="button"
							onclick={() => sendTestPattern('GREEN')}
							disabled={!configStore.isConnected || configStore.isRunning || isAutoCalibrating}
							class="px-2 py-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 disabled:opacity-40 disabled:pointer-events-none text-emerald-300 text-xs font-medium titlebar-no-drag border border-emerald-800/50 cursor-pointer flex flex-col items-center gap-1"
							title={configStore.isRunning ? "Stop sync streaming to test patterns" : "Display Pure Green"}
						>
							<span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
							<span>Full Green</span>
						</button>
						<button 
							type="button"
							onclick={() => sendTestPattern('BLUE')}
							disabled={!configStore.isConnected || configStore.isRunning || isAutoCalibrating}
							class="px-2 py-2 rounded-lg bg-sky-950/40 hover:bg-sky-900/60 disabled:opacity-40 disabled:pointer-events-none text-sky-300 text-xs font-medium titlebar-no-drag border border-sky-800/50 cursor-pointer flex flex-col items-center gap-1"
							title={configStore.isRunning ? "Stop sync streaming to test patterns" : "Display Pure Blue"}
						>
							<span class="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
							<span>Full Blue</span>
						</button>
					</div>

					<!-- Read-Only Sensor Measurement Displays -->
					<div class="flex flex-col gap-2 pt-2 border-t border-zinc-800/80 text-xs">
						<div class="flex items-center justify-between text-zinc-400">
							<span>Power Sensor Measured Values (Read-Only):</span>
							<span class="text-zinc-500">Total {configStore.totalPixels} LEDs</span>
						</div>
						<div class="grid grid-cols-4 gap-2">
							<div class="flex flex-col gap-1">
								<span class="text-[10px] text-zinc-400">OFF (Base W)</span>
								<input type="text" readonly value={baseIdleWatt != null ? `${baseIdleWatt} W` : '-'} class="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-400 font-mono titlebar-no-drag cursor-not-allowed select-none text-center" />
							</div>
							<div class="flex flex-col gap-1">
								<span class="text-[10px] text-rose-300">Red Measured W</span>
								<input type="text" readonly value={measuredRedWatt != null ? `${measuredRedWatt} W` : '-'} class="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-rose-300 font-mono titlebar-no-drag cursor-not-allowed select-none text-center font-semibold" />
							</div>
							<div class="flex flex-col gap-1">
								<span class="text-[10px] text-emerald-300">Green Measured W</span>
								<input type="text" readonly value={measuredGreenWatt != null ? `${measuredGreenWatt} W` : '-'} class="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-emerald-300 font-mono titlebar-no-drag cursor-not-allowed select-none text-center font-semibold" />
							</div>
							<div class="flex flex-col gap-1">
								<span class="text-[10px] text-sky-300">Blue Measured W</span>
								<input type="text" readonly value={measuredBlueWatt != null ? `${measuredBlueWatt} W` : '-'} class="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-sky-300 font-mono titlebar-no-drag cursor-not-allowed select-none text-center font-semibold" />
							</div>
						</div>
					</div>
				</div>
			</Tabs.Content>

			<!-- 4. Color Tuning & Corrections Tab -->
			<Tabs.Content value="color" class="glass-panel rounded-2xl p-6 flex flex-col gap-5 flex-1">
				<h3 class="text-sm font-semibold text-zinc-200 flex items-center gap-2">
					<Sparkles class="w-4 h-4 text-purple-400" /> Color Tuning & Smoothing
				</h3>

				<!-- Saturation Boost Slider -->
				<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex justify-between items-center text-xs">
						<span class="text-zinc-300 font-medium">Color Saturation Boost</span>
						<span class="text-purple-400 font-bold">{configStore.saturationBoost.toFixed(2)}x</span>
					</div>
					<input 
						type="range" min="1.0" max="2.5" step="0.05" 
						bind:value={configStore.saturationBoost}
						class="w-full accent-purple-500 cursor-pointer titlebar-no-drag"
					/>
				</div>

				<!-- Temporal Smoothing Factor Slider -->
				<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex justify-between items-center text-xs">
						<span class="text-zinc-300 font-medium">Frame Lerp Smoothing Factor</span>
						<span class="text-purple-400 font-bold">{configStore.smoothingFactor.toFixed(2)}</span>
					</div>
					<input 
						type="range" min="0.05" max="1.0" step="0.05" 
						bind:value={configStore.smoothingFactor}
						class="w-full accent-purple-500 cursor-pointer titlebar-no-drag"
					/>
				</div>

				<!-- RGB Gamma Controls -->
				<div class="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-800/80 rounded-xl">
					<div class="flex items-center justify-between mb-1">
						<span class="text-xs font-medium text-zinc-200">Per-Channel Gamma Calibration</span>
						<button 
							type="button"
							role="switch"
							aria-label="Toggle Gamma Calibration"
							aria-checked={configStore.gammaEnabled}
							onclick={() => configStore.gammaEnabled = !configStore.gammaEnabled}
							class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none titlebar-no-drag shadow-inner
							{configStore.gammaEnabled ? 'bg-purple-600' : 'bg-zinc-700 hover:bg-zinc-600'}"
						>
							<span 
								class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out
								{configStore.gammaEnabled ? 'translate-x-4' : 'translate-x-0'}"
							></span>
						</button>
					</div>

					<div class="grid grid-cols-3 gap-3">
						<div class="flex items-center justify-between bg-zinc-800/80 p-2 rounded-lg">
							<span class="text-xs text-rose-300">Gamma R</span>
							<input type="number" step="0.1" bind:value={configStore.gammaR} min="0.5" max="3.0" class="w-12 bg-zinc-700 text-right px-1.5 py-0.5 text-xs text-zinc-100 rounded titlebar-no-drag" />
						</div>
						<div class="flex items-center justify-between bg-zinc-800/80 p-2 rounded-lg">
							<span class="text-xs text-emerald-300">Gamma G</span>
							<input type="number" step="0.1" bind:value={configStore.gammaG} min="0.5" max="3.0" class="w-12 bg-zinc-700 text-right px-1.5 py-0.5 text-xs text-zinc-100 rounded titlebar-no-drag" />
						</div>
						<div class="flex items-center justify-between bg-zinc-800/80 p-2 rounded-lg">
							<span class="text-xs text-sky-300">Gamma B</span>
							<input type="number" step="0.1" bind:value={configStore.gammaB} min="0.5" max="3.0" class="w-12 bg-zinc-700 text-right px-1.5 py-0.5 text-xs text-zinc-100 rounded titlebar-no-drag" />
						</div>
					</div>
				</div>
			</Tabs.Content>
		</Tabs.Root>
	</div>
</div>

<DeviceSettingsModal bind:open={showDeviceSettingsModal} {sendRpcFrame} />
