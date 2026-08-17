<script>
	import { CheckCircle2, XCircle, Loader2, X } from 'lucide-svelte';
	import { configStore } from '$lib/stores/configStore.svelte.js';

	let { open = $bindable(false), discoveryProgress = {}, onRetry = () => {} } = $props();

	function handleUseIp() {
		if (discoveryProgress && discoveryProgress.found) {
			configStore.targetUdpIp = discoveryProgress.found.ip;
			configStore.targetUdpPort = discoveryProgress.found.port || 5000;
		}
		open = false;
	}
</script>

{#if open}
	<!-- Subnet Discovery Progress Modal Backdrop -->
	<div class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
		<div class="glass-panel bg-zinc-950/95 border border-zinc-700/80 rounded-2xl shadow-2xl p-6 max-w-md w-full flex flex-col gap-5 titlebar-no-drag animate-in fade-in zoom-in-95 duration-150">
			<!-- Header -->
			<div class="flex items-center justify-between pb-3 border-b border-zinc-800">
				<div class="flex items-center gap-2.5">
					<div class="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
						{#if !discoveryProgress.done}
							<Loader2 class="w-4 h-4 animate-spin text-indigo-400" />
						{:else if discoveryProgress.found}
							<CheckCircle2 class="w-4 h-4 text-emerald-400" />
						{:else}
							<XCircle class="w-4 h-4 text-amber-400" />
						{/if}
					</div>
					<div>
						<div class="text-sm font-bold text-zinc-100">Wi-Fi Server Discovery</div>
						<div class="text-xs text-zinc-400">Scanning local subnet for Bitnari UDP Server</div>
					</div>
				</div>
				<button 
					onclick={() => open = false}
					class="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
					aria-label="Close Discovery Modal"
				>
					<X class="w-4 h-4" />
				</button>
			</div>

			<!-- Progress Bar & Sweep Radar -->
			<div class="flex flex-col gap-2.5">
				<div class="flex items-center justify-between text-xs">
					<span class="text-zinc-300 font-medium">Subnet Sweep Progress</span>
					<span class="text-indigo-400 font-mono font-bold">{discoveryProgress.percent || 0}%</span>
				</div>
				<div class="w-full bg-zinc-800/90 rounded-full h-3 overflow-hidden p-0.5 border border-zinc-700/60">
					<div 
						class="h-full rounded-full transition-all duration-100 ease-out {discoveryProgress.found ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400'}"
						style="width: {discoveryProgress.percent || 0}%"
					></div>
				</div>
				<div class="flex items-center justify-between text-[11px] text-zinc-400">
					<span class="truncate max-w-[280px] font-mono">{discoveryProgress.status || 'Scanning...'}</span>
					{#if (discoveryProgress.total || 0) > 0}
						<span class="font-mono">{discoveryProgress.scanned || 0}/{discoveryProgress.total}</span>
					{/if}
				</div>
			</div>

			<!-- Found Board Card -->
			{#if discoveryProgress.found}
				<div class="p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center justify-between">
					<div class="flex items-center gap-3">
						<CheckCircle2 class="w-5 h-5 text-emerald-400 shrink-0" />
						<div>
							<div class="text-xs font-bold text-emerald-300">Bitnari Board Detected!</div>
							<div class="text-xs font-mono text-zinc-200 mt-0.5">{discoveryProgress.found.ip}:{discoveryProgress.found.port}</div>
						</div>
					</div>
					<button
						onclick={handleUseIp}
						class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow"
					>
						Use IP
					</button>
				</div>
			{:else if discoveryProgress.done && discoveryProgress.error}
				<div class="p-3.5 bg-amber-950/40 border border-amber-500/30 rounded-xl flex flex-col gap-1.5 text-xs text-zinc-300">
					<div class="flex items-center gap-2 text-amber-400 font-semibold">
						<XCircle class="w-4 h-4 shrink-0" />
						<span>No Server Found in Subnet</span>
					</div>
					<div class="text-[11px] text-zinc-400 leading-relaxed">
						Please make sure the board is powered on and connected to the same 2.4GHz Wi-Fi network as this PC.
					</div>
				</div>
			{/if}

			<!-- Footer Buttons -->
			<div class="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/80">
				{#if discoveryProgress.done && !discoveryProgress.found}
					<button
						onclick={onRetry}
						class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
					>
						Retry Scan
					</button>
				{/if}
				<button
					onclick={() => open = false}
					class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
				>
					{discoveryProgress.found ? 'Done' : 'Close'}
				</button>
			</div>
		</div>
	</div>
{/if}
