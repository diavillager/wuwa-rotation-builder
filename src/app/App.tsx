import { createRotation, type Cycle } from '../domain/rotation'

const shell = createRotation(['slot-one', 'slot-two', 'slot-three'])

function CyclePanel({
  label,
  title,
  cycle,
}: {
  label: string
  title: string
  cycle: Cycle
}) {
  return (
    <section className="cycle-panel" aria-label={title}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">{label}</span>
          <h2>{title}</h2>
        </div>
        <span className="status">도메인 기반 준비</span>
      </div>
      <div className="timeline" aria-label={`${title} 전역 타임라인`}>
        {shell.party.map((characterId, index) => (
          <div className="timeline-row" key={characterId}>
            <div className="line-label">
              <span className="line-number">0{index + 1}</span> 파티 슬롯{' '}
              {index + 1}
            </div>
            <div className="line-track">
              {cycle.columns.length === 0 && (
                <span className="empty-hint">아직 기록된 행동이 없습니다</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function App() {
  return (
    <main className="app-shell">
      <header className="page-heading">
        <div>
          <span className="eyebrow">WUTHERING WAVES · ROTATION WORKSPACE</span>
          <h1>WUWA Rotation Builder</h1>
        </div>
        <span className="foundation-badge">Foundation</span>
      </header>

      <section className="party-panel" aria-label="파티 편성">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PARTY SETUP</span>
            <h2>파티 편성</h2>
          </div>
          <p>3인 파티 · 편성 기능 준비 중</p>
        </div>
        <div className="party-grid">
          {shell.party.map((id, index) => (
            <div className="party-slot" key={id}>
              <span className="slot-index">0{index + 1}</span>
              <div className="portrait-placeholder" aria-hidden="true">
                ?
              </div>
              <div>
                <strong>공명자 미지정</strong>
                <small>슬롯 {index + 1}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="workspace-grid">
        <aside className="skills-panel" aria-label="공명자 스킬">
          <div className="section-heading">
            <div>
              <span className="eyebrow">RESONATOR SKILLS</span>
              <h2>공명자 스킬</h2>
            </div>
          </div>
          <div className="skills-empty">
            <div className="empty-symbol">◇</div>
            <strong>검수된 스킬 데이터 대기 중</strong>
            <p>현재 편집 라인의 공명자 스킬이 이곳에 표시됩니다.</p>
          </div>
        </aside>
        <div className="cycles">
          <CyclePanel
            label="OPENING CYCLE"
            title="개막 사이클"
            cycle={shell.opening}
          />
          <CyclePanel
            label="REPEAT CYCLE"
            title="반복 사이클"
            cycle={shell.repeat}
          />
        </div>
      </div>
      <footer>
        이 화면은 구조 확인용 Shell입니다. 입력 및 편집 기능은 아직 연결되지
        않았습니다.
      </footer>
    </main>
  )
}
