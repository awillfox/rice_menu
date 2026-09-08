import { CANVAS_H, CANVAS_W } from './constants';
import { formatThaiDateTime, wrapText } from './text';
import { SERVE_MODE_LABEL, type Bill, type OrderItem } from './types';

const FAMILY = `'Sarabun', sans-serif`;
const INK = '#111111';
const MUTED = '#5f5f5f';
const RULE = '#c4c4c4';
const PAPER = '#ffffff';

const PAD = 90;
const CONTENT_W = CANVAS_W - PAD * 2;
const BORDER_INSET = 34;

/** Item text shrinks through this ladder until the list fits the slip. */
const ITEM_SIZES = [46, 42, 38, 34, 30, 26] as const;
const ITEM_LINE_RATIO = 1.4;
const ITEM_GAP_RATIO = 0.45;
const QTY_GUTTER = 40;

export interface RenderResult {
	/** Items that did not fit even at the smallest size. Never silently dropped. */
	clipped: number;
	itemFontSize: number;
}

const font = (weight: number, size: number) => `${weight} ${size}px ${FAMILY}`;

function horizontalRule(ctx: CanvasRenderingContext2D, y: number): void {
	ctx.save();
	ctx.strokeStyle = RULE;
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(PAD, y);
	ctx.lineTo(CANVAS_W - PAD, y);
	ctx.stroke();
	ctx.restore();
}

function drawCheckbox(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	box: number,
	checked: boolean,
	label: string,
	labelSize: number
): void {
	ctx.save();
	ctx.strokeStyle = INK;
	ctx.lineWidth = 4;
	ctx.strokeRect(x + 2, y + 2, box, box);

	if (checked) {
		ctx.strokeStyle = INK;
		ctx.lineWidth = 7;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.beginPath();
		ctx.moveTo(x + box * 0.22, y + box * 0.52);
		ctx.lineTo(x + box * 0.44, y + box * 0.74);
		ctx.lineTo(x + box * 0.82, y + box * 0.24);
		ctx.stroke();
	}
	ctx.restore();

	ctx.fillStyle = INK;
	ctx.font = font(checked ? 700 : 400, labelSize);
	ctx.fillText(label, x + box + 24, y + (box - labelSize) / 2 + 2);
}

interface ItemLayout {
	qtyText: string;
	qtyW: number;
	lines: string[];
}

interface ListLayout {
	entries: ItemLayout[];
	height: number;
	lineH: number;
	gap: number;
}

/** Measure the whole list at one font size. Mutates ctx.font only. */
function layoutItems(
	ctx: CanvasRenderingContext2D,
	items: OrderItem[],
	width: number,
	size: number
): ListLayout {
	const lineH = size * ITEM_LINE_RATIO;
	const gap = size * ITEM_GAP_RATIO;

	const entries = items.map((item) => {
		const qtyText = `×${item.qty}`;
		ctx.font = font(700, size);
		const qtyW = ctx.measureText(qtyText).width;
		ctx.font = font(400, size);
		const lines = wrapText(ctx, item.name, width - qtyW - QTY_GUTTER);
		return { qtyText, qtyW, lines };
	});

	const textH = entries.reduce((h, e) => h + e.lines.length * lineH, 0);
	const gaps = gap * Math.max(0, entries.length - 1);
	return { entries, height: textH + gaps, lineH, gap };
}

