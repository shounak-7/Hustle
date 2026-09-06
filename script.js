const isMainLandingPath = window.location.pathname.endsWith('index.html') || 
                          window.location.pathname === '/' || 
                          window.location.pathname === '' || 
                          (!window.location.pathname.includes('customer-dashboard') && 
                           !window.location.pathname.includes('worker-dashboard') && 
                           !window.location.pathname.includes('welcome'));

function isUserAuthenticated() {
  if (window.HustleSession && window.HustleSession.isLoggedIn && window.HustleSession.isLoggedIn()) return true;
  return Boolean(localStorage.getItem('hustleToken') && (localStorage.getItem('hustleCurrentUser') || localStorage.getItem('hustleUser')));
}

const isGuestLandingPage = isMainLandingPath && !isUserAuthenticated();

// Heart button: on unauthenticated landing redirect to login; otherwise toggle saved favorite state
document.querySelectorAll('.heart').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (isMainLandingPath && !isUserAuthenticated()) {
    location.href = 'auth.html?role=customer&mode=signin';
  } else {
    button.classList.toggle('active');
    const isSaved = button.classList.contains('active');
    button.textContent = isSaved ? '♥' : '♡';
    button.style.color = isSaved ? '#ef4444' : '';
    if (window.showHustleToast) {
      window.showHustleToast(isSaved ? 'Service saved to favorites!' : 'Removed from favorites', 'info');
    }
  }
}));

if (isMainLandingPath) {
  document.querySelectorAll('.view-more-services').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      if (!isUserAuthenticated()) {
        location.href = 'auth.html?role=customer&mode=signin';
      } else {
        location.href = 'customer-dashboard.html';
      }
    });
  });

  // Service card clicks on main landing redirect to signin if guest, or open customer dashboard if authenticated
  document.querySelectorAll('.worker-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      event.preventDefault();
      if (!isUserAuthenticated()) {
        location.href = 'auth.html?role=customer&mode=signin';
      } else {
        location.href = 'customer-dashboard.html';
      }
    });
  });
}

// Sync header profile and dropdown with active session (Customer vs Worker)
function syncHeaderSession() {
  const guestBtn = document.querySelector('#nav-guest-btn');
  const userBtn = document.querySelector('#nav-user-btn');
  const dropdownMenu = document.querySelector('#profile-dropdown-menu');
  const mobileProfileText = document.querySelector('#mobile-profile-text');
  const mobileProfileLink = document.querySelector('#mobile-profile-link');

  // Main landing dashboard (index.html or /) always defaults to pure guest view (login: none)
  const isMainLanding = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '' || (!window.location.pathname.includes('customer-dashboard') && !window.location.pathname.includes('worker-dashboard') && !window.location.pathname.includes('welcome'));
  if (isMainLanding) {
    if (guestBtn) guestBtn.style.display = 'grid';
    if (userBtn) {
      userBtn.classList.remove('active');
      userBtn.style.display = 'none';
    }
    if (dropdownMenu) dropdownMenu.classList.remove('open');
    if (mobileProfileText) mobileProfileText.textContent = 'Sign In';
    if (mobileProfileLink) mobileProfileLink.href = 'auth.html';
    return;
  }

  const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
  const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
  const isLoggedIn = Boolean(user && token);

  if (isLoggedIn && user) {
    const isWorker = user.role === 'worker';
    const initials = window.HustleSession ? HustleSession.getInitials(user.name) : (user.name ? user.name.slice(0, 2).toUpperCase() : 'HU');
    const firstName = user.name ? user.name.trim().split(/\s+/)[0] : 'User';

    if (guestBtn) guestBtn.style.display = 'none';
    if (userBtn) {
      userBtn.classList.add('active');
      userBtn.style.display = 'inline-flex';
    }

    const avatarText = document.querySelector('#nav-avatar-text');
    if (avatarText) avatarText.textContent = initials;

    const avatarPill = document.querySelector('#nav-avatar-pill');
    if (avatarPill) {
      avatarPill.className = `profile-avatar-pill ${isWorker ? 'worker-avatar' : 'customer-avatar'}`;
    }

    const navName = document.querySelector('#nav-user-name');
    if (navName) navName.textContent = firstName;

    // Dropdown Header
    const dropdownAvatar = document.querySelector('#dropdown-avatar');
    if (dropdownAvatar) {
      dropdownAvatar.textContent = initials;
      dropdownAvatar.className = `dropdown-avatar ${isWorker ? 'worker' : ''}`;
    }

    const dropdownName = document.querySelector('#dropdown-name');
    if (dropdownName) dropdownName.textContent = user.name || 'Hustle Member';

    const dropdownEmail = document.querySelector('#dropdown-email');
    if (dropdownEmail) dropdownEmail.textContent = user.email || user.phone || '';

    const dropdownBadge = document.querySelector('#dropdown-role-badge');
    if (dropdownBadge) {
      if (isWorker) {
        dropdownBadge.className = 'dropdown-role-badge worker';
        dropdownBadge.textContent = user.skillCategory ? `🛠️ ${user.skillCategory}` : '🛠️ Pro Partner';
      } else {
        dropdownBadge.className = 'dropdown-role-badge customer';
        dropdownBadge.textContent = '👤 Verified Customer';
      }
    }

    // Dropdown Links tailored for role
    const dropdownLinks = document.querySelector('#dropdown-links');
    if (dropdownLinks) {
      if (isWorker) {
        dropdownLinks.innerHTML = `
          <li><a class="dropdown-link" href="welcome.html?role=worker"><span class="icon">⚡</span><span>Partner Workspace &amp; Gigs</span></a></li>
          <li><a class="dropdown-link" href="#activity"><span class="icon">💰</span><span>Daily Payouts &amp; Tips (100%)</span></a></li>
          <li><a class="dropdown-link" href="terms.html#terms-safety"><span class="icon">📜</span><span>Partner Code &amp; Escrow</span></a></li>
        `;
      } else {
        dropdownLinks.innerHTML = `
          <li><a class="dropdown-link" href="#appointments" id="dropdown-link-appointments"><span class="icon">📦</span><span>My Requests &amp; Workspace</span></a></li>
          <li><a class="dropdown-link" href="#services"><span class="icon">🔍</span><span>Explore All Services</span></a></li>
          <li><a class="dropdown-link" href="terms.html"><span class="icon">🛡️</span><span>How Hustle Works &amp; Safety</span></a></li>
        `;
      }
    }

    // Mobile nav update
    if (mobileProfileText) mobileProfileText.textContent = firstName;
    if (mobileProfileLink) mobileProfileLink.href = user.role === 'customer' ? 'customer-dashboard.html' : 'worker-dashboard.html';

  } else {
    // Guest state
    if (guestBtn) guestBtn.style.display = 'grid';
    if (userBtn) {
      userBtn.classList.remove('active');
      userBtn.style.display = 'none';
    }
    if (dropdownMenu) dropdownMenu.classList.remove('open');
    if (mobileProfileText) mobileProfileText.textContent = 'Sign In';
    if (mobileProfileLink) mobileProfileLink.href = 'auth.html';
  }
}

