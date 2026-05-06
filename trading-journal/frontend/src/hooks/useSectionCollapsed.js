import { useState, useCallback } from 'react';

const KEY_PREFIX = 'notes:section:collapsed:';

export function useSectionCollapsed(sectionId) {
  const storageKey = `${KEY_PREFIX}${sectionId}`;

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, [storageKey]);

  return [collapsed, toggle];
}

export function clearSectionCollapsed(sectionId) {
  try {
    localStorage.removeItem(`${KEY_PREFIX}${sectionId}`);
  } catch {
    /* ignore */
  }
}
