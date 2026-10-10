import { useEffect, useState } from 'react'

/** Dark is the default look; the toggle switches between dark and light and remembers the choice. */
export function getTheme(): 'light' | 'dark' {
  try {
    return localStorage.getItem('atlas:theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function setTheme(t: 'light' | 'dark') {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('atlas:theme', t)
  } catch {
    /* storage unavailable: choice lasts for this page only */
  }
  window.dispatchEvent(new Event('atlas:theme'))
}

/** The theme actually on screen, after resolving "system". */
export function useResolvedTheme(): 'light' | 'dark' {
  const [theme, set] = useState<'light' | 'dark'>(getTheme)
  useEffect(() => {
    const update = () => set(getTheme())
    window.addEventListener('atlas:theme', update)
    return () => window.removeEventListener('atlas:theme', update)
  }, [])
  return theme
}
