"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const APK = "https://github.com/vibexaplus/vibexa/releases/latest/download/Vibexa-Plus.apk";
const COUNT_URL = "https://vibexaplus.goatcounter.com/count";
const SCRIPT_URL = "https://gc.zgo.at/count.js";
const DOWNLOAD_EVENT = "download-vibexa-plus";

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function loadApi() {
  const sandbox = { console, URL };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("assets/analytics.js"), sandbox, { filename: "assets/analytics.js" });
  return sandbox.VibexaAnalytics;
}

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; }
  };
}

function element(tag) {
  const attrs = {};
  const listeners = {};
  const node = {
    tagName: String(tag || "div").toUpperCase(),
    parentNode: null,
    style: {},
    children: [],
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    appendChild(child) {
      child.parentNode = node;
      node.children.push(child);
      return child;
    },
    removeChild(child) {
      child.parentNode = null;
      return child;
    }
  };
  Object.defineProperty(node, "dataset", {
    get() {
      return {
        get goatcounter() { return attrs["data-goatcounter"] || ""; },
        get goatcounterSettings() { return attrs["data-goatcounter-settings"] || ""; }
      };
    }
  });
  node._listeners = listeners;
  node._attrs = attrs;
  return node;
}

function createEnv(options) {
  options = options || {};
  const scripts = [];
  const listeners = {};
  const head = element("head");
  const body = element("body");
  head.appendChild = function (child) {
    child.parentNode = head;
    scripts.push(child);
    if (typeof options.onScript === "function" && child.src === SCRIPT_URL) options.onScript(child);
    return child;
  };
  const document = {
    head,
    body,
    title: options.title || "Vibexa Plus",
    referrer: options.referrer || "",
    visibilityState: "visible",
    __vibexaDownloadBound: false,
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    createElement(tag) { return element(tag); },
    querySelector(sel) {
      if (sel === "script[data-goatcounter]") return scripts[scripts.length - 1] || null;
      return null;
    },
    querySelectorAll() { return []; }
  };
  const env = {
    console,
    URL,
    VIBEXA: { analytics: options.analytics },
    document,
    navigator: options.navigator || {},
    localStorage: options.localStorage || memoryStorage(),
    location: options.location || {
      hash: "",
      href: "https://vibexaplus.github.io/privacy.html",
      hostname: "vibexaplus.github.io",
      protocol: "https:",
      pathname: "/privacy.html",
      search: "",
      toString() { return this.href; }
    },
    screen: { width: 360 },
    alerts: [],
    alert(msg) { env.alerts.push(String(msg)); },
    doNotTrack: options.doNotTrack
  };
  document._scripts = scripts;
  document._listeners = listeners;
  document._dispatch = function (type, event) {
    (listeners[type] || []).forEach((fn) => fn(event));
    if (!event.defaultPrevented) event.followed = true;
  };
  env.window = env;
  return env;
}

function enabledAnalytics() {
  return { enabled: true, countUrl: COUNT_URL, scriptUrl: SCRIPT_URL };
}

function link(attrs, child) {
  const node = element("a");
  Object.keys(attrs || {}).forEach((key) => node.setAttribute(key, attrs[key]));
  if (child) {
    child.parentNode = node;
    node.appendChild(child);
  }
  return child || node;
}

function click(target, extra) {
  extra = extra || {};
  const event = {
    type: extra.type || "click",
    button: extra.button || 0,
    defaultPrevented: false,
    target,
    followed: false,
    preventDefault() { event.defaultPrevented = true; }
  };
  return event;
}

function dispatch(env, event) {
  env.document._dispatch(event.type, event);
  return event;
}

const api = loadApi();

test("page paths drop the query string and fragment", () => {
  const cases = [
    ["/privacy.html?utm_source=nl#website", "/privacy.html"],
    ["/?ref=abc#download", "/"],
    ["https://vibexaplus.github.io/index.html?x=1#y", "/index.html"],
    ["https://vibexaplus.github.io/privacy.html?token=no#children", "/privacy.html"],
    ["#download", "/"],
    ["?utm=1", "/"],
    ["", "/"],
    [null, "/"],
    ["privacy.html?x=1#y", "/privacy.html"]
  ];
  cases.forEach(([input, expected]) => {
    const got = api.pagePath(input);
    assert.equal(got, expected);
    assert.equal(got.includes("?"), false);
    assert.equal(got.includes("#"), false);
  });
});

