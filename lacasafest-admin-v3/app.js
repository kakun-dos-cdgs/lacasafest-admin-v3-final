/* ============================================================
   La Casa Fest — Admin Panel v3
   Application Logic
   ============================================================ */

(() => {
  'use strict';

  const DEFAULT_API_URL = 'https://backend-olfs.onrender.com/api/orcamentos';

  function normalizeApiUrl(value) {
    let url = String(value || '').trim().replace(/\/+$/, '');
    if (!url) return DEFAULT_API_URL;
    if (/\/api\/orcamentos$/i.test(url)) return url;
    if (/\/api$/i.test(url)) return `${url}/orcamentos`;
    return `${url}/api/orcamentos`;
  }

  const state = {
    token: localStorage.getItem('lcf_token') || '',
    apiUrl: normalizeApiUrl(localStorage.getItem('lcf_api_url') || DEFAULT_API_URL),
    budgets: [],
    connected: false,
    currentPage: 'dashboard',
    sortField: 'dataEvento',
    sortDir: 'asc',
    confirmId: null,
    cancelId: null,
    notifications: JSON.parse(localStorage.getItem('lcf_notifs') || '[]'),
    charts: {},
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function formatDate(d) {
    if (!d) return '—';
    const p = String(d).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  }

  function formatCurrency(v) {
    const n = Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '—';
  }

  function normalizeStatus(s) {
    if (!s || s === 'null' || s === 'undefined') return 'PENDENTE';
    return String(s).toUpperCase();
  }

  function statusLabel(s) {
    return { PENDENTE: 'Pendente', CONFIRMADO: 'Confirmado', CANCELADO: 'Cancelado' }[normalizeStatus(s)] || s;
  }

  function statusBadgeClass(s) {
    return { PENDENTE: 'badge-pending', CONFIRMADO: 'badge-confirmed', CANCELADO: 'badge-cancelled' }[normalizeStatus(s)] || 'badge-pending';
  }

  function parseValor(str) {
    return Number(String(str).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  }

  function esc(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  function toast(message, type = 'info') {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 250);
    }, 3500);
  }

  function addNotification(icon, text) {
    state.notifications.unshift({
      icon,
      text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    });
    if (state.notifications.length > 30) state.notifications.pop();
    localStorage.setItem('lcf_notifs', JSON.stringify(state.notifications));
    renderNotifications();
  }

  function renderNotifications() {
    const list = $('#notif-list');
    const count = $('#notif-count');
    if (!state.notifications.length) {
      list.innerHTML = '<div class="empty-notif">Nenhuma notificação</div>';
      count.hidden = true;
      return;
    }
    count.hidden = false;
    count.textContent = state.notifications.length > 9 ? '9+' : state.notifications.length;
    list.innerHTML = state.notifications
      .map(
        (n) =>
          `<div class="notif-item">
        <span class="notif-icon">${n.icon}</span>
        <div><div>${n.text}</div><div class="notif-time">${n.time}</div></div>
      </div>`
      )
      .join('');
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lcf_theme', theme);
    const pref = $('#pref-dark');
    if (pref) pref.checked = theme === 'dark';
    Object.values(state.charts).forEach((c) => {
      try {
        c.destroy();
      } catch (_) {}
    });
    state.charts = {};
    if (state.connected) renderCharts();
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function toggleSidebar() {
    const sb = $('#sidebar');
    if (window.innerWidth <= 900) {
      sb.classList.toggle('open');
      $('#sidebar-overlay').classList.toggle('visible');
    } else {
      sb.classList.toggle('collapsed');
      localStorage.setItem('lcf_sidebar', sb.classList.contains('collapsed') ? '1' : '0');
    }
  }

  function closeMobileSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebar-overlay').classList.remove('visible');
  }

  const pageTitles = {
    dashboard: 'Dashboard',
    orcamentos: 'Orçamentos',
    calendario: 'Calendário',
    financeiro: 'Financeiro',
    relatorios: 'Relatórios',
    config: 'Configurações',
  };

  function navigate(page) {
    state.currentPage = page;
    $$('.page').forEach((p) => p.classList.remove('active'));
    const target = $(`#page-${page}`);
    if (target) target.classList.add('active');
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
    $('#page-title').textContent = pageTitles[page] || page;
    $('#breadcrumb-current').textContent = pageTitles[page] || page;
    closeMobileSidebar();
    closeAllDropdowns();
    if (state.connected) {
      if (page === 'orcamentos') renderBudgetsTable();
      if (page === 'financeiro') renderFinanceiro();
      if (page === 'calendario') renderCalendario();
      if (page === 'relatorios') renderRelatorio();
      if (page === 'dashboard') {
        updateStats();
        renderCharts();
        renderRecent();
      }
    }
  }

  function closeAllDropdowns() {
    $$('.dropdown').forEach((d) => (d.hidden = true));
  }

  function toggleDropdown(id) {
    const el = $(id);
    const wasHidden = el.hidden;
    closeAllDropdowns();
    el.hidden = !wasHidden;
  }

  async function apiFetch(path = '', options = {}) {
    const url = path ? `${state.apiUrl}${path}` : state.apiUrl;
    const headers = {
      'X-Admin-Token': state.token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.status === 401) throw { status: 401, message: 'Token inválido' };
      if (!res.ok) {
        let msg = `Erro HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body.mensagem) msg = body.mensagem;
        } catch (_) {}
        throw { status: res.status, message: msg };
      }
      if (res.status === 204) return null;
      return res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw { status: 0, message: 'Tempo esgotado. O backend não respondeu a tempo.' };
      }
      if (err.status) throw err;
      throw {
        status: 0,
        message: 'Falha de conexão. Verifique se o backend está rodando e se a URL da API está correta.',
      };
    }
  }

  async function connect() {
    const tokenInput = $('#admin-token');
    const token = (tokenInput?.value || state.token || '').trim();
    if (!token) {
      showAuthError('Digite o token de acesso.');
      return;
    }

    const btn = $('#connect-btn');
    setBtnLoading(btn, true);
    hideAuthError();

    try {
      state.token = token;
      localStorage.setItem('lcf_token', token);

      const data = await apiFetch();
      state.budgets = Array.isArray(data)
        ? data.slice().sort((a, b) => String(a.dataEvento || '').localeCompare(String(b.dataEvento || '')))
        : [];
      state.connected = true;

      // Esconde o login e mostra o dashboard imediatamente
      onConnected();

      toast(`${state.budgets.length} orçamento(s) carregado(s)`, 'success');
      addNotification('📋', `${state.budgets.length} orçamento(s) sincronizados`);
    } catch (err) {
      state.connected = false;
      state.budgets = [];
      // Garante que o gate continue visível em caso de erro
      const gate = $('#auth-gate');
      const dash = $('#dashboard-content');
      if (gate) gate.hidden = false;
      if (dash) dash.hidden = true;

      if (err.status === 401) {
        showAuthError('Token inválido. Verifique e tente novamente.');
      } else {
        showAuthError(err.message || 'Não foi possível conectar. Verifique se o backend está rodando.');
      }
      updateConnectionStatus(false);
    } finally {
      setBtnLoading(btn, false);
    }
  }

  function onConnected() {
    const gate = $('#auth-gate');
    const dash = $('#dashboard-content');
    if (gate) {
      gate.hidden = true;
      gate.style.display = 'none';
    }
    if (dash) {
      dash.hidden = false;
      dash.style.display = '';
    }
    updateConnectionStatus(true);
    enableControls(true);
    updateStats();
    renderCharts();
    renderRecent();
    renderBudgetsTable();
    updateNavBadge();
    const cfgToken = $('#config-token');
    const cfgUrl = $('#config-api-url');
    if (cfgToken) cfgToken.value = state.token;
    if (cfgUrl) cfgUrl.value = state.apiUrl;
  }

  function updateConnectionStatus(online) {
    const el = $('#connection-status');
    if (!el) return;
    el.querySelector('.status-dot').className = `status-dot ${online ? 'online' : 'offline'}`;
    el.querySelector('.status-text').textContent = online ? 'Conectado' : 'Desconectado';
  }

  function enableControls(on) {
    ['#search-input', '#status-filter', '#refresh-btn'].forEach((sel) => {
      const el = $(sel);
      if (el) el.disabled = !on;
    });
  }

  function showAuthError(msg) {
    const el = $('#auth-error');
    if (el) {
      el.textContent = msg;
      el.hidden = false;
    }
  }

  function hideAuthError() {
    const el = $('#auth-error');
    if (el) el.hidden = true;
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    btn.classList.toggle('is-loading', !!loading);
    btn.disabled = !!loading;
  }

  function updateStats() {
    const all = state.budgets;
    const pendentes = all.filter((b) => normalizeStatus(b.status) === 'PENDENTE');
    const confirmados = all.filter((b) => normalizeStatus(b.status) === 'CONFIRMADO');
    const cancelados = all.filter((b) => normalizeStatus(b.status) === 'CANCELADO');
    const revenue = confirmados.reduce((s, b) => s + (Number(b.valorContrato) || 0), 0);
    const upcoming = all
      .filter((b) => ['PENDENTE', 'CONFIRMADO'].includes(normalizeStatus(b.status)))
      .slice()
      .sort((a, b) => String(a.dataEvento || '').localeCompare(String(b.dataEvento || '')));
    setText('stat-total', all.length);
    setText('stat-total-hint', all.length ? `${pendentes.length} aguardando` : 'Nenhum registro');
    setText('stat-pending', pendentes.length);
    setText('stat-confirmed', confirmados.length);
    setText('stat-revenue', formatCurrency(revenue));
    setText('stat-cancelled', cancelados.length);
    setText('stat-next', upcoming.length && upcoming[0].dataEvento ? formatDate(upcoming[0].dataEvento) : '—');
    setText('stat-next-hint', upcoming.length ? upcoming[0].nome || '' : 'Nenhum evento');
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function updateNavBadge() {
    const badge = $('#nav-badge-pending');
    const count = state.budgets.filter((b) => normalizeStatus(b.status) === 'PENDENTE').length;
    if (badge) {
      badge.hidden = count === 0;
      badge.textContent = count;
    }
  }

  function chartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      text: isDark ? '#a09b92' : '#5c574f',
      grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      gold: '#d4a84b',
      success: '#34d399',
      warning: '#fbbf24',
      danger: '#f87171',
      cyan: '#3ecfbf',
    };
  }

  function renderCharts() {
    const c = chartColors();
    const all = state.budgets;
    const pend = all.filter((b) => normalizeStatus(b.status) === 'PENDENTE').length;
    const conf = all.filter((b) => normalizeStatus(b.status) === 'CONFIRMADO').length;
    const canc = all.filter((b) => normalizeStatus(b.status) === 'CANCELADO').length;

    destroyChart('status');
    const ctxStatus = $('#chart-status');
    if (ctxStatus) {
      state.charts.status = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
          labels: ['Pendentes', 'Confirmados', 'Cancelados'],
          datasets: [{ data: [pend, conf, canc], backgroundColor: [c.warning, c.success, c.danger], borderWidth: 0, hoverOffset: 6 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: c.text, padding: 16, usePointStyle: true, pointStyleWidth: 10, font: { size: 12 } } } },
          cutout: '65%',
          animation: { animateRotate: true, duration: 800 },
        },
      });
    }

    const typeMap = {};
    all.forEach((b) => {
      const t = b.tipoEvento || 'Outros';
      typeMap[t] = (typeMap[t] || 0) + 1;
    });
    const types = Object.entries(typeMap).sort((a, b) => b[1] - a[1]).slice(0, 8);

    destroyChart('events');
    const ctxEvents = $('#chart-events');
    if (ctxEvents) {
      state.charts.events = new Chart(ctxEvents, {
        type: 'bar',
        data: {
          labels: types.map((t) => t[0]),
          datasets: [{ data: types.map((t) => t[1]), backgroundColor: c.gold, borderRadius: 6, barThickness: 28 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: c.text, font: { size: 11 } }, grid: { display: false } },
            y: { ticks: { color: c.text, stepSize: 1 }, grid: { color: c.grid }, beginAtZero: true },
          },
          animation: { duration: 800 },
        },
      });
    }

    const monthMap = {};
    all
      .filter((b) => normalizeStatus(b.status) === 'CONFIRMADO')
      .forEach((b) => {
        const d = b.dataEvento || '';
        const key = d.length >= 7 ? d.substring(0, 7) : 'Sem data';
        monthMap[key] = (monthMap[key] || 0) + (Number(b.valorContrato) || 0);
      });
    const months = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0]));

    destroyChart('revenue');
    const ctxRev = $('#chart-revenue');
    if (ctxRev) {
      state.charts.revenue = new Chart(ctxRev, {
        type: 'line',
        data: {
          labels: months.map((m) => {
            const [y, mo] = m[0].split('-');
            const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            return mo ? `${names[parseInt(mo, 10) - 1]}/${y.slice(2)}` : m[0];
          }),
          datasets: [
            {
              label: 'Faturamento',
              data: months.map((m) => m[1]),
              borderColor: c.cyan,
              backgroundColor: 'rgba(62, 207, 191, 0.1)',
              fill: true,
              tension: 0.35,
              pointRadius: 4,
              pointBackgroundColor: c.cyan,
              pointHoverRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } },
          },
          scales: {
            x: { ticks: { color: c.text }, grid: { display: false } },
            y: {
              ticks: { color: c.text, callback: (v) => 'R$ ' + Number(v).toLocaleString('pt-BR') },
              grid: { color: c.grid },
              beginAtZero: true,
            },
          },
          animation: { duration: 900 },
        },
      });
    }
  }

  function destroyChart(key) {
    if (state.charts[key]) {
      try {
        state.charts[key].destroy();
      } catch (_) {}
      delete state.charts[key];
    }
  }

  function renderRecent() {
    const body = $('#recent-body');
    const empty = $('#recent-empty');
    if (!body) return;
    const recent = state.budgets
      .slice()
      .sort((a, b) => (b.id || 0) - (a.id || 0))
      .slice(0, 5);
    body.innerHTML = '';
    if (!recent.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    recent.forEach((b) => {
      const st = normalizeStatus(b.status);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="color:var(--text)">${esc(b.nome)}</strong></td>
        <td>${esc(b.tipoEvento)}</td>
        <td>${formatDate(b.dataEvento)}</td>
        <td><span class="badge ${statusBadgeClass(st)}">${statusLabel(st)}</span></td>
        <td>${st === 'CONFIRMADO' ? formatCurrency(b.valorContrato) : '—'}</td>
      `;
      body.appendChild(tr);
    });
  }

  function getFiltered() {
    const query = ($('#search-input')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const statusVal = $('#status-filter')?.value || 'TODOS';
    let list = state.budgets.filter((b) => {
      const name = String(b.nome || '').toLocaleLowerCase('pt-BR');
      const phone = String(b.telefone || '').toLocaleLowerCase('pt-BR');
      const type = String(b.tipoEvento || '').toLocaleLowerCase('pt-BR');
      const st = normalizeStatus(b.status);
      const matchQ = !query || name.includes(query) || phone.includes(query) || type.includes(query);
      const matchS = statusVal === 'TODOS' || st === statusVal;
      return matchQ && matchS;
    });
    const field = state.sortField;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let va = a[field],
        vb = b[field];
      if (field === 'valorContrato' || field === 'quantidadeConvidados') {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
      }
      if (typeof va === 'string') return String(va).localeCompare(String(vb), 'pt-BR') * dir;
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
    return list;
  }

  function renderBudgetsTable() {
    const body = $('#budgets-body');
    const empty = $('#empty-state');
    const countEl = $('#result-count');
    if (!body) return;
    const filtered = getFiltered();
    body.innerHTML = '';
    if (countEl) {
      countEl.textContent = state.budgets.length ? `${filtered.length} de ${state.budgets.length} orçamento(s)` : '';
    }
    if (!filtered.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = state.budgets.length
          ? 'Nenhum orçamento corresponde ao filtro.'
          : state.connected
            ? 'Nenhum orçamento recebido ainda.'
            : 'Conecte-se ao sistema para visualizar os orçamentos.';
      }
      return;
    }
    if (empty) empty.hidden = true;
    filtered.forEach((b) => {
      const st = normalizeStatus(b.status);
      const tr = document.createElement('tr');
      tr.dataset.id = b.id;
      tr.innerHTML = `
        <td><strong style="color:var(--text)">${esc(b.nome)}</strong></td>
        <td>${esc(b.telefone)}</td>
        <td>${esc(b.tipoEvento)}</td>
        <td>${formatDate(b.dataEvento)}</td>
        <td>${b.quantidadeConvidados ?? '—'}</td>
        <td><span class="badge ${statusBadgeClass(st)}">${statusLabel(st)}</span></td>
        <td>${st === 'CONFIRMADO' ? formatCurrency(b.valorContrato) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td class="message-cell" title="${esc(b.mensagem || '')}">${esc(b.mensagem) || '—'}</td>
        <td class="actions-cell"></td>
      `;
      const actions = tr.querySelector('.actions-cell');
      const btnDetail = document.createElement('button');
      btnDetail.className = 'btn-sm detail';
      btnDetail.textContent = 'Ver';
      btnDetail.title = 'Ver detalhes';
      btnDetail.addEventListener('click', () => openDetail(b));
      actions.appendChild(btnDetail);
      if (st !== 'CONFIRMADO' && st !== 'CANCELADO') {
        const btnConf = document.createElement('button');
        btnConf.className = 'btn-sm confirm';
        btnConf.textContent = 'Confirmar';
        btnConf.addEventListener('click', () => openConfirmModal(b));
        actions.appendChild(btnConf);
      }
      if (st !== 'CANCELADO') {
        const btnCanc = document.createElement('button');
        btnCanc.className = 'btn-sm cancel';
        btnCanc.textContent = 'Cancelar';
        btnCanc.addEventListener('click', () => openCancelModal(b));
        actions.appendChild(btnCanc);
      }
      body.appendChild(tr);
    });
  }

  function openModal(id) {
    const m = $(id);
    if (m) m.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const m = typeof id === 'string' ? $(id) : id;
    if (m) m.hidden = true;
    document.body.style.overflow = '';
  }

  function closeAllModals() {
    $$('.modal').forEach((m) => {
      m.hidden = true;
    });
    document.body.style.overflow = '';
  }

  function openConfirmModal(budget) {
    state.confirmId = budget.id;
    $('#confirm-nome').textContent = budget.nome || '—';
    $('#confirm-evento').textContent = budget.tipoEvento || '—';
    $('#confirm-data').textContent = formatDate(budget.dataEvento);
    $('#confirm-preview').hidden = false;
    $('#confirm-valor').value = '';
    openModal('#modal-confirm');
    setTimeout(() => $('#confirm-valor')?.focus(), 100);
  }

  function openCancelModal(budget) {
    state.cancelId = budget.id;
    $('#cancel-nome').textContent = budget.nome || '—';
    $('#cancel-evento').textContent = budget.tipoEvento || '—';
    $('#cancel-data').textContent = formatDate(budget.dataEvento);
    openModal('#modal-cancel');
  }

  function openDetail(b) {
    const st = normalizeStatus(b.status);
    $('#detail-body').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><label>Cliente</label><span>${esc(b.nome)}</span></div>
        <div class="detail-item"><label>Telefone</label><span>${esc(b.telefone)}</span></div>
        <div class="detail-item"><label>Tipo de evento</label><span>${esc(b.tipoEvento)}</span></div>
        <div class="detail-item"><label>Data do evento</label><span>${formatDate(b.dataEvento)}</span></div>
        <div class="detail-item"><label>Convidados</label><span>${b.quantidadeConvidados ?? '—'}</span></div>
        <div class="detail-item"><label>Status</label><span><span class="badge ${statusBadgeClass(st)}">${statusLabel(st)}</span></span></div>
        <div class="detail-item"><label>Valor do contrato</label><span>${st === 'CONFIRMADO' ? formatCurrency(b.valorContrato) : 'Ainda não definido'}</span></div>
        <div class="detail-item full"><label>Mensagem</label><span>${esc(b.mensagem) || '—'}</span></div>
      </div>
    `;
    openModal('#modal-detail');
  }

  async function submitConfirm() {
    const valorStr = $('#confirm-valor').value;
    const valor = parseValor(valorStr);
    if (!Number.isFinite(valor) || valor <= 0 || Math.round(valor * 100) !== valor * 100) {
      toast('Informe um valor maior que zero com no máximo duas casas decimais.', 'error');
      return;
    }
    const btn = $('#confirm-submit');
    setBtnLoading(btn, true);
    try {
      const updated = await apiFetch(`/${state.confirmId}/confirmar`, {
        method: 'PUT',
        body: JSON.stringify({ valorContrato: valor }),
      });
      const idx = state.budgets.findIndex((b) => b.id === updated.id);
      if (idx !== -1) state.budgets[idx] = updated;
      closeModal('#modal-confirm');
      refreshViews();
      toast('Orçamento confirmado com sucesso!', 'success');
      addNotification('💰', `Contrato confirmado: ${updated.nome} — ${formatCurrency(valor)}`);
    } catch (err) {
      toast(err.message || 'Falha ao confirmar.', 'error');
    } finally {
      setBtnLoading(btn, false);
    }
  }

  async function submitCancel() {
    const btn = $('#cancel-submit');
    setBtnLoading(btn, true);
    try {
      const updated = await apiFetch(`/${state.cancelId}/cancelar`, { method: 'PUT' });
      if (updated) {
        const idx = state.budgets.findIndex((b) => b.id === updated.id);
        if (idx !== -1) state.budgets[idx] = updated;
      } else {
        const idx = state.budgets.findIndex((b) => b.id === state.cancelId);
        if (idx !== -1) state.budgets[idx].status = 'CANCELADO';
      }
      closeModal('#modal-cancel');
      refreshViews();
      toast('Orçamento cancelado. Data liberada.', 'success');
      addNotification('⚠️', `Orçamento cancelado (ID ${state.cancelId})`);
    } catch (err) {
      if (err.status === 404) {
        state.budgets = state.budgets.filter((b) => b.id !== state.cancelId);
        closeModal('#modal-cancel');
        refreshViews();
        toast('Orçamento não encontrado (já removido).', 'error');
      } else {
        toast(err.message || 'Falha ao cancelar.', 'error');
      }
    } finally {
      setBtnLoading(btn, false);
    }
  }

  function refreshViews() {
    updateStats();
    updateNavBadge();
    renderBudgetsTable();
    renderRecent();
    if (state.currentPage === 'financeiro') renderFinanceiro();
    if (state.currentPage === 'calendario') renderCalendario();
    if (state.currentPage === 'relatorios') renderRelatorio();
    if (state.currentPage === 'dashboard') renderCharts();
  }

  function renderFinanceiro() {
    const confirmed = state.budgets.filter((b) => normalizeStatus(b.status) === 'CONFIRMADO');
    const total = confirmed.reduce((s, b) => s + (Number(b.valorContrato) || 0), 0);
    const avg = confirmed.length ? total / confirmed.length : 0;
    setText('fin-total', formatCurrency(total));
    setText('fin-count', confirmed.length);
    setText('fin-avg', formatCurrency(avg));
    const body = $('#financeiro-body');
    const empty = $('#financeiro-empty');
    if (!body) return;
    body.innerHTML = '';
    if (!confirmed.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    confirmed
      .slice()
      .sort((a, b) => String(b.dataEvento || '').localeCompare(String(a.dataEvento || '')))
      .forEach((b) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong style="color:var(--text)">${esc(b.nome)}</strong></td>
          <td>${esc(b.tipoEvento)}</td>
          <td>${formatDate(b.dataEvento)}</td>
          <td>${b.quantidadeConvidados ?? '—'}</td>
          <td><strong style="color:var(--success)">${formatCurrency(b.valorContrato)}</strong></td>
        `;
        body.appendChild(tr);
      });
  }

  function renderCalendario() {
    const grid = $('#calendar-grid');
    if (!grid) return;
    const blocked = state.budgets
      .filter((b) => ['PENDENTE', 'CONFIRMADO'].includes(normalizeStatus(b.status)))
      .slice()
      .sort((a, b) => String(a.dataEvento || '').localeCompare(String(b.dataEvento || '')));
    if (!blocked.length) {
      grid.innerHTML = '<div class="empty-state">Nenhuma data bloqueada no momento.</div>';
      return;
    }
    grid.innerHTML = blocked
      .map((b) => {
        const st = normalizeStatus(b.status);
        return `
        <div class="cal-item">
          <div class="cal-date">${formatDate(b.dataEvento)}</div>
          <div class="cal-status"><span class="badge ${statusBadgeClass(st)}">${statusLabel(st)}</span></div>
          <div class="cal-client">${esc(b.nome)} · ${esc(b.tipoEvento)}</div>
        </div>
      `;
      })
      .join('');
  }

  function renderRelatorio() {
    const el = $('#relatorio-content');
    if (!el) return;
    const all = state.budgets;
    if (!all.length) {
      el.innerHTML = '<div class="empty-state">Nenhum dado para relatório.</div>';
      return;
    }
    const pend = all.filter((b) => normalizeStatus(b.status) === 'PENDENTE').length;
    const conf = all.filter((b) => normalizeStatus(b.status) === 'CONFIRMADO').length;
    const canc = all.filter((b) => normalizeStatus(b.status) === 'CANCELADO').length;
    const revenue = all
      .filter((b) => normalizeStatus(b.status) === 'CONFIRMADO')
      .reduce((s, b) => s + (Number(b.valorContrato) || 0), 0);
    const guests = all.reduce((s, b) => s + (Number(b.quantidadeConvidados) || 0), 0);
    const convRate = all.length ? ((conf / all.length) * 100).toFixed(1) : 0;
    const typeMap = {};
    all.forEach((b) => {
      const t = b.tipoEvento || 'Outros';
      typeMap[t] = (typeMap[t] || 0) + 1;
    });
    const topTypes = Object.entries(typeMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    el.innerHTML = `
      <div class="rel-section">
        <h4>Visão geral</h4>
        <div class="rel-row"><span>Total de orçamentos</span><span>${all.length}</span></div>
        <div class="rel-row"><span>Pendentes</span><span>${pend}</span></div>
        <div class="rel-row"><span>Confirmados</span><span>${conf}</span></div>
        <div class="rel-row"><span>Cancelados</span><span>${canc}</span></div>
        <div class="rel-row"><span>Taxa de conversão</span><span>${convRate}%</span></div>
      </div>
      <div class="rel-section">
        <h4>Financeiro</h4>
        <div class="rel-row"><span>Faturamento total</span><span>${formatCurrency(revenue)}</span></div>
        <div class="rel-row"><span>Ticket médio</span><span>${formatCurrency(conf ? revenue / conf : 0)}</span></div>
        <div class="rel-row"><span>Total de convidados</span><span>${guests}</span></div>
      </div>
      <div class="rel-section">
        <h4>Tipos de evento mais solicitados</h4>
        ${topTypes.map(([t, n]) => `<div class="rel-row"><span>${esc(t)}</span><span>${n}</span></div>`).join('')}
      </div>
    `;
  }

  function onGlobalSearch(e) {
    const q = e.target.value;
    if (state.currentPage !== 'orcamentos') navigate('orcamentos');
    const input = $('#search-input');
    if (input) {
      input.value = q;
      renderBudgetsTable();
    }
  }

  function logout() {
    state.token = '';
    state.budgets = [];
    state.connected = false;
    localStorage.removeItem('lcf_token');
    const gate = $('#auth-gate');
    const dash = $('#dashboard-content');
    if (gate) {
      gate.hidden = false;
      gate.style.display = '';
    }
    if (dash) {
      dash.hidden = true;
      dash.style.display = 'none';
    }
    enableControls(false);
    updateConnectionStatus(false);
    updateNavBadge();
    navigate('dashboard');
    const tokenInput = $('#admin-token');
    if (tokenInput) tokenInput.value = '';
    toast('Sessão encerrada.', 'info');
  }

  function saveConfig() {
    const url = normalizeApiUrl($('#config-api-url')?.value);
    const token = $('#config-token')?.value?.trim();
    state.apiUrl = url;
    localStorage.setItem('lcf_api_url', url);
    if (token) {
      state.token = token;
      localStorage.setItem('lcf_token', token);
      const authToken = $('#admin-token');
      if (authToken) authToken.value = token;
    }
    toast('Configurações salvas!', 'success');
  }

  function bindEvents() {
    $$('.nav-item[data-page]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(el.dataset.page);
      });
    });
    $$('[data-page]').forEach((el) => {
      if (el.classList.contains('nav-item')) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (el.dataset.page) navigate(el.dataset.page);
      });
    });
    $('#sidebar-collapse')?.addEventListener('click', toggleSidebar);
    $('#mobile-menu-btn')?.addEventListener('click', toggleSidebar);
    $('#sidebar-overlay')?.addEventListener('click', closeMobileSidebar);
    $('#theme-toggle')?.addEventListener('click', toggleTheme);
    $('#pref-dark')?.addEventListener('change', (e) => applyTheme(e.target.checked ? 'dark' : 'light'));
    $('#pref-sidebar')?.addEventListener('change', (e) => {
      const sb = $('#sidebar');
      if (e.target.checked) sb.classList.add('collapsed');
      else sb.classList.remove('collapsed');
      localStorage.setItem('lcf_sidebar', e.target.checked ? '1' : '0');
    });
    $('#connect-btn')?.addEventListener('click', connect);
    $('#admin-token')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') connect();
    });
    $('#search-input')?.addEventListener('input', () => renderBudgetsTable());
    $('#status-filter')?.addEventListener('change', () => renderBudgetsTable());
    $('#refresh-btn')?.addEventListener('click', async () => {
      if (!state.connected) return;
      try {
        const data = await apiFetch();
        state.budgets = Array.isArray(data)
          ? data.slice().sort((a, b) => String(a.dataEvento || '').localeCompare(String(b.dataEvento || '')))
          : [];
        refreshViews();
        toast('Dados atualizados.', 'success');
      } catch (err) {
        toast(err.message || 'Falha ao atualizar.', 'error');
      }
    });
    $('#global-search')?.addEventListener('input', onGlobalSearch);
    $('#notif-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown('#notif-dropdown');
    });
    $('#profile-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown('#profile-dropdown');
    });
    document.addEventListener('click', closeAllDropdowns);
    $('#clear-notifs')?.addEventListener('click', () => {
      state.notifications = [];
      localStorage.setItem('lcf_notifs', '[]');
      renderNotifications();
    });
    $('#logout-btn')?.addEventListener('click', logout);
    $$('.modal-close, .modal-backdrop').forEach((el) => {
      el.addEventListener('click', () => closeAllModals());
    });
    $('#confirm-submit')?.addEventListener('click', submitConfirm);
    $('#cancel-submit')?.addEventListener('click', submitCancel);
    $('#confirm-valor')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitConfirm();
    });
    $('#save-config-btn')?.addEventListener('click', saveConfig);
    $$('#budgets-table th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (state.sortField === field) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortField = field;
          state.sortDir = 'asc';
        }
        renderBudgetsTable();
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });
  }

  function init() {
    const savedTheme = localStorage.getItem('lcf_theme') || 'dark';
    applyTheme(savedTheme);
    if (localStorage.getItem('lcf_sidebar') === '1' && window.innerWidth > 900) {
      $('#sidebar')?.classList.add('collapsed');
      const pref = $('#pref-sidebar');
      if (pref) pref.checked = true;
    }
    if (state.token) {
      const input = $('#admin-token');
      if (input) input.value = state.token;
    }
    const cfgUrl = $('#config-api-url');
    if (cfgUrl) cfgUrl.value = state.apiUrl;
    renderNotifications();
    bindEvents();
    updateConnectionStatus(false);
    if (state.token) connect();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