// Wire up profile dropdown interactions
function setupProfileDropdown() {
  const userBtn = document.querySelector('#nav-user-btn');
  const dropdownMenu = document.querySelector('#profile-dropdown-menu');
  const logoutBtn = document.querySelector('#btn-header-logout');

  userBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdownMenu?.classList.toggle('open');
    userBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    const apptLink = e.target.closest('#dropdown-link-appointments, [href="#appointments"]');
    if (apptLink && !e.target.closest('.mobile-request')) {
      const user = window.HustleSession ? HustleSession.getUser() : null;
      if (user && user.role === 'customer') {
        e.preventDefault();
        dropdownMenu?.classList.remove('open');
        userBtn?.setAttribute('aria-expanded', 'false');
        if (window.HustleBooking && typeof window.HustleBooking.openCustomerBookingsModal === 'function') {
          window.HustleBooking.openCustomerBookingsModal();
        } else {
          window.location.href = 'customer-dashboard.html#appointments';
        }
        return;
      }
    }

    if (!e.target.closest('#profile-nav-wrap')) {
      dropdownMenu?.classList.remove('open');
      userBtn?.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdownMenu?.classList.remove('open');
      userBtn?.setAttribute('aria-expanded', 'false');
    }
  });

  logoutBtn?.addEventListener('click', () => {
    if (window.HustleSession) {
      HustleSession.logOut('index.html');
    } else {
      localStorage.removeItem('hustleToken');
      localStorage.removeItem('hustleCurrentUser');
      window.location.href = 'index.html';
    }
  });

  window.addEventListener('hustle:session-change', syncHeaderSession);
}

syncHeaderSession();
setupProfileDropdown();
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#search')?.focus(); } });
/**
 * AI 18-Services Matcher & Pool Progression
 * Matches whatever search is made with all 18 results available.
 */
// Dismiss all active AI search suggestions floating dropdowns
function dismissAllAiSearchSuggestions() {
  document.querySelectorAll('.hustle-ai-suggestions-dropdown').forEach(dd => {
    dd.style.display = 'none';
    dd.innerHTML = '';
  });
}
window.dismissAllAiSearchSuggestions = dismissAllAiSearchSuggestions;

/**
 * AI Natural Language Match Search with 18 Services Logic
 * Suggests closest matching service; if no matching services found, then only moves ahead to create new pool.
 */
async function executeAi18ServiceSearch(query, btn = null) {
  if (!query) return;

  // Immediately dismiss any open AI suggestion dropdowns to prevent overlapping screen
  dismissAllAiSearchSuggestions();

  const origContent = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="ai-spark-mini rotating" style="color:#ffffff; font-size:16px;">✦</span>';
  }

  const activeCity = localStorage.getItem('hustleSelectedCity') || localStorage.getItem('hustleLocation') || 'Bengaluru';
  if (window.showHustleToast) {
    showHustleToast('✦ AI matching with all 18 available services...', 'info', 2200);
  }

  try {
    const res = await fetch('/api/ai/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userInput: query, city: activeCity })
    });
    const diagnosis = await res.json();

    if (diagnosis && diagnosis.success) {
      const match18 = diagnosis.match18;

      if (match18 && match18.matched && match18.service) {
        // CLOSEST MATCH FOUND IN 18 SERVICES
        // 1. Highlight and scroll to the service card in the grid
        if (window.HustleBooking?.highlight18ServiceCard) {
          window.HustleBooking.highlight18ServiceCard(match18.service.id || match18.service.name);
        }

        // 2. Filter service cards to highlight the closest matching service
        const normTarget = match18.service.name.toLowerCase();
        document.querySelectorAll('.service-card').forEach((card) => {
          const text = card.textContent.toLowerCase();
          if (text.includes(normTarget) || (match18.service.id && text.includes(match18.service.id))) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });

        // 3. Inform user with toast
        if (window.showHustleToast) {
          if (isGuestLandingPage) {
            showHustleToast(`✦ Closest Match: ${match18.service.name}. Please log in as customer to book!`, 'info', 3500);
          } else {
            showHustleToast(`✦ Closest Match: ${match18.service.name} (${match18.service.category})`, 'success', 3500);
          }
        }

        // 4. Pop up suggestion modal
        if (window.HustleBooking?.showAiDiagnosisModal) {
          window.HustleBooking.showAiDiagnosisModal(diagnosis, query);
        }
      } else {
        // NO MATCH FOUND AMONG THE 18 AVAILABLE SERVICES:
        // Only move ahead to create new pool!
        setTimeout(() => {
          if (isGuestLandingPage) {
            sessionStorage.setItem('hustlePendingAiDiagnosis', JSON.stringify({ diagnosis, query }));
            location.href = 'auth.html?role=customer';
          } else if (window.HustleBooking?.openCustomJobModal) {
            window.HustleBooking.openCustomJobModal(
              diagnosis.estimatedPriceRange?.suggested || 499,
              diagnosis.suggestedNotes || query,
              diagnosis.match18?.suggestedPoolSkill || diagnosis.category || query
            );
          }
        }, 150);
      }
      return;
    }
  } catch (err) {
    console.warn('[Hustle AI] 18 Service search error:', err);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origContent;
    }
  }

  // Fallback if network or error
  if (isGuestLandingPage) {
    location.href = 'auth.html?role=customer';
  } else if (window.HustleBooking?.openCustomJobModal) {
    window.HustleBooking.openCustomJobModal(499, query, 'Other');
  }
}

// AI Match Field Submit (#find-service)
document.querySelector('#find-service')?.addEventListener('click', () => {
  const query = document.querySelector('#need-finder')?.value.trim();
  if (!query) {
    document.querySelector('#need-finder')?.focus();
    return;
  }
  const btn = document.querySelector('#find-service');
  executeAi18ServiceSearch(query, btn);
});

// Allow pressing Enter in AI Match input
document.querySelector('#need-finder')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.querySelector('#find-service')?.click();
  }
});

// Live filter service cards when searching in the header search input
document.querySelector('#search')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  document.querySelectorAll('.service-card').forEach((card) => {
    card.classList.remove('ai-matched-highlight');
    const text = card.textContent.toLowerCase();
    if (!q || text.includes(q)) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
});

// Enter key on Header Search (#search): Run AI 18-service match or move to pool
document.querySelector('#search')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (e.defaultPrevented) return;
    e.preventDefault();
    const query = e.target.value.trim();
    if (!query) return;
    executeAi18ServiceSearch(query);
  }
});

/**
 * AI Real-time Search Suggestions Controller
 * Provides real-time autocompletion suggestions for tasks and works as the user types
 * Works seamlessly on both generic main landing page and customer dashboard.
 */
