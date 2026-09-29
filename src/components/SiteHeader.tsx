'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function SiteHeader() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let saved: Theme | null = null;
    try {
      const value = localStorage.getItem('theme');
      if (value === 'dark' || value === 'light') saved = value;
    } catch {
      /* storage can be blocked */
    }
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    setTheme(saved ?? systemTheme());
  }, []);

  function toggle() {
    const next: Theme = (theme ?? systemTheme()) === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  return (
    <header className="top">
      <Link href="/" className="brand">
        DUNGEON MASTER AI
        <small>ให้ AI เป็น DM ของโต๊ะคุณ</small>
      </Link>
      <button type="button" className="theme" onClick={toggle}>
        {theme === 'light' ? 'โหมดมืด' : 'โหมดสว่าง'}
      </button>
    </header>
  );
}
