let currentUser = null;
let timeInterval = null;
let attendanceChart = null;

let isMainViewInitialized = false;
let isAdminViewInitialized = false;

let views = {};

// ▼▼▼ ログイン画面用クロック＆カレンダーの変数を追加 ▼▼▼
let loginClockInterval = null;
let currentCalendarDate = new Date();
// ▲▲▲ 変数を追加 ▲▲▲

let inactivityTimer = null;

function performAutoLogout() {
    console.log("30秒間操作がなかったため、自動ログアウトします。");
    clearTimeout(inactivityTimer);
    window.pywebview.api.logout().then(() => {
        showView('login');
        alert('30秒間操作がなかったため、自動的にログアウトしました。');
    });
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(performAutoLogout, 30 * 1000);
}

function startInactivityObserver() {
    ['mousemove', 'mousedown', 'keypress', 'scroll'].forEach(event => {
        window.addEventListener(event, resetInactivityTimer);
    });
    resetInactivityTimer();
}

function stopInactivityObserver() {
    clearTimeout(inactivityTimer);
    ['mousemove', 'mousedown', 'keypress', 'scroll'].forEach(event => {
        window.removeEventListener(event, resetInactivityTimer);
    });
}

// ▼▼▼ ログイン画面用の時計・カレンダー関数を追加 ▼▼▼
/**
 * ログイン画面の時計と日付を更新する
 */
function updateLoginClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ja-JP');
    const dateString = now.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
    document.getElementById('login-time').textContent = timeString;
    document.getElementById('login-date').textContent = dateString;
}

/**
 * カレンダーを指定された年月で生成・描画する
 * @param {Date} date - 表示したい年月を含むDateオブジェクト
 */
function generateCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11

    document.getElementById('calendar-year-month').textContent = `${year}年 ${month + 1}月`;

    const calendarBody = document.getElementById('calendar-body');
    calendarBody.innerHTML = ''; // 中身をクリア

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const today = new Date();

    let currentDate = new Date(firstDay);
    currentDate.setDate(currentDate.getDate() - firstDay.getDay()); // 週の最初の日曜日に設定

    while (currentDate <= lastDay || currentDate.getDay() !== 0) {
        let weekRow = document.createElement('tr');

        for (let i = 0; i < 7; i++) {
            let dayCell = document.createElement('td');
            if (currentDate.getMonth() === month) {
                dayCell.textContent = currentDate.getDate();

                if (currentDate.getFullYear() === today.getFullYear() &&
                    currentDate.getMonth() === today.getMonth() &&
                    currentDate.getDate() === today.getDate()) {
                    dayCell.classList.add('today');
                }
                
                // 将来の予定表示用のプレースホルダー
                const eventDiv = document.createElement('div');
                eventDiv.className = 'event-placeholder';
                dayCell.appendChild(eventDiv);
            }
            weekRow.appendChild(dayCell);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        calendarBody.appendChild(weekRow);

        if (currentDate.getMonth() > month && currentDate.getFullYear() >= year) break;
    }
}

/**
 * ログイン画面が表示されたときに実行する初期化処理
 */
function initializeLoginView() {
    // 時計を開始
    if (loginClockInterval) clearInterval(loginClockInterval);
    loginClockInterval = setInterval(updateLoginClock, 1000);
    updateLoginClock();

    // カレンダーを生成
    currentCalendarDate = new Date();
    generateCalendar(currentCalendarDate);
}
// ▲▲▲ ログイン画面用の関数を追加 ▲▲▲


