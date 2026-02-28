# Yahoo商品リスト 標準項目定義（29項目）

確認日: 2026-02-28  
参照: https://ads-help.yahoo-net.jp/s/article/H000045740?language=ja

## 1. 項目一覧（標準順）

| No | Header Name | 項目名（日本語） | 設定 |
|---:|---|---|---|
| 1 | Item ID | 商品ID | 必須 |
| 2 | Item Name | 商品名 | 必須 |
| 3 | Description | 商品説明 | 必須 |
| 4 | Tracking URL | トラッキングURL | 任意 |
| 5 | Landing Page URL | 最終リンク先URL | 必須 |
| 6 | Smartphone Landing Page URL | スマートフォン向けURL | 任意 |
| 7 | Image URL | 商品画像URL | 任意 |
| 8 | Category ID | カテゴリーID | 任意 |
| 9 | Availability | 在庫状況 | 任意 |
| 10 | Capacity | 在庫数 | 任意 |
| 11 | Price | 価格 | 任意 |
| 12 | Sale Price | セール価格 | 任意 |
| 13 | Formatted Price | 任意文字列の価格 | 任意 |
| 14 | Formatted Sale Price | 任意文字列のセール価格 | 任意 |
| 15 | Rating | 評価 | 任意 |
| 16 | Reviews | 評価件数 | 任意 |
| 17 | Badge | バッヂ種別 | 任意 |
| 18 | Display Settings | 配信設定 | 任意 |
| 19 | Availability Date | 入荷予定日 | 任意 |
| 20 | GTIN | JANコード | 任意 |
| 21 | MPN | 製品番号 | 任意 |
| 22 | Brand | ブランド | 任意 |
| 23 | Product Type | 商品のカテゴリ | 任意 |
| 24 | Google Product Category | Googleの商品カテゴリ | 任意 |
| 25 | Age Group | 年齢層 | 任意 |
| 26 | Gender Group | 性別 | 任意 |
| 27 | Location | 地域 | 任意 |
| 28 | Sales Rank | 売上順位 | 任意 |
| 29 | Delete | 削除 | 任意（差分更新専用） |

## 2. 実装時の必須ルール

- ヘッダー名は正規名称を使用すること（スペル違い不可）。
- 1行目にヘッダー、2行目以降に商品データを配置すること。
- 値がない項目でも、ヘッダー列自体は削除しないこと。
- 同一ファイル内で `Item ID` の重複を禁止すること。
- `Delete` は差分更新専用。全件更新用ファイルには含めないこと。
- 初版（v1）は全件更新専用のため、`Delete` 列は出力時に除外すること。

## 3. 関連ルール（抜粋）

- 価格表示優先順位: `Formatted Sale Price` > `Sale Price` > `Formatted Price` > `Price`
- URL項目は文字数上限（1024）およびURL形式制約に従うこと。
- 画像を差し替える場合は `Image URL` 文字列自体を変更すること（同URL差し替え不可）。
