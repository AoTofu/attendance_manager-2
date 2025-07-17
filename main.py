import webview
import os
import sys
import threading
from flask import Flask, send_from_directory
from api import Api
from database import initialize_database

# pywebviewが使用するGUIライブラリを明示的に指定する
# これにより、macOSでの安定性が向上する場合がある
webview.gui = 'qt'

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