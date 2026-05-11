import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const criticalStyle = document.createElement('style');
criticalStyle.textContent = `html,body,#root{background:#0a0a0a;color:#e5e5e5;margin:0;color-scheme:dark;}`;
document.head.insertBefore(criticalStyle, document.head.firstChild);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
