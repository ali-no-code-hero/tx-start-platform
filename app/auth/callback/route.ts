import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

function safeNextPath(next: string | null): string {
  const fallback = "/applications";
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const redirectTarget = new URL(nextPath, url.origin);

  if (!code) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent("Missing sign-in code. Request a new code or open the link from your email again.")}`,
        url.origin,
      ),
    );
  }

  const response = NextResponse.redirect(redirectTarget);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return response;
}
