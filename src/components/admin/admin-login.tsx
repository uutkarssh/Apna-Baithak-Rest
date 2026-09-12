'use client'

import { useState } from 'react'
import { Lock, Mail, Loader2 } from 'lucide-react'
import { useAdminAuth } from './admin-auth'
import { toast } from 'sonner'
import { BrandIcon, BrandWordmark } from '@/components/brand/brand-logo'

export function AdminLogin() {
  const { login } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await login(email, password)
    setBusy(false)
    if (error) toast.error(error)
    else toast.success('Welcome, owner')
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-softer to-background px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border/60 bg-card p-6 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandIcon size={64} priority />
          <BrandWordmark height={32} priority className="mt-3" />
          <p className="mt-2 text-xs text-muted-foreground">Restaurant owner access only</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-foreground">Email</span>
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                className="flex-1 bg-transparent text-sm outline-none"
                required
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-foreground">Password</span>
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-transparent text-sm outline-none"
                required
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-xl bg-brand py-3 text-sm font-bold text-brand-foreground shadow-md disabled:opacity-50"
          >
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
