// ===================================================
//  グローバル変数定義
// ===================================================
let currentUser = null;
let timeInterval = null;
let attendanceChart = null;
let inactivityTimer = null;

let isMainViewInitialized = false;
let isAdminViewInitialized = false;
let isLoginViewInitialized = false; 
let loginClockInterval = null;
let loginCalendarDate = new Date();

let views = {};

let adminCalendarDate = new Date();
let eventsCache = {};

// DOM要素
let calendarGrid, calendarTitle, eventModalOverlay, eventForm, eventModalTitle, deleteEventBtn;


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
            'main': 'block',
            'admin': 'flex'
        };
        views[viewName].style.display = displayStyle[viewName] || 'block';
    }

    // ▼▼▼ ここから修正 ▼▼▼
    if (viewName === 'login') {
        stopInactivityObserver();
        if (timeInterval) clearInterval(timeInterval);
        
        startLoginClock(); // 常にログイン時計を開始

        if (!isLoginViewInitialized) {
            initializeLoginView();
        }
    } else {
        stopLoginClock(); // 他画面ではログイン時計を停止
    }
    // ▲▲▲ 修正 ▲▲▲
    
    if (viewName === 'admin' && !isAdminViewInitialized) {
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


// --- カレンダー関連 ---
async function renderCalendar(config) {
    const { date, titleEl, gridEl, cacheKey, isReadOnly } = config;
    
    titleEl.textContent = `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
    
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const fetchStartDate = new Date(startOfMonth);
    fetchStartDate.setDate(fetchStartDate.getDate() - 7);
    const fetchEndDate = new Date(endOfMonth);
    fetchEndDate.setDate(fetchEndDate.getDate() + 8);

    const result = await window.pywebview.api.get_events(
        formatDateForAPI(fetchStartDate), 
        formatDateForAPI(fetchEndDate)
    );

    if (result.success) {
        eventsCache[cacheKey] = result.events;
        renderMonthView(date, result.events, gridEl, isReadOnly);
    } else {
        alert("イベントの読み込みに失敗しました。");
    }
}

function renderMonthView(date, events, gridEl, isReadOnly) {
    gridEl.innerHTML = '';
    
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    weekdays.forEach(day => {
        const headerCell = document.createElement('div');
        headerCell.className = 'calendar-header-cell';
        headerCell.textContent = day;
        gridEl.appendChild(headerCell);
    });

    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    let dayCounter = 1;
    for (let i = 0; i < 42; i++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day-cell';
        const dateNumber = document.createElement('span');
        dateNumber.className = 'date-number';

        if (i < firstDayOfMonth) {
            dayCell.classList.add('other-month');
        } else if (dayCounter <= daysInMonth) {
            const cellDate = new Date(year, month, dayCounter);
            if (!isReadOnly) {
                dayCell.dataset.date = formatDateForInput(cellDate, true);
            }
            dateNumber.textContent = dayCounter;
            if (isToday(cellDate)) dateNumber.classList.add('today');
            
            const dayEvents = events.filter(e => isEventOnDate(e, cellDate));
            dayEvents.forEach(event => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'calendar-event';
                eventDiv.textContent = event.title;
                if (!isReadOnly) {
                    eventDiv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEventModal(null, event);
                    });
                }
                dayCell.appendChild(eventDiv);
            });
            dayCounter++;
        } else {
            dayCell.classList.add('other-month');
        }
        dayCell.appendChild(dateNumber);
        gridEl.appendChild(dayCell);
    }
}

function openEventModal(date, event = null) {
    eventForm.reset();
    if (event) {
        eventModalTitle.textContent = 'イベントを編集';
        document.getElementById('event-id').value = event.id;
        document.getElementById('event-title').value = event.title;
        document.getElementById('event-description').value = event.description || '';
        const isAllday = event.is_allday === 1;
        document.getElementById('event-allday').checked = isAllday;
        const start = new Date(event.start_datetime.replace(' ', 'T'));
        const end = new Date(event.end_datetime.replace(' ', 'T'));
        document.getElementById('event-start').type = isAllday ? 'date' : 'datetime-local';
        document.getElementById('event-end').type = isAllday ? 'date' : 'datetime-local';
        document.getElementById('event-start').value = formatDateForInput(start, isAllday);
        document.getElementById('event-end').value = formatDateForInput(end, isAllday);
        deleteEventBtn.style.display = 'block';
    } else {
        eventModalTitle.textContent = 'イベントを追加';
        document.getElementById('event-id').value = '';
        document.getElementById('event-allday').checked = false;
        const start = new Date(date);
        start.setHours(9, 0, 0, 0);
        const end = new Date(date);
        end.setHours(10, 0, 0, 0);
        document.getElementById('event-start').type = 'datetime-local';
        document.getElementById('event-end').type = 'datetime-local';
        document.getElementById('event-start').value = formatDateForInput(start, false);
        document.getElementById('event-end').value = formatDateForInput(end, false);
        deleteEventBtn.style.display = 'none';
    }
    views.eventModal.style.display = 'flex';
}

function closeEventModal() {
    views.eventModal.style.display = 'none';
}

async function handleSaveEvent(e) {
    e.preventDefault();
    const id = document.getElementById('event-id').value;
    const title = document.getElementById('event-title').value;
    const description = document.getElementById('event-description').value;
    const is_allday = document.getElementById('event-allday').checked;
    
    let start_datetime = document.getElementById('event-start').value;
    let end_datetime = document.getElementById('event-end').value;

    if (is_allday) {
        start_datetime += ' 00:00:00';
        end_datetime += ' 23:59:59';
    } else {
        start_datetime = start_datetime.replace('T', ' ') + ':00';
        end_datetime = end_datetime.replace('T', ' ') + ':00';
    }
    
    if (end_datetime <= start_datetime) {
        alert('終了日時は開始日時より後に設定してください。');
        return;
    }

    const result = id ? await window.pywebview.api.update_event(id, title, description, start_datetime, end_datetime, is_allday) : await window.pywebview.api.add_event(title, description, start_datetime, end_datetime, is_allday);
    if (result.success) {
        closeEventModal();
        if (views.admin.style.display !== 'none') {
            await renderCalendar({ date: adminCalendarDate, titleEl: document.getElementById('calendar-title'), gridEl: document.getElementById('calendar-grid'), cacheKey: 'admin', isReadOnly: false });
        }
    } else {
        alert('エラー: ' + result.message);
    }
}

async function handleDeleteEvent() {
    const id = document.getElementById('event-id').value;
    if (!id) return;
    if (confirm('このイベントを本当に削除しますか？')) {
        const result = await window.pywebview.api.delete_event(id);
        if (result.success) {
            closeEventModal();
            if (views.admin.style.display !== 'none') {
                await renderCalendar({ date: adminCalendarDate, titleEl: document.getElementById('calendar-title'), gridEl: document.getElementById('calendar-grid'), cacheKey: 'admin', isReadOnly: false });
            }
        } else {
            alert('削除に失敗しました: ' + result.message);
        }
    }
}


// --- ヘルパー関数 ---
function formatDateForAPI(date) {
    const tzoffset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date - tzoffset).toISOString().slice(0, 19);
    return localISOTime.replace('T', ' ');
}

function formatDateForInput(date, isAllDay) {
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    return isAllDay ? `${year}-${month}-${day}` : `${year}-${month}-${day}T${('0' + date.getHours()).slice(-2)}:${('0' + date.getMinutes()).slice(-2)}`;
}

function isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
}

function isEventOnDate(event, date) {
    const eventStart = new Date(event.start_datetime.replace(' ', 'T'));
    const eventEnd = new Date(event.end_datetime.replace(' ', 'T'));
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);
    return eventStart < dateEnd && eventEnd > dateStart;
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

// ▼▼▼ ここから修正 ▼▼▼
function handleManualLogout() {
    console.log("手動ログアウトを実行します。");
    stopInactivityObserver();
    window.pywebview.api.logout().then(() => {
        // ユーザー情報をクリア
        currentUser = null;
        // 全てのビューの初期化フラグをリセット
        isMainViewInitialized = false;
        isAdminViewInitialized = false;
        isLoginViewInitialized = false; 
        // イベントキャッシュを完全にクリア
        eventsCache = {};

        showView('login');
    });
}
// ▲▲▲ 修正 ▲▲▲

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
        timeDisplay.textContent = new Date().toLocaleTimeString('ja-JP');
    }, 1000);
}

function handleAttendance(eventType) {
    window.pywebview.api.record_attendance(eventType).then(result => {
        if (result.success) updateAttendanceStatus();
        else alert(result.message);
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
            case 'clock_in': case 'end_break':
                statusMessage.textContent = '現在の状態: 勤務中';
                btnClockOut.disabled = false;
                btnStartBreak.disabled = false;
                break;
            case 'start_break':
                statusMessage.textContent = '現在の状態: 休憩中';
                btnEndBreak.disabled = false;
                break;
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
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${emp.id}</td>
                    <td>${emp.name}</td>
                    <td>${emp.hourly_wage.toLocaleString()}円</td>
                    <td>${emp.is_admin ? '✔' : ''}</td>
                    <td>
                        <button class="delete-employee-btn" data-employee-id="${emp.id}">削除</button>
                    </td>
                `;
                tableBody.appendChild(row);

                const option = `<option value="${emp.id}">${emp.name}</option>`;
                employeeSelect.insertAdjacentHTML('beforeend', option);
            });
        } else {
            alert(result.message);
        }
    });
}

