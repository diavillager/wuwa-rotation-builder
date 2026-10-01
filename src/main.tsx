import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { ProjectWorkspace } from './app/ProjectWorkspace'
import { CharacterWorkspace } from './app/CharacterWorkspace'
import { TabFocusGuard } from './app/TabFocusGuard'
import './app/style.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TabFocusGuard>
      {import.meta.env.DEV &&
      new URLSearchParams(window.location.search).has('demo') &&
      new URLSearchParams(window.location.search).get('demo') !== 'storage' ? (
        <App />
      ) : import.meta.env.DEV &&
        new URLSearchParams(window.location.search).get('demo') ===
          'storage' ? (
        <ProjectWorkspace />
      ) : (
        <CharacterWorkspace />
      )}
    </TabFocusGuard>
  </React.StrictMode>,
)
