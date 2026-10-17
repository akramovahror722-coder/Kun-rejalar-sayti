let kanbanTasks = [];
localStorage.removeItem('enterprise_kanban_tasks');

let teamMembers = JSON.parse(localStorage.getItem('enterprise_team_members')) || [
    { name: 'Aziz (Lead)', initials: 'AZ', bg: '#3b82f6' },
    { name: 'Malika (UI/UX)', initials: 'ML', bg: '#ec4899' },
    { name: 'Jasur (Backend)', initials: 'JS', bg: '#10b981' },
    { name: 'Madina (QA)', initials: 'MD', bg: '#f59e0b' }
];

let currentFilter = 'all';
let currentSort = 'default';
let searchQuery = '';
let activeTaskId = null;
let pendingDeleteId = null;

// Timer variables
let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;

// Web Audio API beep sound generator for drag-and-drop
function playDropSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) { }
}

// Initialize Theme
(function initTheme() {
    const savedTheme = localStorage.getItem('enterprise_kanban_theme') || 'dark';
    const htmlEl = document.documentElement;
    const icon = document.getElementById('themeIcon');
    if (savedTheme === 'light') {
        htmlEl.classList.remove('dark');
        htmlEl.classList.add('light');
        if (icon) icon.className = 'fa-solid fa-sun';
    } else {
        htmlEl.classList.remove('light');
        htmlEl.classList.add('dark');
        if (icon) icon.className = 'fa-solid fa-moon';
    }
})();

function updateAssigneeDropdown(selectedVal = '') {
    const select = document.getElementById('taskAssigneeInput');
    select.innerHTML = '';
    teamMembers.forEach(member => {
        const opt = document.createElement('option');
        opt.value = member.name;
        opt.innerText = member.name;
        if (member.name === selectedVal) opt.selected = true;
        select.appendChild(opt);
    });
}