function setupAiSearchSuggestions(inputEl) {
  if (!inputEl || inputEl._hasAiSuggestions) return;
  inputEl._hasAiSuggestions = true;

  // Create floating dropdown container attached to document.body
  const dropdown = document.createElement('div');
  dropdown.className = 'hustle-ai-suggestions-dropdown';
  dropdown.setAttribute('role', 'listbox');
  dropdown.setAttribute('aria-label', 'AI Search Suggestions');
  dropdown.style.display = 'none';
  document.body.appendChild(dropdown);

  let activeSuggestions = [];
  let selectedIndex = -1;
  let debounceTimeout = null;
  let currentRequestId = 0;

  function updatePosition() {
    if (dropdown.style.display === 'none') return;
    const rect = inputEl.getBoundingClientRect();

    const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 24);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }
    if (left < 12) left = 12;

    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.width = `${width}px`;
  }

  function hideDropdown() {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    selectedIndex = -1;
    activeSuggestions = [];
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    try {
      const cleanQ = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!cleanQ) return text;
      const regex = new RegExp(`(${cleanQ})`, 'gi');
      return text.replace(regex, '<mark>$1</mark>');
    } catch {
      return text;
    }
  }

  function renderSuggestions(suggestions, query) {
    if (!suggestions || suggestions.length === 0) {
      hideDropdown();
      return;
    }

    activeSuggestions = suggestions;
    selectedIndex = -1;

    let itemsHtml = suggestions.map((item, idx) => {
      const isCatalog = Boolean(item.is18Catalog);
      const badgeClass = isCatalog ? 'hustle-ai-badge-catalog' : 'hustle-ai-badge-pool';
      const badgeText = isCatalog ? (item.category || '18 Service') : (item.tag || 'Custom Pro');

      return `
        <li class="hustle-ai-suggestion-item" data-index="${idx}" role="option" aria-selected="false">
          <div class="hustle-ai-suggestion-main">
            <span class="hustle-ai-suggestion-icon">✦</span>
            <span class="hustle-ai-suggestion-title" title="${item.title}">${highlightMatch(item.title, query)}</span>
          </div>
          <span class="hustle-ai-suggestion-badge ${badgeClass}">${badgeText}</span>
        </li>
      `;
    }).join('');

    dropdown.innerHTML = `
      <div class="hustle-ai-suggestions-header">
        <div class="header-left">
          <span class="ai-spark-spin">✦</span>
          <span>AI Task Suggestions</span>
        </div>
        <span style="font-size:10px; color:#9a3412; font-weight:700;">Hustle AI</span>
      </div>
      <ul class="hustle-ai-suggestions-list">
        ${itemsHtml}
      </ul>
      <div class="hustle-ai-suggestions-footer">
        <span>Use <b>↑ / ↓</b> to navigate, <b>↵</b> to select</span>
        <span style="color:#ea580c; font-weight:700;">✦ Smart Match</span>
      </div>
    `;

    dropdown.style.display = 'block';
    updatePosition();
  }

  async function fetchSuggestions(query) {
    const requestId = ++currentRequestId;
    const activeCity = localStorage.getItem('hustleSelectedCity') || localStorage.getItem('hustleLocation') || 'Bengaluru';

    try {
      const res = await fetch('/api/ai/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, city: activeCity })
      });
      const data = await res.json();

      if (requestId === currentRequestId && data && data.success && Array.isArray(data.suggestions)) {
        if (inputEl.value.trim() === query) {
          renderSuggestions(data.suggestions, query);
        }
      }
    } catch (err) {
      console.warn('[Hustle AI] Suggestions error:', err);
    }
  }

  function handleInput() {
    clearTimeout(debounceTimeout);
    const query = inputEl.value.trim();

    if (!query || query.length < 2) {
      hideDropdown();
      return;
    }

    debounceTimeout = setTimeout(() => {
      fetchSuggestions(query);
    }, 220);
  }

  function selectSuggestion(index) {
    if (index < 0 || index >= activeSuggestions.length) return;
    const chosen = activeSuggestions[index];
    if (!chosen) return;

    inputEl.value = chosen.title;
    hideDropdown();
    if (typeof dismissAllAiSearchSuggestions === 'function') {
      dismissAllAiSearchSuggestions();
    }
    inputEl.blur();

    // Trigger search match
    executeAi18ServiceSearch(chosen.title);
  }

  function setSelectedIndex(newIdx) {
    const items = dropdown.querySelectorAll('.hustle-ai-suggestion-item');
    items.forEach(el => {
      el.classList.remove('active');
      el.setAttribute('aria-selected', 'false');
    });

    selectedIndex = newIdx;
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      const activeEl = items[selectedIndex];
      activeEl.classList.add('active');
      activeEl.setAttribute('aria-selected', 'true');
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  // Bind input typing
  inputEl.addEventListener('input', handleInput);
  inputEl.addEventListener('focus', () => {
    const query = inputEl.value.trim();
    if (query.length >= 2) {
      fetchSuggestions(query);
    }
  });

  // Keyboard navigation
  inputEl.addEventListener('keydown', (e) => {
    if (dropdown.style.display !== 'none' && activeSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = (selectedIndex + 1) % activeSuggestions.length;
        setSelectedIndex(nextIdx);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = selectedIndex <= 0 ? activeSuggestions.length - 1 : selectedIndex - 1;
        setSelectedIndex(prevIdx);
        return;
      }
      if (e.key === 'Enter') {
        hideDropdown();
        if (selectedIndex >= 0 && selectedIndex < activeSuggestions.length) {
          e.preventDefault();
          e.stopImmediatePropagation();
          selectSuggestion(selectedIndex);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideDropdown();
        return;
      }
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      hideDropdown();
    }
  });

  // Dropdown item selection on click / mousedown
  dropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.hustle-ai-suggestion-item');
    if (!item) return;
    e.preventDefault(); // prevents input blur before click registers
    const idx = parseInt(item.dataset.index, 10);
    selectSuggestion(idx);
  });

  // Hide dropdown on blur / outside clicks
  inputEl.addEventListener('blur', () => {
    setTimeout(hideDropdown, 220);
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== inputEl) {
      hideDropdown();
    }
  });

  window.addEventListener('scroll', () => {
    if (dropdown.style.display === 'block') updatePosition();
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (dropdown.style.display === 'block') updatePosition();
  }, { passive: true });
}

// Initialize AI Search Suggestions on both inputs
function initAllAiSearchSuggestions() {
  const searchInput = document.querySelector('#search');
  const needFinderInput = document.querySelector('#need-finder');

  if (searchInput) setupAiSearchSuggestions(searchInput);
  if (needFinderInput) setupAiSearchSuggestions(needFinderInput);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllAiSearchSuggestions);
} else {
  initAllAiSearchSuggestions();
}


