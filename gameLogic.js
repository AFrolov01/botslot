/**
 * Логика выпадения предметов из "Контейнер L".
 *
 * Правила (заданы человеком):
 * - Серебро: 80 — гарантированно (100%), 100 — 46%, 200 — 2%, 1000 — 0.1%
 * - Золото:  20 — 10%, 40 — 1%, 100 — 0.2%
 * - Хром:    1 — 1%, 5 — 0.5%, 20 — 0.07%
 * - На каждую валюту делается ровно 2 независимых броска.
 * - В каждом броске проверяются шансы от редкого к частому;
 *   если ничего "редкого" не выпало — берётся базовый уровень
 *   (для серебра базовый уровень гарантирован — 80, поэтому серебро
 *   выпадает всегда; для золота и хрома базового гарантированного
 *   уровня нет, поэтому они могут не выпасть вовсе).
 * - Максимум за одно вскрытие: серебро 2000 (2 × 1000), золото 200 (2 × 100),
 *   хром 40 (2 × 20) — то есть каждая валюта может "сработать" не более 2 раз.
 */

const CONTAINER_L_TABLE = {
  silver: {
    color: '#F2F2F2',
    label: 'Серебро',
    rolls: 2,
    tiers: [
      { amount: 1000, chance: 0.001 },
      { amount: 200, chance: 0.02 },
      { amount: 100, chance: 0.46 },
    ],
    guaranteed: 80, // если ни один из tiers не сработал — падает эта сумма
  },
  gold: {
    color: '#FFC633',
    label: 'Золото',
    rolls: 2,
    tiers: [
      { amount: 100, chance: 0.002 },
      { amount: 40, chance: 0.01 },
      { amount: 20, chance: 0.1 },
    ],
    guaranteed: 0, // может не выпасть
  },
  chrome: {
    color: 'chrome', // рендерится градиентом на фронте
    label: 'Хром',
    rolls: 2,
    tiers: [
      { amount: 20, chance: 0.0007 },
      { amount: 5, chance: 0.005 },
      { amount: 1, chance: 0.01 },
    ],
    guaranteed: 0,
  },
};

function rollOnce(currencyDef) {
  for (const tier of currencyDef.tiers) {
    if (Math.random() < tier.chance) return tier.amount;
  }
  return currencyDef.guaranteed;
}

/**
 * Возвращает { silver, gold, chrome } — итоговые суммы по каждой валюте
 * после розыгрыша "Контейнер L".
 */
function openContainerL() {
  const result = { silver: 0, gold: 0, chrome: 0 };
  for (const key of Object.keys(CONTAINER_L_TABLE)) {
    const def = CONTAINER_L_TABLE[key];
    let total = 0;
    for (let i = 0; i < def.rolls; i++) {
      total += rollOnce(def);
    }
    result[key] = total;
  }
  return result;
}

module.exports = { CONTAINER_L_TABLE, openContainerL };