function renderKanbanBoard() {
    const columns = ['todo', 'progress', 'review', 'done'];

    columns.forEach(status => {
        const container = document.getElementById(status);
        container.innerHTML = '';

        let filtered = kanbanTasks.filter(t => t.status === status);

        if (searchQuery) {
            filtered = filtered.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        if (currentFilter === 'high') filtered = filtered.filter(t => t.priority === 'high');
        if (currentFilter === 'bug') filtered = filtered.filter(t => t.tag === 'bug');
        if (currentFilter === 'feature') filtered = filtered.filter(t => t.tag === 'feature');

        // Sorting logic
        if (currentSort === 'priority') {
            const weights = { high: 3, medium: 2, low: 1 };
            filtered.sort((a, b) => weights[b.priority] - weights[a.priority]);
        } else if (currentSort === 'dueDate') {
            filtered.sort((a, b) => {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            });
        }

        document.getElementById(`count-${status}`).innerText = filtered.length;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-column-state">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>Vazifalar yo'q</p>
                </div>
            `;
        } else {
            filtered.forEach(task => {
                const card = document.createElement('div');
                card.className = 'task-card';
                card.draggable = true;
                card.id = task.id;

                // Drag and drop event listeners for reordering & moving
                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', task.id);
                    setTimeout(() => card.classList.add('dragging'), 0);
                });
                card.addEventListener('dragend', () => card.classList.remove('dragging'));

                card.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const draggingCard = document.querySelector('.dragging');
                    if (draggingCard && draggingCard !== card) {
                        const rect = card.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        if (e.clientY < midY) {
                            card.parentNode.insertBefore(draggingCard, card);
                        } else {
                            card.parentNode.insertBefore(draggingCard, card.nextSibling);
                        }
                    }
                });

                let pClass = 'priority-medium', pText = 'O\'rta';
                if (task.priority === 'high') { pClass = 'priority-high'; pText = 'Muhim'; }
                if (task.priority === 'low') { pClass = 'priority-low'; pText = 'Past'; }

                let formattedDate = formatDueDate(task.dueDate);
                let isOverdue = task.dueDate && new Date(task.dueDate) < new Date().setHours(0, 0, 0, 0) && status !== 'done';

                const totalChecklist = task.checklist ? task.checklist.length : 0;
                const completedChecklist = task.checklist ? task.checklist.filter(i => i.done).length : 0;
                const totalComments = task.comments ? task.comments.length : 0;
                const totalAttachments = task.attachments ? task.attachments.length : 0;

                const memberObj = teamMembers.find(m => m.name === task.assignee) || { initials: 'AD', bg: '#6366f1' };

                card.innerHTML = `
                    <div class="task-card-header">
                        <div class="tags-row">
                            <span class="priority-tag ${pClass}">${pText}</span>
                            <span class="category-tag">${task.tag}</span>
                        </div>
                        <div class="card-action-btns">
                            <button class="edit-task-btn" onclick="openEditTaskModal('${task.id}')" title="Tahrirlash"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="delete-task-btn" onclick="confirmDelete('${task.id}')" title="O'chirish"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                    <div class="task-title" onclick="openDetailsModal('${task.id}')">${task.title}</div>
                    <div class="task-desc">${task.desc || 'Tavsif yo\'q'}</div>
                    
                    <div class="task-badges-row">
                        ${totalChecklist > 0 ? `<span class="meta-badge"><i class="fa-solid fa-check-double"></i> ${completedChecklist}/${totalChecklist}</span>` : ''}
                        ${totalComments > 0 ? `<span class="meta-badge"><i class="fa-regular fa-comment"></i> ${totalComments}</span>` : ''}
                        ${totalAttachments > 0 ? `<span class="meta-badge"><i class="fa-solid fa-paperclip"></i> ${totalAttachments}</span>` : ''}
                        ${task.timeSpent > 0 ? `<span class="meta-badge"><i class="fa-regular fa-clock"></i> ${Math.round(task.timeSpent)}m</span>` : ''}
                    </div>

                    <div class="task-footer">
                        <div class="assignee-badge-wrap" title="${task.assignee || 'Admin'}">
                            <span class="assignee-name-text">${(task.assignee || 'Admin').split(' ')[0]}</span>
                        </div>
                        <span class="due-date-badge ${isOverdue ? 'overdue' : ''}"><i class="fa-regular fa-calendar"></i> ${formattedDate}</span>
                    </div>
                `;
                container.appendChild(card);
            });
        }
    });

    const completedCount = kanbanTasks.filter(t => t.status === 'done').length;
    const urgentCount = kanbanTasks.filter(t => t.priority === 'high').length;

    document.getElementById('statTotal').innerText = kanbanTasks.length;
    document.getElementById('statCompleted').innerText = completedCount;
    document.getElementById('statUrgent').innerText = urgentCount;

    let percent = kanbanTasks.length > 0 ? Math.round((completedCount / kanbanTasks.length) * 100) : 0;
    document.getElementById('statPercent').innerText = percent + '%';
    document.getElementById('statProgressBar').style.width = percent + '%';

    localStorage.setItem('enterprise_kanban_tasks', JSON.stringify(kanbanTasks));
}

function formatDueDate(dateStr) {
    if (!dateStr) return 'Muddatsiz';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((targetDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Bugun';
    if (diffDays === 1) return 'Ertaga';
    if (diffDays > 1 && diffDays <= 3) return `${diffDays} kun qoldi`;
    if (diffDays === -1) return 'Kecha edi';
    return dateStr;
}

function setFilter(filterType, btnElem) {
    currentFilter = filterType;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btnElem.classList.add('active');
    renderKanbanBoard();
}

function changeSort() {
    currentSort = document.getElementById('sortSelect').value;
    renderKanbanBoard();
}

function filterTasks() {
    searchQuery = document.getElementById('searchInput').value;
    renderKanbanBoard();
}

function logActivity(task, text) {
    if (!task.activityLog) task.activityLog = [];
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    task.activityLog.unshift({ text, time: timeStr });
}

function openTaskModal() {
    document.getElementById('editingTaskId').value = '';
    document.getElementById('modalHeaderTitle').innerText = "Yangi Vazifa Qo'shish";
    document.getElementById('taskSubmitBtn').innerText = "Saqlash";
    updateAssigneeDropdown();
    document.getElementById('taskModal').style.display = 'flex';
}

function openEditTaskModal(id) {
    const task = kanbanTasks.find(t => t.id === id);
    if (!task) return;

    document.getElementById('editingTaskId').value = task.id;
    document.getElementById('taskTitleInput').value = task.title;
    document.getElementById('taskDescInput').value = task.desc || '';
    document.getElementById('taskPriorityInput').value = task.priority;
    document.getElementById('taskTagInput').value = task.tag;
    updateAssigneeDropdown(task.assignee);
    document.getElementById('taskDueDateInput').value = task.dueDate || '';

    document.getElementById('modalHeaderTitle').innerText = "Vazifani Tahrirlash";
    document.getElementById('taskSubmitBtn').innerText = "Yangilash";
    document.getElementById('taskModal').style.display = 'flex';
}

function closeTaskModal() {
    document.getElementById('taskModal').style.display = 'none';
    document.getElementById('taskForm').reset();
    document.getElementById('editingTaskId').value = '';
}

function handleTaskSubmit(e) {
    e.preventDefault();
    const editingId = document.getElementById('editingTaskId').value;

    const title = document.getElementById('taskTitleInput').value;
    const desc = document.getElementById('taskDescInput').value;
    const priority = document.getElementById('taskPriorityInput').value;
    const tag = document.getElementById('taskTagInput').value;
    const assignee = document.getElementById('taskAssigneeInput').value;
    const dueDate = document.getElementById('taskDueDateInput').value;

    if (editingId) {
        const task = kanbanTasks.find(t => t.id === editingId);
        if (task) {
            task.title = title;
            task.desc = desc;
            task.priority = priority;
            task.tag = tag;
            task.assignee = assignee;
            task.dueDate = dueDate;
            logActivity(task, `Vazifa tahrirlandi`);
            showToast('Vazifa yangilandi!', 'success');
        }
    } else {
        const newTask = {
            id: 'T-' + Math.floor(1000 + Math.random() * 9000),
            title,
            desc,
            priority,
            tag,
            assignee,
            dueDate,
            status: 'todo',
            checklist: [],
            comments: [],
            activityLog: [],
            attachments: [],
            timeSpent: 0
        };
        logActivity(newTask, `Vazifa yaratildi`);
        kanbanTasks.push(newTask);
        showToast('Yangi vazifa qo\'shildi!', 'success');
    }

    renderKanbanBoard();
    closeTaskModal();
}

function confirmDelete(id) {
    pendingDeleteId = id;
    document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    pendingDeleteId = null;
}

document.getElementById('confirmDeleteBtn').addEventListener('click', function () {
    if (pendingDeleteId) {
        kanbanTasks = kanbanTasks.filter(t => t.id !== pendingDeleteId);
        if (activeTaskId === pendingDeleteId) closeDetailsModal();
        renderKanbanBoard();
        showToast('Vazifa o\'chirildi!', 'error');
    }
    closeConfirmModal();
});

// Details Modal & Features
function openDetailsModal(id) {
    activeTaskId = id;
    const task = kanbanTasks.find(t => t.id === id);
    if (!task) return;

    document.getElementById('detailTitle').innerText = task.title;
    document.getElementById('detailDesc').innerText = task.desc || 'Tavsif mavjud emas';

    // Reset and setup timer for this task
    resetTimerUI();
    document.getElementById('totalTimeSpent').innerText = Math.round(task.timeSpent || 0) + ' min';

    renderChecklist();
    renderComments();
    renderAttachments();
    renderActivityLog();

    document.getElementById('detailsModal').style.display = 'flex';
}

function closeDetailsModal() {
    stopTimer();
    document.getElementById('detailsModal').style.display = 'none';
    activeTaskId = null;
}

// Timer Functions
function toggleTimer() {
    if (!isTimerRunning) {
        startTimer();
    } else {
        stopTimer();
    }
}

function startTimer() {
    isTimerRunning = true;
    const btn = document.getElementById('startTimerBtn');
    btn.innerHTML = `<i class="fa-solid fa-pause"></i> To'xtatish`;
    btn.style.background = '#f59e0b';

    timerInterval = setInterval(() => {
        timerSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function stopTimer() {
    if (!isTimerRunning) return;
    isTimerRunning = false;
    clearInterval(timerInterval);

    const btn = document.getElementById('startTimerBtn');
    btn.innerHTML = `<i class="fa-solid fa-play"></i> Davom etish`;
    btn.style.background = 'var(--accent)';

    const task = kanbanTasks.find(t => t.id === activeTaskId);
    if (task) {
        const minutesElapsed = timerSeconds / 60;
        task.timeSpent = (task.timeSpent || 0) + minutesElapsed;
        document.getElementById('totalTimeSpent').innerText = Math.round(task.timeSpent) + ' min';
        logActivity(task, `Vaqt yozildi: +${Math.ceil(minutesElapsed)} min`);
        renderKanbanBoard();
    }
    timerSeconds = 0;
}

function resetTimer() {
    stopTimer();
    timerSeconds = 0;
    updateTimerDisplay();
}

function resetTimerUI() {
    isTimerRunning = false;
    clearInterval(timerInterval);
    timerSeconds = 0;
    updateTimerDisplay();
    const btn = document.getElementById('startTimerBtn');
    btn.innerHTML = `<i class="fa-solid fa-play"></i> Boshlash`;
    btn.style.background = 'var(--accent)';
}

function updateTimerDisplay() {
    const hrs = String(Math.floor(timerSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(timerSeconds % 60).padStart(2, '0');
    document.getElementById('timerDisplay').innerText = `${hrs}:${mins}:${secs}`;
}

// Attachments Management
function uploadAttachment(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        const task = kanbanTasks.find(t => t.id === activeTaskId);
        if (task) {
            if (!task.attachments) task.attachments = [];
            task.attachments.push({ name: file.name, data: event.target.result });
            logActivity(task, `Fayl biriktirildi: ${file.name}`);
            renderAttachments();
            renderKanbanBoard();
            showToast('Fayl yuklandi!', 'success');
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function renderAttachments() {
    const task = kanbanTasks.find(t => t.id === activeTaskId);
    const container = document.getElementById('attachmentsContainer');
    container.innerHTML = '';
    if (!task.attachments || task.attachments.length === 0) {
        container.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">Biriktirilgan fayllar yo\'q</p>';
        return;
    }
    task.attachments.forEach((att, index) => {
        const div = document.createElement('div');
        div.className = 'attachment-item';
        div.innerHTML = `
            <a href="${att.data}" download="${att.name}" target="_blank"><i class="fa-solid fa-file-arrow-down"></i> ${att.name}</a>
            <button onclick="deleteAttachment(${index})" class="delete-att-btn"><i class="fa-solid fa-xmark"></i></button>
        `;
        container.appendChild(div);
    });
}

function deleteAttachment(index) {
    const task = kanbanTasks.find(t => t.id === activeTaskId);
    if (task && task.attachments) {
        task.attachments.splice(index, 1);
        renderAttachments();
        renderKanbanBoard();
        showToast('Fayl o\'chirildi', 'info');
    }
}

// Browser Notifications Permission
function requestNotificationPermission() {
    if (!("Notification" in window)) {
        showToast('Brauzeringiz bildirishnomani qo\'llab-quvvatlamaydi', 'error');
        return;
    }
    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            showToast('Bildirishnomalar muvaffaqiyatli yoqildi!', 'success');
            checkDueDatesAndNotify();
        } else {
            showToast('Bildirishnoma ruxsati berilmadi', 'info');
        }
    });
}

function checkDueDatesAndNotify() {
    if (Notification.permission !== "granted") return;
    const todayStr = new Date().toISOString().split('T')[0];
    kanbanTasks.forEach(task => {
        if (task.dueDate === todayStr && task.status !== 'done') {
            new Notification("ProKanban Eslatma", {
                body: `Bugun bajarilishi kerak bo'lgan vazifa: "${task.title}"`,
                icon: "https://cdn-icons-png.flaticon.com/512/906/906334.png"
            });
        }
    });
}

function renderChecklist() {
    const task = kanbanTasks.find(t => t.id === activeTaskId);
    const container = document.getElementById('checklistContainer');
    container.innerHTML = '';
    if (!task.checklist || task.checklist.length === 0) {
        container.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">Chek-list qadamlari yo\'q</p>';
        return;
    }
    task.checklist.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `checklist-item ${item.done ? 'completed' : ''}`;
        div.innerHTML = `
            <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleSubtask(${index})">
            <span>${item.text}</span>
        `;
        container.appendChild(div);
    });
}

function addSubtask() {
    const input = document.getElementById('newSubtaskInput');
    const text = input.value.trim();
    if (!text) return;
    const task = kanbanTasks.find(t => t.id === activeTaskId);
    task.checklist.push({ text, done: false });
    logActivity(task, `Qadam qo'shildi: "${text}"`);
    input.value = '';
    renderChecklist();
    renderKanbanBoard();
}

function toggleSubtask(index) {
    const task = kanbanTasks.find(t => t.id === activeTaskId);
    task.checklist[index].done = !task.checklist[index].done;
    renderChecklist();
    renderKanbanBoard();
}

function renderComments() {
    const task = kanbanTasks.find(t => t.id === activeTaskId);
    const container = document.getElementById('commentsContainer');
    container.innerHTML = '';
    if (!task.comments || task.comments.length === 0) {
        container.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">Hozircha izohlar yo\'q</p>';
        return;
    }
    task.comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'comment-bubble';
        div.innerText = c.text;
        container.appendChild(div);
    });
}

function addComment() {
    const input = document.getElementById('newCommentInput');
    const text = input.value.trim();
    if (!text) return;
    const task = kanbanTasks.find(t => t.id === activeTaskId);
    task.comments.push({ text });
    logActivity(task, `Izoh yozildi`);
    input.value = '';
    renderComments();
    renderKanbanBoard();
}

function renderActivityLog() {
    const task = kanbanTasks.find(t => t.id === activeTaskId);
    const container = document.getElementById('activityLogContainer');
    container.innerHTML = '';
    if (!task.activityLog || task.activityLog.length === 0) {
        container.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">Tarix bo\'sh</p>';
        return;
    }
    task.activityLog.forEach(log => {
        const div = document.createElement('div');
        div.className = 'activity-item';
        div.innerHTML = `<span><i class="fa-solid fa-clock-rotate-left"></i> ${log.text}</span> <span class="log-time">${log.time}</span>`;
        container.appendChild(div);
    });
}

// Drag and Drop with sound & visual feedback
function allowDrop(e) { e.preventDefault(); }
function addDropStyle(e) { e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.08)'; }
function removeDropStyle(e) { e.currentTarget.style.backgroundColor = 'transparent'; }

function drop(e, newStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const task = kanbanTasks.find(t => t.id === id);
    if (task && task.status !== newStatus) {
        task.status = newStatus;
        logActivity(task, `Ustun o'zgartirildi: ${newStatus}`);
        playDropSound();
        renderKanbanBoard();
        showToast('Vazifa ko\'chirildi!', 'info');
    }
}

// Export JSON
function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(kanbanTasks));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "kanban_backup.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('JSON eksport qilindi', 'success');
}

// Export CSV / Excel format
function exportToCSV() {
    let csvContent = "data:text/csv;charset=utf-8,ID,Nomi,Tavsif,Daraja,Teg,Mas'ul,Holat,Muddati\r\n";
    kanbanTasks.forEach(t => {
        let row = [t.id, `"${t.title}"`, `"${t.desc || ''}"`, t.priority, t.tag, `"${t.assignee}"`, t.status, t.dueDate || ''];
        csvContent += row.join(",") + "\r\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "kanban_report.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Excel/CSV hisoboti yuklandi', 'success');
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            kanbanTasks = JSON.parse(event.target.result);
            renderKanbanBoard();
            showToast('Muvaffaqiyatli import qilindi!', 'success');
        } catch (err) {
            showToast('Xatolik: Fayl formati noto\'g\'ri!', 'error');
        }
    };
    reader.readAsText(file);
}

function toggleTheme() {
    const body = document.documentElement;
    const icon = document.getElementById('themeIcon');
    if (body.classList.contains('light')) {
        body.classList.remove('light');
        body.classList.add('dark');
        icon.className = 'fa-solid fa-moon';
        localStorage.setItem('enterprise_kanban_theme', 'dark');
    } else {
        body.classList.remove('dark');
        body.classList.add('light');
        icon.className = 'fa-solid fa-sun';
        localStorage.setItem('enterprise_kanban_theme', 'light');
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    let iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-exclamation';
    if (type === 'info') iconClass = 'fa-circle-info';

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

document.addEventListener('keydown', function (e) {
    if ((e.key === 'n' || e.key === 'N') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        openTaskModal();
    }
    if (e.key === 'Escape') {
        closeTaskModal();
        closeDetailsModal();
        closeConfirmModal();
    }
});

// --- Yangi funksiyalarning JavaScript kodi ---

// A. Ovozli qidiruv (Speech Recognition API)
function startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Brauzeringiz ovozli qidiruvni qo\'llab-quvvatlamaydi', 'error');
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'uz-UZ';
    const micIcon = document.getElementById('micIcon');

    recognition.onstart = () => {
        micIcon.parentElement.classList.add('listening');
        showToast('Tinglayapman, gapiring...', 'info');
    };

    recognition.onresult = (event) => {
        const speechToText = event.results[0][0].transcript;
        document.getElementById('searchInput').value = speechToText;
        filterTasks();
    };

    recognition.onerror = () => {
        showToast('Ovozni aniqlashda xatolik yuz berdi', 'error');
    };

    recognition.onend = () => {
        micIcon.parentElement.classList.remove('listening');
    };

    recognition.start();
}

// B. Ko'rinishni o'zgartirish (Kanban vs Kalendar)
function switchView(viewType) {
    const kanbanMain = document.querySelector('.kanban-main');
    const calendarBox = document.getElementById('calendarViewContainer');
    const kanbanBtn = document.getElementById('kanbanViewBtn');
    const calendarBtn = document.getElementById('calendarViewBtn');

    if (viewType === 'calendar') {
        kanbanMain.style.display = 'none';
        calendarBox.style.display = 'grid';
        calendarBtn.style.background = 'var(--accent)';
        calendarBtn.style.color = 'white';
        kanbanBtn.style.background = 'transparent';
        kanbanBtn.style.color = 'var(--text-muted)';
        renderCalendarView();
    } else {
        calendarBox.style.display = 'none';
        kanbanMain.style.display = 'grid';
        kanbanBtn.style.background = 'var(--accent)';
        kanbanBtn.style.color = 'white';
        calendarBtn.style.background = 'transparent';
        calendarBtn.style.color = 'var(--text-muted)';
        renderKanbanBoard();
    }
}

function renderCalendarView() {
    const container = document.getElementById('calendarViewContainer');
    container.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];

        const dayCard = document.createElement('div');
        dayCard.className = 'calendar-day-card';

        let dayTasks = kanbanTasks.filter(t => t.dueDate === dateStr);
        if (searchQuery) {
            dayTasks = dayTasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        dayCard.innerHTML = `
            <div class="calendar-day-header">
                <span>${d.toLocaleDateString('uz-UZ', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <span class="badge-count">${dayTasks.length}</span>
            </div>
            <div class="calendar-day-tasks" style="display:flex; flex-direction:column; gap:8px;">
                ${dayTasks.length === 0 ? '<p style="font-size:11px; color:var(--text-muted);">Vazifalar yo\'q</p>' : ''}
                ${dayTasks.map(t => `<div class="task-card" style="padding:10px; cursor:pointer;" onclick="openDetailsModal('${t.id}')"><strong>${t.title}</strong></div>`).join('')}
            </div>
        `;
        container.appendChild(dayCard);
    }
}