// Auto-check for pending AI diagnosis upon logging into customer dashboard
document.addEventListener('DOMContentLoaded', () => {
  try {
    const pendingMatch = sessionStorage.getItem('hustlePending18Match');
    if (pendingMatch) {
      const parsedMatch = JSON.parse(pendingMatch);
      sessionStorage.removeItem('hustlePending18Match');
      if (parsedMatch && parsedMatch.diagnosis && window.HustleBooking) {
        setTimeout(() => {
          if (window.HustleBooking.highlight18ServiceCard) {
            window.HustleBooking.highlight18ServiceCard(parsedMatch.serviceId || parsedMatch.serviceName);
          }
          if (window.HustleBooking.showAiDiagnosisModal) {
            window.HustleBooking.showAiDiagnosisModal(parsedMatch.diagnosis, parsedMatch.query);
          }
        }, 350);
      }
    }

    const pending = sessionStorage.getItem('hustlePendingAiDiagnosis');
    if (pending) {
      const parsed = JSON.parse(pending);
      sessionStorage.removeItem('hustlePendingAiDiagnosis');
      if (parsed && parsed.diagnosis) {
        const hasMatch = Boolean(parsed.diagnosis.match18?.hasMatch || parsed.diagnosis.match18?.matched);
        if (hasMatch && window.HustleBooking?.showAiDiagnosisModal) {
          setTimeout(() => {
            window.HustleBooking.showAiDiagnosisModal(parsed.diagnosis, parsed.query);
          }, 300);
        } else if (window.HustleBooking?.openCustomJobModal) {
          setTimeout(() => {
            window.HustleBooking.openCustomJobModal(
              parsed.diagnosis.estimatedPriceRange?.suggested || 499,
              parsed.diagnosis.suggestedNotes || parsed.query,
              parsed.diagnosis.match18?.suggestedPoolSkill || parsed.diagnosis.specificSkill || parsed.diagnosis.category || parsed.query
            );
          }, 300);
        }
      }
    }
  } catch {}
});
const categoryRow = document.querySelector('#category-row');
const stepCategories = (direction) => categoryRow?.scrollBy({ left: direction * 235, behavior: 'smooth' });
document.querySelector('#category-prev')?.addEventListener('click', () => stepCategories(-1));
document.querySelector('#category-next')?.addEventListener('click', () => stepCategories(1));
if (categoryRow && matchMedia('(max-width: 680px)').matches) { let categoryAutoplay = setInterval(() => { const atEnd = categoryRow.scrollLeft + categoryRow.clientWidth >= categoryRow.scrollWidth - 8; categoryRow.scrollTo({ left: atEnd ? 0 : categoryRow.scrollLeft + 220, behavior: 'smooth' }); }, 3400); ['touchstart', 'pointerdown'].forEach((event) => categoryRow.addEventListener(event, () => { clearInterval(categoryAutoplay); }, { once: true })); }
const serviceRow = document.querySelector('.service-grid');
const moveServices = (direction) => serviceRow?.scrollBy({ left: direction * 270, behavior: 'smooth' });
document.querySelector('.carousel-controls button:first-child')?.addEventListener('click', () => moveServices(-1));
document.querySelector('.carousel-controls button:last-child')?.addEventListener('click', () => moveServices(1));
if (serviceRow && matchMedia('(max-width: 680px)').matches) { let serviceAutoplay = setInterval(() => { const atEnd = serviceRow.scrollLeft + serviceRow.clientWidth >= serviceRow.scrollWidth - 8; serviceRow.scrollTo({ left: atEnd ? 0 : serviceRow.scrollLeft + 262, behavior: 'smooth' }); }, 4000); ['touchstart', 'pointerdown'].forEach((event) => serviceRow.addEventListener(event, () => clearInterval(serviceAutoplay), { once: true })); }
const locationPicker = document.querySelector('#location-picker');
const locationName = document.querySelector('#location-name');
const locationStatus = document.querySelector('#location-status');

const getGoogleMapsKey = () => window.HUSTLE_GOOGLE_MAPS_KEY || localStorage.getItem('hustleGoogleMapsKey') || '';

let detectingLocation = false;
let savedCoords = null;
try {
  savedCoords = JSON.parse(localStorage.getItem('hustleLocationCoords') || 'null');
} catch {
  savedCoords = null;
}

// Build compact location selection dropdown sheet
const locationSheet = document.createElement('div');
locationSheet.className = 'location-sheet';
locationSheet.id = 'location-sheet';
locationSheet.hidden = true;
locationSheet.setAttribute('role', 'dialog');
locationSheet.setAttribute('aria-label', 'Choose location');
locationSheet.innerHTML = `
  <div class="location-sheet-header">
    <div class="location-search-wrap">
      <span class="location-search-icon" aria-hidden="true">⌕</span>
      <input id="location-search" type="search" placeholder="Search city or locality…" autocomplete="off" />
    </div>
  </div>
  <div class="location-cities-quick" style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; background: #fafaf9;">
    <small style="font-size: 11px; font-weight: 700; color: #78716c; text-transform: uppercase; display: block; margin-bottom: 6px;">Available Cities</small>
    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
      <button type="button" class="quick-city-chip" data-city="Kolkata" data-lat="22.5726" data-lng="88.3639" style="font-size:11.5px; padding:3px 8px; border-radius:6px; border:1px solid #e7e5e4; background:#fff; cursor:pointer; color:#1c1917;">Kolkata</button>
      <button type="button" class="quick-city-chip" data-city="Bengaluru" data-lat="12.9716" data-lng="77.5946" style="font-size:11.5px; padding:3px 8px; border-radius:6px; border:1px solid #e7e5e4; background:#fff; cursor:pointer; color:#1c1917;">Bengaluru</button>
      <button type="button" class="quick-city-chip" data-city="Chennai" data-lat="13.0827" data-lng="80.2707" style="font-size:11.5px; padding:3px 8px; border-radius:6px; border:1px solid #e7e5e4; background:#fff; cursor:pointer; color:#1c1917;">Chennai</button>
      <button type="button" class="quick-city-chip" data-city="Mumbai" data-lat="19.0760" data-lng="72.8777" style="font-size:11.5px; padding:3px 8px; border-radius:6px; border:1px solid #e7e5e4; background:#fff; cursor:pointer; color:#1c1917;">Mumbai</button>
      <button type="button" class="quick-city-chip" data-city="Delhi" data-lat="28.7041" data-lng="77.1025" style="font-size:11.5px; padding:3px 8px; border-radius:6px; border:1px solid #e7e5e4; background:#fff; cursor:pointer; color:#1c1917;">Delhi</button>
      <button type="button" class="quick-city-chip" data-city="Hyderabad" data-lat="17.3850" data-lng="78.4867" style="font-size:11.5px; padding:3px 8px; border-radius:6px; border:1px solid #e7e5e4; background:#fff; cursor:pointer; color:#1c1917;">Hyderabad</button>
      <button type="button" class="quick-city-chip" data-city="Ahmedabad" data-lat="23.0225" data-lng="72.5714" style="font-size:11.5px; padding:3px 8px; border-radius:6px; border:1px solid #e7e5e4; background:#fff; cursor:pointer; color:#1c1917;">Ahmedabad</button>
      <button type="button" class="quick-city-chip" data-city="Pune" data-lat="18.5204" data-lng="73.8567" style="font-size:11.5px; padding:3px 8px; border-radius:6px; border:1px solid #e7e5e4; background:#fff; cursor:pointer; color:#1c1917;">Pune</button>
    </div>
  </div>
  <button class="location-use" id="use-current-location" type="button">
    <span class="use-pin" aria-hidden="true">⌖</span>
    <span class="use-text">Use current location (GPS)</span>
  </button>
  <p class="location-hint" id="location-hint"></p>
  <ul class="location-suggestions" id="location-suggestions"></ul>
`;
document.body.appendChild(locationSheet);

