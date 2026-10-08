import { describeItem } from '@/lib/inventory/describe';
import { setStatusTh } from '@/lib/inventory/magicDescribe';
import type { InventoryItem } from '@/lib/inventory/types';

export interface ItemTooltipProps {
  id: string;
  item: InventoryItem;
  /** Everything currently worn, for the magic set progress line. */
  worn: InventoryItem[];
}

/** O1: full details of one item (role="tooltip"; the owner row points at it with aria-describedby={id}). */
export function ItemTooltip({ id, item, worn }: ItemTooltipProps) {
  const d = describeItem(item.itemId, item.customName);
  if (!d) return null;
  const { magic } = d;
  return (
    <div id={id} role="tooltip" className="item-tip">
      <strong className="item-tip-name">{d.nameTh}</strong>
      <span className="item-tip-kind">
        {d.kindTh}
        {magic && ` · ${magic.rarityTh}`}
        {item.quantity > 1 && ` · จำนวน ${item.quantity}`}
      </span>
      {d.stats.map((line) => (
        <span key={line}>{line}</span>
      ))}
      {magic?.specialTh && <span>{magic.specialTh}</span>}
      {magic?.theme && <span>ธีม{magic.theme}</span>}
      {magic?.theme && item.equipped && <span>{setStatusTh(magic.theme, worn)}</span>}
      {magic && <small>{magic.flavorTh}</small>}
      {d.weight !== null && <span>น้ำหนัก {d.weight}</span>}
      {d.slotTh && (
        <span>
          สวมได้ที่ช่อง{d.slotTh}
          {item.equipped && ' (สวมอยู่)'}
        </span>
      )}
      {d.buyPrice !== null && d.sellPrice !== null && (
        <span>
          ราคาซื้อ {d.buyPrice} · ขายคืน {d.sellPrice} ทอง
        </span>
      )}
    </div>
  );
}
