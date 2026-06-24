const NAMED_PROVIDER_COLORS: Record<string, string> = {
  redplug: '#dc2626',
  greenplug: '#16a34a',
  blueplug: '#2563eb'
};

const FALLBACK_PROVIDER_COLORS = ['#f59e0b', '#7c3aed', '#0891b2', '#be123c', '#4d7c0f', '#9333ea'];

export function hasProviderId(providerId: string | null | undefined): providerId is string {
  return !!providerId?.trim();
}

export function providerColor(providerId: string | null | undefined, index = 0): string {
  const normalized = (providerId || '').trim().toLowerCase();
  if (NAMED_PROVIDER_COLORS[normalized]) return NAMED_PROVIDER_COLORS[normalized];

  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PROVIDER_COLORS[(hash + index) % FALLBACK_PROVIDER_COLORS.length];
}
