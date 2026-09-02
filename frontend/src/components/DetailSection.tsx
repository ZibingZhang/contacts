import type { ReactNode } from "react";
import { slugify } from "../format";

export interface FieldRowData {
  key: string;
  label: string;
  value: ReactNode;
}

export function fieldRow(label: string, value: ReactNode, key = label): FieldRowData {
  return { key, label, value };
}

export function DetailSection({ title, rows }: { title: string; rows: FieldRowData[] }) {
  if (!rows.length) {
    return null;
  }

  return (
    <section className="detail-section">
      <h6 className="text-uppercase text-secondary fw-bold small mb-2">{title}</h6>
      {rows.map((row) => (
        <div className="field-row" data-field={slugify(row.label)} key={row.key}>
          <div className="field-label">{row.label}</div>
          <div className="field-value">{row.value}</div>
        </div>
      ))}
    </section>
  );
}
