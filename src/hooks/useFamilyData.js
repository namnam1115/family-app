import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

/**
 * Supabase のクエリ結果からデータだけを取り出す。
 * error は握りつぶさず例外にして useFamilyData 側で拾わせる。
 */
export async function unwrap(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

/**
 * 家族スコープのデータ取得 + Realtime 購読の定型をまとめたフック。
 *
 *   const { data, loading, error, refetch } = useFamilyData(
 *     familyId => unwrap(supabase.from('inventory_items').select('*').eq('family_id', familyId)),
 *     ['inventory_items'],
 *   )
 *
 * fetcher(familyId) は毎レンダー新しい関数でよい（ref 経由で参照するため再購読は起きない）。
 * tables に挙げたテーブルの family_id 一致の変更を購読し、変化したら再取得する。
 * initialData を渡すと取得前の data がその値になる（一覧なら `[]` を渡すと null 判定が不要）。
 */
export function useFamilyData(fetcher, tables = [], initialData = null) {
  const { familyMember } = useAuth()
  const familyId = familyMember?.family_id ?? null
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const refetch = useCallback(async () => {
    if (!familyId) return
    try {
      const result = await fetcherRef.current(familyId)
      setData(result)
      setError(null)
    } catch (err) {
      console.error('データ取得エラー:', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [familyId])

  useEffect(() => {
    if (familyId) refetch()
    else setLoading(false)
  }, [familyId, refetch])

  // 配列リテラルを毎レンダー渡しても再購読しないよう文字列化して依存にする
  const tableKey = tables.join(',')
  const channelId = useId()

  useEffect(() => {
    if (!familyId || !tableKey) return
    const channel = supabase.channel(`family-data:${channelId}:${familyId}`)
    for (const table of tableKey.split(',')) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `family_id=eq.${familyId}` },
        refetch,
      )
    }
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [familyId, tableKey, channelId, refetch])

  return { data, loading, error, refetch, familyId, setData }
}
