document.addEventListener('DOMContentLoaded', () => {
  const I18N = window.REEDHALL_I18N || {};

  const topbar = document.querySelector('.topbar');
  if (topbar) {
    const onScroll = () => topbar.classList.toggle('is-solid', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  const estateSelect = document.getElementById('estate-servers');
  const estatePrice = document.getElementById('estate-price-display');
  const estateCta = document.getElementById('estate-cta');
  if (estateSelect && estatePrice) {
    const syncEstate = () => {
      const n = Number(estateSelect.value) || 10;
      const packs = { 10: 24, 25: 42, 50: 75, 100: 129 };
      const price = packs[n] || Math.max(24, Math.round(12 + n * 1.8));
      estatePrice.textContent = `€${price}`;
      if (estateCta) {
        estateCta.setAttribute('href', `/account?plan=estate&servers=${n}`);
      }
    };
    estateSelect.addEventListener('input', syncEstate);
    estateSelect.addEventListener('change', syncEstate);
    syncEstate();
  }

  const accountPlan = document.getElementById('account-plan');
  const estatePackWrap = document.getElementById('estate-pack-wrap');
  const estateHint = document.getElementById('estate-price-hint');
  const estateServersInput = document.getElementById('account-estate-servers');
  if (accountPlan && estatePackWrap) {
    const syncPack = () => {
      const show = accountPlan.value === 'estate';
      estatePackWrap.style.display = show ? '' : 'none';
      if (estateHint) estateHint.style.display = show ? '' : 'none';
    };
    const syncPrice = () => {
      if (!estateHint || !estateServersInput) return;
      const n = Number(estateServersInput.value) || 10;
      const packs = { 10: 24, 25: 42, 50: 75, 100: 129 };
      const price = packs[n] || Math.max(24, Math.round(12 + n * 1.8));
      estateHint.textContent = `Indicatieprijs: €${price}/mo`;
    };
    accountPlan.addEventListener('change', syncPack);
    if (estateServersInput) estateServersInput.addEventListener('input', syncPrice);
    syncPack();
    syncPrice();

    const params = new URLSearchParams(location.search);
    if (params.get('plan') === 'estate') {
      accountPlan.value = 'estate';
      const servers = params.get('servers');
      if (servers && estateServersInput) estateServersInput.value = servers;
      syncPack();
      syncPrice();
    }
  }

  const pollOptions = document.getElementById('poll-options');
  const pollAdd = document.getElementById('poll-add-option');
  if (pollOptions && pollAdd) {
    const max = Number(pollOptions.dataset.max) || 10;
    const min = 2;
    const answerWord = I18N.pollAnswer || 'Answer';
    const goodWord = I18N.pollGood || 'Correct';
    const removeAria = I18N.removeAria || 'Remove';

    const reindex = () => {
      [...pollOptions.querySelectorAll('.poll-option-row')].forEach((row, i) => {
        row.dataset.index = String(i);
        const label = row.querySelector('.poll-option-label');
        if (label) label.textContent = `${answerWord} ${i + 1}`;
        const good = row.querySelector('input[name="option_good"]');
        if (good) good.value = String(i);
        const remove = row.querySelector('.poll-option-remove');
        if (remove) remove.disabled = pollOptions.children.length <= min;
      });
      pollAdd.disabled = pollOptions.children.length >= max;
    };

    const addRow = (focus) => {
      if (pollOptions.children.length >= max) return;
      const i = pollOptions.children.length;
      const row = document.createElement('div');
      row.className = 'poll-option-row';
      row.innerHTML = `
        <span class="poll-option-label">${answerWord} ${i + 1}</span>
        <input name="option_label" type="text" maxlength="80" placeholder="${answerWord}…" required />
        <input name="option_emoji" type="text" maxlength="8" placeholder="🔹" class="poll-emoji" />
        <label class="poll-good">
          <input type="checkbox" name="option_good" value="${i}" />
          ${goodWord}
        </label>
        <button type="button" class="btn ghost small poll-option-remove" aria-label="${removeAria}">−</button>
      `;
      row.querySelector('.poll-option-remove').addEventListener('click', () => {
        if (pollOptions.children.length <= min) return;
        row.remove();
        reindex();
      });
      pollOptions.appendChild(row);
      reindex();
      if (focus) row.querySelector('input[name="option_label"]')?.focus();
    };

    addRow(false);
    addRow(false);
    pollAdd.addEventListener('click', () => addRow(true));
  }

  document.querySelectorAll('.ticket-questions-wrap').forEach((wrap) => {
    const list = wrap.querySelector('.ticket-questions-list');
    const addBtn = wrap.querySelector('.ticket-q-add');
    if (!list || !addBtn) return;

    const max = Number(wrap.dataset.max) || 5;
    const questionWord = I18N.ticketQuestion || 'Question';
    const styleParagraph = I18N.ticketStyleParagraph || 'Long answer';
    const styleShort = I18N.ticketStyleShort || 'Short answer';
    const requiredLabel = I18N.ticketQuestionRequired || 'Required';
    const labelPlaceholder = I18N.ticketQuestionPlaceholder || 'What do you need help with?';
    const fieldPlaceholderLabel = I18N.ticketFieldPlaceholder || 'Hint in Discord';
    const fieldPlaceholderExample =
      I18N.ticketFieldPlaceholderExample || 'e.g. Describe your issue…';
    const removeAria = I18N.removeAria || 'Remove';

    const reindex = () => {
      [...list.querySelectorAll('.ticket-q-row')].forEach((row, i) => {
        const n = i + 1;
        const labelEl = row.querySelector('.ticket-q-label');
        if (labelEl) labelEl.textContent = `${questionWord} ${n}`;
        row.querySelectorAll('[data-q-field]').forEach((input) => {
          const field = input.getAttribute('data-q-field');
          input.name = `q${n}_${field}`;
        });
        const remove = row.querySelector('.ticket-q-remove');
        if (remove) remove.disabled = list.children.length <= 0;
      });
      addBtn.disabled = list.children.length >= max;
    };

    const bindRemove = (row) => {
      row.querySelector('.ticket-q-remove')?.addEventListener('click', () => {
        row.remove();
        reindex();
      });
    };

    const addRow = (values, focus) => {
      if (list.children.length >= max) return;
      const row = document.createElement('div');
      row.className = 'ticket-q-row';
      row.innerHTML = `
        <label><span class="ticket-q-label">${questionWord}</span>
          <input data-q-field="label" type="text" maxlength="45" placeholder="${labelPlaceholder}" value="${values?.label || ''}" />
        </label>
        <label>${fieldPlaceholderLabel}
          <input data-q-field="placeholder" type="text" maxlength="100" placeholder="${fieldPlaceholderExample}" value="${values?.placeholder || ''}" />
        </label>
        <label>${I18N.ticketQuestionStyle || 'Type'}
          <select data-q-field="style">
            <option value="paragraph" ${!values || values.style !== 'short' ? 'selected' : ''}>${styleParagraph}</option>
            <option value="short" ${values && values.style === 'short' ? 'selected' : ''}>${styleShort}</option>
          </select>
        </label>
        <label class="check-inline">
          <input data-q-field="required" type="checkbox" value="1" ${!values || values.required !== false ? 'checked' : ''} />
          ${requiredLabel}
        </label>
        <button type="button" class="ticket-q-remove" aria-label="${removeAria}">−</button>
      `;
      bindRemove(row);
      list.appendChild(row);
      reindex();
      if (focus) row.querySelector('[data-q-field="label"]')?.focus();
    };

    [...list.querySelectorAll('.ticket-q-row')].forEach(bindRemove);
    reindex();
    addBtn.addEventListener('click', () => addRow(null, true));
  });

  const inviteMode = document.getElementById('staff-invite-mode');
  const memberWrap = document.getElementById('staff-member-wrap');
  const roleWrap = document.getElementById('staff-role-wrap');
  const userSelect = document.getElementById('staff-user-select');
  const roleSelect = document.getElementById('staff-role-select');
  const usernameHidden = document.getElementById('staff-username');
  const inviteHint = document.getElementById('staff-invite-hint');
  const inviteForm = document.getElementById('staff-invite-form');

  const syncInviteMode = () => {
    if (!inviteMode) return;
    const byRole = inviteMode.value === 'role';
    if (memberWrap) memberWrap.hidden = byRole;
    if (roleWrap) roleWrap.hidden = !byRole;
    if (userSelect) {
      userSelect.required = !byRole;
      userSelect.disabled = byRole;
    }
    if (roleSelect) {
      roleSelect.required = byRole;
      roleSelect.disabled = !byRole;
    }
    if (inviteHint) {
      inviteHint.textContent = byRole
        ? I18N.inviteHintRole || inviteHint.textContent
        : I18N.inviteHintMember || inviteHint.textContent;
    }
  };

  if (inviteMode) {
    inviteMode.addEventListener('change', syncInviteMode);
    syncInviteMode();
  }
  if (userSelect && usernameHidden) {
    const syncName = () => {
      const opt = userSelect.selectedOptions[0];
      usernameHidden.value = opt?.dataset?.username || '';
    };
    userSelect.addEventListener('change', syncName);
    syncName();
  }
  if (inviteForm) {
    inviteForm.addEventListener('submit', (e) => {
      if (inviteMode?.value === 'role') {
        if (!roleSelect?.value) {
          e.preventDefault();
          roleSelect?.focus();
        }
      } else if (!userSelect?.value) {
        e.preventDefault();
        userSelect?.focus();
      }
    });
  }

  const cmdUserForm = document.querySelector('.cmd-user-form');
  if (cmdUserForm) {
    cmdUserForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = cmdUserForm.querySelector('[name="cmd_user"]');
      const id = (input?.value || '').trim();
      if (!id) return;
      const base = cmdUserForm.getAttribute('action') || location.pathname;
      location.href = `${base}?cmd_user=${encodeURIComponent(id)}#commands`;
    });
  }

  const bpCats = document.getElementById('blueprint-cats');
  if (bpCats) {
    let mapOptions = [];
    try {
      mapOptions = JSON.parse(bpCats.dataset.mapOptions || '[]');
    } catch {
      mapOptions = [];
    }

    const slug = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
    const chPlaceholder = I18N.channelNamePlaceholder || '# channel-name';
    const catLabel = I18N.categoryLabel || 'Category';
    const catPlaceholder = I18N.categoryNamePlaceholder || 'Category name';
    const removeCat = I18N.removeCategory || 'Remove category';
    const addCh = I18N.addChannel || '+ Channel';
    const removeAria = I18N.removeAria || 'Remove';

    const mapSelectHtml = (selected) =>
      mapOptions
        .map(
          (o) =>
            `<option value="${String(o.value || '').replace(/"/g, '&quot;')}"${
              (o.value || '') === (selected || '') ? ' selected' : ''
            }>${o.label}</option>`
        )
        .join('');

    const bindChannelRow = (row) => {
      row.querySelector('.bp-remove-ch')?.addEventListener('click', () => {
        row.remove();
      });
    };

    const addChannelRow = (catEl, focus) => {
      const catId = catEl.dataset.catId;
      const wrap = catEl.querySelector('.bp-channels');
      if (!wrap || !catId) return;
      const chId = slug('ch');
      const row = document.createElement('div');
      row.className = 'bp-channel-row';
      row.innerHTML = `
        <input type="hidden" name="bp_ch_id_${catId}" value="${chId}" />
        <input name="bp_ch_name_${catId}" value="" placeholder="${chPlaceholder}" maxlength="100" required />
        <select name="bp_ch_map_${catId}">${mapSelectHtml('')}</select>
        <button type="button" class="btn ghost small bp-remove-ch" aria-label="${removeAria}">−</button>
      `;
      bindChannelRow(row);
      wrap.appendChild(row);
      if (focus) row.querySelector(`input[name="bp_ch_name_${catId}"]`)?.focus();
    };

    const bindCategory = (catEl) => {
      catEl.querySelector('.bp-remove-cat')?.addEventListener('click', () => {
        catEl.remove();
      });
      catEl.querySelector('.bp-add-ch')?.addEventListener('click', () => addChannelRow(catEl, true));
      catEl.querySelectorAll('.bp-channel-row').forEach(bindChannelRow);
    };

    bpCats.querySelectorAll('.bp-cat').forEach(bindCategory);

    document.getElementById('bp-add-cat')?.addEventListener('click', () => {
      const catId = slug('cat');
      const cat = document.createElement('div');
      cat.className = 'setup-block bp-cat';
      cat.dataset.catId = catId;
      cat.innerHTML = `
        <div class="bp-cat-head">
          <input type="hidden" name="bp_cat_id" value="${catId}" />
          <label class="full">${catLabel}
            <input name="bp_cat_name" value="" required maxlength="100" placeholder="${catPlaceholder}" />
          </label>
          <button type="button" class="btn ghost small bp-remove-cat">${removeCat}</button>
        </div>
        <div class="bp-channels"></div>
        <button type="button" class="btn ghost small bp-add-ch">${addCh}</button>
      `;
      bindCategory(cat);
      bpCats.appendChild(cat);
      addChannelRow(cat, false);
      cat.querySelector('input[name="bp_cat_name"]')?.focus();
    });
  }

  const buttons = [...document.querySelectorAll('[data-tab]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  if (!buttons.length || !panels.length) return;

  const activate = (id) => {
    buttons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === id));
    panels.forEach((panel) => panel.classList.toggle('is-open', panel.dataset.panel === id));
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      // ignore
    }
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => activate(btn.dataset.tab));
  });

  const fromHash = location.hash.replace('#', '');
  const initial = buttons.some((b) => b.dataset.tab === fromHash) ? fromHash : buttons[0].dataset.tab;
  activate(initial);
});
