import webview
import os
import sys
import threading
import logging
from logging.handlers import RotatingFileHandler
from flask import Flask, send_from_directory
from api import Api
from database import initialize_database, data_dir

# pywebview の GUI バックエンドは環境により異なるため、
# 明示指定が必要な場合のみ環境変数で指定可能にする（例: WEBVIEW_GUI=qt）
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO').upper(),
    format='[%(asctime)s] %(levelname)s %(name)s: %(message)s'
)

# ファイルロガー（ローテーション）を追加
try:
    os.makedirs(os.path.join(data_dir, 'logs'), exist_ok=True)
    file_handler = RotatingFileHandler(os.path.join(data_dir, 'logs', 'app.log'), maxBytes=2_000_000, backupCount=3)
    file_handler.setLevel(os.getenv('FILE_LOG_LEVEL', 'INFO').upper())
    file_handler.setFormatter(logging.Formatter('[%(asctime)s] %(levelname)s %(name)s: %(message)s'))
    logging.getLogger().addHandler(file_handler)
except Exception:
    logging.getLogger(__name__).warning('Failed to initialize file logger')

gui_backend = os.getenv('WEBVIEW_GUI')
if gui_backend:
    webview.gui = gui_backend

def resolve_path(path):
    """
    実行ファイル（バンドル）と開発環境の両方で、
    アセットへの正しいパスを解決します。
    """
    if getattr(sys, 'frozen', False):
        # PyInstallerでバンドルされたアプリの場合
        base_path = sys._MEIPASS
    else:
        # 通常のスクリプトとして実行した場合
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, path)

# --- Flaskサーバーの設定 ---
# frontendフォルダへの絶対パスを解決
frontend_dir = resolve_path('frontend')
# Flaskに静的フォルダの場所を絶対パスで指定する
server = Flask(__name__, static_folder=frontend_dir)

@server.route('/')
def index():
    # index.htmlを提供する
    return send_from_directory(frontend_dir, 'index.html')

@server.route('/<path:path>')
def static_files(path):
    # cssやjsファイルを提供する
    return send_from_directory(frontend_dir, path)

def run_server():
    # ポートは任意
    server.run(host='127.0.0.1', port=5000)

# --- メインの処理 ---
if __name__ == '__main__':
    initialize_database()

    api = Api()

    # Flaskサーバーを別のスレッドで起動
    t = threading.Thread(target=run_server)
    t.daemon = True
    t.start()

    # ウィンドウを作成し、FlaskサーバーのURLを指定
    window = webview.create_window(
        '従業員勤務管理アプリ',
        'http://127.0.0.1:5000', # FlaskサーバーのURL
        js_api=api,
        width=1000,
        height=750,
        resizable=True
    )

    webview.start(debug=True)
