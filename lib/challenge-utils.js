export function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().split("T")[0];
}

export function localDateKey(date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60 * 1000).toISOString().split("T")[0];
}

export function dateFromInput(dateValue) {
  return new Date(`${dateValue}T00:00:00`);
}

export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function recalculateChallengeEntries(items, startCapital) {
  const sorted = [...(items ?? [])]
    .map((entry) => ({
      ...entry,
      accountValue: toNumber(entry?.accountValue),
      notes: entry?.notes ?? ""
    }))
    .filter((entry) => entry.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let prev = toNumber(startCapital);

  return sorted.map((entry) => {
    const accountValue = toNumber(entry.accountValue);
    const profit = accountValue - prev;
    const dayReturnPct = prev !== 0 ? (profit / prev) * 100 : 0;
    prev = accountValue;

    return {
      ...entry,
      accountValue,
      profit,
      dayReturnPct
    };
  });
}

export function computeYAxisDomain(config, entries) {
  if (!config) return [0, "auto"];
  const values = [toNumber(config.startCapital), ...(entries ?? []).map((entry) => toNumber(entry.accountValue))];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return [Math.floor(min * 0.98), Math.ceil(max * 1.02)];
}

export function buildProjectionData(config, entries, projectionRange = "year") {
  if (!config) return [];

  let projectedBalance = toNumber(config.startCapital);
  const sortedEntries = [...(entries ?? [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const entryMap = new Map(sortedEntries.map((entry) => [entry.date, toNumber(entry.accountValue)]));
  const startDate = new Date(config.startDate);
  const lastEntryDate =
    sortedEntries.length > 0 ? new Date(sortedEntries[sortedEntries.length - 1].date) : new Date();

  const endDate = new Date(lastEntryDate);
  endDate.setDate(endDate.getDate() + (projectionRange === "month" ? 30 : 365));

  const currentDate = new Date(startDate);
  const data = [];

  while (currentDate <= endDate) {
    const dateStr = localDateKey(currentDate);
    const actualValue = entryMap.get(dateStr);

    if (config.goalType === "percent") {
      projectedBalance *= 1 + toNumber(config.goalValue) / 100;
    } else {
      projectedBalance += toNumber(config.goalValue);
    }

    data.push({
      date: dateStr,
      actual: actualValue !== undefined ? actualValue : null,
      projected: projectedBalance
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return data;
}

function getBaselineAtDate(sortedEntries, startCapital, targetDate) {
  const previousEntry = [...sortedEntries]
    .reverse()
    .find((entry) => dateFromInput(entry.date) < targetDate);

  return previousEntry ? toNumber(previousEntry.accountValue) : toNumber(startCapital);
}

export function calculateWeeklyProgress(config, entries) {
  if (!config) {
    return {
      percent: 0,
      baseline: 0,
      currentAccount: 0,
      targetAccount: 0,
      currentGain: 0,
      targetGain: 0
    };
  }

  const sortedEntries = [...(entries ?? [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const weekStart = new Date(todayStart);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(todayStart.getDate() + diffToMonday);

  const challengeStart = dateFromInput(config.startDate);
  const activeStart = challengeStart > weekStart ? challengeStart : weekStart;

  if (activeStart > todayStart) {
    const baselineFuture = toNumber(config.startCapital);
    return {
      percent: 0,
      baseline: baselineFuture,
      currentAccount: baselineFuture,
      targetAccount: baselineFuture,
      currentGain: 0,
      targetGain: 0
    };
  }

  const baseline = getBaselineAtDate(sortedEntries, config.startCapital, activeStart);
  const latestUpToToday = [...sortedEntries]
    .reverse()
    .find((entry) => dateFromInput(entry.date) <= todayStart);

  const currentAccount = latestUpToToday ? toNumber(latestUpToToday.accountValue) : baseline;
  const currentGain = currentAccount - baseline;
  let targetAccount = baseline;

  if (config.goalType === "percent") {
    targetAccount = baseline * Math.pow(1 + toNumber(config.goalValue) / 100, 7);
  } else {
    targetAccount = baseline + toNumber(config.goalValue) * 7;
  }

  const targetGain = targetAccount - baseline;
  const rawPercent = targetGain !== 0 ? (currentGain / targetGain) * 100 : 0;

  return {
    percent: Number.isFinite(rawPercent) ? rawPercent : 0,
    baseline,
    currentAccount,
    targetAccount,
    currentGain,
    targetGain
  };
}

export function buildEquitySeries(config, entries) {
  if (!config) return [];
  const sortedEntries = [...(entries ?? [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  return [
    {
      date: config.startDate,
      value: toNumber(config.startCapital),
      type: "start"
    },
    ...sortedEntries.map((entry) => ({
      date: entry.date,
      value: toNumber(entry.accountValue),
      type: "entry"
    }))
  ];
}

export function buildDailyPnlSeries(entries) {
  return [...(entries ?? [])]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((entry) => ({
      date: entry.date,
      profit: toNumber(entry.profit),
      dayReturnPct: toNumber(entry.dayReturnPct)
    }));
}

export function buildDrawdownSeries(config, entries) {
  const equitySeries = buildEquitySeries(config, entries);
  let peak = Number.NEGATIVE_INFINITY;

  return equitySeries.map((point) => {
    peak = Math.max(peak, toNumber(point.value));
    const drawdownPct = peak > 0 ? ((toNumber(point.value) - peak) / peak) * 100 : 0;
    return {
      date: point.date,
      drawdownPct,
      equity: toNumber(point.value)
    };
  });
}

function currentAndLongestStreak(entries, predicate) {
  let current = 0;
  let longest = 0;

  entries.forEach((entry) => {
    if (predicate(entry)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });

  return { current, longest };
}

function baselineForPeriod(sortedEntries, startCapital, startDate) {
  const baseline = getBaselineAtDate(sortedEntries, startCapital, startDate);
  const latest = [...sortedEntries]
    .reverse()
    .find((entry) => dateFromInput(entry.date) >= startDate);

  return {
    baseline,
    current: latest ? toNumber(latest.accountValue) : baseline
  };
}

export function calculateChallengeKpis(config, entries) {
  if (!config) {
    return {
      currentBalance: 0,
      weekResult: 0,
      monthResult: 0,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      currentWinStreak: 0,
      currentLossStreak: 0,
      bestDayProfit: 0,
      worstDayProfit: 0,
      averageDayReturnPct: 0,
      challengeDays: 0
    };
  }

  const sortedEntries = [...(entries ?? [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const currentBalance = sortedEntries.length > 0 ? toNumber(sortedEntries[sortedEntries.length - 1].accountValue) : toNumber(config.startCapital);
  const totalReturnPct = toNumber(config.startCapital) !== 0 ? ((currentBalance - toNumber(config.startCapital)) / toNumber(config.startCapital)) * 100 : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekDay = today.getDay();
  const weekOffset = weekDay === 0 ? -6 : 1 - weekDay;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + weekOffset);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const weekWindow = baselineForPeriod(sortedEntries, config.startCapital, weekStart);
  const monthWindow = baselineForPeriod(sortedEntries, config.startCapital, monthStart);

  const drawdowns = buildDrawdownSeries(config, entries);
  const maxDrawdownPct = drawdowns.reduce((worst, point) => Math.min(worst, toNumber(point.drawdownPct)), 0);

  const bestDayProfit = sortedEntries.reduce((best, entry) => Math.max(best, toNumber(entry.profit)), 0);
  const worstDayProfit = sortedEntries.reduce((worst, entry) => Math.min(worst, toNumber(entry.profit)), 0);
  const averageDayReturnPct =
    sortedEntries.length > 0
      ? sortedEntries.reduce((sum, entry) => sum + toNumber(entry.dayReturnPct), 0) / sortedEntries.length
      : 0;

  const winStreak = currentAndLongestStreak(sortedEntries, (entry) => toNumber(entry.profit) > 0);
  const lossStreak = currentAndLongestStreak(sortedEntries, (entry) => toNumber(entry.profit) < 0);

  return {
    currentBalance,
    weekResult: weekWindow.current - weekWindow.baseline,
    monthResult: monthWindow.current - monthWindow.baseline,
    totalReturnPct,
    maxDrawdownPct,
    currentWinStreak: winStreak.current,
    currentLossStreak: lossStreak.current,
    longestWinStreak: winStreak.longest,
    longestLossStreak: lossStreak.longest,
    bestDayProfit,
    worstDayProfit,
    averageDayReturnPct,
    challengeDays: sortedEntries.length
  };
}

export function entriesForDate(entries, targetDate) {
  const key = typeof targetDate === "string" ? targetDate : localDateKey(targetDate);
  return (entries ?? []).filter((entry) => entry.date === key);
}

export function journalEntriesForDate(journalEntries, targetDate) {
  const key = typeof targetDate === "string" ? targetDate : localDateKey(targetDate);
  return (journalEntries ?? []).filter((entry) => entry.date === key);
}
