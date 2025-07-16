// ===================================================
//  グローバル変数定義
// ===================================================
let currentUser = null;
let timeInterval = null;
let attendanceChart = null;
let inactivityTimer = null;

let isMainViewInitialized = false;
let isAdminViewInitialized = false;

let views = {};
let loginClockInterval = null;
let currentCalendarDate = new Date();
let currentAdminCalendarDate = new Date();
let adminMonthlyEvents = []; // 管理者カレンダーの月間イベントをキャッシュ

// DOM要素
let eventModalOverlay, eventForm, dailyEventsDateEl, dailyEventsListEl, eventListViewEl;


// ===================================================
//  機能別関数 (定義セクション)
// ===================================================

/**
 * 指定したビューを表示する
 */
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

// --- 自動ログアウト関連 ---
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


// --- ログイン画面関連 ---
function updateLoginClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('ja-JP');
    const dateString = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    document.getElementById('login-time').textContent = timeString;
    document.getElementById('login-date').textContent = dateString;
}

function initializeLoginView() {
    if (loginClockInterval) clearInterval(loginClockInterval);
    loginClockInterval = setInterval(updateLoginClock, 1000);
    updateLoginClock();
    currentCalendarDate = new Date();
    generateCalendar({ date: currentCalendarDate, bodyId: 'calendar-body', yearMonthId: 'calendar-year-month', isAdmin: false });
}

// --- 管理者画面関連 ---
function initializeAdminView() {
    currentAdminCalendarDate = new Date();
    refreshAdminCalendarAndList(currentAdminCalendarDate);
    if (dailyEventsDateEl) dailyEventsDateEl.textContent = '日付にカーソルを合わせてください';
    if (dailyEventsListEl) dailyEventsListEl.innerHTML = '';
}

/**
 * 管理者画面のデータを再取得し、カレンダーとリストを再描画する
 */
function refreshAdminCalendarAndList(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    return window.pywebview.api.get_events_for_month(year, month).then(result => {
        adminMonthlyEvents = result.success ? result.events : [];

        // 新しいデータでカレンダーとリストの両方を再描画
        drawAdminCalendar(date, adminMonthlyEvents);
        renderEventListView(adminMonthlyEvents);
    });
}

function displayDailyEvents(dateString) {
    const date = new Date(dateString + 'T00:00:00');
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
            <div class="actions">
                <button class="edit-btn" data-event-id="${event.id}">編集</button>
                <button class="delete-btn" data-event-id="${event.id}">削除</button>
            </div>
            <div class="title">${event.title}</div>
            <div class="time">${startTime}</div>
            <div class="description">${event.description || ''}</div>
        `;
        dailyEventsListEl.appendChild(item);
    });
}

function renderEventListView() {
    eventListViewEl.innerHTML = '';
    if (adminMonthlyEvents.length === 0) {
        eventListViewEl.innerHTML = '<p class="no-events">この月のイベントはありません。</p>';
        return;
    }

    const sortedEvents = [...adminMonthlyEvents].sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));

    sortedEvents.forEach(event => {
        const item = document.createElement('div');
        item.className = 'list-event-item';
        const date = new Date(event.start_datetime).toLocaleDateString('ja-JP');
        const time = event.is_allday ? '終日' : new Date(event.start_datetime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
            <div class="info">
                <strong>${date} (${time})</strong> - ${event.title}
            </div>
            <div class="actions">
                <button class="edit-btn" data-event-id="${event.id}">編集</button>
                <button class="delete-btn" data-event-id="${event.id}">削除</button>
            </div>
        `;
        eventListViewEl.appendChild(item);
    });
}


