import type { ShopState } from '@/lib/economy/apply';
import { buyPrice, sellPrice } from '@/lib/economy/prices';
import { catalogEntry } from '@/lib/inventory/catalog';
import { giveItem, itemLabel } from '@/lib/inventory/rules';
import type { InventoryItem } from '@/lib/inventory/types';

export interface ShopProps {
  shop: ShopState;
  items: InventoryItem[];
  gold: number;
  onBuy: (itemId: string) => void;
  onSell: (itemId: string, customName: string) => void;
  error?: string | null;
}

export function Shop({ shop, items, gold, onBuy, onSell, error }: ShopProps) {
  const sellable = items.filter((i) => sellPrice(i.itemId) !== null);
  return (
    <section className="card" aria-label="ร้านค้า">
      <h3>ร้านค้า</h3>
      <p className="shop-name">{shop.name}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="inv-list">
        {shop.itemIds.map((id) => {
          const price = buyPrice(id);
          const name = catalogEntry(id)?.nameTh ?? id;
          if (price === null) return null;
          const cannotCarry = giveItem(items, id).result === 'full';
          return (
            <li key={id} className="inv-row">
              <span className="inv-name">{name} · {price} ทอง</span>
              <button
                type="button"
                className="qa"
                aria-label={`ซื้อ ${name}`}
                disabled={gold < price || cannotCarry}
                title={gold < price ? 'เงินไม่พอ' : cannotCarry ? 'กระเป๋าเต็ม' : undefined}
                onClick={() => onBuy(id)}
              >
                ซื้อ
              </button>
            </li>
          );
        })}
      </ul>
      {sellable.length > 0 && (
        <>
          <h4 className="shop-sub">ขายของคุณ</h4>
          <ul className="inv-list">
            {sellable.map((item) => {
              const label = itemLabel(item);
              return (
                <li key={`${item.itemId}|${item.customName}`} className="inv-row">
                  <span className="inv-name">{label} · {sellPrice(item.itemId)} ทอง</span>
                  <button type="button" className="qa" aria-label={`ขาย ${label}`} onClick={() => onSell(item.itemId, item.customName)}>
                    ขาย
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
