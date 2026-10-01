import { useLayoutEffect, useRef } from 'react'

/** 선택창의 레이아웃 축소로 페이지 스크롤이 제한되지 않게 한다. */
export function usePartySelectorScroll(selection: number | null) {
  const shellRef = useRef<HTMLElement>(null)
  const originalHeight = useRef<string | null>(null)
  const pendingPosition = useRef<{ left: number; top: number } | null>(null)

  const prepareOpen = () => {
    const shell = shellRef.current
    if (!shell) return
    if (originalHeight.current === null)
      originalHeight.current = shell.style.minHeight
    pendingPosition.current = { left: window.scrollX, top: window.scrollY }
    shell.style.minHeight = `${shell.getBoundingClientRect().height}px`
  }

  useLayoutEffect(() => {
    if (selection === null) {
      if (shellRef.current && originalHeight.current !== null)
        shellRef.current.style.minHeight = originalHeight.current
      originalHeight.current = null
      pendingPosition.current = null
      return
    }
    const position = pendingPosition.current
    pendingPosition.current = null
    if (
      position &&
      (window.scrollX !== position.left || window.scrollY !== position.top)
    )
      window.scrollTo({ ...position, behavior: 'instant' })
  }, [selection])

  return { shellRef, prepareOpen }
}
