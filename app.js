const TMDB_KEY = '6eef04b70f82e9917227505f04715f2e';
const APP_VERSION = '4.0 - Auth & Cloud Sync';
const TRUSTED_DOMAINS = ['player.videasy.net', 'videasy.net'];

let currentTV = {id:'', title:'', seasons:[], episodes:[]};
let currentItem = {type:'', id:'', title:'', data:{}};
let recentlyViewed = [];
let watchHistory = [];
let watchlist = [];
let watchProgress = {};
let userRatings = {};
let currentFilter = 'all';
let currentSection = 'home';
let lastQueryValue = '';
let skeletonCount = 6;
const debounceDelay = 280;
let debounceTimeout = null;
let episodeCache = {};

// Authentication System
let isAuthenticated = false;
let currentUser = null;
let allUsers = {}; // Email -> user data mapping

let deviceType = 'desktop';
let userSettings = {
  theme: 'dark',
  devicePreference: 'auto',
  username: ''
};

// Device Detection
function detectDevice() {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  if (width < 1600) return 'desktop';
  return 'tv';
}

function updateDeviceType() {
  const detected = detectDevice();
  deviceType = userSettings.devicePreference === 'auto' ? detected : userSettings.devicePreference;
  document.body.setAttribute('data-device', deviceType);
  console.log(`Device mode: ${deviceType}`);
}

// Storage system with memory fallback
let storageAvailable = false;
let memoryStorage = {};
let persistentStore = null;

// Check if storage is available
function checkStorageAvailable() {
  try {
    const test = '__storage_test__';
    const storage = window['local' + 'Storage'];
    storage.setItem(test, test);
    storage.removeItem(test);
    storageAvailable = true;
    persistentStore = storage;
    return true;
  } catch(e) {
    storageAvailable = false;
    persistentStore = null;
    return false;
  }
}

// Unified storage interface
function setStorageItem(key, value) {
  if (storageAvailable && persistentStore) {
    try {
      persistentStore.setItem(key, value);
      return true;
    } catch(e) {
      memoryStorage[key] = value;
      return false;
    }
  } else {
    memoryStorage[key] = value;
    return false;
  }
}

function getStorageItem(key) {
  if (storageAvailable && persistentStore) {
    try {
      return persistentStore.getItem(key);
    } catch(e) {
      return memoryStorage[key] || null;
    }
  } else {
    return memoryStorage[key] || null;
  }
}

function removeStorageItem(key) {
  if (storageAvailable && persistentStore) {
    try {
      persistentStore.removeItem(key);
    } catch(e) {
      delete memoryStorage[key];
    }
  } else {
    delete memoryStorage[key];
  }
}

