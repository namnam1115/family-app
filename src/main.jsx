import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import App from './App.jsx'
import './index.css'

// ネイティブアプリ起動時の初期化
if (Capacitor.isNativePlatform()) {
  // ステータスバーのスタイルをアプリのテーマカラーに合わせる
  StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  StatusBar.setBackgroundColor({ color: '#7C3AED' }).catch(() => {})
  // アプリが準備できたらスプラッシュを非表示
  SplashScreen.hide().catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
