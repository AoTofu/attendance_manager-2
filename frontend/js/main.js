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

// ▼▼▼ ここから追加 ▼▼▼
let currentDate = new Date();
let eventsCache = [];

// DOM要素
let calendarGrid, calendarTitle, eventModalOverlay, eventForm, eventModalTitle, deleteEventBtn;
// ▲▲▲ ここまで追加 ▲▲▲


// ===================================================
//  機能別関数 (定義セクション)
// ===================================================

/**
 * 指定したビューを表示する
 */
function showView(viewName) {
    for (const key in views) {
        if (views[key] && key !== 'eventModal') { // モーダルは個別制御
            views[key].style.display = 'none';
        }
    }
    if (views[viewName]) {
        const displayStyle = {
            'login': 'flex',
            'admin': 'flex'
        };
        views[viewName].style.display = displayStyle[viewName] || 'block';
    }

    if (viewName === 'login') {
        stopInactivityObserver();
        if (timeInterval) clearInterval(timeInterval);
    }
    
    // ▼▼▼ ここから追加 ▼▼▼
    if (viewName === 'admin' && !isAdminViewInitialized) {
        initializeAdminView();
    }
    // ▲▲▲ ここまで追加 ▲▲▲
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


// ▼▼▼ ここから追加 ▼▼▼
// --- カレンダー関連 ---

/**
 * カレンダーの表示を更新するメイン関数
 */
async function renderCalendar() {
    calendarTitle.textContent = `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`;
    
    // 表示する月の最初と最後の日を取得
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    // APIからイベントを取得 (月初から1週間前、月末から1週間後までを範囲とする)
    const fetchStartDate = new Date(startOfMonth);
    fetchStartDate.setDate(fetchStartDate.getDate() - 7);
    const fetchEndDate = new Date(endOfMonth);
    fetchEndDate.setDate(fetchEndDate.getDate() + 7);

    const result = await window.pywebview.api.get_events(
        formatDateForAPI(fetchStartDate), 
        formatDateForAPI(fetchEndDate)
    );

    if (result.success) {
        eventsCache = result.events;
        renderMonthView(currentDate, eventsCache);
    } else {
        alert("イベントの読み込みに失敗しました。");
    }
}

/**
 * 月表示ビューを描画する
 */
function renderMonthView(date, events) {
    calendarGrid.innerHTML = '';
    
    // 曜日のヘッダーを追加
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    weekdays.forEach(day => {
        const headerCell = document.createElement('div');
        headerCell.className = 'calendar-header-cell';
        headerCell.textContent = day;
        calendarGrid.appendChild(headerCell);
    });

    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let dayCounter = 1;
    for (let i = 0; i < 42; i++) { // 最大6週間 x 7日 = 42マス
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day-cell';

        if (i >= firstDayOfMonth && dayCounter <= daysInMonth) {
            const cellDate = new Date(year, month, dayCounter);
            dayCell.dataset.date = formatDateForAPI(cellDate).split('T')[0];

            const dateNumber = document.createElement('span');
            dateNumber.className = 'date-number';
            dateNumber.textContent = dayCounter;
            
            if (isToday(cellDate)) {
                dateNumber.classList.add('today');
            }
            dayCell.appendChild(dateNumber);
            
            // この日のイベントをフィルタリングして表示
            const dayEvents = events.filter(e => isEventOnDate(e, cellDate));
            dayEvents.forEach(event => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'calendar-event';
                eventDiv.textContent = event.title;
                eventDiv.addEventListener('click', (e) => {
                    e.stopPropagation(); // 親(セル)のクリックイベントを防ぐ
                    openEventModal(null, event);
                });
                dayCell.appendChild(eventDiv);
            });

            dayCounter++;
        } else {
            dayCell.classList.add('other-month');
        }
        calendarGrid.appendChild(dayCell);
    }
}

/**
 * イベントモーダルを開く
 * @param {Date} date - 新規作成時の日付
 * @param {object} event - 編集時のイベントオブジェクト
 */
