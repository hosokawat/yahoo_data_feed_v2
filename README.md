# Yahoo Data Feed v2

Google Spreadsheet からコピーした商品データを、Electron アプリ上で編集し、Yahoo 広告向け TSV を生成するデスクトップアプリです。

## 現在の実装範囲（v1）

- スプレッドシート風 UI での編集
- 1行目マッピング（初期は必須4項目のみ。必要な列は追加）
  - 必須項目は `*`、Yahoo仕様の項番付きで表示（例: `1. Item ID *`）
  - 重複選択不可
- Google Spreadsheet からの貼り付け（タブ区切りデータ）
- キーボード移動（Enter/矢印キー）
- Error一覧クリックで該当セルへフォーカス＋スクロール
- 入力チェックボタン（出力前に手動バリデーション実行）
- バリデーション（必須項目、重複、URL簡易チェックなど）
- 出力タブ
  - ローカル出力（`TSV / UTF-8 / LF` 固定）
  - SFTPアップロード（手動実行）
- 出力ファイル名の命名規則
  - `yahoo_feed_{YYYYMMDD}_{HHmmss}_{recordCount}rows.tsv`
- 同名ファイル衝突時の自動連番付与（`_v2`, `_v3`, ...）
- 「データ出力機能」「Yahoo参考資料」の折りたたみUI
- 冒頭説明メッセージの閉じる（`×`）

## v1 の運用方針

- 全件更新専用
- Yahoo 管理画面へのアップロードは手動運用
- `Delete` 列は差分更新専用のため、v1 の出力対象外
- URL バリデーションは実務向けの簡易チェック
  - `http://` or `https://` で開始
  - 空白を含まない
  - 先頭 `.` 禁止
  - 1024文字以内

## 技術スタック

- Electron
- TypeScript
- React
- Tailwind CSS
- Vite

## セットアップ

```bash
npm install
```

## 開発コマンド

```bash
# 開発起動（Renderer + Electron）
npm run dev

# 型チェック
npm run typecheck

# 本番ビルド（Renderer + Electron main/preload）
npm run build
```

## 使い方（v1）

1. アプリを起動する
2. 必要に応じて「列を1追加」で列を増やし、1行目マッピングを調整する（初期は必須4項目）
3. 2行目以降のセルに Google Spreadsheet からコピーした表データを貼り付ける
4. 必要に応じて「入力チェック」を実行し、Error/Warning を確認する
5. 出力タブを選ぶ
6. ローカル出力の場合: 「出力先フォルダを選択」→「TSVを出力」
7. SFTPアップロードの場合: 接続情報を入力して「SFTPアップロード」
8. Yahoo 管理画面で手動アップロードする（v1運用）

## バリデーション概要

Error（出力中断）:

- 必須ヘッダー不足
- 不正ヘッダー/重複ヘッダー
- 必須項目空欄
- `Item ID` 重複
- URL長超過
- URL簡易チェック不合格
- 行数上限超過（300,000件）

Warning（出力継続）:

- 150MB 超過見込み
- 未使用列あり
- 価格項目の混在（`Price/Sale Price` と `Formatted*`）
- `Delete` 列は v1 で除外

詳細は [`docs/validation_rules.md`](./docs/validation_rules.md) を参照してください。

## 主要ディレクトリ

```txt
.
├─ electron/                # Electron main/preload
│  ├─ main.ts
│  └─ preload.cts
├─ src/                     # React アプリ本体
│  ├─ App.tsx
│  ├─ yahooFields.ts        # 29項目・必須項目・URL項目
│  ├─ main.tsx
│  └─ global.d.ts
├─ docs/                    # 要件・仕様ドキュメント
├─ vite.config.ts
└─ package.json
```

## 改修時にまず見るファイル

- UI/バリデーション/出力ロジック: `src/App.tsx`
- フィールド定義: `src/yahooFields.ts`
- ファイル保存ロジック: `electron/main.ts`
- Renderer <-> Main API: `electron/preload.cts`, `src/global.d.ts`
- 仕様ドキュメント入口: [`docs/docs_index.md`](./docs/docs_index.md)

## 今後の拡張候補

- 差分更新モード（`Delete=1` を含む差分ファイル生成）
- SFTP公開鍵認証対応
- SFTP/FTP 定期更新（スケジュール実行）
- URL の厳密 RFC3986 バリデーション
- 大量データ時の仮想スクロール最適化
- インポート/エクスポート履歴管理

## 仕様ドキュメント

- 要件定義: [`docs/requirements.md`](./docs/requirements.md)
- Yahoo 外部仕様サマリー: [`docs/yahoo_external_constraints.md`](./docs/yahoo_external_constraints.md)
- Yahoo 29項目定義: [`docs/yahoo_feed_fields.md`](./docs/yahoo_feed_fields.md)
- バリデーション仕様: [`docs/validation_rules.md`](./docs/validation_rules.md)

## 設定保存

- 保存先: Electron `userData` 配下の `settings.json`
  - Windows 例: `C:\Users\<ユーザー>\AppData\Roaming\<アプリ名>\settings.json`
- 保存対象:
  - 最終出力フォルダ (`outputFolderPath`)
  - 1行目ヘッダー列構成 (`headers`)
  - UI状態 (`ui`)
    - 冒頭説明メッセージ表示 (`showIntroMessage`)
    - データ出力機能パネル開閉 (`isOutputPanelOpen`)
    - Yahoo参考資料パネル開閉 (`isReferencePanelOpen`)
  - SFTP設定 (`sftp`)
    - `host`, `port`, `username`, `remoteDirectory`, `savePassword`
    - `password` は `savePassword=true` のときのみ保存
  - ウィンドウ位置/サイズ (`windowBounds`)
