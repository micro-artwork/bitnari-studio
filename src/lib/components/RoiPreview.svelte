<script>
	import { configStore } from '../stores/configStore.svelte.js';
	import { Zap } from 'lucide-svelte';

	// Compute continuous LED perimeter ring matching Bitnari Studio geometry
	let ledLayout = $derived.by(() => {
		const T = (configStore.topAvailable ?? true) ? (configStore.topPixels || 0) : 0;
		const R = (configStore.rightAvailable ?? true) ? (configStore.rightPixels || 0) : 0;
		const B = (configStore.bottomAvailable ?? true) ? (configStore.bottomPixels || 0) : 0;
		const L = (configStore.leftAvailable ?? true) ? (configStore.leftPixels || 0) : 0;

		const startPoint = configStore.startPoint || 'BottomLeft';
		const isClockwise = configStore.rotationDirection === 'Clockwise';

		const Total = T + R + B + L;

		// Compute exact Start and End numbers for all 4 edges (Top, Right, Bottom, Left)
		let topStart = 1, topEnd = T;
		let rightStart = T + 1, rightEnd = T + R;
		let bottomStart = Total, bottomEnd = T + R + 1;
		let leftStart = Total, leftEnd = T + R + B + 1;

		if (startPoint === 'TopLeft') {
			if (isClockwise) {
				topStart = 1; topEnd = T;
				rightStart = T + 1; rightEnd = T + R;
				bottomStart = T + R + B; bottomEnd = T + R + 1;
				leftStart = Total; leftEnd = T + R + B + 1;
			} else {
				leftStart = 1; leftEnd = L;
				bottomStart = L + 1; bottomEnd = L + B;
				rightStart = L + B + R; rightEnd = L + B + 1;
				topStart = Total; topEnd = L + B + R + 1;
			}
		} else if (startPoint === 'TopRight') {
			if (isClockwise) {
				rightStart = 1; rightEnd = R;
				bottomStart = R + B; bottomEnd = R + 1;
				leftStart = Total; leftEnd = R + B + 1;
				topStart = R + B + L + 1; topEnd = Total;
			} else {
				topStart = T; topEnd = 1;
				leftStart = T + 1; leftEnd = T + L;
				bottomStart = T + L + 1; bottomEnd = T + L + B;
				rightStart = Total; rightEnd = T + L + B + 1;
			}
		} else if (startPoint === 'BottomRight') {
			if (isClockwise) {
				bottomStart = B; bottomEnd = 1;
				leftStart = B + L; leftEnd = B + 1;
				topStart = B + L + 1; topEnd = B + L + T;
				rightStart = B + L + T + 1; rightEnd = Total;
			} else {
				rightStart = R; rightEnd = 1;
				topStart = R + T; topEnd = R + 1;
				leftStart = R + T + 1; leftEnd = R + T + L;
				bottomStart = R + T + L + 1; bottomEnd = Total;
			}
		} else if (startPoint === 'BottomLeft') {
			if (isClockwise) {
				leftStart = L; leftEnd = 1;
				topStart = L + 1; topEnd = L + T;
				rightStart = L + T + 1; rightEnd = L + T + R;
				bottomStart = Total; bottomEnd = L + T + R + 1;
			} else {
				bottomStart = 1; bottomEnd = B;
				rightStart = B + R; rightEnd = B + 1;
				topStart = B + R + T; topEnd = B + R + 1;
				leftStart = Total; leftEnd = B + R + T + 1;
			}
		}

		return {
			topStart, topEnd,
			rightStart, rightEnd,
			bottomStart, bottomEnd,
			leftStart, leftEnd,
			total: Total,
			topCount: T, rightCount: R, bottomCount: B, leftCount: L,
			startPoint, isClockwise,
			topBlank: configStore.topBlank && (configStore.topAvailable ?? true),
			rightBlank: configStore.rightBlank && (configStore.rightAvailable ?? true),
			bottomBlank: configStore.bottomBlank && (configStore.bottomAvailable ?? true),
			leftBlank: configStore.leftBlank && (configStore.leftAvailable ?? true),
			topAvailable: configStore.topAvailable ?? true,
			rightAvailable: configStore.rightAvailable ?? true,
			bottomAvailable: configStore.bottomAvailable ?? true,
			leftAvailable: configStore.leftAvailable ?? true
		};
	});
