/**
 * Hustle - Service Workers Directory & Appointment Booking System
 * Handles worker listing per service, direct & open-pool appointment booking,
 * and two-way time & price bargaining between customers and workers.
 */

(function () {
  'use strict';

  const API_BASE = (window.location.protocol === 'http:' && window.location.port === '5001')
    ? '/api/auth'
    : 'http://localhost:5001/api/auth';

  // Canonical Service Mapping helper
  const TITLE_MAP = {
    'deep home cleaning': 'home-cleaning',
    'at-home spa therapy': 'spa-therapy',
    'spa therapy': 'spa-therapy',
    'maths tutoring': 'maths-tutoring',
    'handyman visits': 'handyman',
    'handyman': 'handyman',
    'electrician visits': 'electrician',
    'electrician': 'electrician',
    'plumbing solutions': 'plumbing',
    'plumbing': 'plumbing',
    'carpentry & assembly': 'carpentry',
    'carpentry': 'carpentry',
    'babysitting': 'babysitting',
    'pet sitting & walks': 'pet-care',
    'pet care': 'pet-care',
    'home organisation': 'home-organisation',
    'home organization': 'home-organisation',
    'laptop & wi-fi help': 'tech-help',
    'laptop': 'tech-help',
    'garden care': 'garden-care',
    'appliance care & repair': 'appliances',
    'appliance': 'appliances',
    'painting & waterproofing': 'painting',
    'painting': 'painting',
    'fitness & yoga coaching': 'fitness',
    'fitness': 'fitness',
    'car detailing & eco wash': 'auto-care',
    'auto care': 'auto-care',
    'pest control & sanitization': 'pest-control',
    'pest control': 'pest-control',
    'senior care & assistance': 'senior-care',
    'senior care': 'senior-care'
  };

  // Custom Toast Popup Notification System
  function showHustleToast(message, type = 'success', duration = 3800) {
    let container = document.getElementById('hustle-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'hustle-toast-container';
      container.className = 'hustle-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `hustle-toast-item ${type}`;

    let icon = '✓';
    let title = 'Hustle Escrow Notification';
    if (type === 'success') {
      icon = '🛡️';
      title = 'Escrow Deposit & Authorization';
    } else if (type === 'error') {
      icon = '⚠️';
      title = 'Notice';
    } else if (type === 'info') {
      icon = '⚡';
      title = 'Platform Update';
    }

    toast.innerHTML = `
      <span class="hustle-toast-icon">${icon}</span>
      <div class="hustle-toast-content">
        <strong>${title}</strong>
        <p>${message}</p>
      </div>
      <button type="button" class="hustle-toast-close" aria-label="Close notification">✕</button>
    `;

    container.appendChild(toast);

    const closeBtn = toast.querySelector('.hustle-toast-close');
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 250);
    };

    closeBtn?.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
  }
  window.showHustleToast = showHustleToast;

  function resolveServiceId(card) {
    if (card.dataset.serviceId) return card.dataset.serviceId;
    const heading = card.querySelector('h3')?.textContent?.trim().toLowerCase() || '';
    for (const key in TITLE_MAP) {
      if (heading.includes(key) || key.includes(heading)) {
        return TITLE_MAP[key];
      }
    }
    return 'handyman'; // fallback default
  }

  function getBasePrice(card) {
    const strong = card.querySelector('.card-bottom strong')?.textContent || '';
    const match = strong.match(/₹([0-9,]+)/);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : 499;
  }

  // State
  let currentServiceContext = {
    serviceId: '',
    serviceName: '',
    basePrice: 499
  };
  let pendingServiceTarget = null;

  function hasCustomerSpecifiedLocation() {
    if (window.HustleLocation && typeof window.HustleLocation.hasLocation === 'function') {
      return window.HustleLocation.hasLocation();
    }
    const loc = localStorage.getItem('hustleLocation');
    const city = localStorage.getItem('hustleSelectedCity');
    return Boolean(loc && loc.trim() && loc !== 'Choose location' && city && city.trim());
  }

  function promptCustomerLocationRequired(pendingTarget = null) {
    if (window.HustleLocationGate?.open) {
      window.HustleLocationGate.open(pendingTarget);
      return;
    }
    injectModalElements();
    pendingServiceTarget = pendingTarget;

    const overlay = document.getElementById('hustle-location-modal-overlay');
    if (overlay) {
      overlay.classList.add('active');
      overlay.setAttribute('aria-hidden', 'false');
    }
  }

  function closeLocationModal() {
    const overlay = document.getElementById('hustle-location-modal-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  // Create Modal Shells in DOM
  function injectModalElements() {
    if (document.getElementById('hustle-service-modal-overlay')) return;

    // Service Workers & Booking Modal
    const serviceModalHtml = `
      <div class="hustle-modal-overlay" id="hustle-service-modal-overlay" aria-hidden="true">
        <div class="hustle-modal" role="dialog" aria-labelledby="service-modal-title">
          <div class="hustle-modal-header">
            <h2 id="service-modal-title"><span>🛠️</span> Verified Service Specialists</h2>
            <button type="button" class="hustle-modal-close" id="btn-close-service-modal" aria-label="Close modal">✕</button>
          </div>
          <div class="hustle-modal-body" id="service-modal-body">
            <!-- Dynamic Content -->
          </div>
        </div>
      </div>
    `;

    // Customer "My Bookings & Negotiations" Modal
    const customerBookingsModalHtml = `
      <div class="hustle-modal-overlay" id="hustle-bookings-modal-overlay" aria-hidden="true">
        <div class="hustle-modal" role="dialog" aria-labelledby="bookings-modal-title">
          <div class="hustle-modal-header">
            <h2 id="bookings-modal-title"><span>📅</span> My Appointments &amp; Bargains</h2>
            <button type="button" class="hustle-modal-close" id="btn-close-bookings-modal" aria-label="Close modal">✕</button>
          </div>
          <div class="hustle-modal-body" id="bookings-modal-body">
            <!-- Dynamic Bookings Content -->
          </div>
        </div>
      </div>
    `;

    // Mandatory Customer Location Selection Modal
    const locationModalHtml = `
      <div class="hustle-modal-overlay" id="hustle-location-modal-overlay" aria-hidden="true">
        <div class="hustle-modal" role="dialog" aria-labelledby="location-modal-title" style="max-width: 480px;">
          <div class="hustle-modal-header" style="background: linear-gradient(135deg, #1e293b, #0f172a); color:#fff; border-bottom:none;">
            <h2 id="location-modal-title" style="color:#fff; font-size:1.15rem; display:flex; align-items:center; gap:8px;">
              <span>📍</span> Specify Your Location
            </h2>
            <button type="button" class="hustle-modal-close" id="btn-close-location-modal" style="color:#94a3b8; background:rgba(255,255,255,0.1);" aria-label="Close modal">✕</button>
          </div>
          <div class="hustle-modal-body" style="padding: 22px;">
            <p style="font-size:0.875rem; color:#475569; margin:0 0 16px 0; line-height:1.5;">
              Before looking for specialists or booking services, <strong>please specify your location</strong>. We match you strictly with verified local specialists in your city.
            </p>

            <button type="button" class="btn-location-gps" id="btn-location-modal-gps">
              <span>⌖</span> Use Current Location (GPS / Google Maps)
            </button>
            <div id="location-modal-gps-status" style="display:none; font-size:0.8rem; color:#2563eb; text-align:center; margin: 10px 0 6px 0; font-weight:600;"></div>

            <div style="display:flex; align-items:center; text-align:center; margin:16px 0 12px 0;">
              <div style="flex:1; border-bottom:1px solid #e2e8f0;"></div>
              <span style="padding:0 10px; font-size:0.75rem; color:#94a3b8; font-weight:700; text-transform:uppercase;">Or select your city</span>
              <div style="flex:1; border-bottom:1px solid #e2e8f0;"></div>
            </div>

            <div class="location-choice-grid">
              <button type="button" class="btn-location-choice" data-city="Kolkata" data-lat="22.5726" data-lng="88.3639">🏛️ Kolkata</button>
              <button type="button" class="btn-location-choice" data-city="Bengaluru" data-lat="12.9716" data-lng="77.5946">💻 Bengaluru</button>
              <button type="button" class="btn-location-choice" data-city="Chennai" data-lat="13.0827" data-lng="80.2707">🌊 Chennai</button>
              <button type="button" class="btn-location-choice" data-city="Mumbai" data-lat="19.0760" data-lng="72.8777">🌆 Mumbai</button>
              <button type="button" class="btn-location-choice" data-city="Delhi" data-lat="28.7041" data-lng="77.1025">🏛️ Delhi</button>
              <button type="button" class="btn-location-choice" data-city="Hyderabad" data-lat="17.3850" data-lng="78.4867">💎 Hyderabad</button>
              <button type="button" class="btn-location-choice" data-city="Ahmedabad" data-lat="23.0225" data-lng="72.5714">🦁 Ahmedabad</button>
              <button type="button" class="btn-location-choice" data-city="Pune" data-lat="18.5204" data-lng="73.8567">🏰 Pune</button>
            </div>

            <div style="text-align:center; margin-top:14px;">
              <button type="button" id="btn-location-modal-manual" style="background:none; border:none; color:#2563eb; font-size:0.825rem; font-weight:600; cursor:pointer; text-decoration:underline;">
                Search street, locality or other city…
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Escrow Payment Modal
    const paymentModalHtml = `
      <div class="hustle-modal-overlay" id="hustle-payment-modal-overlay" aria-hidden="true">
        <div class="hustle-modal" role="dialog" aria-labelledby="payment-modal-title" style="max-width: 490px; background:#ffffff; border:1.5px solid #e7dfd2; border-radius:20px; overflow:hidden;">
          <div class="hustle-modal-header" style="background: #f7f1e8; border-bottom: 1.5px solid #e7dfd2; padding: 18px 24px;">
            <h2 id="payment-modal-title" style="color:#25231f; font-family:'Fraunces', Georgia, serif !important; font-size:1.2rem; font-weight:700; display:flex; align-items:center; gap:10px; margin:0;">
              <span style="display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; background:#fff7ed; border:1px solid #fdba74; border-radius:8px; font-size:15px; color:#e56d24;">🛡️</span>
              <span>Secure Hustle Escrow Checkout</span>
            </h2>
            <button type="button" class="hustle-modal-close" id="btn-close-payment-modal" style="color:#706d66; background:#fff; border:1px solid #e7dfd2;" aria-label="Close modal">✕</button>
          </div>
          <div class="hustle-modal-body" id="payment-modal-body" style="padding: 22px;">
            <!-- Dynamic checkout body -->
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', serviceModalHtml);
    document.body.insertAdjacentHTML('beforeend', customerBookingsModalHtml);
    document.body.insertAdjacentHTML('beforeend', locationModalHtml);
    document.body.insertAdjacentHTML('beforeend', paymentModalHtml);

    // Wire close triggers
    document.getElementById('btn-close-service-modal')?.addEventListener('click', closeServiceModal);
    document.getElementById('btn-close-bookings-modal')?.addEventListener('click', closeBookingsModal);
    document.getElementById('btn-close-location-modal')?.addEventListener('click', closeLocationModal);
    document.getElementById('btn-close-payment-modal')?.addEventListener('click', closePaymentModal);

    document.getElementById('hustle-service-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'hustle-service-modal-overlay') closeServiceModal();
    });

    document.getElementById('hustle-bookings-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'hustle-bookings-modal-overlay') closeBookingsModal();
    });

    document.getElementById('hustle-location-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'hustle-location-modal-overlay') closeLocationModal();
    });

    document.getElementById('hustle-payment-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'hustle-payment-modal-overlay') closePaymentModal();
    });

    // Wire 8 canonical city choice buttons
    document.querySelectorAll('.btn-location-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const city = btn.dataset.city;
        const lat = Number(btn.dataset.lat);
        const lng = Number(btn.dataset.lng);
        const coords = (lat && lng) ? { lat, lng } : null;

        if (window.HustleLocation?.persistLocation) {
          window.HustleLocation.persistLocation(city, coords);
        } else {
          localStorage.setItem('hustleLocation', city);
          localStorage.setItem('hustleSelectedCity', city);
          if (coords) localStorage.setItem('hustleLocationCoords', JSON.stringify(coords));
        }

        if (window.HustleLocation?.setLocationLabel) {
          window.HustleLocation.setLocationLabel(city);
        }

        closeLocationModal();
        updateServiceCardsPricing(city);

        // If customer was trying to browse a service, open it immediately
        if (pendingServiceTarget) {
          const target = pendingServiceTarget;
          pendingServiceTarget = null;
          if (target.serviceId === 'custom-pool' || target.isCustomPool) {
            openCustomJobModal(target.basePrice || 499);
          } else {
            openServiceWorkersModal(target.serviceId, target.serviceName || target.heading, target.basePrice);
          }
        }
      });
    });

    // Wire GPS detection button in location modal
    const gpsBtn = document.getElementById('btn-location-modal-gps');
    const gpsStatus = document.getElementById('location-modal-gps-status');
    gpsBtn?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        if (gpsStatus) {
          gpsStatus.textContent = 'Geolocation is not supported by your browser. Please pick a city below.';
          gpsStatus.style.display = 'block';
          gpsStatus.style.color = '#ef4444';
        }
        return;
      }

      gpsBtn.disabled = true;
      if (gpsStatus) {
        gpsStatus.textContent = 'Detecting current coordinates via Google Maps GPS...';
        gpsStatus.style.display = 'block';
        gpsStatus.style.color = '#2563eb';
      }

      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const point = { lat: coords.latitude, lng: coords.longitude };
          let city = 'Bengaluru';
          let readable = 'Current location';

          try {
            if (typeof reverseGeocodeGoogle === 'function') {
              readable = await reverseGeocodeGoogle(point);
            }
          } catch {}

          if (window.HustleLocation?.resolveCityString) {
            city = window.HustleLocation.resolveCityString(readable);
          }

          if (window.HustleLocation?.persistLocation) {
            window.HustleLocation.persistLocation(readable, point);
          } else {
            localStorage.setItem('hustleLocation', readable);
            localStorage.setItem('hustleSelectedCity', city);
            localStorage.setItem('hustleLocationCoords', JSON.stringify(point));
          }

          if (window.HustleLocation?.setLocationLabel) {
            window.HustleLocation.setLocationLabel(readable);
          }

          gpsBtn.disabled = false;
          closeLocationModal();
          updateServiceCardsPricing(city);

          if (pendingServiceTarget) {
            const target = pendingServiceTarget;
            pendingServiceTarget = null;
            if (target.serviceId === 'custom-pool' || target.isCustomPool) {
              openCustomJobModal(target.basePrice || 499);
            } else {
              openServiceWorkersModal(target.serviceId, target.serviceName || target.heading, target.basePrice);
            }
          }
        },
        (err) => {
          gpsBtn.disabled = false;
          if (gpsStatus) {
            gpsStatus.textContent = 'GPS permission denied or timed out. Please choose your city below.';
            gpsStatus.style.display = 'block';
            gpsStatus.style.color = '#ef4444';
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    });

    // Wire manual search trigger to the header dropdown sheet
    document.getElementById('btn-location-modal-manual')?.addEventListener('click', () => {
      closeLocationModal();
      if (window.HustleLocation?.openPicker) {
        window.HustleLocation.openPicker();
      }
    });
  }

  function closeServiceModal() {
    const overlay = document.getElementById('hustle-service-modal-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function closeBookingsModal() {
    const overlay = document.getElementById('hustle-bookings-modal-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function closePaymentModal() {
    const overlay = document.getElementById('hustle-payment-modal-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
  }

  function openEscrowPaymentModal(bookingId, price, serviceName, workerName) {
    const overlay = document.getElementById('hustle-payment-modal-overlay');
    const body = document.getElementById('payment-modal-body');
    if (!overlay || !body) return;

    body.innerHTML = `
      <div style="margin-bottom:16px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#15803d; letter-spacing:0.5px;">Service Task</span>
            <h4 style="margin:2px 0 4px 0; color:#0f172a; font-size:1.05rem;">${serviceName || 'Service Task'}</h4>
            <p style="margin:0; font-size:0.825rem; color:#475569;">Specialist: <strong>${workerName || 'Assigned Specialist'}</strong></p>
          </div>
          <div style="text-align:right;">
            <span style="font-size:0.75rem; color:#64748b; display:block;">Amount Due</span>
            <strong style="font-size:1.35rem; color:#166534;">₹${price}</strong>
          </div>
        </div>
      </div>

      <p style="font-size:0.85rem; font-weight:700; color:#0f172a; margin:0 0 10px 0;">Select Payment Method:</p>

      <div class="escrow-pay-methods" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
        <label style="display:flex; align-items:center; gap:10px; padding:10px 14px; border:1.5px solid #22c55e; border-radius:10px; background:#f0fdf4; cursor:pointer;">
          <input type="radio" name="escrow-pay-method" value="UPI" checked style="accent-color:#16a34a;" />
          <div style="flex:1;">
            <strong style="font-size:0.875rem; color:#0f172a; display:block;">Instant UPI (PhonePe / GPay / Paytm)</strong>
            <small style="color:#15803d;">Instant escrow deposit (0% fee)</small>
          </div>
          <span style="font-size:1.2rem;">⚡</span>
        </label>

        <label style="display:flex; align-items:center; gap:10px; padding:10px 14px; border:1.5px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">
          <input type="radio" name="escrow-pay-method" value="Card" style="accent-color:#16a34a;" />
          <div style="flex:1;">
            <strong style="font-size:0.875rem; color:#0f172a; display:block;">Debit / Credit Card (•••• 4242)</strong>
            <small style="color:#64748b;">Visa, Mastercard, RuPay</small>
          </div>
          <span style="font-size:1.2rem;">💳</span>
        </label>

        <label style="display:flex; align-items:center; gap:10px; padding:10px 14px; border:1.5px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">
          <input type="radio" name="escrow-pay-method" value="NetBanking" style="accent-color:#16a34a;" />
          <div style="flex:1;">
            <strong style="font-size:0.875rem; color:#0f172a; display:block;">Net Banking (HDFC / SBI / ICICI)</strong>
            <small style="color:#64748b;">Direct Escrow Wire</small>
          </div>
          <span style="font-size:1.2rem;">🏛️</span>
        </label>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 14px; margin-bottom:16px; font-size:0.8rem; color:#64748b;">
        🔒 <strong>Hustle 100% Escrow Guarantee:</strong> Your payment is held safely in escrow. The specialist cannot claim payout until the task is successfully performed and marked completed.
      </div>

      <div id="escrow-pay-status-msg" style="display:none; padding:10px; border-radius:8px; margin-bottom:12px; font-size:0.85rem; text-align:center;"></div>

      <div style="display:flex; gap:10px;">
        <button type="button" id="btn-cancel-escrow-pay" style="flex:1; background:#f1f5f9; color:#475569; border:none; padding:12px; border-radius:10px; font-weight:700; cursor:pointer;">
          Cancel
        </button>
        <button type="button" id="btn-confirm-escrow-pay" style="flex:2; background:#16a34a; color:#fff; border:none; padding:12px; border-radius:10px; font-weight:800; font-size:0.95rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 14px rgba(22,163,74,0.3);">
          <span>✓</span> Authorize Pay ₹${price}
        </button>
      </div>
    `;

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    document.getElementById('btn-cancel-escrow-pay')?.addEventListener('click', closePaymentModal);

    const confirmBtn = document.getElementById('btn-confirm-escrow-pay');
    confirmBtn?.addEventListener('click', async () => {
      const selectedMethod = document.querySelector('input[name="escrow-pay-method"]:checked')?.value || 'UPI';
      const statusMsg = document.getElementById('escrow-pay-status-msg');
      
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span>⏳ Processing Escrow Transfer...</span>';
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.background = '#eff6ff';
        statusMsg.style.color = '#1e40af';
        statusMsg.textContent = 'Connecting to Secure Banking Gateway...';
      }

      try {
        const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
        const res = await fetch(`${API_BASE}/bookings/${bookingId}/pay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ paymentMethod: selectedMethod })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Payment failed.');
        }

        if (statusMsg) {
          statusMsg.style.background = '#ecfdf5';
          statusMsg.style.color = '#065f46';
          statusMsg.innerHTML = `<strong>✓ Payment Successful!</strong> ₹${price} deposited to Hustle Secure Escrow.`;
        }

        showHustleToast(`Payment of ₹${price} successfully deposited into Hustle Secure Escrow!`, 'success');

        setTimeout(() => {
          closePaymentModal();
          openCustomerBookingsModal(); // refresh bookings
        }, 900);
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>✓</span> Authorize Pay ₹${price}`;
        if (statusMsg) {
          statusMsg.style.display = 'block';
          statusMsg.style.background = '#fef2f2';
          statusMsg.style.color = '#991b1b';
          statusMsg.textContent = `Error: ${err.message}`;
        }
      }
    });
  }

  /**
   * Open the Workers Directory modal for a given service
   */
  async function openServiceWorkersModal(serviceId, serviceName, basePrice = 499) {
    injectModalElements();

    const isMainLanding = window.location.pathname.endsWith('index.html') || 
                          window.location.pathname === '/' || 
                          window.location.pathname === '' || 
                          (!window.location.pathname.includes('customer-dashboard') && 
                           !window.location.pathname.includes('worker-dashboard') && 
                           !window.location.pathname.includes('welcome'));

    // On generic main dashboard, do not let guests book services - ask to log in as customer
    if (isMainLanding && !isCustomerLoggedIn()) {
      if (window.showHustleToast) {
        showHustleToast('Please log in with your customer account to book appointments.', 'info', 3500);
      }
      setTimeout(() => {
        window.location.href = 'auth.html?role=customer&mode=signin';
      }, 400);
      return;
    }

    // Check mandatory customer location
    if (!hasCustomerSpecifiedLocation()) {
      promptCustomerLocationRequired({ serviceId, serviceName, basePrice });
      return;
    }

    currentServiceContext = { serviceId, serviceName, basePrice };

    const overlay = document.getElementById('hustle-service-modal-overlay');
    const modalBody = document.getElementById('service-modal-body');
    const modalTitle = document.getElementById('service-modal-title');

    modalTitle.innerHTML = `<span>🛠️</span> ${serviceName}`;
    modalBody.innerHTML = `
      <div style="text-align:center; padding: 40px 20px;">
        <div style="display:inline-block; width:32px; height:32px; border:3px solid #e2e8f0; border-top-color:#3b82f6; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
        <p style="margin-top:14px; font-size:0.9rem; color:#64748b;">Finding verified specialists in your city...</p>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    const activeCity = localStorage.getItem('hustleSelectedCity') || localStorage.getItem('hustleLocation') || 'Bengaluru';
    let coordsParam = '';
    try {
      const coords = JSON.parse(localStorage.getItem('hustleLocationCoords') || 'null');
      if (coords && coords.lat && coords.lng) {
        coordsParam = `&lat=${coords.lat}&lng=${coords.lng}`;
      }
    } catch {}

    try {
      const res = await fetch(`${API_BASE}/services/workers?serviceId=${encodeURIComponent(serviceId)}&city=${encodeURIComponent(activeCity)}${coordsParam}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load workers for this service.');
      }

      renderWorkersDirectory(data, serviceId, serviceName, basePrice);
    } catch (err) {
      console.error('Error loading service workers:', err);
      modalBody.innerHTML = `
        <div style="text-align:center; padding: 30px;">
          <p style="color:#ef4444; font-weight:600;">Unable to connect to worker directory.</p>
          <button type="button" class="btn-open-pool-book" id="btn-retry-load">Retry</button>
        </div>
      `;
      document.getElementById('btn-retry-load')?.addEventListener('click', () => {
        openServiceWorkersModal(serviceId, serviceName, basePrice);
      });
    }
  }

  /**
   * Render the list of workers
   */
  function renderWorkersDirectory(data, serviceId, serviceName, basePrice) {
    const modalBody = document.getElementById('service-modal-body');
    const exactWorkers = data.workers || [];
    const similarWorkers = data.similarWorkers || [];
    const canonicalName = data.canonicalName || serviceName;
    const targetCity = data.city || 'Your City';

    let html = `
      <div class="service-hero-pill">
        <div class="title-wrap">
          <h3>${canonicalName}</h3>
          <p>Verified background-checked specialists serving <strong>${targetCity}</strong></p>
        </div>
        <span class="badge-guarantee">🛡️ Hustle Guarantee</span>
      </div>
    `;

    // Case 1: Out of coverage (outside the 8 cities with no local registered workers)
    if (data.noCoverage) {
      html += `
        <div style="background:#fffbeb; border:1.5px dashed #f59e0b; border-radius:14px; padding:22px; text-align:center; margin-bottom:16px;">
          <span style="font-size:32px; display:block; margin-bottom:8px;">📍</span>
          <h4 style="color:#b45309; font-size:1.05rem; margin:0 0 6px 0; font-weight:800;">Sorry! Currently no workers available in ${targetCity}</h4>
          <p style="color:#78350f; font-size:0.85rem; line-height:1.5; max-width:440px; margin:0 auto 16px auto;">
            Hustle is actively expanding across India! You can switch to one of our primary hubs (Kolkata, Bengaluru, Chennai, Mumbai, Delhi, Hyderabad, Ahmedabad, Pune) or post your request to our open gig pool below.
            When a local pro registers in <strong>${targetCity}</strong>, they will become instantly available!
          </p>
          <button type="button" class="btn-open-pool-book" id="btn-pool-book" style="background:#d97706;">
            📢 Post Request to Open Gig Pool
          </button>
        </div>
      `;
      modalBody.innerHTML = html;
      document.getElementById('btn-pool-book')?.addEventListener('click', () => {
        renderBookingForm(null, serviceId, canonicalName, basePrice, targetCity);
      });
      return;
    }

    if (exactWorkers.length > 0) {
      html += `
        <h4 style="font-size:0.875rem; color:#475569; margin: 0 0 12px 0; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">
          📍 Available Specialists in ${targetCity} (${exactWorkers.length})
        </h4>
        <div class="workers-directory-list">
      `;

      exactWorkers.forEach(w => {
        const initials = (w.name || 'Pro').slice(0, 2).toUpperCase();
        const rate = w.baseRate || basePrice;
        const ratingTag = (w.completedJobs > 0)
          ? `★ ${w.rating || '5.0'} <small>(${w.completedJobs} jobs)</small>`
          : `🌟 <small>New Pro</small>`;
        html += `
          <div class="worker-dir-card" data-worker-id="${w.id}">
            <div class="worker-card-main">
              <div class="worker-avatar-wrap">
                <div class="worker-avatar-circle">${initials}</div>
                <span class="worker-online-badge" title="Online in ${w.city || targetCity}"></span>
              </div>
              <div class="worker-info-col">
                <div class="worker-info-header">
                  <h4>${w.name}</h4>
                  <span class="worker-rating-tag">${ratingTag}</span>
                </div>
                <div class="worker-trade-line">${w.skillCategory} ${w.specificSkill ? '· ' + w.specificSkill : ''}</div>
                <div class="worker-meta-tags">
                  <span class="worker-meta-pill" style="color:#2563eb; font-weight:600;">📍 ${w.locality || targetCity}</span>
                  <span class="worker-meta-pill">⏱ ${w.experience || '3+ years exp'}</span>
                </div>
              </div>
            </div>
            ${w.bio ? `<p class="worker-bio-snippet">“${w.bio}”</p>` : ''}
            <div class="worker-card-footer">
              <div class="worker-price-quote">
                <small>Standard Visit</small>
                <strong>₹${rate}</strong>
              </div>
              <button type="button" class="btn-book-worker" data-action="book-worker" data-worker-data='${JSON.stringify(w).replace(/'/g, "&apos;")}'>
                📅 Book Appointment
              </button>
            </div>
          </div>
        `;
      });

      html += `</div>`;
    } else {
      // No exact specialist registered yet in this city
      html += `
        <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:12px; padding:16px; margin-bottom:18px; text-align:center;">
          <strong style="color:#b45309; display:block; margin-bottom:4px;">No Dedicated ${canonicalName} Specialist in ${targetCity} Right Now</strong>
          <p style="font-size:0.85rem; color:#78350f; margin:0;">Don’t worry! You can book cross-trained verified pros in ${targetCity} below or post your request to our open gig pool.</p>
        </div>
      `;
    }

    // Similar workers if applicable
    if (similarWorkers.length > 0) {
      html += `
        <h4 style="font-size:0.9rem; color:#6b21a8; margin: 16px 0 12px 0; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">
          Cross-Trained &amp; Similar Available Pros
        </h4>
        <div class="workers-directory-list">
      `;

      similarWorkers.forEach(w => {
        const initials = (w.name || 'Pro').slice(0, 2).toUpperCase();
        const rate = w.baseRate || basePrice;
        const simRatingTag = (w.completedJobs > 0)
          ? `★ ${w.rating || '5.0'} <small>(${w.completedJobs} jobs)</small>`
          : `🌟 <small>New Pro</small>`;
        html += `
          <div class="worker-dir-card" data-worker-id="${w.id}">
            <div class="worker-card-main">
              <div class="worker-avatar-wrap">
                <div class="worker-avatar-circle similar">${initials}</div>
                <span class="worker-online-badge"></span>
              </div>
              <div class="worker-info-col">
                <div class="worker-info-header">
                  <h4>${w.name}</h4>
                  <span class="worker-rating-tag">${simRatingTag}</span>
                </div>
                <div class="worker-trade-line">${w.skillCategory} (Versatile Specialist)</div>
                <div class="worker-meta-tags">
                  <span class="worker-meta-pill">⏱ ${w.experience || 'Experienced'}</span>
                  <span class="worker-meta-pill">📍 ${w.locality || 'Nearby'}</span>
                </div>
              </div>
            </div>
            <div class="worker-card-footer">
              <div class="worker-price-quote">
                <small>Visit Base</small>
                <strong>₹${rate}</strong>
              </div>
              <button type="button" class="btn-book-worker" style="background:#6d28d9;" data-action="book-worker" data-worker-data='${JSON.stringify(w).replace(/'/g, "&apos;")}'>
                📅 Book Appointment
              </button>
            </div>
          </div>
        `;
      });

      html += `</div>`;
    }

    // Open Pool Fallback / Custom Service Request
    html += `
      <div class="fallback-pool-card">
        <h4>📢 Request Custom Service / Post to Open Pro Pool</h4>
        <p>Post your requirement to all qualified workers in your area. Available pros with open schedules will review your task, accept, or offer bargain timings &amp; prices!</p>
        <button type="button" class="btn-open-pool-book" id="btn-pool-book">
          ⚡ Post Request to Open Gig Pool
        </button>
      </div>
    `;

    modalBody.innerHTML = html;

    // Attach click listeners for booking
    modalBody.querySelectorAll('[data-action="book-worker"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const workerDataStr = btn.getAttribute('data-worker-data');
        try {
          const worker = JSON.parse(workerDataStr);
          renderBookingForm(worker, serviceId, canonicalName, basePrice);
        } catch (err) {
          console.error('Failed to parse worker data', err);
        }
      });
    });

    document.getElementById('btn-pool-book')?.addEventListener('click', () => {
      renderBookingForm(null, serviceId, canonicalName, basePrice);
    });
  }

  /**
   * Render the Appointment Booking & Bargaining Form
   */
  function renderBookingForm(worker, serviceId, serviceName, basePrice) {
    const modalBody = document.getElementById('service-modal-body');
    const modalTitle = document.getElementById('service-modal-title');

    const isDirect = Boolean(worker && worker.id);
    modalTitle.innerHTML = `<span>📝</span> ${isDirect ? 'Book with ' + worker.name : 'Post Open Pool Request'}`;

    // Compute suggested default date (tomorrow or today)
    const today = new Date().toISOString().split('T')[0];
    const initialPrice = worker?.baseRate || basePrice || 499;

    const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
    const selectedCity = localStorage.getItem('hustleSelectedCity') || '';
    const defaultAddress = (user?.locality && !user.locality.toLowerCase().includes('bengaluru local')) ? user.locality : '';

    const html = `
      ${serviceId === 'custom-pool' ? '' : '<button type="button" class="btn-back-link" id="btn-back-to-directory">← Back to specialist list</button>'}

      <div class="booking-target-banner" style="margin-top:10px;">
        <div class="target-info">
          <strong>${isDirect ? worker.name : '🌐 Hustle Open Pro Pool'}</strong>
          <small>${isDirect ? (worker.skillCategory + ' · ★ ' + (worker.rating || '4.9')) : 'Broadcast to all capable available workers'}</small>
        </div>
        <span style="font-size:0.85rem; font-weight:700; color:#2563eb; background:#eff6ff; padding:4px 10px; border-radius:8px;" id="booking-badge-service-name">
          ${isDirect ? serviceName : 'Custom Open Request'}
        </span>
      </div>

      <form id="appointment-booking-form" class="booking-form-wrap" style="margin-top:16px;">
        ${!isDirect ? `
          <div class="booking-field-group" style="margin-bottom:14px;">
            <label for="book-service-select">Demanded Gig Service / Required Trade <span style="color:#e11d48;">*</span></label>
            <select id="book-service-select" required style="width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px; font-weight:600; font-size:0.9rem; color:#0f172a; background:#fff;">
              <option value="" disabled ${(!serviceName || serviceName.includes('Open Pro Pool') || serviceName.includes('Custom Job Needs')) ? 'selected' : ''}>Select required trade category...</option>
              <option value="Plumbing & Drainage Fixing" ${(serviceName && serviceName.toLowerCase().includes('plumb')) ? 'selected' : ''}>Plumbing &amp; Drainage Fixing</option>
              <option value="Electrician & Wiring Repairs" ${(serviceName && serviceName.toLowerCase().includes('electr')) ? 'selected' : ''}>Electrician &amp; Wiring Repairs</option>
              <option value="Deep Home & Kitchen Cleaning" ${(serviceName && serviceName.toLowerCase().includes('clean')) ? 'selected' : ''}>Deep Home &amp; Kitchen Cleaning</option>
              <option value="Custom Carpentry & Woodwork" ${(serviceName && serviceName.toLowerCase().includes('carpent')) ? 'selected' : ''}>Custom Carpentry &amp; Woodwork</option>
              <option value="AC, Fridge & Appliance Repair" ${(serviceName && (serviceName.toLowerCase().includes('ac') || serviceName.toLowerCase().includes('appliance'))) ? 'selected' : ''}>AC, Fridge &amp; Appliance Repair</option>
              <option value="Wall Painting & Waterproofing" ${(serviceName && serviceName.toLowerCase().includes('paint')) ? 'selected' : ''}>Wall Painting &amp; Waterproofing</option>
              <option value="Laptop & Wi-Fi Tech Support" ${(serviceName && serviceName.toLowerCase().includes('tech')) ? 'selected' : ''}>Laptop &amp; Wi-Fi Tech Support</option>
              <option value="Furniture Assembly & Handyman" ${(serviceName && serviceName.toLowerCase().includes('furniture')) ? 'selected' : ''}>Furniture Assembly &amp; Handyman</option>
              <option value="Babysitting & Childcare" ${(serviceName && serviceName.toLowerCase().includes('baby')) ? 'selected' : ''}>Babysitting &amp; Childcare</option>
              <option value="Pet Care & Dog Walking" ${(serviceName && serviceName.toLowerCase().includes('pet')) ? 'selected' : ''}>Pet Care &amp; Dog Walking</option>
              <option value="Garden & Plant Care" ${(serviceName && serviceName.toLowerCase().includes('garden')) ? 'selected' : ''}>Garden &amp; Plant Care</option>
              <option value="Yoga & Fitness Coaching" ${(serviceName && serviceName.toLowerCase().includes('yoga')) ? 'selected' : ''}>Yoga &amp; Fitness Coaching</option>
              <option value="Car & Two-Wheeler Care" ${(serviceName && serviceName.toLowerCase().includes('car')) ? 'selected' : ''}>Car &amp; Two-Wheeler Care</option>
              <option value="Pest Control & Fumigation" ${(serviceName && serviceName.toLowerCase().includes('pest')) ? 'selected' : ''}>Pest Control &amp; Fumigation</option>
              <option value="Other" ${(serviceName && !serviceName.includes('Open Pro Pool') && !serviceName.includes('Custom Job Needs') && !['plumb', 'electr', 'clean', 'carpent', 'ac', 'paint', 'tech', 'furniture', 'baby', 'pet', 'garden', 'yoga', 'car', 'pest'].some(k => serviceName.toLowerCase().includes(k))) ? 'selected' : ''}>Other Custom Trade (Specify below)</option>
            </select>
            <input type="text" id="book-custom-service-input" placeholder="Type your demanded service (e.g. AC Repair, Sofa Upholstery, Math Tutor, Balcony Netting)" style="margin-top:8px; width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px; font-size:0.9rem; display:none;" value="${(serviceName && !serviceName.includes('Open Pro Pool') && !serviceName.includes('Custom Job Needs')) ? serviceName : ''}" />
          </div>
        ` : ''}

        <div class="booking-row-2">
          <div class="booking-field-group">
            <label for="book-date">Preferred Date <span style="color:#e11d48;">*</span></label>
            <input type="date" id="book-date" min="${today}" value="${today}" required />
          </div>

          <div class="booking-field-group">
            <label for="book-time">Preferred Time Slot <span style="color:#e11d48;">*</span></label>
            <select id="book-time" required>
              <option value="09:00 AM – 12:00 PM (Morning)">09:00 AM – 12:00 PM (Morning)</option>
              <option value="12:00 PM – 03:00 PM (Afternoon)" selected>12:00 PM – 03:00 PM (Afternoon)</option>
              <option value="03:00 PM – 06:00 PM (Late Afternoon)">03:00 PM – 06:00 PM (Late Afternoon)</option>
              <option value="06:00 PM – 09:00 PM (Evening)">06:00 PM – 09:00 PM (Evening)</option>
            </select>
          </div>
        </div>

        <div class="booking-field-group">
          <label for="book-locality">Service Locality / Flat Address <span style="color:#e11d48;">*</span></label>
          <input type="text" id="book-locality" placeholder="e.g. Flat/House no., Street, Area${selectedCity ? ' (' + selectedCity + ')' : ''}" value="${defaultAddress}" required />
        </div>

        <div class="booking-field-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <label for="book-notes" style="margin:0;">Task Requirements &amp; Instructions <span style="color:#e11d48;">*</span></label>
            <button type="button" id="btn-ai-polish-notes" class="btn-ai-polish-pill">
              <span class="ai-spark-mini">✨</span> Polish Task with AI
            </button>
          </div>
          <textarea id="book-notes" rows="3" placeholder="Describe the job in detail (e.g. Master bathroom sink drain clogged, leaking pipe under the cabinet)..." required></textarea>
        </div>

        <div class="booking-field-group">
          <label for="book-price">
            <span>Your Proposed Budget / Offer</span>
            <span style="color:#64748b; font-size:0.75rem;">(Two-way bargaining enabled)</span>
          </label>
          <div style="position:relative;">
            <span style="position:absolute; left:12px; top:10px; font-weight:700; color:#475569;">₹</span>
            <input type="number" id="book-price" min="1" step="any" value="${initialPrice}" placeholder="Enter any budget in ₹" style="padding-left:28px;" required />
          </div>
          <div id="ai-price-tip" style="display:none; margin-top:6px; font-size:0.8rem; padding:6px 10px; border-radius:6px; background:#fff7ed; border:1px solid #fed7aa; color:#9a3412;"></div>
          <div class="budget-bargain-hint">
            💡 <strong>Price &amp; Timing Bargaining:</strong> You propose your initial budget here (enter any amount). The worker can accept directly or respond with an adjusted time or counter-offer for your approval!
          </div>
        </div>

        <div id="booking-form-error" style="color:#e11d48; font-size:0.85rem; font-weight:600; display:none;"></div>

        <button type="submit" class="btn-confirm-booking" id="btn-submit-booking">
          <span>${isDirect ? '🚀 Confirm Appointment Request' : '🚀 Post to Open Pro Pool'}</span>
        </button>
      </form>
    `;

    modalBody.innerHTML = html;

    document.getElementById('btn-back-to-directory')?.addEventListener('click', () => {
      openServiceWorkersModal(serviceId, serviceName, basePrice);
    });

    const serviceSelect = document.getElementById('book-service-select');
    const customServiceInput = document.getElementById('book-custom-service-input');
    if (serviceSelect && customServiceInput) {
      const updateCustomVis = () => {
        if (serviceSelect.value === 'Other') {
          customServiceInput.style.display = 'block';
          customServiceInput.required = true;
          customServiceInput.focus();
        } else {
          customServiceInput.style.display = 'none';
          customServiceInput.required = false;
        }
      };
      serviceSelect.addEventListener('change', updateCustomVis);
      updateCustomVis();
    }

    // AI Polish Task Scope
    document.getElementById('btn-ai-polish-notes')?.addEventListener('click', async () => {
      const notesEl = document.getElementById('book-notes');
      const rawNotes = notesEl?.value.trim();
      if (!rawNotes) {
        showHustleToast('Please write a brief summary of your task first!', 'warning');
        notesEl?.focus();
        return;
      }
      const btn = document.getElementById('btn-ai-polish-notes');
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="ai-spark-mini rotating">✦</span> AI Thinking...';

      let activeCategory = serviceName || 'General Service';
      if (serviceSelect && serviceSelect.value && serviceSelect.value !== 'Other') {
        activeCategory = serviceSelect.value;
      } else if (customServiceInput && customServiceInput.value.trim()) {
        activeCategory = customServiceInput.value.trim();
      }

      try {
        const res = await fetch('/api/ai/enhance-scope', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawNotes, serviceCategory: activeCategory })
        });
        const data = await res.json();
        if (data && data.enhanced) {
          notesEl.value = data.enhanced;
          showHustleToast('✨ Job scope polished with AI!', 'success');
        }
      } catch (err) {
        console.error('AI polish error:', err);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    });

    // AI Price Advisor Tip on Budget Input
    const priceInput = document.getElementById('book-price');
    const priceTipEl = document.getElementById('ai-price-tip');
    if (priceInput && priceTipEl) {
      let priceDebounce = null;
      priceInput.addEventListener('input', () => {
        clearTimeout(priceDebounce);
        priceDebounce = setTimeout(async () => {
          const val = Number(priceInput.value);
          if (!val || val <= 0) {
            priceTipEl.style.display = 'none';
            return;
          }
          let cat = serviceName || 'Plumbing & Repairs';
          if (serviceSelect && serviceSelect.value && serviceSelect.value !== 'Other') cat = serviceSelect.value;
          try {
            const res = await fetch('/api/ai/price-advisor', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ serviceCategory: cat, proposedPrice: val, city: selectedCity || 'Bengaluru' })
            });
            const data = await res.json();
            if (data && data.advice) {
              priceTipEl.innerHTML = `<strong>✦ AI Price Guide:</strong> ${data.advice}`;
              priceTipEl.style.display = 'block';
            }
          } catch {}
        }, 400);
      });
    }

    const form = document.getElementById('appointment-booking-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      let effectiveServiceName = serviceName;
      if (!isDirect && serviceSelect) {
        if (serviceSelect.value === 'Other' && customServiceInput && customServiceInput.value.trim()) {
          effectiveServiceName = customServiceInput.value.trim();
        } else if (serviceSelect.value && serviceSelect.value !== 'Other') {
          effectiveServiceName = serviceSelect.value;
        }
      }
      await submitAppointment(worker, serviceId, effectiveServiceName);
    });
  }

  /**
   * Submit appointment to backend API
   */
  async function submitAppointment(worker, serviceId, serviceName) {
    const errorEl = document.getElementById('booking-form-error');
    const submitBtn = document.getElementById('btn-submit-booking');

    errorEl.style.display = 'none';

    // Verify User Session
    const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
    const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');

    if (!user || !token) {
      if (confirm('Please sign in with your customer account to book appointments. Proceed to Sign In?')) {
        window.location.href = 'auth.html?role=customer&mode=signin';
      }
      return;
    }

    if (user.role === 'worker') {
      errorEl.textContent = 'You are currently signed in as a Gig Worker. Please switch to a customer account to book services.';
      errorEl.style.display = 'block';
      return;
    }

    const scheduledDate = document.getElementById('book-date').value;
    const scheduledTime = document.getElementById('book-time').value;
    const locality = document.getElementById('book-locality').value.trim();
    const notes = document.getElementById('book-notes').value.trim();
    const price = Number(document.getElementById('book-price').value);

    if (!locality || !notes) {
      errorEl.textContent = 'Please fill in your address and task instructions.';
      errorEl.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ Sending Request...</span>';

    try {
      const activeCity = localStorage.getItem('hustleSelectedCity') || localStorage.getItem('hustleLocation') || 'Bengaluru';
      let coords = null;
      try { coords = JSON.parse(localStorage.getItem('hustleLocationCoords') || 'null'); } catch {}

      const payload = {
        serviceId,
        serviceName,
        workerId: worker ? worker.id : null,
        workerName: worker ? worker.name : null,
        category: worker ? (worker.skillCategory || worker.specificSkill) : (serviceName || 'Custom Trade'),
        scheduledDate,
        scheduledTime,
        locality,
        city: worker?.city || activeCity,
        coords,
        notes,
        price
      };

      const res = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit booking.');
      }

      // Success screen
      const modalBody = document.getElementById('service-modal-body');
      modalBody.innerHTML = `
        <div style="text-align:center; padding: 30px 10px;">
          <div style="width:56px; height:56px; background:#ecfdf5; color:#10b981; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:28px; margin:0 auto 16px auto;">✓</div>
          <h3 style="font-size:1.2rem; color:#0f172a; margin:0 0 8px 0;">${worker ? 'Appointment Request Sent!' : '🌐 Open Pool Request Posted!'}</h3>
          <p style="font-size:0.9rem; color:#475569; max-width:420px; margin:0 auto 20px auto; line-height:1.5;">
            ${worker ? `We've dispatched your appointment request to <strong>${worker.name}</strong>.` : `Your request for <strong>${serviceName}</strong> is broadcast to verified local specialists. You can view matching specialists in your appointments section and request them directly!`}
          </p>
          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="btn-confirm-booking" id="btn-view-my-bookings" style="background:#2563eb; margin:0;">
              ${worker ? '📅 View My Bookings &amp; Negotiations' : '📦 View Appointments &amp; Matching Specialists'}
            </button>
            <button type="button" class="btn-decline-offer" id="btn-done-booking">
              Done
            </button>
          </div>
        </div>
      `;

      if (!worker) {
        showHustleToast(`Open Pool Request for "${serviceName}" posted! Showing in your Appointments.`, 'success');
      }

      document.getElementById('btn-view-my-bookings')?.addEventListener('click', () => {
        closeServiceModal();
        openCustomerBookingsModal();
      });

      document.getElementById('btn-done-booking')?.addEventListener('click', () => {
        closeServiceModal();
      });

      // Update badge
      refreshBookingsBadge();

    } catch (err) {
      console.error('Booking submission failed:', err);
      errorEl.textContent = err.message || 'An error occurred while booking. Please try again.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>🚀 Confirm Appointment Request</span>';
    }
  }

  /**
   * Open Customer "My Bookings & Negotiations" Modal
   */
  async function openCustomerBookingsModal() {
    injectModalElements();

    const overlay = document.getElementById('hustle-bookings-modal-overlay');
    const modalBody = document.getElementById('bookings-modal-body');

    modalBody.innerHTML = `
      <div style="text-align:center; padding: 40px 20px;">
        <div style="display:inline-block; width:32px; height:32px; border:3px solid #e2e8f0; border-top-color:#3b82f6; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
        <p style="margin-top:14px; font-size:0.9rem; color:#64748b;">Loading your appointments &amp; live bargains...</p>
      </div>
    `;

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
    if (!token) {
      modalBody.innerHTML = `
        <div style="text-align:center; padding: 30px;">
          <p style="color:#64748b; margin-bottom:14px;">Please sign in to view your appointments.</p>
          <a href="auth.html?role=customer&mode=signin" class="btn-confirm-booking" style="text-decoration:none; display:inline-flex;">Sign In</a>
        </div>
      `;
      return;
    }

    try {
      const [bookingsRes, ticketsRes] = await Promise.all([
        fetch(`${API_BASE}/bookings/customer`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${API_BASE}/tickets/my`, { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => null)
      ]);
      const data = await bookingsRes.json();
      let tickets = [];
      if (ticketsRes && ticketsRes.ok) {
        try {
          const tData = await ticketsRes.json();
          tickets = tData.tickets || [];
        } catch {}
      }

      if (!bookingsRes.ok || !data.success) {
        throw new Error(data.message || 'Failed to load bookings.');
      }

      renderCustomerBookingsList(data.bookings || [], tickets);
    } catch (err) {
      console.error('Error loading customer bookings:', err);
      modalBody.innerHTML = `
        <div style="text-align:center; padding: 30px;">
          <p style="color:#ef4444;">Failed to load bookings: ${err.message}</p>
        </div>
      `;
    }
  }

  /**
   * Render the customer bookings list with dispute tickets support
   */
  function renderCustomerBookingsList(bookings, tickets = []) {
    const modalBody = document.getElementById('bookings-modal-body');

    if (bookings.length === 0) {
      modalBody.innerHTML = `
        <div style="text-align:center; padding: 40px 20px;">
          <span style="font-size:36px; display:block; margin-bottom:10px;">📋</span>
          <h4 style="font-size:1.1rem; color:#0f172a; margin:0 0 6px 0;">No Active Appointments Yet</h4>
          <p style="font-size:0.85rem; color:#64748b; max-width:360px; margin:0 auto 16px auto;">
            Choose any service card from our directory to find verified workers and schedule your first visit!
          </p>
          <button type="button" class="btn-confirm-booking" style="background:#0f172a; margin:0 auto;" onclick="document.getElementById('hustle-bookings-modal-overlay').classList.remove('active')">
            Explore Services
          </button>
        </div>
      `;
      return;
    }

    let userWarningBanner = '';
    const userJson = localStorage.getItem('hustleUser') || sessionStorage.getItem('hustleUser');
    if (userJson) {
      try {
        const u = JSON.parse(userJson);
        if (u.warningsCount > 0) {
          userWarningBanner = `
            <div style="background:#fffbeb; border:1.5px solid #fde68a; border-radius:10px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; gap:10px; font-size:0.825rem; color:#92400e;">
              <span style="font-size:18px;">⚠️</span>
              <div>
                <strong>Account Policy Notice (${u.warningsCount}/3 Warnings):</strong>
                <div>Your account has ${u.warningsCount} official warning(s) on record from dispute arbitrations. Receiving more than 3 warnings results in an irreversible permanent ban.</div>
              </div>
            </div>
          `;
        }
      } catch (e) {}
    }

    let html = userWarningBanner + `<div class="customer-bookings-list">`;

    bookings.forEach(b => {
      const bId = b._id || b.id;
      // Confidentiality filter: only match tickets raised by this customer OR officially settled disputes
      const bTicket = (tickets || []).find(t => String(t.bookingId) === String(bId) && (t.complainantRole === 'customer' || ['resolved', 'dismissed'].includes(t.status)));
      const isBargaining = b.status === 'bargaining';
      const isAccepted = b.status === 'accepted';
      const isCompleted = b.status === 'completed';
      const isPending = b.status === 'pending';
      const isCancelled = b.status === 'cancelled';
      const isRejected = b.status === 'rejected';
      const isPaid = b.paymentStatus === 'paid';
      const canCancel = isPending || isBargaining || (isAccepted && !isPaid);
      const isEscrowPaid = isPaid && (isAccepted || isCompleted);

      const lastNegotiation = (b.negotiations && b.negotiations.length > 0) ? b.negotiations[b.negotiations.length - 1] : null;
      const workerProposed = isBargaining && lastNegotiation && lastNegotiation.senderRole === 'worker';
      const customerAwaiting = isBargaining && lastNegotiation && lastNegotiation.senderRole === 'customer';

      // Customer can negotiate max 1 time per booking
      const customerBargainCount = (b.negotiations || []).filter(n => n.senderRole === 'customer' && n.newStatus === 'bargaining').length;
      const canCustomerBargain = customerBargainCount < 1;

      html += `
        <div class="booking-item-card ${b.status}" id="booking-card-${bId}">
          <div class="booking-item-header">
            <div>
              <h4>${b.serviceName}</h4>
              <p style="font-size:0.825rem; color:#64748b; margin:0;">
                Worker: <strong>${b.workerName || 'Awaiting Specialist Claim (Open Pool)'}</strong>
                ${b.assignedWorkerSkill ? `<span style="color:#b45309; font-weight:700; margin-left:6px; background:#fef3c7; border:1px solid #fde68a; padding:2px 7px; border-radius:5px; font-size:0.75rem;">✦ Skill: "${b.assignedWorkerSkill}"</span>` : ''}
              </p>
            </div>
            <span class="booking-status-badge ${b.status}">${isPaid && isAccepted ? 'paid & scheduled' : (!b.workerId ? 'open pool' : b.status)}</span>
          </div>

          <div class="booking-details-grid">
            <div><span>📅 Date:</span> <strong>${b.scheduledDate}</strong></div>
            <div><span>⏱ Time:</span> <strong>${b.scheduledTime}</strong></div>
            <div><span>💰 Price:</span> <strong>₹${b.price}</strong></div>
            <div><span>📍 Area:</span> <strong>${b.locality}</strong></div>
          </div>

          ${b.notes ? `
            <div style="font-size:0.825rem; color:#475569; background:#f8fafc; padding:8px 12px; border-radius:8px; margin-top:8px;">
              <strong>Note:</strong> ${b.notes}
            </div>
          ` : ''}

          <!-- Open Pro Pool Request & Matching Specialists Section -->
          ${!b.workerId ? `
            <div class="open-pool-status-banner" style="background:#fffdfa; border:1.5px solid #fed7aa; border-radius:12px; padding:12px 16px; margin-top:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <span style="font-size:0.875rem; font-weight:700; color:#c2410c; display:inline-flex; align-items:center; gap:6px;">
                  <span>🌐</span> Open Pro Pool Request: <strong>${b.serviceName}</strong>
                </span>
                <span style="font-size:0.75rem; background:#ffedd5; color:#9a3412; font-weight:800; padding:3px 10px; border-radius:999px; border:1px solid #fdba74;">
                  Broadcasting in ${b.city}
                </span>
              </div>
              <p style="font-size:0.825rem; color:#78350f; margin:6px 0 0 0; line-height:1.45;">
                This request is broadcast to all capable specialists in <strong>${b.city || 'your area'}</strong>. When specialists with matching skills appear below, you can request them directly!
              </p>
            </div>
            <div class="matching-specialists-section" id="matching-specialists-${bId}" style="margin-top:10px;">
              <div style="font-size:0.825rem; color:#64748b; padding:8px 0; display:flex; align-items:center; gap:6px;">
                <span>⏳</span> Checking for specialists with matching skill in ${b.city || 'your area'}...
              </div>
            </div>
          ` : ''}

          <!-- Status notification banners -->
          ${isAccepted ? `
            <div style="background:#fef2f2; border:1.5px solid #f87171; border-radius:8px; padding:10px 14px; margin-top:8px; font-size:0.85rem; color:#991b1b; display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px;">🔴</span>
              <div>
                <strong>Worker Accepted Your Task!</strong> Specialist <strong>${b.workerName || 'Assigned Specialist'}</strong> confirmed for <strong>${b.scheduledDate}</strong> at <strong>${b.scheduledTime}</strong> (Agreed Price: ₹${b.price}).
              </div>
            </div>

            ${!isPaid ? `
              <div class="customer-pay-banner" style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:12px; padding:14px 16px; margin-top:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                  <strong style="color:#166534; font-size:0.95rem; display:block;">💳 Payment Ready: ₹${b.price}</strong>
                  <span style="color:#15803d; font-size:0.825rem;">Specialist accepted your terms. Complete payment to secure funds in escrow.</span>
                </div>
                <button type="button" class="btn-customer-pay" data-action="open-pay-modal" data-booking-id="${bId}" data-price="${b.price}" data-service="${b.serviceName}" data-worker="${b.workerName || 'Specialist'}" style="background:#16a34a; color:#ffffff; border:none; padding:10px 22px; border-radius:999px; font-weight:800; font-size:0.925rem; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 4px 12px rgba(22, 163, 74, 0.28); transition:all 0.2s ease;">
                  💳 Pay ₹${b.price} Now
                </button>
              </div>
            ` : `
              <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:10px 14px; margin-top:10px; font-size:0.85rem; color:#065f46; display:flex; align-items:center; gap:8px;">
                <span style="background:#10b981; color:#fff; width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:800;">✓</span>
                <div>
                  <strong>Payment of ₹${b.price} Verified &amp; Held in Escrow:</strong>
                  <div style="font-size:0.8rem; color:#047857; margin-top:2px;">Specialist is scheduled. Escrow funds will release upon task completion.</div>
                </div>
              </div>
            `}
          ` : ''}

          <!-- Completed Status & Customer Rating Form -->
          ${isCompleted ? `
            <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:12px; padding:14px 16px; margin-top:12px;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; color:#15803d; font-weight:700; font-size:0.95rem;">
                <span style="font-size:1.15rem;">🎉</span> Task Successfully Completed by <strong>${b.workerName || 'Specialist'}</strong>!
              </div>
              ${b.ratingVoided ? `
                <div style="background:#fef2f2; border:1.5px solid #fca5a5; border-radius:10px; padding:12px 14px; margin-top:8px; display:flex; align-items:center; gap:8px;">
                  <span style="font-size:16px;">⚠️</span>
                  <div>
                    <strong style="color:#991b1b; font-size:0.85rem;">Customer Rating Dismissed by Admin</strong>
                    <div style="font-size:0.8rem; color:#b91c1c; margin-top:2px;">
                      ${escapeHtml(b.ratingVoidReason || 'The dispute on this task was officially settled in favor of the specialist. Under platform policy, customer ratings are dismissed.')}
                    </div>
                  </div>
                </div>
              ` : (!b.rating ? `
                <div class="customer-rating-form" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:14px; margin-top:8px;">
                  <label style="font-weight:700; font-size:0.875rem; color:#0f172a; display:block; margin-bottom:4px;">
                    ⭐ Rate your experience with ${b.workerName || 'this specialist'}:
                  </label>
                  <p style="font-size:0.8rem; color:#64748b; margin:0 0 10px 0;">Select stars (1–5) and share a few words about your experience (optional):</p>
                  <div class="star-rating-select" data-booking-id="${bId}" style="display:flex; gap:6px; font-size:26px; cursor:pointer; color:#f59e0b; margin-bottom:10px;">
                    <span class="star-btn" data-val="1">★</span>
                    <span class="star-btn" data-val="2">★</span>
                    <span class="star-btn" data-val="3">★</span>
                    <span class="star-btn" data-val="4">★</span>
                    <span class="star-btn" data-val="5">★</span>
                  </div>
                  <input type="hidden" id="star-val-${bId}" value="5" />
                  <textarea id="review-words-${bId}" rows="2" placeholder="Share a few words about your experience (optional, e.g. Polite, fast, clean work)..." style="width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:8px 12px; font-size:0.85rem; box-sizing:border-box; font-family:inherit; margin-bottom:10px;"></textarea>
                  <button type="button" class="btn-submit-review" data-action="submit-review" data-booking-id="${bId}" style="background:#e56d24; color:#fff; border:none; padding:9px 20px; border-radius:999px; font-weight:700; font-size:0.875rem; cursor:pointer; box-shadow:0 3px 10px rgba(229,109,36,0.25);">
                    Submit Rating &amp; Review
                  </button>
                </div>
              ` : `
                <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:12px 14px; margin-top:8px;">
                  <div style="display:flex; align-items:center; gap:8px; color:#d97706; font-size:1.05rem; font-weight:700;">
                    <span>${'★'.repeat(b.rating)}${'☆'.repeat(5 - b.rating)}</span>
                    <span style="font-size:0.825rem; color:#475569;">(${b.rating}.0 / 5.0 Rating Registered)</span>
                  </div>
                  ${b.reviewText ? `<p style="font-size:0.85rem; color:#334155; margin:6px 0 0 0; font-style:italic;">“${b.reviewText}”</p>` : ''}
                </div>
              `)}

              <!-- Complaint & Dispute Section -->
              <div class="booking-dispute-section" style="margin-top:14px; border-top:1px dashed #bbf7d0; padding-top:12px;">
                ${bTicket ? `
                  <div class="ticket-status-card" style="background:#ffffff; border:1.5px solid ${bTicket.status === 'resolved' ? '#86efac' : (bTicket.status === 'dismissed' ? '#cbd5e1' : '#fcd34d')}; border-radius:10px; padding:12px 14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                      <span style="font-weight:700; font-size:0.875rem; color:#0f172a; display:flex; align-items:center; gap:6px;">
                        <span>🎫</span> Support Ticket #${escapeHtml(bTicket.ticketId)}
                      </span>
                      <span class="ticket-badge-pill ${bTicket.status}">
                        ${bTicket.status === 'resolved' ? '✓ Settled by Admin' : (bTicket.status === 'dismissed' ? '✕ Dismissed' : '⏳ Open · Under Review')}
                      </span>
                    </div>
                    <div style="font-size:0.8rem; color:#475569; margin-bottom:6px;">
                      <strong>Issue:</strong> ${escapeHtml(bTicket.category)} · <em>Raised by ${bTicket.complainantRole === 'customer' ? 'You' : escapeHtml(bTicket.complainantName)}</em>
                    </div>
                    <p style="font-size:0.825rem; color:#334155; margin:0 0 8px 0; background:#f8fafc; padding:8px 10px; border-radius:6px; border:1px solid #e2e8f0; line-height:1.4;">
                      “${escapeHtml(bTicket.description)}”
                    </p>
                    ${bTicket.status === 'resolved' || bTicket.adminNotes ? `
                      <div class="admin-settlement-callout">
                        <div class="callout-header">
                          <span>🛡️</span>
                          <strong>Hustle Operations Settlement Decision</strong>
                          <span class="settle-action-badge">${escapeHtml(bTicket.resolutionAction || 'Resolved')}</span>
                        </div>
                        <div style="font-size:0.825rem; line-height:1.4; color:#15803d;">${escapeHtml(bTicket.adminNotes || 'Dispute reviewed and resolved according to Hustle platform standards.')}</div>
                        <small style="display:block; margin-top:6px; color:#166534; font-size:0.75rem;">Settled by ${escapeHtml(bTicket.settledBy || 'Hustle Operations Staff')}</small>
                      </div>
                    ` : ''}
                  </div>
                ` : `
                  <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <span style="font-size:0.8rem; color:#475569;">Have an issue or dispute with this completed task?</span>
                    <button type="button" class="btn-toggle-dispute-drawer" data-action="toggle-dispute" data-booking-id="${bId}" style="background:none; border:none; color:#dc2626; font-size:0.82rem; font-weight:700; cursor:pointer; text-decoration:underline; display:inline-flex; align-items:center; gap:4px;">
                      <span>⚠️</span> Report an Issue / Raise Dispute
                    </button>
                  </div>
                  <div class="customer-dispute-drawer" id="dispute-drawer-${bId}" style="display:none; background:#ffffff; border:1.5px solid #fdba74; border-radius:10px; padding:14px; margin-top:10px;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; color:#9a3412; font-weight:700; font-size:0.875rem;">
                      <span>🛡️</span> File Official Dispute Ticket to Admin
                    </div>
                    <p style="font-size:0.78rem; color:#78350f; margin:0 0 10px 0; line-height:1.4;">
                      Our Operations Admin will review task records, communications, and escrow holding to settle the dispute.
                    </p>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px;">
                      <div>
                        <label style="font-size:0.75rem; font-weight:700; color:#334155; display:block; margin-bottom:3px;">Issue Category</label>
                        <select id="dispute-category-${bId}" style="width:100%; box-sizing:border-box; padding:7px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem; background:#fff;">
                          <option value="Work Incomplete / Poor Quality">Work Incomplete / Poor Quality</option>
                          <option value="Property Damage / Loss">Property Damage / Loss</option>
                          <option value="Overcharging / Extra Cash Demanded">Overcharging / Extra Cash Demanded</option>
                          <option value="Unprofessional / Inappropriate Conduct">Unprofessional / Inappropriate Conduct</option>
                          <option value="Delayed Arrival / Left Early">Delayed Arrival / Left Early</option>
                          <option value="Other Service Dispute">Other Service Dispute</option>
                        </select>
                      </div>
                      <div>
                        <label style="font-size:0.75rem; font-weight:700; color:#334155; display:block; margin-bottom:3px;">Desired Settlement</label>
                        <select id="dispute-resolution-${bId}" style="width:100%; box-sizing:border-box; padding:7px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem; background:#fff;">
                          <option value="Full Escrow Refund">Full Escrow Refund</option>
                          <option value="Partial Escrow Refund">Partial Escrow Refund</option>
                          <option value="Free Re-work / Rectification">Free Re-work / Rectification</option>
                          <option value="Account Warning to Specialist">Account Warning to Specialist</option>
                        </select>
                      </div>
                    </div>
                    <div style="margin-bottom:10px;">
                      <label style="font-size:0.75rem; font-weight:700; color:#334155; display:block; margin-bottom:3px;">Description of the issue</label>
                      <textarea id="dispute-desc-${bId}" rows="3" placeholder="Provide factual details about what went wrong..." style="width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.82rem; font-family:inherit;"></textarea>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                      <button type="button" class="btn-cancel-dispute" data-action="cancel-dispute" data-booking-id="${bId}" style="background:#f1f5f9; border:1px solid #cbd5e1; color:#475569; padding:6px 14px; border-radius:6px; font-size:0.8rem; font-weight:600; cursor:pointer;">Cancel</button>
                      <button type="button" class="btn-submit-dispute" data-action="submit-dispute" data-booking-id="${bId}" style="background:#dc2626; color:#fff; border:none; padding:6px 16px; border-radius:6px; font-size:0.8rem; font-weight:700; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.25);">Submit Ticket to Admin</button>
                    </div>
                  </div>
                `}
              </div>
            </div>
          ` : ''}

          ${customerAwaiting ? `
            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-top:8px; font-size:0.85rem; color:#1e40af;">
              ⏳ <strong>Counter-Offer Sent:</strong> You proposed ₹${lastNegotiation.proposedPrice || b.price} ${lastNegotiation.proposedTime ? `· at ${lastNegotiation.proposedTime}` : ''}. Waiting for the specialist's response.
            </div>
          ` : ''}

          ${isCancelled ? `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; margin-top:8px; font-size:0.825rem; color:#64748b;">
              ✕ This appointment was cancelled.
            </div>
          ` : ''}

          ${isRejected ? `
            <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 12px; margin-top:8px; font-size:0.825rem; color:#991b1b;">
              ✕ This appointment was declined by the specialist.
            </div>
          ` : ''}

          <!-- Counter-Offer Box if Worker proposed adjusted timing/price -->
          ${workerProposed ? `
            <div class="counter-offer-banner">
              <h5>💬 Pro Counter-Proposal Received</h5>
              <div class="counter-offer-details">
                <span>Proposed: ₹${lastNegotiation.proposedPrice || b.price} ${lastNegotiation.proposedTime ? `· at ${lastNegotiation.proposedTime}` : ''}</span>
              </div>
              ${lastNegotiation.note ? `<p class="counter-offer-note">“${lastNegotiation.note}”</p>` : ''}
              
              <div class="counter-offer-actions">
                <button type="button" class="btn-accept-offer" data-action="accept-counter" data-booking-id="${bId}">
                  ✓ Accept Offer (₹${lastNegotiation.proposedPrice || b.price})
                </button>
                ${canCustomerBargain ? `
                  <button type="button" class="btn-bargain-counter" data-action="show-counter-form" data-booking-id="${bId}">
                    💬 Counter-Bargain
                  </button>
                ` : `
                  <button type="button" class="btn-bargain-counter" disabled style="opacity:0.5; cursor:not-allowed; background:#f1f5f9; color:#94a3b8; border-color:#cbd5e1;" title="Negotiation limit reached: You can only counter-bargain once per booking.">
                    💬 Countered (1/1 Max)
                  </button>
                `}
                <button type="button" class="btn-decline-offer" data-action="decline-counter" data-booking-id="${bId}">
                  Decline
                </button>
              </div>

              ${canCustomerBargain ? `
                <div class="inline-counter-drawer" id="counter-drawer-${bId}" style="display:none;">
                  <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;">
                    <input type="number" id="counter-price-${bId}" min="1" step="any" placeholder="Price (₹)" value="${lastNegotiation.proposedPrice || b.price}" />
                    <input type="date" id="counter-date-${bId}" value="${lastNegotiation.proposedDate || b.scheduledDate || ''}" title="Proposed Date" />
                    <input type="text" id="counter-time-${bId}" placeholder="Time (e.g. 2 PM)" value="${lastNegotiation.proposedTime || b.scheduledTime}" />
                  </div>
                  <textarea id="counter-note-${bId}" rows="2" placeholder="Message to worker..."></textarea>
                  <div class="inline-counter-btns">
                    <button type="button" class="btn-decline-offer" onclick="document.getElementById('counter-drawer-${bId}').style.display='none'">Cancel</button>
                    <button type="button" class="btn-bargain-counter" data-action="send-counter" data-booking-id="${bId}">Send Counter-Offer</button>
                  </div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Option to cancel appointment for customers -->
          ${canCancel ? `
            <div style="display:flex; justify-content:flex-end; margin-top:10px;">
              <button type="button" class="btn-cancel-appointment" data-action="cancel-appointment" data-booking-id="${bId}">
                ✕ Cancel Appointment
              </button>
            </div>
          ` : ''}

          ${(b.negotiations && b.negotiations.length > 0) ? `
            <details style="font-size:0.775rem; color:#64748b; margin-top:8px;">
              <summary style="cursor:pointer; font-weight:600;">View negotiation history (${b.negotiations.length})</summary>
              <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px; padding-left:8px; border-left:2px solid #e2e8f0;">
                ${b.negotiations.map(n => `
                  <div>
                    <strong>${n.senderName} (${n.senderRole}):</strong> ${n.note || 'Updated terms'}
                    ${n.proposedPrice ? `<span style="color:#059669;">[₹${n.proposedPrice}]</span>` : ''}
                    ${n.proposedTime ? `<span style="color:#2563eb;">[${n.proposedTime}]</span>` : ''}
                    <small style="color:#94a3b8; display:block;">${new Date(n.createdAt || n.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                  </div>
                `).join('')}
              </div>
            </details>
          ` : ''}
        </div>
      `;
    });

    html += `</div>`;
    modalBody.innerHTML = html;

    // Attach counter action handlers
    modalBody.querySelectorAll('[data-action="accept-counter"]').forEach(btn => {
      btn.addEventListener('click', () => handleCustomerResponse(btn.dataset.bookingId, 'accept'));
    });

    modalBody.querySelectorAll('[data-action="decline-counter"]').forEach(btn => {
      btn.addEventListener('click', () => handleCustomerResponse(btn.dataset.bookingId, 'reject'));
    });

    modalBody.querySelectorAll('[data-action="cancel-appointment"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bId = btn.dataset.bookingId;
        if (confirm('Are you sure you want to cancel this appointment?')) {
          handleCustomerResponse(bId, 'cancel', { note: 'Customer cancelled the appointment.' });
        }
      });
    });

    modalBody.querySelectorAll('[data-action="show-counter-form"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const drawer = document.getElementById(`counter-drawer-${btn.dataset.bookingId}`);
        if (drawer) drawer.style.display = drawer.style.display === 'none' ? 'flex' : 'none';
      });
    });

    modalBody.querySelectorAll('[data-action="send-counter"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bId = btn.dataset.bookingId;
        const proposedPrice = document.getElementById(`counter-price-${bId}`)?.value;
        const proposedDate = document.getElementById(`counter-date-${bId}`)?.value;
        const proposedTime = document.getElementById(`counter-time-${bId}`)?.value;
        const note = document.getElementById(`counter-note-${bId}`)?.value;
        handleCustomerResponse(bId, 'bargain', { proposedPrice, proposedDate, proposedTime, note });
      });
    });

    // Wire escrow pay buttons
    modalBody.querySelectorAll('[data-action="open-pay-modal"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bId = btn.dataset.bookingId;
        const price = btn.dataset.price;
        const service = btn.dataset.service;
        const worker = btn.dataset.worker;
        openEscrowPaymentModal(bId, price, service, worker);
      });
    });

    // Wire interactive star ratings
    modalBody.querySelectorAll('.star-rating-select').forEach(container => {
      const bId = container.dataset.bookingId;
      const stars = container.querySelectorAll('.star-btn');
      stars.forEach(star => {
        star.addEventListener('click', () => {
          const val = parseInt(star.dataset.val, 10);
          const hiddenInput = document.getElementById(`star-val-${bId}`);
          if (hiddenInput) hiddenInput.value = val;
          stars.forEach(s => {
            const sVal = parseInt(s.dataset.val, 10);
            if (sVal <= val) {
              s.style.color = '#f59e0b';
              s.textContent = '★';
            } else {
              s.style.color = '#cbd5e1';
              s.textContent = '☆';
            }
          });
        });
      });
    });

    // Wire submit review buttons
    modalBody.querySelectorAll('[data-action="submit-review"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bId = btn.dataset.bookingId;
        const rating = document.getElementById(`star-val-${bId}`)?.value || 5;
        const reviewText = document.getElementById(`review-words-${bId}`)?.value || '';
        handleCustomerReview(bId, rating, reviewText, btn);
      });
    });

    // Wire toggle dispute drawer buttons
    modalBody.querySelectorAll('[data-action="toggle-dispute"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const drawer = document.getElementById(`dispute-drawer-${btn.dataset.bookingId}`);
        if (drawer) drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
      });
    });

    // Wire cancel dispute buttons
    modalBody.querySelectorAll('[data-action="cancel-dispute"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const drawer = document.getElementById(`dispute-drawer-${btn.dataset.bookingId}`);
        if (drawer) drawer.style.display = 'none';
      });
    });

    // Wire submit dispute buttons
    modalBody.querySelectorAll('[data-action="submit-dispute"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const bId = btn.dataset.bookingId;
        const category = document.getElementById(`dispute-category-${bId}`)?.value || 'Work Incomplete / Poor Quality';
        const resolution = document.getElementById(`dispute-resolution-${bId}`)?.value || 'Full Escrow Refund';
        const desc = document.getElementById(`dispute-desc-${bId}`)?.value || '';
        handleCustomerDispute(bId, category, desc, resolution, btn);
      });
    });

    // Fetch and display matching specialists for active open pool requests
    const openPoolBookings = bookings.filter(b => !b.workerId && (b.status === 'pending' || b.status === 'bargaining'));
    openPoolBookings.forEach(async (b) => {
      const bId = b._id || b.id;
      const container = document.getElementById(`matching-specialists-${bId}`);
      if (!container) return;

      try {
        const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
        const res = await fetch(`${API_BASE}/bookings/${bId}/matching-workers`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Could not fetch matching workers');
        const data = await res.json();
        const matching = data.matchingWorkers || [];

        if (matching.length === 0) {
          container.innerHTML = `
            <div class="matching-workers-empty" style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; padding:12px 14px; font-size:0.825rem; color:#64748b; display:flex; align-items:center; gap:10px;">
              <span style="font-size:1.25rem;">⏳</span>
              <div>
                <strong style="color:#334155; display:block;">No workers with matching skill currently available in ${b.city}.</strong>
                <span style="font-size:0.775rem; color:#64748b;">As soon as a worker with "${b.serviceName}" skill registers or logs in, they will appear here and you can request them directly.</span>
              </div>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div class="matching-workers-panel" style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:12px; padding:14px;">
              <div style="font-weight:700; font-size:0.885rem; color:#166534; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                <span style="display:inline-flex; align-items:center; gap:6px;">
                  <span>🎯</span> Matching Specialists Found for "${b.serviceName}" (${matching.length}):
                </span>
                <small style="font-size:0.75rem; color:#15803d; font-weight:600;">Skill matches demanded gig</small>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${matching.map(w => `
                  <div class="matching-worker-card" style="background:#ffffff; border:1px solid #bbf7d0; border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:flex-start; gap:10px;">
                      <div style="width:38px; height:38px; border-radius:50%; background:#dbeafe; color:#1d4ed8; display:grid; place-items:center; font-weight:800; font-size:14px; margin-top:2px;">
                        ${w.name.charAt(0)}
                      </div>
                      <div>
                        <strong style="color:#0f172a; font-size:0.925rem; display:block;">${w.name}</strong>

                        <!-- Prominently display the skill which the worker wrote he has -->
                        <div style="margin:3px 0 4px 0;">
                          ${w.isOtherAiMatched ? `
                            <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:3px 8px; font-size:0.775rem; color:#92400e; display:inline-flex; align-items:center; gap:5px; flex-wrap:wrap;">
                              <span style="font-weight:800;">✦ Worker's Registered Skill:</span>
                              <strong style="color:#b45309;">"${w.workerWrittenSkill || w.specificSkill}"</strong>
                              <span style="background:#fef3c7; color:#78350f; font-size:0.7rem; font-weight:700; padding:1px 5px; border-radius:4px;">AI Matched</span>
                            </div>
                          ` : `
                            <span style="font-size:0.8rem; color:#2563eb; font-weight:700; background:#eff6ff; padding:2px 8px; border-radius:6px;">${w.skillCategory}</span>
                            ${w.specificSkill && w.specificSkill !== w.skillCategory ? `<span style="font-size:0.785rem; color:#475569; margin-left:4px;">· "${w.specificSkill}"</span>` : ''}
                          `}
                        </div>

                        <div style="font-size:0.775rem; color:#64748b;">
                          ★ ${w.rating || '5.0'} · ₹${w.baseRate || b.price} · Experience: ${w.experience || '2+ years'}
                        </div>
                      </div>
                    </div>
                    <button type="button" class="btn-assign-worker" data-booking-id="${bId}" data-worker-id="${w._id || w.id}" data-worker-name="${w.name}" data-worker-skill="${w.workerWrittenSkill || w.specificSkill || w.skillCategory}" style="background:#16a34a; color:#ffffff; border:none; padding:9px 18px; border-radius:999px; font-weight:700; font-size:0.825rem; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 3px 8px rgba(22, 163, 74, 0.25); transition:all 0.2s ease;">
                      <span>Request Specialist</span> ➔
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>
          `;

          container.querySelectorAll('.btn-assign-worker').forEach(btn => {
            btn.addEventListener('click', async () => {
              const bId = btn.dataset.bookingId;
              const wId = btn.dataset.workerId;
              const wName = btn.dataset.workerName;
              const wSkill = btn.dataset.workerSkill || '';

              btn.disabled = true;
              btn.innerHTML = '<span>Requesting...</span>';

              try {
                const assignRes = await fetch(`${API_BASE}/bookings/${bId}/assign-worker`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({ workerId: wId, workerSkill: wSkill })
                });
                const assignData = await assignRes.json();
                if (assignData.success) {
                  showHustleToast(`Specialist ${wName} requested! They will be notified to accept your appointment.`, 'success');
                  openCustomerBookingsModal();
                } else {
                  showHustleToast(assignData.message || 'Could not assign specialist.', 'error');
                  btn.disabled = false;
                  btn.innerHTML = '<span>Request Specialist</span> ➔';
                }
              } catch (err) {
                console.error('Assign specialist error:', err);
                showHustleToast('Failed to assign specialist.', 'error');
                btn.disabled = false;
                btn.innerHTML = '<span>Request Specialist</span> ➔';
              }
            });
          });
        }
      } catch (err) {
        console.error('Error fetching matching workers:', err);
        container.innerHTML = `
          <div style="font-size:0.8rem; color:#94a3b8;">Could not load matching specialists at this time.</div>
        `;
      }
    });
  }

  async function handleCustomerReview(bookingId, rating, reviewText, submitBtn = null) {
    const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
    if (!token) return;

    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting Review...';
    }

    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rating, reviewText })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit review.');
      }

      showHustleToast(data.message || 'Thank you! Your rating and feedback have been saved.', 'success');
      openCustomerBookingsModal(); // reload
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
      showHustleToast(`Error submitting review: ${err.message}`, 'error');
    }
  }

  async function handleCustomerDispute(bookingId, category, description, desiredResolution, btn = null) {
    if (!description || !description.trim()) {
      showHustleToast('Please provide a detailed explanation of the issue.', 'error');
      return;
    }

    const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
    if (!token) {
      showHustleToast('Session expired. Please sign in again.', 'error');
      return;
    }

    const originalText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Submitting Ticket...';
    }

    try {
      const res = await fetch(`${API_BASE}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bookingId,
          category,
          description: description.trim(),
          desiredResolution
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to file dispute ticket.');
      }

      showHustleToast(`🎫 ${data.message || 'Dispute ticket registered successfully!'}`, 'success');
      setTimeout(() => {
        openCustomerBookingsModal();
      }, 400);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      showHustleToast(err.message || 'Could not submit dispute.', 'error');
    }
  }

  async function handleCustomerResponse(bookingId, action, extra = {}) {
    const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/customer-respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action, ...extra })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Action failed');
      }

      showHustleToast(data.message || 'Response recorded!', 'info');
      await refreshBookingsBadge();
      openCustomerBookingsModal(); // reload
    } catch (err) {
      showHustleToast(`Failed to submit response: ${err.message}`, 'error');
    }
  }

  /**
   * Check for accepted jobs and active bargaining count to display red notification badge
   */
  async function refreshBookingsBadge() {
    const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
    const badge = document.getElementById('my-bookings-badge');
    const bookingsBtn = document.getElementById('nav-my-bookings-btn');
    if (!token || !badge) return;

    try {
      const res = await fetch(`${API_BASE}/bookings/customer`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const bookings = data.bookings || [];

        // Count jobs accepted by worker (triggering the red notification for customer)
        const acceptedBookings = bookings.filter(b => b.status === 'accepted');
        const acceptedCount = acceptedBookings.length;

        // Count pending or bargaining tasks
        const pendingCount = bookings.filter(b => b.status === 'pending' || b.status === 'bargaining').length;

        if (acceptedCount > 0) {
          // Prominent RED notification badge on top of bookings area when worker accepts
          badge.textContent = acceptedCount;
          badge.style.display = 'inline-flex';
          badge.style.alignItems = 'center';
          badge.style.justifyContent = 'center';
          badge.style.background = '#dc2626';
          badge.style.color = '#ffffff';
          badge.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.35)';
          badge.style.animation = 'hustle-badge-pulse 2s infinite';
          badge.title = `🔴 ${acceptedCount} job(s) accepted by worker! Click to review & proceed.`;

          if (bookingsBtn) {
            bookingsBtn.style.position = 'relative';
            bookingsBtn.classList.add('has-accepted-gig');
          }
        } else if (pendingCount > 0) {
          badge.textContent = pendingCount;
          badge.style.display = 'inline-flex';
          badge.style.alignItems = 'center';
          badge.style.justifyContent = 'center';
          badge.style.background = '#ea580c';
          badge.style.color = '#ffffff';
          badge.style.boxShadow = 'none';
          badge.style.animation = 'none';
          badge.title = `${pendingCount} active request(s)`;

          if (bookingsBtn) {
            bookingsBtn.classList.remove('has-accepted-gig');
          }
        } else {
          badge.style.display = 'none';
          badge.style.animation = 'none';
          if (bookingsBtn) {
            bookingsBtn.classList.remove('has-accepted-gig');
          }
        }
      }
    } catch {
      // silent
    }
  }

  function isCustomerLoggedIn() {
    const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
    const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
    return Boolean(user && token && (!user.role || user.role === 'customer'));
  }

  /**
   * Bind event listeners on page load
   */
  function init() {
    injectModalElements();

    const isMainLanding = window.location.pathname.endsWith('index.html') || 
                          window.location.pathname === '/' || 
                          window.location.pathname === '' || 
                          (!window.location.pathname.includes('customer-dashboard') && 
                           !window.location.pathname.includes('worker-dashboard') && 
                           !window.location.pathname.includes('welcome'));

    // Requirement 2: On main dashboard, when not logged in, clicking any "Services we offer" choices redirects to customer login
    if (isMainLanding && !isCustomerLoggedIn()) {
      const redirectToCustomerLogin = (event) => {
        if (event.target.closest('.heart')) return;
        event.preventDefault();
        event.stopPropagation();
        window.location.href = 'auth.html?role=customer&mode=signin';
      };

      document.querySelectorAll('.service-card, .category-card, .view-more-services, #services a, #services button, .category-carousel a').forEach((el) => {
        el.addEventListener('click', redirectToCustomerLogin, true);
      });
      return;
    }

    // On main dashboard, if customer is logged in, clicking service choices takes them to customer dashboard
    if (isMainLanding && isCustomerLoggedIn()) {
      document.querySelectorAll('.service-card, .category-card, .view-more-services, #services a, #services button, .category-carousel a').forEach((el) => {
        el.addEventListener('click', (event) => {
          if (event.target.closest('.heart')) return;
          event.preventDefault();
          event.stopPropagation();
          window.location.href = 'customer-dashboard.html';
        }, true);
      });
      return;
    }

    // On customer dashboard: attach modal booking flow with location enforcement
    document.querySelectorAll('.service-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        if (event.target.closest('.heart')) return;
        event.preventDefault();
        event.stopPropagation();

        const serviceId = resolveServiceId(card);
        const heading = card.querySelector('h3')?.textContent?.trim() || 'Service';
        const basePrice = getBasePrice(card);

        // Customers MUST specify location before looking for a service
        if (!hasCustomerSpecifiedLocation()) {
          promptCustomerLocationRequired({ serviceId, serviceName: heading, basePrice });
          return;
        }

        openServiceWorkersModal(serviceId, heading, basePrice);
      }, true);
    });

    // Intercept search bar & custom request finder if customer hasn't set location
    const searchInput = document.querySelector('#search');
    if (searchInput) {
      const enforceLoc = (e) => {
        const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
        const isGuestLanding = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '';
        if (user && !isGuestLanding && !hasCustomerSpecifiedLocation()) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          searchInput.blur();
          promptCustomerLocationRequired(null);
        }
      };
      searchInput.addEventListener('focus', enforceLoc);
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') enforceLoc(e);
      });
    }

    const findServiceBtn = document.querySelector('#find-service');
    if (findServiceBtn) {
      findServiceBtn.addEventListener('click', (e) => {
        const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
        const isGuestLanding = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '';
        if (user && !isGuestLanding && !hasCustomerSpecifiedLocation()) {
          e.preventDefault();
          e.stopPropagation();
          promptCustomerLocationRequired(null);
        }
      }, true);
    }

    // Wire up "My Bookings" button in navbar or dropdown (exclusively for appointments)
    document.addEventListener('click', (e) => {
      const appointmentsTrigger = e.target.closest('#nav-my-bookings-btn, #btn-my-orders, #dropdown-link-appointments, [href="#appointments"]');
      if (appointmentsTrigger) {
        e.preventDefault();
        openCustomerBookingsModal();
      }

      const customPoolTrigger = e.target.closest('#btn-request-gig-open-pool, #btn-header-post-request, #btn-services-custom-job, .btn-custom-pool-link');
      if (customPoolTrigger) {
        e.preventDefault();
        e.stopPropagation();
        openCustomJobModal();
      }
    });

    // Wire up smooth navigation and highlight for other custom pool section links (#request)
    document.querySelectorAll('a[href="#request"]:not(.btn-custom-pool-link):not(#btn-header-post-request):not(.mobile-request)').forEach(link => {
      link.addEventListener('click', (e) => {
        const target = document.getElementById('request');
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const reqCard = target.querySelector('.request-card');
          if (reqCard) {
            reqCard.classList.remove('request-card-pulse');
            void reqCard.offsetWidth; // trigger reflow
            reqCard.classList.add('request-card-pulse');
          }
        }
      });
    });

    // Ensure custom job needs option is displayed for logged-in customers
    ensureCustomJobEntryOption();

    // Auto-open appointments if hash is #appointments or #my-bookings
    if (window.location.hash === '#appointments' || window.location.hash === '#my-bookings') {
      setTimeout(() => {
        openCustomerBookingsModal();
      }, 200);
    }

    // Check if there is a pending custom pool draft saved prior to customer signin
    const pendingPoolDraft = sessionStorage.getItem('hustlePendingCustomPool');
    if (pendingPoolDraft) {
      try {
        const draft = JSON.parse(pendingPoolDraft);
        sessionStorage.removeItem('hustlePendingCustomPool');
        const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
        if (user && user.role === 'customer') {
          setTimeout(() => {
            openCustomJobModal(draft.presetBudget || 499, draft.initialNotes || '', draft.initialCategory || null);
          }, 300);
        }
      } catch (err) {
        console.warn('Could not restore pending custom pool draft:', err);
      }
    }

    refreshBookingsBadge();
    if (!window._hustleBookingsBadgeInterval) {
      window._hustleBookingsBadgeInterval = setInterval(refreshBookingsBadge, 6000);
    }
    updateServiceCardsPricing();
  }

  /**
   * Ensure custom job needs banner option is rendered after cards
   */
  function ensureCustomJobEntryOption() {
    const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
    const isCustomer = user && user.role === 'customer';
    const isCustomerPage = window.location.pathname.includes('customer-dashboard.html');

    if (!isCustomer && !isCustomerPage) return;

    if (document.getElementById('custom-job-entry-wrap')) {
      const btn = document.getElementById('btn-services-custom-job');
      btn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCustomJobModal();
      });
      return;
    }

    const anchor = document.querySelector('#services .services-action-wrap') || document.querySelector('#services .service-cards-grid');
    if (!anchor) return;

    const html = `
      <div class="custom-job-needs-cta-wrap" id="custom-job-entry-wrap">
        <div class="custom-job-needs-card">
          <div class="custom-job-content">
            <div class="custom-job-badge">
              <span class="sparkle-icon">✨</span>
              <span>OPEN PRO POOL</span>
            </div>
            <h3 class="custom-job-title">Can't find what you're looking for?</h3>
            <p class="custom-job-desc">
              Post your custom job requirements directly to our verified open pool. Outline your task, choose your schedule, and set your own budget.
            </p>
          </div>
          <div class="custom-job-actions">
            <a href="#request" class="button button-orange btn-custom-pool-link" id="btn-services-custom-job">
              <span>Enter Custom Job Needs</span>
              <b class="arrow-icon">→</b>
            </a>
          </div>
        </div>
      </div>
    `;
    anchor.insertAdjacentHTML('afterend', html);

    const btn = document.getElementById('btn-services-custom-job');
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCustomJobModal();
    });
  }

  /**
   * Open the Open Pro Pool Custom Job Needs Form Modal
   */
  function openCustomJobModal(presetBudget = 499, initialNotes = '', initialCategory = null) {
    if (typeof window.dismissAllAiSearchSuggestions === 'function') window.dismissAllAiSearchSuggestions();
    document.querySelectorAll('.hustle-ai-suggestions-dropdown').forEach(d => { d.style.display = 'none'; d.innerHTML = ''; });
    injectModalElements();

    const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
    if (!user || user.role !== 'customer') {
      try {
        sessionStorage.setItem('hustlePendingCustomPool', JSON.stringify({ presetBudget, initialNotes, initialCategory }));
      } catch {}
      window.location.href = 'auth.html?role=customer&mode=signin';
      return;
    }

    const overlay = document.getElementById('hustle-service-modal-overlay');
    if (overlay) {
      overlay.classList.add('active');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      renderBookingForm(null, 'custom-pool', 'Open Pro Pool Request', presetBudget);

      // Pre-fill initial notes and category if provided (e.g. from AI diagnosis)
      setTimeout(() => {
        if (initialNotes) {
          const notesEl = document.getElementById('book-notes');
          if (notesEl) notesEl.value = initialNotes;
        }
        if (initialCategory) {
          const serviceSelect = document.getElementById('book-service-select');
          const customServiceInput = document.getElementById('book-custom-service-input');
          if (serviceSelect) {
            let matched = false;
            for (let opt of serviceSelect.options) {
              if (opt.value.toLowerCase() === initialCategory.toLowerCase() || opt.textContent.toLowerCase().includes(initialCategory.toLowerCase())) {
                serviceSelect.value = opt.value;
                matched = true;
                break;
              }
            }
            if (!matched && customServiceInput) {
              serviceSelect.value = 'Other';
              serviceSelect.dispatchEvent(new Event('change'));
              customServiceInput.value = initialCategory;
            } else {
              serviceSelect.dispatchEvent(new Event('change'));
            }
          }
        }
      }, 50);
    }
  }

  /**
   * Display Interactive AI Smart Match Diagnosis Modal
   */
  function showAiDiagnosisModal(diagnosis, rawQuery) {
    if (!diagnosis) return;
    if (typeof window.dismissAllAiSearchSuggestions === 'function') window.dismissAllAiSearchSuggestions();
    document.querySelectorAll('.hustle-ai-suggestions-dropdown').forEach(d => { d.style.display = 'none'; d.innerHTML = ''; });

    const isMatch18 = diagnosis.match18 ? Boolean(diagnosis.match18.matched || diagnosis.match18.hasMatch) : true;
    const matchService = diagnosis.match18?.service;

    // If no standard catalog service fits, do not show diagnosis modal or "AI Finding... Next Step..." text.
    // Directly move ahead to open the Post Open Pool modal as requested.
    if (!isMatch18 || !matchService) {
      if (typeof openCustomJobModal === 'function') {
        openCustomJobModal(
          diagnosis.estimatedPriceRange?.suggested || 499,
          diagnosis.suggestedNotes || rawQuery,
          diagnosis.match18?.suggestedPoolSkill || diagnosis.specificSkill || diagnosis.category || rawQuery
        );
      }
      return;
    }

    injectModalElements();

    const overlay = document.getElementById('hustle-service-modal-overlay');
    const modalTitle = document.getElementById('service-modal-title');
    const modalBody = document.getElementById('service-modal-body');

    if (!overlay || !modalTitle || !modalBody) return;

    const isMainLanding = window.location.pathname.endsWith('index.html') || 
                          window.location.pathname === '/' || 
                          window.location.pathname === '' || 
                          (!window.location.pathname.includes('customer-dashboard') && 
                           !window.location.pathname.includes('worker-dashboard') && 
                           !window.location.pathname.includes('welcome'));
    const isGuest = isMainLanding && !isCustomerLoggedIn();

    modalTitle.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="hustle-ai-badge"><span class="ai-spark-mini">✦</span> ${'✦ Smart AI Match'}</span>
        <span>Closest Matching Service Found</span>
      </div>
    `;

    const urgencyClass = diagnosis.urgency && diagnosis.urgency.includes('Emergency') ? 'ai-urgency-emergency' :
                         diagnosis.urgency && diagnosis.urgency.includes('High') ? 'ai-urgency-high' : 'ai-urgency-standard';

    const checklistHtml = (diagnosis.recommendedChecklist || []).map(item => `<li>${item}</li>`).join('');

    const cardContentHtml = `
      <div class="ai-card-header">
        <div>
          <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:#827a70; font-weight:700;">Closest Available Service</span>
          <h3 class="ai-card-title">${matchService.name}</h3>
          <span style="font-size:0.8rem; color:#c2410c; font-weight:700;">Category: ${matchService.category}</span>
        </div>
        <span class="ai-urgency-badge ${urgencyClass}">● ${diagnosis.urgency || 'Standard'}</span>
      </div>

      <div class="ai-diagnosis-text">
        <strong>AI Analysis:</strong> ${diagnosis.match18?.reason || diagnosis.diagnosis || `Identified as best fit for: "${rawQuery}".`}
      </div>

      <div class="ai-stats-row">
        <div class="ai-stat-box">
          <label>Suggested Rate</label>
          <strong>From ₹${diagnosis.suggestedRate || matchService.minPrice || diagnosis.estimatedPriceRange?.min || 349}</strong>
          <small>${diagnosis.pricingSource || 'Live verified pro pricing'}</small>
        </div>
        <div class="ai-stat-box">
          <label>Suggested Budget</label>
          <strong>₹${diagnosis.estimatedPriceRange?.suggested || matchService.minPrice || 499}</strong>
          <small>Benchmark: ₹${diagnosis.estimatedPriceRange?.min || 299} – ₹${diagnosis.estimatedPriceRange?.max || 799}</small>
        </div>
      </div>

      ${checklistHtml ? `
      <div class="ai-checklist-box">
        <h4>📋 Recommended Action &amp; Safety Checklist</h4>
        <ul>${checklistHtml}</ul>
      </div>
      ` : ''}

      ${isGuest ? `
        <div class="ai-guest-auth-prompt" style="background:#fff7ed; border:1.5px solid #fdba74; border-radius:12px; padding:14px 16px; margin-top:14px; text-align:center;">
          <strong style="color:#9a3412; font-size:0.95rem; display:block; margin-bottom:4px;">🔒 Customer Login Required</strong>
          <span style="color:#7c2d12; font-size:0.85rem; display:block; margin-bottom:12px;">Please sign in with your customer account to view verified specialists and book <strong>${matchService.name}</strong>.</span>
          <button type="button" class="btn-ai-confirm" id="btn-ai-login-customer" style="background:#ea580c; color:#ffffff; width:100%; justify-content:center; box-shadow:0 4px 14px rgba(234,88,12,0.3);">
            <span>🔑 Log In as Customer to Book ${matchService.name} ➔</span>
          </button>
        </div>
        <div style="display:flex; justify-content:center; margin-top:10px;">
          <button type="button" class="btn-ai-dismiss" id="btn-ai-close" style="padding:9px 24px;">
            <span>Cancel</span>
          </button>
        </div>
      ` : `
        <div class="ai-actions-row" style="flex-direction:column; gap:8px;">
          <button type="button" class="btn-ai-confirm" id="btn-ai-book-service">
            <span>👉 View &amp; Book ${matchService.name} Specialists</span>
          </button>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn-ai-dismiss" id="btn-ai-accept-post" style="flex:1; font-size:0.825rem; padding:10px;">
              <span>Still need custom pool? Create Pool ➔</span>
            </button>
            <button type="button" class="btn-ai-dismiss" id="btn-ai-close" style="padding:10px 14px;">
              <span>Cancel</span>
            </button>
          </div>
        </div>
      `}
    `;

    const html = `
      <div class="ai-diagnosis-card">
        ${cardContentHtml}
      </div>
    `;

    modalBody.innerHTML = html;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Hook guest login button (if guest on generic main dashboard)
    document.getElementById('btn-ai-login-customer')?.addEventListener('click', () => {
      closeServiceModal();
      sessionStorage.setItem('hustlePending18Match', JSON.stringify({
        serviceId: matchService.id,
        serviceName: matchService.name,
        basePrice: matchService.minPrice || diagnosis.estimatedPriceRange?.suggested || 499,
        diagnosis,
        query: rawQuery
      }));
      window.location.href = 'auth.html?role=customer&mode=signin';
    });

    // Hook book service button (if customer logged in)
    document.getElementById('btn-ai-book-service')?.addEventListener('click', () => {
      closeServiceModal();
      if (matchService) {
        highlight18ServiceCard(matchService.id || matchService.name);
        openServiceWorkersModal(matchService.id, matchService.name, matchService.minPrice || 499);
      }
    });

    // Hook create pool button
    document.getElementById('btn-ai-accept-post')?.addEventListener('click', () => {
      openCustomJobModal(
        diagnosis.estimatedPriceRange?.suggested || 499,
        diagnosis.suggestedNotes || rawQuery,
        diagnosis.match18?.suggestedPoolSkill || diagnosis.category || 'Other'
      );
    });

    document.getElementById('btn-ai-close')?.addEventListener('click', () => {
      closeServiceModal();
    });
  }

  /**
   * Highlight a specific service card among the 18 services
   */
  function highlight18ServiceCard(serviceIdOrName) {
    if (!serviceIdOrName) return null;
    const target = String(serviceIdOrName).toLowerCase();

    const servicesSec = document.getElementById('services');
    if (servicesSec) servicesSec.scrollIntoView({ behavior: 'smooth' });

    let matchedCard = null;
    document.querySelectorAll('.service-card').forEach((card) => {
      card.classList.remove('ai-matched-highlight');
      const title = card.querySelector('h3')?.textContent?.toLowerCase() || '';
      const sid = card.dataset.serviceId || '';
      if (title.includes(target) || target.includes(title) || (sid && target.includes(sid))) {
        matchedCard = card;
        card.classList.add('ai-matched-highlight');
        card.style.display = '';
        setTimeout(() => {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
    });

    return matchedCard;
  }

  /**
   * Replace services we offer prices with the lowest price among available workers in customer's city.
   * If no worker is available for that service, keep that area completely blank.
   */
  async function updateServiceCardsPricing(cityOverride = null) {
    const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
    const isCustomer = user && user.role === 'customer';
    const isCustomerPage = window.location.pathname.includes('customer-dashboard.html');

    // Only active after customer login or on customer dashboard
    if (!isCustomer && !isCustomerPage) return;

    const activeCity = cityOverride || localStorage.getItem('hustleSelectedCity') || localStorage.getItem('hustleLocation') || 'Bengaluru';
    let coordsParam = '';
    try {
      const coords = JSON.parse(localStorage.getItem('hustleLocationCoords') || 'null');
      if (coords && coords.lat && coords.lng) {
        coordsParam = `&lat=${coords.lat}&lng=${coords.lng}`;
      }
    } catch {}

    try {
      const res = await fetch(`${API_BASE}/services/pricing-overview?city=${encodeURIComponent(activeCity)}${coordsParam}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.pricing) return;

      const pricing = data.pricing;
      document.querySelectorAll('.service-card').forEach((card) => {
        const sId = resolveServiceId(card);
        const priceContainer = card.querySelector('.card-bottom strong');
        if (!priceContainer) return;

        const minPrice = pricing[sId];
        if (typeof minPrice === 'number' && minPrice > 0) {
          priceContainer.style.display = '';
          priceContainer.textContent = `From ₹${minPrice}`;
        } else {
          // If no worker is available for this service in this city, leave blank
          priceContainer.textContent = '';
          priceContainer.style.display = 'none';
        }
      });
    } catch (err) {
      console.warn('Could not update service dynamic pricing:', err);
    }
  }

  // Listen for location changes to update service card prices automatically
  const handleLocationUpdate = (e) => {
    const city = e.detail?.city || localStorage.getItem('hustleSelectedCity') || localStorage.getItem('hustleLocation');
    updateServiceCardsPricing(city);
  };
  window.addEventListener('hustle:locationChanged', handleLocationUpdate);
  window.addEventListener('hustle:location-change', handleLocationUpdate);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export to global scope
  window.HustleBooking = {
    openServiceWorkersModal,
    openCustomerBookingsModal,
    openCustomJobModal,
    openEscrowPaymentModal,
    openMockPaymentModal: openEscrowPaymentModal,
    showAiDiagnosisModal,
    highlight18ServiceCard,
    ensureCustomJobEntryOption,
    refreshBookingsBadge,
    promptCustomerLocationRequired,
    hasCustomerSpecifiedLocation,
    updateServiceCardsPricing,
    showHustleToast
  };

})();
