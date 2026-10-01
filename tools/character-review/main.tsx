import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ReviewApp } from './ReviewApp'
import './style.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReviewApp />
  </StrictMode>,
)