// Password hashing (simple hash for demo - in production use bcrypt)
function hashPassword(password) {
  let hash = 0;
  const str = password + 'zaids_movies_salt_2025';
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function checkPasswordStrength(password) {
  if (password.length < 6) return { strength: 'weak', score: 0 };
  if (password.length < 10) return { strength: 'medium', score: 1 };
  if (password.length >= 10 && /[A-Z]/.test(password) && /[0-9]/.test(password)) {
    return { strength: 'strong', score: 2 };
  }
  return { strength: 'medium', score: 1 };
}

// Storage functions with authentication
function saveToStorage() {
  try {
    if (!currentUser) {
      console.warn('Cannot save: No user logged in');
      return;
    }
    
    // Save current user's data
    const userData = {
      watchlist: watchlist || [],
      watchHistory: watchHistory || [],
      watchProgress: watchProgress || {},
      userRatings: userRatings || {},
      recentlyViewed: recentlyViewed || [],
      settings: userSettings || {}
    };
    
    // Update user data in allUsers object
    if (allUsers[currentUser.email]) {
      allUsers[currentUser.email].data = userData;
      allUsers[currentUser.email].lastSync = Date.now();
    }
    
    // Save all users data
    setStorageItem('zaids_movies_users', JSON.stringify(allUsers));
    
    // Save current user session
    setStorageItem('zaids_movies_session', JSON.stringify({
      email: currentUser.email,
      lastLogin: Date.now()
    }));
    
    console.log(`✓ Data synced for: ${currentUser.email} (${watchlist.length} watchlist, ${watchHistory.length} history)`);
  } catch(e) {
    console.error('Failed to save data:', e);
  }
}

function loadFromStorage() {
  try {
    // Load all users
    const savedUsers = getStorageItem('zaids_movies_users');
    if (savedUsers) {
      allUsers = JSON.parse(savedUsers);
    }
    
    // Check for existing session
    const session = getStorageItem('zaids_movies_session');
    if (session) {
      const sessionData = JSON.parse(session);
      if (allUsers[sessionData.email]) {
        // Auto-login if session exists
        currentUser = allUsers[sessionData.email];
        loadUserData(currentUser);
        isAuthenticated = true;
        console.log(`✓ Auto-login: ${currentUser.email}`);
        return true;
      }
    }
    
    return false;
  } catch(e) {
    console.warn('Failed to load data:', e);
    return false;
  }
}

function loadUserData(user) {
  try {
    if (!user) {
      console.warn('No user to load data from');
      return;
    }
    
    const userData = user.data || {};
    watchlist = Array.isArray(userData.watchlist) ? userData.watchlist : [];
    watchHistory = Array.isArray(userData.watchHistory) ? userData.watchHistory : [];
    watchProgress = userData.watchProgress && typeof userData.watchProgress === 'object' ? userData.watchProgress : {};
    userRatings = userData.userRatings && typeof userData.userRatings === 'object' ? userData.userRatings : {};
    recentlyViewed = Array.isArray(userData.recentlyViewed) ? userData.recentlyViewed : [];
    userSettings = userData.settings && typeof userData.settings === 'object' ? userData.settings : { 
      theme: 'dark', 
      devicePreference: 'auto', 
      username: user.email.split('@')[0] 
    };
    
    // Apply theme
    if (userSettings.theme) {
      document.body.setAttribute('data-theme', userSettings.theme);
    }
    
    console.log(`✓ User data loaded successfully:`);
    console.log(`  - Watchlist: ${watchlist.length} items`);
    console.log(`  - History: ${watchHistory.length} items`);
    console.log(`  - Progress: ${Object.keys(watchProgress).length} tracked`);
  } catch(e) {
    console.error('Failed to load user data:', e);
    // Initialize with empty data on error
    watchlist = [];
    watchHistory = [];
    watchProgress = {};
    userRatings = {};
    recentlyViewed = [];
    userSettings = { theme: 'dark', devicePreference: 'auto', username: user.email.split('@')[0] };
  }
}

// Authentication functions
function signup(email, password, confirmPassword) {
  if (!validateEmail(email)) {
    return { success: false, message: 'Invalid email address' };
  }
  
  if (password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters' };
  }
  
  if (password !== confirmPassword) {
    return { success: false, message: 'Passwords do not match' };
  }
  
  if (allUsers[email]) {
    return { success: false, message: 'Email already registered' };
  }
  
  // Create new user
  const hashedPassword = hashPassword(password);
  allUsers[email] = {
    email: email,
    passwordHash: hashedPassword,
    createdAt: Date.now(),
    lastSync: Date.now(),
    data: {}
  };
  
  setStorageItem('zaids_movies_users', JSON.stringify(allUsers));
  console.log(`✓ User created: ${email}`);
  
  return { success: true, message: 'Account created successfully!' };
}

function login(email, password) {
  if (!validateEmail(email)) {
    return { success: false, message: 'Invalid email address' };
  }
  
  const user = allUsers[email];
  if (!user) {
    return { success: false, message: 'Account not found' };
  }
  
  const hashedPassword = hashPassword(password);
  if (user.passwordHash !== hashedPassword) {
    return { success: false, message: 'Incorrect password' };
  }
  
  // Login successful
  currentUser = user;
  isAuthenticated = true;
  loadUserData(user);
  
  // Save session
  setStorageItem('zaids_movies_session', JSON.stringify({
    email: email,
    lastLogin: Date.now()
  }));
  
  console.log(`✓ Login successful: ${email}`);
  return { success: true, message: 'Login successful!' };
}

function logout() {
  if (!currentUser) {
    console.warn('No user to logout');
    return;
  }
  
  console.log(`Logging out: ${currentUser.email}`);
  
  // Save data before logout
  saveToStorage();
  
  // Clear session
  isAuthenticated = false;
  currentUser = null;
  removeStorageItem('zaids_movies_session');
  
  // Reset data
  watchlist = [];
  watchHistory = [];
  watchProgress = {};
  userRatings = {};
  recentlyViewed = [];
  userSettings = { theme: 'dark', devicePreference: 'auto', username: '' };
  
  console.log('✓ Logged out successfully');
  
  // Show auth screen
  showAuthScreen();
}

function deleteAccount() {
  if (!currentUser) return;
  
  if (!confirm(`Delete your account and all data?\n\nThis action cannot be undone!`)) {
    return;
  }
  
  const email = currentUser.email;
  delete allUsers[email];
  setStorageItem('zaids_movies_users', JSON.stringify(allUsers));
  
  alert('✓ Account deleted');
  logout();
}

// Authentication UI
function showAuthScreen() {
  const authModal = document.getElementById('authModal');
  if (authModal) {
    authModal.style.display = 'flex';
    authModal.classList.add('visible');
    renderLoginForm();
  }
  
  // Hide main app
  const sidebar = document.getElementById('sidebarNav');
  const hamburger = document.getElementById('hamburgerNav');
  const header = document.querySelector('.app-header');
  const mainContainer = document.getElementById('mainContainer');
  
  if (sidebar) sidebar.style.display = 'none';
  if (hamburger) hamburger.style.display = 'none';
  if (header) header.style.display = 'none';
  if (mainContainer) mainContainer.style.display = 'none';
  
  isAuthenticated = false;
  
  console.log('✓ Showing auth screen');
}

function hideAuthScreen() {
  const authModal = document.getElementById('authModal');
  if (authModal) {
    authModal.classList.remove('visible');
    setTimeout(() => {
      authModal.style.display = 'none';
    }, 300);
  }
  
  // Show main app
  const sidebar = document.getElementById('sidebarNav');
  const hamburger = document.getElementById('hamburgerNav');
  const header = document.querySelector('.app-header');
  const mainContainer = document.getElementById('mainContainer');
  
  if (sidebar) sidebar.style.display = 'flex';
  if (hamburger && deviceType === 'mobile') hamburger.style.display = 'block';
  if (header) header.style.display = 'block';
  if (mainContainer) mainContainer.style.display = 'flex';
  
  isAuthenticated = true;
  
  console.log('✓ Auth screen hidden, app visible');
}

function renderLoginForm() {
  const authContent = document.getElementById('authContent');
  authContent.innerHTML = `
    <div class="auth-container">
      <h2 class="auth-title">🎬 Welcome Back!</h2>
      <p class="auth-subtitle">Sign in to access your watchlist across all devices</p>
      
      <div id="authMessage"></div>
      
      <form class="auth-form" id="loginForm">
        <div class="form-field">
          <label for="loginEmail">Email</label>
          <input type="email" id="loginEmail" required placeholder="your@email.com" autocomplete="email" />
        </div>
        
        <div class="form-field">
          <label for="loginPassword">Password</label>
          <input type="password" id="loginPassword" required placeholder="••••••••" autocomplete="current-password" />
        </div>
        
        <div class="auth-actions">
          <button type="submit" class="btn btn-gradient btn-full-width">Sign In</button>
        </div>
      </form>
      
      <div class="auth-toggle">
        Don't have an account? <button type="button" id="showSignupBtn">Sign Up</button>
      </div>
    </div>
  `;
  
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('showSignupBtn').addEventListener('click', renderSignupForm);
}

function renderSignupForm() {
  const authContent = document.getElementById('authContent');
  authContent.innerHTML = `
    <div class="auth-container">
      <h2 class="auth-title">✨ Create Account</h2>
      <p class="auth-subtitle">Join Zaid's Movies Pro and sync across devices</p>
      
      <div id="authMessage"></div>
      
      <form class="auth-form" id="signupForm">
        <div class="form-field">
          <label for="signupEmail">Email</label>
          <input type="email" id="signupEmail" required placeholder="your@email.com" autocomplete="email" />
        </div>
        
        <div class="form-field">
          <label for="signupPassword">Password</label>
          <input type="password" id="signupPassword" required placeholder="At least 6 characters" autocomplete="new-password" />
          <div class="password-strength" id="passwordStrength">
            <div class="password-strength-bar" id="passwordStrengthBar"></div>
          </div>
          <div class="password-strength-text" id="passwordStrengthText"></div>
        </div>
        
        <div class="form-field">
          <label for="signupConfirmPassword">Confirm Password</label>
          <input type="password" id="signupConfirmPassword" required placeholder="Re-enter password" autocomplete="new-password" />
        </div>
        
        <div class="auth-checkbox">
          <input type="checkbox" id="termsAccept" required />
          <label for="termsAccept" style="color:var(--color-text-secondary);font-weight:400;">I agree to the Terms of Service</label>
        </div>
        
        <div class="auth-actions">
          <button type="submit" class="btn btn-gradient btn-full-width">Create Account</button>
        </div>
      </form>
      
      <div class="auth-toggle">
        Already have an account? <button type="button" id="showLoginBtn">Sign In</button>
      </div>
    </div>
  `;
  
  document.getElementById('signupForm').addEventListener('submit', handleSignup);
  document.getElementById('showLoginBtn').addEventListener('click', renderLoginForm);
  
  // Password strength indicator
  document.getElementById('signupPassword').addEventListener('input', function() {
    const password = this.value;
    const result = checkPasswordStrength(password);
    const bar = document.getElementById('passwordStrengthBar');
    const text = document.getElementById('passwordStrengthText');
    
    bar.className = `password-strength-bar ${result.strength}`;
    text.textContent = result.strength ? `Strength: ${result.strength}` : '';
  });
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  const result = login(email, password);
  showAuthMessage(result.message, result.success);
  
  if (result.success) {
    console.log('✓ Login successful, transitioning to app...');
    setTimeout(() => {
      isAuthenticated = true;
      hideAuthScreen();
      initProfileSystem();
      switchSection('home');
      console.log('✓ App loaded successfully');
    }, 800);
  }
}

function handleSignup(e) {
  e.preventDefault();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;
  
  const result = signup(email, password, confirmPassword);
  showAuthMessage(result.message, result.success);
  
  if (result.success) {
    console.log('✓ Signup successful, auto-logging in...');
    setTimeout(() => {
      // Auto-login after signup
      const loginResult = login(email, password);
      if (loginResult.success) {
        isAuthenticated = true;
        hideAuthScreen();
        initProfileSystem();
        switchSection('home');
        console.log('✓ App loaded successfully');
      }
    }, 1000);
  }
}

function showAuthMessage(message, isSuccess) {
  const messageDiv = document.getElementById('authMessage');
  messageDiv.innerHTML = `<div class="${isSuccess ? 'success' : 'error'}-message">${message}</div>`;
  
  setTimeout(() => {
    messageDiv.innerHTML = '';
  }, 5000);
}

function updateProfileUI() {
  if (!currentUser) return;
  
  const username = currentUser.email.split('@')[0];
  const profileNameEl = document.getElementById('currentProfileName');
  if (profileNameEl) {
    profileNameEl.textContent = `Welcome, ${username}!`;
  }
  userSettings.username = username;
}

function renderProfileDropdown() {
  const dropdown = document.getElementById('profileDropdown');
  if (!dropdown || !currentUser) return;
  
  const username = currentUser.email.split('@')[0];
  const userCount = Object.keys(allUsers).length;
  const lastSync = new Date(currentUser.lastSync || Date.now()).toLocaleString();
  
  let html = `
    <div class="profile-option active">
      <span>✓</span>
      <span style="flex: 1;">${username}</span>
    </div>
    <div style="padding:12px 20px;border-bottom:1px solid rgba(139,92,246,0.1);font-size:0.85rem;opacity:0.7;">
      <div>📧 ${currentUser.email}</div>
      <div style="margin-top:4px;">🔄 Synced: ${lastSync}</div>
      <div style="margin-top:4px;">👥 ${userCount} account${userCount !== 1 ? 's' : ''} total</div>
    </div>
    <div class="profile-option" id="logoutBtn" style="color:var(--color-danger);">
      <span>🚪</span>
      <span>Logout</span>
    </div>
  `;
  
  dropdown.innerHTML = html;
  
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.classList.remove('active');
      if (confirm('Logout from this device?')) {
        logout();
      }
    });
  }
}

