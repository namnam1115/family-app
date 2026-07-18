# 改善監査レポート（2026-07-18）

対象: `main`（79e25b3 時点）の全ソース・ドキュメント精査。
除外済み: PR #23〜#25 で報告・対応済みの項目（BottomNav 固定、削除確認の統一※、戻るボタン統一、タップ領域、Places 絞り込み集約、フォント読み込み、勤務モード UI 等）。
※「統一」に漏れがあったものは新規発見として本レポートに含む。

---

## Critical

### C-1. 時間指定イベントを編集すると時刻が −9 時間ずれる（データ破壊）
- **根拠**: `src/pages/SchedulePage.jsx:986` / `:991` — 編集モーダルの初期値が `new Date(event.start_datetime).toISOString().slice(0, 16)`。`toISOString()` は UTC のため、JST 10:00 のイベントは `datetime-local` に「01:00」と表示される。保存時は `new Date(startDt).toISOString()`（`SchedulePage.jsx:1024`）でローカル時刻として解釈されるため、**タイトル修正だけでも保存するたびに 9 時間前へシフトする**。
- 同根の問題:
  - 新規追加のデフォルト時刻 `nowRound`（`SchedulePage.jsx:973-977`）も UTC 表示。
  - 週表示の空きスロットタップ `dt.toISOString().slice(0, 16)`（`SchedulePage.jsx:462`）— 10:00 の枠をタップすると 01:00 で開く。
- **影響範囲**: スケジュールの時間指定イベント全般。表示（`formatTime` はローカル）と入力が食い違うため、ユーザーは原因を特定できない。
- **根本原因**: `datetime-local` への値詰めに UTC 文字列を使用。
- **改善方向**: ローカル時刻で `YYYY-MM-DDTHH:mm` を組み立てるヘルパー（`toDateStr` の datetime 版）を作り、`toISOString().slice(0,16)` を全廃する。

## High

### H-1. 「今日の予定」が JST 0:00〜8:59 の予定を取りこぼす
- **根拠**: `src/components/TodaySchedule.jsx:52` — 時間指定イベントの抽出条件が `start_datetime.gte.${today}T00:00:00Z`。`Z`（UTC）指定のため、実際には **JST 9:00〜翌 8:59** を「今日」として取得する。早朝の通院・夜勤明けなどが出ず、逆に翌日早朝の予定が今日に出る。
- `SchedulePage.jsx:147` の範囲フィルタも同じ `Z` 付きで、表示範囲の境界日に同種のずれがある。
- **改善方向**: JST オフセットを含む ISO 文字列（または `getTime()` ベース）で境界を組み立てる。

### H-2. 買い物リストが未購入 10 件までしか表示されない
- **根拠**: `src/components/ShoppingItemList.jsx:21` — `.limit(10)`。11 件以上登録すると古いアイテムが**黙って非表示**になる（件数表示・ページングなし）。一方で `ShoppingPage.jsx:33-49` の未購入カウントは全件を数えるため、タブの並び順と表示内容が矛盾しうる。
- **影響範囲**: アプリの中核機能。まとめ買い前の家庭では 10 件は容易に超える。
- **改善方向**: limit 撤廃（家族規模なら全件で問題ない）か「もっと見る」導線＋残件数表示。

### H-3. 通信エラー時に「グループ未参加」と誤判定される
- **根拠**: `src/contexts/AuthContext.jsx:36-41` — `fetchFamilyMember` が `const { data } = ...` で **`error` を捨てている**（supabase-js は throw しないため `catch` にも入らない）。RLS 失敗・ネットワーク断で `familyMember = null` となり、参加済みユーザーに GroupSetup（グループ作成画面）が表示される。誤って新グループを作る危険がある。
- **改善方向**: `error` を見て「読み込みに失敗しました・再試行」状態を用意し、GroupSetup とは区別する。

