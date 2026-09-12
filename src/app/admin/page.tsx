'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AdminAuthProvider, useAdminAuth } from '@/components/admin/admin-auth'
import { AdminLogin } from '@/components/admin/admin-login'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { Loader2 } from 'lucide-react'

function AdminBackGuard() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Add a guard entry so the Android/iOS browser back button cannot
    // immediately leave the website from /admin. The first back press returns
    // to the public Home screen; Home remains the final boundary where the
    // browser is allowed to leave the website.
    window.history.pushState({ apnaBaithakAdminGuard: true }, '', window.location.href)

    const handlePopState = () => {
      router.push('/')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [router])

  return null
}

function AdminGate() {
  const { authed, loading } = useAdminAuth()
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    )
  }
  if (!authed) return <AdminLogin />
  return <AdminDashboard />
}

export default function AdminPage() {
  return (
    <AdminAuthProvider>
      <AdminBackGuard />
      <AdminGate />
    </AdminAuthProvider>
  )
}