// C. Rangli mavzularni o'zgartirish
function changeThemeStyle() {
    const val = document.getElementById('themeStyleSelect').value;
    document.documentElement.setAttribute('data-theme-style', val);
    localStorage.setItem('enterprise_kanban_theme_style', val);
}

// Sahifa yuklanganda saqlangan mavzuni tiklash
(function loadThemeStyle() {
    const savedStyle = localStorage.getItem('enterprise_kanban_theme_style') || 'default';
    document.documentElement.setAttribute('data-theme-style', savedStyle);
    const select = document.getElementById('themeStyleSelect');
    if (select) select.value = savedStyle;
})();
// --- AI Assistant Logic ---

// Tez-tez so'raladigan savollar (FAQ) ro'yxati - faqat sayt/tizim ishlatilishi haqida
const aiFaqData = [
    {
        id: 'add-task',
        label: "Vazifa qo'shish",
        icon: 'fa-plus',
        question: "Yangi vazifani qanday qo'shaman?",
        keywords: ['qo\'shaman', 'qoshaman', 'yangi vazifa', 'vazifa qush', 'vazifa qo\'sh', 'create task', 'add task'],
        answer: "Yangi vazifa qo'shish uchun yuqori o'ng burchakdagi <strong>'+ Yangi Vazifa'</strong> tugmasini bosing. Ochilgan oynada nomi, tavsifi, darajasi, kategoriyasi, mas'ul shaxs va tugash sanasini kiritib, 'Saqlash' tugmasini bosing."
    },
    {
        id: 'move-task',
        label: "Vazifani ko'chirish",
        icon: 'fa-arrows-up-down-left-right',
        question: "Vazifani boshqa ustunga qanday ko'chiraman?",
        keywords: ['ko\'chir', 'kochir', 'drag', 'sudra', 'ustunga'],
        answer: "Vazifa kartochkasini sichqoncha bilan bosib ushlab turing (drag & drop) va kerakli ustunga (Rejadagilar, Jarayonda, Tekshiruvda, Bajarilgan) sudrab olib boring."
    },
    {
        id: 'export',
        label: "Eksport qilish",
        icon: 'fa-download',
        question: "Ma'lumotlarni qanday eksport qilaman?",
        keywords: ['eksport', 'export', 'zaxira', 'yuklab ol'],
        answer: "Header qismidagi <strong>'Eksport'</strong> tugmasi orqali barcha ma'lumotlarni JSON formatida, <strong>'Excel'</strong> tugmasi orqali esa CSV formatida yuklab olishingiz mumkin."
    },
    {
        id: 'import',
        label: "Import qilish",
        icon: 'fa-upload',
        question: "Avval saqlangan ma'lumotlarni qanday import qilaman?",
        keywords: ['import', 'yuklash', 'tiklash'],
        answer: "Header qismidagi <strong>'Import'</strong> tugmasini bosib, oldin eksport qilingan .json faylni tanlang - barcha vazifalaringiz tiklanadi."
    },
    {
        id: 'theme',
        label: "Mavzuni o'zgartirish",
        icon: 'fa-palette',
        question: "Rangli mavzuni (theme) qanday o'zgartiraman?",
        keywords: ['mavzu', 'theme', 'rang', 'rejim', 'dark', 'light'],
        answer: "Header'dagi <strong>'Mavzu'</strong> tanlash oynasidan Standart, Zumrad yoki Cyberpunk mavzularini tanlashingiz mumkin. Oy/quyosh belgisi orqali esa och/tund rejimini almashtirasiz."
    },
    {
        id: 'calendar',
        label: "Kalendar ko'rinishi",
        icon: 'fa-calendar-days',
        question: "Kalendar ko'rinishi nima uchun kerak?",
        keywords: ['kalendar', 'calendar'],
        answer: "Header'dagi <strong>'Kalendar'</strong> tugmasi vazifalaringizni tugash sanasi bo'yicha kalendar ko'rinishida ko'rsatadi, bu muddatlarni oson kuzatishga yordam beradi."
    },
    {
        id: 'checklist',
        label: "Chek-list qo'shish",
        icon: 'fa-list-check',
        question: "Vazifaga chek-list (sub-vazifa) qanday qo'shaman?",
        keywords: ['chek-list', 'cheklist', 'sub-vazifa', 'subtask'],
        answer: "Vazifa kartochkasini ochib, 'Chek-list (Sub-vazifalar)' bo'limidan yangi qadam matnini yozib, 'Qo'shish' tugmasini bosing."
    },
    {
        id: 'timer',
        label: "Vaqt hisoblagich",
        icon: 'fa-stopwatch',
        question: "Vaqt hisoblagich (Timer) qanday ishlaydi?",
        keywords: ['timer', 'vaqt', 'pomodoro', 'hisoblagich'],
        answer: "Vazifa tafsilotlari oynasida 'Vaqtni o'lchash' bo'limi bor. 'Boshlash' tugmasi orqali taymerni ishga tushirasiz, u shu vazifaga sarflangan vaqtni avtomatik hisoblab boradi."
    },
    {
        id: 'filter',
        label: "Qidirish va filtrlash",
        icon: 'fa-magnifying-glass',
        question: "Vazifalarni qanday qidiraman va filtrlayman?",
        keywords: ['qidir', 'filtr', 'search', 'tartibla'],
        answer: "Yuqoridagi qidiruv maydoniga vazifa nomini yozing yoki mikrofon belgisi orqali ovozli qidiruvdan foydalaning. 'Barchasi/Muhim/Bug/Feature' tugmalari va 'Tartiblash' menyusi orqali natijalarni cheklashingiz mumkin."
    }
];

