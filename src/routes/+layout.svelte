<script>
	import '../app.css';
	let { children } = $props();
</script>

<div class="h-screen w-screen flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">
	<!-- Custom Titlebar Drag Area -->
	<header class="h-9 w-full bg-zinc-900/60 border-b border-zinc-800/50 flex items-center px-4 titlebar-drag shrink-0">
		<div class="flex items-center gap-2">
			<div class="w-3 h-3 rounded-full bg-indigo-500/80 animate-pulse"></div>
			<span class="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Bitnari Ambient Desktop</span>
		</div>
	</header>

	<main class="flex-1 overflow-hidden relative">
		{@render children()}
	</main>
</div>
