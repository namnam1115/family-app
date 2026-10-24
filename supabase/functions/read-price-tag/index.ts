import Anthropic from 'npm:@anthropic-ai/sdk@1'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// クライアント側で縮小してから送る前提。base64 で約 4MB（画像 3MB 程度）を上限にする
const MAX_IMAGE_BASE64_LENGTH = 4_000_000
const MAX_PRODUCT_NAMES = 200
const UNITS = ['g', 'kg', 'ml', 'L', '個', '枚', '本', '袋', 'ロール', 'm']
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    productName: { type: ['string', 'null'] },
    priceTaxIncluded: { type: ['number', 'null'] },
    priceTaxExcluded: { type: ['number', 'null'] },
    quantity: { type: ['number', 'null'] },
    unit: { type: ['string', 'null'], enum: [...UNITS, null] },
    isSale: { type: 'boolean' },
  },
  required: ['productName', 'priceTaxIncluded', 'priceTaxExcluded', 'quantity', 'unit', 'isSale'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `あなたは日本のスーパー・ドラッグストアの値札（棚札・POP）を読み取るアシスタントです。
写真に写っている値札から、次の項目を読み取って JSON で返してください。

- productName: 商品名。銘柄など同じ商品を見分けるのに必要な部分は残し、キャッチコピーや「〇〇産」などの補足は省く。登録済みの商品名の一覧に同じ商品があれば、一覧の表記をそのまま使う
- priceTaxIncluded: 税込価格（円）。「税込」「税込価格」と書かれた金額。税込表示しかない値札（総額表示）はその金額
- priceTaxExcluded: 本体価格・税抜価格（円）。書かれていなければ null
- quantity / unit: 内容量。unit は ${UNITS.join(' / ')} のいずれか（例: 「1000ml」→ 1000 と ml、「6個入」→ 6 と 個、「12ロール」→ 12 と ロール）。読み取れなければ両方 null
- isSale: 「特売」「本日限り」「お買い得」「〇〇%OFF」などの特売表示があれば true

ルール:
- 100g あたり・1 個あたりの単価表示は価格として使わない
- 値札が複数写っている場合は、写真の中央で最も大きく写っている 1 枚だけを読む
- 読み取れない項目・自信がない項目は推測せず null にする
- 値札が写っていない場合はすべて null、isSale は false にする`

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // anon キーでも JWT 検証は通るため、ログイン中のユーザーかをここで確かめる
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  try {
    const { image, mediaType, productNames } = await req.json()
    if (typeof image !== 'string' || !image || image.length > MAX_IMAGE_BASE64_LENGTH) {
      return jsonResponse({ error: 'image is required (base64, under 4MB)' }, 400)
    }
    if (!MEDIA_TYPES.includes(mediaType)) {
      return jsonResponse({ error: 'Unsupported mediaType' }, 400)
    }
    const names = Array.isArray(productNames)
      ? productNames.filter(n => typeof n === 'string' && n.length <= 100).slice(0, MAX_PRODUCT_NAMES)
      : []

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
    const response = await client.messages.create({
      model: Deno.env.get('PRICE_TAG_MODEL') ?? 'claude-haiku-5-5',
      max_tokens: 4000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: RESULT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          {
            type: 'text',
            text: names.length
              ? `登録済みの商品名:\n${names.join('\n')}`
              : '登録済みの商品名はまだありません。',
          },
        ],
      }],
    })

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      console.error('値札読み取りが完了しませんでした:', response.stop_reason, response.stop_details)
      return jsonResponse({ error: 'Could not read the price tag' }, 422)
    }
    const text = response.content.find(b => b.type === 'text')
    if (!text || text.type !== 'text') {
      return jsonResponse({ error: 'Could not read the price tag' }, 422)
    }
    return jsonResponse(JSON.parse(text.text))
  } catch (err) {
    console.error('値札読み取りエラー:', err)
    return jsonResponse({ error: 'Internal error' }, 500)
  }
})