function openEventModal(date, event = null) {
    eventForm.reset();
    
    if (event) { // 編集モード
        eventModalTitle.textContent = 'イベントを編集';
        document.getElementById('event-id').value = event.id;
        document.getElementById('event-title').value = event.title;
        document.getElementById('event-description').value = event.description || '';
        document.getElementById('event-allday').checked = event.is_allday;
        
        const start = new Date(event.start_datetime);
        const end = new Date(event.end_datetime);
        
        if (event.is_allday) {
            document.getElementById('event-start').type = 'date';
            document.getElementById('event-end').type = 'date';
            document.getElementById('event-start').value = formatDateForInput(start, true);
            document.getElementById('event-end').value = formatDateForInput(end, true);
        } else {
            document.getElementById('event-start').type = 'datetime-local';
            document.getElementById('event-end').type = 'datetime-local';
            document.getElementById('event-start').value = formatDateForInput(start, false);
            document.getElementById('event-end').value = formatDateForInput(end, false);
        }
        deleteEventBtn.style.display = 'block';

    } else { // 新規作成モード
        eventModalTitle.textContent = 'イベントを追加';
        document.getElementById('event-id').value = '';
        const start = new Date(date);
        start.setHours(9, 0, 0, 0); // デフォルト9時
        const end = new Date(date);
        end.setHours(10, 0, 0, 0); // デフォルト10時

        document.getElementById('event-start').value = formatDateForInput(start, false);
        document.getElementById('event-end').value = formatDateForInput(end, false);
        deleteEventBtn.style.display = 'none';
    }

    views.eventModal.style.display = 'flex';
}

function closeEventModal() {
    views.eventModal.style.display = 'none';
}


// --- ヘルパー関数 ---
function formatDateForAPI(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function formatDateForInput(date, isAllDay) {
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    if (isAllDay) {
        return `${year}-${month}-${day}`;
    }
    const hours = ('0' + date.getHours()).slice(-2);
    const minutes = ('0' + date.getMinutes()).slice(-2);
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
}

function isEventOnDate(event, date) {
    const eventStart = new Date(event.start_datetime.replace(' ', 'T') + 'Z');
    const eventEnd = new Date(event.end_datetime.replace(' ', 'T') + 'Z');
    // タイムゾーンオフセットを考慮
    const tzOffset = date.getTimezoneOffset() * 60000;
    const dateStart = new Date(date.setHours(0, 0, 0, 0) - tzOffset);
    const dateEnd = new Date(date.setHours(23, 59, 59, 999) - tzOffset);
    return eventStart < dateEnd && eventEnd > dateStart;
}

// ▲▲▲ ここまで追加 ▲▲▲


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
        showView('admin');
    });
    document.getElementById('btn-logout').addEventListener('click', handleManualLogout);
    isMainViewInitialized = true;
}

// ▼▼▼ `setupAdminViewListeners` を `initializeAdminView` に変更し、初回のみ実行されるように修正 ▼▼▼
function initializeAdminView() {
    if (isAdminViewInitialized) return;
    
    document.getElementById('btn-back-to-main').addEventListener('click', () => showView('main'));
    document.getElementById('add-employee-form').addEventListener('submit', handleAddEmployee);
    document.getElementById('btn-show-chart').addEventListener('click', showAttendanceChart);
    setDefaultDates();
    loadEmployees();

    // カレンダーナビゲーション
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
    document.getElementById('today-btn').addEventListener('click', () => {
        currentDate = new Date();
        renderCalendar();
    });
    
    // カレンダーセルへのクリックイベント（イベント追加）
    calendarGrid.addEventListener('click', (e) => {
        const cell = e.target.closest('.calendar-day-cell');
        if (cell && cell.dataset.date) {
            openEventModal(new Date(cell.dataset.date));
        }
    });

    renderCalendar(); // 初回描画
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
        eventModal: document.getElementById('event-modal-overlay') // モーダルもviewsに追加
    };
    // ▼▼▼ ここから追加 ▼▼▼
    calendarGrid = document.getElementById('calendar-grid');
    calendarTitle = document.getElementById('calendar-title');
    eventForm = document.getElementById('event-form');
    eventModalTitle = document.getElementById('event-modal-title');
    deleteEventBtn = document.getElementById('delete-event-btn');
    // ▲▲▲ ここまで追加 ▲▲▲
    
    // --- イベントリスナー設定 ---
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // ▼▼▼ ここから追加 ▼▼▼
    // モーダル関連のイベントリスナー
    document.getElementById('cancel-event-btn').addEventListener('click', closeEventModal);
    
    // 「終日」チェックボックスの挙動
    document.getElementById('event-allday').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const startInput = document.getElementById('event-start');
        const endInput = document.getElementById('event-end');

        startInput.type = isChecked ? 'date' : 'datetime-local';
        endInput.type = isChecked ? 'date' : 'datetime-local';
        
        // 値を一旦保持してフォーマット変更
        const startDate = new Date(startInput.value || Date.now());
        const endDate = new Date(endInput.value || Date.now());

        if(isChecked){
            startInput.value = formatDateForInput(startDate, true);
            endInput.value = formatDateForInput(endDate, true);
        } else {
            startInput.value = formatDateForInput(startDate, false);
            endInput.value = formatDateForInput(endDate, false);
        }
    });
    // ▲▲▲ ここまで追加 ▲▲▲

    // --- 初期表示 ---
    showView('login');
});