const locationSearch = locationSheet.querySelector('#location-search');
const locationHint = locationSheet.querySelector('#location-hint');
const locationSuggestions = locationSheet.querySelector('#location-suggestions');
const useCurrentButton = locationSheet.querySelector('#use-current-location');
const useTextSpan = useCurrentButton?.querySelector('.use-text');

locationSheet.querySelectorAll('.quick-city-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const city = chip.dataset.city;
    const lat = Number(chip.dataset.lat);
    const lng = Number(chip.dataset.lng);
    persistLocation(city, { lat, lng });
    setLocationLabel(city);
    closeLocationSheet();
  });
});

function setLocationLabel(label) {
  if (!locationName) return;
  locationName.textContent = label;
  if (locationStatus) locationStatus.textContent = '';
  const isDefault = label === 'Choose location';
  locationPicker?.setAttribute('aria-label', isDefault ? 'Choose location' : `Location: ${label}. Click to change`);
  locationPicker?.setAttribute('title', isDefault ? 'Choose location' : `Location: ${label} (click to change)`);
}

function resolveCityString(label) {
  if (!label) return 'Bengaluru';
  const l = label.toLowerCase();
  if (l.includes('kolkata') || l.includes('calcutta') || l.includes('howrah') || l.includes('salt lake') || l.includes('new town') || l.includes('ballygunge')) return 'Kolkata';
  if (l.includes('bengaluru') || l.includes('bangalore') || l.includes('indiranagar') || l.includes('whitefield') || l.includes('koramangala')) return 'Bengaluru';
  if (l.includes('chennai') || l.includes('madras') || l.includes('t nagar') || l.includes('adyar') || l.includes('anna nagar')) return 'Chennai';
  if (l.includes('mumbai') || l.includes('bombay') || l.includes('bandra') || l.includes('andheri') || l.includes('thane') || l.includes('worli')) return 'Mumbai';
  if (l.includes('delhi') || l.includes('noida') || l.includes('gurugram') || l.includes('gurgaon') || l.includes('rohini') || l.includes('hauz khas')) return 'Delhi';
  if (l.includes('hyderabad') || l.includes('secunderabad') || l.includes('gachibowli') || l.includes('hitec') || l.includes('madhapur')) return 'Hyderabad';
  if (l.includes('ahmedabad') || l.includes('gandhinagar') || l.includes('satellite') || l.includes('bodakdev') || l.includes('navrangpura')) return 'Ahmedabad';
  if (l.includes('pune') || l.includes('poona') || l.includes('kothrud') || l.includes('hinjawadi') || l.includes('viman nagar') || l.includes('baner')) return 'Pune';

  return label.split(',')[0].trim();
}

function persistLocation(label, coords) {
  const city = resolveCityString(label);
  localStorage.setItem('hustleLocation', label);
  localStorage.setItem('hustleSelectedCity', city);
  if (coords) {
    savedCoords = coords;
    localStorage.setItem('hustleLocationCoords', JSON.stringify(coords));
  }
  window.dispatchEvent(new CustomEvent('hustle:location-change', { detail: { location: label, city, coords } }));
}

// Initialize navbar text: "Choose location" by default or saved location
const savedLocation = localStorage.getItem('hustleLocation');
if (savedLocation && savedLocation.trim()) {
  setLocationLabel(savedLocation);
} else {
  setLocationLabel('Choose location');
}

function setSheetHint(message, type = '') {
  if (!locationHint) return;
  locationHint.textContent = message || '';
  locationHint.className = 'location-hint' + (type ? ` hint-${type}` : '');
}

function placeSheet() {
  if (!locationPicker || locationSheet.hidden) return;
  const box = locationPicker.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 24);
  const left = Math.max(12, Math.min(box.left, window.innerWidth - width - 12));
  locationSheet.style.top = `${Math.round(box.bottom + 8)}px`;
  locationSheet.style.left = `${Math.round(left)}px`;
}

function openLocationSheet() {
  locationSheet.hidden = false;
  locationPicker?.setAttribute('aria-expanded', 'true');
  placeSheet();
  setTimeout(() => {
    locationSearch?.focus();
  }, 50);
}

function closeLocationSheet() {
  locationSheet.hidden = true;
  locationPicker?.setAttribute('aria-expanded', 'false');
  locationSuggestions.replaceChildren();
  setSheetHint('');
}

/* Helper to parse structured components into a clean "Locality, City" string */
function formatReadableLocation({ addressComponents, formattedAddress, displayName }) {
  const getComponent = (types) => {
    if (!addressComponents) return '';
    for (const type of types) {
      const match = addressComponents.find((comp) => {
        const cTypes = comp.types || [];
        return cTypes.includes(type);
      });
      if (match) return match.longText || match.long_name || '';
    }
    return '';
  };

  const sublocality = getComponent(['sublocality_level_1', 'sublocality', 'neighborhood', 'sublocality_level_2', 'administrative_area_level_3']);
  const locality = getComponent(['locality', 'postal_town', 'administrative_area_level_2']);
  const state = getComponent(['administrative_area_level_1']);

  const parts = [];
  if (sublocality) {
    parts.push(sublocality);
    if (locality && locality !== sublocality) parts.push(locality);
  } else if (locality) {
    parts.push(locality);
    if (state && state !== locality) parts.push(state);
  } else if (state) {
    parts.push(state);
  }

  if (parts.length > 0) {
    return parts.join(', ');
  }

  if (displayName) {
    const name = typeof displayName === 'string' ? displayName : displayName.text;
    if (name) return name;
  }

  if (formattedAddress) {
    return formattedAddress.split(',').slice(0, 2).map((s) => s.trim()).filter(Boolean).join(', ');
  }

  return 'Current location';
}

/* Reverse geocode coordinates using Google Maps / Google Places API */
async function reverseGeocodeGoogle(coords) {
  const key = getGoogleMapsKey();

  // Strategy 1: Google Places API (New) searchNearby with official key
  if (key) {
    try {
      const url = 'https://places.googleapis.com/v1/places:searchNearby';
      const body = {
        maxResultCount: 1,
        locationRestriction: {
          circle: {
            center: { latitude: coords.lat, longitude: coords.lng },
            radius: 1000.0
          }
        }
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.addressComponents'
        },
        body: JSON.stringify(body)
      });
      if (response.ok) {
        const data = await response.json();
        const place = data.places?.[0];
        if (place) {
          const readable = formatReadableLocation(place);
          if (readable && readable !== 'Current location') return readable;
        }
      }
    } catch {
      // Fall through to next strategy
    }
  }

  // Strategy 2: Google Maps Geocoding REST API
  if (key) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${encodeURIComponent(key)}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && data.results?.[0]) {
          const readable = formatReadableLocation({
            addressComponents: data.results[0].address_components,
            formattedAddress: data.results[0].formatted_address
          });
          if (readable && readable !== 'Current location') return readable;
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Strategy 3: OpenStreetMap reverse geocoding fallback (for offline or restricted keys)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (response.ok) {
      const data = await response.json();
      const addr = data.address || {};
      const sub = addr.suburb || addr.neighbourhood || addr.quarter || addr.residential;
      const city = addr.city || addr.town || addr.municipality || addr.state_district;
      const parts = [];
      if (sub) parts.push(sub);
      if (city && city !== sub) parts.push(city);
      if (parts.length > 0) return parts.join(', ');
      if (data.display_name) return data.display_name.split(',').slice(0, 2).map((s) => s.trim()).join(', ');
    }
  } catch {
    // Ignore fallback errors
  }

  return 'Current location';
}

