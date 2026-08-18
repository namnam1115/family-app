// 繰り返し予定の日付計算が、クライアントと Edge Function で一致するか検証する。
//
//   node scripts/check-recurrence-parity.mjs
//
// 両者がズレると「この回だけ削除」した回にリマインダーが飛ぶ、アプリ表示と
// 通知日が食い違う、といった不整合が起きる。どちらかを直したらこれを走らせる。
// クライアントはブラウザのローカル時刻で暦日を扱うため、JST 前提で比較する。

process.env.TZ = 'Asia/Tokyo'

const { addByRule: clientAddByRule, toDateStr } = await import('../src/lib/schedule.js')
const { addByRule: edgeAddByRule, jstDateStr } =
  await import('../supabase/functions/send-schedule-reminders/occurrences.ts')

const RULES = ['daily', 'weekly', 'monthly', 'yearly']
const pad = n => String(n).padStart(2, '0')
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1))

let checked = 0
const diffs = []

for (let i = 0; i < 20000; i++) {
  const rule = RULES[rnd(0, 3)]
  // 早朝・深夜を厚めに引く（UTC と JST で暦日が変わる時間帯）
  const hour = Math.random() < 0.5 ? rnd(0, 8) : rnd(9, 23)
  const iso = `${rnd(2023, 2027)}-${pad(rnd(1, 12))}-${pad(rnd(1, 31))}T${pad(hour)}:${pad(rnd(0, 59))}:00+09:00`
  const ms = Date.parse(iso)
  if (isNaN(ms)) continue
  const n = rnd(0, 400)

  const client = toDateStr(clientAddByRule(new Date(ms), rule, n))
  const edge = jstDateStr(edgeAddByRule(ms, rule, n))
  checked++
  if (client !== edge) diffs.push({ iso, rule, n, client, edge })
}

console.log(`比較 ${checked} 件 / 差異 ${diffs.length} 件`)
for (const d of diffs.slice(0, 10)) {
  console.log(`  ${d.iso} ${d.rule} +${d.n}: クライアント=${d.client} Edge=${d.edge}`)
}
if (diffs.length > 10) console.log(`  ... 他 ${diffs.length - 10} 件`)
process.exit(diffs.length ? 1 : 0)