test("referrers drop the query string, fragment, and credentials", () => {
  assert.equal(api.referrerValue("https://news.example/story?id=99#top"), "https://news.example/story");
  assert.equal(api.referrerValue("https://user:secret@example.com/a?b=1"), "https://example.com/a");
  assert.equal(api.referrerValue(""), "");
  assert.equal(api.referrerValue(null), "");
  assert.equal(api.referrerValue("javascript:alert(1)"), "");
});

test("disabled mode does not load the script or count a click", () => {
  const configs = [
    { enabled: false, countUrl: COUNT_URL, scriptUrl: SCRIPT_URL },
    { enabled: true, countUrl: "", scriptUrl: SCRIPT_URL },
    { enabled: true, countUrl: "https://example.goatcounter.com/count", scriptUrl: SCRIPT_URL },
    { enabled: true, countUrl: "http://vibexaplus.goatcounter.com/count", scriptUrl: SCRIPT_URL },
    { enabled: true, countUrl: COUNT_URL, scriptUrl: "https://evil.example/count.js" },
    { enabled: true, countUrl: COUNT_URL + "/", scriptUrl: SCRIPT_URL }
  ];
  configs.forEach((analytics) => {
    assert.equal(api.isConfigured(analytics), false);
    let counts = 0;
    const env = createEnv({
      analytics,
      navigator: { sendBeacon() { counts += 1; return true; } }
    });
    env.goatcounter = { count() { counts += 1; } };
    const state = api.start(env);
    assert.equal(state.enabled, false);
    assert.equal(state.loaded, false);
    assert.equal(env.document._scripts.length, 0);
    assert.equal(env.document._listeners.click, undefined);
    const event = click(link({ "data-dl": "app", href: APK }));
    dispatch(env, event);
    assert.equal(counts, 0);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.followed, true);
    assert.equal(event.target.getAttribute("href"), APK);
  });
});

test("configured site installs the official script and strips paths before load", () => {
  const env = createEnv({ analytics: enabledAnalytics(), referrer: "https://news.example/story?id=99#top" });
  const state = api.start(env);
  assert.equal(state.enabled, true);
  assert.equal(state.loaded, true);
  assert.equal(env.document._scripts.length, 1);
  const script = env.document._scripts[0];
  assert.equal(script.src, SCRIPT_URL);
  assert.equal(script.getAttribute("data-goatcounter"), COUNT_URL);
  const settings = JSON.parse(script.getAttribute("data-goatcounter-settings"));
  assert.equal(settings.no_onload, true);
  assert.equal(settings.no_events, true);
  assert.equal(settings.allow_local, undefined);
  assert.equal(env.goatcounter.path("/privacy.html?utm=1#website"), "/privacy.html");
  assert.equal(env.goatcounter.path("https://vibexaplus.github.io/?ref=a#download"), "/");
  assert.equal(env.goatcounter.referrer("https://news.example/story?id=99#top"), "https://news.example/story");
  assert.equal(Object.prototype.hasOwnProperty.call(env.goatcounter, "event"), false);
});

test("a page view is not the download event, and the query field is cleared", () => {
  const calls = [];
  const env = createEnv({
    analytics: enabledAnalytics(),
    location: {
      hash: "#website",
      href: "https://vibexaplus.github.io/privacy.html?utm=secret#website",
      hostname: "vibexaplus.github.io",
      protocol: "https:",
      pathname: "/privacy.html",
      search: "?utm=secret"
    }
  });
  api.start(env);
  assert.equal(calls.length, 0);
  env.goatcounter.get_data = function () {
    return { p: "/privacy.html?utm=secret#website", q: "?utm=secret", e: false };
  };
  env.goatcounter.count = function (vars) { calls.push(vars); };
  const script = env.document._scripts[0];
  script._listeners.load.forEach((fn) => fn());
  assert.equal(calls.length, 1);
  assert.equal(calls[0], undefined);
  const data = env.goatcounter.get_data();
  assert.equal(data.q, "");
  assert.equal(calls.some((item) => item && item.path === DOWNLOAD_EVENT), false);
});