/* Detect browser location and reverse-geocode */
function detectCurrentLocation({ fromPickerClick = false } = {}) {
  if (detectingLocation) return;

  if (!navigator.geolocation) {
    setLocationLabel(localStorage.getItem('hustleLocation') || 'Choose location');
    setSheetHint('Location is unavailable on this device. Please search your area manually.', 'error');
    openLocationSheet();
    return;
  }

  detectingLocation = true;
  locationPicker?.setAttribute('aria-busy', 'true');
  const previous = locationName?.textContent || localStorage.getItem('hustleLocation') || 'Choose location';

  // Show clean loading state
  setLocationLabel('Detecting location…');
  if (useTextSpan) useTextSpan.textContent = 'Detecting location…';
  if (useCurrentButton) useCurrentButton.disabled = true;
  if (!fromPickerClick) setSheetHint('Detecting your current location…');

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const point = { lat: coords.latitude, lng: coords.longitude };
      try {
        setSheetHint('Detecting your address…');
        const readable = await reverseGeocodeGoogle(point);
        persistLocation(readable, point);
        setLocationLabel(readable);
        setSheetHint('');
        closeLocationSheet();
      } catch {
        persistLocation('Current location', point);
        setLocationLabel('Current location');
        closeLocationSheet();
      } finally {
        cleanupDetecting();
      }
    },
    (error) => {
      // Handle permission denied or unavailable gracefully
      cleanupDetecting();
      const fallback = (previous === 'Detecting location…' || previous === 'Choose location')
        ? (localStorage.getItem('hustleLocation') || 'Choose location')
        : previous;
      setLocationLabel(fallback);

      if (error?.code === 1) {
        setSheetHint('Location access denied. Please search and select your locality.', 'error');
      } else if (error?.code === 3) {
        setSheetHint('Location request timed out. Please search for your area.', 'error');
      } else {
        setSheetHint('Current location is unavailable. Please search for your area.', 'error');
      }
      openLocationSheet();
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );

  function cleanupDetecting() {
    detectingLocation = false;
    locationPicker?.removeAttribute('aria-busy');
    if (useTextSpan) useTextSpan.textContent = 'Use current location';
    if (useCurrentButton) useCurrentButton.disabled = false;
  }
}

