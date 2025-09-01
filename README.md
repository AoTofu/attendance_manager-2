従業員の管理ができる簡単なwebアプリ

main.pyを実行してください。

初回の管理者ユーザーは `admin` です。パスワードは初回起動時にランダム生成され、ユーザーデータディレクトリの `initial_admin_password.txt` に出力されます。

品質はお察し()

<img width="994" height="748" alt="スクリーンショット 2025-07-17 11 43 28" src="https://github.com/user-attachments/assets/efd8d185-6d3b-4bc6-89e1-10fe5245687a" />

---

変更点（セキュリティ/運用 改善）

- 初回起動時の管理者パスワードはランダム自動生成になりました。
  - 生成後、ユーザーデータディレクトリ内に `initial_admin_password.txt` として一度だけ保存されます。
  - データディレクトリはOS毎に `appdirs` の規約に従います（例: macOS `~/Library/Application Support/AttendanceManager/`）。
- DBにインデックスを追加し、イベント/勤怠の検索性能を改善しました。
- 勤怠イベントのサーバー側バリデーションを追加（出勤→休憩→復帰→退勤の遷移チェック）。
- 従業員一覧の描画で、`innerHTML` による文字列連結をやめ、XSS耐性を向上しました。
- `WEBVIEW_GUI` 環境変数で pywebview のGUIバックエンドを選択可能になりました（未指定なら自動）。
- `requirements.txt` を整備しました。

起動方法（例）

1. Python仮想環境を作成し、依存をインストール
   - `python -m venv .venv && source .venv/bin/activate`
   - `pip install -r requirements.txt`
2. 起動
   - `python main.py`
3. 初回のみ、ユーザーデータディレクトリに出力された `initial_admin_password.txt` を確認してログインしてください（ユーザー名: `admin`）。

既存DBでファイルが無い場合（再発行）

- 既に作成済みのDBがある環境では、初回ファイルは生成されません。
- 管理者パスワードを再発行してファイルを作る場合は、環境変数を付けて起動してください。
  - macOS/Linux: `RESET_ADMIN_PASSWORD=1 python main.py`
  - Windows(PowerShell): `$env:RESET_ADMIN_PASSWORD=1; python main.py`
  - 実行後、ユーザーデータディレクトリに `initial_admin_password.txt` が作成されます。

開発中にカレントディレクトリへ出力したい場合

- 環境変数 `ADMIN_PASSWORD_OUT_DIR` に書き出し先ディレクトリを指定できます。
  - 例: `ADMIN_PASSWORD_OUT_DIR=. python main.py`