### H-4. オフラインバナーの文言が実装と矛盾（無言のデータ消失）
- **根拠**: `src/components/OfflineBanner.jsx:30` —「変更はオンライン復帰後に同期されます」と表示するが、オフラインキューは存在しない。さらに多くの書き込みがエラーを無視するため（`InventoryPage.jsx:120-137` の `updateStatus`/`deleteItem`、`PricePage.jsx:173-202` の削除系、`SchedulePage.jsx:204-219`、`DishesPage.jsx:122-164` など）、オフライン中の操作は**成功したように見えて消える**。
- **改善方向**: 文言を「オフライン中の変更は保存されません」に正す＋書き込み失敗時は ShoppingPage のお気に入り（toast＋ロールバック）と同じパターンを全ページに展開する。

### H-5. 削除確認の統一に漏れ（確認なしの破壊的削除が残存）
- **根拠**（すべて共通 `ConfirmDialog` 不使用・即削除）:
  - `BudgetPage.jsx:227` 費目削除 × — **配下のエントリごと消える**のに確認なし。
  - `DishesPage.jsx:758` おかずカテゴリ削除 ×。
  - `TravelPage.jsx:341` 活動記録の削除 ×。
  - `PricePage.jsx:590` / `:742` 価格セルの削除 ×。
- また `PricePage.jsx:999-1011` はページ独自の `DeleteConfirmDialog` を実装しており、共通コンポーネント方針（docs/COMPONENTS）と二重化している。
- **改善方向**: 上記 4 箇所を `ConfirmDialog` 経由に統一。PricePage の独自実装は共通版へ置換。

### H-6. Places のサブカテゴリ絞り込みが「設定手段のない条件」になっている
- **根拠**: `src/pages/PlacesPage.jsx:402-416` にサブカテゴリチップ（焼肉・ラーメン等）の絞り込み UI があるが、`AddPlaceModal` / `EditPlaceModal` には subcategory 入力が存在せず、`handleAdd`/`handleEdit`（`:150-186`）も `subcategory` を書き込まない。**新規データは常に subcategory 無しのため、チップを選ぶと必ず 0 件**になる。
- **改善方向**: 追加・編集モーダルにサブカテゴリ選択を足すか、UI からチップを撤去して整合させる。

## Medium

### M-1. ハードコード色が広範に残存（トークン違反・ダークモード劣化）
- **根拠**: CLAUDE.md「Never hardcode colors — use var(--token)」に対し、
  - `InventoryPage.jsx:11-25, 53-61, 192-194, 359-363` — カテゴリ・状態・期限色が固定 hex（`#aaa`、`#999` 含む）。`cat.color + '22'` の透過背景はダーク面で沈む。
  - `SchedulePage.jsx:12-23` / `TodaySchedule.jsx:7-17` — `MEMBER_COLORS` と `SHIFT_COLORS`（`#3B82F6` 等 Tailwind 系で Akari と不調和）が**2 ファイルに重複定義**。
- **改善方向**: `index.css` にカテゴリ/シフト用トークン（ライト・ダーク両対応）を定義し、定数は 1 モジュールに集約。

### M-2. メンバー色の割り当てが不安定
- **根拠**: `SchedulePage.jsx:127-134` と `TodaySchedule.jsx:63-66` はどちらも `family_members` を **order 指定なし**で取得し、配列 index で色を割り当てる。取得順は保証されないため、ホームとカレンダー・セッション間で同じ人の色が変わりうる。
- **改善方向**: `joined_at`（FamilyInfo と同じ）等で順序を固定するか、member_id のハッシュで色を決める。

### M-3. PricePage だけ family_id フィルタがない
- **根拠**: `PricePage.jsx:95-112` の `fetchStores`/`fetchItems` に `.eq('family_id', ...)` がなく、`:119-128` の realtime 購読にも `filter` がない。RLS で守られてはいるが、CLAUDE.md「Still write explicit family_id filters in app code」に違反し、他ページとの一貫性も崩れている。
- **改善方向**: 他ページ同様に明示フィルタを追加。

