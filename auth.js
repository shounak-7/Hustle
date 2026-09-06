/* Hustle Authentication Logic — Customer & Worker Portals */
/* Connects seamlessly to Express + MongoDB / Bcrypt / JWT backend with dual-mode resilience */

(async function () {
  // Dynamically resolve backend API base URL
  function resolveApiBase() {
    if (window.location.protocol === 'file:' || !window.location.origin || window.location.origin === 'null') {
      return 'http://localhost:5001/api/auth';
    }
    if (window.location.port && window.location.port !== '5001') {
      return 'http://localhost:5001/api/auth';
    }
    return '/api/auth';
  }

  const API_BASE = resolveApiBase();
  const GOOGLE_CLIENT_ID = '77291826073-iist5f6abnhijn9di04bhdoe46rdd1r3.apps.googleusercontent.com';
  const params = new URLSearchParams(window.location.search);

  // Initialize local fallback DB if present
  if (typeof HustleDB !== 'undefined') {
    try {
      await HustleDB.init();
    } catch (e) {
      console.warn('Local DB init note:', e);
    }
  }

  // Core DOM Elements
  const form = document.querySelector('#auth-form');
  const roleInput = document.querySelector('#role');
  const formTitle = document.querySelector('#form-title');
  const formHelp = document.querySelector('#form-help');
  const bannerPill = document.querySelector('#banner-pill');
  const bannerHint = document.querySelector('#banner-hint');
  const introEyebrow = document.querySelector('#intro-eyebrow');
  const introTitle = document.querySelector('#intro-title');
  const introDesc = document.querySelector('#intro-desc');
  const submitText = document.querySelector('#submit-text');
  const googleAuthBtn = document.querySelector('#google-auth-btn');
  const googleAuthText = document.querySelector('#google-auth-text');
  const formError = document.querySelector('#form-error');

  // Tabs
  const tabSignup = document.querySelector('#tab-signup');
  const tabSignin = document.querySelector('#tab-signin');

  // Groups & inputs
  const groupName = document.querySelector('#group-name');
  const groupPhone = document.querySelector('#group-phone');
  const groupSkills = document.querySelector('#group-skills');
  const groupExperience = document.querySelector('#group-experience');
  const groupCity = document.querySelector('#group-city');
  const groupDocument = document.querySelector('#group-document');
  const groupArea = document.querySelector('#group-area');
  const groupBio = document.querySelector('#group-bio');
  const labelEmail = document.querySelector('#label-email');
  const inputEmail = document.querySelector('#input-email');
  const inputName = document.querySelector('#input-name');
  const inputPhone = document.querySelector('#input-phone');
  const inputPassword = document.querySelector('#input-password');
  const selectSkill = document.querySelector('#select-skill-category');
  const selectExp = document.querySelector('#select-experience');
  const selectWorkerCity = document.querySelector('#select-worker-city');
  const inputCustomCity = document.querySelector('#input-custom-city');
  const btnForgotPassword = document.querySelector('#btn-forgot-password');
  const btnTogglePwd = document.querySelector('#btn-toggle-pwd');

  // Highlights
  const hlTitle1 = document.querySelector('#hl-title-1');
  const hlDesc1 = document.querySelector('#hl-desc-1');
  const hlTitle2 = document.querySelector('#hl-title-2');
  const hlDesc2 = document.querySelector('#hl-desc-2');
  const hlTitle3 = document.querySelector('#hl-title-3');
  const hlDesc3 = document.querySelector('#hl-desc-3');

  // File Dropzone
  const fileDropzone = document.querySelector('#file-dropzone');
  const inputDocFile = document.querySelector('#input-doc-file');
  const dropzonePrompt = document.querySelector('#dropzone-prompt');
  const filePreview = document.querySelector('#file-preview');
  const previewFilename = document.querySelector('#preview-filename');
  const previewFilesize = document.querySelector('#preview-filesize');
  const btnRemoveFile = document.querySelector('#btn-remove-file');

  // Modal elements
  const forgotModal = document.querySelector('#forgot-modal');
  const btnCloseForgot = document.querySelector('#btn-close-forgot');
  const forgotForm = document.querySelector('#forgot-form');
  const forgotStep1 = document.querySelector('#forgot-step-1');
  const forgotStep2 = document.querySelector('#forgot-step-2');
  const inputForgotTarget = document.querySelector('#input-forgot-target');
  const inputForgotOtp = document.querySelector('#input-forgot-otp');
  const inputForgotNewPwd = document.querySelector('#input-forgot-newpwd');
  const btnRequestOtp = document.querySelector('#btn-request-otp');
  const btnAutofillOtp = document.querySelector('#btn-autofill-otp');
  const demoOtpCode = document.querySelector('#demo-otp-code');
  const forgotAlert = document.querySelector('#forgot-alert');

  // Strict initial hiding of the modal on page load
  if (forgotModal) {
    forgotModal.hidden = true;
    forgotModal.classList.remove('active');
    forgotModal.style.display = 'none';
  }

  // State
  let currentRole = 'customer';
  let signingIn = false;
  let attachedDocName = '';
  let attachedDocData = '';
  let attachedDocSize = '';
  let activeResetTarget = '';
  let activeOtp = '';
  let backendOnline = false;

  const roleCopy = {
    customer: {
      eyebrow: 'LOOKING FOR HELP',
      introTitle: 'Great help for <em>your everyday life.</em>',
      introDesc: 'Find, compare and book ID-verified professionals near you with transparent upfront prices and payment protection.',
      banner: 'CUSTOMER PORTAL',
      bannerHint: 'Find & book trusted local pros',
      signupTitle: 'Find the help you need.',
      signupHelp: 'Create your customer account to discover trusted local experts in moments.',
      signinTitle: 'Welcome back.',
      signinHelp: 'Sign in to your customer account to manage service requests and bookings.',
      highlights: [
        ['Verified Local Experts', 'Government ID checked and skill-vetted professionals'],
        ['Transparent Upfront Pricing', 'Zero hidden commissions, surge charges, or surprises'],
        ['Pay After Completion', 'Escrow protection ensures quality work before payment releases']
      ]
    },
    worker: {
      eyebrow: 'WORK ON YOUR TERMS',
      introTitle: 'Put your craft to work & <em>earn more.</em>',
      introDesc: 'Join over 3,200+ independent local pros. Keep 100% of your tips, enjoy daily direct payouts, and build a lasting business.',
      banner: 'WORKER PARTNER PORTAL',
      bannerHint: 'Grow your business & receive gigs',
      signupTitle: 'Put your skills to work.',
      signupHelp: 'Create your professional partner account and start receiving high-paying local gigs.',
      signinTitle: 'Welcome back, partner.',
      signinHelp: 'Sign in to your professional portal to view incoming requests and track your earnings.',
      highlights: [
        ['⚡ Same-Day Direct Payouts', 'Direct transfers to your bank account with zero delayed fees'],
        ['✦ Keep 100% of Your Tips', 'Transparent earnings with absolute compensation fairness'],
        ['✓ Set Your Own Hours', 'Accept jobs in your neighborhood on full-time, part-time, or weekend basis']
      ]
    }
  };

  // Check Backend Server Status
  async function checkBackendHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${API_BASE}/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        backendOnline = true;
        return;
      }
    } catch (e) {
      // Backend not reachable on port 5001
    }
    backendOnline = false;
  }

  checkBackendHealth();

  function setErrorMessage(msg) {
    if (!formError) return;
    if (msg) {
      formError.textContent = msg;
      formError.hidden = false;
    } else {
      formError.textContent = '';
      formError.hidden = true;
    }
  }

  function updateHighlights(role) {
    const data = roleCopy[role].highlights;
    if (hlTitle1) hlTitle1.textContent = data[0][0];
    if (hlDesc1) hlDesc1.textContent = data[0][1];
    if (hlTitle2) hlTitle2.textContent = data[1][0];
    if (hlDesc2) hlDesc2.textContent = data[1][1];
    if (hlTitle3) hlTitle3.textContent = data[2][0];
    if (hlDesc3) hlDesc3.textContent = data[2][1];
  }

  function selectRole(role) {
    if (!roleCopy[role]) return;
    currentRole = role;
    if (roleInput) roleInput.value = role;

    // Update role buttons
    document.querySelectorAll('.role-button').forEach((btn) => {
      const isMatch = btn.dataset.role === role;
      btn.classList.toggle('selected', isMatch);
      btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });

    const info = roleCopy[role];
    if (introEyebrow) introEyebrow.textContent = info.eyebrow;
    if (introTitle) introTitle.innerHTML = info.introTitle;
    if (introDesc) introDesc.textContent = info.introDesc;

    if (bannerPill) {
      bannerPill.textContent = info.banner;
      bannerPill.classList.toggle('worker-mode', role === 'worker');
    }
    if (bannerHint) bannerHint.textContent = info.bannerHint;

    updateHighlights(role);
    renderFormState();
    if (typeof renderActiveSession === 'function') {
      renderActiveSession();
    }
    setErrorMessage('');
  }

  function setMode(isSignin) {
    signingIn = isSignin;
    tabSignup?.classList.toggle('active', !signingIn);
    tabSignin?.classList.toggle('active', signingIn);
    renderFormState();
    setErrorMessage('');
  }

  function renderFormState() {
    const info = roleCopy[currentRole];
    if (formTitle) formTitle.textContent = signingIn ? info.signinTitle : info.signupTitle;
    if (formHelp) formHelp.textContent = signingIn ? info.signinHelp : info.signupHelp;

    // Fields visibility
    if (groupName) groupName.hidden = signingIn;
    if (inputName) inputName.required = !signingIn;

    if (groupPhone) groupPhone.hidden = signingIn;
    if (inputPhone) inputPhone.required = !signingIn;

    // Worker specific fields (compulsory + optional)
    const showWorkerFields = currentRole === 'worker' && !signingIn;
    [groupSkills, groupExperience, groupCity, groupDocument, groupArea, groupBio].forEach((el) => {
      if (el) el.hidden = !showWorkerFields;
    });

    if (selectWorkerCity) selectWorkerCity.required = showWorkerFields;
    if (selectSkill) selectSkill.required = showWorkerFields;
    if (selectExp) selectExp.required = showWorkerFields;

    // Email label & input format
    if (labelEmail) {
      labelEmail.innerHTML = signingIn ? 'Email address or phone number <span class="req">*</span>' : 'Email address <span class="req">*</span>';
    }
    if (inputEmail) {
      inputEmail.type = signingIn ? 'text' : 'email';
      inputEmail.placeholder = signingIn ? 'you@example.com or 9876543210' : 'you@example.com';
    }

    // Password & forgot password link
    if (btnForgotPassword) btnForgotPassword.hidden = !signingIn;

    // Button text
    if (submitText) {
      if (signingIn) {
        submitText.textContent = currentRole === 'worker' ? 'Sign in to Partner Portal' : 'Sign in to Hustle';
      } else {
        submitText.textContent = currentRole === 'worker' ? 'Submit Partner Application' : 'Create Customer Account';
      }
    }

    // Google Auth — only for customers, hidden for workers
    const googleAuthWrapper = document.querySelector('#google-auth-btn');
    const authDivider = document.querySelector('.auth-divider');
    if (currentRole === 'worker') {
      if (googleAuthWrapper) googleAuthWrapper.style.display = 'none';
      if (authDivider) authDivider.style.display = 'none';
    } else {
      if (googleAuthWrapper) googleAuthWrapper.style.display = '';
      if (authDivider) authDivider.style.display = '';
      if (googleAuthText) {
        googleAuthText.textContent = signingIn ? 'Sign in with Google' : 'Continue with Google';
      }
    }

    // Switch copy
    const switchCopy = document.querySelector('#switch-copy');
    if (switchCopy) {
      switchCopy.innerHTML = signingIn
        ? 'New to Hustle? <button type="button" id="login-toggle">Create an account</button>'
        : 'Already have an account? <button type="button" id="login-toggle">Sign in</button>';
      document.querySelector('#login-toggle')?.addEventListener('click', () => setMode(!signingIn));
    }
  }

  // Event Listeners for Role Buttons
  document.querySelectorAll('.role-button:not(.role-disabled)').forEach((btn) => {
    btn.addEventListener('click', () => selectRole(btn.dataset.role));
  });

  // Business Disabled Notice
  document.querySelector('.role-disabled')?.addEventListener('click', () => {
    setErrorMessage('Hustle for Business is launching soon! Please join as a Customer or Gig Worker partner in the meantime.');
  });

  // Mode Tabs
  tabSignup?.addEventListener('click', () => setMode(false));
  tabSignin?.addEventListener('click', () => setMode(true));

  // Password visibility toggle
  btnTogglePwd?.addEventListener('click', () => {
    const isPassword = inputPassword.type === 'password';
    inputPassword.type = isPassword ? 'text' : 'password';
    btnTogglePwd.textContent = isPassword ? '🙈' : '👁';
    btnTogglePwd.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

  // Worker city custom input toggle
  selectWorkerCity?.addEventListener('change', () => {
    if (selectWorkerCity.value === 'Other') {
      if (inputCustomCity) {
        inputCustomCity.style.display = 'block';
        inputCustomCity.required = true;
        inputCustomCity.focus();
      }
    } else {
      if (inputCustomCity) {
        inputCustomCity.style.display = 'none';
        inputCustomCity.required = false;
      }
    }
  });

  // File Dropzone Handling
  fileDropzone?.addEventListener('click', (e) => {
    if (e.target.closest('#btn-remove-file')) return;
    inputDocFile?.click();
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    fileDropzone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      fileDropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    fileDropzone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      fileDropzone.classList.remove('dragover');
    });
  });

  fileDropzone?.addEventListener('drop', (e) => {
    if (e.dataTransfer.files?.length) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  inputDocFile?.addEventListener('change', () => {
    if (inputDocFile.files?.length) {
      handleFileUpload(inputDocFile.files[0]);
    }
  });

  function handleFileUpload(file) {
    if (!file) return;
    attachedDocName = file.name;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    attachedDocSize = `${sizeMb} MB`;
    if (previewFilename) previewFilename.textContent = file.name;
    if (previewFilesize) previewFilesize.textContent = `${sizeMb} MB · Supporting verification document ready`;
    if (dropzonePrompt) dropzonePrompt.hidden = true;
    if (filePreview) filePreview.hidden = false;

    // Read image/file data as Base64 data URL for preview in admin portal
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        attachedDocData = e.target?.result || '';
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.warn('Could not read document file as data URL:', err);
    }
  }

  btnRemoveFile?.addEventListener('click', (e) => {
    e.stopPropagation();
    attachedDocName = '';
    attachedDocData = '';
    attachedDocSize = '';
    if (inputDocFile) inputDocFile.value = '';
    if (dropzonePrompt) dropzonePrompt.hidden = false;
    if (filePreview) filePreview.hidden = true;
  });

  // Open Forgot Password Modal
  btnForgotPassword?.addEventListener('click', () => {
    if (!forgotModal) return;
    forgotModal.hidden = false;
    forgotModal.style.display = 'flex';
    forgotModal.classList.add('active');

    // Reset modal state to step 1
    if (forgotStep1) forgotStep1.hidden = false;
    if (forgotStep2) forgotStep2.hidden = true;
    if (forgotAlert) forgotAlert.hidden = true;

    if (inputForgotTarget) {
      inputForgotTarget.value = inputEmail?.value || '';
      inputForgotTarget.focus();
    }
  });

  function closeForgotModal() {
    if (!forgotModal) return;
    forgotModal.hidden = true;
    forgotModal.style.display = 'none';
    forgotModal.classList.remove('active');
  }

  btnCloseForgot?.addEventListener('click', closeForgotModal);
  forgotModal?.addEventListener('click', (e) => {
    if (e.target === forgotModal) closeForgotModal();
  });

  // Step 1: Request OTP
  btnRequestOtp?.addEventListener('click', async () => {
    const target = (inputForgotTarget?.value || '').trim();
    if (!target) {
      if (forgotAlert) {
        forgotAlert.className = 'modal-alert error';
        forgotAlert.textContent = 'Please enter your registered email address or phone number.';
        forgotAlert.hidden = false;
      }
      return;
    }

    try {
      btnRequestOtp.disabled = true;
      btnRequestOtp.textContent = 'Generating OTP...';

      let otpCode = '654321';
      let requestSucceeded = false;

      // Try Backend Express API first
      try {
        const res = await fetch(`${API_BASE}/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: target })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          otpCode = data.otp || data.mockOtp || '654321';
          requestSucceeded = true;
        } else if (res.status === 404) {
          throw new Error(data.message || 'No registered account found with that email/phone.');
        }
      } catch (backendErr) {
        if (backendErr.message.includes('No registered account')) {
          throw backendErr;
        }
        // If backend offline, use local DB
        if (typeof HustleDB !== 'undefined') {
          const localResult = await HustleDB.generatePasswordResetOTP(target);
          otpCode = localResult.otp;
          requestSucceeded = true;
        }
      }

      if (!requestSucceeded) {
        otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      }

      activeResetTarget = target;
      activeOtp = otpCode;

      if (demoOtpCode) demoOtpCode.textContent = otpCode;
      if (forgotStep1) forgotStep1.hidden = true;
      if (forgotStep2) forgotStep2.hidden = false;

      if (forgotAlert) {
        forgotAlert.className = 'modal-alert success';
        forgotAlert.innerHTML = `<strong>OTP Dispatched:</strong> Code <strong>${otpCode}</strong> generated for <u>${target}</u>.`;
        forgotAlert.hidden = false;
      }
      inputForgotOtp?.focus();
    } catch (err) {
      if (forgotAlert) {
        forgotAlert.className = 'modal-alert error';
        forgotAlert.textContent = err.message || 'Failed to generate OTP. Please check your email or phone.';
        forgotAlert.hidden = false;
      }
    } finally {
      btnRequestOtp.disabled = false;
      btnRequestOtp.textContent = 'Send Verification Code →';
    }
  });

  // Auto-fill OTP button
  btnAutofillOtp?.addEventListener('click', () => {
    if (inputForgotOtp && activeOtp) {
      inputForgotOtp.value = activeOtp;
      inputForgotNewPwd?.focus();
    }
  });

  // Step 2: Verify OTP & Reset Password
  forgotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enteredOtp = (inputForgotOtp?.value || '').trim();
    const newPassword = (inputForgotNewPwd?.value || '').trim();

    if (!enteredOtp) {
      if (forgotAlert) {
        forgotAlert.className = 'modal-alert error';
        forgotAlert.textContent = 'Please enter the 6-digit OTP code.';
        forgotAlert.hidden = false;
      }
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      if (forgotAlert) {
        forgotAlert.className = 'modal-alert error';
        forgotAlert.textContent = 'New password must be at least 6 characters long.';
        forgotAlert.hidden = false;
      }
      return;
    }

    try {
      const submitBtn = document.querySelector('#btn-reset-submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating password...';
      }

      let resetDone = false;

      // Try Backend Express API first
      try {
        const res = await fetch(`${API_BASE}/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: activeResetTarget,
            otp: enteredOtp,
            newPassword: newPassword
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          resetDone = true;
        } else {
          throw new Error(data.message || 'OTP verification failed.');
        }
      } catch (backendErr) {
        if (backendErr.message.includes('OTP verification failed')) {
          throw backendErr;
        }
        // If backend offline, fallback to local DB
        if (typeof HustleDB !== 'undefined') {
          await HustleDB.resetPasswordWithOTP(activeResetTarget, enteredOtp, newPassword);
          resetDone = true;
        }
      }

      if (!resetDone) {
        throw new Error('Unable to reset password. Please check your OTP code.');
      }

      if (forgotAlert) {
        forgotAlert.className = 'modal-alert success';
        forgotAlert.innerHTML = '<strong>Success!</strong> Password updated securely. Redirecting to sign in...';
        forgotAlert.hidden = false;
      }

      setTimeout(() => {
        closeForgotModal();
        setMode(true);
        if (inputEmail) inputEmail.value = activeResetTarget;
        if (inputPassword) inputPassword.value = newPassword;
      }, 1000);
    } catch (err) {
      if (forgotAlert) {
        forgotAlert.className = 'modal-alert error';
        forgotAlert.textContent = err.message || 'OTP verification failed. Please try again.';
        forgotAlert.hidden = false;
      }
    } finally {
      const submitBtn = document.querySelector('#btn-reset-submit');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify OTP & Save New Password ✓';
      }
    }
  });

  // Real Google Identity Services login for customers
  function initGoogleIdentityServices() {
    if (typeof google === 'undefined' || !google.accounts?.id) return;
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });
  }

  async function handleGoogleCredentialResponse(response) {
    // response.credential is a real Google ID token JWT
    try {
      setErrorMessage('');
      if (googleAuthBtn) {
        googleAuthBtn.disabled = true;
        googleAuthBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;"><svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.29 21.43 7.35 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.97 0 12s.46 3.84 1.26 5.42l4.02-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.29 2.57 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg>Signing you in…</span>`;
      }

      const res = await fetch(`${API_BASE}/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential, role: 'customer' })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Google sign-in failed.');
      }

      if (window.HustleSession) {
        HustleSession.setSession(data.user, data.token);
      } else {
        localStorage.setItem('hustleToken', data.token);
        localStorage.setItem('hustleCurrentUser', JSON.stringify(data.user));
      }
      sessionStorage.setItem('hustleCustomerNeedsLocation', 'true');
      sessionStorage.removeItem('hustleLocationConfirmed');
      window.location.href = 'customer-dashboard.html';
    } catch (err) {
      setErrorMessage(err.message || 'Google sign-in failed. Please use email login.');
      if (googleAuthBtn) {
        googleAuthBtn.disabled = false;
        googleAuthBtn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.29 21.43 7.35 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.97 0 12s.46 3.84 1.26 5.42l4.02-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.29 2.57 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg><span id="google-auth-text">Continue with Google</span>`;
      }
    }
  }

  // Google OAuth button click: trigger One Tap or fall back to redirect
  googleAuthBtn?.addEventListener('click', () => {
    if (currentRole === 'worker') return; // Safety guard — button hidden for workers

    if (typeof google !== 'undefined' && google.accounts?.id) {
      // Use real Google Identity Services One Tap / popup
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // One Tap blocked (e.g. user dismissed it before) — fall back to redirect OAuth
          window.location.href = `${API_BASE}/google?role=customer`;
        }
      });
    } else {
      // google.accounts.id not loaded yet — use redirect OAuth flow
      window.location.href = `${API_BASE}/google?role=customer`;
    }
  });

  // Initialize Google Identity Services once the library loads
  if (typeof google !== 'undefined' && google.accounts?.id) {
    initGoogleIdentityServices();
  } else {
    window.addEventListener('load', () => {
      // Try again after page fully loads (async script may load late)
      if (typeof google !== 'undefined' && google.accounts?.id) {
        initGoogleIdentityServices();
      }
    });
  }

  // Main Form Submission (Sign In & Sign Up)
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setErrorMessage('');

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    const emailOrPhone = (data.email || '').trim();
    const password = (data.password || '').trim();

    const submitButton = form.querySelector('button[type="submit"]');

    if (signingIn) {
      // ================= SIGN IN FLOW =================
      if (!emailOrPhone) {
        setErrorMessage('Please enter your email address or phone number.');
        inputEmail?.focus();
        return;
      }
      if (!password) {
        setErrorMessage('Please enter your password.');
        inputPassword?.focus();
        return;
      }

      try {
        if (submitButton) submitButton.disabled = true;
        if (submitText) submitText.textContent = 'Signing in...';

        let authenticatedUser = null;
        let authToken = null;

        // 1. Try Backend Express API
        try {
          const res = await fetch(`${API_BASE}/signin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identifier: emailOrPhone,
              password: password,
              expectedRole: currentRole
            })
          });

          const result = await res.json();
          if (res.ok && result.success) {
            authenticatedUser = result.user;
            authToken = result.token;
          } else {
            throw new Error(result.message || 'Invalid credentials. No account found.');
          }
        } catch (apiErr) {
          // If the server rejected credentials (401/400), don't fallback to local DB; show error
          if (apiErr.message && !apiErr.message.includes('Failed to fetch') && !apiErr.message.includes('NetworkError')) {
            throw apiErr;
          }

          // If backend server is unreachable (offline/file://), fallback to local store
          console.warn('[Hustle Auth] Backend unreachable, trying local fallback...');
          if (typeof HustleDB !== 'undefined') {
            authenticatedUser = await HustleDB.authenticate(emailOrPhone, password);
            authToken = 'local_token_' + Date.now();
          } else {
            // LocalStorage check
            const localUsers = JSON.parse(localStorage.getItem('hustleUsers') || '[]');
            const found = localUsers.find(u => 
              ((u.email || '').toLowerCase() === emailOrPhone.toLowerCase() || (u.phone || '').trim() === emailOrPhone) &&
              u.password === password
            );
            if (found) {
              authenticatedUser = found;
              authToken = 'local_token_' + Date.now();
            } else if (emailOrPhone === 'customer@hustle.local' && password === 'password123') {
              authenticatedUser = { name: 'Aarav Sharma', email: 'customer@hustle.local', phone: '9876543210', role: 'customer' };
              authToken = 'demo_token_' + Date.now();
            } else if (emailOrPhone === 'worker@hustle.local' && password === 'password123') {
              authenticatedUser = { name: 'Ramesh Kumar', email: 'worker@hustle.local', phone: '9876543211', role: 'worker' };
              authToken = 'demo_token_' + Date.now();
            } else {
              throw new Error('Invalid email/phone or password. Please verify your details.');
            }
          }
        }

        if (!authenticatedUser) {
          throw new Error('Authentication failed. Please check your credentials.');
        }

        const userRole = authenticatedUser.role || 'customer';
        if (userRole !== currentRole) {
          const registeredAs = userRole === 'worker' ? 'Gig Worker Partner' : 'Customer';
          const switchPortal = userRole === 'worker' ? 'Worker Partner Portal' : 'Customer Portal';
          throw new Error(`This account is registered as a ${registeredAs}. Please switch to the ${switchPortal} to sign in.`);
        }

        // Store JWT token and user profile
        if (authenticatedUser.city) {
          localStorage.setItem('hustleSelectedCity', authenticatedUser.city);
        }
        if (window.HustleSession) {
          HustleSession.setSession(authenticatedUser, authToken || ('jwt_' + Date.now()));
        } else {
          localStorage.setItem('hustleToken', authToken || ('jwt_' + Date.now()));
          localStorage.setItem('hustleCurrentUser', JSON.stringify(authenticatedUser));
        }

        if ((authenticatedUser.role || currentRole) !== 'worker') {
          sessionStorage.setItem('hustleCustomerNeedsLocation', 'true');
          sessionStorage.removeItem('hustleLocationConfirmed');
        }

        const targetUrl = ((authenticatedUser.role || currentRole) === 'worker')
          ? 'worker-dashboard.html'
          : 'customer-dashboard.html';
        window.location.href = targetUrl;
      } catch (err) {
        setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
        if (submitButton) submitButton.disabled = false;
        renderFormState();
      }
    } else {
      // ================= SIGN UP FLOW =================
      const name = (data.name || '').trim();
      const phone = (data.phone || '').trim();

      if (!name) {
        setErrorMessage('Please enter your full name.');
        inputName?.focus();
        return;
      }
      if (!emailOrPhone || !emailOrPhone.includes('@')) {
        setErrorMessage('Please enter a valid email address (e.g. you@example.com).');
        inputEmail?.focus();
        return;
      }
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        setErrorMessage('Please enter a valid 10-digit mobile number.');
        inputPhone?.focus();
        return;
      }
      if (!password || password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        inputPassword?.focus();
        return;
      }

      // Worker specific compulsory validation
      let finalCity = 'Bengaluru';
      if (currentRole === 'worker') {
        let city = (data.city || '').trim();
        if (city === 'Other') {
          city = (data.customCity || '').trim();
        }
        if (!city) {
          setErrorMessage('Please select or enter your working city (compulsory for gig workers).');
          selectWorkerCity?.focus();
          return;
        }
        finalCity = city;

        const skill = data.skillCategory;
        const experience = data.experience;
        if (!skill) {
          setErrorMessage('Please select your primary skill category (compulsory for gig workers).');
          selectSkill?.focus();
          return;
        }
        if (!experience) {
          setErrorMessage('Please select your years of experience (compulsory for gig workers).');
          selectExp?.focus();
          return;
        }
      }

      const payload = {
        name,
        email: emailOrPhone.toLowerCase(),
        phone,
        password,
        role: currentRole,
        city: finalCity,
        skillCategory: data.skillCategory || '',
        specificSkill: data.specificSkill || '',
        experience: data.experience || '',
        locality: data.locality || '',
        bio: data.bio || '',
        documentFile: attachedDocName || '',
        supportingDocUrl: attachedDocData || '',
        documentSize: attachedDocSize || ''
      };

      try {
        if (submitButton) submitButton.disabled = true;
        if (submitText) submitText.textContent = 'Creating account...';

        let newUser = null;
        let authToken = null;

        // 1. Try Backend Express API
        try {
          const res = await fetch(`${API_BASE}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const result = await res.json();
          if (res.ok && result.success) {
            newUser = result.user;
            authToken = result.token;
          } else {
            throw new Error(result.message || 'Registration failed. Please check your information.');
          }
        } catch (apiErr) {
          // If server rejected with duplicate email or phone (409/400), display error
          if (apiErr.message && !apiErr.message.includes('Failed to fetch') && !apiErr.message.includes('NetworkError')) {
            throw apiErr;
          }

          // If backend offline, register in local store
          console.warn('[Hustle Auth] Backend unreachable, saving locally...');
          if (typeof HustleDB !== 'undefined') {
            await HustleDB.registerUser(payload);
          } else {
            const users = JSON.parse(localStorage.getItem('hustleUsers') || '[]');
            users.push(payload);
            localStorage.setItem('hustleUsers', JSON.stringify(users));
          }
          newUser = payload;
          authToken = 'local_jwt_' + Date.now();
        }

        if (!newUser) {
          throw new Error('Registration failed. Please try again.');
        }

        // Store JWT token and user profile
        if (newUser.city) {
          localStorage.setItem('hustleSelectedCity', newUser.city);
        }
        if (window.HustleSession) {
          HustleSession.setSession(newUser, authToken || ('jwt_' + Date.now()));
        } else {
          localStorage.setItem('hustleToken', authToken || ('jwt_' + Date.now()));
          localStorage.setItem('hustleCurrentUser', JSON.stringify(newUser));
        }

        if ((newUser.role || currentRole) !== 'worker') {
          sessionStorage.setItem('hustleCustomerNeedsLocation', 'true');
          sessionStorage.removeItem('hustleLocationConfirmed');
        }

        const targetUrl = ((newUser.role || currentRole) === 'worker')
          ? 'worker-dashboard.html'
          : 'customer-dashboard.html';
        window.location.href = targetUrl;
      } catch (err) {
        setErrorMessage(err.message || 'Registration failed. Please check your information.');
        if (submitButton) submitButton.disabled = false;
        renderFormState();
      }
    }
  });

  // Check URL params for error or preselection
  const urlError = params.get('error');
  if (urlError) {
    setErrorMessage(`Notice: ${decodeURIComponent(urlError)}`);
  }

  // Initialization from Query Parameters or Active Session
  const initialRole = params.get('role');
  if (initialRole === 'worker' || initialRole === 'customer') {
    selectRole(initialRole);
  } else {
    const activeUser = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
    if (activeUser && activeUser.role === 'worker') {
      selectRole('worker');
    } else {
      selectRole('customer');
    }
  }

  // Active session check & UI handler
  const activeSessionBox = document.querySelector('#active-session-box');
  const sessionUserName = document.querySelector('#session-user-name');
  const sessionUserMeta = document.querySelector('#session-user-meta');
  const btnSessionContinue = document.querySelector('#btn-session-continue');
  const btnSessionLogout = document.querySelector('#btn-session-logout');

  function renderActiveSession() {
    if (!activeSessionBox) return;
    const user = window.HustleSession ? HustleSession.getUser() : JSON.parse(localStorage.getItem('hustleCurrentUser') || 'null');
    const token = window.HustleSession ? HustleSession.getToken() : localStorage.getItem('hustleToken');
    const isLoggedIn = Boolean(user && token);

    if (isLoggedIn && user) {
      activeSessionBox.hidden = false;
      const userRole = user.role || 'customer';
      const isMismatch = userRole !== currentRole;
      const isWorker = userRole === 'worker';

      if (sessionUserName) sessionUserName.textContent = user.name || 'User';

      const sessionBadge = activeSessionBox.querySelector('.session-badge');
      if (sessionBadge) {
        if (isMismatch) {
          sessionBadge.textContent = 'SESSION NOTICE · DIFFERENT ROLE';
          sessionBadge.style.background = '#ea580c';
          sessionBadge.style.color = '#ffffff';
        } else {
          sessionBadge.textContent = 'ACTIVE SESSION DETECTED';
          sessionBadge.style.background = '';
          sessionBadge.style.color = '';
        }
      }

      if (sessionUserMeta) {
        if (isMismatch) {
          const registeredLabel = isWorker ? 'Gig Worker Partner' : 'Customer';
          const currentPortalLabel = currentRole === 'worker' ? 'Worker Partner' : 'Customer';
          sessionUserMeta.innerHTML = `<span style="color:#c2410c; font-weight:600;">Signed in as ${registeredLabel} (${user.email || user.phone}).</span><br><span style="color:#64748b; font-size:12px;">This is the ${currentPortalLabel} portal. Log out to switch, or continue to your portal below.</span>`;
        } else {
          sessionUserMeta.textContent = `${user.email || user.phone || ''} · ${isWorker ? 'Gig Worker Partner (' + (user.skillCategory || 'Pro') + ')' : 'Verified Customer'}`;
        }
      }

      if (btnSessionContinue) {
        if (isMismatch) {
          const targetPortalName = isWorker ? 'Worker Hub' : 'Customer Marketplace';
          btnSessionContinue.textContent = `Open your ${targetPortalName} →`;
          btnSessionContinue.href = isWorker ? 'worker-dashboard.html' : 'customer-dashboard.html';
        } else {
          btnSessionContinue.textContent = `Continue as ${user.name ? user.name.split(' ')[0] : 'User'} (${isWorker ? 'Partner Hub' : 'Marketplace'}) →`;
          btnSessionContinue.href = isWorker ? 'worker-dashboard.html' : 'customer-dashboard.html';
        }
      }
    } else {
      activeSessionBox.hidden = true;
    }
  }

  btnSessionLogout?.addEventListener('click', () => {
    if (window.HustleSession) {
      HustleSession.logOut('index.html');
    } else {
      localStorage.removeItem('hustleToken');
      localStorage.removeItem('hustleCurrentUser');
      window.location.href = 'index.html';
    }
    renderActiveSession();
    setErrorMessage('Logged out successfully. You can now sign in with another account.');
  });

  renderActiveSession();
  window.addEventListener('hustle:session-change', renderActiveSession);
})();