function showView(viewName) {
    for (const key in views) {
        if (views[key]) {
            // ▼▼▼ 表示切り替えロジックを修正 ▼▼▼
            views[key].style.display = 'none';
        }
    }
    if (views[viewName]) {
        const displayStyle = {
            'login': 'grid',
            'admin': 'flex'
        };
        views[viewName].style.display = displayStyle[viewName] || 'block';
    }

    // ▼▼▼ 表示ビューに応じた処理を追加 ▼▼▼
    if (viewName === 'login') {
        stopInactivityObserver();
        initializeLoginView(); // ログイン画面の時計とカレンダーを初期化
        if (timeInterval) clearInterval(timeInterval); // メイン画面の時計を停止
    } else {
        if (loginClockInterval) clearInterval(loginClockInterval); // ログイン画面の時計を停止
    }
    // ▲▲▲ 表示ビューに応じた処理を追加 ▲▲▲
}

// ===== アプリケーションの初期化 =====
window.addEventListener('pywebviewready', () => {
    views = {
        login: document.getElementById('login-view'),
        main: document.getElementById('main-view'),
        admin: document.getElementById('admin-view'),
    };
    
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // ▼▼▼ カレンダーのナビゲーションボタンにイベントリスナーを設定 ▼▼▼
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        generateCalendar(currentCalendarDate);
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        generateCalendar(currentCalendarDate);
    });
    // ▲▲▲ イベントリスナーを設定 ▲▲▲
    
    showView('login'); // 最初にログイン画面を表示
});

// ===== 各ビューのイベントリスナーを、そのビューが初めて表示されるときに一度だけ設定する =====
function setupMainViewListeners() {
    if (isMainViewInitialized) return;

    document.getElementById('btn-clock-in').addEventListener('click', () => handleAttendance('clock_in'));
    document.getElementById('btn-clock-out').addEventListener('click', () => handleAttendance('clock_out'));
    document.getElementById('btn-start-break').addEventListener('click', () => handleAttendance('start_break'));
    document.getElementById('btn-end-break').addEventListener('click', () => handleAttendance('end_break'));

    document.getElementById('btn-goto-admin').addEventListener('click', () => {
        setupAdminViewListeners();
        showView('admin');
        loadEmployees();
    });

    isMainViewInitialized = true;
}

function setupAdminViewListeners() {
    if (isAdminViewInitialized) return;

    document.getElementById('btn-back-to-main').addEventListener('click', () => showView('main'));
    document.getElementById('add-employee-form').addEventListener('submit', handleAddEmployee);
    document.getElementById('btn-show-chart').addEventListener('click', showAttendanceChart);
    setDefaultDates();

    isAdminViewInitialized = true;
}

// ===== 機能別関数 =====

function handleLogin(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const password = document.getElementById('password').value;
    const loginError = document.getElementById('login-error');

    window.pywebview.api.login(name, password).then(result => {
        if (result && result.success) {
            currentUser = result.user;
            loginError.textContent = '';
            document.getElementById('login-form').reset();
            
            initializeMainView();
            showView('main');
            setupMainViewListeners();
            startInactivityObserver();
        } else {
            loginError.textContent = result ? result.message : '不明なエラーです。';
        }
    });
}

function initializeMainView() {
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('admin-menu').style.display = currentUser.is_admin ? 'block' : 'none';
    startTimeUpdater();
    updateAttendanceStatus();
}

function handleAttendance(eventType) {
    window.pywebview.api.record_attendance(eventType).then(result => {
        if (result.success) {
            updateAttendanceStatus();
        } else {
            alert(result.message);
        }
    });
}

function updateAttendanceStatus() {
    window.pywebview.api.get_user_status().then(result => {
        const status = result.status;
        const statusMessage = document.getElementById('status-message');
        const btnClockIn = document.getElementById('btn-clock-in');
        const btnClockOut = document.getElementById('btn-clock-out');
        const btnStartBreak = document.getElementById('btn-start-break');
        const btnEndBreak = document.getElementById('btn-end-break');

        [btnClockIn, btnClockOut, btnStartBreak, btnEndBreak].forEach(btn => btn.disabled = true);

        switch (status) {
            case 'clock_in':
            case 'end_break':
                statusMessage.textContent = '現在の状態: 勤務中';
                btnClockOut.disabled = false;
                btnStartBreak.disabled = false;
                break;
            case 'start_break':
                statusMessage.textContent = '現在の状態: 休憩中';
                btnEndBreak.disabled = false;
                break;
            case 'clock_out':
            case 'none':
            default:
                statusMessage.textContent = '現在の状態: 未出勤/退勤済み';
                btnClockIn.disabled = false;
                break;
        }
    });
}

