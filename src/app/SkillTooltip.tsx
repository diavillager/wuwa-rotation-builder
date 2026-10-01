import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Target = { element: HTMLElement; name: string }

/** 카드 내부의 어느 요소를 가리켜도 같은 이름을 보여주는 공통 툴팁. */
export function SkillTooltip({ disabled = false }: { disabled?: boolean }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const tooltipRef = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (disabled) return
    let dragging = false
    const hide = () => setTarget(null)
    const over = (event: MouseEvent) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-skill-tooltip]')
          : null
      const name = element?.dataset.skillTooltip
      if (dragging || !element || !name || element.closest('[hidden]'))
        return hide()
      setTarget((current) =>
        current?.element === element && current.name === name
          ? current
          : { element, name },
      )
    }
    const out = (event: MouseEvent) => {
      const source =
        event.target instanceof Element
          ? event.target.closest('[data-skill-tooltip]')
          : null
      if (
        !(event.relatedTarget instanceof Node) ||
        !source?.contains(event.relatedTarget)
      )
        hide()
    }
    const startDrag = () => {
      dragging = true
      hide()
    }
    const endDrag = () => {
      dragging = false
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('mouseout', out)
    document.addEventListener('dragstart', startDrag, true)
    document.addEventListener('dragend', endDrag, true)
    document.addEventListener('drop', endDrag, true)
    document.addEventListener('scroll', hide, true)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', hide)
    window.addEventListener('blur', hide)
    return () => {
      document.removeEventListener('mouseover', over)
      document.removeEventListener('mouseout', out)
      document.removeEventListener('dragstart', startDrag, true)
      document.removeEventListener('dragend', endDrag, true)
      document.removeEventListener('drop', endDrag, true)
      document.removeEventListener('scroll', hide, true)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', hide)
      window.removeEventListener('blur', hide)
      hide()
    }
  }, [disabled])

  useLayoutEffect(() => {
    if (!target || disabled || !tooltipRef.current) return
    const anchor = target.element.getBoundingClientRect()
    const tooltip = tooltipRef.current.getBoundingClientRect()
    const left = Math.max(
      8,
      Math.min(
        anchor.left + (anchor.width - tooltip.width) / 2,
        window.innerWidth - tooltip.width - 8,
      ),
    )
    const below = anchor.bottom + 8
    const top = Math.max(
      8,
      below + tooltip.height <= window.innerHeight - 8
        ? below
        : anchor.top - tooltip.height - 8,
    )
    setPosition({ left, top })
    const previous = target.element.getAttribute('aria-describedby')
    target.element.setAttribute(
      'aria-describedby',
      [previous, id].filter(Boolean).join(' '),
    )
    const observer = new MutationObserver(() => {
      if (
        !target.element.isConnected ||
        target.element.closest('[hidden]') ||
        target.element.dataset.skillTooltip !== target.name
      )
        setTarget(null)
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'data-skill-tooltip'],
    })
    return () => {
      observer.disconnect()
      if (previous === null) target.element.removeAttribute('aria-describedby')
      else target.element.setAttribute('aria-describedby', previous)
    }
  }, [target, disabled, id])

  return target && !disabled
    ? createPortal(
        <div
          id={id}
          ref={tooltipRef}
          role="tooltip"
          className="skill-tooltip"
          style={position}
        >
          {target.name}
        </div>,
        document.body,
      )
    : null
}
