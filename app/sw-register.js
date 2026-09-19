(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) {
    console.info("[SW] Service worker unavailable in this browser");
    return;
  }

  window.SchoolSafePwaRegistration = navigator.serviceWorker
    .register("./sw.js")
    .then(function (registration) {
      window.dispatchEvent(
        new CustomEvent("schoolsafe:pwa-ready", {
          detail: { scope: registration.scope },
        }),
      );
      return registration;
    })
    .catch(function (err) {
      console.warn("[SW] Registration unavailable", err && err.message ? err.message : err);
      return null;
    });
})();
