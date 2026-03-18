const PRIORITY_BY_TYPE = {
  SUPERSTACK_4H: 5,
  INSIDE_BAR_BREAK: 4,
  STAIR_STEP_BREAK: 4,
  SUPERSTACK_1H: 3,
  ABNORMAL_VOLUME: 2
};

const NEW_WINDOW_MS = 5 * 60 * 1000;
const COOLING_WINDOW_MS = 30 * 60 * 1000;

export function getAlertPriority(type) {
  return PRIORITY_BY_TYPE[type] ?? 1;
}

export function getAlertTimeframe(alert) {
  if (!alert) return null;
  if (alert.type === "ABNORMAL_VOLUME") return "15m";
  if (alert.type === "SUPERSTACK_4H") return "4h";
  if (alert.type === "SUPERSTACK_1H") return "1h";
  return alert.meta?.timeframe ?? null;
}

export function alertRecordId(alert) {
  return [
    alert.type,
    alert.symbol,
    alert.meta?.bias ?? alert.bias ?? "BULL",
    getAlertTimeframe(alert) ?? "na"
  ].join(":");
}

function normalizeTimestamp(value, fallbackIso) {
  if (!value) return fallbackIso;
  const ts = new Date(value).toISOString();
  return ts;
}

export function reconcileAlertRecords(previousRecords, liveAlerts, nowIso = new Date().toISOString()) {
  const nextMap = new Map((previousRecords ?? []).map((record) => [record.id, { ...record }]));
  const liveIds = new Set();
  const nowMs = new Date(nowIso).getTime();

  (liveAlerts ?? []).forEach((alert) => {
    const id = alertRecordId(alert);
    liveIds.add(id);
    const existing = nextMap.get(id);
    const firstSeenAt = normalizeTimestamp(existing?.firstSeenAt, nowIso);
    const ageMs = nowMs - new Date(firstSeenAt).getTime();
    const wasDismissed = existing?.dismissedAt && !existing?.acknowledgedAt;

    nextMap.set(id, {
      id,
      symbol: alert.symbol,
      type: alert.type,
      timeframe: getAlertTimeframe(alert),
      bias: alert.meta?.bias ?? alert.bias ?? "BULL",
      priority: getAlertPriority(alert.type),
      status: wasDismissed ? "dismissed" : existing?.acknowledgedAt ? "acknowledged" : ageMs <= NEW_WINDOW_MS ? "new" : "active",
      firstSeenAt,
      lastSeenAt: nowIso,
      acknowledgedAt: existing?.acknowledgedAt ?? null,
      dismissedAt: existing?.dismissedAt ?? null,
      meta: alert.meta ?? {}
    });
  });

  nextMap.forEach((record, id) => {
    if (liveIds.has(id)) return;
    const lastSeenAt = normalizeTimestamp(record.lastSeenAt, nowIso);
    const ageSinceSeen = nowMs - new Date(lastSeenAt).getTime();

    if (ageSinceSeen <= COOLING_WINDOW_MS) {
      nextMap.set(id, {
        ...record,
        status: record.dismissedAt ? "dismissed" : "cooling"
      });
      return;
    }

    nextMap.set(id, {
      ...record,
      status: record.dismissedAt ? "dismissed" : "invalidated"
    });
  });

  return Array.from(nextMap.values()).sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}

export function acknowledgeAlertRecord(records, id, nowIso = new Date().toISOString()) {
  return (records ?? []).map((record) =>
    record.id === id
      ? {
          ...record,
          acknowledgedAt: nowIso,
          dismissedAt: null,
          status: "acknowledged"
        }
      : record
  );
}

export function dismissAlertRecord(records, id, nowIso = new Date().toISOString()) {
  return (records ?? []).map((record) =>
    record.id === id
      ? {
          ...record,
          dismissedAt: nowIso,
          status: "dismissed"
        }
      : record
  );
}

export function activeAlertCount(records) {
  return (records ?? []).filter((record) => ["new", "active", "acknowledged"].includes(record.status)).length;
}
