let currentUser = null;
let timeInterval = null;
let attendanceChart = null;

let isMainViewInitialized = false;
let isAdminViewInitialized = false;

let views = {};

function showView(viewName) {
    for (const key in views) {
        if (views[key]) {
            views[key].style.display = 'none';
        }
    }
    if (views[viewName]) {
        // admin-viewのみflex、他はblock(またはgridなど)で表示
        views[viewName].style.display = (viewName === 'admin') ? 'flex' : 'block';
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
    showView('login');
});

// ===== 各ビューのイベントリスナーを、そのビューが初めて表示されるときに一度だけ設定する =====
function setupMainViewListeners() {
    if (isMainViewInitialized) return;

    document.getElementById('btn-clock-in').addEventListener('click', () => handleAttendance('clock_in'));
    document.getElementById('btn-clock-out').addEventListener('click', () => handleAttendance('clock_out'));
    document.getElementById('btn-start-break').addEventListener('click', () => handleAttendance('start_break'));
    document.getElementById('btn-end-break').addEventListener('click', () => handleAttendance('end_break'));

    document.getElementById('btn-goto-admin').addEventListener('click', () => {
        setupAdminViewListeners(); // 管理者ビューのリスナーを準備
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
            setupMainViewListeners(); // ★メインビューが表示された直後にリスナーを設定
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