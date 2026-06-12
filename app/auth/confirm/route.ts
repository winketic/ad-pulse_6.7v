import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next')

  console.log('[auth/confirm] token_hash:', !!token_hash, 'type:', type, 'next:', next)

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

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
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

  // next param takes priority (allows email template to control destination)
  if (next) {
    return NextResponse.redirect(new URL(next, origin))
  }

  return NextResponse.redirect(new URL('/dashboard', origin))
}
