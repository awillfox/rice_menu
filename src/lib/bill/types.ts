/** Where the customer eats. Exactly one is true on any given slip. */
export type ServeMode = 'dine-in' | 'takeaway';

/** A free-text modifier printed under its item, e.g. "เพิ่มไข่ดาว". */
export interface Addition {
	id: string;
	text: string;
}

export interface OrderItem {
	id: string;
	name: string;
	qty: number;
	additions: Addition[];
}

export interface Bill {
	id: string;
	shopName: string;
	customerName: string;
	mode: ServeMode;
	items: OrderItem[];
	/**
	 * Epoch milliseconds. Stamped when the JPEG is exported. Not printed on the
	 * slip; it labels history entries and names the downloaded file.
	 */
	createdAt: number;
}

export const SERVE_MODE_LABEL: Record<ServeMode, string> = {
	'dine-in': 'ทานที่ร้าน',
	takeaway: 'กลับบ้าน'
};
