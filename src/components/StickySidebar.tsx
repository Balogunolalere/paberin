'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface SidebarSection {
  id: string;
  label: string;
}

interface StickySidebarProps {
  sections: SidebarSection[];
}

export function StickySidebar({ sections }: StickySidebarProps) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      // Offset for header
      const y = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <nav className="hidden lg:block sticky top-28 self-start h-fit">
      <p className="font-mono text-xs font-medium text-vercel-muted mb-6 uppercase tracking-widest">On This Page</p>
      <ul className="space-y-1 border-l border-vercel-border">
        {sections.map((section) => (
          <li key={section.id}>
            <button
              onClick={() => scrollTo(section.id)}
              className={cn(
                'text-left w-full px-4 py-1.5 text-sm transition-colors -ml-[1px] border-l',
                activeId === section.id 
                  ? 'border-vercel-accent text-vercel-text font-medium' 
                  : 'border-transparent text-vercel-muted hover:text-vercel-text hover:border-vercel-muted/30'
              )}
            >
              {section.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
