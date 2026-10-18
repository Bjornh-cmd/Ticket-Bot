/*! Captcha is widget — self-hosted */
(function (global) {
  "use strict";

  var API_BASE = (function () {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || "";
      if (src.indexOf("/api.js") !== -1) {
        return src.replace(/\/api\.js(\?.*)?$/, "");
      }
    }
    return "";
  })();

  var HOME = API_BASE || "/";

  var CSS = [
    ".cis-root{font-family:Segoe UI,system-ui,sans-serif;font-size:14px;color:#0f172a;line-height:1.4;box-sizing:border-box}",
    ".cis-root *,.cis-root *::before,.cis-root *::after{box-sizing:border-box}",
    ".cis-box{display:inline-flex;align-items:center;gap:12px;min-width:300px;padding:12px 14px;border:1px solid #cbd5e1;border-radius:4px;background:linear-gradient(180deg,#f8fafc,#f1f5f9);box-shadow:0 1px 2px rgba(15,23,42,.06);user-select:none}",
    ".cis-check{width:28px;height:28px;border:2px solid #64748b;border-radius:3px;background:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0}",
    ".cis-check:disabled{opacity:.7;cursor:default}",
    ".cis-check.is-ok{border-color:#15803d;background:#dcfce7}",
    ".cis-check.is-busy{border-color:#2563eb}",
    ".cis-spin{width:14px;height:14px;border:2px solid #93c5fd;border-top-color:#2563eb;border-radius:50%;animation:cisspin .7s linear infinite}",
    "@keyframes cisspin{to{transform:rotate(360deg)}}",
    ".cis-label{flex:1;font-weight:500}",
    ".cis-brand{font-size:11px;color:#64748b;text-align:right;line-height:1.2}",
    ".cis-brand a{color:#334155;text-decoration:none}",
    ".cis-err{color:#b91c1c;font-size:12px;margin-top:6px}",
    ".cis-invisible{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
    ".cis-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#64748b}",
    ".cis-badge .cis-spin{width:10px;height:10px}",
    ".cis-modal{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:2147483000;padding:16px}",
    ".cis-panel{width:min(360px,100%);background:#fff;border-radius:8px;padding:16px;box-shadow:0 20px 40px rgba(15,23,42,.25)}",
    ".cis-panel h3{margin:0 0 8px;font-size:16px}",
    ".cis-panel p{margin:0 0 12px;color:#475569}",
    ".cis-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}",
    ".cis-tile{aspect-ratio:1;border:2px solid #e2e8f0;border-radius:6px;background:#f8fafc;cursor:pointer;padding:0;overflow:hidden;display:flex;align-items:center;justify-content:center}",
    ".cis-tile.sel{border-color:#2563eb;box-shadow:inset 0 0 0 2px #2563eb}",
    ".cis-tile img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}",
    ".cis-tile svg{width:100%;height:100%}",
    ".cis-actions{display:flex;justify-content:flex-end;gap:8px}",
    ".cis-btn{border:0;border-radius:4px;padding:8px 12px;font-weight:600;cursor:pointer}",
    ".cis-btn.primary{background:#1d4ed8;color:#fff}",
    ".cis-btn.ghost{background:#e2e8f0;color:#0f172a}",
  ].join("");

  function ensureStyles() {
    if (document.getElementById("captcha-is-css")) return;
    var style = document.createElement("style");
    style.id = "captcha-is-css";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function leadingZeroBits(hex) {
    var bits = 0;
    for (var i = 0; i < hex.length; i++) {
      var nibble = parseInt(hex.charAt(i), 16);
      if (nibble === 0) {
        bits += 4;
        continue;
      }
      if (nibble < 2) bits += 3;
      else if (nibble < 4) bits += 2;
      else if (nibble < 8) bits += 1;
      break;
    }
    return bits;
  }

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  async function solvePowMain(nonce, difficulty, timeoutMs) {
    var start = Date.now();
    var counter = 0;
    var enc = new TextEncoder();
    while (Date.now() - start < timeoutMs) {
      for (var i = 0; i < 200; i++) {
        var data = enc.encode(nonce + ":" + counter);
        var digest = await crypto.subtle.digest("SHA-256", data);
        if (leadingZeroBits(toHex(digest)) >= difficulty) return counter;
        counter++;
      }
      await new Promise(function (r) {
        setTimeout(r, 0);
      });
    }
    throw new Error("pow-timeout");
  }

  function solvePowWorker(nonce, difficulty, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var workerCode =
        "self.onmessage=async function(e){var n=e.data.nonce,d=e.data.difficulty,t=e.data.timeoutMs,start=Date.now(),c=0,enc=new TextEncoder();function bits(h){var b=0;for(var i=0;i<h.length;i++){var x=parseInt(h[i],16);if(x===0){b+=4;continue;}if(x<2)b+=3;else if(x<4)b+=2;else if(x<8)b+=1;break;}return b;}function hex(buf){var a=new Uint8Array(buf),s='';for(var i=0;i<a.length;i++)s+=a[i].toString(16).padStart(2,'0');return s;}try{while(Date.now()-start<t){for(var i=0;i<250;i++){var dig=await crypto.subtle.digest('SHA-256',enc.encode(n+':'+c));if(bits(hex(dig))>=d){self.postMessage({ok:true,counter:c});return;}c++;}}self.postMessage({ok:false,error:'pow-timeout'});}catch(err){self.postMessage({ok:false,error:String(err&&err.message||err)});}};";
      var blob = new Blob([workerCode], { type: "application/javascript" });
      var url = URL.createObjectURL(blob);
      var worker = new Worker(url);
      var timer = setTimeout(function () {
        worker.terminate();
        URL.revokeObjectURL(url);
        reject(new Error("pow-timeout"));
      }, timeoutMs + 500);
      worker.onmessage = function (ev) {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        if (ev.data && ev.data.ok) resolve(ev.data.counter);
        else reject(new Error((ev.data && ev.data.error) || "pow-failed"));
      };
      worker.onerror = function () {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        reject(new Error("worker-failed"));
      };
      worker.postMessage({ nonce: nonce, difficulty: difficulty, timeoutMs: timeoutMs });
    });
  }

  async function solvePow(nonce, difficulty) {
    var timeoutMs = 12000;
    try {
      if (typeof Worker !== "undefined") {
        return await solvePowWorker(nonce, difficulty, timeoutMs);
      }
    } catch (_) {}
    return solvePowMain(nonce, difficulty, timeoutMs);
  }

  async function api(path, body) {
    var res = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
    });
    var data = await res.json().catch(function () {
      return { success: false, error: "bad-json" };
    });
    if (!res.ok || !data.success) {
      var err = new Error(data.error || "request-failed");
      err.payload = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function fetchConfig(sitekey) {
    var res = await fetch(
      API_BASE + "/api/config?sitekey=" + encodeURIComponent(sitekey),
      { credentials: "omit" },
    );
    var data = await res.json().catch(function () {
      return { success: false };
    });
    if (!res.ok || !data.success) throw new Error(data.error || "config-failed");
    return data;
  }

  function setBusy(state, busy) {
    if (!state.check) return;
    state.check.disabled = busy;
    state.check.classList.toggle("is-busy", busy);
    state.check.innerHTML = busy ? '<span class="cis-spin"></span>' : "";
  }

  function setDone(state, token) {
    state.token = token;
    if (state.check) {
      state.check.classList.remove("is-busy");
      state.check.classList.add("is-ok");
      state.check.disabled = true;
      state.check.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="#15803d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (state.label) {
      state.label.textContent = "You are human";
    }
    if (state.badge) {
      state.badge.innerHTML = "You are human";
    }
    if (state.input) state.input.value = token;
    if (state.el) {
      state.el.setAttribute("data-verified", "1");
      state.el.setAttribute("data-token", token || "");
    }
    if (typeof state.callback === "function") state.callback(token);
  }

  function showError(state, msg) {
    if (state.err) state.err.textContent = msg || "";
    if (typeof state.errorCallback === "function") state.errorCallback(msg);
  }

  function openImageModal(challenge) {
    return new Promise(function (resolve, reject) {
      var modal = document.createElement("div");
      modal.className = "cis-modal";
      modal.innerHTML =
        '<div class="cis-panel" role="dialog" aria-modal="true">' +
        "<h3>Verification</h3>" +
        "<p>" +
        (challenge.prompt || "Select the matching tiles") +
        "</p>" +
        '<div class="cis-grid"></div>' +
        '<div class="cis-actions">' +
        '<button type="button" class="cis-btn ghost" data-act="cancel">Cancel</button>' +
        '<button type="button" class="cis-btn primary" data-act="ok">Verify</button>' +
        "</div></div>";

      var grid = modal.querySelector(".cis-grid");
      var selected = {};
      (challenge.tiles || []).forEach(function (tile) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cis-tile";
        if (tile.url) {
          var img = document.createElement("img");
          img.src = (API_BASE || "") + tile.url;
          img.alt = "";
          img.loading = "eager";
          img.draggable = false;
          btn.appendChild(img);
        } else if (tile.svg) {
          btn.innerHTML = tile.svg;
        }
        btn.addEventListener("click", function () {
          if (selected[tile.i]) {
            delete selected[tile.i];
            btn.classList.remove("sel");
          } else {
            selected[tile.i] = true;
            btn.classList.add("sel");
          }
        });
        grid.appendChild(btn);
      });

      function close() {
        modal.remove();
      }

      modal.querySelector('[data-act="cancel"]').addEventListener("click", function () {
        close();
        reject(new Error("cancelled"));
      });
      modal.querySelector('[data-act="ok"]').addEventListener("click", function () {
        var answers = Object.keys(selected)
          .map(Number)
          .sort(function (a, b) {
            return a - b;
          });
        close();
        resolve(answers);
      });
      modal.addEventListener("click", function (ev) {
        if (ev.target === modal) {
          close();
          reject(new Error("cancelled"));
        }
      });

      document.body.appendChild(modal);
    });
  }

  async function runImageFlow(state) {
    var challenge = await api("/api/challenge", {
      sitekey: state.sitekey,
      type: "image",
    });
    var answers = await openImageModal(challenge);
    var solved = await api("/api/solve", {
      sitekey: state.sitekey,
      challenge: challenge.challenge,
      answers: JSON.stringify(answers),
    });
    return solved.response;
  }

  async function runPowFlow(state, allowImageFallback) {
    var challenge = await api("/api/challenge", {
      sitekey: state.sitekey,
      type: "pow",
    });
    try {
      var counter = await solvePow(challenge.nonce, challenge.difficulty);
      var solved = await api("/api/solve", {
        sitekey: state.sitekey,
        challenge: challenge.challenge,
        counter: counter,
      });
      return solved.response;
    } catch (e) {
      if (!allowImageFallback) throw e;
      return runImageFlow(state);
    }
  }

  async function runFlow(state) {
    showError(state, "");
    setBusy(state, true);
    if (state.badge) {
      state.badge.innerHTML =
        '<span class="cis-spin"></span> Captcha is checking…';
    }
    try {
      var token;
      if (state.mode === "image") {
        token = await runImageFlow(state);
      } else if (state.mode === "invisible") {
        token = await runPowFlow(state, false);
      } else {
        // checkbox / undercover
        token = await runPowFlow(state, true);
      }
      setDone(state, token);
    } catch (err) {
      setBusy(state, false);
      if (state.check) state.check.innerHTML = "";
      if (state.badge) state.badge.innerHTML = "Captcha is · failed";
      showError(state, "Verification failed. Try again.");
    }
  }

  function renderCheckboxUI(el, state) {
    var root = document.createElement("div");
    root.className = "cis-root";
    root.innerHTML =
      '<div class="cis-box">' +
      '<button type="button" class="cis-check" aria-label="I am not a robot"></button>' +
      '<div class="cis-label">I am not a robot</div>' +
      '<div class="cis-brand">Captcha is<br><span>privacy</span></div>' +
      "</div>" +
      '<div class="cis-err" aria-live="polite"></div>';
    state.check = root.querySelector(".cis-check");
    state.label = root.querySelector(".cis-label");
    state.err = root.querySelector(".cis-err");
    state.check.addEventListener("click", function () {
      if (state.token) return;
      runFlow(state);
    });
    el.appendChild(root);
  }

  function renderImageUI(el, state) {
    var root = document.createElement("div");
    root.className = "cis-root";
    root.innerHTML =
      '<div class="cis-box">' +
      '<button type="button" class="cis-check" aria-label="Start image captcha"></button>' +
      '<div class="cis-label">Click to verify</div>' +
      '<div class="cis-brand">Captcha is<br><span>image check</span></div>' +
      "</div>" +
      '<div class="cis-err" aria-live="polite"></div>';
    state.check = root.querySelector(".cis-check");
    state.label = root.querySelector(".cis-label");
    state.err = root.querySelector(".cis-err");
    state.check.addEventListener("click", function () {
      if (state.token) return;
      runFlow(state);
    });
    el.appendChild(root);
  }

  function renderInvisibleUI(el, state) {
    var root = document.createElement("div");
    root.className = "cis-root";
    root.innerHTML =
      '<div class="cis-badge" aria-live="polite">Captcha is · starting…</div>' +
      '<div class="cis-err" aria-live="polite"></div>';
    state.badge = root.querySelector(".cis-badge");
    state.err = root.querySelector(".cis-err");
    el.appendChild(root);
  }

  function render(container, options) {
    ensureStyles();
    options = options || {};
    var el =
      typeof container === "string" ? document.querySelector(container) : container;
    if (!el) throw new Error("captchais: container not found");

    var sitekey = options.sitekey || el.getAttribute("data-sitekey") || "";
    if (!sitekey) throw new Error("captchais: sitekey required");

    el.innerHTML = "";
    var input = document.createElement("input");
    input.type = "hidden";
    input.value = "";
    input.autocomplete = "off";

    var formEarly = el.closest("form");
    var externalField =
      formEarly &&
      (formEarly.querySelector("#rh-captcha-token") ||
        formEarly.querySelector(".rh-captcha-token-field"));
    // Prefer a single named form field — duplicate empty captcha_token values break Express parsing.
    if (externalField) {
      input.removeAttribute("name");
      input.setAttribute("data-cis-internal", "1");
    } else {
      input.name =
        options["response-field"] ||
        el.getAttribute("data-response-field") ||
        "captcha_token";
    }

    var state = {
      el: el,
      sitekey: sitekey,
      mode: options.mode || el.getAttribute("data-mode") || "checkbox",
      callback: options.callback,
      errorCallback: options["error-callback"] || options.errorCallback,
      check: null,
      label: null,
      badge: null,
      err: null,
      input: input,
      token: "",
    };

    // Keep the payload field in light DOM so normal form POSTs include it.
    el.appendChild(input);

    // Also sync into a sibling/form field named captcha_token when present.
    function syncExternal(token) {
      var form = el.closest("form");
      if (!form) return;
      var external =
        form.querySelector("#rh-captcha-token") ||
        form.querySelector('input[name="captcha_token"]');
      if (external && external !== input) external.value = token || "";
    }
    var prevCallback = state.callback;
    state.callback = function (token) {
      syncExternal(token);
      if (typeof prevCallback === "function") prevCallback(token);
    };

    var form = el.closest("form");
    if (form && !form.__cisSubmitBound) {
      form.__cisSubmitBound = true;
      form.addEventListener(
        "submit",
        function (ev) {
          var field =
            form.querySelector("#rh-captcha-token") ||
            form.querySelector('input[name="captcha_token"]') ||
            form.querySelector('input[name="captcha-is-response"]');
          var widget = form.querySelector(".captcha-is, .cis-captcha");
          var token =
            (field && field.value) ||
            (widget && widget.getAttribute("data-token")) ||
            (state.input && state.input.value) ||
            state.token ||
            "";
          if (field && token) field.value = token;
          if (state.input && token) state.input.value = token;
          if (!token) {
            ev.preventDefault();
            var err = form.querySelector(".cis-err");
            if (err) err.textContent = "Complete the captcha first.";
          }
        },
        true
      );
    }

    var boot = Promise.resolve();
    if (!options.mode && !el.getAttribute("data-mode")) {
      boot = fetchConfig(sitekey)
        .then(function (cfg) {
          state.mode = cfg.mode || "checkbox";
        })
        .catch(function () {
          state.mode = "checkbox";
        });
    }

    boot.then(function () {
      if (state.mode === "invisible") {
        renderInvisibleUI(el, state);
        runFlow(state);
      } else if (state.mode === "image") {
        renderImageUI(el, state);
      } else {
        renderCheckboxUI(el, state);
      }
    });

    return {
      getResponse: function () {
        return state.token;
      },
      reset: function () {
        state.token = "";
        input.value = "";
        showError(state, "");
        el.removeAttribute("data-verified");
        el.removeAttribute("data-token");
        el.innerHTML = "";
        el.appendChild(input);
        if (state.mode === "invisible") {
          renderInvisibleUI(el, state);
          runFlow(state);
        } else if (state.mode === "image") {
          renderImageUI(el, state);
        } else {
          renderCheckboxUI(el, state);
        }
      },
      execute: function () {
        if (state.token) return Promise.resolve(state.token);
        return runFlow(state).then(function () {
          return state.token;
        });
      },
    };
  }

  function autoRender() {
    var nodes = document.querySelectorAll(".captcha-is, .cis-captcha, .snub-captcha");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-cis-rendered")) continue;
      nodes[i].setAttribute("data-cis-rendered", "1");
      try {
        render(nodes[i], {
          sitekey: nodes[i].getAttribute("data-sitekey"),
          mode: nodes[i].getAttribute("data-mode") || undefined,
          "response-field":
            nodes[i].getAttribute("data-response-field") || undefined,
          callback: global[nodes[i].getAttribute("data-callback")],
        });
      } catch (e) {
        console.error(e);
      }
    }
  }

  var apiObj = {
    render: render,
    ready: function (fn) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", fn);
      } else {
        fn();
      }
    },
  };

  global.captchais = apiObj;
  global.CaptchaIs = apiObj;
  global.snubcaptcha = apiObj;
  global.SnubCaptcha = apiObj;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoRender);
  } else {
    autoRender();
  }
})(typeof window !== "undefined" ? window : this);