const AI_FALLBACK_MSG = "Kechirasiz, men bu savolga javob bera olmayman. Men faqat ProKanban tizimidan foydalanish bo'yicha savollarga javob beraman. Iltimos, pastdagi tayyor savollardan birini tanlang yoki tizim bo'yicha boshqa savol bering.";

function renderAiFaqChips() {
    const container = document.getElementById('aiSuggestedQuestions');
    if (!container) return;
    const chips = aiFaqData.map(item =>
        `<button class="ai-faq-chip" onclick="askAiFaq('${item.id}')"><i class="fa-solid ${item.icon}"></i> ${escapeHtml(item.label)}</button>`
    ).join('');
    container.innerHTML = `<div class="ai-suggested-label">Tez-tez so'raladigan savollar</div>${chips}`;
}

function askAiFaq(id) {
    const item = aiFaqData.find(f => f.id === id);
    if (!item) return;
    const messagesBox = document.getElementById('aiChatMessages');
    messagesBox.innerHTML += `<div class="ai-msg user">${escapeHtml(item.question)}</div>`;
    messagesBox.scrollTop = messagesBox.scrollHeight;

    setTimeout(() => {
        messagesBox.innerHTML += `<div class="ai-msg bot">${item.answer}</div>`;
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }, 500);
}

