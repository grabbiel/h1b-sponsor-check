export class HubCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubCsvError";
  }
}

export type HubRow = {
  fiscalYear: number;
  employer: string;
  initialApprovals: number;
  initialDenials: number;
  continuingApprovals: number;
  continuingDenials: number;
};

const HEADER_TO_FIELD: Record<string, keyof HubRow> = {
  "fiscal year": "fiscalYear",
  employer: "employer",
  "initial approval": "initialApprovals",
  "initial approvals": "initialApprovals",
  "initial denial": "initialDenials",
  "initial denials": "initialDenials",
  "continuing approval": "continuingApprovals",
  "continuing approvals": "continuingApprovals",
  "continuing denial": "continuingDenials",
  "continuing denials": "continuingDenials",
};

const REQUIRED: (keyof HubRow)[] = [
  "fiscalYear",
  "employer",
  "initialApprovals",
  "initialDenials",
  "continuingApprovals",
  "continuingDenials",
];

export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i]!;
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        quoted = false;
        continue;
      }
      field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (quoted) throw new HubCsvError("unclosed quote");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseHubCsv(text: string): HubRow[] {
  const table = parseCsv(text);
  const header = table[0];
  if (header === undefined) throw new HubCsvError("missing header row");
  const columns = new Map<keyof HubRow, number>();
  header.forEach((cell, index) => {
    const field = HEADER_TO_FIELD[cell.trim().toLowerCase().replace(/\s+/g, " ")];
    if (field !== undefined && !columns.has(field)) columns.set(field, index);
  });
  const missing = REQUIRED.filter((field) => !columns.has(field));
  if (missing.length > 0) throw new HubCsvError(`missing hub columns: ${missing.join(", ")}`);

  return table.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    const cell = (field: keyof HubRow) => cells[columns.get(field) ?? -1] ?? "";
    return {
      fiscalYear: parseYear(cell("fiscalYear"), rowNumber),
      employer: cell("employer").trim(),
      initialApprovals: parseCount(cell("initialApprovals"), rowNumber, "initialApprovals"),
      initialDenials: parseCount(cell("initialDenials"), rowNumber, "initialDenials"),
      continuingApprovals: parseCount(cell("continuingApprovals"), rowNumber, "continuingApprovals"),
      continuingDenials: parseCount(cell("continuingDenials"), rowNumber, "continuingDenials"),
    };
  });
}

function parseYear(raw: string, rowNumber: number): number {
  const year = raw.trim();
  if (!/^\d{4}$/.test(year)) throw new HubCsvError(`row ${rowNumber} has no fiscal year`);
  return Number(year);
}

function parseCount(raw: string, rowNumber: number, column: string): number {
  const value = raw.trim().replaceAll(",", "");
  if (value === "") return 0;
  if (!/^\d+$/.test(value)) throw new HubCsvError(`row ${rowNumber} column ${column} is not a count`);
  return Number(value);
}