test("download event fires only for a real button activation", () => {
  const calls = [];
  const env = createEnv({ analytics: enabledAnalytics() });
  api.start(env);
  env.goatcounter.count = function (vars) { calls.push(vars); };
  const button = element("a");
  button.setAttribute("data-dl", "app");
  button.setAttribute("href", APK);
  const icon = element("svg");
  icon.parentNode = button;

  dispatch(env, click(icon));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, DOWNLOAD_EVENT);
  assert.equal(calls[0].title, "Download Vibexa Plus");
  assert.equal(calls[0].event, true);
  assert.equal(calls[0].no_session, true);
  assert.deepEqual(Object.keys(calls[0]).sort(), ["event", "no_session", "path", "title"]);
  assert.equal(calls[0].path.startsWith("/"), false);

  dispatch(env, click(icon, { type: "auxclick", button: 1 }));
  assert.equal(calls.length, 2);

  dispatch(env, click(icon, { type: "auxclick", button: 2 }));
  dispatch(env, click(icon, { type: "click", button: 2 }));
  dispatch(env, click(link({ href: "#download" })));
  dispatch(env, click(link({ href: "index.html#download" })));
  const disabled = link({ "data-dl": "app", "aria-disabled": "true", href: APK });
  dispatch(env, click(disabled));
  const unavailable = link({ "data-dl": "app" });
  dispatch(env, click(unavailable));
  const hashDownload = link({ "data-dl": "app", href: "#download" });
  dispatch(env, click(hashDownload));
  assert.equal(calls.length, 2);

  button.removeAttribute = button.setAttribute;
  button.setAttribute("href", "");
  button._attrs.href = "";
  const after = click(button);
  dispatch(env, after);
  assert.equal(calls.length, 2);
  assert.equal(after.defaultPrevented, false);
});

test("a throwing count does not cancel the download link", () => {
  const env = createEnv({ analytics: enabledAnalytics() });
  api.start(env);
  env.goatcounter.count = function () { throw new Error("analytics blocked"); };
  const button = link({ "data-dl": "app", href: APK });
  const event = click(button);
  assert.doesNotThrow(() => dispatch(env, event));
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.followed, true);
  assert.equal(button.getAttribute("href"), APK);
});

test("script injection failure still leaves the link usable", () => {
  const env = createEnv({ analytics: enabledAnalytics() });
  env.document.head.appendChild = function () { throw new Error("blocked"); };
  const state = api.start(env);
  assert.equal(state.loaded, false);
  env.goatcounter.count = function () { throw new Error("analytics blocked"); };
  const button = link({ "data-dl": "app", href: APK });
  const event = click(button);
  assert.doesNotThrow(() => dispatch(env, event));
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.followed, true);
  assert.equal(button.getAttribute("href"), APK);
});

test("browser privacy opt-out and GoatCounter skip flag do not load or count", () => {
  function run(options) {
    const calls = [];
    const env = createEnv(Object.assign({ analytics: enabledAnalytics() }, options));
    env.goatcounter = { count() { calls.push("count"); } };
    const state = api.start(env);
    assert.equal(state.loaded, false);
    assert.equal(env.document._scripts.length, 0);
    const event = click(link({ "data-dl": "app", href: APK }));
    assert.doesNotThrow(() => dispatch(env, event));
    assert.equal(calls.length, 0);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.followed, true);
  }
  run({ navigator: { globalPrivacyControl: true } });
  run({ navigator: { doNotTrack: "1" } });
  run({ navigator: { doNotTrack: "yes" } });
  run({ doNotTrack: "1" });
  run({ navigator: { msDoNotTrack: "1" } });
  run({ localStorage: memoryStorage({ skipgc: "t" }) });
});

test("Do Not Track left unspecified still allows the script", () => {
  const env = createEnv({
    analytics: enabledAnalytics(),
    navigator: { doNotTrack: "0" }
  });
  const state = api.start(env);
  assert.equal(state.loaded, true);
  assert.equal(env.document._scripts.length, 1);
});

