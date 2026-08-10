import type { CustomParameter } from '../types/domain';

export const RESERVED_PARAM_NAMES = new Set([
  'x',
  'y',
  'sin',
  'cos',
  'tan',
  'abs',
  'sqrt',
  'exp',
  'ln'
]);

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const validateParamName = (name: string): string | null => {
  if (!name) return 'Name required';
  if (!NAME_RE.test(name)) {
    return 'Use letters, digits, underscore; start with letter/underscore';
  }
  if (RESERVED_PARAM_NAMES.has(name)) {
    return 'Reserved name';
  }
  return null;
};

export interface ParameterValidation {
  normalized: CustomParameter[];
  errors: Array<string | null>;
  valid: boolean;
}

export const normalizeParams = (params: CustomParameter[]): ParameterValidation => {
  const normalized = params.map(p => ({
    name: (p.name || '').trim(),
    value: Number.isFinite(p.value) ? p.value : Number(p.value)
  }));
  const errors: Array<string | null> = normalized.map(() => null);
  const seen = new Map<string, number>();

  normalized.forEach((p, idx) => {
    const nameError = validateParamName(p.name);
    if (nameError) {
      errors[idx] = nameError;
      return;
    }

    if (!Number.isFinite(p.value)) {
      errors[idx] = 'Value must be finite';
      return;
    }

    if (seen.has(p.name)) {
      const firstIdx = seen.get(p.name);
      errors[idx] = 'Duplicate name';
      if (firstIdx !== undefined && !errors[firstIdx]) errors[firstIdx] = 'Duplicate name';
    } else {
      seen.set(p.name, idx);
    }
  });

  const valid = errors.every(err => !err);
  return { normalized, errors, valid };
};

export const formatParamSummary = (params: CustomParameter[], max = 3): string => {
  if (!params.length) return 'no params';
  const shown = params.slice(0, max).map(p => `${p.name}=${p.value.toFixed(3)}`);
  const suffix = params.length > max ? `, +${params.length - max} more` : '';
  return `${shown.join(', ')}${suffix}`;
};