function drawItems(
	ctx: CanvasRenderingContext2D,
	items: OrderItem[],
	x: number,
	yTop: number,
	width: number,
	availH: number
): RenderResult {
	const smallest = ITEM_SIZES[ITEM_SIZES.length - 1];
	if (items.length === 0) return { clipped: 0, itemFontSize: smallest };

	let size = smallest;
	let layout = layoutItems(ctx, items, width, smallest);
	for (const candidate of ITEM_SIZES) {
		const attempt = layoutItems(ctx, items, width, candidate);
		if (attempt.height <= availH) {
			size = candidate;
			layout = attempt;
			break;
		}
	}

	const { lineH, gap } = layout;
	const bottom = yTop + availH;
	let y = yTop;
	let drawn = 0;

	for (const entry of layout.entries) {
		const blockH = entry.lines.length * lineH;
		// Draw whole items only; a half-rendered order line is worse than none.
		if (y + blockH > bottom) break;

		ctx.fillStyle = INK;
		ctx.font = font(700, size);
		ctx.textAlign = 'right';
		ctx.fillText(entry.qtyText, x + width, y);
		ctx.textAlign = 'left';

		ctx.font = font(400, size);
		let lineY = y;
		for (const line of entry.lines) {
			ctx.fillText(line, x, lineY);
			lineY += lineH;
		}

		// Dot leader bridges the first line to the quantity column.
		const firstLineW = ctx.measureText(entry.lines[0] ?? '').width;
		const from = x + firstLineW + 18;
		const to = x + width - entry.qtyW - 18;
		if (to - from > 30) {
			ctx.save();
			ctx.strokeStyle = RULE;
			ctx.lineWidth = 3;
			ctx.lineCap = 'round';
			ctx.setLineDash([0, 14]);
			ctx.beginPath();
			ctx.moveTo(from, y + size * 0.8);
			ctx.lineTo(to, y + size * 0.8);
			ctx.stroke();
			ctx.restore();
		}

		y += blockH + gap;
		drawn += 1;
	}

	return { clipped: items.length - drawn, itemFontSize: size };
}

/**
 * Paint `bill` onto `canvas` at exactly CANVAS_W x CANVAS_H device pixels.
 * The on-screen preview is this same canvas scaled by CSS, so what is previewed
 * and what is exported are one bitmap and cannot drift apart.
 *
 * Caller must await ensureFontsReady() first.
 */
export function renderBill(canvas: HTMLCanvasElement, bill: Bill): RenderResult {
	canvas.width = CANVAS_W;
	canvas.height = CANVAS_H;

	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D canvas context unavailable');

	// JPEG carries no alpha channel: unpainted pixels would encode as black.
	ctx.fillStyle = PAPER;
	ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
	ctx.textBaseline = 'top';
	ctx.textAlign = 'left';

	ctx.save();
	ctx.strokeStyle = RULE;
	ctx.lineWidth = 3;
	ctx.strokeRect(
		BORDER_INSET,
		BORDER_INSET,
		CANVAS_W - BORDER_INSET * 2,
		CANVAS_H - BORDER_INSET * 2
	);
	ctx.restore();

	let y = 112;

	if (bill.shopName !== '') {
		ctx.fillStyle = INK;
		ctx.font = font(700, 62);
		ctx.textAlign = 'center';
		for (const line of wrapText(ctx, bill.shopName, CONTENT_W).slice(0, 2)) {
			ctx.fillText(line, CANVAS_W / 2, y);
			y += 62 * 1.24;
		}
		ctx.textAlign = 'left';
		y += 14;
	}

	ctx.fillStyle = MUTED;
	ctx.font = font(400, 32);
	ctx.textAlign = 'center';
	ctx.fillText(formatThaiDateTime(bill.createdAt), CANVAS_W / 2, y);
	ctx.textAlign = 'left';
	y += 32 * 1.4 + 22;

	horizontalRule(ctx, y);
	y += 34;

	ctx.fillStyle = MUTED;
	ctx.font = font(400, 34);
	ctx.fillText('ชื่อ', PAD, y);
	y += 34 * 1.35;

	ctx.fillStyle = INK;
	ctx.font = font(700, 58);
	for (const line of wrapText(ctx, bill.customerName || '-', CONTENT_W).slice(0, 2)) {
		ctx.fillText(line, PAD, y);
		y += 58 * 1.24;
	}
	y += 26;

	const box = 46;
	const labelSize = 42;
	drawCheckbox(ctx, PAD, y, box, bill.mode === 'dine-in', SERVE_MODE_LABEL['dine-in'], labelSize);
	drawCheckbox(
		ctx,
		PAD + 500,
		y,
		box,
		bill.mode === 'takeaway',
		SERVE_MODE_LABEL.takeaway,
		labelSize
	);
	y += Math.max(box, labelSize) + 40;

	horizontalRule(ctx, y);
	y += 30;

	ctx.fillStyle = MUTED;
	ctx.font = font(700, 36);
	ctx.fillText('รายการ', PAD, y);
	y += 36 * 1.5;

	return drawItems(ctx, bill.items, PAD, y, CONTENT_W, CANVAS_H - PAD - y);
}