test("#toggle-goatcounter flips skipgc and does not load count.js on that view", () => {
  const storage = memoryStorage();
  const off = createEnv({
    analytics: enabledAnalytics(),
    localStorage: storage,
    location: {
      hash: "#toggle-goatcounter",
      href: "https://vibexaplus.github.io/#toggle-goatcounter",
      hostname: "vibexaplus.github.io",
      protocol: "https:",
      pathname: "/",
      search: ""
    }
  });
  api.start(off);
  assert.equal(storage.getItem("skipgc"), "t");
  assert.equal(off.document._scripts.length, 0);
  assert.match(off.alerts[0], /DISABLED/);

  const on = createEnv({
    analytics: enabledAnalytics(),
    localStorage: storage,
    location: {
      hash: "#toggle-goatcounter",
      href: "https://vibexaplus.github.io/privacy.html#toggle-goatcounter",
      hostname: "vibexaplus.github.io",
      protocol: "https:",
      pathname: "/privacy.html",
      search: ""
    }
  });
  api.start(on);
  assert.equal(storage.getItem("skipgc"), null);
  assert.equal(on.document._scripts.length, 0);
  assert.match(on.alerts[0], /ENABLED/);

  const next = createEnv({
    analytics: enabledAnalytics(),
    localStorage: storage,
    location: {
      hash: "",
      href: "https://vibexaplus.github.io/",
      hostname: "vibexaplus.github.io",
      protocol: "https:",
      pathname: "/",
      search: ""
    }
  });
  api.start(next);
  assert.equal(next.document._scripts.length, 1);
});

test("count.js path selection keeps event names and strips page queries", () => {
  const gc = {
    path(value) { return api.pagePath(value); }
  };
  function selected(vars, fallback) {
    const dataPath = vars.path === undefined ? gc.path : vars.path;
    let callback = null;
    let path = dataPath;
    if (typeof path === "function") {
      callback = path;
      path = undefined;
    }
    if (path === null || path === undefined || typeof path === "function") path = fallback;
    if (callback) path = callback(path);
    return path;
  }
  assert.equal(selected({}, "/privacy.html?utm=secret#website"), "/privacy.html");
  assert.equal(selected({ path: DOWNLOAD_EVENT, event: true }, "/privacy.html?utm=secret"), DOWNLOAD_EVENT);
});

