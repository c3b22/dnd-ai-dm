import type { CharacterTag } from '@/lib/character/tags';
import type { ShopState } from './apply';

/** N2: stock of the shop the server opens when the DM narrates a purchase but forgets [[shop]]. Tune here only. */
export const DEFAULT_SHOP_ITEMS = [
  'potion_minor',
  'potion_major',
  'dagger',
  'shortsword',
  'shortbow',
  'staff',
  'armor_light',
  'armor_medium',
];
export const DEFAULT_SHOP_NAME = 'ร้านค้า';

const TRADE_INTENT = /ร้าน|ซื้อ|ขาย|พ่อค้า|ตลาด|สินค้า|shop|buy|merchant/i;
const DM_PURCHASE = /เลือกซื้อ|ซื้อ|สินค้า/;
const REFUSAL = /ปฏิเสธ|ไม่ยอมขาย|ไม่ขาย|ปิดประตู|ไล่ออก/;

/**
 * Returns the round's tags, plus a synthetic `shop` tag when every N2 condition holds, so the shop opens
 * through the exact path of a real tag. Never throws: on any error the tags are returned unchanged.
 */
export function withFallbackShop(params: {
  tags: CharacterTag[];
  currentShop: ShopState | null | undefined;
  currentEncounter: unknown;
  actionTexts: string[];
  dmText: string;
}): CharacterTag[] {
  const { tags } = params;
  try {
    if (tags.some((t) => t.kind === 'shop' || t.kind === 'shop_close')) return tags;
    if (params.currentShop) return tags;
    if (params.currentEncounter) return tags;
    const intent = params.actionTexts.some((a) => TRADE_INTENT.test(a)) || DM_PURCHASE.test(params.dmText);
    if (!intent) return tags;
    if (REFUSAL.test(params.dmText)) return tags;
    return [...tags, { kind: 'shop', merchant: DEFAULT_SHOP_NAME, itemIds: [...DEFAULT_SHOP_ITEMS] }];
  } catch (error) {
    console.warn('[shopFallback] skipped:', error);
    return tags;
  }
}
