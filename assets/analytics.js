/* Website-only GoatCounter counts.
   Page paths omit the query string and fragment. The download-vibexa-plus
   event is a real download-button activation, not GitHub's release asset
   download_count. A blocked or failing count must not stop the download.
   allow_local stays off, so localhost previews are ignored by count.js. */
(function (root) {
  "use strict";

  var COUNT_URL = "https://vibexaplus.goatcounter.com/count";
  var SCRIPT_URL = "https://gc.zgo.at/count.js";
  var DOWNLOAD_EVENT = "download-vibexa-plus";

  function pagePath(value) {
    if (value == null) return "/";
    var s = String(value).replace(/^\s+|\s+$/g, "");
    if (!s) return "/";
    try {
      if (/^[a-z][a-z0-9+.-]*:/i.test(s)) s = new URL(s).pathname || "/";
    } catch (e) {}
    var hash = s.indexOf("#");
    if (hash !== -1) s = s.slice(0, hash);
    var query = s.indexOf("?");
    if (query !== -1) s = s.slice(0, query);
    if (!s) return "/";
    if (s.charAt(0) !== "/") s = "/" + s;
    return s;
  }

  function referrerValue(value) {
    if (value == null || value === "") return "";
    var s = String(value);
    try {
      var u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      return u.origin + (u.pathname || "/");
    } catch (e2) {
      return s.split("#")[0].split("?")[0];
    }
  }

  function configFrom(env) {
    var site = (env && env.VIBEXA) || {};
    return site.analytics || {};
  }

  function isConfigured(cfg) {
    cfg = cfg || {};
    var script = typeof cfg.scriptUrl === "string" && cfg.scriptUrl ? cfg.scriptUrl : SCRIPT_URL;
    return cfg.enabled === true && cfg.countUrl === COUNT_URL && script === SCRIPT_URL;
  }

  function browserOptOut(env) {
    env = env || root;
    var nav = env.navigator || {};
    var dnt = nav.doNotTrack || nav.msDoNotTrack || env.doNotTrack;
    if (dnt === "1" || dnt === "yes") return "Do Not Track";
    if (nav.globalPrivacyControl === true) return "Global Privacy Control";
    return "";
  }

  function storageGet(env, key) {
    try {
      var ls = env.localStorage;
      if (!ls || typeof ls.getItem !== "function") return null;
      return ls.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function skipFlag(env) {
    return storageGet(env, "skipgc") === "t";
  }

  function toggleSkip(env) {
    var ls = env.localStorage;
    if (!ls || typeof ls.setItem !== "function" || typeof ls.removeItem !== "function") return;
    var href = "";
    try { href = String(env.location && (env.location.href || env.location) || ""); } catch (e) { href = ""; }
    var wasOff = skipFlag(env);
    try {
      if (wasOff) ls.removeItem("skipgc");
      else ls.setItem("skipgc", "t");
    } catch (e2) {
      return;
    }
    var msg = wasOff
      ? "GoatCounter tracking is now ENABLED in this browser."
      : "GoatCounter tracking is now DISABLED in this browser until " + href + " is loaded again.";
    var signal = browserOptOut(env);
    if (signal) msg += " This browser also asks not to be tracked (" + signal + "), so counts stay off while that is on.";
    try { if (typeof env.alert === "function") env.alert(msg); } catch (e3) {}
  }

  function findDownload(node) {
    var el = node;
    while (el) {
      if (typeof el.getAttribute === "function" && el.getAttribute("data-dl") === "app") return el;
      el = el.parentNode || null;
    }
    return null;
  }

  function isDownloadActivation(event, link) {
    if (!event || !link) return false;
    if (event.defaultPrevented) return false;
    var button = event.button || 0;
    if (event.type === "click") {
      if (button !== 0) return false;
    } else if (event.type === "auxclick") {
      if (button !== 1) return false;
    } else {
      return false;
    }
    if (link.getAttribute("aria-disabled") === "true") return false;
    var href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#") return false;
    return true;
  }

  function sendDownload(env, event) {
    try {
      var link = findDownload(event && event.target);
      if (!isDownloadActivation(event, link)) return;
      if (!isConfigured(configFrom(env))) return;
      if (browserOptOut(env) || skipFlag(env)) return;
      var gc = env.goatcounter;
      if (!gc || typeof gc.count !== "function") return;
      gc.count({
        path: DOWNLOAD_EVENT,
        title: "Download Vibexa Plus",
        event: true,
        no_session: true
      });
    } catch (e) {}
  }

  function bindDownloads(env) {
    var doc = env.document;
    if (!doc || typeof doc.addEventListener !== "function" || doc.__vibexaDownloadBound) return;
    doc.__vibexaDownloadBound = true;
    var onClick = function (event) { sendDownload(env, event); };
    doc.addEventListener("click", onClick, false);
    doc.addEventListener("auxclick", onClick, false);
  }

  function onScriptLoad(env) {
    try {
      var gc = env.goatcounter;
      if (!gc || gc.__vibexaPatched) return;
      if (typeof gc.get_data === "function") {
        var orig = gc.get_data;
        gc.get_data = function (vars) {
          var data = orig(vars);
          /* count.js copies location.search into q. Drop it so the query
             string is not sent beside the stripped page path. */
          if (data && typeof data === "object") data.q = "";
          return data;
        };
      }
      gc.__vibexaPatched = true;
      if (!isConfigured(configFrom(env)) || browserOptOut(env) || skipFlag(env)) return;
      if (typeof gc.count === "function") gc.count();
    } catch (e) {}
  }

  function inject(env) {
    try {
      var doc = env.document;
      var parent = doc && (doc.head || doc.body || doc.documentElement);
      if (!parent || typeof parent.appendChild !== "function" || typeof doc.createElement !== "function") return false;
      var script = doc.createElement("script");
      script.async = true;
      script.src = SCRIPT_URL;
      if (typeof script.setAttribute === "function") {
        script.setAttribute("data-goatcounter", COUNT_URL);
        script.setAttribute("data-goatcounter-settings", JSON.stringify({ no_onload: true, no_events: true }));
      }
      if (typeof script.addEventListener === "function") {
        script.addEventListener("load", function () { onScriptLoad(env); });
        script.addEventListener("error", function () {});
      }
      parent.appendChild(script);
      return true;
    } catch (e) {
      return false;
    }
  }

  function start(env) {
    env = env || root;
    try {
      if (env.__vibexaAnalyticsStarted) return env.__vibexaAnalyticsState || { enabled: false, loaded: false };
      env.__vibexaAnalyticsStarted = true;
      var configured = isConfigured(configFrom(env));
      var state = { enabled: configured, loaded: false, reason: configured ? "ok" : "disabled" };
      if (!configured) {
        env.__vibexaAnalyticsState = state;
        return state;
      }
      if (env.location && env.location.hash === "#toggle-goatcounter") {
        toggleSkip(env);
        state.reason = "toggle";
        env.__vibexaAnalyticsState = state;
        return state;
      }
      bindDownloads(env);
      var signal = browserOptOut(env);
      if (signal || skipFlag(env)) {
        state.reason = signal || "skipgc";
        env.__vibexaAnalyticsState = state;
        return state;
      }
      env.goatcounter = {
        no_onload: true,
        no_events: true,
        path: function (p) {
          if (browserOptOut(env) || skipFlag(env)) return null;
          return pagePath(p);
        },
        referrer: function (r) { return referrerValue(r); }
      };
      state.loaded = inject(env);
      if (!state.loaded) state.reason = "inject-failed";
      env.__vibexaAnalyticsState = state;
      return state;
    } catch (e4) {
      return { enabled: false, loaded: false, reason: "error" };
    }
  }

  root.VibexaAnalytics = {
    COUNT_URL: COUNT_URL,
    SCRIPT_URL: SCRIPT_URL,
    DOWNLOAD_EVENT: DOWNLOAD_EVENT,
    pagePath: pagePath,
    referrerValue: referrerValue,
    isConfigured: isConfigured,
    browserOptOut: browserOptOut,
    start: start
  };

  if (root.document && root.VIBEXA) root.VibexaAnalytics.start(root);
})(typeof window !== "undefined" ? window : this);
