"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Preloader } from "@/components/preloader"
import { ParticlesBackground } from "@/components/particles-background"
import { useRouter, useSearchParams } from "next/navigation"
import { Mail, Lock, AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react"
import Image from "next/image"
import { storeAccessToken, getDeviceId, collectDeviceMeta, tryRefreshTokens, getAccessToken } from "@/lib/auth-client"
import { triggerAuthRefresh } from "@/hooks/useAuth"
import { useEffect } from "react"

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Attempt silent refresh on mount — if successful, redirect to dashboard
  useEffect(() => {
    const attemptSilentRefresh = async () => {
      try {
        // If we already have an access token, attempt to refresh it
        if (getAccessToken()) {
          const refreshed = await tryRefreshTokens()
          if (refreshed) {
            console.log("✅ Silent refresh successful — redirecting to dashboard")
            router.push("/dashboard")
          }
        }
      } catch (err) {
        console.warn("Silent refresh failed (expected if not logged in):", err)
      }
    }

    attemptSilentRefresh()
  }, [router])

  // Validate and normalize redirect URL — prevent open redirects
  const validateRedirect = (url: string): string => {
    if (!url || url === "/" || !url.startsWith("/")) {
      return "/dashboard"
    }
    return url
  }

  const rawRedirect = searchParams.get("redirect") || ""
  const redirect = validateRedirect(rawRedirect)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      // Step 1: Resolve device identity
      const deviceId = getDeviceId()       // stable UUID persisted in localStorage
      const deviceMeta = collectDeviceMeta() // platform, model, appVersion

      // Step 2: Send credentials directly to our login endpoint
      // (The endpoint will authenticate against Firebase and return our access/refresh tokens)
      let sessionResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, deviceId, deviceMeta }),
      })

      // If request failed, get error details
      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json()
        throw new Error(errorData.message || "Failed to login")
      }

      const sessionData = await sessionResponse.json()

      // Step 3: Persist access token in memory (refresh token is in httpOnly cookie)
      storeAccessToken(sessionData.accessToken)

      const isBooker = sessionData?.user?.isBooker || false

      console.log("✅ Session created successfully")

      // Trigger auth context to refetch user data
      triggerAuthRefresh()

      // Step 4: Route based on booker status
      if (!isBooker) {
        console.warn("⚠️ User is not a booker — redirecting to /not-booker")
        router.push("/not-booker")
        return
      }

      console.log("✅ Redirecting to:", redirect)
      router.push(redirect)
    } catch (err: any) {
      console.error("Login error:", err)

      let errorMessage = err.message || "Failed to login. Please try again."

      // Handle common error messages from our API
      if (errorMessage.includes("Incorrect email") || errorMessage.includes("password")) {
        errorMessage = "Incorrect email or password"
      } else if (errorMessage.includes("email")) {
        errorMessage = "Please enter a valid email address"
      } else if (errorMessage.includes("too many") || errorMessage.includes("attempts")) {
        errorMessage = "Too many failed login attempts. Please try again later"
      } else if (errorMessage.includes("disabled")) {
        errorMessage = "This account has been disabled"
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Preloader isLoading={loading} />
      <ParticlesBackground />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-slate-100 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-md w-full space-y-8 animate-in fade-in zoom-in-95 duration-700">
          {/* Header */}
          <div className="text-center space-y-6">
            <div className="inline-flex items-center justify-center mx-auto">
              <div className="relative w-32 h-32 rounded-2xl overflow-hidden shadow-lg">
                <Image
                  src="/logo.png"
                  alt="Spotix"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-[#6b2fa5] via-[#8b3fc5] to-[#6b2fa5] bg-clip-text text-transparent">
                Spotix Booker
              </h1>
              <p className="text-lg text-slate-600">Sign in to your booker dashboard</p>
            </div>

            {redirect && redirect !== "/" && (
              <div className="flex items-center gap-2 justify-center p-3 rounded-lg bg-blue-50 border border-blue-200">
                <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  Please sign in to continue to{" "}
                  <span className="font-semibold">{redirect}</span>
                </p>
              </div>
            )}
          </div>

          {/* Login Form Card */}
          <div className="bg-white rounded-2xl shadow-xl border-2 border-slate-200 p-8 space-y-6">
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-12 pr-12 py-3 rounded-lg border-2 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6b2fa5] focus:border-[#6b2fa5] transition-all duration-200"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#6b2fa5] transition-colors p-1 rounded-md hover:bg-slate-100"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <div className="relative w-5 h-5">
                      <Eye
                        className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${
                          showPassword
                            ? "opacity-0 scale-0 rotate-180"
                            : "opacity-100 scale-100 rotate-0"
                        }`}
                      />
                      <EyeOff
                        className={`absolute inset-0 w-5 h-5 transition-all duration-300 ${
                          showPassword
                            ? "opacity-100 scale-100 rotate-0"
                            : "opacity-0 scale-0 -rotate-180"
                        }`}
                      />
                    </div>
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex gap-3 p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-800 text-sm animate-in slide-in-from-top-2 duration-300">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-1">Login Failed</p>
                    <p>{error}</p>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="group w-full inline-flex items-center justify-center gap-3 bg-gradient-to-r from-[#6b2fa5] to-purple-600 hover:from-[#5a2589] hover:to-[#6b2fa5] text-white font-bold py-3.5 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#6b2fa5]/30 hover:shadow-xl hover:shadow-[#6b2fa5]/40 hover:-translate-y-0.5 active:translate-y-0"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            {/* Signup Link */}
            <p className="text-center text-sm text-slate-500">
              Don't have an account?{" "}
              <a
                href="https://spotix.com.ng/auth/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#6b2fa5] font-semibold hover:underline"
              >
                Sign up
              </a>
            </p>
          </div>

          {/* Footer Note */}
          <p className="text-center text-xs text-slate-500">
            By signing in, you agree to our{" "}
            <Link href="/terms" className="text-[#6b2fa5] hover:underline font-semibold">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-[#6b2fa5] hover:underline font-semibold">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}
