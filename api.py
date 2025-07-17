import sqlite3
import datetime
import itertools
from werkzeug.security import check_password_hash, generate_password_hash
from database import get_db_connection

class Api:
    def __init__(self):
        self.current_user = None

    def login(self, name, password):
        print(f"ログイン試行: name={name}")
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM employees WHERE name = ?', (name,)).fetchone()
        conn.close()

        if user and check_password_hash(user['password'], password):
            self.current_user = {
                'id': user['id'],
                'name': user['name'],
                'is_admin': bool(user['is_admin'])
            }
            print(f"ログイン成功: {self.current_user}")
            return { 'success': True, 'user': self.current_user }
        else:
            print("ログイン失敗: ユーザー名またはパスワードが違います。")
            return { 'success': False, 'message': 'ユーザー名またはパスワードが正しくありません。' }

    def logout(self):
        print(f"ログアウト実行: user={self.current_user}")
        self.current_user = None
        return {'success': True, 'message': 'ログアウトしました。'}

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
            print(f"イベント取得エラー: {e}")
            return {'success': False, 'message': 'イベントの取得に失敗しました。'}

    def add_event(self, title, description, start_datetime, end_datetime, is_allday):
        if not self.current_user or not self.current_user['is_admin']:
            return {'success': False, 'message': '権限がありません。'}
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
            print(f"イベント追加エラー: {e}")
            return {'success': False, 'message': 'イベントの追加に失敗しました。'}

    def update_event(self, event_id, title, description, start_datetime, end_datetime, is_allday):
        if not self.current_user or not self.current_user["is_admin"]:
            return {"success": False, "message": "権限がありません。"}
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
            print(f"イベント更新エラー: {e}")
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
            print(f"イベント削除エラー: {e}")
            return {"success": False, "message": "イベントの削除に失敗しました。"}

    def record_attendance(self, event_type):
        if not self.current_user:
            return {'success': False, 'message': 'ログインしていません。'}
        employee_id = self.current_user['id']
        try:
            conn = get_db_connection()
            conn.execute("INSERT INTO attendance_records (employee_id, event_type) VALUES (?, ?)", (employee_id, event_type))
            conn.commit()
            conn.close()
            return {'success': True}
        except Exception as e:
            print(f"勤怠記録エラー: {e}")
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
            print(f"従業員追加エラー: {e}")
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
            print(f"従業員削除エラー: {e}")
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