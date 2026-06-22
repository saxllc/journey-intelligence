/* ═══════════════════════════════════════════════════════════
   SAX Phone Mock — shared behavior component
   Host: applicationator.vercel.app/shared/sax-phone.js
   Usage: <script src="https://applicationator.vercel.app/shared/sax-phone.js"></script>

   Auto-initializes all elements with class="sax-phone".
   Features:
     - iPhone 15 Pro frame (Dynamic Island, status bar, home indicator)
     - Light theme default, dark mode toggle in status bar
     - Content scrolls independently of page
     - Tap anywhere on phone → fullscreen modal (move, not clone)
     - ESC key or ✕ button to exit fullscreen
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Shared modal overlay (one per page) ──────────────────
  var modalOverlay = null;
  var modalClose = null;
  var modalEsc = null;
  var activePhone = null;   // the phone currently in the modal
  var placeholder = null;   // holds the phone's spot in the DOM

  function ensureModal() {
    if (modalOverlay) return;

    modalOverlay = document.createElement('div');
    modalOverlay.className = 'sax-phone-modal-overlay';

    modalClose = document.createElement('button');
    modalClose.className = 'sax-phone-modal-close';
    modalClose.innerHTML = '&#215;';
    modalClose.setAttribute('aria-label', 'Close fullscreen');
    modalClose.addEventListener('click', closeModal);

    modalEsc = document.createElement('div');
    modalEsc.className = 'sax-phone-modal-esc';
    modalEsc.textContent = 'Press ESC to close';

    modalOverlay.appendChild(modalClose);
    modalOverlay.appendChild(modalEsc);
    document.body.appendChild(modalOverlay);

    // Click backdrop to close
    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) closeModal();
    });

    // ESC key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalOverlay.classList.contains('open')) {
        closeModal();
      }
    });
  }

  function openModal(phone) {
    ensureModal();

    // Insert placeholder to hold position in DOM
    placeholder = document.createElement('div');
    placeholder.className = 'sax-phone-placeholder';
    placeholder.style.width = phone.offsetWidth + 'px';
    placeholder.style.height = phone.offsetHeight + 'px';
    phone.parentNode.insertBefore(placeholder, phone);

    // Move phone into modal (not clone — preserves all event listeners and state)
    activePhone = phone;
    activePhone.classList.add('sax-phone-modal-instance');
    modalOverlay.insertBefore(activePhone, modalClose);

    // Hide tap hint in modal
    var hint = activePhone.querySelector('.sax-phone-tap-hint');
    if (hint) hint.style.display = 'none';

    // Show
    requestAnimationFrame(function () {
      modalOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  }

  function closeModal() {
    if (!modalOverlay || !activePhone) return;
    modalOverlay.classList.remove('open');
    document.body.style.overflow = '';

    // Move phone back to its original position after transition
    var phone = activePhone;
    var ph = placeholder;
    setTimeout(function () {
      if (phone && ph && ph.parentNode) {
        phone.classList.remove('sax-phone-modal-instance');
        ph.parentNode.insertBefore(phone, ph);
        ph.parentNode.removeChild(ph);
        // Restore tap hint
        var hint = phone.querySelector('.sax-phone-tap-hint');
        if (hint) hint.style.display = '';
      }
      activePhone = null;
      placeholder = null;
    }, 300);
  }


  // ── Add tap-to-fullscreen behavior to any element ────────
  function addModalBehavior(el) {
    // Tap hint
    var tapHint = document.createElement('div');
    tapHint.className = 'sax-phone-tap-hint';
    tapHint.textContent = 'Tap to open fullscreen';
    el.appendChild(tapHint);

    // Tap to fullscreen — skip interactive elements
    el.addEventListener('click', function (e) {
      if (el.classList.contains('sax-phone-modal-instance')) return;
      var target = e.target;
      var tag = target.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input' ||
          tag === 'select' || tag === 'textarea' || tag === 'label' ||
          target.classList.contains('sax-phone-mode-toggle') ||
          target.classList.contains('mode-toggle') ||
          target.classList.contains('chip') ||
          target.hasAttribute('onclick') ||
          target.closest('button') || target.closest('a') ||
          target.closest('[onclick]') ||
          target.closest('input') || target.closest('select')) {
        return;
      }
      openModal(el);
    });
  }

  // ── Initialize a single phone element ────────────────────
  function initPhone(el) {
    // Skip if already initialized
    if (el.getAttribute('data-sax-init')) return;
    el.setAttribute('data-sax-init', 'true');

    // Default to light theme
    if (!el.getAttribute('data-theme')) {
      el.setAttribute('data-theme', 'light');
    }

    // MANUAL MODE: phone already has its own frame structure.
    // Only add tap-to-fullscreen modal behavior + scroll isolation.
    if (el.hasAttribute('data-sax-manual')) {
      addModalBehavior(el);
      // Scroll isolation on first scrollable child
      var scrollable = el.querySelector('.iphone-screen, .sax-phone-content, [class*="screen"]');
      if (scrollable) {
        scrollable.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
        scrollable.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
      }
      return;
    }

    // FULL MODE: build the phone frame from scratch.
    // Grab user's content
    var contentEl = el.querySelector('.sax-phone-content');
    if (!contentEl) {
      contentEl = document.createElement('div');
      contentEl.className = 'sax-phone-content';
      while (el.firstChild) {
        contentEl.appendChild(el.firstChild);
      }
    } else {
      el.removeChild(contentEl);
    }

    // Build phone internals
    var screen = document.createElement('div');
    screen.className = 'sax-phone-screen';

    // Dynamic Island
    var island = document.createElement('div');
    island.className = 'sax-phone-island';
    var cam = document.createElement('div');
    cam.className = 'sax-phone-island-cam';
    island.appendChild(cam);

    // Status bar
    var statusbar = document.createElement('div');
    statusbar.className = 'sax-phone-statusbar';

    var time = document.createElement('span');
    time.className = 'sax-phone-statusbar-time';
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    time.textContent = (h > 12 ? h - 12 : h || 12) + ':' + (m < 10 ? '0' : '') + m;

    var icons = document.createElement('span');
    icons.className = 'sax-phone-statusbar-icons';

    // Mode toggle
    var modeBtn = document.createElement('button');
    modeBtn.className = 'sax-phone-mode-toggle';
    modeBtn.textContent = el.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
    modeBtn.setAttribute('aria-label', 'Toggle dark/light mode');
    modeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var current = el.getAttribute('data-theme') || 'light';
      var next = current === 'light' ? 'dark' : 'light';
      el.setAttribute('data-theme', next);
      this.textContent = next === 'dark' ? '☀️' : '🌙';
    });

    icons.appendChild(modeBtn);
    icons.appendChild(document.createTextNode(' 📶 🔋'));

    statusbar.appendChild(time);
    statusbar.appendChild(icons);

    // Home indicator
    var home = document.createElement('div');
    home.className = 'sax-phone-home';
    var homeBar = document.createElement('span');
    home.appendChild(homeBar);

    // Assemble
    screen.appendChild(island);
    screen.appendChild(statusbar);
    screen.appendChild(contentEl);
    screen.appendChild(home);

    el.appendChild(screen);

    // Scroll isolation
    contentEl.addEventListener('wheel', function (e) {
      var atTop = contentEl.scrollTop === 0;
      var atBottom = contentEl.scrollTop + contentEl.clientHeight >= contentEl.scrollHeight - 1;
      if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
        return;
      }
      e.stopPropagation();
    }, { passive: true });

    contentEl.addEventListener('touchmove', function (e) {
      e.stopPropagation();
    }, { passive: true });

    addModalBehavior(el);
  }


  // ── Auto-init on DOM ready ───────────────────────────────
  function initAll() {
    var phones = document.querySelectorAll('.sax-phone');
    for (var i = 0; i < phones.length; i++) {
      initPhone(phones[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Expose for dynamic content
  window.saxPhoneInit = initPhone;
  window.saxPhoneInitAll = initAll;

})();