### M-4. UTC 由来の日付ずれ（Critical と同族の軽度版）
- **根拠**: JST 朝 9 時前に 1 日前の日付になる `toISOString().slice(0, 10)`:
  - `InventoryPage.jsx:39-43` `addDays` — 賞味期限クイックボタン「今日」が昨日になる。
  - `PlacesPage.jsx:1056` — 訪問日のデフォルト。
- **改善方向**: `SchedulePage.jsx` の `toDateStr`（ローカル組み立て）を共通 util へ切り出して統一。

### M-5. 404 ルート・ErrorBoundary がない
- **根拠**: `App.jsx:21-88` にワイルドカードルートがなく、未知 URL（例: ホームカードにある `/memo`への直接アクセス）は**真っ白**。ErrorBoundary も未実装のため描画例外時も白画面。
- **改善方向**: `<Route path="*">` でホーム誘導ページを追加し、ルート直下に ErrorBoundary を 1 つ置く。

### M-6. theme-color / manifest がデザインシステムと三者不一致
- **根拠**: `index.html:8` `#7C3AED`、`vite.config.js:15` `#4f46e5`、Akari の `--primary` は `#7C71A8`（`index.css:20`）。ダークモード用 `theme-color`（media 指定）もなく、`background_color: #ffffff` のためダーク端末では起動時に白フラッシュ。
- **改善方向**: 3 箇所を `#7C71A8` に統一し、`<meta name="theme-color" media="(prefers-color-scheme: dark)">` を追加。

### M-7. 旅行作成が非アトミックで、失敗表示でも旅行が作成済みになる
- **根拠**: `TravelPage.jsx:100-130` — trip insert → schedule_events insert → trip update の 3 連続。2 手目以降の失敗で throw され「保存に失敗しました」と出るが**旅行自体は作成済み**。再試行すると重複する。あわせて `fetchTrips`（`:64-79`）は旅行数ぶんの activities クエリを発行する N+1。
- **改善方向**: RPC（Postgres function）で 1 トランザクション化、activities は `.in('trip_id', ids)` で 1 クエリに。

### M-8. 「作った！」「行った！」の記録が一方通行
- **根拠**: `DishesPage.jsx:133-139`（cooked_at 設定後は再レビュー導線なし・EditDishModal に評価/感想欄なし）、`PlacesPage.jsx:165-173`（visited を want に戻す・評価/レビューを直す UI なし）。誤タップや星の付け間違いを修正できない。
- **改善方向**: 編集モーダルに評価・レビュー・ステータス（未訪問へ戻す）を追加。

### M-9. 週表示のドラッグ移動がモバイルのスクロールと衝突
- **根拠**: `SchedulePage.jsx:779-798` — イベント上の `touchstart` で即 `preventDefault` してドラッグ開始（長押し判定なし）。イベントの多い週ではスクロールしようとして予定を掴んでしまい、H-4 の通り移動失敗時のエラー通知もない。またドロップ後に発火する `click` は `draggingRef` が既に null のため（`:723-727` → `:912`）、**移動直後に編集モーダルが開く**可能性がある。
- **改善方向**: 長押し（例: 300ms）でドラッグ開始に変更し、ドラッグ終了直後のクリックを 1 回抑制する。

### M-10. スケジュール変更履歴に「削除」が残らない
- **根拠**: `SchedulePage.jsx:216-219` — `handleDelete` は履歴 insert をしない（created/updated のみ）。家族の誰かが予定を消しても追跡できず、変更履歴機能の目的（誰が変えたか）を満たさない。
- **改善方向**: 削除前にスナップショットを `action: 'deleted'` で記録（イベント行削除で履歴も消える FK 設計なら、履歴テーブル側の保持方針も見直し）。