async function handleDeleteEmployee(employeeId) {
    const employee = (await window.pywebview.api.get_all_employees()).employees.find(e => e.id == employeeId);
    if (confirm(`従業員「${employee.name}」を削除しますか？\nこの操作は元に戻せません。`)) {
        const result = await window.pywebview.api.delete_employee(employeeId);
        if (result.success) {
            alert("従業員を削除しました。");
            loadEmployees();
        } else {
            alert("エラー: " + result.message);
        }
    }
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
            summaryDiv.innerHTML = `<strong>期間合計:</strong> ${summary.total_hours.toFixed(2)}時間 <br><strong>概算給与:</strong> ${Math.round(summary.total_wage).toLocaleString()}円 (時給: ${summary.hourly_wage}円)`;
            drawChart(result.labels, result.data);
        } else {
            alert(`エラー: ${result.message}`);
        }
    });
}

function drawChart(labels, data) {
    const ctx = document.getElementById('attendance-chart').getContext('2d');
    if (attendanceChart) attendanceChart.destroy();
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
    document.getElementById('btn-goto-admin').addEventListener('click', () => showView('admin'));
    document.getElementById('btn-logout').addEventListener('click', handleManualLogout);
    isMainViewInitialized = true;
}

// ▼▼▼ ここから修正 ▼▼▼
function updateLoginClock() {
    const now = new Date();
    document.getElementById('login-time').textContent = now.toLocaleTimeString('ja-JP');
    document.getElementById('login-date').textContent = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

function startLoginClock() {
    if (loginClockInterval) return; // 既に動いていたら何もしない
    loginClockInterval = setInterval(updateLoginClock, 1000);
    updateLoginClock(); // すぐに一度実行
}

function stopLoginClock() {
    clearInterval(loginClockInterval);
    loginClockInterval = null;
}

function initializeLoginView() {
    if (isLoginViewInitialized) return;
    
    const loginCalendarConfig = {
        date: loginCalendarDate,
        titleEl: document.getElementById('login-calendar-title'),
        gridEl: document.getElementById('login-calendar-grid'),
        cacheKey: 'login',
        isReadOnly: true
    };
    renderCalendar(loginCalendarConfig);

    document.getElementById('login-prev-month-btn').addEventListener('click', () => {
        loginCalendarDate.setMonth(loginCalendarDate.getMonth() - 1);
        renderCalendar(loginCalendarConfig);
    });
    document.getElementById('login-next-month-btn').addEventListener('click', () => {
        loginCalendarDate.setMonth(loginCalendarDate.getMonth() + 1);
        renderCalendar(loginCalendarConfig);
    });

    isLoginViewInitialized = true;
}
// ▲▲▲ 修正 ▲▲▲

function initializeAdminView() {
    if (isAdminViewInitialized) return;
    document.getElementById('btn-back-to-main').addEventListener('click', () => showView('main'));
    document.getElementById('add-employee-form').addEventListener('submit', handleAddEmployee);
    document.getElementById('btn-show-chart').addEventListener('click', showAttendanceChart);
    setDefaultDates();
    loadEmployees();

    document.querySelector('#employee-table tbody').addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-employee-btn')) {
            const employeeId = e.target.dataset.employeeId;
            handleDeleteEmployee(employeeId);
        }
    });

    const adminCalendarConfig = {
        date: adminCalendarDate,
        titleEl: document.getElementById('calendar-title'),
        gridEl: document.getElementById('calendar-grid'),
        cacheKey: 'admin',
        isReadOnly: false
    };

    document.getElementById('prev-month-btn').addEventListener('click', () => {
        adminCalendarDate.setMonth(adminCalendarDate.getMonth() - 1);
        renderCalendar(adminCalendarConfig);
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        adminCalendarDate.setMonth(adminCalendarDate.getMonth() + 1);
        renderCalendar(adminCalendarConfig);
    });
    document.getElementById('today-btn').addEventListener('click', () => {
        adminCalendarDate = new Date();
        renderCalendar(adminCalendarConfig);
    });
    
    document.getElementById('calendar-grid').addEventListener('click', (e) => {
        const cell = e.target.closest('.calendar-day-cell');
        if (cell && cell.dataset.date && e.target.closest('.calendar-event') === null) {
            openEventModal(new Date(cell.dataset.date));
        }
    });

    renderCalendar(adminCalendarConfig);
    isAdminViewInitialized = true;
}


