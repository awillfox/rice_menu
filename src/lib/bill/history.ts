import type { Addition, Bill, OrderItem } from './types';

const HISTORY_KEY = 'rice-menu.history.v1';
const SHOP_KEY = 'rice-menu.shop.v1';
const CAP = 50;

/** localStorage throws in private mode and when storage is full or blocked. */
function readRaw(key: string): string | null {
	try {
		if (typeof localStorage === 'undefined') return null;
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeRaw(key: string, value: string): void {
	try {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(key, value);
	} catch {
		/* history is a convenience, never block the export on it */
	}
}

/**
 * Bills saved before additions existed have no `additions` field, and anything
 * in localStorage may have been hand-edited. Normalise rather than trust, and
 * drop only what cannot be repaired.
 */
function normalizeAdditions(value: unknown, itemId: string): Addition[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry, i) => {
		if (typeof entry === 'object' && entry !== null) {
			const a = entry as Record<string, unknown>;
			if (typeof a.text === 'string' && a.text !== '') {
				return [{ id: typeof a.id === 'string' ? a.id : `${itemId}-a${i}`, text: a.text }];
			}
		}
		return [];
	});
}

function normalizeItem(value: unknown, index: number): OrderItem | null {
	if (typeof value !== 'object' || value === null) return null;
	const o = value as Record<string, unknown>;
	if (typeof o.name !== 'string') return null;
	const id = typeof o.id === 'string' ? o.id : `restored-${index}`;
	const qty =
		typeof o.qty === 'number' && Number.isFinite(o.qty) ? Math.max(1, Math.round(o.qty)) : 1;
	return { id, name: o.name, qty, additions: normalizeAdditions(o.additions, id) };
}

function normalizeBill(value: unknown): Bill | null {
	if (typeof value !== 'object' || value === null) return null;
	const b = value as Record<string, unknown>;
	if (
		typeof b.id !== 'string' ||
		typeof b.shopName !== 'string' ||
		typeof b.customerName !== 'string' ||
		(b.mode !== 'dine-in' && b.mode !== 'takeaway') ||
		typeof b.createdAt !== 'number' ||
		!Array.isArray(b.items)
	) {
		return null;
	}
	return {
		id: b.id,
		shopName: b.shopName,
		customerName: b.customerName,
		mode: b.mode,
		createdAt: b.createdAt,
		items: b.items.map(normalizeItem).filter((i): i is OrderItem => i !== null)
	};
}

export function loadHistory(): Bill[] {
	const raw = readRaw(HISTORY_KEY);
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.map(normalizeBill).filter((b): b is Bill => b !== null);
	} catch {
		return [];
	}
}

function persist(bills: Bill[]): Bill[] {
	writeRaw(HISTORY_KEY, JSON.stringify(bills));
	return bills;
}

/** Newest first, capped at CAP entries. */
export function saveBill(bill: Bill): Bill[] {
	const next = [bill, ...loadHistory().filter((b) => b.id !== bill.id)].slice(0, CAP);
	return persist(next);
}

export function deleteBill(id: string): Bill[] {
	return persist(loadHistory().filter((b) => b.id !== id));
}

export function clearHistory(): Bill[] {
	return persist([]);
}

export function loadShopName(): string {
	return readRaw(SHOP_KEY) ?? '';
}

export function saveShopName(name: string): void {
	writeRaw(SHOP_KEY, name);
}
