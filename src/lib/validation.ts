import { z } from 'zod';

/** Map of field path ("name", "ingredients.0.quantity") -> first error message. */
export type FieldErrors = Record<string, string>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Empty string / whitespace -> undefined, so optional fields stay optional. */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const optionalText = (max = 2000) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

export const requiredText = (label: string, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

/** HTML checkbox: "on"/"true"/"1" -> true, missing -> false. */
export const checkbox = z.preprocess(
  (v) => v === 'on' || v === 'true' || v === '1' || v === true,
  z.boolean(),
);

export const optionalInt = (label: string, min = 0) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .optional(),
  );

export const decimal = (label: string, min = 0) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .min(min, `${label} must be at least ${min}`)
    .max(9_999_999_999, `${label} is too large`);

export const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
