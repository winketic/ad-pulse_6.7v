import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type')
  const code       = searchParams.get('code')
  const next       = searchParams.get('next')

  console.log('[auth/confirm] token_hash:', !!token_hash, 'type:', type, 'code:', !!code, 'next:', next)

  // ── PKCE flow ────────────────────────────────────────────────────────────
  // Supabase processes the email link on their server and redirects here with
  // ?code=xxx (+ optionally ?type=recovery). Exchange the code for a session.
  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/confirm] exchangeCodeForSession error:', error.message)
      return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
    }

    // Recovery: session is now set — redirect to reset-password (no token_hash needed)
    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/reset-password', origin))
    }
    if (next) return NextResponse.redirect(new URL(next, origin))
    return NextResponse.redirect(new URL('/dashboard', origin))
  }

  // ── token_hash flow (custom email templates) ─────────────────────────────
  if (!token_hash || !type) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
  }

  // For recovery and invite: pass token to the client page — don't call verifyOtp
  // server-side. Server-side verifyOtp sets a session cookie before the user sees the
  // form; middleware then treats them as authenticated and may redirect to /dashboard.
  if (type === 'recovery') {
    const url = new URL('/reset-password', origin)
    url.searchParams.set('token_hash', token_hash)
    url.searchParams.set('type', 'recovery')
    return NextResponse.redirect(url)
  }
  if (type === 'invite') {
    const url = new URL('/invite', origin)
    url.searchParams.set('token_hash', token_hash)
    url.searchParams.set('type', 'invite')
    return NextResponse.redirect(url)
  }

  // Other types (email confirmation, magiclink, email_change): verify server-side
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({
    type: type as 'email' | 'recovery' | 'invite' | 'magiclink' | 'email_change',
    token_hash,
  })

  if (error) {
    console.error('[auth/confirm] verifyOtp error:', error.message)
    return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
  }

  if (next) return NextResponse.redirect(new URL(next, origin))
  return NextResponse.redirect(new URL('/dashboard', origin))
}
