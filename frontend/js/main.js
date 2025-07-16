let currentUser = null;
let timeInterval = null;
let attendanceChart = null;

let isMainViewInitialized = false;
let isAdminViewInitialized = false;

let views = {};

let loginClockInterval = null;
let currentCalendarDate = new Date();
let currentAdminCalendarDate = new Date();
let adminMonthlyEvents = []; // 管理者カレンダーの月間イベントをキャッシュ

// DOM要素
let eventModalOverlay, eventForm, dailyEventsDateEl, dailyEventsListEl;

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
 * カレンダーを指定された年月で生成・描画する (共通関数)
 * @param {object} options - 設定オブジェクト { date, bodyId, isAdmin, yearMonthId }
 */
function generateCalendar(options) {
    const { date, bodyId, isAdmin, yearMonthId } = options;
    const year = date.getFullYear();
    const month = date.getMonth();

    document.getElementById(yearMonthId).textContent = `${year}年 ${month + 1}月`;

    const calendarBody = document.getElementById(bodyId);
    calendarBody.innerHTML = '';

    // 月のイベントを取得
    window.pywebview.api.get_events_for_month(year, month + 1).then(result => {
        const events = result.success ? result.events : [];
        if(isAdmin) {
            adminMonthlyEvents = events;
        }
        
        // カレンダーの描画
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        let tempDate = new Date(firstDay);
        tempDate.setDate(tempDate.getDate() - firstDay.getDay());

        // 6週間分 (42日) のセルを生成
        for (let week = 0; week < 6; week++) {
            let weekRow = document.createElement('tr');
            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                let dayCell = document.createElement('td');
                const dateString = `${tempDate.getFullYear()}-${('0' + (tempDate.getMonth() + 1)).slice(-2)}-${('0' + tempDate.getDate()).slice(-2)}`;
                
                const dateSpan = document.createElement('span');
                dateSpan.textContent = tempDate.getDate();
                dayCell.appendChild(dateSpan);

                // ▼▼▼ ここからロジックを修正・追加 ▼▼▼
                if (tempDate.getMonth() === month) {
                    // --- 当月の日付の処理 ---
                    dayCell.dataset.date = dateString;

                    // 土日のクラス設定
                    if (dayOfWeek === 0) dayCell.classList.add('sunday');
                    if (dayOfWeek === 6) dayCell.classList.add('saturday');

                    // 今日のクラス設定
                    if (tempDate.toDateString() === new Date().toDateString()) {
                        dateSpan.classList.add('today');
                    }
                    
                    // イベントの表示
                    const dayEvents = events.filter(e => {
                        const eventStart = new Date(e.start_datetime.split(' ')[0]);
                        const eventEnd = new Date(e.end_datetime.split(' ')[0]);
                        return tempDate >= eventStart && tempDate <= eventEnd;
                    });

                    if(dayEvents.length > 0) {
                        const eventPlaceholder = document.createElement('div');
                        dayEvents.forEach(event => {
                             const eventDiv = document.createElement('div');
                             eventDiv.className = 'calendar-event';
                             eventDiv.textContent = event.title;
                             eventPlaceholder.appendChild(eventDiv);
                        });
                        dayCell.appendChild(eventPlaceholder);
                    }
                } else {
                    // --- 前月・翌月の日付の処理 ---
                    dayCell.classList.add('other-month');
                }
                // ▲▲▲ ロジックを修正・追加 ▲▲▲

                weekRow.appendChild(dayCell);
                tempDate.setDate(tempDate.getDate() + 1);
            }
            calendarBody.appendChild(weekRow);
        }
    });
}

function initializeLoginView() {
    if (loginClockInterval) clearInterval(loginClockInterval);
    loginClockInterval = setInterval(updateLoginClock, 1000);
    updateLoginClock();
    currentCalendarDate = new Date();
    generateCalendar({
        date: currentCalendarDate,
        bodyId: 'calendar-body',
        yearMonthId: 'calendar-year-month',
        isAdmin: false
    });
}

function initializeAdminView() {
    currentAdminCalendarDate = new Date();
    generateCalendar({
        date: currentAdminCalendarDate,
        bodyId: 'admin-calendar-body',
        yearMonthId: 'admin-calendar-year-month',
        isAdmin: true
    });
    dailyEventsDateEl.textContent = '日付にカーソルを合わせてください';
    dailyEventsListEl.innerHTML = '';
}

// ▼▼▼ 新しいイベント処理関数 ▼▼▼
function openEventModal(dateString) {
    eventForm.reset();
    document.getElementById('event-start').value = dateString + 'T09:00';
    document.getElementById('event-end').value = dateString + 'T10:00';
    eventModalOverlay.style.display = 'flex';
}

function closeEventModal() {
    eventModalOverlay.style.display = 'none';
}

