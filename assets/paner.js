/* PanER Fasteners · клиентска логика
   - добавяне към запитването (Shopify Cart API, без плащане)
   - броячи, групово добавяне, опаковки
   - филтри и страници без презареждане (Section Rendering API)
   - бързо търсене, мобилни панели, табове, страница „Запитване“ */
(function () {
  'use strict';

  var root = window.Shopify && window.Shopify.routes ? window.Shopify.routes.root : '/';
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(html, isError) {
    var el = $('[data-paner-toast]');
    if (!el) return;
    el.innerHTML = html;
    el.classList.toggle('is-error', !!isError);
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('is-visible'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.hidden = true; }, 250);
    }, 3600);
  }

  /* ---------- Cart (= списък за запитване) ---------- */
  function updateCount(count) {
    $$('[data-paner-count]').forEach(function (el) {
      el.textContent = count;
      if (el.classList.contains('paner-hbtn__badge') || el.classList.contains('paner-mnav__badge')) el.hidden = count === 0;
    });
    $$('[data-paner-count-label]').forEach(function (el) { el.textContent = count === 1 ? 'артикул' : 'артикула'; });
  }
  function refreshCount() {
    return fetch(root + 'cart.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (c) { updateCount(c.items.length); return c; });
  }
  function addItems(items) {
    return fetch(root + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.description || data.message || 'Грешка при добавяне');
        return data;
      });
    }).then(function (data) { refreshCount(); return data; });
  }

  function readRow(row) {
    var qtyEl = $('[data-paner-qty]', row);
    var qty = Math.max(1, parseInt(qtyEl && qtyEl.value, 10) || 1);
    var packEl = $('[data-paner-pack]:checked', row) || $('select[data-paner-pack]', row) || $('[data-paner-pack-fixed]', row);
    var packName = 'Кутия', pcs = 1;
    if (packEl) {
      if (packEl.tagName === 'SELECT') {
        var opt = packEl.options[packEl.selectedIndex];
        packName = opt.value; pcs = parseInt(opt.getAttribute('data-pcs'), 10) || 1;
      } else {
        packName = packEl.value; pcs = parseInt(packEl.getAttribute('data-pcs'), 10) || 1;
      }
    }
    return {
      id: parseInt(row.getAttribute('data-variant-id'), 10),
      quantity: qty,
      properties: { 'Опаковка': packName, 'В опаковка': pcs + ' бр.', '_pcs': String(pcs) }
    };
  }

  function addedMessage(n) {
    return '<span>✓ ' + (n > 1 ? n + ' артикула са добавени' : 'Добавено') + ' към запитването</span> <a href="' + root + 'cart">Към запитването →</a>';
  }

  document.addEventListener('click', function (e) {
    /* single add */
    var addBtn = e.target.closest('[data-paner-add]');
    if (addBtn) {
      var row = addBtn.closest('[data-paner-row]');
      if (!row) return;
      addBtn.disabled = true;
      addItems([readRow(row)]).then(function () {
        addBtn.classList.add('is-added');
        toast(addedMessage(1));
        setTimeout(function () { addBtn.classList.remove('is-added'); }, 1800);
      }).catch(function (err) { toast(err.message, true); })
        .finally(function () { addBtn.disabled = false; });
      return;
    }

    /* stepper */
    var step = e.target.closest('[data-paner-step]');
    if (step) {
      var input = $('[data-paner-qty]', step.closest('[data-paner-stepper]'));
      var min = parseInt(input.min, 10) || 0;
      var next = Math.max(min, (parseInt(input.value, 10) || 0) + parseInt(step.getAttribute('data-paner-step'), 10));
      input.value = next;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    /* bulk add */
    var bulk = e.target.closest('[data-paner-bulk-add]');
    if (bulk) {
      var scope = bulk.closest('[data-paner-bulk-scope]');
      var items = $$('[data-paner-select]:checked', scope).map(function (cb) { return readRow(cb.closest('[data-paner-row]')); });
      if (!items.length) return;
      bulk.disabled = true;
      addItems(items).then(function () {
        toast(addedMessage(items.length));
        $$('[data-paner-select]:checked, [data-paner-select-all]', scope).forEach(function (cb) { cb.checked = false; });
        updateBulk(scope);
      }).catch(function (err) { toast(err.message, true); })
        .finally(function () { bulk.disabled = false; });
      return;
    }

    /* view toggle */
    var viewBtn = e.target.closest('[data-paner-set-view]');
    if (viewBtn) {
      var v = viewBtn.getAttribute('data-paner-set-view');
      $$('[data-paner-view]').forEach(function (el) { el.setAttribute('data-paner-view', v); });
      try { localStorage.setItem('paner-view', v); } catch (err) { /* noop */ }
      markView(v);
      return;
    }

    /* filters sheet */
    if (e.target.closest('[data-paner-filters-open]')) { document.documentElement.classList.add('paner-filters-open'); return; }
    if (e.target.closest('[data-paner-filters-close]')) { document.documentElement.classList.remove('paner-filters-open'); return; }

    /* show more filter values */
    var more = e.target.closest('[data-paner-more]');
    if (more) {
      $$('.paner-checks__more', more.parentElement).forEach(function (li) { li.hidden = false; });
      more.remove();
      return;
    }

    /* ajax links (tags, pagination, clear) */
    var ajaxLink = e.target.closest('a[data-paner-ajax]');
    if (ajaxLink && ajaxLink.closest('[data-paner-collection]')) {
      e.preventDefault();
      loadResults(ajaxLink.href, true);
      return;
    }

    /* drawer close */
    if (e.target.closest('[data-paner-drawer-close]')) {
      var d = e.target.closest('details');
      if (d) d.open = false;
      return;
    }

    /* close dropdowns on outside click */
    $$('[data-paner-dd][open]').forEach(function (dd) { if (!dd.contains(e.target)) dd.open = false; });

    /* mobile nav search focus */
    var fs = e.target.closest('[data-paner-focus-search]');
    if (fs) {
      var si = $('[data-paner-search-input]');
      if (si && window.getComputedStyle(si).display !== 'none') { e.preventDefault(); si.focus(); si.scrollIntoView({ block: 'center' }); }
      return;
    }

    /* tabs */
    var tab = e.target.closest('[data-paner-tabs] [role="tab"]');
    if (tab) {
      var tabs = tab.closest('[data-paner-tabs]');
      $$('[role="tab"]', tabs).forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      return;
    }

    /* print */
    if (e.target.closest('[data-paner-print]')) { window.print(); return; }
  });

  /* ---------- Bulk selection ---------- */
  function updateBulk(scope) {
    if (!scope) return;
    var n = $$('[data-paner-select]:checked', scope).length;
    var bar = $('[data-paner-bulkbar]', scope);
    if (bar) { bar.hidden = n === 0; var c = $('[data-paner-bulk-count]', bar); if (c) c.textContent = n; }
    $$('[data-paner-select]', scope).forEach(function (cb) {
      var row = cb.closest('[data-paner-row]');
      if (row) row.classList.toggle('is-selected', cb.checked);
    });
  }
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-paner-select-all]')) {
      var scope = t.closest('[data-paner-bulk-scope]');
      $$('[data-paner-select]:not(:disabled)', scope).forEach(function (cb) { cb.checked = t.checked; });
      updateBulk(scope);
    } else if (t.matches('[data-paner-select]')) {
      updateBulk(t.closest('[data-paner-bulk-scope]'));
    }
    /* product page calc */
    var hints = t.closest('[data-paner-hints]');
    if (hints) updateHints(hints);
    /* filters */
    if (t.closest('[data-paner-filters]')) {
      var form = t.closest('form');
      if (t.type === 'number') return; /* price inputs: wait for blur/enter */
      submitFilters(form);
    }
    if (t.matches('[data-paner-sort]')) {
      var f = $('[data-paner-filters]');
      if (f) { $('[data-paner-sort-hidden]', f).value = t.value; submitFilters(f); }
    }
    /* cart qty */
    if (t.matches('[data-paner-line]')) changeLine(t.getAttribute('data-paner-line'), Math.max(0, parseInt(t.value, 10) || 0));
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.matches('[data-paner-filters] input[type="number"]')) submitFilters(e.target.form);
  });

  /* ---------- Product page hints ---------- */
  function updateHints(box) {
    var data = readRow(box);
    var total = data.quantity * parseInt(data.properties._pcs, 10);
    var tEl = $('[data-paner-total]', box);
    if (tEl) tEl.textContent = total.toLocaleString('bg-BG');
    var w = $('[data-paner-weight]', box);
    if (w) { var per = parseFloat(String(w.getAttribute('data-per100')).replace(',', '.')); if (per) w.textContent = (total * per / 100).toLocaleString('bg-BG', { maximumFractionDigits: 1 }); }
    var nx = $('[data-paner-next]', box);
    if (nx) {
      var perBox = parseInt(nx.getAttribute('data-box'), 10) || 1;
      var boxesPerCarton = parseInt(nx.getAttribute('data-carton'), 10) || 0;
      var boxes = Math.ceil(total / perBox);
      nx.textContent = (data.properties['Опаковка'] === 'Кутия' && boxesPerCarton > boxes) ? ' · още ' + (boxesPerCarton - boxes) + ' кутии до цял кашон' : '';
    }
  }
  $$('[data-paner-hints]').forEach(updateHints);

  /* ---------- Filters (AJAX) ---------- */
  function sectionUrl(url) {
    var wrap = $('[data-paner-collection]');
    var u = new URL(url, window.location.origin);
    u.searchParams.set('section_id', wrap.getAttribute('data-section-id'));
    return u.toString();
  }
  var loading;
  function loadResults(url, push) {
    var wrap = $('[data-paner-collection]');
    if (!wrap) { window.location.href = url; return; }
    var target = $('[data-paner-ajax-root]', wrap);
    if (loading) loading.abort();
    loading = new AbortController();
    wrap.classList.add('is-loading');
    fetch(sectionUrl(url), { signal: loading.signal })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var fresh = doc.querySelector('[data-paner-ajax-root]');
        if (fresh && target) {
          var openGroups = $$('.paner-fgroup', target).map(function (d) { return d.open; });
          target.innerHTML = fresh.innerHTML;
          $$('.paner-fgroup', target).forEach(function (d, i) { if (openGroups[i] !== undefined) d.open = openGroups[i]; });
          var v; try { v = localStorage.getItem('paner-view'); } catch (err) { v = null; }
          if (v) { $$('[data-paner-view]').forEach(function (el) { el.setAttribute('data-paner-view', v); }); markView(v); }
          else markView();
        }
        if (push) history.pushState({ paner: true }, '', url);
        wrap.classList.remove('is-loading');
      })
      .catch(function (err) { if (err.name !== 'AbortError') window.location.href = url; });
  }
  function submitFilters(form) {
    var params = new URLSearchParams(new FormData(form));
    $$('input[type="number"]', form).forEach(function (i) { if (!i.value) params.delete(i.name); });
    if (!params.get('sort_by')) params.delete('sort_by');
    var url = window.location.pathname + '?' + params.toString();
    loadResults(url, true);
  }
  document.addEventListener('submit', function (e) {
    if (e.target.matches('[data-paner-filters]')) { e.preventDefault(); submitFilters(e.target); }
  });
  window.addEventListener('popstate', function () { if ($('[data-paner-collection]')) loadResults(window.location.href, false); });

  function markView(v) {
    var el = $('[data-paner-view]');
    if (!el) return;
    v = v || el.getAttribute('data-paner-view');
    $$('[data-paner-set-view]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-paner-set-view') === v ? 'true' : 'false'); });
  }
  (function initView() {
    var v; try { v = localStorage.getItem('paner-view'); } catch (err) { v = null; }
    if (v) $$('[data-paner-view]').forEach(function (el) { el.setAttribute('data-paner-view', v); });
    markView();
  })();

  /* ---------- Predictive search ---------- */
  (function () {
    var form = $('[data-paner-search]');
    if (!form) return;
    var input = $('[data-paner-search-input]', form);
    var box = $('[data-paner-search-results]', form);
    var timer, ctrl;
    function close() { box.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 2) { close(); return; }
      timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        var url = root + 'search/suggest?q=' + encodeURIComponent(q) +
          '&resources[type]=product,collection&resources[limit]=6&resources[options][fields]=title,variants.sku,product_type,tag&section_id=paner-predictive-search';
        fetch(url, { signal: ctrl.signal }).then(function (r) { return r.text(); }).then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var res = doc.querySelector('[data-paner-ps]');
          box.innerHTML = res ? res.outerHTML : '';
          box.hidden = !res;
          input.setAttribute('aria-expanded', res ? 'true' : 'false');
        }).catch(function () { /* noop */ });
      }, 220);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.addEventListener('click', function (e) { if (!form.contains(e.target)) close(); });
    var scope = $('[data-paner-search-scope]', form);
    form.addEventListener('submit', function () { if (scope && !scope.value) scope.disabled = true; });
  })();

  /* ---------- Recommendations ---------- */
  $$('[data-paner-recs]').forEach(function (el) {
    function load(url) {
      return fetch(url).then(function (r) { return r.text(); }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var list = doc.querySelector('.paner-related__list');
        return list && list.children.length ? list : null;
      });
    }
    load(el.getAttribute('data-url')).then(function (list) {
      return list || load(el.getAttribute('data-fallback'));
    }).then(function (list) {
      if (list) el.replaceWith(list);
      else { var aside = el.closest('.paner-related'); if (aside) aside.remove(); }
    }).catch(function () { /* noop */ });
  });

  /* ---------- Cart / inquiry page ---------- */
  function reloadCart() {
    var wrap = $('[data-paner-cart]');
    if (!wrap) return Promise.resolve();
    wrap.classList.add('is-loading');
    return fetch(root + 'cart?section_id=' + wrap.getAttribute('data-section-id'))
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var fresh = doc.querySelector('[data-paner-cart]');
        if (fresh) wrap.innerHTML = fresh.innerHTML;
        wrap.classList.remove('is-loading');
        refreshCount();
      });
  }
  function changeLine(line, qty) {
    return fetch(root + 'cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ line: parseInt(line, 10), quantity: qty })
    }).then(function (r) { if (!r.ok) return r.json().then(function (d) { throw new Error(d.description || d.message); }); })
      .then(reloadCart)
      .catch(function (err) { toast(err.message, true); reloadCart(); });
  }
  document.addEventListener('click', function (e) {
    var rm = e.target.closest('[data-paner-remove]');
    if (rm) { changeLine(rm.getAttribute('data-paner-remove'), 0); return; }
    if (e.target.closest('[data-paner-clear]')) {
      if (!window.confirm('Да изчистя ли целия списък?')) return;
      fetch(root + 'cart/clear.js', { method: 'POST', headers: { Accept: 'application/json' } }).then(reloadCart);
      return;
    }
    var addCode = e.target.closest('[data-paner-addcode-btn]');
    if (addCode) { addByCode(addCode.closest('[data-paner-addcode]')); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.matches('[data-paner-addcode-q], [data-paner-addcode-qty]')) { e.preventDefault(); addByCode(e.target.closest('[data-paner-addcode]')); }
    if (e.target.matches('[data-paner-qty]') && e.target.form && e.target.form.id === 'PanerCartInquiry') { e.preventDefault(); e.target.blur(); }
  });
  function addByCode(box) {
    var q = $('[data-paner-addcode-q]', box).value.trim();
    var qty = Math.max(1, parseInt($('[data-paner-addcode-qty]', box).value, 10) || 1);
    var msg = $('[data-paner-addcode-msg]', box);
    if (!q) return;
    msg.hidden = false; msg.textContent = 'Търся…';
    fetch(root + 'search?q=' + encodeURIComponent(q) + '&type=product&options%5Bprefix%5D=last&view=paner-sku')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.found) { msg.textContent = 'Не е намерен артикул за „' + q + '“.'; return; }
        if (!d.available) { msg.textContent = d.title + ' — в момента е изчерпан. Опишете го в бележката.'; return; }
        return addItems([{ id: d.id, quantity: qty, properties: { 'Опаковка': 'Кутия', 'В опаковка': d.pcs + ' бр.', '_pcs': String(d.pcs) } }])
          .then(function () {
            msg.textContent = '✓ Добавен: ' + d.title + (d.exact ? '' : ' (най-близък резултат)');
            return reloadCart();
          });
      })
      .catch(function (err) { msg.textContent = err.message || 'Грешка — опитайте отново.'; });
  }
  /* clear list after a successful inquiry */
  if ($('[data-paner-cart-done]')) {
    fetch(root + 'cart/clear.js', { method: 'POST', headers: { Accept: 'application/json' } }).then(function () { updateCount(0); });
  }

  /* ---------- Contact page: prefill product from URL ---------- */
  (function () {
    var params = new URLSearchParams(window.location.search);
    var product = params.get('contact[Продукт]');
    if (!product) return;
    var body = $('form#ContactForm textarea[name="contact[body]"]') || $('textarea[name="contact[body]"]');
    if (body && !body.value) body.value = 'Запитване за: ' + product + '\n';
  })();

  /* ---------- Drawer: close on Escape ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    $$('[data-paner-drawer][open], [data-paner-dd][open]').forEach(function (d) { d.open = false; });
    document.documentElement.classList.remove('paner-filters-open');
  });
})();
