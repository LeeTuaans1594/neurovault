import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Import theme store to apply dark/light class before first paint
import './store/useThemeStore.js'

// ═══ PWA: Service Worker Registration via vite-plugin-pwa ═══
// Dynamic import to avoid blocking rendering if module resolution fails
try {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        if (confirm('NeuroVault có phiên bản mới. Tải lại trang?')) {
          updateSW(true)
        }
      },
      onOfflineReady() {
        console.log('[NeuroVault] Ứng dụng sẵn sàng hoạt động offline.')
      },
      onRegisteredSW(swUrl, r) {
        if (r) {
          setInterval(() => {
            r.update()
          }, 60 * 60 * 1000)
        }
      },
    })
  }).catch(() => {
    console.warn('[NeuroVault] PWA registration skipped — plugin not available in dev mode.')
  })
} catch {
  console.warn('[NeuroVault] PWA module not available.')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