</script>

<div class="glass-panel rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden titlebar-no-drag">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2 text-sm font-bold text-zinc-100">
			<Zap class="w-4 h-4 text-indigo-400" />
			<span>Interactive LED Geometry Preview</span>
		</div>
		<div class="text-xs px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold">
			Total: {ledLayout.total} LEDs
		</div>
	</div>

	<!-- Monitor Frame Perimeter (Corners empty, start/end boxes on each edge) -->
	<div class="w-full bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between relative shadow-2xl overflow-hidden select-none gap-2">
		
		<!-- TOP EDGE ROW: topStart box ... topEnd box (Dimmed on Blank, hidden if disabled) -->
		<div class="w-full flex items-center justify-between gap-3 px-12 transition-all duration-300 {ledLayout.topBlank ? 'opacity-35 grayscale' : ''} {!ledLayout.topAvailable ? 'invisible' : ''}">
			<div 
				class="w-7 h-7 rounded-md border flex items-center justify-center text-xs font-mono font-bold transition-all shrink-0
				{ledLayout.topStart === 1 
					? 'bg-amber-400 text-zinc-950 border-amber-300 font-extrabold shadow-sm' 
					: 'bg-zinc-900 border border-zinc-800 text-blue-300'}"
				title="Top Start LED #{ledLayout.topStart}"
			>
				{ledLayout.topStart}
			</div>

			<span class="text-zinc-600 font-bold font-mono text-xs tracking-widest px-2">...</span>

			<div 
				class="w-7 h-7 rounded-md border flex items-center justify-center text-xs font-mono font-bold transition-all shrink-0
				{ledLayout.topEnd === 1 
					? 'bg-amber-400 text-zinc-950 border-amber-300 font-extrabold shadow-sm' 
					: 'bg-zinc-900 border border-zinc-800 text-blue-300'}"
				title="Top End LED #{ledLayout.topEnd}"
			>
				{ledLayout.topEnd}
			</div>
		</div>

		<!-- MIDDLE SECTION: LEFT EDGE COLUMN | CENTER PLAIN TEXT DISPLAY | RIGHT EDGE COLUMN -->
		<div class="flex-1 flex items-stretch justify-between gap-3 my-1 min-h-[140px]">
			<!-- LEFT EDGE COLUMN: leftStart (Top of Left edge) ... leftEnd (Bottom of Left edge) -->
			<div class="w-10 flex flex-col justify-between items-center py-1 shrink-0 transition-all duration-300 {ledLayout.leftBlank ? 'opacity-35 grayscale' : ''} {!ledLayout.leftAvailable ? 'invisible' : ''}">
				<div 
					class="w-7 h-7 rounded-md border flex items-center justify-center text-xs font-mono font-bold transition-all shrink-0
					{ledLayout.leftStart === 1 
						? 'bg-amber-400 text-zinc-950 border-amber-300 font-extrabold shadow-sm' 
						: 'bg-zinc-900 border border-zinc-800 text-red-300'}"
					title="Left Top LED #{ledLayout.leftStart}"
				>
					{ledLayout.leftStart}
				</div>

				<span class="text-zinc-600 font-bold font-mono text-xs tracking-widest my-auto text-center">...</span>

				<div 
					class="w-7 h-7 rounded-md border flex items-center justify-center text-xs font-mono font-bold transition-all shrink-0
					{ledLayout.leftEnd === 1 
						? 'bg-amber-400 text-zinc-950 border-amber-300 font-extrabold shadow-sm' 
						: 'bg-zinc-900 border border-zinc-800 text-red-300'}"
					title="Left Bottom LED #{ledLayout.leftEnd}"
				>
					{ledLayout.leftEnd}
				</div>
			</div>

			<!-- CENTER DISPLAY AREA (Plain text info, no icons or badges) -->
			<div class="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-300 text-xs sm:text-sm font-medium px-2 select-text">
				<div>
					Start: <span class="font-bold text-zinc-100">{ledLayout.startPoint}</span> | 
					Direction: <span class="font-bold text-zinc-100">{ledLayout.isClockwise ? 'Clockwise' : 'Counter-Clockwise'}</span>
				</div>
				<div class="text-[11px] text-zinc-400 font-mono tracking-wide">
					Top ({ledLayout.topCount}) | Right ({ledLayout.rightCount}) | Bottom ({ledLayout.bottomCount}) | Left ({ledLayout.leftCount})
				</div>
			</div>

			<!-- RIGHT EDGE COLUMN: rightStart (Top of Right edge) ... rightEnd (Bottom of Right edge) -->
			<div class="w-10 flex flex-col justify-between items-center py-1 shrink-0 transition-all duration-300 {ledLayout.rightBlank ? 'opacity-35 grayscale' : ''} {!ledLayout.rightAvailable ? 'invisible' : ''}">
				<div 
					class="w-7 h-7 rounded-md border flex items-center justify-center text-xs font-mono font-bold transition-all shrink-0
					{ledLayout.rightStart === 1 
						? 'bg-amber-400 text-zinc-950 border-amber-300 font-extrabold shadow-sm' 
						: 'bg-zinc-900 border border-zinc-800 text-emerald-300'}"
					title="Right Top LED #{ledLayout.rightStart}"
				>
					{ledLayout.rightStart}
				</div>

				<span class="text-zinc-600 font-bold font-mono text-xs tracking-widest my-auto text-center">...</span>

				<div 
					class="w-7 h-7 rounded-md border flex items-center justify-center text-xs font-mono font-bold transition-all shrink-0
					{ledLayout.rightEnd === 1 
						? 'bg-amber-400 text-zinc-950 border-amber-300 font-extrabold shadow-sm' 
						: 'bg-zinc-900 border border-zinc-800 text-emerald-300'}"
					title="Right Bottom LED #{ledLayout.rightEnd}"
				>
					{ledLayout.rightEnd}
				</div>
			</div>
		</div>

		<!-- BOTTOM EDGE ROW: bottomStart box ... bottomEnd box (Dimmed on Blank, hidden if disabled) -->
		<div class="w-full flex items-center justify-between gap-3 px-12 transition-all duration-300 {ledLayout.bottomBlank ? 'opacity-35 grayscale' : ''} {!ledLayout.bottomAvailable ? 'invisible' : ''}">
			<div 
				class="w-7 h-7 rounded-md border flex items-center justify-center text-xs font-mono font-bold transition-all shrink-0
				{ledLayout.bottomStart === 1 
					? 'bg-amber-400 text-zinc-950 border-amber-300 font-extrabold shadow-sm' 
					: 'bg-zinc-900 border border-zinc-800 text-purple-300'}"
				title="Bottom Left LED #{ledLayout.bottomStart}"
			>
				{ledLayout.bottomStart}
			</div>

			<span class="text-zinc-600 font-bold font-mono text-xs tracking-widest px-2">...</span>

			<div 
				class="w-7 h-7 rounded-md border flex items-center justify-center text-xs font-mono font-bold transition-all shrink-0
				{ledLayout.bottomEnd === 1 
					? 'bg-amber-400 text-zinc-950 border-amber-300 font-extrabold shadow-sm' 
					: 'bg-zinc-900 border border-zinc-800 text-purple-300'}"
				title="Bottom Right LED #{ledLayout.bottomEnd}"
			>
				{ledLayout.bottomEnd}
			</div>
		</div>

	</div>
</div>
