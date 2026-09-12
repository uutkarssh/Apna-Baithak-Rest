'use client'

import { useState } from 'react'
import { ArrowLeft, Mail, Lock, User as UserIcon, Chrome, Phone, CheckCircle2 } from 'lucide-react'
import { useApp } from '@/store/app'
import { useAuth } from '@/components/providers/auth-provider'
import { toast } from 'sonner'
import { BrandIcon, BrandWordmark } from '@/components/brand/brand-logo'
import { getSupabaseBrowser } from '@/lib/supabase-client'

function normalizeIndianMobile(value: string) {
  let digits = value.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

export function LoginView() {
  const back = useApp((s) => s.back)
  const returnFromLogin = useApp((s) => s.returnFromLogin)
  const { signInWithGoogle } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [verificationSent, setVerificationSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const supabase = getSupabaseBrowser()

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw new Error(error.message)
        // AuthProvider listens for SIGNED_IN and hydrates the profile in the background.
        toast.success('Signed in')
        returnFromLogin()
        return
      }

      if (!name.trim()) throw new Error('Please enter your name')
      const digits = normalizeIndianMobile(phone)
      if (!/^[6-9]\d{9}$/.test(digits)) {
        throw new Error('Please enter a valid 10-digit Indian mobile number')
      }

      const normalizedPhone = `+91 ${digits}`
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), phone: normalizedPhone } },
      })
      if (error) throw new Error(error.message)

      // With Supabase email confirmation enabled, no session is returned.
      // Keep the user on a dedicated confirmation screen instead of closing
      // the login view and leaving them unsure what to do next.
      if (!data.session) {
        setVerificationSent(true)
        return
      }

      toast.success('Account created')
      returnFromLogin()
    } catch (e: any) {
      toast.error(e.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function resendVerification() {
    if (!email.trim()) return
    setBusy(true)
    try {
      const supabase = getSupabaseBrowser()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      })
      if (error) throw new Error(error.message)
      toast.success('Verification email sent again')
    } catch (e: any) {
      toast.error(e.message || 'Could not resend verification email')
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setBusy(true)
    const { error } = await signInWithGoogle()
    if (error) {
      setBusy(false)
      toast.error(error)
    }
  }

  if (verificationSent) {
    return (
      <div className="flex min-h-full flex-col">
        <header className="px-4 py-3">
          <button
            onClick={() => setVerificationSent(false)}
            className="grid h-9 w-9 place-items-center rounded-full bg-muted"
            aria-label="Back to sign up"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
          <BrandIcon size={72} priority />
          <BrandWordmark height={32} priority />
          <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Verify your email</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              We have sent a verification email to <span className="font-bold text-foreground">{email}</span>.
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open your email and click the <span className="font-semibold text-foreground">Verify Email</span> link to activate your account.
            </p>
          </div>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-muted/40 p-4 text-left">
            <p className="text-xs font-bold text-foreground">After clicking the link</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Come back to Apna Baithak and sign in with your email and password. Your account will be ready to use.
            </p>
          </div>
          <button
            onClick={resendVerification}
            disabled={busy}
            className="w-full max-w-sm rounded-xl border border-border bg-card py-3 text-sm font-bold text-foreground disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Resend verification email'}
          </button>
          <button
            onClick={() => setVerificationSent(false)}
            className="text-sm font-bold text-brand"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-4 py-3">
        <button onClick={back} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </header>
      <div className="flex flex-col gap-6 px-5 pt-4">
        <div className="flex flex-col items-center gap-3 pb-2">
          <BrandIcon size={72} priority />
          <BrandWordmark height={32} priority />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">{mode === 'signin' ? 'Welcome back!' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to place your order. Browse the menu freely without logging in.</p>
        </div>
        <button onClick={google} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white py-3 text-sm font-bold text-foreground shadow-sm disabled:opacity-50">
          <Chrome className="h-5 w-5 text-brand" /> Continue with Google
        </button>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />OR<span className="h-px flex-1 bg-border" /></div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === 'signup' && <>
            <label className="block"><span className="mb-1 block text-xs font-bold text-foreground">Full Name</span><div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40"><UserIcon className="h-4 w-4 text-muted-foreground" /><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="flex-1 bg-transparent text-sm outline-none" required /></div></label>
            <label className="block"><span className="mb-1 block text-xs font-bold text-foreground">Contact Number <span className="text-red-500">*</span></span><div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40"><Phone className="h-4 w-4 text-muted-foreground" /><input type="tel" name="phone" autoComplete="tel-national" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" className="flex-1 bg-transparent text-sm outline-none" maxLength={12} required /></div><span className="mt-1 block text-[10px] text-muted-foreground">Required for delivery — we'll call/SMS on this number.</span></label>
          </>}
          <label className="block"><span className="mb-1 block text-xs font-bold text-foreground">Email</span><div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40"><Mail className="h-4 w-4 text-muted-foreground" /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="flex-1 bg-transparent text-sm outline-none" required /></div></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-foreground">Password</span><div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40"><Lock className="h-4 w-4 text-muted-foreground" /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} className="flex-1 bg-transparent text-sm outline-none" required /></div></label>
          <button type="submit" disabled={busy} className="mt-1 w-full rounded-xl bg-brand py-3 text-sm font-bold text-brand-foreground shadow-md disabled:opacity-50">{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="text-center text-sm text-muted-foreground">{mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}<button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="font-bold text-brand">{mode === 'signin' ? 'Sign up' : 'Sign in'}</button></p>
        <div className="h-4" />
      </div>
    </div>
  )
}
