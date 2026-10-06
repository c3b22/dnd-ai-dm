import { CLASSES, CLASS_IDS } from '@/lib/character/classes';
import { diceLabel, weaponFor } from '@/lib/character/constants';

export interface ClassPickerProps {
  value: string;
  onChange: (classId: string) => void;
}

export function ClassPicker({ value, onChange }: ClassPickerProps) {
  return (
    <fieldset className="wp-list">
      <legend className="lede">เลือกคลาส (ทุกคนเริ่มที่ 20 HP)</legend>
      {CLASS_IDS.map((id) => {
        const cls = CLASSES[id];
        const weapon = weaponFor(cls.weaponId);
        return (
          <button
            type="button"
            key={id}
            className="adv wp-item"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <span className="t">{cls.nameTh}</span>
            <span className="d">
              {weapon.nameTh} {diceLabel(weapon.dice)} · {cls.ability.nameTh}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
