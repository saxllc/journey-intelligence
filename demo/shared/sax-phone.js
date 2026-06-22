/* ═══════════════════════════════════════════════════════════
   SAX Phone Mock — shared behavior component
   Host: applicationator.vercel.app/shared/sax-phone.js
   Usage: <script src="https://applicationator.vercel.app/shared/sax-phone.js"></script>

   Auto-initializes all elements with class="sax-phone".
   Features:
     - iPhone 15 Pro frame (Dynamic Island, status bar, home indicator)
     - Light theme default, dark mode toggle in status bar
     - Content scrolls independently of page
     - Tap anywhere on phone → fullscreen modal
     - ESC key or ✕ button to exit fullscreen
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Shared modal overlay (one per page) ──────────────────
  let modalOverlay = null;
  let modalClose = null;
  let modalEsc = null;
  let activePhone = null;  // the phone clone currently in the modal
  let sourcePhone = null;  // the inline phone that was tapped

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
    sourcePhone = phone;

    // Clone the phone's inner screen content
    var clone = phone.cloneNode(true);
    clone.classList.add('sax-phone-modal-instance');

    // Remove tap hint from clone
    var hint = clone.querySelector('.sax-phone-tap-hint');
    if (hint) hint.remove();

    // Remove pointer cursor on modal phone
    clone.style.cursor = 'default';

    // Make the mode toggle work on the clone
    var toggle = clone.querySelector('.sax-phone-mode-toggle');
    if (toggle) {
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var current = clone.getAttribute('data-theme') || 'light';
        var next = current === 'light' ? 'dark' : 'light';
        clone.setAttribute('data-theme', next);
        this.textContent = next === 'dark' ? '☀️' : '🌙';
        // Sync back to source
        sourcePhone.setAttribute('data-theme', next);
        var srcToggle = sourcePhone.querySelector('.sax-phone-mode-toggle');
        if (srcToggle) srcToggle.textContent = this.textContent;
      });
    }

    // Don't close modal when clicking inside the phone
    clone.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    activePhone = clone;
    modalOverlay.insertBefore(clone, modalClose);

    // Show
    requestAnimationFrame(function () {
      modalOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  }

  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove('open');
    document.body.style.overflow = '';

    // Clean up clone after transition
    setTimeout(function () {
      if (activePhone && activePhone.parentNode) {
        activePhone.parentNode.removeChild(activePhone);
      }
      activePhone = null;
      sourcePhone = null;
    }, 300);
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

    // Grab user's content
    var contentEl = el.querySelector('.sax-phone-content');
    if (!contentEl) {
      // Wrap all children as content
      contentEl = document.createElement('div');
      contentEl.className = 'sax-phone-content';
      while (el.firstChild) {
        contentEl.appendChild(el.firstChild);
      }
    } else {
      // Detach it temporarily
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

    // Tap hint
    var tapHint = document.createElement('div');
    tapHint.className = 'sax-phone-tap-hint';
    tapHint.textContent = 'Tap to open fullscreen';

    // Assemble
    screen.appendChild(island);
    screen.appendChild(statusbar);
    screen.appendChild(contentEl);
    screen.appendChild(home);

    el.appendChild(screen);
    el.appendChild(tapHint);

    // Scroll isolation: prevent page scroll when scrolling inside phone
    contentEl.addEventListener('wheel', function (e) {
      var atTop = contentEl.scrollTop === 0;
      var atBottom = contentEl.scrollTop + contentEl.clientHeight >= contentEl.scrollHeight - 1;
      if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
        // Allow page scroll only at bounds
        return;
      }
      e.stopPropagation();
    }, { passive: true });

    // Touch scroll isolation
    var touchStartY = 0;
    contentEl.addEventListener('touchstart', function (e) {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    contentEl.addEventListener('touchmove', function (e) {
      e.stopPropagation();
    }, { passive: true });

    // Tap to fullscreen — only if not clicking interactive elements
    el.addEventListener('click', function (e) {
      // Don't open modal if clicking buttons, links, inputs, selects, toggles
      var target = e.target;
      var tag = target.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input' ||
          tag === 'select' || tag === 'textarea' || tag === 'label' ||
          target.classList.contains('sax-phone-mode-toggle') ||
          target.closest('button') || target.closest('a') ||
          target.closest('input') || target.closest('select')) {
        return;
      }
      openModal(el);
    });
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
