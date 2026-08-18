import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SetValuedViz from './Anton'

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('BIST root element was not found.');

createRoot(rootElement).render(
  <StrictMode>
    <SetValuedViz />
  </StrictMode>,
)
