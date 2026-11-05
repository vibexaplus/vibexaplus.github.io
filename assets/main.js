/* Vibexa site: fills values from config.js, renders "to be filled" badges, menu, copy, carousel, reveal. No trackers. */
(function () {
  var C = window.VIBEXA || {}, PH = "To be filled at release";
  function get(p) { return p.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, C); }
  function ph(el) { el.textContent = ""; var s = document.createElement("span"); s.className = "ph"; s.textContent = PH; el.appendChild(s); }
  var shaRe = /^[0-9a-f]{64}$/;

  /* iPhone / iPad (iPadOS reports MacIntel with touch): explain instead of offering an APK */
  var ua = navigator.userAgent || "";
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) document.documentElement.classList.add("is-ios");

  /* hero meta: one calm badge instead of three while nothing is filled in */
  document.querySelectorAll("[data-meta]").forEach(function (el) {
    if (!(C.app && C.app.version)) { el.textContent = ""; var s = document.createElement("span"); s.className = "ph"; s.textContent = "Version details coming soon"; el.appendChild(s); }
  });
  document.querySelectorAll("[data-cfg]").forEach(function (el) {
    var v = get(el.getAttribute("data-cfg"));
    if (v == null || v === "") ph(el); else el.textContent = (el.getAttribute("data-pre") || "") + v + (el.getAttribute("data-suf") || "");
  });
  document.querySelectorAll("[data-mail]").forEach(function (el) {
    var v = C.contactEmail;
    if (!v) { var s = document.createElement("span"); s.className = "ph"; s.textContent = PH; el.replaceWith(s); return; }
    el.href = "mailto:" + v; el.textContent = v;
  });

  /* download buttons: enabled only when the file is published and the checksum is real */
  document.querySelectorAll("[data-dl]").forEach(function (a) {
    var k = a.getAttribute("data-dl"), d = C[k] || {};
    var ok = d.available === true && shaRe.test(d.sha256 || "") && d.version;
    var label = a.querySelector(".lbl");
    if (ok) {
      a.href = d.file; a.setAttribute("download", ""); a.removeAttribute("aria-disabled");
      if (label && a.hasAttribute("data-withsize") && d.sizeMb) label.textContent += " · " + d.sizeMb + " MB";
    } else {
      a.removeAttribute("href"); a.removeAttribute("download"); a.setAttribute("aria-disabled", "true"); a.setAttribute("role", "link");
      if (label) label.textContent = "Coming soon";
    }
  });

  if (isIOS) {
    document.querySelectorAll("[data-ios-note]").forEach(function (n) {
      n.hidden = false;
      var b = n.querySelector(".ios-copy"), out = n.querySelector(".ios-copied");
      b.addEventListener("click", function () {
        var url = location.href.split("#")[0] + "#download";
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { out.textContent = "Link copied. Send it to your Android phone."; }, function () { out.textContent = url; });
      });
    });
    document.querySelectorAll("[data-dl]").forEach(function (a) {
      a.removeAttribute("href"); a.removeAttribute("download"); a.setAttribute("aria-disabled", "true"); a.setAttribute("role", "link");
      var l = a.querySelector(".lbl"); if (l) l.textContent = "Android only";
    });
  }

  /* checksum + copy */
  document.querySelectorAll("[data-sha]").forEach(function (box) {
    var v = (C[box.getAttribute("data-sha")] || {}).sha256, code = box.querySelector("code"), btn = box.querySelector("button"), chip = box.querySelector(".copied"), live = box.querySelector("[aria-live]");
    if (v && shaRe.test(v)) {
      code.textContent = v; btn.disabled = false;
      btn.addEventListener("click", function () {
        (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () {
          chip.classList.add("show"); live.textContent = "Checksum copied";
          setTimeout(function () { chip.classList.remove("show"); live.textContent = ""; }, 2000);
        }, function () {});
      });
    } else { ph(code); btn.disabled = true; }
  });

  /* header border on scroll */
  var hdr = document.querySelector(".site-header");
  function onScroll() { hdr.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* mobile menu sheet: aria-controls, Esc, focus trap */
  var mb = document.querySelector(".menu-btn"), sheet = document.getElementById("menu-sheet");
  if (mb && sheet) {
    var open = false;
    function focusables() { return [mb].concat([].slice.call(sheet.querySelectorAll("a,button"))); }
    function set(o) {
      open = o; sheet.classList.toggle("open", o); mb.setAttribute("aria-expanded", String(o));
      mb.setAttribute("aria-label", o ? "Close menu" : "Open menu");
      mb.querySelector(".i-open").style.display = o ? "none" : ""; mb.querySelector(".i-close").style.display = o ? "" : "none";
      if (o) sheet.querySelector("a").focus();
    }
    mb.addEventListener("click", function () { set(!open); });
    sheet.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", function (e) {
      if (!open) return;
      if (e.key === "Escape") { set(false); mb.focus(); }
      if (e.key === "Tab") {
        var f = focusables(), i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  /* screenshot carousel (below lg) */
  var track = document.querySelector(".track");
  if (track) {
    var slides = [].slice.call(track.children), dots = document.querySelector(".dots");
    slides.forEach(function (s, i) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", "Show screen " + (i + 1) + " of " + slides.length);
      b.addEventListener("click", function () { s.scrollIntoView({ inline: "center", block: "nearest" }); });
      dots.appendChild(b);
    });
    function cur() { var c = track.scrollLeft + track.clientWidth / 2, best = 0, bd = 1e9; slides.forEach(function (s, i) { var d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - c); if (d < bd) { bd = d; best = i; } }); return best; }
    function mark() { var c = cur(); [].forEach.call(dots.children, function (d, i) { d.setAttribute("aria-current", i === c ? "true" : "false"); }); }
    track.addEventListener("scroll", function () { window.requestAnimationFrame(mark); }, { passive: true }); mark();
    document.querySelectorAll("[data-car]").forEach(function (b) {
      b.addEventListener("click", function () { var n = Math.max(0, Math.min(slides.length - 1, cur() + Number(b.getAttribute("data-car")))); slides[n].scrollIntoView({ inline: "center", block: "nearest" }); });
    });
  }

  /* privacy TOC active item */
  var toc = document.querySelectorAll(".toc-d a");
  if (toc.length && "IntersectionObserver" in window) {
    var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) toc.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id); }); }); }, { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll(".prose h2[id]").forEach(function (h) { io2.observe(h); });
  }

  /* reveal once; content stays visible without JS or with reduced motion */
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !/[?&]static/.test(location.search)) {
    document.documentElement.classList.add("js-reveal");
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { threshold: .15 });
    document.querySelectorAll(".reveal").forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 60 + "ms"; io.observe(el); });
  }
  document.querySelectorAll(".year").forEach(function (e) { e.textContent = new Date().getFullYear(); });
})();