test("site wiring keeps one download, app privacy claims, and the public endpoint", () => {
  const config = read("config.js");
  const index = read("index.html");
  const privacy = read("privacy.html");
  const analytics = read("assets/analytics.js");
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(config, sandbox);
  assert.equal(sandbox.VIBEXA.analytics.enabled, true);
  assert.equal(sandbox.VIBEXA.analytics.countUrl, COUNT_URL);
  assert.equal(sandbox.VIBEXA.analytics.scriptUrl, SCRIPT_URL);
  assert.equal(sandbox.VIBEXA.app.file, APK);
  assert.equal(sandbox.VIBEXA.supportUrl, "https://github.com/vibexaplus/vibexa/issues");
  assert.equal(sandbox.VIBEXA.privacyDate, "6 Nov 2026");

  assert.equal((index.match(/data-dl="app"/g) || []).length, 1);
  assert.equal((index.match(/assets\/analytics\.js/g) || []).length, 1);
  assert.equal((privacy.match(/assets\/analytics\.js/g) || []).length, 1);
  assert.ok(index.includes(APK));
  assert.ok(index.includes("with no ads"));
  assert.ok(index.includes("contains no analytics, ads or crash-reporting services"));
  assert.ok(index.includes("https://github.com/vibexaplus/vibexa/issues"));
  assert.ok(privacy.includes("contains no analytics, advertising or crash-reporting services"));
  assert.ok(privacy.includes("The app has no server of its own"));
  assert.ok(privacy.includes("https://github.com/vibexaplus/vibexa/issues"));
  assert.ok(privacy.includes("https://www.goatcounter.com/help/privacy"));
  assert.ok(privacy.includes("https://www.goatcounter.com/help/gdpr"));
  assert.ok(privacy.includes(DOWNLOAD_EVENT));
  assert.ok(privacy.includes("download_count"));
  assert.ok(privacy.includes("Global Privacy Control"));
  assert.ok(privacy.includes("Do Not Track"));
  assert.ok(privacy.includes("#toggle-goatcounter"));
  assert.ok(privacy.includes("skipgc"));
  assert.ok(privacy.includes("does not show a public visitor counter"));
  assert.ok(privacy.includes("Last updated 6 Nov 2026"));
  assert.equal(privacy.includes("uses no cookies, analytics or trackers"), false);
  assert.doesNotMatch(privacy, /GDPR compliant|fully compliant|CCPA compliant|we comply|legally compliant/i);
  assert.doesNotMatch(analytics, /visit_count/);
  [config, index, privacy, analytics].forEach((text) => {
    assert.doesNotMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    assert.doesNotMatch(text, /(api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*['"][^'"]+['"]/i);
  });
});

let countJsSource = "";

test.before(async () => {
  const response = await fetch(SCRIPT_URL);
  assert.equal(response.status, 200);
  countJsSource = await response.text();
  assert.match(countJsSource, /get_data = function\(vars\)/);
  assert.match(countJsSource, /q:\s*location\.search/);
});

test("official count.js beacons a stripped page view and a real click, and a failed beacon does not cancel the link", () => {
  const beacons = [];
  const env = createEnv({
    analytics: enabledAnalytics(),
    title: "Privacy policy – Vibexa Plus",
    referrer: "https://news.example/story?id=99#top",
    location: {
      hash: "#website",
      href: "https://vibexaplus.github.io/privacy.html?utm=secret#website",
      hostname: "vibexaplus.github.io",
      protocol: "https:",
      pathname: "/privacy.html",
      search: "?utm=secret",
      toString() { return this.href; }
    },
    navigator: {
      webdriver: false,
      sendBeacon(url) {
        beacons.push(String(url));
        return true;
      }
    }
  });
  env.parent = { location: env.location };
  env.document.head.appendChild = function (child) {
    child.parentNode = env.document.head;
    env.document._scripts.push(child);
    if (child.src === SCRIPT_URL) {
      env.document._currentScript = child;
      vm.runInContext(countJsSource, env, { filename: "count.js" });
      (child._listeners.load || []).forEach((fn) => fn());
    }
    return child;
  };
  vm.createContext(env);
  const state = env.VibexaAnalytics ? null : api.start(env);
  assert.equal(state.loaded, true);
  assert.equal(beacons.length, 1);
  const page = new URL(beacons[0]);
  assert.equal(page.origin + page.pathname, COUNT_URL);
  assert.equal(page.searchParams.get("p"), "/privacy.html");
  assert.equal(page.searchParams.get("q"), null);
  assert.equal(page.searchParams.get("e"), null);
  assert.equal(page.searchParams.get("r"), "https://news.example/story");
  assert.equal(page.href.includes("utm"), false);
  assert.equal(page.href.includes("secret"), false);
  assert.equal(page.href.includes("id=99"), false);
  assert.equal(page.href.includes("#"), false);

  const button = link({ "data-dl": "app", href: APK });
  const activation = click(element("span"));
  activation.target.parentNode = button;
  dispatch(env, activation);
  assert.equal(beacons.length, 2);
  const hit = new URL(beacons[1]);
  assert.equal(hit.searchParams.get("p"), DOWNLOAD_EVENT);
  assert.equal(hit.searchParams.get("e"), "true");
  assert.equal(hit.searchParams.get("q"), null);
  assert.equal(hit.href.includes("utm"), false);
  assert.equal(activation.defaultPrevented, false);
  assert.equal(activation.followed, true);
  assert.equal(button.getAttribute("href"), APK);

  env.navigator.sendBeacon = function () { throw new Error("blocked"); };
  const again = click(button);
  assert.doesNotThrow(() => dispatch(env, again));
  assert.equal(again.defaultPrevented, false);
  assert.equal(again.followed, true);
  assert.equal(button.getAttribute("href"), APK);
  assert.equal(beacons.length, 2);
});