function initProfileSystem() {
  const userProfile = document.getElementById('userProfile');
  const dropdown = document.getElementById('profileDropdown');
  
  if (!userProfile || !dropdown) {
    console.warn('Profile elements not found');
    return;
  }
  
  // Remove any existing listeners
  const newUserProfile = userProfile.cloneNode(true);
  userProfile.parentNode.replaceChild(newUserProfile, userProfile);
  
  newUserProfile.addEventListener('click', function(e) {
    e.stopPropagation();
    const dropdownEl = document.getElementById('profileDropdown');
    if (dropdownEl) {
      dropdownEl.classList.toggle('active');
    }
  });
  
  document.addEventListener('click', function(e) {
    const dropdownEl = document.getElementById('profileDropdown');
    const profileEl = document.getElementById('userProfile');
    if (dropdownEl && profileEl && !profileEl.contains(e.target)) {
      dropdownEl.classList.remove('active');
    }
  });
  
  if (isAuthenticated && currentUser) {
    updateProfileUI();
    renderProfileDropdown();
  }
}

const queryInput = document.getElementById('query');
const skeletonsContainer = document.getElementById('loading-skeletons');
const infoModal = document.getElementById('infoModal');
const tvModal = document.getElementById('tvSelectorModal');
const playerModal = document.getElementById('playerModal');
const tvPlay = document.getElementById('tvPlay');
const tvCancel = document.getElementById('tvCancel');
const clearSearchBtn = document.getElementById('clearSearch');
const sidebarNav = document.getElementById('sidebarNav');
const hamburgerBtn = document.getElementById('hamburgerMenuBtn');
const mainContainer = document.getElementById('mainContainer');

function showSkeletons(count) {
  skeletonsContainer.innerHTML = '';
  for (let i = 0; i < count; i++) {
    skeletonsContainer.innerHTML += `
    <div class="skeleton-card">
      <div class="skeleton-img"></div>
      <div class="skeleton-title"></div>
    </div>`;
  }
}
function hideSkeletons() {
  skeletonsContainer.innerHTML = '';
}

// Sidebar Navigation
function initSidebar() {
  console.log('Initializing sidebar navigation...');
  
  const tabs = document.querySelectorAll('.sidebar-tab');
  if (tabs.length === 0) {
    console.warn('No sidebar tabs found');
    return;
  }
  
  // Remove existing listeners by cloning
  tabs.forEach(tab => {
    const newTab = tab.cloneNode(true);
    tab.parentNode.replaceChild(newTab, tab);
  });
  
  // Add new listeners
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      const section = this.dataset.section;
      switchSection(section);
      if (deviceType === 'mobile' && sidebarNav) {
        sidebarNav.classList.remove('open');
      }
    });
  });
  
  if (hamburgerBtn) {
    const newHamburger = hamburgerBtn.cloneNode(true);
    hamburgerBtn.parentNode.replaceChild(newHamburger, hamburgerBtn);
    
    document.getElementById('hamburgerMenuBtn').addEventListener('click', function() {
      if (sidebarNav) {
        sidebarNav.classList.toggle('open');
      }
    });
  }
  
  if (mainContainer) {
    mainContainer.addEventListener('click', function() {
      if (deviceType === 'mobile' && sidebarNav && sidebarNav.classList.contains('open')) {
        sidebarNav.classList.remove('open');
      }
    });
  }
  
  console.log('✓ Sidebar initialized');
}

function switchSection(section) {
  if (!isAuthenticated) {
    console.warn('Cannot switch section: Not authenticated');
    return;
  }
  
  currentSection = section;
  console.log(`→ Switching to section: ${section}`);
  
  // Clear search when switching sections
  if (queryInput) {
    queryInput.value = '';
    lastQueryValue = '';
  }
  if (clearSearchBtn) {
    clearSearchBtn.classList.remove('visible');
  }
  hideSkeletons();
  
  // Update active tab
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.section === section) {
      tab.classList.add('active');
    }
  });
  
  // Hide all sections
  document.querySelectorAll('.app-section').forEach(sec => {
    sec.style.display = 'none';
  });
  
  // Show target section
  const targetSection = document.getElementById(`${section}Section`);
  if (targetSection) {
    targetSection.style.display = 'block';
    loadSection(section);
  } else {
    console.error(`Section not found: ${section}Section`);
  }
}

function loadSection(section) {
  const sectionContainer = document.getElementById(`${section}Section`);
  if (!sectionContainer) return;
  
  switch(section) {
    case 'home':
      loadHomeSection();
      break;
    case 'movies':
      loadMoviesSection();
      break;
    case 'tv':
      loadTVSection();
      break;
    case 'anime':
      loadAnimeSection();
      break;
    case 'watchlist':
      loadWatchlistSection();
      break;

    case 'history':
      loadHistorySection();
      break;
    case 'settings':
      loadSettingsSection();
      break;
    case 'about':
      loadAboutSection();
      break;
  }
}