function handleSaveEvent(e) {
    e.preventDefault();
    const title = document.getElementById('event-title').value;
    const description = document.getElementById('event-description').value;
    const startStr = document.getElementById('event-start').value.replace('T', ' ') + ':00';
    const endStr = document.getElementById('event-end').value.replace('T', ' ') + ':00';
    const isAllday = document.getElementById('event-allday').checked;

    window.pywebview.api.add_event(title, description, startStr, endStr, isAllday).then(result => {
        if (result.success) {
            closeEventModal();
            // 両方のカレンダーを再描画
            generateCalendar({date: currentCalendarDate, bodyId: 'calendar-body', yearMonthId: 'calendar-year-month', isAdmin: false});
            generateCalendar({date: currentAdminCalendarDate, bodyId: 'admin-calendar-body', yearMonthId: 'admin-calendar-year-month', isAdmin: true});
        } else {
            alert('エラー: ' + result.message);
        }
    });
}

function displayDailyEvents(dateString) {
    const date = new Date(dateString + 'T00:00:00'); // 正確な日付オブジェクト
    dailyEventsDateEl.textContent = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日のイベント`;
    dailyEventsListEl.innerHTML = '';
    
    const dayEvents = adminMonthlyEvents.filter(e => {
        const eventStart = new Date(e.start_datetime.split(' ')[0]);
        const eventEnd = new Date(e.end_datetime.split(' ')[0]);
        return date >= eventStart && date <= eventEnd;
    });

    if (dayEvents.length === 0) {
        dailyEventsListEl.innerHTML = '<p class="no-events">この日の予定はありません。</p>';
        return;
    }

    dayEvents.forEach(event => {
        const item = document.createElement('div');
        item.className = 'daily-event-item';
        const startTime = event.is_allday ? '終日' : new Date(event.start_datetime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        
        item.innerHTML = `
            <div class="title">${event.title}</div>
            <div class="time">${startTime}</div>
            <div class="description">${event.description || ''}</div>
        `;
        dailyEventsListEl.appendChild(item);
    });
}

function showView(viewName) {
    for (const key in views) {
        if (views[key]) {
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

    if (viewName === 'login') {
        stopInactivityObserver();
        initializeLoginView();
        if (timeInterval) clearInterval(timeInterval);
    } else {
        if (loginClockInterval) clearInterval(loginClockInterval);
    }
    if (viewName === 'admin') {
        initializeAdminView();
    }
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
        generateCalendar({date: currentCalendarDate, bodyId: 'calendar-body', yearMonthId: 'calendar-year-month', isAdmin: false});
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        generateCalendar({date: currentCalendarDate, bodyId: 'calendar-body', yearMonthId: 'calendar-year-month', isAdmin: false});
    });
    // ▲▲▲ イベントリスナーを設定 ▲▲▲

    // ▼▼▼ モーダルと管理者カレンダーの初期化を追加 ▼▼▼
    eventModalOverlay = document.getElementById('event-modal-overlay');
    eventForm = document.getElementById('event-form');
    dailyEventsDateEl = document.getElementById('daily-events-date');
    dailyEventsListEl = document.getElementById('daily-events-list');
    document.getElementById('event-cancel-btn').addEventListener('click', closeEventModal);
    eventForm.addEventListener('submit', handleSaveEvent);

    // 終日チェックボックスのロジック
    document.getElementById('event-allday').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.getElementById('event-start').type = isChecked ? 'date' : 'datetime-local';
        document.getElementById('event-end').type = isChecked ? 'date' : 'datetime-local';
    });

    // ▼▼▼ 管理者カレンダーのイベント処理 (イベント委譲) ▼▼▼
    const adminCalendarBody = document.getElementById('admin-calendar-body');
    
    adminCalendarBody.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('td');
        if (cell && cell.dataset.date) {
            displayDailyEvents(cell.dataset.date);
        }
    });

    adminCalendarBody.addEventListener('click', (e) => {
        const cell = e.target.closest('td');
        if (cell && cell.dataset.date) {
            openEventModal(cell.dataset.date);
        }
    });

    // 管理者カレンダーのナビゲーション
    document.getElementById('admin-prev-month-btn').addEventListener('click', () => {
        currentAdminCalendarDate.setMonth(currentAdminCalendarDate.getMonth() - 1);
        generateCalendar({date: currentAdminCalendarDate, bodyId: 'admin-calendar-body', yearMonthId: 'admin-calendar-year-month', isAdmin: true});
    });
    document.getElementById('admin-next-month-btn').addEventListener('click', () => {
        currentAdminCalendarDate.setMonth(currentAdminCalendarDate.getMonth() + 1);
        generateCalendar({date: currentAdminCalendarDate, bodyId: 'admin-calendar-body', yearMonthId: 'admin-calendar-year-month', isAdmin: true});
    });
    // ▲▲▲ 初期化を追加 ▲▲▲
    
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

    document.getElementById('btn-logout').addEventListener('click', handleManualLogout);

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

/**
 * 手動ログアウト処理
 */
function handleManualLogout() {
    console.log("手動ログアウトを実行します。");
    stopInactivityObserver(); // 無操作タイマーを停止
    window.pywebview.api.logout().then(() => {
        showView('login'); // ログイン画面に遷移
    });
}


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