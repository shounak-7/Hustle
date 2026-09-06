/**
 * Hustle Administration & Operations Console Controller
 * Dedicated to /admin portal with role-based security enforcement
 */
(function initAdminPortal() {
  const loginView = document.querySelector('#admin-login-view');
  const panelView = document.querySelector('#admin-panel-view');
  const loginForm = document.querySelector('#admin-login-form');
  const loginError = document.querySelector('#admin-login-error');
  const roleBanner = document.querySelector('#role-rejection-banner');
  const btnLogout = document.querySelector('#btn-admin-logout');
  const adminEmailBadge = document.querySelector('#admin-auth-email-badge');

  // Tabs
  const btnTabWorkers = document.querySelector('#btn-tab-workers');
  const btnTabCustomers = document.querySelector('#btn-tab-customers');
  const btnTabDisputes = document.querySelector('#btn-tab-disputes');
  const sectionWorkers = document.querySelector('#admin-workers-section');
  const sectionCustomers = document.querySelector('#admin-customers-section');
  const sectionDisputes = document.querySelector('#admin-disputes-section');

  // Stats
  const statTotalWorkers = document.querySelector('#stat-total-workers');
  const statPendingWorkers = document.querySelector('#stat-pending-workers');
  const statApprovedWorkers = document.querySelector('#stat-approved-workers');
  const statTotalCustomers = document.querySelector('#stat-total-customers');
  const statActiveCustomerBookings = document.querySelector('#stat-active-customer-bookings');
  const statTotalDisputes = document.querySelector('#stat-total-disputes');
  const statOpenDisputes = document.querySelector('#stat-open-disputes');
  const statResolvedDisputes = document.querySelector('#stat-resolved-disputes');
  const badgeOpenDisputes = document.querySelector('#badge-open-disputes');

  // Tables
  const workersTbody = document.querySelector('#admin-workers-tbody');
  const customersTbody = document.querySelector('#admin-customers-tbody');
  const disputesTbody = document.querySelector('#admin-disputes-tbody');

  // Modals
  const docModal = document.querySelector('#admin-doc-modal');
  const docModalTitle = document.querySelector('#admin-doc-modal-title');
  const docModalBody = document.querySelector('#admin-doc-body');
  const btnCloseDocModal = document.querySelector('#btn-close-doc-modal');

  const disputeModal = document.querySelector('#admin-dispute-modal');
  const disputeModalTitle = document.querySelector('#admin-dispute-modal-title');
  const disputeModalBody = document.querySelector('#admin-dispute-modal-body');
  const btnCloseDisputeModal = document.querySelector('#btn-close-dispute-modal');

  const API_AUTH = (function() {
    if (typeof window === 'undefined') return '/api/auth';
    if (window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null') {
      return 'http://localhost:5001/api/auth';
    }
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port && window.location.port !== '5001') {
      return 'http://localhost:5001/api/auth';
    }
    return '/api/auth';
  })();

  let activeAdminToken = null;
  let activeAdminUser = null;
  let currentTab = 'workers';
  let currentWorkersList = [];
  let currentCustomersList = [];
  let currentTicketsList = [];

  // 1. Initial Access & Role Verification Guard
  function verifyAccessGuard() {
    // Check if user is currently logged in as a normal customer or worker
    const storedUser = window.HustleSession ? HustleSession.getUser() : null;
    if (storedUser && storedUser.role !== 'admin') {
      if (roleBanner) {
        roleBanner.innerHTML = `
          <strong>⚠️ Access Restricted:</strong> You are currently signed in as a <strong>${storedUser.role === 'worker' ? 'Gig Worker Partner' : 'Customer'}</strong> (${storedUser.email || storedUser.name}).
          <br><span style="font-size:12px;">The Administration Console requires authorized staff credentials. Please log in below.</span>
        `;
        roleBanner.style.display = 'block';
      }
    } else {
      if (roleBanner) roleBanner.style.display = 'none';
    }

    // Strictly no pre-existing active session bypass
    activeAdminToken = null;
    activeAdminUser = null;
    showLoginView();
  }

  function showLoginView() {
    if (loginView) loginView.hidden = false;
    if (panelView) panelView.hidden = true;
    if (loginError) {
      loginError.hidden = true;
      loginError.textContent = '';
    }
    if (adminEmailBadge) {
      adminEmailBadge.style.display = 'none';
      adminEmailBadge.textContent = '';
    }
    if (btnLogout) btnLogout.style.display = 'none';

    // Clear input fields
    const emailInput = document.querySelector('#admin-email');
    const passInput = document.querySelector('#admin-password');
    if (emailInput) emailInput.value = '';
    if (passInput) passInput.value = '';
  }

  function showPanelView() {
    if (loginView) loginView.hidden = true;
    if (panelView) panelView.hidden = false;
    if (roleBanner) roleBanner.style.display = 'none';

    if (adminEmailBadge && activeAdminUser) {
      adminEmailBadge.textContent = `👤 ${activeAdminUser.name || 'Staff Admin'} (${activeAdminUser.email})`;
      adminEmailBadge.style.display = 'inline-flex';
    }
    if (btnLogout) btnLogout.style.display = 'inline-block';
  }

  // 2. Tab Navigation
  function switchTab(tab) {
    currentTab = tab;
    btnTabWorkers?.classList.toggle('active', tab === 'workers');
    btnTabCustomers?.classList.toggle('active', tab === 'customers');
    btnTabDisputes?.classList.toggle('active', tab === 'disputes');

    if (sectionWorkers) sectionWorkers.hidden = tab !== 'workers';
    if (sectionCustomers) sectionCustomers.hidden = tab !== 'customers';
    if (sectionDisputes) sectionDisputes.hidden = tab !== 'disputes';

    if (tab === 'workers') {
      loadWorkers();
    } else if (tab === 'customers') {
      loadCustomers();
    } else if (tab === 'disputes') {
      loadDisputes();
    }
  }

  btnTabWorkers?.addEventListener('click', () => switchTab('workers'));
  btnTabCustomers?.addEventListener('click', () => switchTab('customers'));
  btnTabDisputes?.addEventListener('click', () => switchTab('disputes'));

  // 3. Admin Authentication
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.hidden = true;

    const email = document.querySelector('#admin-email')?.value.trim();
    const password = document.querySelector('#admin-password')?.value.trim();

    if (!email || !password) {
      if (loginError) {
        loginError.textContent = 'Please provide both admin email and password.';
        loginError.hidden = false;
      }
      return;
    }

    const submitBtn = document.querySelector('#btn-admin-login');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Verifying credentials...</span>';
    }

    try {
      const res = await fetch(`${API_AUTH}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (res.ok && data.success && data.token) {
        activeAdminToken = data.token;
        activeAdminUser = data.admin || { name: 'Operations Staff', email };

        // Wipe sensitive inputs immediately
        const emailInput = document.querySelector('#admin-email');
        const passInput = document.querySelector('#admin-password');
        if (emailInput) emailInput.value = '';
        if (passInput) passInput.value = '';

        showPanelView();
        await loadWorkers();
      } else {
        throw new Error(data.message || 'Invalid administrator credentials.');
      }
    } catch (err) {
      if (loginError) {
        loginError.textContent = err.message || 'Authentication failed.';
        loginError.hidden = false;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  });

  // Admin Logout
  btnLogout?.addEventListener('click', () => {
    activeAdminToken = null;
    activeAdminUser = null;
    currentWorkersList = [];
    currentCustomersList = [];
    currentTicketsList = [];
    showLoginView();
  });

  // Helper for authenticated API calls
  async function adminFetch(endpoint, options = {}) {
    if (!activeAdminToken) {
      showLoginView();
      throw new Error('No active admin session.');
    }

    const headers = options.headers ? { ...options.headers } : {};
    headers['Authorization'] = `Bearer ${activeAdminToken}`;

    const res = await fetch(`${API_AUTH}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401 || res.status === 403) {
      activeAdminToken = null;
      showLoginView();
      if (loginError) {
        loginError.textContent = 'Session expired or administrative privileges denied. Please sign in again.';
        loginError.hidden = false;
      }
      throw new Error('Access denied. Administrator privileges required.');
    }

    return res;
  }

  // 4. Load Worker Partners Queue
  async function loadWorkers() {
    if (!activeAdminToken) return;

    if (workersTbody) {
      workersTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#706d66; padding:24px;">Loading worker partners...</td></tr>';
    }

    try {
      const res = await adminFetch('/admin/workers');
      const data = await res.json();
      currentWorkersList = data.workers || [];
      renderWorkers(currentWorkersList);
    } catch (err) {
      if (workersTbody) {
        workersTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#dc2626; padding:20px;">${err.message || 'Failed to load workers.'}</td></tr>`;
      }
    }
  }

  function renderWorkers(workers) {
    if (!workersTbody) return;

    const total = workers.length;
    const pending = workers.filter(w => !w.approvalStatus || w.approvalStatus === 'pending').length;
    const approved = workers.filter(w => w.approvalStatus === 'approved').length;

    if (statTotalWorkers) statTotalWorkers.textContent = total;
    if (statPendingWorkers) statPendingWorkers.textContent = pending;
    if (statApprovedWorkers) statApprovedWorkers.textContent = approved;

    if (workers.length === 0) {
      workersTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#706d66; padding:24px;">No worker partners registered yet.</td></tr>';
      return;
    }

    workersTbody.innerHTML = workers.map(w => {
      const status = w.approvalStatus || 'pending';
      const statusClass = status === 'approved' ? 'approved' : (status === 'rejected' ? 'rejected' : 'pending');
      const statusLabel = status === 'approved' ? '✓ Approved' : (status === 'rejected' ? '✕ Rejected / Hold' : '⏳ Pending Review');
      const id = w._id || w.id;

      let docBtn = '<span style="color:#94a3b8; font-size:12px;">No docs</span>';
      if (w.documentFile) {
        docBtn = `<button type="button" class="btn-table-action docs btn-view-doc" data-id="${id}" style="font-size:11px; padding:4px 8px;">📄 View Docs</button>`;
      }

      return `
        <tr>
          <td>
            <strong>${escapeHtml(w.name || 'Unnamed Partner')}</strong>
            <small>${escapeHtml(w.email || 'No email')} · ${escapeHtml(w.phone || 'No phone')}</small>
          </td>
          <td>
            <span style="font-weight:600; text-transform:capitalize;">${escapeHtml(w.skillCategory || 'General')}</span>
            <small>${escapeHtml(w.specificSkill || 'Standard servicing')}</small>
          </td>
          <td>${escapeHtml(String(w.experience || '1'))} yrs</td>
          <td>
            <span>${escapeHtml(w.city || 'Bengaluru')}</span>
            <small>${escapeHtml(w.locality || 'General Metro')}</small>
          </td>
          <td>${docBtn}</td>
          <td><span class="admin-badge ${statusClass}">${statusLabel}</span></td>
          <td>
            <div class="admin-action-btns">
              ${status !== 'approved' ? `<button type="button" class="btn-table-action approve btn-worker-action" data-id="${id}" data-status="approved">Approve</button>` : ''}
              ${status !== 'rejected' ? `<button type="button" class="btn-table-action hold btn-worker-action" data-id="${id}" data-status="rejected">Put on Hold</button>` : ''}
              <button type="button" class="btn-table-action delete btn-worker-delete" data-id="${id}" title="Remove partner">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5. Load Customer Accounts
  async function loadCustomers() {
    if (!activeAdminToken) return;

    if (customersTbody) {
      customersTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#706d66; padding:24px;">Loading customer accounts...</td></tr>';
    }

    try {
      const res = await adminFetch('/admin/customers');
      const data = await res.json();
      currentCustomersList = data.customers || [];
      renderCustomers(currentCustomersList);
    } catch (err) {
      if (customersTbody) {
        customersTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#dc2626; padding:20px;">${err.message || 'Failed to load customers.'}</td></tr>`;
      }
    }
  }

  function renderCustomers(customers) {
    if (!customersTbody) return;

    const total = customers.length;
    const totalActiveBookings = customers.reduce((sum, c) => sum + (c.activeBookingsCount || 0), 0);

    if (statTotalCustomers) statTotalCustomers.textContent = total;
    if (statActiveCustomerBookings) statActiveCustomerBookings.textContent = totalActiveBookings;

    if (customers.length === 0) {
      customersTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#706d66; padding:24px;">No customer accounts registered yet.</td></tr>';
      return;
    }

    customersTbody.innerHTML = customers.map(c => {
      const id = c._id || c.id;
      const joined = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent';
      const isBanned = c.isBanned || (c.warningsCount && c.warningsCount > 3);
      const warningsCount = c.warningsCount || 0;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(c.name || 'Hustle Customer')}</strong>
            <small>ID: #${id.slice(-6)} ${c.preferredCity ? `· 📍 ${escapeHtml(c.preferredCity)}` : ''}</small>
          </td>
          <td>
            <span>${escapeHtml(c.email || 'No email')}</span>
            <small>${escapeHtml(c.phone || 'No phone')}</small>
          </td>
          <td>${joined}</td>
          <td>
            <div>
              <span style="font-weight:700; color:var(--admin-ink);">${c.completedBookingsCount || 0} completed</span>
              ${c.activeBookingsCount > 0 ? `<small style="color:#e56d24; font-weight:700;">(${c.activeBookingsCount} in escrow)</small>` : ''}
            </div>
            <div style="margin-top:3px;">
              ${isBanned ? `
                <span class="admin-badge rejected" style="font-size:10.5px;">🚫 PERMANENTLY BANNED</span>
              ` : (warningsCount > 0 ? `
                <span class="admin-badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-size:10.5px;">⚠️ Warnings: ${warningsCount}/3</span>
              ` : `
                <span style="color:#059669; font-size:11px; font-weight:600;">✓ Good Standing</span>
              `)}
            </div>
          </td>
          <td>
            <div class="admin-action-btns">
              <button type="button" class="btn-table-action delete btn-customer-delete" data-id="${id}" title="Remove customer account">Remove</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 6. Load Dispute Tickets
  async function loadDisputes() {
    if (!activeAdminToken) return;

    if (disputesTbody) {
      disputesTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#706d66; padding:24px;">Loading dispute tickets...</td></tr>';
    }

    try {
      const res = await adminFetch('/admin/tickets');
      const data = await res.json();
      currentTicketsList = data.tickets || [];
      renderDisputes(currentTicketsList);
    } catch (err) {
      if (disputesTbody) {
        disputesTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#dc2626; padding:20px;">${err.message || 'Failed to load disputes.'}</td></tr>`;
      }
    }
  }

  function renderDisputes(tickets) {
    if (!disputesTbody) return;

    const total = tickets.length;
    const open = tickets.filter(t => t.status === 'open' || t.status === 'under_review').length;
    const resolved = tickets.filter(t => t.status === 'resolved' || t.status === 'dismissed').length;

    if (statTotalDisputes) statTotalDisputes.textContent = total;
    if (statOpenDisputes) statOpenDisputes.textContent = open;
    if (statResolvedDisputes) statResolvedDisputes.textContent = resolved;

    if (badgeOpenDisputes) {
      badgeOpenDisputes.textContent = open;
      badgeOpenDisputes.style.display = open > 0 ? 'inline-flex' : 'none';
    }

    if (tickets.length === 0) {
      disputesTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#706d66; padding:24px;">No dispute tickets raised yet. Escrow operations running smoothly.</td></tr>';
      return;
    }

    disputesTbody.innerHTML = tickets.map(t => {
      const id = t.ticketId || t._id;
      const status = t.status || 'open';
      const statusClass = status === 'resolved' ? 'approved' : (status === 'dismissed' ? 'hold' : 'rejected');
      const statusLabel = status === 'resolved' ? '✓ Resolved' : (status === 'dismissed' ? '✕ Dismissed' : '⚠️ Open / Review');
      const dateStr = t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Recent';

      return `
        <tr>
          <td>
            <strong>🎫 #${escapeHtml(t.ticketId)}</strong>
            <small>📅 ${dateStr} · Bk: #${escapeHtml(String(t.bookingId).slice(-6))}</small>
          </td>
          <td>
            <span style="font-weight:700; color:${t.complainantRole === 'worker' ? '#0284c7' : '#e56d24'};">
              ${t.complainantRole === 'worker' ? '👷 Worker' : '👤 Customer'}
            </span>
            <small>${escapeHtml(t.complainantName || 'Platform User')}</small>
          </td>
          <td>
            <strong>${escapeHtml(t.respondentName || 'Opposing Party')}</strong>
            <small>${t.complainantRole === 'worker' ? 'Customer' : 'Worker Partner'}</small>
          </td>
          <td>
            <span style="font-weight:600;">${escapeHtml(t.serviceTitle || 'Task Service')}</span>
            <small style="color:var(--admin-orange); font-weight:700;">${escapeHtml(t.agreedPrice || 'Escrow Held')}</small>
          </td>
          <td>
            <strong style="font-size:12px; display:block;">${escapeHtml(t.category || 'General Dispute')}</strong>
            <p style="margin:2px 0 0; font-size:11.5px; color:#475569; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              “${escapeHtml(t.description || 'No description')}”
            </p>
          </td>
          <td><span class="admin-badge ${statusClass}">${statusLabel}</span></td>
          <td>
            <button type="button" class="btn-table-action docs btn-dispute-settle" data-id="${escapeHtml(t.ticketId)}" style="padding:5px 10px; font-size:11px;">
              ${status === 'resolved' ? 'Inspect Verdict' : '⚖️ Settle Dispute'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 7. Event Delegation for Action Buttons
  document.addEventListener('click', async (e) => {
    // A. Worker Status Update (Approve / Put on Hold)
    const workerBtn = e.target.closest('.btn-worker-action');
    if (workerBtn) {
      const id = workerBtn.dataset.id;
      const status = workerBtn.dataset.status;
      if (!id || !status) return;

      workerBtn.disabled = true;
      try {
        const res = await adminFetch(`/admin/workers/${id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadWorkers();
        } else {
          alert(data.message || 'Failed to update status.');
        }
      } catch (err) {
        alert(err.message || 'Error updating partner status.');
      }
      return;
    }

    // B. Worker Delete
    const workerDelBtn = e.target.closest('.btn-worker-delete');
    if (workerDelBtn) {
      const id = workerDelBtn.dataset.id;
      if (!id) return;
      if (!confirm('Are you sure you want to remove this worker partner profile?')) return;

      try {
        const res = await adminFetch(`/admin/workers/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadWorkers();
        } else {
          alert(data.message || 'Failed to remove partner.');
        }
      } catch (err) {
        alert(err.message || 'Error removing partner.');
      }
      return;
    }

    // C. View Supporting Docs Modal
    const viewDocBtn = e.target.closest('.btn-view-doc');
    if (viewDocBtn) {
      const id = viewDocBtn.dataset.id;
      const worker = currentWorkersList.find(w => (w._id || w.id) === id);
      if (worker && docModal && docModalBody) {
        docModalTitle.innerHTML = `<span>📄</span> Verification Documents: ${escapeHtml(worker.name)}`;
        docModalBody.innerHTML = `
          <div style="margin-bottom:14px; font-size:13px; color:#475569;">
            <strong>Partner:</strong> ${escapeHtml(worker.name)} (${escapeHtml(worker.skillCategory)}) · <strong>Phone:</strong> ${escapeHtml(worker.phone || 'N/A')}
          </div>
          <div class="admin-doc-frame">
            <iframe src="${escapeHtml(worker.documentFile)}" title="Uploaded Verification Document" style="width:100%; height:400px; border:none;"></iframe>
          </div>
          <div style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="btn-table-action approve btn-worker-action" data-id="${id}" data-status="approved">✓ Approve Partner</button>
            <button type="button" class="btn-table-action hold btn-worker-action" data-id="${id}" data-status="rejected">✕ Reject Documents</button>
          </div>
        `;
        docModal.hidden = false;
        docModal.style.display = 'flex';
      }
      return;
    }

    // D. Customer Delete
    const custDelBtn = e.target.closest('.btn-customer-delete');
    if (custDelBtn) {
      const id = custDelBtn.dataset.id;
      if (!id) return;
      if (!confirm('Are you sure you want to remove this customer account? All associated profile data will be permanently removed.')) return;

      try {
        const res = await adminFetch(`/admin/customers/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok && data.success) {
          await loadCustomers();
        } else {
          alert(data.message || 'Failed to remove customer.');
        }
      } catch (err) {
        alert(err.message || 'Error removing customer.');
      }
      return;
    }

    // E. Settle Dispute Modal
    const disputeBtn = e.target.closest('.btn-dispute-settle');
    if (disputeBtn) {
      const ticketId = disputeBtn.dataset.id;
      const ticket = currentTicketsList.find(t => t.ticketId === ticketId);
      if (ticket) openDisputeSettlementModal(ticket);
      return;
    }
  });

  // Modal Closers
  btnCloseDocModal?.addEventListener('click', () => {
    if (docModal) {
      docModal.hidden = true;
      docModal.style.display = 'none';
    }
  });

  btnCloseDisputeModal?.addEventListener('click', () => {
    if (disputeModal) {
      disputeModal.hidden = true;
      disputeModal.style.display = 'none';
    }
  });

  docModal?.addEventListener('click', (e) => {
    if (e.target === docModal) {
      docModal.hidden = true;
      docModal.style.display = 'none';
    }
  });

  disputeModal?.addEventListener('click', (e) => {
    if (e.target === disputeModal) {
      disputeModal.hidden = true;
      disputeModal.style.display = 'none';
    }
  });

  // Dispute Settlement Logic
  function openDisputeSettlementModal(ticket) {
    if (!disputeModal || !disputeModalBody) return;

    const isResolved = ticket.status === 'resolved' || ticket.status === 'dismissed';

    disputeModalTitle.innerHTML = `<span>⚖️</span> Dispute #${escapeHtml(ticket.ticketId)} · Escrow Settle`;
    disputeModalBody.innerHTML = `
      <div style="background:#fff7ed; border:1px solid #fdba74; border-radius:8px; padding:12px 14px; margin-bottom:14px; font-size:12.5px;">
        <div><strong>Task:</strong> ${escapeHtml(ticket.serviceTitle || 'Service Task')} · <strong>Held Escrow:</strong> <span style="color:#e56d24; font-weight:700;">${escapeHtml(ticket.agreedPrice || 'Held in Escrow')}</span></div>
        <div><strong>Complainant:</strong> ${ticket.complainantRole === 'worker' ? '👷 Worker' : '👤 Customer'} (${escapeHtml(ticket.complainantName)}) vs ${escapeHtml(ticket.respondentName)}</div>
        <div style="margin-top:6px; background:#ffffff; padding:8px 10px; border-radius:6px; border:1px solid #fed7aa; color:#78350f;">
          <strong>Claim Statement:</strong> “${escapeHtml(ticket.description)}”
        </div>
      </div>

      ${isResolved ? `
        <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:8px; padding:14px; font-size:13px; color:#166534; margin-bottom:12px;">
          <strong>✓ Settled by ${escapeHtml(ticket.settledBy || 'Operations Admin')}</strong>
          <p style="margin:4px 0 0;"><strong>Verdict:</strong> ${escapeHtml(ticket.resolutionAction || ticket.status)}</p>
          <p style="margin:4px 0 0;"><strong>Admin Notes:</strong> ${escapeHtml(ticket.adminNotes || 'Platform escrow standards applied.')}</p>
        </div>
      ` : `
        <form id="admin-dispute-settle-form">
          <div style="margin-bottom:12px;">
            <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Dispute Verdict &amp; Escrow Action</label>
            <select id="admin-dispute-action" style="width:100%; box-sizing:border-box; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
              <option value="favour_worker">🛡️ In Favor of Worker (Release escrow to worker, void customer rating, issue customer warning)</option>
              <option value="favour_customer">👤 In Favor of Customer (Refund customer from escrow, issue worker warning)</option>
              <option value="mutual_settlement">🤝 Mutual Settlement (Split escrow 50/50, dismiss retaliatory rating)</option>
              <option value="dismiss">✕ Dismiss Dispute Claim</option>
            </select>
          </div>

          <div style="margin-bottom:14px;">
            <label style="font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:4px;">Official Investigation Notes</label>
            <textarea id="admin-dispute-notes" rows="3" placeholder="Provide factual context and justification for the platform record..." style="width:100%; box-sizing:border-box; padding:8px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:12.5px; font-family:inherit;" required></textarea>
          </div>

          <div id="dispute-settle-error" style="color:#dc2626; font-size:12px; margin-bottom:10px;" hidden></div>

          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="btn-table-action hold" id="btn-cancel-dispute-modal" style="padding:8px 16px;">Cancel</button>
            <button type="submit" class="btn-admin-login-submit" id="btn-submit-dispute-settle" style="width:auto; padding:8px 18px; font-size:13px;">
              ⚖️ Confirm Settlement &amp; Notify Parties
            </button>
          </div>
        </form>
      `}
    `;

    disputeModal.hidden = false;
    disputeModal.style.display = 'flex';

    if (!isResolved) {
      document.querySelector('#btn-cancel-dispute-modal')?.addEventListener('click', () => {
        disputeModal.hidden = true;
        disputeModal.style.display = 'none';
      });

      document.querySelector('#admin-dispute-settle-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const action = document.querySelector('#admin-dispute-action')?.value || 'favour_worker';
        const notes = document.querySelector('#admin-dispute-notes')?.value.trim() || '';
        const errEl = document.querySelector('#dispute-settle-error');
        const submitBtn = document.querySelector('#btn-submit-dispute-settle');

        if (!notes) {
          if (errEl) {
            errEl.textContent = 'Please provide official investigation notes for platform records.';
            errEl.hidden = false;
          }
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Settling dispute...';
        }

        try {
          const res = await adminFetch(`/admin/tickets/${ticket.ticketId}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: action === 'dismiss' ? 'dismissed' : 'resolved',
              resolutionAction: action,
              adminNotes: notes
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            disputeModal.hidden = true;
            disputeModal.style.display = 'none';
            alert(`Dispute Ticket #${ticket.ticketId} successfully settled (${action}). Both parties have been updated.`);
            await loadDisputes();
          } else {
            throw new Error(data.message || 'Failed to settle ticket.');
          }
        } catch (err) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '⚖️ Confirm Settlement & Notify Parties';
          }
          if (errEl) {
            errEl.textContent = err.message || 'Error executing settlement.';
            errEl.hidden = false;
          }
        }
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize on page load
  verifyAccessGuard();
})();
