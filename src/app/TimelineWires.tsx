import { useLayoutEffect, useRef, useState } from 'react'
import type { TimelineColumn, Transition } from '../domain/rotation'
import { orthogonalPath } from './timeline-path'

interface Wire {
  id: string
  path: string
  kind: 'flow' | 'transition'
}

interface Geometry {
  width: number
  height: number
  wires: Wire[]
}

export function TimelineWires({
  columns,
  transitions,
  party,
}: {
  columns: readonly TimelineColumn[]
  transitions: readonly Transition[]
  party: readonly string[]
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [geometry, setGeometry] = useState<Geometry>({
    width: 0,
    height: 0,
    wires: [],
  })

  useLayoutEffect(() => {
    const grid = svgRef.current?.parentElement
    if (!grid) return
    const measure = () => {
      const rect = grid.getBoundingClientRect()
      const actionElements = new Map(
        Array.from(
          grid.querySelectorAll<HTMLElement>('[data-action-column]'),
        ).map((element) => [element.dataset.actionColumn, element]),
      )
      const rowElements = new Map(
        Array.from(grid.querySelectorAll<HTMLElement>('[data-row-owner]')).map(
          (element) => [element.dataset.rowOwner, element],
        ),
      )
      const cellElements = new Map<string, HTMLElement>()
      for (const element of grid.querySelectorAll<HTMLElement>(
        '[data-column-cell]',
      )) {
        const id = element.dataset.columnCell
        if (id && !cellElements.has(id)) cellElements.set(id, element)
      }
      const wires: Wire[] = []

      for (let index = 0; index < columns.length - 1; index++) {
        const from = actionElements
          .get(columns[index].id)
          ?.getBoundingClientRect()
        const to = actionElements
          .get(columns[index + 1].id)
          ?.getBoundingClientRect()
        if (!from || !to) continue
        wires.push({
          id: `flow-${columns[index].id}-${columns[index + 1].id}`,
          kind: 'flow',
          path: orthogonalPath(
            from.right - rect.left,
            from.top + from.height / 2 - rect.top,
            to.left - rect.left,
            to.top + to.height / 2 - rect.top,
          ),
        })
      }

      for (const transition of transitions) {
        const from = rowElements.get(transition.fromId)?.getBoundingClientRect()
        const to = rowElements.get(transition.toId)?.getBoundingClientRect()
        const anchor = transition.afterColumnId
          ? cellElements.get(transition.afterColumnId)?.getBoundingClientRect()
              .right
          : rowElements.get(party[0])?.getBoundingClientRect().right
        if (!from || !to || anchor === undefined) continue
        const boundaryX = anchor - rect.left
        const fromY = from.top + from.height / 2 - rect.top
        const toY = to.top + to.height / 2 - rect.top
        wires.push({
          id: `transition-${transition.switchId}`,
          kind: 'transition',
          path: `M ${boundaryX - 13} ${fromY} H ${boundaryX} V ${toY} H ${boundaryX + 13}`,
        })
      }
      setGeometry({ width: grid.scrollWidth, height: grid.scrollHeight, wires })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    for (const element of grid.querySelectorAll<HTMLElement>(
      '[data-action-column]',
    ))
      observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [columns, transitions, party])

  return (
    <svg
      ref={svgRef}
      className="timeline-wires"
      width={geometry.width}
      height={geometry.height}
      aria-hidden="true"
    >
      {geometry.wires.map((wire) => (
        <path key={wire.id} className={`wire-${wire.kind}`} d={wire.path} />
      ))}
    </svg>
  )
}
