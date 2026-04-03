import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute({ children }) {
  const { user, loading, familyMember } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/" replace />
  if (!familyMember) return <Navigate to="/" replace />

  return children
}
