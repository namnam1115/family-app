import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import HomePage from './pages/HomePage'
import ShoppingPage from './pages/ShoppingPage'
import PricePage from './pages/PricePage'
import BudgetPage from './pages/BudgetPage'
import PlacesPage from './pages/PlacesPage'
import JoinPage from './pages/JoinPage'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