// --- イベントモーダル関連 ---
function openEventModal(dateOrEvent) {
    eventForm.reset();
    document.getElementById('event-id').value = '';

    if (dateOrEvent instanceof Date) {
        document.getElementById('event-modal-title').textContent = 'イベントを追加';
        const dateString = `${dateOrEvent.getFullYear()}-${('0' + (dateOrEvent.getMonth() + 1)).slice(-2)}-${('0' + dateOrEvent.getDate()).slice(-2)}`;
        document.getElementById('event-start').type = 'datetime-local';
        document.getElementById('event-end').type = 'datetime-local';
        document.getElementById('event-start').value = dateString + 'T09:00';
        document.getElementById('event-end').value = dateString + 'T10:00';
    } else {
        document.getElementById('event-modal-title').textContent = 'イベントを編集';
        const event = dateOrEvent;
        document.getElementById('event-id').value = event.id;
        document.getElementById('event-title').value = event.title;
        document.getElementById('event-allday').checked = event.is_allday;
        document.getElementById('event-start').type = event.is_allday ? 'date' : 'datetime-local';
        document.getElementById('event-end').type = event.is_allday ? 'date' : 'datetime-local';
        document.getElementById('event-start').value = event.is_allday ? event.start_datetime.slice(0, 10) : event.start_datetime.slice(0, 16);
        document.getElementById('event-end').value = event.is_allday ? event.end_datetime.slice(0, 10) : event.end_datetime.slice(0, 16);
        document.getElementById('event-description').value = event.description;
    }
    eventModalOverlay.style.display = 'flex';
}

function closeEventModal() {
    eventModalOverlay.style.display = 'none';
}

function handleSaveEvent(e) {
    e.preventDefault();
    const eventId = document.getElementById('event-id').value;
    const title = document.getElementById('event-title').value;
    const description = document.getElementById('event-description').value;
    const isAllday = document.getElementById('event-allday').checked;

    let startStr = document.getElementById('event-start').value;
    let endStr = document.getElementById('event-end').value;

    if (isAllday) {
        startStr += ' 00:00:00';
        endStr += ' 23:59:59';
    } else {
        startStr = startStr.replace('T', ' ') + ':00';
        endStr = endStr.replace('T', ' ') + ':00';
    }

    if (endStr < startStr) {
        alert('終了日時は開始日時より後に設定してください。');
        return;
    }

    const apiCall = eventId
        ? window.pywebview.api.update_event(eventId, title, description, startStr, endStr, isAllday)
        : window.pywebview.api.add_event(title, description, startStr, endStr, isAllday);

    apiCall.then(result => {
        if (result.success) {
            closeEventModal();
            refreshAdminCalendarAndList(currentAdminCalendarDate);
        } else {
            alert('エラー: ' + result.message);
        }
    });
}

function handleEditEvent(eventId) {
    const event = adminMonthlyEvents.find(e => e.id == eventId);
    if (event) {
        openEventModal(event);
    }
}

function handleDeleteEvent(eventId) {
    if (confirm('このイベントを本当に削除しますか？')) {
        window.pywebview.api.delete_event(eventId).then(result => {
            if (result.success) {
                refreshAdminCalendarAndList(currentAdminCalendarDate);
            } else {
                alert('削除に失敗しました: ' + result.message);
            }
        });
    }
}

