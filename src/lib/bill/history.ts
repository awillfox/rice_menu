import type { Bill } from './types';

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

function isBill(value: unknown): value is Bill {
	if (typeof value !== 'object' || value === null) return false;
	const b = value as Record<string, unknown>;
	return (
		typeof b.id === 'string' &&
		typeof b.shopName === 'string' &&
		typeof b.customerName === 'string' &&
		(b.mode === 'dine-in' || b.mode === 'takeaway') &&
		typeof b.createdAt === 'number' &&
		Array.isArray(b.items)
	);
}

export function loadHistory(): Bill[] {
	const raw = readRaw(HISTORY_KEY);
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isBill);
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
