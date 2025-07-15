import webview
import os
from api import Api
from database import initialize_database

window = None

def get_frontend_path(filename):
    dir_path = os.path.dirname(os.path.realpath(__file__))
    return os.path.join(dir_path, 'frontend', filename)

if __name__ == '__main__':
    initialize_database()

    # Apiクラスの初期化（引数なし）
    api = Api()

    window = webview.create_window(
        '従業員勤務管理アプリ',
        url=get_frontend_path('index.html'),
        js_api=api,
        width=1000,
        height=750,
        resizable=True
    )

    webview.start(debug=True)