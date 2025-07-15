window.addEventListener('pywebviewready', () => {
    // 戻るボタン
    document.getElementById('btn-back-to-main').addEventListener('click', () => {
        // Python API呼び出しをやめて、直接ページ遷移する
        window.location.href = 'index.html';
    });

    // 従業員登録フォーム
    const addEmployeeForm = document.getElementById('add-employee-form');
    addEmployeeForm.addEventListener('submit', handleAddEmployee);

    // ページ読み込み時に従業員一覧をロード
    loadEmployees();
});

function loadEmployees() {
    // Python APIを呼び出し、Promiseを介して結果を処理する
    window.pywebview.api.get_all_employees().then(response => {
        const result = JSON.parse(response);

        if (result.success) {
            const tableBody = document.querySelector("#employee-table tbody");
            tableBody.innerHTML = ''; // テーブルをクリア

            result.employees.forEach(emp => {
                const row = `
                    <tr>
                        <td>${emp.id}</td>
                        <td>${emp.name}</td>
                        <td>${emp.hourly_wage.toLocaleString()}円</td>
                        <td>${emp.is_admin ? '✔' : ''}</td>
                    </tr>
                `;
                tableBody.insertAdjacentHTML('beforeend', row);
            });
        } else {
            alert(result.message);
        }
    }).catch(error => {
        console.error('従業員一覧の取得エラー:', error);
    });
}

function handleAddEmployee(e) {
    e.preventDefault();
    const messageDiv = document.getElementById('add-employee-message');

    const name = document.getElementById('new-name').value;
    const password = document.getElementById('new-password').value;
    const wage = document.getElementById('new-wage').value;
    const isAdmin = document.getElementById('new-is-admin').checked;

    window.pywebview.api.add_employee(name, password, wage, isAdmin).then(response => {
        const result = JSON.parse(response);

        if (result.success) {
            messageDiv.textContent = `従業員「${name}」を登録しました。`;
            messageDiv.className = 'message success';
            e.target.reset(); // フォームをリセット (e.targetのほうが確実)
            loadEmployees(); // 従業員一覧を再読み込み
        } else {
            messageDiv.textContent = `エラー: ${result.message}`;
            messageDiv.className = 'message error';
        }
    }).catch(error => {
        console.error('従業員追加エラー:', error);
        messageDiv.textContent = 'クライアント側でエラーが発生しました。';
        messageDiv.className = 'message error';
    });
}