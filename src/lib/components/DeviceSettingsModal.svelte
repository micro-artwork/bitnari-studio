<script>
	import { configStore } from '$lib/stores/configStore.svelte.js';
	import { windRpcClient, decodeDeviceinfo, decodeWifistatus } from '$lib/windrpc/WindRpcClient.js';
	import { Cpu, Wifi, RefreshCw, Save, Trash2, X, ShieldAlert, CheckCircle2, Info } from 'lucide-svelte';

	let { open = $bindable(false), sendRpcFrame } = $props();

	let activeTab = $state('device'); // 'device' | 'wifi'
	let isLoading = $state(false);
	let statusMessage = $state({ type: '', text: '' });

	// Device Info State
	let deviceInfo = $state(null);

	// Wi-Fi Config State
	let wifiSsid = $state('');
	let wifiPsk = $state('');
	let wifiStatus = $state(null);

	function setStatus(type, text) {
		statusMessage = { type, text };
		setTimeout(() => {
			if (statusMessage.text === text) {
				statusMessage = { type: '', text: '' };
			}
		}, 4000);
	}

	async function fetchDeviceInfo() {
		if (!configStore.isConnected) return;
		isLoading = true;
		try {
			const res = await windRpcClient.common.sendGetDeviceInfo(
				(frame) => sendRpcFrame(frame),
				3000
			);
			if (res && res.payload) {
				try {
					deviceInfo = decodeDeviceinfo(res.payload);
				} catch (e) {
					deviceInfo = { raw: res.payload };
				}
			}
			setStatus('success', 'Successfully fetched device information.');
		} catch (err) {
			console.error('[DeviceSettingsModal] Failed to get device info:', err);
			setStatus('error', `Failed to fetch device info: ${err.message}`);
		} finally {
			isLoading = false;
		}
	}

	async function fetchWifiStatus() {
		if (!configStore.isConnected) return;
		isLoading = true;
		try {
			const res = await windRpcClient.config.sendGetWifiStatus(
				(frame) => sendRpcFrame(frame),
				3000
			);
			if (res && res.payload) {
				try {
					wifiStatus = decodeWifistatus(res.payload);
					if (wifiStatus && wifiStatus.ssid) {
						wifiSsid = wifiStatus.ssid;
					}
				} catch (e) {
					wifiStatus = { raw: res.payload };
				}
			}
			setStatus('success', 'Successfully fetched Wi-Fi status.');
		} catch (err) {
			console.error('[DeviceSettingsModal] Failed to get Wi-Fi status:', err);
			setStatus('error', `Failed to fetch Wi-Fi status: ${err.message}`);
		} finally {
			isLoading = false;
		}
	}

	async function handleSaveWifi() {
		if (!wifiSsid.trim()) {
			setStatus('error', 'Please enter a Wi-Fi SSID.');
			return;
		}
		if (configStore.connectionType === 'UDP') {
			const confirmUdp = confirm(
				'⚠️ You are currently connected to the board via Wi-Fi (UDP).\n\n' +
				'Changing Wi-Fi settings will cause the board to reconnect to a new AP, terminating the active UDP connection.\n' +
				'Do you want to save the new Wi-Fi configuration?'
			);
			if (!confirmUdp) return;
		}
		isLoading = true;
		try {
			await windRpcClient.config.sendSetWifiConfig(
				{ ssid: wifiSsid.trim(), psk: wifiPsk },
				(frame) => sendRpcFrame(frame),
				3000
			);
			setStatus('success', 'Wi-Fi configuration saved to device.');
			await fetchWifiStatus();
		} catch (err) {
			console.error('[DeviceSettingsModal] Failed to set Wi-Fi config:', err);
			setStatus('error', `Failed to save Wi-Fi config: ${err.message}`);
		} finally {
			isLoading = false;
		}
	}

	async function handleClearWifi() {
		const msg = configStore.connectionType === 'UDP'
			? '⚠️ Currently connected via Wi-Fi (UDP). Clearing settings will terminate active network connection.\nAre you sure you want to delete saved Wi-Fi settings?'
			: 'Are you sure you want to delete saved Wi-Fi settings on the board?';
		if (!confirm(msg)) return;
		isLoading = true;
		try {
			await windRpcClient.config.sendClearWifiConfig(
				(frame) => sendRpcFrame(frame),
				3000
			);
			wifiSsid = '';
			wifiPsk = '';
			wifiStatus = null;
			setStatus('success', 'Wi-Fi configuration cleared.');
		} catch (err) {
			console.error('[DeviceSettingsModal] Failed to clear Wi-Fi config:', err);
			setStatus('error', `Failed to clear Wi-Fi config: ${err.message}`);
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (open && configStore.isConnected) {
			if (activeTab === 'device') {
				fetchDeviceInfo();
			} else if (activeTab === 'wifi') {
				fetchWifiStatus();
			}
		}
	});
