import sqlite3
import os
from werkzeug.security import generate_password_hash
from appdirs import user_data_dir # appdirsをインポート

# アプリケーション名と開発者名を定義
APP_NAME = "AttendanceManager"
APP_AUTHOR = "YourAppName" # 任意の名前でOK

# appdirsを使って、OSに最適なデータ保存場所を取得
data_dir = user_data_dir(APP_NAME, APP_AUTHOR)

# フォルダが存在しない場合は作成
os.makedirs(data_dir, exist_ok=True)

# データベースファイルのフルパスを決定
DB_FILE = os.path.join(data_dir, 'database.db')
print(f"データベースの場所: {DB_FILE}") # デバッグ用にパスを表示


def get_db_connection():
    """データベース接続を取得する"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def create_tables():
    """テーブルが存在しない場合にテーブルを作成する"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # employeesテーブル
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            hourly_wage REAL DEFAULT 0,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # attendance_recordsテーブル
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
        )
    ''')

    # eventsテーブル
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            start_datetime TEXT NOT NULL,
            end_datetime TEXT NOT NULL,
            is_allday INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    print("テーブルの準備ができました。")
    conn.commit()
    conn.close()

def initialize_database():
    """データベースの初期化プロセス"""
    if not os.path.exists(DB_FILE):
        print(f"{DB_FILE} が見つかりません。新規作成します。")
        create_tables()
        create_initial_admin()
    else:
        # 既存DBの場合でもテーブルの存在確認は毎回行う
        create_tables()
        print(f"{DB_FILE} は既に存在します。")


def create_initial_admin():
    """アプリケーション初回起動時に管理者ユーザーを作成する"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM employees WHERE is_admin = 1")
    if cursor.fetchone() is None:
        print("管理者ユーザーが存在しないため、初期管理者を作成します。")
        hashed_password = generate_password_hash('admin_password', method='pbkdf2:sha256')
        
        cursor.execute(
            "INSERT INTO employees (name, password, is_admin) VALUES (?, ?, ?)",
            ('admin', hashed_password, 1)
        )
        conn.commit()
        print("初期管理者 'admin' を作成しました。初期パスワード: admin_password")
    
    conn.close()