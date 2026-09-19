const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const define = (action, fallback, intensity, priority, holdMs) => Object.freeze({
  action,
  fallback,
  intensity,
  priority,
  holdMs,
});

export const INTENT_DEFINITIONS = Object.freeze({
  idle: define('idle', 'IDLE', .35, 0, 0),
  listen: define('attentive', 'LISTENING', .55, 20, 4000),
  think: define('deepThink', 'THINKING', .65, 30, 6000),
  speak: define('guide', 'SPEAKING', .60, 40, 4500),
  explain: define('guide', 'SPEAKING', .75, 40, 4500),
  reassure: define('attentive', 'IDLE', .45, 70, 4200),
  success: define('thumbsUp', 'CONGRATULATE', .80, 70, 3600),
  refuse: define('worried', 'ERROR', .65, 100, 4200),
  error: define('worried', 'ERROR', .75, 100, 4200),
});

export function normalizeIntent(input) {
  if (!input || typeof input !== 'object' || !Object.hasOwn(INTENT_DEFINITIONS, input.kind)) return null;
  const definition = INTENT_DEFINITIONS[input.kind];
  const intensity = Number.isFinite(input.intensity) ? clamp(input.intensity, 0, 1) : definition.intensity;
  const holdMs = Number.isFinite(input.holdMs) ? clamp(input.holdMs, 0, 15000) : definition.holdMs;
  return {
    kind: input.kind,
    action: definition.action,
    fallback: definition.fallback,
    intensity,
    holdMs,
    priority: definition.priority,
    source: String(input.source || 'application'),
  };
}

const SURFACES = new Set(['auth', 'workspace-bust', 'workspace-avatar']);

export function createPresentationController({
  createPrimary,
  createFallback,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let mounted = false;
  let destroyed = false;
  let primary = null;
  let fallback = null;
  let timer = 0;
  let sequence = 0;
  let current = normalizeIntent({ kind: 'idle' });
  let queued = null;

  const snapshot = () => ({
    mounted,
    destroyed,
    current: { ...current },
    queued: queued ? { ...queued } : null,
    engine: primary ? 'v12' : fallback ? 'webp' : 'none',
  });
  const cancelTimer = () => {
    if (timer) {
      clearTimer(timer);
      timer = 0;
    }
  };
  const scheduleIdle = intent => {
    cancelTimer();
    if (!intent.holdMs || intent.kind === 'idle') return;
    timer = setTimer(() => {
      timer = 0;
      finish(intent.sequence);
    }, intent.holdMs);
  };
  const render = intent => {
    const command = {
      action: intent.action,
      fallback: intent.fallback,
      intensity: intent.intensity,
      source: intent.source,
    };
    fallback?.play(command);
    const result = primary?.play(command);
    const abandonPrimary = () => {
      if (destroyed || current.sequence !== intent.sequence) return;
      primary?.destroy?.();
      primary = null;
      fallback?.play(command);
    };
    if (result === false) abandonPrimary();
    else if (result && typeof result.then === 'function') {
      result.then(ok => {
        if (ok === false) abandonPrimary();
      }).catch(abandonPrimary);
    }
    scheduleIdle(intent);
  };
  const finish = id => {
    if (destroyed || current.sequence !== id) return;
    const next = queued;
    queued = null;
    current = next || { ...normalizeIntent({ kind: 'idle' }), sequence: ++sequence };
    render(current);
  };

  return {
    async mount({ host, surface, isVisible = () => true } = {}) {
      if (destroyed || mounted || !host || !SURFACES.has(surface) || typeof isVisible !== 'function') return false;
      mounted = true;
      fallback = createFallback?.({ host, surface, isVisible }) || null;
      current = { ...current, sequence: ++sequence };
      render(current);
      try {
        primary = await createPrimary?.({ host, surface, isVisible }) || null;
      } catch {
        primary = null;
      }
      if (destroyed) {
        primary?.destroy?.();
        primary = null;
        return false;
      }
      if (primary) render(current);
      return true;
    },
    dispatch(input) {
      if (!mounted || destroyed) return false;
      const normalized = normalizeIntent(input);
      if (!normalized) return false;
      const next = { ...normalized, sequence: ++sequence };
      if (current.kind !== 'idle' && next.priority < current.priority) {
        if (next.kind !== 'idle' && (!queued || next.priority >= queued.priority)) queued = next;
        return false;
      }
      current = next;
      render(current);
      return true;
    },
    stop(reason = 'stop') {
      if (!mounted || destroyed) return false;
      cancelTimer();
      queued = null;
      primary?.stop?.(reason);
      fallback?.stop?.(reason);
      current = { ...normalizeIntent({ kind: 'idle', source: reason }), sequence: ++sequence };
      render(current);
      return true;
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      mounted = false;
      cancelTimer();
      queued = null;
      primary?.destroy?.();
      fallback?.destroy?.();
      primary = null;
      fallback = null;
      return true;
    },
    getState: snapshot,
  };
}
