export type TableTab = 'story' | 'team' | 'bag' | 'chat';

const TABS: { id: TableTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'story',
    label: 'เรื่อง',
    icon: (
      <>
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
        <path d="M5 17a3 3 0 0 1 3-3h11" />
      </>
    ),
  },
  {
    id: 'team',
    label: 'ทีม',
    icon: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M15 14.5c3 0 6 1.5 6 4.5" />
      </>
    ),
  },
  {
    id: 'bag',
    label: 'กระเป๋า',
    icon: (
      <>
        <path d="M6 8h12l-1 12H7z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ),
  },
  { id: 'chat', label: 'แชท', icon: <path d="M4 5h16v11H9l-5 4z" /> },
];

/** Bottom tab bar for the table page on narrow screens (hidden on wide screens via CSS). */
export function TableTabs({
  value,
  onChange,
  badges = {},
}: {
  value: TableTab;
  onChange: (tab: TableTab) => void;
  badges?: Partial<Record<TableTab, number>>;
}) {
  return (
    <nav className="tabbar" aria-label="ส่วนของโต๊ะ">
      {TABS.map((tab) => {
        const badge = badges[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={value === tab.id}
            aria-label={`แสดง${tab.label}${badge ? ` (${badge} ใหม่)` : ''}`}
            onClick={() => onChange(tab.id)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              {tab.icon}
            </svg>
            <span aria-hidden="true">{tab.label}</span>
            {badge > 0 && <i aria-hidden="true" className="tabbar-dot" />}
          </button>
        );
      })}
    </nav>
  );
}
