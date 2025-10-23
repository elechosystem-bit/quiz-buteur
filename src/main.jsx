import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Garde contre les erreurs Firebase
try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
} catch (error) {
  console.error('❌ Erreur lors du rendu de l\'application:', error)
  
  // Rendu de fallback en cas d'erreur
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1f2937, #065f46, #1f2937); color: white; font-family: Arial, sans-serif;">
        <div style="text-align: center; padding: 2rem; background: rgba(255,255,255,0.1); border-radius: 1rem; max-width: 500px;">
          <div style="font-size: 4rem; margin-bottom: 1rem;">⚽</div>
          <h1 style="font-size: 2rem; margin-bottom: 1rem;">QUIZ BUTEUR</h1>
          <p style="color: #fbbf24; font-size: 1.2rem; margin-bottom: 1rem;">⚠️ Firebase indisponible (mode démo)</p>
          <p style="margin-bottom: 1rem;">L'application fonctionne en mode démo. Vérifiez la configuration Firebase.</p>
          <button onclick="window.location.reload()" style="background: #059669; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-size: 1rem; cursor: pointer;">
            🔄 Recharger
          </button>
        </div>
      </div>
    `
  }
}
