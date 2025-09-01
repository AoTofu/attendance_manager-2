import sqlite3
import os
import secrets
import string
import stat
import logging
from typing import Optional
from werkzeug.security import generate_password_hash
from appdirs import user_data_dir # appdirsをインポート

# アプリケーション名と開発者名を定義
APP_NAME = "AttendanceManager"
APP_AUTHOR = "YourAppName" # 任意の名前でOK

# appdirsを使って、OSに最適なデータ保存場所を取得
data_dir = user_data_dir(APP_NAME, APP_AUTHOR)

# フォルダが存在しない場合は作成
os.makedirs(data_dir, exist_ok=True)

logger = logging.getLogger(__name__)

# データベースファイルのフルパスを決定
DB_FILE = os.path.join(data_dir, 'database.db')
logger.debug(f"DB path: {DB_FILE}")


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
    # 永続化されるWALモードの有効化（既に設定済みでも冪等）
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
    except Exception:
        pass

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
            event_type TEXT NOT NULL CHECK (event_type IN ('clock_in','clock_out','start_break','end_break')),
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
    # パフォーマンス向上のためのインデックス
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_employee_time ON attendance_records(employee_id, timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_datetime)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_end ON events(end_datetime)")
    
    logger.info("Database tables are ready.")
    conn.commit()
    conn.close()

def initialize_database():
    """データベースの初期化プロセス"""
    if not os.path.exists(DB_FILE):
        logger.info(f"Database not found. Creating new DB at {DB_FILE}.")
        create_tables()
        create_initial_admin()
    else:
        # 既存DBの場合でもテーブルの存在確認は毎回行う
        create_tables()
        logger.info("Database already exists.")
        # 明示的に環境変数が設定されている場合、管理者パスワードを再発行
        if os.getenv('RESET_ADMIN_PASSWORD') == '1':
            reset_admin_password(write_file=True)


def _generate_random_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def _write_password_file(username: str, plain_password: str) -> Optional[str]:
    """初期/再発行パスワードを安全にファイルへ書き出す。

    環境変数 `ADMIN_PASSWORD_OUT_DIR` が指定されていればそのディレクトリ、
    未指定ならユーザーデータディレクトリ（data_dir）に書き出す。
    戻り値: 作成したファイルパス（失敗時は None）
    """
    out_dir = os.getenv('ADMIN_PASSWORD_OUT_DIR', data_dir)
    try:
        os.makedirs(out_dir, exist_ok=True)
        pw_file = os.path.join(out_dir, 'initial_admin_password.txt')
        fd = os.open(pw_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(f"username: {username}\npassword: {plain_password}\n")
        try:
            os.chmod(pw_file, stat.S_IRUSR | stat.S_IWUSR)
        except Exception:
            pass
        logger.warning(f"Admin password written to: {pw_file}")
        return pw_file
    except Exception as e:
        logger.error(f"Failed to write password file: {e}")
        return None


def create_initial_admin():
    """アプリケーション初回起動時に管理者ユーザーを作成する"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM employees WHERE is_admin = 1")
    if cursor.fetchone() is None:
        logger.warning("No admin user found. Generating initial admin user.")
        # ランダム初期パスワードを生成し、初回のみ安全に保存する
        plain_password = _generate_random_password()
        hashed_password = generate_password_hash(plain_password, method='pbkdf2:sha256')

        cursor.execute(
            "INSERT INTO employees (name, password, is_admin) VALUES (?, ?, ?)",
            ('admin', hashed_password, 1)
        )
        conn.commit()
        # 初期パスワードをファイルに出力（ユーザーのみ読み取り可）
        _write_password_file('admin', plain_password)
    
    conn.close()


def reset_admin_password(write_file: bool = True) -> Optional[str]:
    """管理者パスワードをランダムに再発行し、必要に応じてファイルに出力する。

    戻り値: パスワードを書き出したファイルパス（書き出し無し/失敗時は None）
    """
    conn = get_db_connection()
    cur = conn.cursor()
    # まず 'admin' ユーザーを優先して取得、いなければ最初の管理者
    cur.execute("SELECT id, name FROM employees WHERE name = 'admin' AND is_admin = 1 LIMIT 1")
    row = cur.fetchone()
    if row is None:
        cur.execute("SELECT id, name FROM employees WHERE is_admin = 1 ORDER BY id LIMIT 1")
        row = cur.fetchone()

    if row is None:
        logger.warning("No admin user present. Creating initial admin instead of reset.")
        conn.close()
        create_initial_admin()
        return None

    user_id = row[0]
    username = row[1] if not isinstance(row, sqlite3.Row) else row['name']
    plain_password = _generate_random_password()
    hashed_password = generate_password_hash(plain_password, method='pbkdf2:sha256')
    cur.execute("UPDATE employees SET password = ? WHERE id = ?", (hashed_password, user_id))
    conn.commit()
    conn.close()

    if not write_file:
        return None
    return _write_password_file(username, plain_password)
