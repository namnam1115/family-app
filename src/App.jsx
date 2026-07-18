import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import HomePage from './pages/HomePage'
import ShoppingPage from './pages/ShoppingPage'
import PricePage from './pages/PricePage'
import BudgetPage from './pages/BudgetPage'
import PlacesPage from './pages/PlacesPage'
import DishesPage from './pages/DishesPage'
import SchedulePage from './pages/SchedulePage'
import InventoryPage from './pages/InventoryPage'
import TravelPage from './pages/TravelPage'
import JoinPage from './pages/JoinPage'
import ProtectedRoute from './components/ProtectedRoute'
import OfflineBanner from './components/OfflineBanner'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OfflineBanner />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/join/:familyId" element={<JoinPage />} />
          <Route
            path="/shopping"
            element={
              <ProtectedRoute>
                <ShoppingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/price"
            element={
              <ProtectedRoute>
                <PricePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budget"
            element={
              <ProtectedRoute>
                <BudgetPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/places"
            element={
              <ProtectedRoute>
                <PlacesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dishes"
            element={
              <ProtectedRoute>
                <DishesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedule"
            element={
              <ProtectedRoute>
                <SchedulePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <InventoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/travels"
            element={
              <ProtectedRoute>
                <TravelPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
