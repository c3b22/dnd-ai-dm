import { ItemTooltip } from './ItemTooltip';
import { useItemTip } from './useItemTip';
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
  const tip = useItemTip();
  const worn = items.filter((i) => i.equipped);
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
            <li key={id} className={`inv-row${tip.isOpen(`buy|${id}`) ? ' is-open' : ''}`} tabIndex={0} aria-describedby={tip.isOpen(`buy|${id}`) ? tip.tipId(`buy|${id}`) : undefined} {...tip.hostProps(`buy|${id}`)}>
              <span className="inv-name" onClick={() => tip.togglePin(`buy|${id}`)}>{name} · {price} ทอง</span>
              {tip.isOpen(`buy|${id}`) && (
                <ItemTooltip id={tip.tipId(`buy|${id}`)} item={{ itemId: id, customName: '', quantity: 1, slot: null, equipped: false }} worn={worn} />
              )}
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
              const sellKey = `sell|${item.itemId}|${item.customName}`;
              return (
                <li key={sellKey} className={`inv-row${tip.isOpen(sellKey) ? ' is-open' : ''}`} tabIndex={0} aria-describedby={tip.isOpen(sellKey) ? tip.tipId(sellKey) : undefined} {...tip.hostProps(sellKey)}>
                  <span className="inv-name" onClick={() => tip.togglePin(sellKey)}>{label} · {sellPrice(item.itemId)} ทอง</span>
                  {tip.isOpen(sellKey) && <ItemTooltip id={tip.tipId(sellKey)} item={item} worn={worn} />}
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
