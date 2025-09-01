import sqlite3
import datetime
import itertools
import logging
import os
from werkzeug.security import check_password_hash, generate_password_hash
from database import get_db_connection

logger = logging.getLogger(__name__)


class Api:
    def __init__(self):
        self.current_user = None

    def login(self, name, password):
        logger.info(f"Login attempt: name={name}")
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM employees WHERE name = ?', (name,)).fetchone()
        conn.close()

        if user and check_password_hash(user['password'], password):
            self.current_user = {
                'id': user['id'],
                'name': user['name'],
                'is_admin': bool(user['is_admin'])
            }
            logger.info(f"Login success: {self.current_user}")
            return { 'success': True, 'user': self.current_user }
        else:
            logger.warning("Login failed: invalid credentials")
            return { 'success': False, 'message': 'ユーザー名またはパスワードが正しくありません。' }

    def logout(self):
        logger.info(f"Logout: user={self.current_user}")
        self.current_user = None
        return {'success': True, 'message': 'ログアウトしました。'}

    def get_settings(self):
        """フロントエンド向けの設定値を返す"""
        try:
            timeout_sec = int(os.getenv('INACTIVITY_TIMEOUT_SECONDS', '900'))  # 既定15分
        except ValueError:
            timeout_sec = 900
        return {
            'success': True,
            'settings': {
                'inactivity_timeout_seconds': timeout_sec
            }
        }

    def get_events(self, start_date_str, end_date_str):
        """指定された期間内のイベントを取得する（認証不要）"""
        try:
            conn = get_db_connection()
            records = conn.execute(
                "SELECT * FROM events WHERE start_datetime < ? AND end_datetime > ? ORDER BY start_datetime",
                (end_date_str, start_date_str)
            ).fetchall()
            conn.close()
            events = [dict(row) for row in records]
            return {'success': True, 'events': events}
        except Exception as e:
            logger.exception(f"Failed to get events: {e}")
            return {'success': False, 'message': 'イベントの取得に失敗しました。'}

    def add_event(self, title, description, start_datetime, end_datetime, is_allday):
        if not self.current_user or not self.current_user['is_admin']:
            return {'success': False, 'message': '権限がありません。'}
        try:
            start_dt = datetime.datetime.strptime(start_datetime, '%Y-%m-%d %H:%M:%S')
            end_dt = datetime.datetime.strptime(end_datetime, '%Y-%m-%d %H:%M:%S')
            if end_dt <= start_dt:
                return {'success': False, 'message': '終了日時は開始日時より後にしてください。'}
        except Exception:
            return {'success': False, 'message': '日時の形式が不正です。'}
        try:
            conn = get_db_connection()
            conn.execute(
                "INSERT INTO events (title, description, start_datetime, end_datetime, is_allday) VALUES (?, ?, ?, ?, ?)",
                (title, description, start_datetime, end_datetime, 1 if is_allday else 0)
            )
            conn.commit()
            conn.close()
            return {'success': True}
        except Exception as e:
            logger.exception(f"Failed to add event: {e}")
            return {'success': False, 'message': 'イベントの追加に失敗しました。'}

    def update_event(self, event_id, title, description, start_datetime, end_datetime, is_allday):
        if not self.current_user or not self.current_user["is_admin"]:
            return {"success": False, "message": "権限がありません。"}
        try:
            start_dt = datetime.datetime.strptime(start_datetime, '%Y-%m-%d %H:%M:%S')
            end_dt = datetime.datetime.strptime(end_datetime, '%Y-%m-%d %H:%M:%S')
            if end_dt <= start_dt:
                return {'success': False, 'message': '終了日時は開始日時より後にしてください。'}
        except Exception:
            return {'success': False, 'message': '日時の形式が不正です。'}
        try:
            conn = get_db_connection()
            conn.execute(
                "UPDATE events SET title=?, description=?, start_datetime=?, end_datetime=?, is_allday=? WHERE id=?",
                (title, description, start_datetime, end_datetime, 1 if is_allday else 0, event_id)
            )
            conn.commit()
            conn.close()
            return {"success": True}
        except Exception as e:
            logger.exception(f"Failed to update event: {e}")
            return {"success": False, "message": "イベントの更新に失敗しました。"}

    def delete_event(self, event_id):
        if not self.current_user or not self.current_user["is_admin"]:
            return {"success": False, "message": "権限がありません。"}
        try:
            conn = get_db_connection()
            conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
            conn.commit()
            conn.close()
            return {"success": True}
        except Exception as e:
            logger.exception(f"Failed to delete event: {e}")
            return {"success": False, "message": "イベントの削除に失敗しました。"}

    def record_attendance(self, event_type):
        if not self.current_user:
            return {'success': False, 'message': 'ログインしていません。'}
        if event_type not in ('clock_in','clock_out','start_break','end_break'):
            return {'success': False, 'message': '不正なイベント種別です。'}

        employee_id = self.current_user['id']
        try:
            conn = get_db_connection()
            last = conn.execute(
                "SELECT event_type FROM attendance_records WHERE employee_id = ? ORDER BY timestamp DESC LIMIT 1",
                (employee_id,)
            ).fetchone()

            last_type = last['event_type'] if last else None
            allowed_next = set()
            if last_type is None or last_type == 'clock_out':
                allowed_next = {'clock_in'}
            elif last_type in ('clock_in', 'end_break'):
                allowed_next = {'start_break', 'clock_out'}
            elif last_type == 'start_break':
                allowed_next = {'end_break'}

            if event_type not in allowed_next:
                conn.close()
                return {'success': False, 'message': '現在の状態ではその操作はできません。'}

            conn.execute("INSERT INTO attendance_records (employee_id, event_type) VALUES (?, ?)", (employee_id, event_type))
            conn.commit()
            conn.close()
            return {'success': True}
        except Exception as e:
            logger.exception(f"Failed to record attendance: {e}")
            return {'success': False, 'message': 'データベースエラーが発生しました。'}

    def get_user_status(self):
        if not self.current_user:
            return {'status': 'logged_out'}
        employee_id = self.current_user['id']
        conn = get_db_connection()
        record = conn.execute("SELECT event_type FROM attendance_records WHERE employee_id = ? ORDER BY timestamp DESC LIMIT 1", (employee_id,)).fetchone()
        conn.close()
        return {'status': record['event_type']} if record else {'status': 'none'}

    def get_all_employees(self):
        if not self.current_user or not self.current_user['is_admin']:
            return {'success': False, 'message': '権限がありません。'}
        conn = get_db_connection()
        employees = conn.execute("SELECT id, name, hourly_wage, is_admin FROM employees ORDER BY id").fetchall()
        conn.close()
        employees_list = [dict(row) for row in employees]
        return {'success': True, 'employees': employees_list}

    def change_password(self, current_password, new_password):
        """ログイン中ユーザー自身のパスワード変更"""
        if not self.current_user:
            return {'success': False, 'message': 'ログインしていません。'}
        if not new_password or len(new_password) < 8:
            return {'success': False, 'message': '新しいパスワードは8文字以上にしてください。'}

        user_id = self.current_user['id']
        try:
            conn = get_db_connection()
            row = conn.execute('SELECT password FROM employees WHERE id = ?', (user_id,)).fetchone()
            if not row or not check_password_hash(row['password'], current_password):
                conn.close()
                return {'success': False, 'message': '現在のパスワードが正しくありません。'}
            hashed = generate_password_hash(new_password, method='pbkdf2:sha256')
            conn.execute('UPDATE employees SET password = ? WHERE id = ?', (hashed, user_id))
            conn.commit()
            conn.close()
            return {'success': True, 'message': 'パスワードを変更しました。'}
        except Exception as e:
            logger.exception(f"Failed to change password: {e}")
            return {'success': False, 'message': 'パスワード変更に失敗しました。'}

    def add_employee(self, name, password, hourly_wage, is_admin):
        if not self.current_user or not self.current_user['is_admin']:
            return {'success': False, 'message': '権限がありません。'}
        if not name or not password:
            return {'success': False, 'message': '名前とパスワードは必須です。'}
        try:
            hashed_password = generate_password_hash(password, method='pbkdf2:sha256')
            conn = get_db_connection()
            conn.execute("INSERT INTO employees (name, password, hourly_wage, is_admin) VALUES (?, ?, ?, ?)", (name, hashed_password, float(hourly_wage), 1 if is_admin else 0))
            conn.commit()
            conn.close()
            return {'success': True}
        except sqlite3.IntegrityError:
            return {'success': False, 'message': f'従業員名 "{name}" は既に使用されています。'}
        except Exception as e:
            logger.exception(f"Failed to add employee: {e}")
            return {'success': False, 'message': 'データベースエラーが発生しました。'}
    
    def delete_employee(self, employee_id):
        """従業員を削除する（管理者のみ）"""
        if not self.current_user or not self.current_user['is_admin']:
            return {'success': False, 'message': '権限がありません。'}
        
        if self.current_user['id'] == int(employee_id):
            return {'success': False, 'message': 'ログイン中の自分自身を削除することはできません。'}

        try:
            conn = get_db_connection()
            conn.execute("DELETE FROM employees WHERE id = ?", (employee_id,))
            conn.commit()
            conn.close()
            return {'success': True}
        except Exception as e:
            logger.exception(f"Failed to delete employee: {e}")
            return {'success': False, 'message': '従業員の削除中にエラーが発生しました。'}
            
    def get_attendance_summary(self, employee_id, start_date_str, end_date_str):
        if not self.current_user or not self.current_user['is_admin']:
            return {'success': False, 'message': '権限がありません。'}
        try:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d') + datetime.timedelta(days=1)

            conn = get_db_connection()
            employee = conn.execute("SELECT hourly_wage FROM employees WHERE id = ?", (employee_id,)).fetchone()
            if not employee:
                conn.close()
                return {'success': False, 'message': '従業員が見つかりません。'}
            hourly_wage = employee['hourly_wage'] if employee['hourly_wage'] is not None else 0

            records = conn.execute(
                "SELECT event_type, timestamp FROM attendance_records WHERE employee_id = ? AND timestamp BETWEEN ? AND ? ORDER BY timestamp",
                (employee_id, start_date, end_date)
            ).fetchall()
            conn.close()

            daily_work_hours = {}
            for date_obj, group in itertools.groupby(records, key=lambda r: datetime.datetime.strptime(r['timestamp'], '%Y-%m-%d %H:%M:%S').date()):
                day_str = date_obj.strftime('%Y-%m-%d')
                total_work_seconds = 0
                last_start_time = None
                for record in group:
                    event_type = record['event_type']
                    timestamp = datetime.datetime.strptime(record['timestamp'], '%Y-%m-%d %H:%M:%S')

                    if event_type in ('clock_in', 'end_break'):
                        last_start_time = timestamp
                    elif event_type in ('clock_out', 'start_break') and last_start_time:
                        duration = timestamp - last_start_time
                        total_work_seconds += duration.total_seconds()
                        last_start_time = None
                
                daily_work_hours[day_str] = total_work_seconds / 3600

            labels = []
            current_date = start_date.date()
            while current_date < end_date.date():
                labels.append(current_date.strftime('%Y-%m-%d'))
                current_date += datetime.timedelta(days=1)

            data = [daily_work_hours.get(label, 0) for label in labels]
            total_hours = sum(data)
            total_wage = total_hours * hourly_wage

            return {
                'success': True,
                'labels': labels,
                'data': data,
                'summary': { 'total_hours': round(total_hours, 2), 'total_wage': round(total_wage), 'hourly_wage': hourly_wage }
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {'success': False, 'message': f'データ集計中にエラーが発生しました: {e}'}