### M-11. 地図ビューのマーカーが再レンダーごとに全再生成
- **根拠**: `PlacesPage.jsx:1294-1329` — マーカー更新 effect の依存に `places`（親の `filtered`＝**毎レンダー新規配列**）が入っており、検索欄の 1 打鍵ごとに全ピンを破棄・再作成する。
- **改善方向**: 依存を place の id 列（`join(',')` した文字列等）にするか、`useMemo` で filtered を安定化。

## Low

### L-1. リストタブ内の削除「×」がボタン入れ子でキーボード操作不可
- `ShoppingPage.jsx:148-153` — `<button>` 内に `role="button"` の `<span>`。HTML 的に不正なインタラクティブ入れ子で、tabIndex/keydown がなくキーボードから削除できない。兄弟要素に分離するのが安全。

### L-2. 無効な招待 ID で英語の DB エラーがそのまま表示される
- `GroupSetup.jsx:7-14` は任意文字列を ID として `/join/<文字列>` へ遷移させ、`JoinPage.jsx:36` は `err.message`（例: `invalid input syntax for type uuid`）を直接表示。UUID 形式を事前検証して日本語メッセージに変換したい。

### L-3. 旅行カードの日付が生 ISO 表示
- `TravelPage.jsx:294` — `{trip.start_date} - {trip.end_date}`（`2026-07-18` 形式）。詳細モーダルは `dateRange()` で整形しており不統一。

### L-4. 予算の共通按分が端数を切り捨て、合計が合わない
- `BudgetPage.jsx:263, 291` — `Math.floor(sharedTotal / members.length)`。メンバー別合計の総和が月額合計より小さくなる（例: 1000 円 ÷ 3 人 → 999 円）。端数の帰属を決めて表示注記するのが良い。

### L-5. 在庫→買い物リスト追加ボタンのラベルと中身が不一致
- `InventoryPage.jsx:152-158, 270` — 対象には期限切れ・期限間近（7 日以内）も含まれるが、ボタンは「切れ・少ないを…」。モーダルを開くと ⚠️ セクションが現れて驚く。

### L-6. Push 通知の tag が固定で通知が上書きされる
- `public/sw-push.js:17` — `tag: 'shopping-reminder'` 固定 + `renotify`。将来の通知種別追加時に別内容が上書きされる。`data.tag ?? 'shopping-reminder'` にしておくと拡張が効く。

### L-7. ページタイトルが常に「家族プラットフォーム」
- `index.html:17` のみでページ別 `document.title` 更新がない。PWA のタスクスイッチャー・ブラウザ履歴で区別できない。

### L-8. Supabase 未設定時にプレースホルダで無言起動
- `src/lib/supabase.js:10-13` — env 欠落時 `console.warn` のみでプレースホルダ URL のクライアントを生成。全 API が謎の失敗をする。画面に設定エラーを表示する方が親切。

### L-9. Inventory のフォームラベルが入力と関連付けられていない
- `InventoryPage.jsx:446-520` — `<label className={styles.label}>品名 *</label>` が `htmlFor` なし・input を包んでもいない。スクリーンリーダーで項目名が読まれない。他ページ（label で input を包む方式）と方式もばらついている。

---

## 横断的な所見（根本原因の推測）

1. **UTC/JST の扱いに共通ユーティリティがない**こと（C-1, H-1, M-4）が最大のバグ源。`toDateStr` / `toLocalDatetimeStr` を `src/utils/date.js` に集約すべき。
2. **書き込みエラーの標準処理が未定義**（H-3, H-4）。ShoppingPage のお気に入り実装（optimistic → 失敗で toast＋ロールバック）が参照実装とされているのに、他ページへ展開されていない。docs/API.md にエラー処理規約を明文化する価値がある。
3. **共通化の徹底不足**（H-5, M-1, M-2）。ConfirmDialog・色定数・日付整形が各ページに重複し、統一施策の後にも漏れが残った。
