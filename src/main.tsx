import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Variable weights, self-hosted. Without these the app silently falls back to
// the OS UI font, which is what made it read as undesigned.
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