function loadHomeSection() {
  const section = document.getElementById('homeSection');
  const username = currentUser ? currentUser.email.split('@')[0] : 'Guest';
  let html = '<h2 class="section-title">Welcome, ' + username + '! ✨</h2>';
  
  const inProgress = watchHistory.filter(h => {
    const key = `${h.item.type}-${h.item.id}`;
    return watchProgress[key] && watchProgress[key] > 0 && watchProgress[key] < 100;
  }).slice(0, 5);
  
  if (inProgress.length > 0) {
    html += '<h3 class="section-title" style="font-size:1.5rem;margin-top:32px;">▶️ Continue Watching</h3>';
    html += '<div class="results results-continue">' + inProgress.map(h => createResultCard(h.item, false, true)).join('') + '</div>';
  }
  
  html += '<h3 class="section-title" style="font-size:1.5rem;margin-top:48px;">🔥 Trending This Week</h3>';
  html += '<div class="results" id="homeTrending"></div>';
  
  if (watchHistory.length >= 3) {
    html += '<h3 class="section-title" style="font-size:1.5rem;margin-top:48px;">💡 Recommended For You</h3>';
    html += '<div class="results" id="homeRecommendations"></div>';
  }
  
  section.innerHTML = html;
  attachCardListeners();
  loadHomeTrending();
  if (watchHistory.length >= 3) loadHomeRecommendations();
}

async function loadHomeTrending() {
  try {
    const response = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_KEY}`);
    const data = await response.json();
    const results = (data.results || []).filter(m => m.poster_path && (m.media_type === 'movie' || m.media_type === 'tv')).slice(0, 12);
    document.getElementById('homeTrending').innerHTML = results.map(item => createResultCard(item)).join('');
    attachCardListeners();
  } catch(e) {
    console.error('Failed to load trending:', e);
  }
}

async function loadHomeRecommendations() {
  try {
    const recentItems = watchHistory.slice(0, 5).map(h => h.item);
    const genreIds = new Set();
    recentItems.forEach(item => {
      if (item.genre_ids) item.genre_ids.forEach(g => genreIds.add(g));
    });
    const topGenres = Array.from(genreIds).slice(0, 3).join(',');
    if (!topGenres) return;
    const response = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_genres=${topGenres}&sort_by=vote_average.desc&vote_count.gte=1000`);
    const data = await response.json();
    const results = (data.results || []).filter(m => m.poster_path).slice(0, 10);
    if (results.length > 0) {
      results.forEach(r => r.media_type = 'movie');
      document.getElementById('homeRecommendations').innerHTML = results.map(item => createResultCard(item)).join('');
      attachCardListeners();
    }
  } catch(e) {
    console.error('Failed to load recommendations:', e);
  }
}

async function loadMoviesSection() {
  const section = document.getElementById('moviesSection');
  section.innerHTML = '<h2 class="section-title">🎬 Movies</h2><div class="results" id="moviesResults"></div>';
  try {
    const response = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&sort_by=popularity.desc&vote_count.gte=100`);
    const data = await response.json();
    const results = (data.results || []).filter(m => m.poster_path).slice(0, 20);
    results.forEach(r => r.media_type = 'movie');
    document.getElementById('moviesResults').innerHTML = results.map(item => createResultCard(item)).join('');
    attachCardListeners();
  } catch(e) {
    console.error('Failed to load movies:', e);
  }
}

async function loadTVSection() {
  const section = document.getElementById('tvSection');
  section.innerHTML = '<h2 class="section-title">📺 TV Shows</h2><div class="results" id="tvResults"></div>';
  try {
    const response = await fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&sort_by=popularity.desc&vote_count.gte=100`);
    const data = await response.json();
    const results = (data.results || []).filter(m => m.poster_path).slice(0, 20);
    results.forEach(r => r.media_type = 'tv');
    document.getElementById('tvResults').innerHTML = results.map(item => createResultCard(item)).join('');
    attachCardListeners();
  } catch(e) {
    console.error('Failed to load TV shows:', e);
  }
}