// --- カレンダー描画関数 ---
function drawAdminCalendar(date, events) {
    const year = date.getFullYear();
    const month = date.getMonth();
    document.getElementById('admin-calendar-year-month').textContent = `${year}年 ${month + 1}月`;
    const calendarBody = document.getElementById('admin-calendar-body');
    calendarBody.innerHTML = '';

    const firstDay = new Date(year, month, 1);
    let tempDate = new Date(firstDay);
    tempDate.setDate(tempDate.getDate() - firstDay.getDay());

    for (let week = 0; week < 6; week++) {
        let weekRow = document.createElement('tr');
        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            let dayCell = document.createElement('td');
            const dateString = `${tempDate.getFullYear()}-${('0' + (tempDate.getMonth() + 1)).slice(-2)}-${('0' + tempDate.getDate()).slice(-2)}`;

            const dateSpan = document.createElement('span');
            dateSpan.textContent = tempDate.getDate();
            dayCell.appendChild(dateSpan);

            if (tempDate.getMonth() === month) {
                dayCell.dataset.date = dateString;
                if (dayOfWeek === 0) dayCell.classList.add('sunday');
                if (dayOfWeek === 6) dayCell.classList.add('saturday');
                if (tempDate.toDateString() === new Date().toDateString()) {
                    dateSpan.classList.add('today');
                }

                const dayEvents = events.filter(e => {
                    const eventStart = new Date(e.start_datetime.split(' ')[0]);
                    const eventEnd = new Date(e.end_datetime.split(' ')[0]);
                    return tempDate >= eventStart && tempDate <= eventEnd;
                });

                if (dayEvents.length > 0) {
                    const eventPlaceholder = document.createElement('div');
                    dayEvents.slice(0, 2).forEach(event => {
                        const eventDiv = document.createElement('div');
                        eventDiv.className = 'calendar-event';
                        eventDiv.textContent = event.title;
                        eventPlaceholder.appendChild(eventDiv);
                    });
                    dayCell.appendChild(eventPlaceholder);
                }
            } else {
                dayCell.classList.add('other-month');
            }
            weekRow.appendChild(dayCell);
            tempDate.setDate(tempDate.getDate() + 1);
        }
        calendarBody.appendChild(weekRow);
    }
}

function generateCalendar(options) {
    const { date, bodyId, yearMonthId } = options;
    const year = date.getFullYear();
    const month = date.getMonth();

    document.getElementById(yearMonthId).textContent = `${year}年 ${month + 1}月`;
    const calendarBody = document.getElementById(bodyId);
    calendarBody.innerHTML = '<tr><td colspan="7">読み込み中...</td></tr>';

    return window.pywebview.api.get_events_for_month(year, month + 1).then(result => {
        calendarBody.innerHTML = '';
        const events = result.success ? result.events : [];
        drawAdminCalendar(date, events); // 描画ロジックを再利用
    });
}


// --- メイン画面・勤怠関連 ---
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

function handleManualLogout() {
    console.log("手動ログアウトを実行します。");
    stopInactivityObserver();
    window.pywebview.api.logout().then(() => {
        showView('login');
    });
}

function initializeMainView() {
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('admin-menu').style.display = currentUser.is_admin ? 'block' : 'none';
    startTimeUpdater();
    updateAttendanceStatus();
}

