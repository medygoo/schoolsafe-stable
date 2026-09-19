/* Visual behaviour only. Authentication and form values are owned by app.js. */
(function () {
  'use strict';
  window.SchoolSafeAuthPresence = {
    bind: function (screen, form) {
      var typing = false;
      var withdrawn = false;
      var entryEngaged = false;
      var pointerPending = false;
      var releaseTimer = 0;
      var touchPresentation = window.matchMedia('(pointer: coarse)').matches;
      var viewport = window.visualViewport;
      function isPhone() {
        if (window.SchoolSafeAuthLayouts && window.SchoolSafeAuthLayouts.isPhone) {
          return window.SchoolSafeAuthLayouts.isPhone();
        }
        var coarse = touchPresentation || window.matchMedia('(pointer: coarse)').matches;
        return window.innerWidth <= 760 || (coarse && window.innerHeight <= 500);
      }
      function isDockedPhone() {
        return screen && screen.dataset.loginLayout === 'welcome' && isPhone();
      }
      function isPresentationContact(event) {
        // The home button resets the presentation after its own click handler.
        return isPhone() && !event.target.closest('#backToSplash');
      }
      function update() {
        if (!screen || !form) return;
        var wasWithdrawn = withdrawn;
        var phone = isPhone();
        screen.dataset.authDevice = phone ? 'phone' : 'wide';
        if (phone) {
          // Both phone layouts release their space as soon as entry begins.
          // Keep it free across focus gaps, buttons and keyboard changes.
          if (typing && !pointerPending) entryEngaged = true;
          withdrawn = entryEngaged;
        } else withdrawn = false;
        screen.classList.toggle('auth-is-typing', typing);
        screen.classList.toggle('auth-jaspe-withdrawn', withdrawn);
        screen.dataset.authView = typing || (phone && entryEngaged) ? 'entry' : 'presentation';
        // On a phone the visual viewport follows the keyboard. Preserve zoom,
        // and let the auth screen scroll when the remaining height is short.
        if (screen.style) {
          if (phone && withdrawn && viewport && (!viewport.scale || viewport.scale === 1)) {
            screen.style.setProperty('--auth-viewport-height', viewport.height + 'px');
          } else screen.style.removeProperty('--auth-viewport-height');
        }
        if (withdrawn && !wasWithdrawn) screen.scrollTop = 0;
      }
      function releasePointer() {
        window.clearTimeout(releaseTimer);
        pointerPending = false;
        update();
      }
      if (screen) {
        screen.addEventListener('pointerdown', function (event) {
          if (event.button !== 0 || event.isPrimary === false || !isPresentationContact(event)) return;
          window.clearTimeout(releaseTimer);
          pointerPending = true;
        }, true);
        screen.addEventListener('click', function (event) {
          if (!isPresentationContact(event)) return;
          // Bubble after the target's handler: never move Email/Phone or the
          // input underneath the finger between pointerdown and click.
          if (isDockedPhone() || typing) entryEngaged = true;
          releasePointer();
        });
      }
      window.addEventListener('pointerup', function () {
        if (pointerPending) releaseTimer = window.setTimeout(releasePointer, 0);
      });
      window.addEventListener('pointercancel', releasePointer);
      window.addEventListener('resize', update);
      if (viewport) viewport.addEventListener('resize', update);
      return {
        setTyping: function (value) { typing = !!value; update(); },
        reset: function () {
          typing = false;
          entryEngaged = false;
          withdrawn = false;
          releasePointer();
        }
      };
    }
  };
})();
