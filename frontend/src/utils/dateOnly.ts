const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})/;

const padDatePart = (value: number) => String(value).padStart(2, "0");

export const parseDateOnly = (value?: Date | string | number | null) => {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value);
  const match = text.match(DATE_ONLY_REGEX);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

export const toDateOnlyString = (value?: Date | string | number | null) => {
  const date = parseDateOnly(value);
  if (!date) return "";

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
};

export const isDateAfter = (
  value?: Date | string | number | null,
  comparison?: Date | string | number | null
) => {
  const date = parseDateOnly(value);
  const comparisonDate = parseDateOnly(comparison);

  return Boolean(date && comparisonDate && date.getTime() > comparisonDate.getTime());
};

export const isDateOnOrBefore = (
  value?: Date | string | number | null,
  comparison?: Date | string | number | null
) => {
  const date = parseDateOnly(value);
  const comparisonDate = parseDateOnly(comparison);

  return Boolean(date && comparisonDate && date.getTime() <= comparisonDate.getTime());
};