function loadEmployees() {
    window.pywebview.api.get_all_employees().then(result => {
        if (result.success) {
            const tableBody = document.querySelector("#employee-table tbody");
            const employeeSelect = document.getElementById('employee-select');
            
            tableBody.innerHTML = '';
            employeeSelect.innerHTML = '';

            result.employees.forEach(emp => {
                const row = `<tr>
                    <td>${emp.id}</td>
                    <td>${emp.name}</td>
                    <td>${emp.hourly_wage.toLocaleString()}円</td>
                    <td>${emp.is_admin ? '✔' : ''}</td>
                </tr>`;
                tableBody.insertAdjacentHTML('beforeend', row);
                
                const option = `<option value="${emp.id}">${emp.name}</option>`;
                employeeSelect.insertAdjacentHTML('beforeend', option);
            });
        } else {
            alert(result.message);
        }
    });
}

function handleAddEmployee(e) {
    e.preventDefault();
    const messageDiv = document.getElementById('add-employee-message');
    const name = document.getElementById('new-name').value;
    const password = document.getElementById('new-password').value;
    const wage = document.getElementById('new-wage').value;
    const isAdmin = document.getElementById('new-is-admin').checked;

    window.pywebview.api.add_employee(name, password, wage, isAdmin).then(result => {
        if (result.success) {
            messageDiv.textContent = `従業員「${name}」を登録しました。`;
            messageDiv.className = 'message success';
            e.target.reset();
            loadEmployees();
        } else {
            messageDiv.textContent = `エラー: ${result.message}`;
            messageDiv.className = 'message error';
        }
    });
}

function showAttendanceChart() {
    const employeeId = document.getElementById('employee-select').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!employeeId || !startDate || !endDate) {
        alert('従業員、開始日、終了日をすべて選択してください。');
        return;
    }

    window.pywebview.api.get_attendance_summary(employeeId, startDate, endDate).then(result => {
        if (result.success) {
            document.getElementById('statistics-result').style.display = 'block';
            
            const summary = result.summary;
            const summaryDiv = document.getElementById('summary-text');
            summaryDiv.innerHTML = `
                <strong>期間合計:</strong> ${summary.total_hours.toFixed(2)}時間 <br>
                <strong>概算給与:</strong> ${Math.round(summary.total_wage).toLocaleString()}円 (時給: ${summary.hourly_wage.toLocaleString()}円)
            `;
            
            drawChart(result.labels, result.data);
        } else {
            alert(`エラー: ${result.message}`);
        }
    });
}

function drawChart(labels, data) {
    const ctx = document.getElementById('attendance-chart').getContext('2d');
    
    if (attendanceChart) {
        attendanceChart.destroy();
    }

    attendanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '労働時間 (時間)',
                data: data,
                backgroundColor: 'rgba(0, 123, 255, 0.5)',
                borderColor: 'rgba(0, 123, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '時間'
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function startTimeUpdater() {
    const timeDisplay = document.getElementById('current-time');
    if (timeInterval) clearInterval(timeInterval);
    timeInterval = setInterval(() => {
        const now = new Date();
        timeDisplay.textContent = now.toLocaleTimeString('ja-JP');
    }, 1000);
}

function setDefaultDates() {
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const formatDate = (date) => date.toISOString().split('T')[0];

    if(startDateInput) startDateInput.value = formatDate(firstDayOfMonth);
    if(endDateInput) endDateInput.value = formatDate(today);
}