// ===================================================
//  アプリケーション初期化 (エントリーポイント)
// ===================================================
window.addEventListener('pywebviewready', () => {
    views = {
        login: document.getElementById('login-view'),
        main: document.getElementById('main-view'),
        admin: document.getElementById('admin-view'),
        eventModal: document.getElementById('event-modal-overlay')
    };
    calendarGrid = document.getElementById('calendar-grid');
    calendarTitle = document.getElementById('calendar-title');
    eventForm = document.getElementById('event-form');
    eventModalTitle = document.getElementById('event-modal-title');
    deleteEventBtn = document.getElementById('delete-event-btn');
    
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('cancel-event-btn').addEventListener('click', closeEventModal);
    eventForm.addEventListener('submit', handleSaveEvent);
    deleteEventBtn.addEventListener('click', handleDeleteEvent);
    
    document.getElementById('event-allday').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const startInput = document.getElementById('event-start');
        const endInput = document.getElementById('event-end');
        const startDate = new Date(startInput.value.replace('T', ' ') || Date.now());
        const endDate = new Date(endInput.value.replace('T', ' ') || Date.now());
        startInput.type = isChecked ? 'date' : 'datetime-local';
        endInput.type = isChecked ? 'date' : 'datetime-local';
        startInput.value = formatDateForInput(startDate, isChecked);
        endInput.value = formatDateForInput(endDate, isChecked);
    });

    showView('login');
});