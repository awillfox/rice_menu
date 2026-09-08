<script lang="ts">
	import { onMount } from 'svelte';
	import { CANVAS_H, CANVAS_W, SLIP_MM_HEIGHT, SLIP_MM_WIDTH } from '$lib/bill/constants';
	import { ensureFontsReady } from '$lib/bill/fonts';
	import { renderBill } from '$lib/bill/render';
	import { billFilename, canvasToJpegBlob, downloadBlob } from '$lib/bill/export';
	import {
		clearHistory,
		deleteBill,
		loadHistory,
		loadShopName,
		saveBill,
		saveShopName
	} from '$lib/bill/history';
	import { SERVE_MODE_LABEL, type Bill, type OrderItem, type ServeMode } from '$lib/bill/types';

	let seq = 0;
	function newItem(name = '', qty = 1): OrderItem {
		seq += 1;
		return { id: `it-${seq}-${Date.now().toString(36)}`, name, qty };
	}

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let mounted = $state(false);
	let fontsReady = $state(false);

	let shopName = $state('');
	let customerName = $state('');
	let mode = $state<ServeMode>('dine-in');
	let items = $state<OrderItem[]>([newItem()]);
	let createdAt = $state(Date.now());

	let clipped = $state(0);
	let history = $state<Bill[]>([]);
	let busy = $state(false);
	let status = $state('');
	let statusTimer: ReturnType<typeof setTimeout> | undefined;

	const filledItems = $derived(
		items.filter((i) => i.name.trim() !== '').map((i) => ({ ...i, name: i.name.trim() }))
	);

	const bill = $derived<Bill>({
		id: 'draft',
		shopName: shopName.trim(),
		customerName: customerName.trim(),
		mode,
		items: filledItems,
		createdAt
	});

	const canExport = $derived(filledItems.length > 0 && fontsReady && !busy);

	onMount(() => {
		history = loadHistory();
		shopName = loadShopName();
		mounted = true;

		ensureFontsReady().then(() => {
			fontsReady = true;
		});

		// The slip prints the time it was issued, so keep the clock honest while
		// the tab sits open at the counter.
		const tick = setInterval(() => {
			createdAt = Date.now();
		}, 30_000);

		return () => {
			clearInterval(tick);
			clearTimeout(statusTimer);
		};
	});

	$effect(() => {
		if (!canvasEl || !fontsReady) return;
		clipped = renderBill(canvasEl, bill).clipped;
	});

	$effect(() => {
		const name = shopName;
		if (mounted) saveShopName(name);
	});

	function flash(message: string) {
		status = message;
		clearTimeout(statusTimer);
		statusTimer = setTimeout(() => (status = ''), 3500);
	}

	function addItem() {
		items.push(newItem());
		queueMicrotask(() => {
			const rows = document.querySelectorAll<HTMLInputElement>('[data-item-input]');
			rows[rows.length - 1]?.focus();
		});
	}

	function removeItem(id: string) {
		items = items.filter((i) => i.id !== id);
		if (items.length === 0) items = [newItem()];
	}

	function setQty(item: OrderItem, next: number) {
		item.qty = Math.max(1, Math.min(99, next));
	}

	function onItemKeydown(event: KeyboardEvent, index: number) {
		if (event.key === 'Enter' && index === items.length - 1) {
			event.preventDefault();
			addItem();
		}
	}

	function startNewBill() {
		customerName = '';
		mode = 'dine-in';
		items = [newItem()];
		createdAt = Date.now();
		flash('เริ่มใบใหม่แล้ว');
	}

	function restore(saved: Bill) {
		shopName = saved.shopName;
		customerName = saved.customerName;
		mode = saved.mode;
		items = saved.items.length > 0 ? saved.items.map((i) => ({ ...i })) : [newItem()];
		createdAt = saved.createdAt;
		flash(`เปิดใบของ ${saved.customerName || 'ไม่ระบุชื่อ'} แล้ว`);
	}

	async function exportJpeg() {
		if (!canvasEl || !canExport) return;
		busy = true;
		try {
			await ensureFontsReady();
			const now = Date.now();
			createdAt = now;
			const issued: Bill = { ...bill, createdAt: now };
			clipped = renderBill(canvasEl, issued).clipped;

			const blob = await canvasToJpegBlob(canvasEl);
			downloadBlob(blob, billFilename(issued));

			history = saveBill({ ...issued, id: `bill-${now.toString(36)}-${seq}` });
			flash(`บันทึกแล้ว · ${CANVAS_W}×${CANVAS_H} px · ${Math.round(blob.size / 1024)} KB`);
		} catch (error) {
			flash(`บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'}`);
		} finally {
			busy = false;
		}
	}

	function historyLabel(b: Bill): string {
		const d = new Date(b.createdAt);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
	}