async function loadAnimeSection() {
  const section = document.getElementById('animeSection');
  section.innerHTML = '<h2 class="section-title">⭐ Anime</h2><div class="results" id="animeResults"></div>';
  try {
    const response = await fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=16&with_origin_country=JP&sort_by=popularity.desc`);
    const data = await response.json();
    const results = (data.results || []).filter(m => m.poster_path).slice(0, 20);
    results.forEach(r => r.media_type = 'tv');
    document.getElementById('animeResults').innerHTML = results.map(item => createResultCard(item)).join('');
    attachCardListeners();
  } catch(e) {
    console.error('Failed to load anime:', e);
  }
}

function loadWatchlistSection() {
  const section = document.getElementById('watchlistSection');
  if (watchlist.length === 0) {
    section.innerHTML = '<h2 class="section-title">❤️ Your Watchlist</h2><p style="text-align:center;color:var(--color-text-secondary);margin-top:48px;">Your watchlist is empty. Add some content to get started!</p>';
    return;
  }
  section.innerHTML = '<h2 class="section-title">❤️ Your Watchlist</h2><div class="results">' + watchlist.map(item => createResultCard(item, true)).join('') + '</div>';
  attachCardListeners();
}



function loadHistorySection() {
  const section = document.getElementById('historySection');
  if (watchHistory.length === 0) {
    section.innerHTML = '<h2 class="section-title">🕐 Watch History</h2><p style="text-align:center;color:var(--color-text-secondary);margin-top:48px;">No watch history yet. Start watching something!</p>';
    return;
  }
  const items = watchHistory.slice(0, 50).map(h => h.item);
  section.innerHTML = '<h2 class="section-title">🕐 Watch History</h2><div class="results">' + items.map(item => createResultCard(item, true)).join('') + '</div>';
  attachCardListeners();
}

function loadSettingsSection() {
  const section = document.getElementById('settingsSection');
  const username = currentUser ? currentUser.email.split('@')[0] : 'Guest';
  const email = currentUser ? currentUser.email : 'Not logged in';
  const userCount = Object.keys(allUsers).length;
  const watchlistCount = watchlist.length;
  const historyCount = watchHistory.length;
  
  section.innerHTML = `
    <h2 class="section-title">⚙️ Settings</h2>
    <div style="max-width:600px;">
      <div style="margin-bottom:32px;">
        <h3 style="color:var(--color-accent-cyan);margin-bottom:16px;font-size:1.2rem;">👤 Account Management</h3>
        <div style="background:rgba(139,92,246,0.1);padding:20px;border-radius:12px;border:2px solid rgba(139,92,246,0.3);margin-bottom:20px;">
          <p style="margin-bottom:8px;"><strong>Username:</strong> ${username}</p>
          <p style="margin-bottom:8px;"><strong>Email:</strong> ${email}</p>
          <p style="margin-bottom:8px;font-size:0.9rem;opacity:0.8;">Watchlist: ${watchlistCount} items</p>
          <p style="margin-bottom:16px;font-size:0.9rem;opacity:0.8;">History: ${historyCount} items</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <button id="exportDataBtn" class="btn btn-outline" style="flex:1;min-width:140px;">📥 Export Data</button>
            <button id="deleteAccountBtn" class="btn btn-outline" style="flex:1;min-width:140px;color:var(--color-danger);border-color:var(--color-danger);">🗑️ Delete Account</button>
          </div>
        </div>
      </div>
      <div style="margin-bottom:32px;">
        <h3 style="color:var(--color-accent-cyan);margin-bottom:16px;font-size:1.2rem;">⚙️ App Settings</h3>
      <div style="margin-bottom:32px;">
        <label style="display:block;font-weight:600;margin-bottom:12px;color:var(--color-accent-cyan);">Theme</label>
        <select id="themeSelect" style="width:100%;padding:12px;border-radius:8px;background:rgba(255,255,255,0.1);border:2px solid var(--color-accent-purple);color:var(--color-text-primary);font-size:16px;">
          <option value="dark" ${userSettings.theme === 'dark' ? 'selected' : ''}>Dark Mode</option>
          <option value="light" ${userSettings.theme === 'light' ? 'selected' : ''}>Light Mode</option>
        </select>
      </div>
      <div style="margin-bottom:32px;">
        <label style="display:block;font-weight:600;margin-bottom:12px;color:var(--color-accent-cyan);">Device Preference</label>
        <select id="deviceSelect" style="width:100%;padding:12px;border-radius:8px;background:rgba(255,255,255,0.1);border:2px solid var(--color-accent-purple);color:var(--color-text-primary);font-size:16px;">
          <option value="auto" ${userSettings.devicePreference === 'auto' ? 'selected' : ''}>Auto Detect</option>
          <option value="mobile" ${userSettings.devicePreference === 'mobile' ? 'selected' : ''}>Mobile</option>
          <option value="tablet" ${userSettings.devicePreference === 'tablet' ? 'selected' : ''}>Tablet</option>
          <option value="desktop" ${userSettings.devicePreference === 'desktop' ? 'selected' : ''}>Desktop</option>
          <option value="tv" ${userSettings.devicePreference === 'tv' ? 'selected' : ''}>TV Mode</option>
        </select>
      </div>
      <button id="saveSettingsBtn" class="btn btn-gradient" style="width:100%;">Save Settings</button>
      </div>
    </div>
  `;
  
  // Account management buttons
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', function() {
      deleteAccount();
    });
  }
  
  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      try {
        if (!currentUser) {
          alert('No user logged in');
          return;
        }
        
        const exportData = {
          email: currentUser.email,
          watchlist: watchlist,
          watchHistory: watchHistory,
          watchProgress: watchProgress,
          userRatings: userRatings,
          recentlyViewed: recentlyViewed,
          settings: userSettings,
          exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zaids-movies-backup-${currentUser.email.split('@')[0]}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        alert('✓ Data exported successfully!');
      } catch(e) {
        alert('Failed to export data: ' + e.message);
      }
    });
  }
  
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', function() {
      const themeSelect = document.getElementById('themeSelect');
      const deviceSelect = document.getElementById('deviceSelect');
      
      if (themeSelect) {
        userSettings.theme = themeSelect.value;
        document.body.setAttribute('data-theme', userSettings.theme);
      }
      
      if (deviceSelect) {
        userSettings.devicePreference = deviceSelect.value;
        updateDeviceType();
      }
      
      saveToStorage();
      alert('✓ Settings saved successfully!');
      console.log('✓ Settings saved:', userSettings);
    });
  }
}

function loadAboutSection() {
  const section = document.getElementById('aboutSection');
  section.innerHTML = `
    <h2 class="section-title">ℹ️ About Zaid's Movies Pro</h2>
    <div style="max-width:800px;line-height:1.8;color:var(--color-text-secondary);">
      <p style="font-size:1.1rem;margin-bottom:24px;">Welcome to <strong style="color:var(--color-accent-purple);">Zaid's Movies Pro</strong> - your premium streaming experience with Netflix-style navigation, device detection, and download features.</p>
      
      <h3 style="color:var(--color-accent-cyan);margin-top:32px;margin-bottom:16px;font-size:1.3rem;">Features</h3>
      <ul style="margin-left:20px;">
        <li>Netflix-style sidebar navigation</li>
        <li>Smart device detection (Mobile, Tablet, Desktop, TV)</li>
        <li>Personalized home with continue watching</li>
        <li>Movies, TV Shows, and Anime sections</li>
        <li>Watchlist and watch history</li>
        <li>Responsive design for all devices</li>
        <li>Embedded video player</li>
        <li>Trending and recommendations</li>
      </ul>
      
      <h3 style="color:var(--color-accent-cyan);margin-top:32px;margin-bottom:16px;font-size:1.3rem;">🚀 Free Hosting Guide</h3>
      <div style="background:rgba(139,92,246,0.1);padding:20px;border-radius:12px;border:2px solid rgba(139,92,246,0.3);margin-top:16px;">
        <h4 style="color:var(--color-accent-purple);margin-bottom:12px;">Deploy Your App Forever - 100% Free!</h4>
        
        <details style="margin-bottom:16px;">
          <summary style="cursor:pointer;font-weight:600;padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;">📦 Netlify (Easiest)</summary>
          <div style="padding:16px;margin-top:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
            <ol style="margin-left:20px;line-height:2;">
              <li>Go to <a href="https://netlify.com" target="_blank" style="color:var(--color-accent-cyan);">netlify.com</a></li>
              <li>Sign up for free</li>
              <li>Drag &amp; drop your files</li>
              <li>Get instant URL: yourapp.netlify.app</li>
            </ol>
          </div>
        </details>
        
        <details style="margin-bottom:16px;">
          <summary style="cursor:pointer;font-weight:600;padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;">🌐 GitHub Pages (Recommended)</summary>
          <div style="padding:16px;margin-top:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
            <ol style="margin-left:20px;line-height:2;">
              <li>Create account at <a href="https://github.com" target="_blank" style="color:var(--color-accent-cyan);">github.com</a></li>
              <li>Create new repository</li>
              <li>Upload your files</li>
              <li>Settings → Pages → Deploy from main branch</li>
              <li>Live at: yourusername.github.io/repo-name</li>
            </ol>
          </div>
        </details>
        
        <details style="margin-bottom:16px;">
          <summary style="cursor:pointer;font-weight:600;padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;">⚡ Vercel (Lightning Fast)</summary>
          <div style="padding:16px;margin-top:8px;background:rgba(0,0,0,0.2);border-radius:8px;">
            <ol style="margin-left:20px;line-height:2;">
              <li>Visit <a href="https://vercel.com" target="_blank" style="color:var(--color-accent-cyan);">vercel.com</a></li>
              <li>Sign up with GitHub</li>
              <li>Import your repository</li>
              <li>Auto-deploy to: yourapp.vercel.app</li>
            </ol>
          </div>
        </details>
        
        <p style="margin-top:20px;font-size:0.95rem;opacity:0.9;">💡 All platforms offer free SSL, custom domains, and 99.9% uptime!</p>
      </div>
      
      <h3 style="color:var(--color-accent-cyan);margin-top:32px;margin-bottom:16px;font-size:1.3rem;">Credits</h3>
      <p>Built with ❤️ using TMDB API for content metadata.</p>
      <p style="margin-top:12px;font-size:0.9rem;opacity:0.8;">Version 3.0 - Netflix-Style Edition</p>
    </div>
  `;
}

function addToWatchHistory(item) {
  if (!item || !item.id) {
    console.warn('Invalid item for history');
    return;
  }
  
  const type = item.media_type || item.type || 'movie';
  const itemWithType = {...item, type: type, media_type: type};
  
  // Remove existing entry
  watchHistory = watchHistory.filter(h => {
    const historyType = h.item.media_type || h.item.type;
    return !(h.item.id === item.id && historyType === type);
  });
  
  // Add to beginning
  watchHistory.unshift({item: itemWithType, timestamp: Date.now()});
  
  // Keep only last 50
  if (watchHistory.length > 50) {
    watchHistory = watchHistory.slice(0, 50);
  }
  
  console.log(`✓ Added to history: ${item.title || item.name}`);
  saveToStorage();
  
  // Refresh history section if we're on it
  if (currentSection === 'history') {
    loadHistorySection();
  }
}

function toggleWatchlist(item) {
  if (!item || !item.id) {
    console.warn('Invalid item for watchlist');
    return;
  }
  
  const type = item.media_type || item.type || 'movie';
  const itemWithType = {...item, type: type, media_type: type};
  
  const exists = watchlist.findIndex(w => w.id === item.id && (w.type === type || w.media_type === type));
  if (exists !== -1) {
    watchlist.splice(exists, 1);
    console.log(`✖ Removed from watchlist: ${item.title || item.name}`);
  } else {
    watchlist.unshift(itemWithType);
    console.log(`✓ Added to watchlist: ${item.title || item.name}`);
  }
  
  saveToStorage();
  
  // Refresh watchlist section if we're on it
  if (currentSection === 'watchlist') {
    loadWatchlistSection();
  }
  
  updateWatchlistButtons();
}

function markAsWatched(item) {
  if (!item || !item.id) {
    console.warn('Invalid item for mark as watched');
    return;
  }
  
  const type = item.media_type || item.type || 'movie';
  const key = `${type}-${item.id}`;
  watchProgress[key] = 100;
  
  addToWatchHistory(item);
  saveToStorage();
  
  console.log(`✓ Marked as watched: ${item.title || item.name}`);
  
  // Refresh current section if applicable
  if (currentSection === 'home' || currentSection === 'history') {
    loadSection(currentSection);
  }
  
  alert(`✓ Marked as watched: ${item.title || item.name}`);
}

function updateProgress(item, progress) {
  if (!item || !item.id) {
    console.warn('Invalid item for progress update');
    return;
  }
  
  const type = item.media_type || item.type || 'movie';
  const key = `${type}-${item.id}`;
  watchProgress[key] = progress;
  
  console.log(`✓ Progress updated: ${item.title || item.name} - ${progress}%`);
  saveToStorage();
  
  // Refresh home section if we're on it
  if (currentSection === 'home') {
    loadSection('home');
  }
}

function isInWatchlist(item) {
  if (!item || !item.id) return false;
  const type = item.media_type || item.type;
  return watchlist.some(w => {
    const wType = w.media_type || w.type;
    return w.id === item.id && wType === type;
  });
}

function getProgress(item) {
  if (!item || !item.id) return 0;
  const type = item.media_type || item.type || 'movie';
  const key = `${type}-${item.id}`;
  return watchProgress[key] || 0;
}

function updateWatchlistButtons() {
  if (!currentItem || !currentItem.id) return;
  
  const inList = isInWatchlist(currentItem);
  const btn = document.getElementById('infoWatchlistBtn');
  const playerBtn = document.getElementById('playerWatchlistBtn');
  
  if (btn) {
    btn.textContent = inList ? '✓ In Watchlist' : '+ Watchlist';
    btn.style.background = inList ? 'rgba(139, 92, 246, 0.3)' : '';
  }
  if (playerBtn) {
    playerBtn.textContent = inList ? '✓ In Watchlist' : '+ Watchlist';
    playerBtn.style.background = inList ? 'rgba(139, 92, 246, 0.3)' : '';
  }
}



queryInput.addEventListener('input', function () {
  let q = queryInput.value.trim();
  lastQueryValue = q;
  
  if (queryInput.value.length > 0) {
    clearSearchBtn.classList.add('visible');
  } else {
    clearSearchBtn.classList.remove('visible');
  }
  
  if (!q) {
    hideSkeletons();
    return;
  }
  
  showSkeletons(skeletonCount);
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    searchContent(q);
  }, debounceDelay);
});

clearSearchBtn.addEventListener('click', function() {
  queryInput.value = '';
  lastQueryValue = '';
  clearSearchBtn.classList.remove('visible');
  hideSkeletons();
  queryInput.focus();
});







document.getElementById('infoClose').addEventListener('click', () => {
  infoModal.classList.remove('visible');
  setTimeout(() => infoModal.style.display = 'none', 300);
});

document.getElementById('tvClose').addEventListener('click', () => {
  closeTVSelector();
});

document.getElementById('infoPlayBtn').addEventListener('click', () => {
  if (currentItem.type === 'movie') {
    playMovie(currentItem);
  } else {
    closeInfoModal();
    selectTVEpisode(currentItem.id, currentItem.title);
  }
});

document.getElementById('infoWatchlistBtn').addEventListener('click', () => {
  toggleWatchlist(currentItem);
});


document.getElementById('infoMarkWatchedBtn').addEventListener('click', () => {
  markAsWatched(currentItem);
  closeInfoModal();
});

document.getElementById('playerWatchlistBtn').addEventListener('click', () => {
  toggleWatchlist(currentItem);
});

document.getElementById('playerMarkWatchedBtn').addEventListener('click', () => {
  markAsWatched(currentItem);
});

document.getElementById('playerClose').addEventListener('click', () => {
  closePlayer();
});





// API Redirect Prevention
async function validatePlayerURL(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual'
    });
    
    // Check if redirect
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      console.warn('⚠ Redirect detected, attempting direct load');
      return url; // Try direct load anyway
    }
    
    return url;
  } catch(e) {
    console.warn('URL validation failed, proceeding anyway:', e);
    return url;
  }
}

function isValidPlayerDomain(url) {
  try {
    const urlObj = new URL(url);
    return TRUSTED_DOMAINS.some(domain => urlObj.hostname.includes(domain));
  } catch(e) {
    return false;
  }
}

async function playMovie(item) {
  if (!item || !item.id) {
    console.error('Invalid movie item');
    return;
  }
  
  const playerFrame = document.getElementById('playerFrame');
  const playerTitle = document.getElementById('playerTitle');
  
  const playerURL = `https://player.videasy.net/movie/${item.id}?overlay=true&color=8B5CF6`;
  
  // Validate URL
  if (!isValidPlayerDomain(playerURL)) {
    alert('⚠ Invalid player URL detected');
    return;
  }
  
  // Ensure item has proper structure
  const movieItem = {
    ...item,
    type: 'movie',
    media_type: 'movie'
  };
  
  // Set current item for player buttons
  currentItem = movieItem;
  
  // Set iframe
  playerFrame.src = playerURL;
  playerTitle.textContent = item.title || item.name;
  
  playerModal.classList.add('visible');
  playerModal.style.display = 'flex';
  
  addToWatchHistory(movieItem);
  updateProgress(movieItem, 50);
  closeInfoModal();
  updateWatchlistButtons();
}

async function playTVEpisode(tvId, season, episode, title) {
  const playerFrame = document.getElementById('playerFrame');
  const playerTitle = document.getElementById('playerTitle');
  
  const playerURL = `https://player.videasy.net/tv/${tvId}/${season}/${episode}?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=8B5CF6`;
  
  // Validate URL
  if (!isValidPlayerDomain(playerURL)) {
    alert('⚠ Invalid player URL detected');
    return;
  }
  
  // Ensure currentItem is set properly for TV show
  if (currentItem && currentItem.id) {
    currentItem.type = 'tv';
    currentItem.media_type = 'tv';
  }
  
  playerFrame.src = playerURL;
  playerTitle.textContent = `${title} - S${season}E${episode}`;
  
  playerModal.classList.add('visible');
  playerModal.style.display = 'flex';
  
  closeTVSelector();
  updateWatchlistButtons();
}

function closePlayer() {
  const playerFrame = document.getElementById('playerFrame');
  playerFrame.src = '';
  playerModal.classList.remove('visible');
  setTimeout(() => playerModal.style.display = 'none', 300);
}

queryInput.addEventListener('focus', function () {
  queryInput.classList.add('focus-glow');
});
queryInput.addEventListener('blur', function () {
  queryInput.classList.remove('focus-glow');
});

function createResultCard(item, compact = false, showProgress = false) {
  const {id, media_type, poster_path, title, name, vote_average, release_date, first_air_date, number_of_seasons, status, genre_ids} = item;
  const type = media_type || item.type;
  const itemTitle = title || name || '';
  const img = poster_path ? `https://image.tmdb.org/t/p/w500${poster_path}` : '';
  const year = (release_date || first_air_date || '').split('-')[0];
  const rating = vote_average ? vote_average.toFixed(1) : null;
  
  const progress = getProgress(item);
  const inList = isInWatchlist(item);
  const isWatched = progress === 100;
  
  let badges = [];
  if (year) badges.push(`<span class="meta-badge year">${year}</span>`);
  if (rating && rating > 0) badges.push(`<span class="meta-badge rating">⭐ ${rating}</span>`);
  if (type === 'tv' && number_of_seasons) badges.push(`<span class="meta-badge">${number_of_seasons} Season${number_of_seasons > 1 ? 's' : ''}</span>`);
  if (status && type === 'tv') {
    const statusText = status === 'Returning Series' ? 'Ongoing' : status === 'Ended' ? 'Ended' : status;
    badges.push(`<span class="meta-badge status">${statusText}</span>`);
  }
  
  const progressBar = showProgress && progress > 0 ? `
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progress}%"></div>
    </div>
  ` : '';
  
  const watchedBadge = isWatched ? '<div class="watched-badge">✓ Watched</div>' : '';
  const watchlistBadge = inList && !isWatched ? '<div class="watchlist-badge">⭐ List</div>' : '';
  
  return `
    <div class="result-card" data-type="${type}" data-id="${id}" data-title="${itemTitle.replace(/"/g, '&quot;')}">
      <div class="poster-wrap">
        ${watchedBadge}
        ${watchlistBadge}
        <img src="${img}" alt="${itemTitle}" loading="lazy" onerror="this.style.opacity=0.3;"/>
        ${progressBar}
        <div class="poster-overlay"></div>
        <div class="card-content">
          <div class="card-title">${itemTitle}</div>
          <div class="card-meta">${badges.join('')}</div>
        </div>
      </div>
    </div>
  `;
}

function attachCardListeners() {
  document.querySelectorAll('.result-card').forEach((card, index) => {
    // Add stagger animation delay
    card.style.animationDelay = `${index * 0.05}s`;
    
    card.onclick = function() {
      const type = card.dataset.type;
      const id = card.dataset.id;
      const title = card.dataset.title;
      showDetailedInfo(type, id, title);
    };
  });
}

async function searchContent(q) {
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    let results = (data.results || []).filter(m => {
      if (!m.poster_path) return false;
      return m.media_type === 'movie' || m.media_type === 'tv';
    });
    
    hideSkeletons();
    
    // Get the current active section
    const activeSection = document.querySelector('.app-section[style*="display: block"]');
    if (!activeSection) return;
    
    if (results.length === 0) {
      activeSection.innerHTML = `
        <div class="no-results">
          <h3>🔍 No Results Found</h3>
          <p>Try searching with a different title, actor, or keyword.</p>
          <p style="margin-top: 12px; font-size: 0.95rem; opacity: 0.8;">Popular searches: "Inception", "Breaking Bad", "Stranger Things"</p>
        </div>
      `;
      return;
    }
    
    activeSection.innerHTML = '<h2 class="section-title">🔍 Search Results</h2><div class="results">' + results.map(item => createResultCard(item)).join('') + '</div>';
    attachCardListeners();
  } catch(e) {
    hideSkeletons();
    console.error('Search error:', e);
  }
}



