"use client"

import { useEffect, useState, createContext, useContext, ReactNode, createElement } from "react"
import { authFetch, getAccessToken } from "@/lib/auth-client"

type User = {
  id: string
  uid: string
  email: string
  fullName?: string
  isBooker?: boolean
} | null

type AuthContextType = {
  user: User
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const initializeAuth = async () => {
      // Check for access token in memory OR in cookie
      // On first load, token is in cookie but not in memory yet
      const hasAccessToken = getAccessToken() || (typeof document !== 'undefined' && document.cookie.includes('spotix_at'))
      
      if (!hasAccessToken) {
        setLoading(false)
        return
      }

      try {
        // Fetch user data from our custom auth API
        const response = await authFetch("/api/user/me")
        if (response.ok) {
          const userData = await response.json()
          setUser({
            id: userData.uid || userData.id,
            uid: userData.uid || userData.id,
            email: userData.email,
            fullName: userData.fullName,
            isBooker: userData.isBooker,
          })
        }
      } catch (err) {
        console.error("Failed to initialize auth:", err)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [])

  return createElement(
    AuthContext.Provider,
    { value: { user, loading } },
    children
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}