function findFaqMatch(text) {
    const lower = text.toLowerCase();
    return aiFaqData.find(item => item.keywords.some(k => lower.includes(k)));
}

function toggleAIChat() {
    const chatWin = document.getElementById('aiChatWindow');
    if (chatWin.style.display === 'none' || chatWin.style.display === '') {
        chatWin.style.display = 'flex';
        renderAiFaqChips();
    } else {
        chatWin.style.display = 'none';
    }
}

function handleAIPress(e) {
    if (e.key === 'Enter') {
        sendAIMessage();
    }
}

function sendAIMessage() {
    const inputField = document.getElementById('aiUserInput');
    const text = inputField.value.trim();
    if (!text) return;

    const messagesBox = document.getElementById('aiChatMessages');

    // Foydalanuvchi xabarini chiqarish
    messagesBox.innerHTML += `<div class="ai-msg user">${escapeHtml(text)}</div>`;
    inputField.value = '';
    messagesBox.scrollTop = messagesBox.scrollHeight;

    // AI simulyatsiyasi / Javob qaytarish - faqat FAQ mavzulariga javob beradi
    setTimeout(() => {
        const lower = text.toLowerCase();
        let reply;

        if (lower.includes('salom') || lower.includes('assalomu alaykum')) {
            reply = "Salomat bo'ling! Tizimdan foydalanish bo'yicha savollaringiz bo'lsa, pastdagi tayyor savollardan birini tanlashingiz yoki yozishingiz mumkin.";
        } else {
            const match = findFaqMatch(text);
            reply = match ? match.answer : AI_FALLBACK_MSG;
        }

        messagesBox.innerHTML += `<div class="ai-msg bot">${reply}</div>`;
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }, 600);
}

