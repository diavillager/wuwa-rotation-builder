import { useEffect, type ReactNode } from 'react'

/** 클릭/프로그램 포커스는 유지하고 앱 전체의 Tab 이동만 차단한다. */
export function TabFocusGuard({ children }: { children: ReactNode }) {
  useEffect(() => {
    const blockTab = (event: KeyboardEvent) => {
      if (event.key === 'Tab' || event.code === 'Tab') event.preventDefault()
    }
    window.addEventListener('keydown', blockTab, true)
    return () => window.removeEventListener('keydown', blockTab, true)
  }, [])
  return children
}
