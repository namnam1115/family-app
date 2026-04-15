const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { url } = await req.json()
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'url is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // URLのバリデーション
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return new Response(JSON.stringify({ error: 'Only http/https URLs are allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // TikTok: oEmbed APIでサムネイルを取得（bot対策のためHTMLスクレイピング不可）
    // 取得したサムネイルURLは署名付きCDN URLで期限切れになるため、
    // 画像をダウンロードしてSupabase Storageに永続保存する
    if (parsedUrl.hostname.includes('tiktok.com')) {
      const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
      const oembedRes = await fetch(oembedUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (oembedRes.ok) {
        const json = await oembedRes.json()
        if (json?.thumbnail_url) {
          const permanentUrl = await uploadThumbnailToStorage(url, json.thumbnail_url)
          return new Response(JSON.stringify({ image: permanentUrl ?? json.thumbnail_url }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
      return new Response(JSON.stringify({ image: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FamilyApp/1.0; +https://family-app.example.com)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      return new Response(JSON.stringify({ image: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      // HTMLでなければ画像URLとして返す
      if (contentType.startsWith('image/')) {
        return new Response(JSON.stringify({ image: url }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ image: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HTMLを最大200KBだけ読む（パフォーマンス最適化）
    const reader = response.body?.getReader()
    if (!reader) {
      return new Response(JSON.stringify({ image: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const MAX_BYTES = 200 * 1024
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      totalBytes += value.byteLength
      if (totalBytes >= MAX_BYTES) break
    }
    reader.cancel()

    const decoder = new TextDecoder('utf-8', { fatal: false })
    const html = decoder.decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length)
        merged.set(acc)
        merged.set(chunk, acc.length)
        return merged
      }, new Uint8Array(0))
    )

    // og:image を優先、なければ twitter:image
    const ogImage = extractMetaContent(html, [
      /og:image["'\s]+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["']\s+property=["']og:image["']/i,
      /twitter:image["'\s]+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["']\s+name=["']twitter:image["']/i,
    ])

    if (!ogImage) {
      return new Response(JSON.stringify({ image: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 相対URLを絶対URLに変換
    const imageUrl = toAbsoluteUrl(ogImage, parsedUrl)

    return new Response(JSON.stringify({ image: imageUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('fetch-og-image error:', err)
    return new Response(JSON.stringify({ image: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// TikTokのサムネイル画像をダウンロードしてSupabase Storageに保存する。
// 成功したら永続的な公開URLを返す。失敗したらnullを返す（呼び出し側で元URLにフォールバック）。
async function uploadThumbnailToStorage(sourceUrl: string, thumbnailUrl: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return null

  try {
    // 画像をダウンロード
    const imgRes = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(10000) })
    if (!imgRes.ok) return null

    const imgBytes = await imgRes.arrayBuffer()
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : 'jpg'

    // TikTok動画URLのハッシュをファイル名に使い、同じ動画で重複保存しない
    const hash = await sha256Hex(sourceUrl)
    const fileName = `tiktok_${hash}.${ext}`

    // Supabase Storage にアップロード（既存ファイルは上書き）
    const storageRes = await fetch(
      `${supabaseUrl}/storage/v1/object/dish-thumbnails/${fileName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: imgBytes,
      }
    )

    if (!storageRes.ok) return null

    return `${supabaseUrl}/storage/v1/object/public/dish-thumbnails/${fileName}`
  } catch {
    return null
  }
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24)
}

function extractMetaContent(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function toAbsoluteUrl(src: string, base: URL): string {
  if (/^https?:\/\//i.test(src)) return src
  if (src.startsWith('//')) return `${base.protocol}${src}`
  if (src.startsWith('/')) return `${base.origin}${src}`
  return new URL(src, base).href
}