// Xavfsizlik uchun HTML elementlarni tozalash funksiyasi
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Sahifa yuklanganda tez-tez so'raladigan savollarni tayyorlab qo'yish
document.addEventListener('DOMContentLoaded', renderAiFaqChips);

// --- Presentation Command Center ---
const commandDefinitions = [
    { id: 'new', label: 'Yangi vazifa yaratish', hint: 'Ishlar ro\'yxatiga vazifa qo\'shish', icon: 'fa-plus', action: openTaskModal },
    { id: 'focus', label: 'Focus mode ni almashtirish', hint: 'Faqat ish maydonini qoldirish', icon: 'fa-expand', action: toggleFocusMode },
    { id: 'insights', label: 'Project insights ni ochish', hint: 'Loyiha ko\'rsatkichlarini ko\'rish', icon: 'fa-chart-line', action: openInsights },
    { id: 'calendar', label: 'Kalendarni ochish', hint: 'Muddatlarni vaqt bo\'yicha ko\'rish', icon: 'fa-calendar-days', action: () => switchView('calendar') },
    { id: 'board', label: 'Kanban taxtasini ochish', hint: 'Vazifalarni ustunlarda ko\'rish', icon: 'fa-table-columns', action: () => switchView('kanban') },
    { id: 'export', label: 'JSON zaxira yuklash', hint: 'Loyiha ma\'lumotlarini saqlash', icon: 'fa-download', action: exportData },
    { id: 'theme', label: 'Yorug\'lik rejimini almashtirish', hint: 'Interfeys ranglarini o\'zgartirish', icon: 'fa-circle-half-stroke', action: toggleTheme }
];
let paletteIndex = 0;

