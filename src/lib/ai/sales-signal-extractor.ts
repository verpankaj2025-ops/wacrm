export interface SalesSignals {
  service?: string | null;
  date?: string | null;
  time?: string | null;
  customerName?: string | null;
}

const SERVICE_PATTERNS: Array<{
  pattern: RegExp;
  value: string;
}> = [
  {
    pattern: /\baroma(?:\s+therapy)?\b/i,
    value: "Aroma Therapy",
  },
  {
    pattern: /\bdeep[\s-]?tissue\b/i,
    value: "Deep Tissue Massage",
  },
  {
    pattern: /\bswedish\b/i,
    value: "Swedish Massage",
  },
  {
    pattern: /\bbalinese\b/i,
    value: "Balinese Massage",
  },
  {
    pattern: /\bthai\b/i,
    value: "Thai Massage",
  },
  {
    pattern: /\bcouple(?:\s+spa)?\b/i,
    value: "Couple Spa Package",
  },
  {
    pattern: /\bhot\s*stone\b/i,
    value: "Hot Stone Therapy",
  },
  {
    pattern: /\bsignature\s+massage\b/i,
    value: "Signature Massage",
  },
];

function normalizeWhitespace(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function pad(
  value: number,
): string {
  return String(value).padStart(2, "0");
}

function formatDate(
  year: number,
  month: number,
  day: number,
): string | null {
  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${pad(month)}-${pad(day)}`;
}

function extractDate(
  message: string,
): string | null {
  const now = new Date();

  if (
    /\bday after tomorrow\b/i.test(
      message,
    ) ||
    /\bparso\b/i.test(
      message,
    )
  ) {
    const date =
      new Date(now);

    date.setDate(
      date.getDate() + 2,
    );

    return formatDate(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    );
  }

  if (
    /\btomorrow\b/i.test(
      message,
    ) ||
    /\bkal\b/i.test(
      message,
    )
  ) {
    const date =
      new Date(now);

    date.setDate(
      date.getDate() + 1,
    );

    return formatDate(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    );
  }

  if (
    /\btoday\b/i.test(
      message,
    ) ||
    /\baaj\b/i.test(
      message,
    )
  ) {
    return formatDate(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
    );
  }

  const iso =
    message.match(
      /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/,
    );

  if (iso) {
    return formatDate(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
    );
  }

  const indian =
    message.match(
      /\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/,
    );

  if (indian) {
    const year =
      indian[3]
        ? Number(indian[3])
        : now.getFullYear();

    return formatDate(
      year,
      Number(indian[2]),
      Number(indian[1]),
    );
  }

  return null;
}

function extractTime(
  message: string,
): string | null {
  const meridiem =
    message.match(
      /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
    );

  if (meridiem) {
    let hour =
      Number(meridiem[1]);

    const minute =
      Number(
        meridiem[2] ?? "0",
      );

    const suffix =
      meridiem[3].toLowerCase();

    if (
      hour < 1 ||
      hour > 12 ||
      minute > 59
    ) {
      return null;
    }

    if (suffix === "pm" && hour < 12) {
      hour += 12;
    }

    if (suffix === "am" && hour === 12) {
      hour = 0;
    }

    return `${pad(hour)}:${pad(minute)}`;
  }

  const twentyFour =
    message.match(
      /\b(?:at\s*)?([01]?\d|2[0-3]):([0-5]\d)\b/,
    );

  if (twentyFour) {
    return `${pad(
      Number(twentyFour[1]),
    )}:${pad(
      Number(twentyFour[2]),
    )}`;
  }

  return null;
}

function extractService(
  message: string,
): string | null {
  for (
    const candidate of SERVICE_PATTERNS
  ) {
    if (
      candidate.pattern.test(
        message,
      )
    ) {
      return candidate.value;
    }
  }

  return null;
}

function extractName(
  message: string,
): string | null {
  const patterns = [
    /\bmy name is\s+([a-z][a-z .'-]{1,60})/i,
    /\bi am\s+([a-z][a-z .'-]{1,60})/i,
    /\bi'm\s+([a-z][a-z .'-]{1,60})/i,
    /\bmera naam\s+([a-z][a-z .'-]{1,60})\s*(?:hai)?/i,
    /\bnaam\s+([a-z][a-z .'-]{1,60})\s*(?:hai)?/i,
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      message.match(pattern);

    if (!match) {
      continue;
    }

    const value =
      normalizeWhitespace(
        match[1],
      );

    if (
      value.length >= 2 &&
      value.length <= 60
    ) {
      return value;
    }
  }

  return null;
}

export function extractSalesSignals(
  message: string,
): SalesSignals {
  const input =
    normalizeWhitespace(
      message,
    )

  if (!input) {
    return {}
  }

  const service =
    extractService(
      input,
    )

  const date =
    extractDate(
      input,
    )

  const time =
    extractTime(
      input,
    )

  const customerName =
    extractName(
      input,
    )

  if (
    !service &&
    !date &&
    !time &&
    !customerName
  ) {
    return {}
  }

  return {
    service,
    date,
    time,
    customerName,
  }
}
