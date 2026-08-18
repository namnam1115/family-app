import { Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import HomePage from './pages/HomePage'
import ProtectedRoute from './components/ProtectedRoute'
import OfflineBanner from './components/OfflineBanner'
import ErrorBoundary from './components/ErrorBoundary'
import { lazyWithReload } from './lib/lazyWithReload'
import LoadingSpinner from './components/LoadingSpinner'

// ホーム以外は初回表示に不要なため遅延読み込みする（SchedulePage / PlacesPage が特に大きい）
// lazyWithReload はデプロイ直後の古いタブでチャンクが取れない場合に一度だけ再読み込みする
const ShoppingPage = lazyWithReload(() => import('./pages/ShoppingPage'))
const PricePage = lazyWithReload(() => import('./pages/PricePage'))
const BudgetPage = lazyWithReload(() => import('./pages/BudgetPage'))
const PlacesPage = lazyWithReload(() => import('./pages/PlacesPage'))
const DishesPage = lazyWithReload(() => import('./pages/DishesPage'))
const SchedulePage = lazyWithReload(() => import('./pages/SchedulePage'))
const InventoryPage = lazyWithReload(() => import('./pages/InventoryPage'))
const TravelPage = lazyWithReload(() => import('./pages/TravelPage'))
const JoinPage = lazyWithReload(() => import('./pages/JoinPage'))

/** 遅延ページを ErrorBoundary + Suspense で包む（チャンク取得失敗も拾う） */
function LazyRoute({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <OfflineBanner />
          <Routes>
            <Route path="/" element={<ErrorBoundary><HomePage /></ErrorBoundary>} />
            <Route path="/join/:token" element={<LazyRoute><JoinPage /></LazyRoute>} />
            <Route
              path="/shopping"
              element={
                <LazyRoute>
                  <ProtectedRoute>
                    <ShoppingPage />
                  </ProtectedRoute>
                </LazyRoute>
              }
            />
            <Route
              path="/price"
              element={
                <LazyRoute>
                  <ProtectedRoute>
                    <PricePage />
                  </ProtectedRoute>
                </LazyRoute>
              }
            />
            <Route
              path="/budget"
              element={
                <LazyRoute>
                  <ProtectedRoute>
                    <BudgetPage />
                  </ProtectedRoute>
                </LazyRoute>
              }
            />
            <Route
              path="/places"
              element={
                <LazyRoute>
                  <ProtectedRoute>
                    <PlacesPage />
                  </ProtectedRoute>
                </LazyRoute>
              }
            />
            <Route
              path="/dishes"
              element={
                <LazyRoute>
                  <ProtectedRoute>
                    <DishesPage />
                  </ProtectedRoute>
                </LazyRoute>
              }
            />
            <Route
              path="/schedule"
              element={
                <LazyRoute>
                  <ProtectedRoute>
                    <SchedulePage />
                  </ProtectedRoute>
                </LazyRoute>
              }
            />
            <Route
              path="/inventory"
              element={
                <LazyRoute>
                  <ProtectedRoute>
                    <InventoryPage />
                  </ProtectedRoute>
                </LazyRoute>
              }
            />
            <Route
              path="/travels"
              element={
                <LazyRoute>
                  <ProtectedRoute>
                    <TravelPage />
                  </ProtectedRoute>
                </LazyRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