function updatePresentationPanels() {
    const total = kanbanTasks.length;
    const done = kanbanTasks.filter(task => task.status === 'done').length;
    const overdue = kanbanTasks.filter(task => isTaskOverdue(task)).length;
    const completion = total ? Math.round((done / total) * 100) : 0;
    const score = Math.max(0, Math.min(100, Math.round(completion * 0.72 + (overdue === 0 ? 28 : Math.max(0, 28 - overdue * 8)))));
    const scoreNode = document.getElementById('pulseScore');
    const ringNode = document.getElementById('pulseRing');
    if (scoreNode) scoreNode.textContent = score;
    if (ringNode) ringNode.style.setProperty('--score-angle', `${score * 3.6}deg`);
    const title = document.getElementById('pulseTitle');
    const description = document.getElementById('pulseDescription');
    if (title) title.textContent = score >= 80 ? 'Ajoyib temp' : score >= 55 ? 'Barqaror start' : 'Diqqat kerak';
    if (description) description.textContent = overdue ? `${overdue} ta vazifa muddati o'tgan. Fokusni yaqin muddatlarga qarating.` : `${done} ta vazifa yakunlandi. Jamoa rejasi yaxshi ishlayapti.`;
    const headline = document.getElementById('projectHeadline');
    const summary = document.getElementById('projectSummary');
    if (headline) headline.textContent = overdue ? 'Muddatlar diqqat markazida' : total ? 'Loyiha nazorat ostida' : 'Birinchi vazifani boshlang';
    if (summary) summary.textContent = `${total} ta vazifa, ${completion}% bajarilish va ${overdue} ta kechikkan ish.`;
    renderMiniBars();
    renderUpcomingDeadlines();
    renderTeamWorkload();
}

function isTaskOverdue(task) {
    if (!task.dueDate || task.status === 'done') return false;
    const deadline = new Date(`${task.dueDate}T23:59:59`);
    return deadline < new Date();
}

function renderMiniBars() {
    const container = document.getElementById('miniBars');
    if (!container) return;
    const statuses = ['todo', 'progress', 'review', 'done'];
    const colors = ['#f59e0b', '#38bdf8', '#c084fc', '#34d399'];
    const total = Math.max(kanbanTasks.length, 1);
    container.innerHTML = statuses.map((status, index) => {
        const count = kanbanTasks.filter(task => task.status === status).length;
        return `<span class="mini-bar" title="${status}: ${count}" style="height:${Math.max(16, Math.round((count / total) * 72))}px;background:${colors[index]}"></span>`;
    }).join('');
}

function renderUpcomingDeadlines() {
    const container = document.getElementById('upcomingDeadlines');
    if (!container) return;
    const upcoming = kanbanTasks.filter(task => task.dueDate && task.status !== 'done').sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 3);
    if (!upcoming.length) {
        container.innerHTML = '<div class="panel-empty"><i class="fa-regular fa-calendar-check"></i><span>Yaqin muddatlar yo\'q</span></div>';
        return;
    }
    container.innerHTML = upcoming.map(task => `<button class="deadline-item" onclick="openDetailsModal('${task.id}')"><span class="deadline-dot ${isTaskOverdue(task) ? 'late' : ''}"></span><span class="deadline-name">${escapeHtml(task.title)}</span><span class="deadline-date">${formatDueDate(task.dueDate)}</span></button>`).join('');
}