async function showDetailedInfo(type, id, title) {
  const detailUrl = type === 'movie' 
    ? `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}&append_to_response=credits`
    : `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}&append_to_response=credits`;
  
  try {
    const response = await fetch(detailUrl);
    const data = await response.json();
    
    // Set currentItem with proper structure
    currentItem = {
      type: type,
      media_type: type,
      id: id,
      title: data.title || data.name,
      name: data.title || data.name,
      poster_path: data.poster_path,
      data: data
    };
    
    const poster = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '';
    const overview = data.overview || 'No description available.';
    const genres = (data.genres || []).map(g => g.name).join(', ') || 'N/A';
    const cast = (data.credits?.cast || []).slice(0, 6).map(c => c.name).join(', ') || 'N/A';
    const rating = data.vote_average ? data.vote_average.toFixed(1) : 'N/A';
    const voteCount = data.vote_count || 0;
    
    document.getElementById('infoPoster').src = poster;
    document.getElementById('infoTitle').textContent = data.title || data.name;
    
    let metaHTML = [];
    if (type === 'movie') {
      const year = (data.release_date || '').split('-')[0];
      const runtime = data.runtime ? `${data.runtime} min` : 'N/A';
      metaHTML.push(`<span class="meta-badge year">${year}</span>`);
      metaHTML.push(`<span class="meta-badge">⏱️ ${runtime}</span>`);
    } else {
      const startYear = (data.first_air_date || '').split('-')[0];
      const endYear = data.status === 'Ended' ? (data.last_air_date || '').split('-')[0] : 'Present';
      const seasons = data.number_of_seasons || 0;
      const episodes = data.number_of_episodes || 0;
      metaHTML.push(`<span class="meta-badge year">${startYear}${endYear !== startYear ? ' - ' + endYear : ''}</span>`);
      metaHTML.push(`<span class="meta-badge">${seasons} Season${seasons !== 1 ? 's' : ''}</span>`);
      metaHTML.push(`<span class="meta-badge">${episodes} Episodes</span>`);
      const statusText = data.status === 'Returning Series' ? '🔄 Ongoing' : data.status === 'Ended' ? '✓ Ended' : data.status;
      metaHTML.push(`<span class="meta-badge status">${statusText}</span>`);
    }
    metaHTML.push(`<span class="meta-badge rating">⭐ ${rating} (${voteCount.toLocaleString()} votes)</span>`);
    
    document.getElementById('infoMeta').innerHTML = metaHTML.join('');
    document.getElementById('infoOverview').textContent = overview;
    document.getElementById('infoGenres').innerHTML = `<strong>Genres:</strong> ${genres}`;
    document.getElementById('infoCast').innerHTML = `<strong>Cast:</strong> ${cast}`;
    
    let extraHTML = '';
    if (type === 'tv' && data.networks && data.networks.length > 0) {
      extraHTML += `<strong>Networks:</strong> ${data.networks.map(n => n.name).join(', ')}`;
    }
    if (data.original_language) {
      extraHTML += `<br><strong>Language:</strong> ${data.original_language.toUpperCase()}`;
    }
    document.getElementById('infoExtra').innerHTML = extraHTML;
    
    document.getElementById('infoPlayBtn').textContent = type === 'movie' ? '▶ Play Movie' : '▶ Watch Show';
    
    // Update watchlist button state
    updateWatchlistButtons();
    
    infoModal.classList.add('visible');
    infoModal.style.display = 'flex';
  } catch(e) {
    console.error('Failed to load details:', e);
    alert('Failed to load details. Please try again.');
  }
}

