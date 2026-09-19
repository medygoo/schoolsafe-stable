/* Phone-only alternation. One presentation per opening, no form/session data. */
(function () {
  'use strict';
  var selected = null;
  var phone = null;
  var committed = false;
  var storageKey = 'ss-login-mobile-layout-last';
  var preview = new URLSearchParams(window.location.search).get('loginModel');
  var names = { '1': 'companion', '2': 'welcome' };
  function isPhone() {
    if (phone === null) {
      // Preserve the physical phone decision across rotation and keyboard changes.
      var size = window.screen || {};
      var shortSide = Math.min(size.width || window.innerWidth, size.height || window.innerHeight);
      phone = window.matchMedia('(any-pointer: coarse)').matches && shortSide <= 600;
    }
    // A narrow desktop/browser preview uses the mobile CSS too. Its interactions
    // must match that presentation instead of leaving a non-withdrawing bust.
    return phone || window.innerWidth <= 760;
  }
  function choose() {
    if (!selected) {
      if (!isPhone()) selected = '2';
      else if (preview === '1' || preview === '2') selected = preview;
      else {
        var last;
        try { last = window.localStorage.getItem(storageKey); } catch (_) {}
        selected = last === '1' ? '2' : '1';
      }
    }
    return names[selected];
  }
  window.SchoolSafeAuthLayouts = {
    isPhone: isPhone,
    getLayout: choose,
    enter: function (screen) {
      if (!screen) return;
      screen.dataset.loginLayout = choose();
      if (isPhone() && !committed && preview !== '1' && preview !== '2') {
        try { window.localStorage.setItem(storageKey, selected); } catch (_) {}
      }
      committed = true;
    }
  };
})();
