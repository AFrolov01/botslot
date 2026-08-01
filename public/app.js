(function () {
  const tg = window.Telegram ? window.Telegram.WebApp : null;
  if (tg) {
    tg.ready();
    tg.expand();
  }
  const initData = tg ? tg.initData : '';

  const CUR_ICON = { silver: 'assets/silver.png', gold: 'assets/gold.png', chrome: 'assets/chrome.png' };
  const CUR_CLASS = { silver: 'drop-row__label--silver', gold: 'drop-row__label--gold', chrome: 'drop-row__label--chrome' };
  const CUR_LABEL = { silver: 'Серебро', gold: 'Золото', chrome: 'Хром' };

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ---------------------------------------------------------------- state
  let state = null;

  function renderBalances() {
    document.getElementById('bal-silver').textContent = state.balances.silver;
    document.getElementById('bal-gold').textContent = state.balances.gold;
    document.getElementById('bal-chrome').textContent = state.balances.chrome;
  }

  function renderOpenButton() {
    const btn = document.getElementById('open-btn');
    if (state.freeAvailable) {
      btn.textContent = 'Бесплатно';
      btn.className = 'container-card__action container-card__action--free';
    } else {
      btn.textContent = `${state.containerLPrice} 🪙`;
      btn.className = 'container-card__action container-card__action--paid';
    }
  }

  async function loadState() {
    state = await api('/api/state');
    renderBalances();
    renderOpenButton();
  }

  // ------------------------------------------------------------- screens
  const screens = { home: document.getElementById('screen-home'), valuta: document.getElementById('screen-valuta') };
  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.add('screen--hidden'));
    if (screens[name]) screens[name].classList.remove('screen--hidden');
  }

  // ------------------------------------------------------------- cases dock
  const dock = document.getElementById('cases-dock') || document.querySelector('.cases-dock');
  const casesBtn = document.getElementById('cases-btn');
  casesBtn.addEventListener('click', () => {
    document.querySelector('.cases-dock').classList.toggle('open');
  });

  document.querySelectorAll('.cases-submenu__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (btn.disabled) return;
      document.querySelector('.cases-dock').classList.remove('open');
      if (target === 'valuta') showScreen('valuta');
    });
  });

  // ------------------------------------------------------------- info modal
  const infoModal = document.getElementById('info-modal');
  document.getElementById('info-btn').addEventListener('click', async () => {
    const info = await api('/api/container-l/info');
    const table = info.table;
    const el = document.getElementById('drop-table');
    el.innerHTML = '';
    ['silver', 'gold', 'chrome'].forEach((key) => {
      const def = table[key];
      const parts = def.tiers
        .slice()
        .reverse()
        .map((t) => `${t.amount} - ${(t.chance * 100).toString().replace('.', ',')}%`);
      if (def.guaranteed) parts.unshift(`${def.guaranteed} - 100%`);
      const row = document.createElement('div');
      row.className = 'drop-row';
      row.innerHTML = `<span class="drop-row__label ${CUR_CLASS[key]}">${CUR_LABEL[key]}:</span><span class="drop-row__vals">${parts.join(', ')}</span>`;
      el.appendChild(row);
    });
    infoModal.classList.add('show');
  });
  document.getElementById('info-close').addEventListener('click', () => infoModal.classList.remove('show'));
  infoModal.addEventListener('click', (e) => { if (e.target === infoModal) infoModal.classList.remove('show'); });

  // ------------------------------------------------------------- open container
  const revealModal = document.getElementById('reveal-modal');
  const revealGrid = document.getElementById('reveal-grid');

  document.getElementById('open-btn').addEventListener('click', async () => {
    try {
      const res = await api('/api/container-l/open', { method: 'POST' });
      await loadState();
      renderReveal(res.drops);
    } catch (e) {
      if (tg) tg.showAlert(translateError(e.message));
      else alert(translateError(e.message));
    }
  });

  function translateError(code) {
    if (code === 'not_enough_silver') return 'Недостаточно серебра';
    if (code === 'pending_not_resolved') return 'Сначала заберите текущий выигрыш';
    return 'Ошибка, попробуйте ещё раз';
  }

  function renderReveal(drops) {
    revealGrid.innerHTML = '';
    ['silver', 'gold', 'chrome'].forEach((key) => {
      if (!drops[key]) return;
      const item = document.createElement('div');
      item.className = 'reveal-item';
      const amountClass = key === 'chrome' ? 'reveal-item__amount currency__amount--chrome'
        : key === 'gold' ? 'reveal-item__amount' : 'reveal-item__amount';
      item.innerHTML = `<img src="${CUR_ICON[key]}" alt="" /><span class="${amountClass}" ${key === 'gold' ? 'style="color:#FFC633"' : ''}>${drops[key]}</span>`;
      revealGrid.appendChild(item);
    });
    revealModal.classList.add('show');
  }

  document.getElementById('btn-claim').addEventListener('click', async () => {
    await api('/api/claim', { method: 'POST' });
    await loadState();
    revealModal.classList.remove('show');
  });

  // ------------------------------------------------------------- gamble wheel
  const wheelModal = document.getElementById('wheel-modal');
  const wheelEl = document.getElementById('wheel');
  const wheelTitle = document.getElementById('wheel-title');
  const wheelActionsPre = document.getElementById('wheel-actions-pre');
  const wheelActionsPost = document.getElementById('wheel-actions-post');

  document.getElementById('btn-gamble').addEventListener('click', () => {
    revealModal.classList.remove('show');
    wheelEl.style.transition = 'none';
    wheelEl.style.transform = 'rotate(0deg)';
    wheelTitle.textContent = 'Испытай удачу';
    wheelActionsPre.classList.remove('wheel-actions--hidden');
    wheelActionsPost.classList.add('wheel-actions--hidden');
    wheelModal.classList.add('show');
  });

  document.getElementById('btn-wheel-leave').addEventListener('click', async () => {
    await api('/api/claim', { method: 'POST' });
    await loadState();
    wheelModal.classList.remove('show');
  });

  document.getElementById('btn-wheel-spin').addEventListener('click', async () => {
    wheelActionsPre.classList.add('wheel-actions--hidden');
    let res;
    try {
      res = await api('/api/gamble/spin', { method: 'POST' });
    } catch (e) {
      wheelActionsPre.classList.remove('wheel-actions--hidden');
      return;
    }
    // зелёная половина сверху-слева (0deg центр указывает на неё), красная снизу-справа.
    // Указатель фиксирован сверху, поэтому "выигрыш" = финальный поворот в районе 0/360, "проигрыш" = ~180.
    const baseSpins = 4 * 360;
    const winAngle = 0;
    const loseAngle = 180;
    const jitter = (Math.random() - 0.5) * 40;
    const target = baseSpins + (res.win ? winAngle : loseAngle) + jitter;

    requestAnimationFrame(() => {
      wheelEl.style.transition = 'transform 4s cubic-bezier(.16,.85,.28,1)';
      wheelEl.style.transform = `rotate(${target}deg)`;
    });

    setTimeout(() => {
      if (res.win) {
        wheelTitle.textContent = 'Поздравляю! 🎉';
        wheelActionsPost.classList.remove('wheel-actions--hidden');
        document.getElementById('btn-wheel-claim').textContent = 'Забрать x2';
        document.getElementById('btn-wheel-claim').onclick = async () => {
          await api('/api/claim', { method: 'POST' });
          await loadState();
          wheelModal.classList.remove('show');
        };
      } else {
        wheelTitle.textContent = 'Вы проиграли(';
        wheelTitle.style.color = 'var(--red)';
        wheelActionsPost.classList.remove('wheel-actions--hidden');
        const claimBtn = document.getElementById('btn-wheel-claim');
        claimBtn.textContent = 'Закрыть';
        claimBtn.className = 'btn btn--red';
        claimBtn.onclick = async () => {
          await loadState();
          wheelModal.classList.remove('show');
          claimBtn.className = 'btn btn--green';
          wheelTitle.style.color = '';
        };
      }
    }, 4100);
  });

  // ------------------------------------------------------------- init
  loadState().catch((e) => console.error('Не удалось загрузить состояние:', e));
})();