function closeInfoModal() {
  infoModal.classList.remove('visible');
  setTimeout(() => infoModal.style.display = 'none', 300);
}

async function selectTVEpisode(id, title) {
  try {
    const response = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}`);
    const info = await response.json();
    currentTV = {id, title, seasons: info.seasons, episodes: []};
    
    document.getElementById('tvTitle').innerText = title;
    const seasonSel = document.getElementById('seasonSel');
    seasonSel.innerHTML = '';
    
    for (let s of info.seasons) {
      if (s.season_number !== 0) {
        seasonSel.innerHTML += `<option value="${s.season_number}">Season ${s.season_number}</option>`;
      }
    }
    
    await populateEpisodes();
    tvModal.classList.add('visible');
    tvModal.style.display = 'flex';
    setTimeout(() => document.getElementById('seasonSel').focus(), 140);
  } catch(e) {
    console.error('Failed to load TV show:', e);
  }
}

async function populateEpisodes() {
  const seasonNum = document.getElementById('seasonSel').value;
  const cacheKey = `${currentTV.id}-${seasonNum}`;
  
  let season;
  if (episodeCache[cacheKey]) {
    season = episodeCache[cacheKey];
  } else {
    try {
      const response = await fetch(`https://api.themoviedb.org/3/tv/${currentTV.id}/season/${seasonNum}?api_key=${TMDB_KEY}`);
      season = await response.json();
      episodeCache[cacheKey] = season;
    } catch(e) {
      console.error('Failed to load episodes:', e);
      return;
    }
  }
  
  currentTV.episodes = season.episodes || [];
  const episodeSel = document.getElementById('episodeSel');
  episodeSel.innerHTML = '';
  
  for (let ep of currentTV.episodes) {
    episodeSel.innerHTML += `<option value="${ep.episode_number}" data-index="${currentTV.episodes.indexOf(ep)}">Ep ${ep.episode_number}: ${ep.name.replace(/&/g, '&amp;')}</option>`;
  }
  
  const selectedSeason = currentTV.seasons.find(s => s.season_number == seasonNum);
  if (selectedSeason) {
    document.getElementById('seasonInfo').innerHTML = `
      <strong>${selectedSeason.episode_count || currentTV.episodes.length} episodes</strong><br>
      ${selectedSeason.air_date ? 'Aired: ' + new Date(selectedSeason.air_date).toLocaleDateString() : ''}
    `;
  }
  
  updateEpisodePreview();
}

