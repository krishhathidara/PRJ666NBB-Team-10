async function postJSON(url, data){
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include'
  });
  const contentType = res.headers.get('content-type')||'';
  const payload = contentType.includes('application/json') ? await res.json() : {};
  if(!res.ok) throw new Error(payload.error || ('HTTP '+res.status));
  return payload;
}

// Sign Up
const signupForm = document.getElementById('signup-form');
if(signupForm){
  signupForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(signupForm);
    const name = fd.get('name').toString().trim();
    const email = fd.get('email').toString().trim();
    const password = fd.get('password').toString();
    const errorEl = document.getElementById('signup-error');
    errorEl.hidden = true; errorEl.textContent = '';
    try{
      await postJSON('/api/auth/signup', { name, email, password });
      window.location.href = '/';        // <-- redirect to HOME
    }catch(err){
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

// Sign In
const signinForm = document.getElementById('signin-form');
if(signinForm){
  signinForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(signinForm);
    const email = fd.get('email').toString().trim();
    const password = fd.get('password').toString();
    const errorEl = document.getElementById('signin-error');
    errorEl.hidden = true; errorEl.textContent = '';
    try{
      await postJSON('/api/auth/signin', { email, password });
      window.location.href = '/';        // <-- redirect to HOME
    }catch(err){
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });
}

// Handle forgot password
const forgotLink = document.getElementById('forgot-password');
const resetFormDiv = document.getElementById('reset-form');
const resetForm = document.getElementById('reset-request-form');
const resetMessage = document.getElementById('reset-message');

if (forgotLink && resetFormDiv) {
  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    resetFormDiv.hidden = false; // Show reset form
  });
}

// Handle reset request
if (resetForm) {
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(resetForm);
    const email = fd.get('email').toString().trim();
    resetMessage.textContent = '';
    resetMessage.hidden = true;
    try {
      const response = await postJSON('/api/auth/reset', { email });
      resetMessage.textContent = response.message || 'Reset email sent if account exists.';
      resetMessage.hidden = false;
      resetFormDiv.hidden = false; // Hide form after success
    } catch (err) {
      resetMessage.textContent = err.message;
      resetMessage.hidden = false;
    }
  });
}

// Handle reset confirmation
const resetConfirmForm = document.getElementById('reset-confirm-form');
const resetError = document.getElementById('reset-error');
const resetSuccess = document.getElementById('reset-success');

if (resetConfirmForm) {
  // Populate token and email from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  resetConfirmForm.token.value = urlParams.get('token') || '';
  resetConfirmForm.email.value = urlParams.get('email') || '';

  resetConfirmForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(resetConfirmForm);
    const token = fd.get('token').toString();
    const email = fd.get('email').toString();
    const password = fd.get('password').toString();
    const confirm = fd.get('confirm').toString();
    resetError.textContent = '';
    resetError.hidden = true;

    // Client-side validation
    if (password !== confirm) {
      resetError.textContent = 'Passwords do not match';
      resetError.hidden = false;
      return;
    }
    if (password.length < 6) { // Matches signin.html minlength
      resetError.textContent = 'Password must be at least 6 characters';
      resetError.hidden = false;
      return;
    }

    try {
      await postJSON('/api/auth/reset-confirm', { token, email, password });
      if (resetSuccess) {
        resetSuccess.textContent = 'Password has been reset successfully. Redirecting and signing in...';
        resetSuccess.hidden = false;
      }
      setTimeout(() => {
      window.location.href = '/'; }, 3000); // Redirect after 3 seconds
    } catch (err) {
      resetError.textContent = err.message;
      resetError.hidden = false;
    }
  });
}
