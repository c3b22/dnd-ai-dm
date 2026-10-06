import { IDENTITY_FIELD_MAX } from '@/lib/character/identity';

export interface CharacterIdentityFieldsProps {
  value: Record<'backstory' | 'personality' | 'goal', string>;
  onChange: (next: Record<'backstory' | 'personality' | 'goal', string>) => void;
  idPrefix?: string;
}

const FIELDS: { key: 'backstory' | 'personality' | 'goal'; label: string; placeholder: string }[] = [
  { key: 'backstory', label: 'ประวัติ (ไม่บังคับ)', placeholder: 'ตัวละครมาจากไหน เคยผ่านอะไรมา' },
  { key: 'personality', label: 'บุคลิก (ไม่บังคับ)', placeholder: 'นิสัยหรือท่าทีของตัวละคร' },
  { key: 'goal', label: 'เป้าหมาย (ไม่บังคับ)', placeholder: 'สิ่งที่ตัวละครต้องการให้ได้' },
];

export function CharacterIdentityFields({ value, onChange, idPrefix = 'identity' }: CharacterIdentityFieldsProps) {
  return (
    <>
      {FIELDS.map(({ key, label, placeholder }) => (
        <div className="field" key={key}>
          <label htmlFor={`${idPrefix}-${key}`}>{label}</label>
          <textarea
            id={`${idPrefix}-${key}`}
            aria-label={key}
            placeholder={placeholder}
            rows={2}
            maxLength={IDENTITY_FIELD_MAX}
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </div>
      ))}
    </>
  );
}
