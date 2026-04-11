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

    // TikTok: oEmbed APIを試し、失敗時はモバイルUAでHTMLのog:imageにフォールバック
    if (parsedUrl.hostname.includes('tiktok.com')) {
      // 1st: oEmbed API
      try {
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
        const oembedRes = await fetch(oembedUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; FamilyApp/1.0)',
          },
          signal: AbortSignal.timeout(8000),
        })
        if (oembedRes.ok) {
          const json = await oembedRes.json()
          if (json?.thumbnail_url) {
            return new Response(JSON.stringify({ image: json.thumbnail_url }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        }
      } catch {
        // oEmbed失敗 → HTMLフォールバックへ
      }

      // 2nd: モバイルUAでHTMLを取得してog:imageを抽出
      try {
        const tiktokRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        })
        if (tiktokRes.ok) {
          const reader = tiktokRes.body?.getReader()
          if (reader) {
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
            const ogImage = extractMetaContent(html, [
              /og:image["'\s]+content=["']([^"']+)["']/i,
              /content=["']([^"']+)["']\s+property=["']og:image["']/i,
              /twitter:image["'\s]+content=["']([^"']+)["']/i,
              /content=["']([^"']+)["']\s+name=["']twitter:image["']/i,
            ])
            if (ogImage) {
              return new Response(JSON.stringify({ image: toAbsoluteUrl(ogImage, parsedUrl) }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              })
            }
          }
        }
      } catch {
        // HTMLフォールバックも失敗
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