function startTimeUpdater() {
    const timeDisplay = document.getElementById('current-time');
    if (timeInterval) clearInterval(timeInterval);
    timeInterval = setInterval(() => {
        const now = new Date();
        timeDisplay.textContent = now.toLocaleTimeString('ja-JP');
    }, 1000);
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


// --- 従業員・勤怠集計関連 (管理者) ---
function loadEmployees() {
    window.pywebview.api.get_all_employees().then(result => {
        if (result.success) {
            const tableBody = document.querySelector("#employee-table tbody");
            const employeeSelect = document.getElementById('employee-select');

            tableBody.innerHTML = '';
            employeeSelect.innerHTML = '';

            result.employees.forEach(emp => {
                const row = `<tr><td>${emp.id}</td><td>${emp.name}</td><td>${emp.hourly_wage.toLocaleString()}円</td><td>${emp.is_admin ? '✔' : ''}</td></tr>`;
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
            summaryDiv.innerHTML = `<strong>期間合計:</strong> ${summary.total_hours.toFixed(2)}時間 <br><strong>概算給与:</strong> ${Math.round(summary.total_wage).toLocaleString()}円 (時給: ${summary.hourly_wage.toLocaleString()}円)`;
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
            scales: { y: { beginAtZero: true, title: { display: true, text: '時間' } } },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function setDefaultDates() {
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const formatDate = (date) => date.toISOString().split('T')[0];
    if (startDateInput) startDateInput.value = formatDate(firstDayOfMonth);
    if (endDateInput) endDateInput.value = formatDate(today);
}


// --- 1回限りのリスナー設定 ---
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


// ===================================================
//  アプリケーション初期化 (エントリーポイント)
// ===================================================
window.addEventListener('pywebviewready', () => {
    // --- DOM要素取得 ---
    views = {
        login: document.getElementById('login-view'),
        main: document.getElementById('main-view'),
        admin: document.getElementById('admin-view'),
    };
    eventModalOverlay = document.getElementById('event-modal-overlay');
    eventForm = document.getElementById('event-form');
    dailyEventsDateEl = document.getElementById('daily-events-date');
    dailyEventsListEl = document.getElementById('daily-events-list');
    eventListViewEl = document.getElementById('admin-event-list-view');

    // --- イベントリスナー設定 ---
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // ログイン画面カレンダー
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        generateCalendar({ date: currentCalendarDate, bodyId: 'calendar-body', yearMonthId: 'calendar-year-month', isAdmin: false });
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        generateCalendar({ date: currentCalendarDate, bodyId: 'calendar-body', yearMonthId: 'calendar-year-month', isAdmin: false });
    });

    // 管理者画面カレンダー
    const adminCalendarBody = document.getElementById('admin-calendar-body');
    adminCalendarBody.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('td[data-date]');
        if (cell) displayDailyEvents(cell.dataset.date);
    });
    adminCalendarBody.addEventListener('click', (e) => {
        const cell = e.target.closest('td[data-date]');
        if (cell) openEventModal(new Date(cell.dataset.date + 'T00:00:00'));
    });
    document.getElementById('admin-prev-month-btn').addEventListener('click', () => {
        currentAdminCalendarDate.setMonth(currentAdminCalendarDate.getMonth() - 1);
        refreshAdminCalendarAndList(currentAdminCalendarDate);
    });
    document.getElementById('admin-next-month-btn').addEventListener('click', () => {
        currentAdminCalendarDate.setMonth(currentAdminCalendarDate.getMonth() + 1);
        refreshAdminCalendarAndList(currentAdminCalendarDate);
    });

    // イベントモーダル
    document.getElementById('event-cancel-btn').addEventListener('click', closeEventModal);
    eventForm.addEventListener('submit', handleSaveEvent);
    document.getElementById('event-allday').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const startInput = document.getElementById('event-start');
        const endInput = document.getElementById('event-end');

        const startDate = startInput.value.slice(0, 10);
        const endDate = endInput.value.slice(0, 10);

        startInput.type = isChecked ? 'date' : 'datetime-local';
        endInput.type = isChecked ? 'date' : 'datetime-local';

        if (isChecked) {
            startInput.value = startDate;
            endInput.value = endDate;
        } else {
            startInput.value = startDate + 'T09:00';
            endInput.value = endDate + 'T10:00';
        }
    });

    // 表示切替ボタン
    document.getElementById('event-view-toggle').addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        const view = e.target.dataset.view;

        document.querySelectorAll('#event-view-toggle .toggle-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        if (view === 'calendar') {
            document.getElementById('admin-event-manager').style.display = 'grid';
            eventListViewEl.style.display = 'none';
        } else {
            document.getElementById('admin-event-manager').style.display = 'none';
            eventListViewEl.style.display = 'block';
            renderEventListView();
        }
    });

    // 詳細・一覧リストの親要素
    [dailyEventsListEl, eventListViewEl].forEach(el => {
        el.addEventListener('click', (e) => {
            const eventId = e.target.dataset.eventId;
            if (!eventId) return;

            if (e.target.classList.contains('edit-btn')) {
                handleEditEvent(eventId);
            } else if (e.target.classList.contains('delete-btn')) {
                handleDeleteEvent(eventId);
            }
        });
    });

    // --- 初期表示 ---
    showView('login');
});