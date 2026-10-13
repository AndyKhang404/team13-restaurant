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
  z.string({ error: `${label} là bắt buộc` }).trim().min(1, `${label} là bắt buộc`).max(max);

/** HTML checkbox: "on"/"true"/"1" -> true, missing -> false. */
export const checkbox = z.preprocess(
  (v) => v === 'on' || v === 'true' || v === '1' || v === true,
  z.boolean(),
);

export const optionalInt = (label: string, min = 0, max?: number) => {
  let num = z.coerce
    .number({ error: `${label} phải là số` })
    .int(`${label} phải là số nguyên`)
    .min(min, `${label} phải ít nhất ${min}`);
  if (max !== undefined) num = num.max(max, `${label} không quá ${max}`);
  return z.preprocess(blankToUndefined, num.optional());
};

export const decimal = (label: string, min = 0) =>
  z.coerce
    .number({ error: `${label} phải là số` })
    .min(min, `${label} phải ít nhất ${min}`)
    .max(9_999_999_999, `${label} quá lớn`);

const VN_PHONE_RE = /^(?:\+84|0)[\d\s.]{8,14}$/;

/** Optional VN phone number: blank stays empty, otherwise loose 0.../+84... pattern. */
export const optionalPhone = (label = 'Số điện thoại') =>
  z
    .preprocess(blankToUndefined, z.string().trim().max(30).optional())
    .refine((v): v is string | undefined => v === undefined || VN_PHONE_RE.test(v), {
      error: `${label} không hợp lệ (vd. 0901234567)`,
    });

export const optionalUuid = z.preprocess(blankToUndefined, z.uuid().optional());