</script>

<svelte:head>
	<title>ใบสั่งอาหาร</title>
	<meta name="description" content="สร้างใบสั่งอาหารและบันทึกเป็นรูป JPG ขนาด 100 × 150 มม." />
</svelte:head>

<div class="min-h-screen">
	<header class="border-b border-line bg-white/70">
		<div class="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
			<h1 class="text-lg font-bold tracking-tight text-ink">ใบสั่งอาหาร</h1>
			<label class="ml-auto flex items-center gap-2">
				<span class="text-sm text-muted">ร้าน</span>
				<input
					bind:value={shopName}
					placeholder="ชื่อร้านของคุณ"
					maxlength="40"
					class="w-44 rounded-lg border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-muted/60 focus:border-chili focus:ring-1 focus:ring-chili sm:w-56"
				/>
			</label>
		</div>
	</header>

	<main class="mx-auto grid max-w-6xl gap-8 px-5 py-6 lg:grid-cols-[1fr_360px] lg:py-10">
		<!-- Form. min-w-0: grid items default to min-width:auto, which would let
		     the item rows' min-content width push the column past the viewport. -->
		<section class="order-2 min-w-0 lg:order-1">
			<label class="block">
				<span class="text-sm font-medium text-muted">ชื่อลูกค้า</span>
				<input
					bind:value={customerName}
					placeholder="เช่น คุณสมชาย"
					maxlength="60"
					class="mt-1.5 w-full rounded-lg border-line bg-white px-4 py-3 text-xl font-bold text-ink placeholder:font-normal placeholder:text-muted/60 focus:border-chili focus:ring-1 focus:ring-chili"
				/>
			</label>

			<fieldset class="mt-6">
				<legend class="text-sm font-medium text-muted">รับประทานที่ไหน</legend>
				<div class="mt-1.5 grid grid-cols-2 gap-3">
					{#each ['dine-in', 'takeaway'] as const as option (option)}
						<button
							type="button"
							aria-pressed={mode === option}
							onclick={() => (mode = option)}
							class="flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors
								{mode === option
								? 'border-chili bg-chili-soft text-ink'
								: 'border-line bg-white text-muted hover:border-muted/40'}"
						>
							<svg
								viewBox="0 0 24 24"
								class="h-6 w-6 shrink-0"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								aria-hidden="true"
							>
								{#if option === 'dine-in'}
									<circle cx="12" cy="12" r="8.5" />
									<circle cx="12" cy="12" r="4.5" />
								{:else}
									<path d="M5 8h14l-1.2 12H6.2L5 8Z" stroke-linejoin="round" />
									<path d="M9 8V6a3 3 0 0 1 6 0v2" stroke-linecap="round" />
								{/if}
							</svg>
							<span class="text-base font-bold">{SERVE_MODE_LABEL[option]}</span>
						</button>
					{/each}
				</div>
			</fieldset>

			<div class="mt-6">
				<div class="flex items-baseline justify-between">
					<h2 class="text-sm font-medium text-muted">รายการอาหาร</h2>
					<span class="text-sm text-muted">{filledItems.length} รายการ</span>
				</div>

				<ul class="mt-1.5 space-y-2">
					{#each items as item, index (item.id)}
						<li class="flex items-center gap-2 rounded-lg border border-line bg-white p-2">
							<input
								data-item-input
								bind:value={item.name}
								onkeydown={(e) => onItemKeydown(e, index)}
								placeholder="เช่น ข้าวมันไก่"
								maxlength="80"
								aria-label="ชื่อรายการที่ {index + 1}"
								class="min-w-0 flex-1 rounded-md border-0 bg-transparent px-2 py-2 text-base text-ink placeholder:text-muted/60 focus:ring-0"
							/>
							<div class="flex shrink-0 items-center rounded-md bg-field">
								<button
									type="button"
									aria-label="ลดจำนวน {item.name || `รายการที่ ${index + 1}`}"
									onclick={() => setQty(item, item.qty - 1)}
									class="h-9 w-9 rounded-l-md text-lg font-bold text-muted hover:bg-line/60 disabled:opacity-30"
									disabled={item.qty <= 1}>−</button
								>
								<span class="w-8 text-center text-base font-bold text-ink tabular-nums"
									>{item.qty}</span
								>
								<button
									type="button"
									aria-label="เพิ่มจำนวน {item.name || `รายการที่ ${index + 1}`}"
									onclick={() => setQty(item, item.qty + 1)}
									class="h-9 w-9 rounded-r-md text-lg font-bold text-muted hover:bg-line/60"
									>+</button
								>
							</div>
							<button
								type="button"
								aria-label="ลบรายการที่ {index + 1}"
								onclick={() => removeItem(item.id)}
								class="h-9 w-9 shrink-0 rounded-md text-muted hover:bg-chili-soft hover:text-chili"
								>✕</button
							>
						</li>
					{/each}
				</ul>

				<button
					type="button"
					onclick={addItem}
					class="mt-2 w-full rounded-lg border border-dashed border-line py-3 text-base font-medium text-muted hover:border-chili hover:text-chili"
					>+ เพิ่มรายการ</button
				>
			</div>

			{#if clipped > 0}
				<p
					role="alert"
					class="mt-4 rounded-lg border border-chili bg-chili-soft px-4 py-3 text-sm text-ink"
				>
					รายการยาวเกินกระดาษ — {clipped} รายการสุดท้ายจะไม่อยู่ในรูป ลบบางรายการออก หรือแยกเป็นสองใบ
				</p>
			{/if}

			{#if history.length > 0}
				<section class="mt-10 border-t border-line pt-5">
					<div class="flex items-baseline justify-between">
						<h2 class="text-sm font-medium text-muted">ใบที่บันทึกไว้</h2>
						<button
							type="button"
							onclick={() => (history = clearHistory())}
							class="text-sm text-muted underline underline-offset-2 hover:text-chili"
							>ลบทั้งหมด</button
						>
					</div>
					<ul class="mt-2 space-y-1.5">
						{#each history as saved (saved.id)}
							<li class="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
								<button
									type="button"
									onclick={() => restore(saved)}
									class="flex min-w-0 flex-1 items-baseline gap-3 text-left"
								>
									<span class="truncate text-base font-bold text-ink"
										>{saved.customerName || 'ไม่ระบุชื่อ'}</span
									>
									<span class="shrink-0 text-sm text-muted">{SERVE_MODE_LABEL[saved.mode]}</span>
									<span class="ml-auto shrink-0 text-sm text-muted tabular-nums"
										>{historyLabel(saved)}</span
									>
								</button>
								<button
									type="button"
									aria-label="ลบใบของ {saved.customerName || 'ไม่ระบุชื่อ'}"
									onclick={() => (history = deleteBill(saved.id))}
									class="h-8 w-8 shrink-0 rounded-md text-muted hover:bg-chili-soft hover:text-chili"
									>✕</button
								>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</section>

		<!-- Slip preview: the paper is the only thing on the page that casts a shadow -->
		<aside class="order-1 min-w-0 lg:order-2">
			<div class="lg:sticky lg:top-6">
				<div class="mx-auto max-w-[260px] lg:max-w-none">
					<canvas
						bind:this={canvasEl}
						width={CANVAS_W}
						height={CANVAS_H}
						class="block w-full bg-white shadow-[0_2px_24px_rgba(20,38,29,0.16)]"
						aria-label="ตัวอย่างใบสั่งอาหาร"
					></canvas>
				</div>

				<p class="mt-3 text-center text-sm text-muted">
					{SLIP_MM_WIDTH} × {SLIP_MM_HEIGHT} มม. · {CANVAS_W} × {CANVAS_H} px
				</p>

				<button
					type="button"
					onclick={exportJpeg}
					disabled={!canExport}
					class="mt-4 w-full rounded-lg bg-chili px-4 py-4 text-lg font-bold text-white transition-colors hover:bg-chili/90 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
				>
					{busy ? 'กำลังบันทึก…' : 'บันทึกเป็น JPG'}
				</button>

				<button
					type="button"
					onclick={startNewBill}
					class="mt-2 w-full rounded-lg py-2.5 text-base text-muted hover:text-chili"
					>เริ่มใบใหม่</button
				>

				<p class="mt-2 min-h-[1.5rem] text-center text-sm text-muted" aria-live="polite">
					{#if status}
						{status}
					{:else if !fontsReady}
						กำลังโหลดฟอนต์…
					{:else if filledItems.length === 0}
						ใส่รายการอย่างน้อย 1 รายการ
					{/if}
				</p>
			</div>
		</aside>
	</main>
</div>