/* Fetch autocomplete predictions using Google Places API (New) */
let suggestTimer = null;
async function suggestPlaces(query) {
  locationSuggestions.replaceChildren();
  const trimmed = query.trim();
  if (!trimmed) {
    setSheetHint('');
    return;
  }

  const key = getGoogleMapsKey();
  if (!key) {
    setSheetHint('Google Maps API key is missing.', 'error');
    return;
  }

  try {
    const url = 'https://places.googleapis.com/v1/places:autocomplete';
    const body = { input: trimmed };
    if (savedCoords) {
      body.locationBias = {
        circle: {
          center: { latitude: savedCoords.lat, longitude: savedCoords.lng },
          radius: 30000.0
        }
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Autocomplete error: ${response.status}`);
    }

    const data = await response.json();
    const suggestions = data.suggestions || [];
    if (!suggestions.length) {
      setSheetHint('No localities found. Press Enter to use "' + trimmed + '".');
      return;
    }

    setSheetHint('');
    suggestions.slice(0, 5).forEach((item) => {
      const pred = item.placePrediction;
      if (!pred) return;
      const mainText = pred.structuredFormat?.mainText?.text || pred.text?.text || '';
      const secondaryText = pred.structuredFormat?.secondaryText?.text || '';
      const fullText = pred.text?.text || mainText;

      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'suggestion-item';
      btn.innerHTML = `
        <span class="sugg-icon" aria-hidden="true">📍</span>
        <span class="sugg-details">
          <strong class="sugg-main">${escapeHtml(mainText)}</strong>
          ${secondaryText ? `<small class="sugg-secondary">${escapeHtml(secondaryText)}</small>` : ''}
        </span>
      `;
      btn.addEventListener('click', () => {
        applyPlaceSelection(pred.placeId, mainText, secondaryText, fullText);
      });
      li.appendChild(btn);
      locationSuggestions.appendChild(li);
    });
  } catch {
    setSheetHint('Press Enter to set "' + trimmed + '".');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* Fetch Place Details and set as selected location */
async function applyPlaceSelection(placeId, mainText, secondaryText, fullText) {
  const key = getGoogleMapsKey();
  let readable = mainText;
  let coords = null;

  if (placeId && key) {
    try {
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=id,displayName,formattedAddress,location,addressComponents&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.location) {
          coords = { lat: data.location.latitude, lng: data.location.longitude };
        }
        readable = formatReadableLocation(data) || mainText;
      }
    } catch {
      // Use fallback text
    }
  }

  if (!readable || readable === 'Current location') {
    readable = secondaryText ? `${mainText}, ${secondaryText.split(',')[0].trim()}` : mainText;
  }

  persistLocation(readable, coords);
  setLocationLabel(readable);
  closeLocationSheet();
}

/* Fallback: user presses enter on custom typed text */
async function chooseTypedLocation(query) {
  const text = (query || locationSearch?.value || '').trim();
  if (!text) return;

  const firstSuggestion = locationSuggestions.querySelector('.suggestion-item');
  if (firstSuggestion) {
    firstSuggestion.click();
    return;
  }

  // Attempt geocoding the typed query with Google Places API
  const key = getGoogleMapsKey();
  if (key) {
    try {
      const url = 'https://places.googleapis.com/v1/places:autocomplete';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        body: JSON.stringify({ input: text })
      });
      if (res.ok) {
        const data = await res.json();
        const pred = data.suggestions?.[0]?.placePrediction;
        if (pred) {
          await applyPlaceSelection(
            pred.placeId,
            pred.structuredFormat?.mainText?.text || text,
            pred.structuredFormat?.secondaryText?.text || '',
            pred.text?.text || text
          );
          return;
        }
      }
    } catch {
      // Fallback below
    }
  }

  persistLocation(text, null);
  setLocationLabel(text);
  closeLocationSheet();
}

/* Event Listeners */
locationPicker?.addEventListener('click', (event) => {
  event.stopPropagation();
  if (detectingLocation) return;

  if (!locationSheet.hidden) {
    closeLocationSheet();
    return;
  }

  const current = locationName?.textContent || '';
  const saved = localStorage.getItem('hustleLocation');

  // If no location has been chosen yet, clicking "Choose location" requests permission
  if (!saved && current === 'Choose location') {
    detectCurrentLocation({ fromPickerClick: true });
    return;
  }

  // Otherwise, open the manual selection sheet to allow changing location
  openLocationSheet();
});

useCurrentButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  detectCurrentLocation({ fromPickerClick: false });
});

locationSearch?.addEventListener('input', () => {
  const query = locationSearch.value;
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(() => {
    suggestPlaces(query);
  }, 200);
});

locationSearch?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    chooseTypedLocation();
  } else if (event.key === 'Escape') {
    closeLocationSheet();
  }
});

document.addEventListener('click', (event) => {
  if (locationSheet.hidden) return;
  if (locationSheet.contains(event.target) || locationPicker?.contains(event.target)) return;
  closeLocationSheet();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !locationSheet.hidden) {
    closeLocationSheet();
  }
});

window.addEventListener('resize', placeSheet);
window.addEventListener('scroll', () => {
  if (!locationSheet.hidden) placeSheet();
}, { passive: true });

// Export location manager API
window.HustleLocation = {
  openPicker: openLocationSheet,
  closePicker: closeLocationSheet,
  detectLocation: detectCurrentLocation,
  persistLocation: persistLocation,
  setLocationLabel: setLocationLabel,
  resolveCityString: resolveCityString,
  hasLocation: () => {
    const loc = localStorage.getItem('hustleLocation');
    const city = localStorage.getItem('hustleSelectedCity');
    return Boolean(loc && loc.trim() && loc !== 'Choose location' && city && city.trim());
  }
};

// ==========================================================================
// Customer Location Gate (Mandatory on Login / First Load with Map API)
// ==========================================================================
(function initCustomerLocationGate() {
  let pendingServiceTarget = null;
  let gateOverlay = null;
  let autocompleteDebounce = null;

  function isCustomerUser() {
    const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
    return user && user.role === 'customer';
  }

  function isCustomerPage() {
    return window.location.pathname.includes('customer-dashboard.html') || document.querySelector('.customer-welcome-pill') !== null;
  }

  function needsLocationPrompt() {
    // If flag set by login or location has never been confirmed in this session
    const flag = sessionStorage.getItem('hustleCustomerNeedsLocation');
    const confirmed = sessionStorage.getItem('hustleLocationConfirmed');
    const savedLoc = localStorage.getItem('hustleLocation');
    const savedCity = localStorage.getItem('hustleSelectedCity');

    if (flag === 'true') return true;
    if (!confirmed) return true;
    if (!savedLoc || savedLoc === 'Choose location' || !savedCity) return true;
    return false;
  }

  function renderGateOverlay() {
    if (document.getElementById('customer-location-gate-overlay')) {
      gateOverlay = document.getElementById('customer-location-gate-overlay');
      return;
    }

    const html = `
      <div class="customer-location-gate-overlay" id="customer-location-gate-overlay" aria-modal="true" role="dialog" aria-labelledby="gate-modal-title">
        <div class="customer-location-gate-modal">
          <div class="gate-modal-header">
            <div class="gate-badge">📍 Service Area Setup</div>
            <h2 class="gate-modal-title" id="gate-modal-title">Where are you located?</h2>
            <p class="gate-modal-sub">To connect you with verified specialists and real-time localized pricing, please confirm your current location.</p>
          </div>
          <div class="gate-modal-body">
            <button type="button" class="btn-gate-gps" id="btn-gate-gps">
              <span class="gate-gps-icon">⌖</span>
              <span id="btn-gate-gps-label">Detect My Current Location (GPS / Map API)</span>
            </button>
            <div class="gate-status-msg" id="gate-status-msg"></div>

            <div class="gate-divider">
              <span>Or search locality / select city</span>
            </div>

            <div class="gate-search-box">
              <span class="gate-search-icon">🔍</span>
              <input type="text" class="gate-search-input" id="gate-search-input" placeholder="Search area, landmark or street (e.g. Koramangala)..." autocomplete="off" />
              <ul class="gate-autocomplete-list" id="gate-autocomplete-list"></ul>
            </div>

            <div class="gate-popular-label">Popular Cities</div>
            <div class="gate-cities-grid">
              <button type="button" class="btn-gate-city" data-city="Bengaluru" data-lat="12.9716" data-lng="77.5946">💻 Bengaluru</button>
              <button type="button" class="btn-gate-city" data-city="Mumbai" data-lat="19.0760" data-lng="72.8777">🌆 Mumbai</button>
              <button type="button" class="btn-gate-city" data-city="Delhi" data-lat="28.7041" data-lng="77.1025">🏛️ Delhi</button>
              <button type="button" class="btn-gate-city" data-city="Kolkata" data-lat="22.5726" data-lng="88.3639">🏛️ Kolkata</button>
              <button type="button" class="btn-gate-city" data-city="Hyderabad" data-lat="17.3850" data-lng="78.4867">💎 Hyderabad</button>
              <button type="button" class="btn-gate-city" data-city="Chennai" data-lat="13.0827" data-lng="80.2707">🌊 Chennai</button>
              <button type="button" class="btn-gate-city" data-lat="18.5204" data-lng="73.8567" data-city="Pune">🏰 Pune</button>
              <button type="button" class="btn-gate-city" data-city="Ahmedabad" data-lat="23.0225" data-lng="72.5714">🦁 Ahmedabad</button>
              <button type="button" class="btn-gate-city" data-city="Jaipur" data-lat="26.9124" data-lng="75.7873">👑 Jaipur</button>
              <button type="button" class="btn-gate-city" data-city="Chandigarh" data-lat="30.7333" data-lng="76.7794">🌹 Chandigarh</button>
              <button type="button" class="btn-gate-city" data-city="Lucknow" data-lat="26.8467" data-lng="80.9462">✨ Lucknow</button>
              <button type="button" class="btn-gate-city" data-city="Kochi" data-lat="9.9312" data-lng="76.2673">🌴 Kochi</button>
            </div>

            <p class="gate-footer-note">⚡ Results and prices will immediately update according to workers available in your selected location.</p>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
    gateOverlay = document.getElementById('customer-location-gate-overlay');

    // Attach event listeners
    attachGateEvents();
  }

  function setStatus(msg, type = 'info') {
    const el = document.getElementById('gate-status-msg');
    if (!el) return;
    if (!msg) {
      el.className = 'gate-status-msg';
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    el.className = `gate-status-msg ${type}`;
    el.textContent = msg;
    el.style.display = 'block';
  }

  async function confirmLocation(label, coords) {
    setStatus(`✓ Setting location to ${label}...`, 'success');

    // Persist via script.js persistence
    persistLocation(label, coords);
    setLocationLabel(label);

    sessionStorage.setItem('hustleLocationConfirmed', 'true');
    sessionStorage.removeItem('hustleCustomerNeedsLocation');

    // Asynchronously update profile in backend if user has token
    const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
    if (token) {
      fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          location: label,
          city: resolveCityString(label),
          coords: coords || null
        })
      }).catch(() => {});
    }

    // Trigger dynamic pricing update
    const city = resolveCityString(label);
    if (window.HustleBooking?.updateServiceCardsPricing) {
      window.HustleBooking.updateServiceCardsPricing(city);
    }

    setTimeout(() => {
      hideGate();
      if (window.HustleBooking?.showHustleToast) {
        window.HustleBooking.showHustleToast(`📍 Location confirmed: ${label}`, 'success');
      }

      // If a pending service target was clicked before location prompt
      if (pendingServiceTarget && window.HustleBooking) {
        const target = pendingServiceTarget;
        pendingServiceTarget = null;
        if (target.serviceId === 'custom-pool' || target.isCustomPool) {
          window.HustleBooking.openCustomJobModal(target.basePrice || 499);
        } else {
          window.HustleBooking.openServiceWorkersModal(target.serviceId, target.serviceName || target.heading, target.basePrice);
        }
      }
    }, 450);
  }

  function showGate(pendingTarget = null) {
    pendingServiceTarget = pendingTarget;
    renderGateOverlay();
    gateOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    setStatus('');
  }

  function hideGate() {
    if (!gateOverlay) return;
    gateOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function attachGateEvents() {
    const gpsBtn = document.getElementById('btn-gate-gps');
    const gpsLabel = document.getElementById('btn-gate-gps-label');
    const searchInput = document.getElementById('gate-search-input');
    const autoList = document.getElementById('gate-autocomplete-list');

    // GPS Click
    gpsBtn?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        setStatus('Geolocation is not supported by your browser. Please select a city or search below.', 'error');
        return;
      }

      gpsBtn.disabled = true;
      gpsBtn.classList.add('detecting');
      if (gpsLabel) gpsLabel.textContent = 'Detecting coordinates via Map API...';
      setStatus('Accessing GPS & resolving address with Google Maps API...', 'info');

      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const point = { lat: coords.latitude, lng: coords.longitude };
          let readable = 'Current location';
          try {
            readable = await reverseGeocodeGoogle(point);
          } catch {
            readable = 'Current location';
          }

          gpsBtn.disabled = false;
          gpsBtn.classList.remove('detecting');
          if (gpsLabel) gpsLabel.textContent = 'Detect My Current Location (GPS / Map API)';

          await confirmLocation(readable, point);
        },
        (err) => {
          gpsBtn.disabled = false;
          gpsBtn.classList.remove('detecting');
          if (gpsLabel) gpsLabel.textContent = 'Detect My Current Location (GPS / Map API)';

          if (err.code === 1) {
            setStatus('GPS permission was denied. Please select your city or search your area below.', 'error');
          } else {
            setStatus('Could not retrieve current GPS location. Please choose your city below.', 'error');
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    });

    // Search input autocomplete with debounce
    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearTimeout(autocompleteDebounce);
      if (!q) {
        autoList.classList.remove('visible');
        autoList.innerHTML = '';
        return;
      }

      autocompleteDebounce = setTimeout(async () => {
        const key = getGoogleMapsKey();
        let items = [];

        // Try Google Places Autocomplete API
        if (key) {
          try {
            const url = 'https://places.googleapis.com/v1/places:autocomplete';
            const body = { input: q };
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
              body: JSON.stringify(body)
            });
            if (res.ok) {
              const data = await res.json();
              (data.suggestions || []).slice(0, 5).forEach(s => {
                const pred = s.placePrediction;
                if (!pred) return;
                const main = pred.structuredFormat?.mainText?.text || pred.text?.text || '';
                const secondary = pred.structuredFormat?.secondaryText?.text || '';
                items.push({
                  main,
                  secondary,
                  full: pred.text?.text || `${main}, ${secondary}`,
                  placeId: pred.placeId
                });
              });
            }
          } catch {}
        }

        // Fallback to OpenStreetMap if empty
        if (!items.length) {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=5&countrycodes=in`);
            if (res.ok) {
              const data = await res.json();
              data.forEach(d => {
                items.push({
                  main: d.display_name.split(',')[0],
                  secondary: d.display_name.split(',').slice(1, 3).join(',').trim(),
                  full: d.display_name,
                  coords: { lat: parseFloat(d.lat), lng: parseFloat(d.lon) }
                });
              });
            }
          } catch {}
        }

        if (!items.length) {
          autoList.innerHTML = `<li style="padding:10px 12px; font-size:0.84rem; color:#64748b;">No matching localities found. Press Enter to use "${escapeHtml(q)}"</li>`;
          autoList.classList.add('visible');
          return;
        }

        autoList.innerHTML = items.map((it, idx) => `
          <li>
            <button type="button" class="gate-autocomplete-item" data-idx="${idx}">
              <span>📍</span>
              <span>
                <strong>${escapeHtml(it.main)}</strong>
                ${it.secondary ? `<small style="display:block; font-size:0.75rem; color:#64748b;">${escapeHtml(it.secondary)}</small>` : ''}
              </span>
            </button>
          </li>
        `).join('');
        autoList.classList.add('visible');

        autoList.querySelectorAll('.gate-autocomplete-item').forEach(btn => {
          btn.addEventListener('click', async () => {
            const idx = Number(btn.dataset.idx);
            const item = items[idx];
            if (!item) return;

            let coords = item.coords || null;
            let finalLabel = item.full || item.main;

            if (item.placeId && key && !coords) {
              try {
                const pRes = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(item.placeId)}?fields=id,displayName,location,formattedAddress&key=${encodeURIComponent(key)}`);
                if (pRes.ok) {
                  const pData = await pRes.json();
                  if (pData.location) coords = { lat: pData.location.latitude, lng: pData.location.longitude };
                  if (pData.displayName?.text) finalLabel = pData.displayName.text;
                }
              } catch {}
            }

            autoList.classList.remove('visible');
            await confirmLocation(finalLabel, coords);
          });
        });
      }, 250);
    });

    searchInput?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = autoList.querySelector('.gate-autocomplete-item');
        if (first) {
          first.click();
          return;
        }
        const val = searchInput.value.trim();
        if (val) {
          autoList.classList.remove('visible');
          await confirmLocation(val, null);
        }
      }
    });

    // City Buttons
    document.querySelectorAll('.btn-gate-city').forEach(btn => {
      btn.addEventListener('click', async () => {
        const city = btn.dataset.city;
        const lat = parseFloat(btn.dataset.lat);
        const lng = parseFloat(btn.dataset.lng);
        const coords = (!isNaN(lat) && !isNaN(lng)) ? { lat, lng } : null;
        await confirmLocation(city, coords);
      });
    });
  }

  // Check on DOM ready
  function checkGateRequirement() {
    if (isCustomerPage() || isCustomerUser()) {
      if (needsLocationPrompt()) {
        showGate();
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkGateRequirement);
  } else {
    checkGateRequirement();
  }

  // Export gate controller
  window.HustleLocationGate = {
    open: showGate,
    close: hideGate,
    needsLocationPrompt: needsLocationPrompt
  };
})();