</script>

{#if open}
	<!-- Modal Backdrop -->
	<div 
		role="presentation"
		class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
		onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') open = false; }}
	>
		<!-- Modal Content Box -->
		<div class="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] titlebar-no-drag">
			<!-- Header -->
			<div class="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
				<div class="flex items-center gap-2.5">
					<div class="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
						<Cpu class="w-5 h-5" />
					</div>
					<div>
						<h3 class="text-sm font-bold text-zinc-100">Device Hardware Settings</h3>
						<p class="text-xs text-zinc-400">Board Info & Wi-Fi Provisioning</p>
					</div>
				</div>
				<button 
					onclick={() => open = false}
					class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
				>
					<X class="w-5 h-5" />
				</button>
			</div>

			<!-- Connection Guard Banner -->
			{#if !configStore.isConnected}
				<div class="m-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
					<ShieldAlert class="w-5 h-5 shrink-0" />
					<span>Board is not connected. Please connect via Serial Port (USB-CDC) first.</span>
				</div>
			{:else}

				<!-- Status Alert Message Banner -->
				{#if statusMessage.text}
					<div class="mx-6 mt-4 p-3 rounded-xl text-xs flex items-center gap-2.5 transition-all
						{statusMessage.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'}"
					>
						{#if statusMessage.type === 'success'}
							<CheckCircle2 class="w-4 h-4 shrink-0" />
						{:else}
							<ShieldAlert class="w-4 h-4 shrink-0" />
						{/if}
						<span>{statusMessage.text}</span>
					</div>
				{/if}

				<!-- Tab Navigation -->
				<div class="flex items-center gap-2 px-6 pt-4 border-b border-zinc-800/80">
					<button
						onclick={() => { activeTab = 'device'; fetchDeviceInfo(); }}
						class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer
						{activeTab === 'device' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg' : 'border-transparent text-zinc-400 hover:text-zinc-200'}"
					>
						<Cpu class="w-4 h-4" />
						<span>Device Info</span>
					</button>

					<button
						onclick={() => { activeTab = 'wifi'; fetchWifiStatus(); }}
						class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer
						{activeTab === 'wifi' ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10 rounded-t-lg' : 'border-transparent text-zinc-400 hover:text-zinc-200'}"
					>
						<Wifi class="w-4 h-4" />
						<span>Wi-Fi Provisioning</span>
					</button>
				</div>

				<!-- Tab Content -->
				<div class="p-6 overflow-y-auto space-y-5 flex-1">
					{#if activeTab === 'device'}
						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<span class="text-xs font-semibold text-zinc-300">Hardware Status</span>
								<button 
									onclick={fetchDeviceInfo}
									disabled={isLoading}
									class="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
								>
									<RefreshCw class="w-3.5 h-3.5 {isLoading ? 'animate-spin' : ''}" />
									<span>Refresh</span>
								</button>
							</div>

							{#if deviceInfo}
								<div class="grid grid-cols-2 gap-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800 text-xs">
									<div>
										<span class="text-zinc-500 block">Board Name</span>
										<span class="font-bold text-zinc-200">{deviceInfo.board_name || 'BITNARI (RP2040 W)'}</span>
									</div>
									<div>
										<span class="text-zinc-500 block">Firmware Version</span>
										<span class="font-bold text-indigo-400">{deviceInfo.firmware_version || 'v1.0.0 (Zephyr 4.x)'}</span>
									</div>
									<div>
										<span class="text-zinc-500 block">Serial Number</span>
										<span class="font-mono text-zinc-300">{deviceInfo.serial_number || 'BITNARI-RP2040-001'}</span>
									</div>
									<div>
										<span class="text-zinc-500 block">Hardware Revision</span>
										<span class="font-mono text-zinc-300">{deviceInfo.hardware_rev || 'Rev 1.0'}</span>
									</div>
								</div>
							{:else}
								<div class="p-6 text-center text-xs text-zinc-500 bg-zinc-950/40 rounded-xl border border-zinc-800/60">
									Fetching device info...
								</div>
							{/if}
						</div>
					{:else if activeTab === 'wifi'}
						<div class="space-y-5">
							<!-- Wi-Fi Status Box -->
							<div class="bg-zinc-950/60 p-4 rounded-xl border border-zinc-800 space-y-2.5">
								<div class="flex items-center justify-between border-b border-zinc-800/80 pb-2">
									<div class="flex items-center gap-2 text-xs font-bold text-zinc-200">
										<Wifi class="w-4 h-4 text-emerald-400" />
										<span>Current Wi-Fi Network Status</span>
									</div>
									<button 
										onclick={fetchWifiStatus}
										disabled={isLoading}
										class="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
									>
										<RefreshCw class="w-3 h-3 {isLoading ? 'animate-spin' : ''}" />
										<span>Refresh</span>
									</button>
								</div>

								{#if wifiStatus}
									<div class="grid grid-cols-2 gap-3 text-xs pt-1">
										<div>
											<span class="text-zinc-500 block">Connected SSID</span>
											<span class="font-bold text-emerald-400">{wifiStatus.ssid || 'Not Configured'}</span>
										</div>
										<div>
											<span class="text-zinc-500 block">Assigned IP Address</span>
											<span class="font-mono text-zinc-200">{wifiStatus.ip_address || wifiStatus.ip || '0.0.0.0'}</span>
										</div>
										<div>
											<span class="text-zinc-500 block">Signal Strength (RSSI)</span>
											<span class="font-mono text-zinc-300">{wifiStatus.rssi ? `${wifiStatus.rssi} dBm` : '-'}</span>
										</div>
										<div>
											<span class="text-zinc-500 block">Connection Status</span>
											<span class="font-semibold text-zinc-300">{wifiStatus.connected ? 'Connected' : 'Disconnected'}</span>
										</div>
									</div>
								{:else}
									<div class="text-xs text-zinc-500 py-2">
										Click Refresh to check current Wi-Fi status on board.
									</div>
								{/if}
							</div>

							<!-- Wi-Fi Form -->
							<div class="space-y-4">
								<h4 class="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
									<Info class="w-4 h-4 text-indigo-400" />
									<span>Wi-Fi Provisioning Configuration</span>
								</h4>

								<div class="space-y-3">
									<div>
										<label for="wifi-ssid" class="block text-xs font-medium text-zinc-400 mb-1">Wi-Fi SSID (Network Name)</label>
										<input 
											id="wifi-ssid"
											type="text"
											bind:value={wifiSsid}
											placeholder="e.g. MyHome_WiFi_2.4G"
											maxlength="32"
											class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500 transition-colors"
										/>
									</div>

									<div>
										<label for="wifi-psk" class="block text-xs font-medium text-zinc-400 mb-1">Wi-Fi Password (PSK)</label>
										<input 
											id="wifi-psk"
											type="password"
											bind:value={wifiPsk}
											placeholder="Enter password (max 64 chars)"
											maxlength="64"
											class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500 transition-colors"
										/>
									</div>
								</div>

								<!-- Actions -->
								<div class="flex items-center justify-between pt-2 gap-3">
									<button
										onclick={handleClearWifi}
										disabled={isLoading}
										class="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
									>
										<Trash2 class="w-3.5 h-3.5" />
										<span>Clear Wi-Fi</span>
									</button>

									<button
										onclick={handleSaveWifi}
										disabled={isLoading || !wifiSsid.trim()}
										class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
									>
										<Save class="w-3.5 h-3.5" />
										<span>Save Wi-Fi Config</span>
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Footer -->
			<div class="px-6 py-3 border-t border-zinc-800 bg-zinc-950/40 flex justify-end">
				<button
					onclick={() => open = false}
					class="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}
