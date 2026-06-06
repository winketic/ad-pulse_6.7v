import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  console.log('[auth/confirm] token_hash:', token_hash, 'type:', type)

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
  }

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // ignore in server context
            }
          },
        },
      }
    )

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'email' | 'recovery' | 'invite' | 'magiclink' | 'email_change',
    })

    console.log('[auth/confirm] result:', { userId: data?.user?.id, error })

    if (error) {
      console.error('[auth/confirm] error:', error)
      return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
    }

    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/reset-password', request.url))
    }
    if (type === 'invite' || type === 'signup') {
      return NextResponse.redirect(new URL('/invite', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))

  } catch (e) {
    console.error('[auth/confirm] exception:', e)
    return NextResponse.redirect(new URL('/login?error=invalid_link', request.url))
  }
}
