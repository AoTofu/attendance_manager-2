import sqlite3
import os
from werkzeug.security import generate_password_hash

DB_FILE = 'database.db'

def get_db_connection():
    """データベース接続を取得する"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row # カラム名でアクセスできるようにする
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
            FOREIGN KEY (employee_id) REFERENCES employees (id)
        )
    ''')

    # ▼▼▼ 追加 ▼▼▼
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
    # ▲▲▲ 追加 ▲▲▲
    
    print("テーブルの準備ができました。")
    conn.commit()
    conn.close()

def initialize_database():
    """データベースの初期化プロセス"""
    if not os.path.exists(DB_FILE):
        print(f"{DB_FILE} が見つかりません。新規作成します。")
        create_tables()
        # --- 初回管理者ユーザーの作成 ---
        create_initial_admin()
    else:
        # 既存DBの場合でもテーブルの存在確認は毎回行う
        create_tables()
        print(f"{DB_FILE} は既に存在します。")


def create_initial_admin():
    """アプリケーション初回起動時に管理者ユーザーを作成する"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 管理者が一人もいない場合のみ作成する
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