function renderTeamWorkload() {
    const container = document.getElementById('teamWorkload');
    if (!container) return;
    const workload = teamMembers.map(member => ({ member, count: kanbanTasks.filter(task => task.assignee === member.name && task.status !== 'done').length })).sort((a, b) => b.count - a.count).slice(0, 4);
    container.innerHTML = workload.map(({ member, count }) => `<div class="workload-row"><span class="workload-avatar" style="background:${member.bg}">${escapeHtml(member.initials)}</span><span class="workload-name">${escapeHtml(member.name.split(' ')[0])}</span><span class="workload-track"><i style="width:${Math.min(100, count * 22 + 8)}%;background:${member.bg}"></i></span><strong>${count}</strong></div>`).join('');
}

function openCommandPalette() {
    const overlay = document.getElementById('commandPalette');
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    paletteIndex = 0;
    renderCommands();
    setTimeout(() => document.getElementById('paletteInput')?.focus(), 0);
}

function closeCommandPalette(event) {
    if (event && event.target !== event.currentTarget) return;
    const overlay = document.getElementById('commandPalette');
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
    document.getElementById('paletteInput')?.blur();
}

function renderCommands() {
    const container = document.getElementById('commandList');
    const input = document.getElementById('paletteInput');
    if (!container) return;
    const query = input ? input.value.toLowerCase() : '';
    const matches = commandDefinitions.filter(command => `${command.label} ${command.hint}`.toLowerCase().includes(query));
    container.innerHTML = matches.map((command, index) => `<button class="command-item ${index === paletteIndex ? 'selected' : ''}" onclick="runCommand('${command.id}')"><span class="command-icon"><i class="fa-solid ${command.icon}"></i></span><span><strong>${escapeHtml(command.label)}</strong><small>${escapeHtml(command.hint)}</small></span><i class="fa-solid fa-arrow-turn-up command-enter"></i></button>`).join('');
}

function filterCommands() {
    paletteIndex = 0;
    renderCommands();
}

function runCommand(id) {
    const command = commandDefinitions.find(item => item.id === id);
    if (!command) return;
    closeCommandPalette();
    command.action();
}

function toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
    const active = document.body.classList.contains('focus-mode');
    const label = document.getElementById('focusModeLabel');
    if (label) label.textContent = active ? 'Focus mode: ON' : 'Focus mode';
    showToast(active ? 'Focus mode yoqildi' : 'Focus mode o\'chirildi', 'info');
}

function openInsights() {
    const drawer = document.getElementById('insightsDrawer');
    if (!drawer) return;
    renderInsights();
    drawer.classList.add('open');
}

function closeInsights() {
    document.getElementById('insightsDrawer')?.classList.remove('open');
}

function renderInsights() {
    const body = document.getElementById('insightsBody');
    if (!body) return;
    const total = kanbanTasks.length;
    const done = kanbanTasks.filter(task => task.status === 'done').length;
    const overdue = kanbanTasks.filter(isTaskOverdue).length;
    const high = kanbanTasks.filter(task => task.priority === 'high' && task.status !== 'done').length;
    const averageChecklist = kanbanTasks.reduce((sum, task) => sum + (task.checklist?.length || 0), 0);
    body.innerHTML = `<div class="insight-score"><span>Umumiy bajarilish</span><strong>${total ? Math.round(done / total * 100) : 0}%</strong><div class="insight-progress"><i style="width:${total ? done / total * 100 : 0}%"></i></div></div><div class="insight-metrics"><div><span>Faol vazifalar</span><strong>${total - done}</strong></div><div><span>Kechikkan</span><strong class="metric-danger">${overdue}</strong></div><div><span>Yuqori prioritet</span><strong>${high}</strong></div><div><span>Checklist qadamlari</span><strong>${averageChecklist}</strong></div></div><div class="insight-note"><i class="fa-solid fa-lightbulb"></i><p>${overdue ? 'Avval muddati o\'tgan vazifalarni tugating, keyin yuqori prioritetlarga o\'ting.' : 'Jamoa ritmi sog\'lom. Keyingi taqdimotda bajarilish foizi va deadline panelini ko\'rsating.'}</p></div>`;
}

function showTeamSummary() {
    const busiest = teamMembers.map(member => ({ name: member.name, count: kanbanTasks.filter(task => task.assignee === member.name && task.status !== 'done').length })).sort((a, b) => b.count - a.count)[0];
    showToast(busiest ? `${busiest.name.split(' ')[0]} hozir ${busiest.count} ta faol vazifaga ega` : 'Jamoa yuklamasi hozircha bo\'sh', 'info');
}

document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCommandPalette();
    }
    if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        event.stopPropagation();
        closeCommandPalette();
        closeInsights();
    }
    const palette = document.getElementById('commandPalette');
    if (palette?.style.display === 'flex' && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
        const visible = commandDefinitions.filter(command => `${command.label} ${command.hint}`.toLowerCase().includes((document.getElementById('paletteInput')?.value || '').toLowerCase()));
        if (event.key === 'ArrowDown') paletteIndex = (paletteIndex + 1) % Math.max(visible.length, 1);
        if (event.key === 'ArrowUp') paletteIndex = (paletteIndex - 1 + visible.length) % Math.max(visible.length, 1);
        if (event.key === 'Enter' && visible[paletteIndex]) return runCommand(visible[paletteIndex].id);
        event.preventDefault();
        renderCommands();
    }
});

const originalRenderKanbanBoard = renderKanbanBoard;
renderKanbanBoard = function () {
    originalRenderKanbanBoard();
    updatePresentationPanels();
};

updatePresentationPanels();