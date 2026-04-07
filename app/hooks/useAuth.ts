"use client"

import { useEffect, useState, createContext, useContext, ReactNode, createElement } from "react"
import { authFetch, getAccessToken, tryRefreshTokens, clearAccessToken } from "@/lib/auth-client"

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

// Global event emitter for auth changes
let authRefreshListeners: Array<() => void> = []

export function triggerAuthRefresh() {
  authRefreshListeners.forEach(callback => callback())
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if we have an access token in memory
        let token = getAccessToken()
        
        // If not in memory, try to refresh from the httpOnly cookie
        if (!token) {
          const refreshed = await tryRefreshTokens()
          if (!refreshed) {
            // No valid session
            setLoading(false)
            return
          }
          token = getAccessToken()
        }

        if (!token) {
          setLoading(false)
          return
        }

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
        } else if (response.status === 401) {
          // Token is invalid, clear it
          clearAccessToken()
          setUser(null)
        }
      } catch (err) {
        console.error("Failed to initialize auth:", err)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [refreshKey])

  // Listen for manual auth refresh triggers (e.g., after login)
  useEffect(() => {
    const handleAuthRefresh = () => {
      setRefreshKey(prev => prev + 1)
    }

    authRefreshListeners.push(handleAuthRefresh)

    return () => {
      authRefreshListeners = authRefreshListeners.filter(cb => cb !== handleAuthRefresh)
    }
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
