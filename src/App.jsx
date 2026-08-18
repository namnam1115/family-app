import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import HomePage from './pages/HomePage'
import ProtectedRoute from './components/ProtectedRoute'
import OfflineBanner from './components/OfflineBanner'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'

// ホーム以外は初回表示に不要なため遅延読み込みする（SchedulePage / PlacesPage が特に大きい）
const ShoppingPage = lazy(() => import('./pages/ShoppingPage'))
const PricePage = lazy(() => import('./pages/PricePage'))
const BudgetPage = lazy(() => import('./pages/BudgetPage'))
const PlacesPage = lazy(() => import('./pages/PlacesPage'))
const DishesPage = lazy(() => import('./pages/DishesPage'))
const SchedulePage = lazy(() => import('./pages/SchedulePage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const TravelPage = lazy(() => import('./pages/TravelPage'))
const JoinPage = lazy(() => import('./pages/JoinPage'))

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
            <Route path="/join/:familyId" element={<LazyRoute><JoinPage /></LazyRoute>} />
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