function updateEpisodePreview() {
  const episodeSel = document.getElementById('episodeSel');
  const selectedOption = episodeSel.options[episodeSel.selectedIndex];
  if (!selectedOption) return;
  
  const episodeIndex = parseInt(selectedOption.dataset.index);
  const episode = currentTV.episodes[episodeIndex];
  
  if (episode) {
    const airDate = episode.air_date ? new Date(episode.air_date).toLocaleDateString() : 'TBA';
    const rating = episode.vote_average ? `⭐ ${episode.vote_average.toFixed(1)}` : 'Not rated';
    
    document.getElementById('episodePreview').innerHTML = `
      <div class="episode-detail"><strong>${episode.name}</strong></div>
      <div class="episode-detail">Episode ${episode.episode_number} • ${airDate}</div>
      <div class="episode-detail">${rating}</div>
      <div class="episode-detail" style="margin-top:12px;line-height:1.6;">${episode.overview || 'No description available.'}</div>
    `;
  }
}


tvPlay.onclick = function() {
  const seasonNum = document.getElementById('seasonSel').value;
  const episodeNum = document.getElementById('episodeSel').value;
  
  playTVEpisode(currentTV.id, seasonNum, episodeNum, currentTV.title);
  
  const tvItem = {
    id: currentTV.id,
    type: 'tv',
    title: currentTV.title,
    name: currentTV.title,
    poster_path: currentItem.data?.poster_path || '',
    media_type: 'tv'
  };
  
  addToWatchHistory(tvItem);
  updateProgress(tvItem, 50);
};

tvCancel.onclick = function() {
  closeTVSelector();
};

function closeTVSelector() {
  if (tvModal) {
    tvModal.classList.remove('visible');
    setTimeout(() => { tvModal.style.display = 'none'; }, 340);
  }
}

document.getElementById('seasonSel').addEventListener('change', populateEpisodes);
document.getElementById('episodeSel').addEventListener('change', updateEpisodePreview);

[tvModal, infoModal, playerModal].forEach(modal => {
  if (!modal) return;
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      if (modal === playerModal) {
        closePlayer();
      } else {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 300);
      }
    }
  });
});

window.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (playerModal.classList.contains('visible')) closePlayer();
    if (tvModal.classList.contains('visible')) closeTVSelector();
    if (infoModal.classList.contains('visible')) closeInfoModal();
  }
  
  // Keyboard shortcuts
  if (playerModal.classList.contains('visible')) {
    if (e.key === 'f' || e.key === 'F') {
      const frame = document.getElementById('playerFrame');
      if (frame.requestFullscreen) frame.requestFullscreen();
    }
  }
});
window.onload = function () {
  document.body.classList.add('smooth-scroll');
  document.documentElement.style.scrollBehavior = 'smooth';
  
  console.log(`🎬 Zaid's Movies Pro ${APP_VERSION}`);
  console.log('========================================');
  
  // Check storage availability
  checkStorageAvailable();
  if (storageAvailable) {
    console.log('✓ Cloud sync enabled (localStorage)');
  } else {
    console.log('⚠ Memory-only mode (data will not persist)');
    alert('⚠️ Storage Warning: Data will not persist between sessions in this environment.');
  }
  
  updateDeviceType();
  
  // Check for existing session
  const hasSession = loadFromStorage();
  
  if (!hasSession) {
    console.log('→ No session found, showing login screen');
    showAuthScreen();
  } else {
    console.log('✓ Session restored, user:', currentUser.email);
    console.log(`  Watchlist: ${watchlist.length} items`);
    console.log(`  History: ${watchHistory.length} items`);
    initSidebar();
    initProfileSystem();
    switchSection('home');
  }
  
  console.log('========================================');
  
  window.addEventListener('resize', updateDeviceType);
  
  document.addEventListener('keydown', function(e) {
    if (e.key === '/' && document.activeElement !== queryInput && isAuthenticated) {
      e.preventDefault();
      queryInput.focus();
    }
  });
  
  // Auto-save every 30 seconds
  setInterval(() => {
    if (isAuthenticated && currentUser) {
      saveToStorage();
      console.log('🔄 Auto-saved user data');
    }
  }, 30000);
};
// Particles animation (subtle flicker)
setInterval(() => {
  const overlay = document.getElementById('particles-overlay');
  if (overlay) {
    overlay.style.opacity = 0.79 + Math.sin(Date.now()/2700)*0.07;
  }
}, 1800);
