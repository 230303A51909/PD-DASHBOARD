/* ============================================================
   ML-IH-PDS — app.js
   All DOM logic inside DOMContentLoaded
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ----------------------------------------------------------
     AUTH
  ---------------------------------------------------------- */
  var USERS = {
    doctor:  { password: 'pd2024', role: 'Administrator',  initials: 'DR', fullName: 'Dr. Tsai Wen-Chung' },
    nurse:   { password: 'pd2024', role: 'Clinical Nurse', initials: 'NR', fullName: 'Nurse Hsu Tsung-Sheng' },
    patient: { password: 'pd2024', role: 'Patient',        initials: 'PT', fullName: 'Lin Wei-Chen' }
  };

  var currentUser  = null;
  var chartsReady  = false;

  /* Elements */
  var loginScreen  = document.getElementById('login-screen');
  var dashApp      = document.getElementById('dashboard-app');
  var inpUser      = document.getElementById('inp-user');
  var inpPass      = document.getElementById('inp-pass');
  var errMsg       = document.getElementById('err-msg');
  var loginBtn     = document.getElementById('login-btn');
  var btnTxt       = document.getElementById('btn-txt');
  var btnSpin      = document.getElementById('btn-spin');
  var btnArrow     = document.getElementById('btn-arrow');
  var chkRemember  = document.getElementById('chk-remember');
  var eyeBtn       = document.getElementById('eye-btn');
  var logoutModal  = document.getElementById('logout-modal');
  var toast        = document.getElementById('toast');
  var toastTimer   = null;

  /* Init state */
  loginScreen.style.display = 'flex';
  dashApp.style.display     = 'none';
  logoutModal.style.display = 'none';

  /* Restore session */
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('pd_session')); } catch(e) {}
  if (saved && saved.username && USERS[saved.username]) {
    doLogin(saved.username, false);
  }

  /* ------ Login -------- */
  loginBtn.addEventListener('click', attemptLogin);
  inpUser.addEventListener('keydown', function(e){ if(e.key==='Enter') inpPass.focus(); });
  inpPass.addEventListener('keydown', function(e){ if(e.key==='Enter') attemptLogin(); });

  function attemptLogin() {
    var username = inpUser.value.trim().toLowerCase();
    var password = inpPass.value;
    hideErr();
    if (!username || !password) { showErr('Please enter your username and password.'); return; }

    loginBtn.disabled  = true;
    btnTxt.style.display   = 'none';
    btnArrow.style.display = 'none';
    btnSpin.style.display  = 'inline-block';

    setTimeout(function(){
      var user = USERS[username];
      if (!user || user.password !== password) {
        loginBtn.disabled  = false;
        btnTxt.style.display   = 'inline';
        btnArrow.style.display = '';
        btnSpin.style.display  = 'none';
        inpPass.value = '';
        showErr('Invalid username or password. Try: doctor / pd2024');
        return;
      }
      if (chkRemember.checked) {
        try { localStorage.setItem('pd_session', JSON.stringify({ username: username })); } catch(e){}
      }
      doLogin(username, true);
    }, 900);
  }

  function doLogin(username, animate) {
    var user = USERS[username];
    currentUser = { username: username, role: user.role, initials: user.initials, fullName: user.fullName };

    setText('sb-avatar', user.initials);
    setText('sb-uname',  user.fullName);
    setText('sb-urole',  user.role);
    setText('lm-avatar', user.initials);
    setText('lm-name',   user.fullName);
    setText('lm-role',   user.role);

    if (animate) {
      loginScreen.style.transition = 'opacity .45s ease';
      loginScreen.style.opacity = '0';
      setTimeout(function(){
        loginScreen.style.display = 'none';
        loginScreen.style.opacity = '';
        showDash();
        showToast('Welcome, ' + user.fullName);
      }, 450);
    } else {
      loginScreen.style.display = 'none';
      showDash();
    }
  }

  function showDash() {
    dashApp.style.display = 'flex';
    dashApp.style.opacity = '0';
    dashApp.style.transition = 'opacity .4s ease';
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        dashApp.style.opacity = '1';
        runCounters();
        startClock();
      });
    });
  }

  function showErr(msg) { errMsg.textContent = msg; errMsg.style.display = 'block'; }
  function hideErr()    { errMsg.style.display = 'none'; errMsg.textContent = ''; }

  /* Demo chips */
  document.getElementById('demo-doctor').addEventListener('click',  function(){ inpUser.value='doctor';  inpPass.value='pd2024'; hideErr(); });
  document.getElementById('demo-nurse').addEventListener('click',   function(){ inpUser.value='nurse';   inpPass.value='pd2024'; hideErr(); });
  document.getElementById('demo-patient').addEventListener('click', function(){ inpUser.value='patient'; inpPass.value='pd2024'; hideErr(); });

  /* Eye toggle */
  eyeBtn.addEventListener('click', function(){
    inpPass.type = inpPass.type === 'password' ? 'text' : 'password';
    eyeBtn.title = inpPass.type === 'password' ? 'Show password' : 'Hide password';
  });

  /* ------ Logout -------- */
  document.getElementById('sb-logout').addEventListener('click', openLogout);
  document.getElementById('logout-cancel').addEventListener('click', function(){ logoutModal.style.display='none'; });
  document.getElementById('logout-confirm').addEventListener('click', function(){
    logoutModal.style.display = 'none';
    try { localStorage.removeItem('pd_session'); } catch(e){}
    currentUser = null; chartsReady = false;

    dashApp.style.transition = 'opacity .4s ease';
    dashApp.style.opacity = '0';
    setTimeout(function(){
      dashApp.style.display = 'none';
      dashApp.style.opacity = '';
      inpUser.value = ''; inpPass.value = '';
      inpPass.type = 'password';
      hideErr();
      loginBtn.disabled = false;
      btnTxt.style.display = 'inline';
      btnSpin.style.display = 'none';
      btnArrow.style.display = '';
      chkRemember.checked = false;
      stopClock();
      loginScreen.style.opacity = '0';
      loginScreen.style.transition = 'opacity .4s ease';
      loginScreen.style.display = 'flex';
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          loginScreen.style.opacity = '1';
          inpUser.focus();
        });
      });
    }, 400);
  });

  function openLogout() {
    logoutModal.style.display = 'flex';
  }

  /* ------ Navigation -------- */
  var pageLabels = { overview:'Overview', exchange:'Fluid Exchange', mlmodel:'ML Model', patients:'Patients', alerts:'Alerts', settings:'Settings' };

  document.querySelectorAll('.sb-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var page = btn.dataset.page;
      if (!page) return;
      document.querySelectorAll('.sb-btn').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
      btn.classList.add('active');
      var pg = document.getElementById('page-' + page);
      if (pg) pg.classList.add('active');
      setText('tb-breadcrumb', pageLabels[page] || page);
      if (page === 'mlmodel') initCharts();
    });
  });

  /* ------ Clock -------- */
  var clockInterval = null;
  function startClock() {
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  }
  function stopClock() { if (clockInterval) clearInterval(clockInterval); }
  function updateClock() {
    var el = document.getElementById('tb-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12:false });
  }

  /* ------ Counters -------- */
  function runCounters() {
    animCount('ctr-exchanges', 3, false, '');
    animCount('ctr-score',    86, false, '');
    animCount('ctr-accuracy', 98, false, '%');
    animCount('ctr-time',     19.4, true, 'm');
  }

  function animCount(id, target, isFloat, suffix) {
    var el = document.getElementById(id);
    if (!el) return;
    var start = performance.now(), dur = 1500;
    function step(now) {
      var t = Math.min((now-start)/dur, 1);
      var ease = 1 - Math.pow(1-t, 3);
      var val = target * ease;
      el.textContent = (isFloat ? val.toFixed(1) : Math.floor(val)) + suffix;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = (isFloat ? target.toFixed(1) : target) + suffix;
    }
    requestAnimationFrame(step);
  }

  /* ------ Score button -------- */
  document.getElementById('score-btn').addEventListener('click', runScoring);

  function runScoring() {
    var btn = document.getElementById('score-btn');
    var drain    = parseFloat(document.getElementById('ef-drain').value)      || 1952;
    var infuse   = parseFloat(document.getElementById('ef-infuse').value)     || 2010;
    var dTime    = parseFloat(document.getElementById('ef-drain-time').value) || 19.4;
    var iTime    = parseFloat(document.getElementById('ef-inf-time').value)   || 10.2;
    var totalTime = dTime + iTime;
    var totalVol  = (drain + infuse) / 2;

    btn.disabled = true;
    btn.textContent = 'Running ML model...';

    setTimeout(function(){
      /* Scoring formula from paper */
      var score = 100;
      var timeDiff = Math.abs(totalTime - 20);
      var volDiff  = Math.abs(totalVol - 2000) / 100;
      score -= timeDiff * 2.5;
      score -= volDiff  * 2.5;
      score = Math.max(0, Math.round(score * 10) / 10);

      var abnormal = Math.abs(infuse - drain) > 200 || dTime > 25;
      var label, color, tagStyle, suggestion;

      if (score >= 90) {
        label = 'Excellent'; color = '#22c55e';
        tagStyle = 'background:rgba(34,197,94,.12);color:#86efac;border:1px solid rgba(34,197,94,.25)';
        suggestion = 'Fluid exchange in excellent condition. Keep up the great work!';
      } else if (score >= 75) {
        label = 'Good'; color = '#6366f1';
        tagStyle = 'background:rgba(99,102,241,.12);color:#a5b4fc;border:1px solid rgba(99,102,241,.25)';
        suggestion = 'Exchange is within acceptable range. Ensure dialysate bag is at correct height.';
      } else if (score >= 50) {
        label = 'Fair — Review Needed'; color = '#f59e0b';
        tagStyle = 'background:rgba(245,158,11,.12);color:#fcd34d;border:1px solid rgba(245,158,11,.25)';
        suggestion = 'Exchange time or volume outside optimal range. Check tubing position and bag height.';
      } else {
        label = 'Poor — Seek Assistance'; color = '#ef4444';
        tagStyle = 'background:rgba(239,68,68,.12);color:#fca5a5;border:1px solid rgba(239,68,68,.25)';
        suggestion = 'Score critically low. Possible catheter displacement. Contact medical staff immediately.';
      }

      if (abnormal) suggestion = '⚠ Abnormal detected — drainage volume/time deviates significantly. Catheter displacement suspected. Please contact medical staff as soon as possible.';

      var result = document.getElementById('ex-result');
      result.innerHTML =
        '<div class="result-output">' +
        '<div class="ro-label">ML SCORE</div>' +
        '<div class="ro-score" style="color:' + color + '">' + score + '</div>' +
        '<span class="ro-tag" style="' + tagStyle + '">' + label + '</span>' +
        '<div class="ro-msg">' + suggestion + '</div>' +
        '</div>';

      /* Update mongo doc */
      setText('md-drain',  drain);
      setText('md-infuse', infuse);
      setText('md-time',   totalTime.toFixed(1));
      setText('md-score',  score);
      setText('md-abn',    abnormal ? 'true' : 'false');
      setText('md-ts',     'ISODate("' + new Date().toISOString() + '")');

      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" width="16" height="16"><circle cx="10" cy="10" r="7" stroke="white" stroke-width="1.5"/><path d="M7 10l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Run ML Scoring';

      showToast('Score: ' + score + ' pts — ' + label);
    }, 1200);
  }

  /* Save button */
  document.getElementById('save-btn').addEventListener('click', function(){
    var btn = document.getElementById('save-btn');
    btn.textContent = 'Saved to MongoDB ✓';
    btn.style.color  = '#86efac';
    btn.style.borderColor = 'rgba(34,197,94,.4)';
    showToast('Exchange record saved to MongoDB');
    setTimeout(function(){
      btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" width="14" height="14"><path d="M17 13v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3M10 3v10M6 9l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Save to MongoDB';
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 3000);
  });

  /* ------ Charts -------- */
  function initCharts() {
    if (chartsReady) return;
    chartsReady = true;
    Chart.defaults.color = '#64748b';
    Chart.defaults.font.family = "'DM Mono', monospace";
    Chart.defaults.font.size = 11;
    var grid = 'rgba(148,163,184,0.06)';

    var ctx = document.getElementById('mlChart');
    if (!ctx) return;
    var g = ctx.getContext('2d').createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, 'rgba(99,102,241,0.25)');
    g.addColorStop(1, 'rgba(99,102,241,0)');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Fold 1','Fold 2','Fold 3','Fold 4','Fold 5','Fold 6','Fold 7','Fold 8','Fold 9','Fold 10'],
        datasets: [
          { label:'Quartic (98%)',  data:[97.2,98.1,97.8,98.4,97.9,98.6,98.0,97.7,98.3,97.5], borderColor:'#6366f1', backgroundColor:g, borderWidth:2, pointRadius:4, pointBackgroundColor:'#6366f1', fill:true, tension:.4 },
          { label:'Quintic (97%)',  data:[96.5,97.2,97.0,97.4,96.8,97.6,97.1,96.9,97.3,96.7], borderColor:'#14b8a6', backgroundColor:'transparent', borderWidth:2, pointRadius:3, pointBackgroundColor:'#14b8a6', tension:.4 },
          { label:'Cubic (93%)',    data:[92.8,93.4,93.1,93.7,92.9,94.0,93.2,93.0,93.5,92.6], borderColor:'#f59e0b', backgroundColor:'transparent', borderWidth:2, pointRadius:3, borderDash:[5,4], pointBackgroundColor:'#f59e0b', tension:.4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color:'#94a3b8', boxWidth:12, padding:20 } },
          tooltip: { backgroundColor:'#0f1623', borderColor:'rgba(99,102,241,.3)', borderWidth:1,
            callbacks: { label: function(c){ return ' ' + c.dataset.label + ': ' + c.parsed.y.toFixed(1) + '%'; } }
          }
        },
        scales: {
          x: { grid:{ color:grid }, ticks:{ color:'#64748b' } },
          y: { grid:{ color:grid }, min:88, max:100, ticks:{ color:'#64748b', callback:function(v){ return v+'%'; } } }
        }
      }
    });
  }

  /* ------ Toast -------- */
  function showToast(msg) {
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
    }, 3500);
  }

  /* ------ Helper -------- */
  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

});
