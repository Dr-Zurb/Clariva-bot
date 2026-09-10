import { formatDeskGuardian } from "@/lib/desk/guardian";
import {
  letterheadTypePx,
  letterheadTypeScreenPx,
  type LetterheadTextSize,
} from "@/lib/letterhead-heading";

function identityPx(
  role: "patientName" | "patientNameCompact" | "patientMeta",
  size: LetterheadTextSize | undefined,
  compact: boolean,
): number {
  return compact
    ? letterheadTypePx(role, size)
    : letterheadTypeScreenPx(role, size);
}

export interface PatientRxIdentityFields {
  patientName: string;
  patientAge?: string | null;
  patientGender?: string | null;
  visitDateLabel?: string | null;
  patientPhone?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  address?: string | null;
  medicalRecordNumber?: string | null;
}

export type PatientRxIdentityPreset = "open_letter" | "compact" | "grid";

function formatAgeGender(
  age: string | null | undefined,
  gender: string | null | undefined,
): string | null {
  const a = age?.trim() || "";
  const g = (gender ?? "").trim().toLowerCase();
  let abbrev = "";
  if (g === "male" || g === "m") abbrev = "M";
  else if (g === "female" || g === "f") abbrev = "F";
  else if (g === "other") abbrev = "Other";
  else if (g) abbrev = gender!.trim();
  if (a && abbrev) return `${a} · ${abbrev}`;
  if (a) return a;
  if (abbrev) return abbrev;
  return null;
}

function chunkCells<T>(cells: T[], size = 3): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < cells.length; i += size) {
    rows.push(cells.slice(i, i + size));
  }
  return rows;
}

function GridIdentity({
  fields,
  compact,
  showPhone,
  showGuardian,
  showMrn,
  showAddress,
  textColor,
  textSize,
}: {
  fields: PatientRxIdentityFields;
  compact: boolean;
  showPhone: boolean;
  showGuardian: boolean;
  showMrn: boolean;
  showAddress: boolean;
  textColor?: string;
  textSize?: LetterheadTextSize;
}) {
  const ageGender = formatAgeGender(fields.patientAge, fields.patientGender);
  const visit = fields.visitDateLabel?.trim() || "";
  const phone = showPhone ? fields.patientPhone?.trim() || "" : "";
  const mrn = showMrn ? fields.medicalRecordNumber?.trim() || "" : "";
  const relative = showGuardian
    ? formatDeskGuardian(
        fields.guardianName,
        fields.guardianRelation,
        fields.patientGender,
      )
    : "";
  const address = showAddress ? fields.address?.trim() || "" : "";

  const cells: { label: string; value: string }[] = [];
  if (showMrn) cells.push({ label: "MRN", value: mrn });
  if (visit) cells.push({ label: "Date", value: visit });
  if (showPhone) cells.push({ label: "Phone", value: phone });
  cells.push({ label: "Name", value: fields.patientName });
  if (ageGender) cells.push({ label: "Age / gender", value: ageGender });
  if (showGuardian) cells.push({ label: "Relative", value: relative });

  const typePx = identityPx("patientMeta", textSize, compact);
  const pad = compact ? "px-1.5 py-1" : "px-2 py-1.5";
  const ink = {
    fontSize: typePx,
    ...(textColor ? { color: textColor } : {}),
  };

  return (
    <table
      className={`${compact ? "mb-5" : "mt-4 mb-5"} w-full border-collapse border border-black`}
    >
      <tbody>
        {chunkCells(cells).map((row, rowIdx) => (
          <tr key={rowIdx}>
            {row.map((cell) => (
              <td
                key={cell.label}
                className={`border border-black align-top leading-snug ${pad}`}
                style={ink}
              >
                {cell.label} :{" "}
                <span className="font-bold">{cell.value}</span>
              </td>
            ))}
          </tr>
        ))}
        {address ? (
          <tr>
            <td
              colSpan={3}
              className={`border border-black align-top leading-snug ${pad}`}
              style={ink}
            >
              Address : <span className="font-bold">{address}</span>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function PatientRxIdentityBlock({
  fields,
  compact = false,
  preset = "open_letter",
  showPhone = true,
  showGuardian = true,
  showMrn = true,
  showAddress = true,
  ruleColor,
  textColor,
  textSize,
}: {
  fields: PatientRxIdentityFields;
  compact?: boolean;
  preset?: PatientRxIdentityPreset;
  showPhone?: boolean;
  showGuardian?: boolean;
  showMrn?: boolean;
  showAddress?: boolean;
  ruleColor?: string;
  textColor?: string;
  textSize?: LetterheadTextSize;
}) {
  if (preset === "grid") {
    return (
      <GridIdentity
        fields={fields}
        compact={compact}
        showPhone={showPhone}
        showGuardian={showGuardian}
        showMrn={showMrn}
        showAddress={showAddress}
        textColor={textColor}
        textSize={textSize}
      />
    );
  }

  const ageGender = formatAgeGender(fields.patientAge, fields.patientGender);
  const guardian = !showGuardian
    ? ""
    : formatDeskGuardian(
        fields.guardianName,
        fields.guardianRelation,
        fields.patientGender,
      );
  const phone = !showPhone ? "" : fields.patientPhone?.trim() || "";
  const mrn = !showMrn ? "" : fields.medicalRecordNumber?.trim() || "";
  const address = !showAddress ? "" : fields.address?.trim() || "";
  const visit = fields.visitDateLabel?.trim() || "";

  const meta = [
    phone,
    guardian,
    mrn ? `MRN ${mrn}` : "",
  ].filter(Boolean);
  const namePx = identityPx(
    preset === "compact" ? "patientNameCompact" : "patientName",
    textSize,
    compact,
  );
  const metaPx = identityPx("patientMeta", textSize, compact);
  const ink = textColor ? { color: textColor } : undefined;
  const nameStyle = { ...ink, fontSize: namePx };
  const metaStyle = { ...ink, fontSize: metaPx };
  const rule = { borderBottomColor: ruleColor ?? "#000000" };

  if (preset === "compact") {
    const details = [...meta, address].filter(Boolean);
    return (
      <div className={compact ? "mb-2 border-b pb-1.5" : "mb-3 border-b pb-2"} style={rule}>
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span
            className={
              compact
                ? "font-bold leading-tight text-[#0F172A]"
                : "font-bold leading-tight text-gray-900"
            }
            style={nameStyle}
          >
            {fields.patientName}
          </span>
          {ageGender ? (
            <span
              className={compact ? "text-[#64748B]" : "text-gray-500"}
              style={metaStyle}
            >
              · {ageGender}
            </span>
          ) : null}
          {visit ? (
            <span
              className={compact ? "text-[#64748B]" : "text-gray-500"}
              style={metaStyle}
            >
              · {visit}
            </span>
          ) : null}
        </div>
        {details.length > 0 ? (
          <div
            className={
              compact
                ? "mt-0.5 leading-snug text-[#64748B]"
                : "mt-0.5 leading-snug text-gray-500"
            }
            style={metaStyle}
          >
            {details.join("  ·  ")}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={compact ? "mb-3 border-b pb-2.5" : "mt-4 border-b pb-3"}
      style={rule}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-end gap-x-2">
          <div
            className={
              compact
                ? "font-bold leading-tight text-[#0F172A]"
                : "font-bold leading-tight text-gray-900"
            }
            style={nameStyle}
          >
            {fields.patientName}
          </div>
          {ageGender ? (
            <div
              className={compact ? "text-[#64748B]" : "text-gray-500"}
              style={metaStyle}
            >
              {ageGender}
            </div>
          ) : null}
        </div>
        {visit ? (
          <div
            className={compact ? "shrink-0 text-[#64748B]" : "shrink-0 text-gray-500"}
            style={metaStyle}
          >
            {visit}
          </div>
        ) : null}
      </div>
      {meta.length > 0 ? (
        <div
          className={compact ? "mt-1 text-[#64748B]" : "mt-1 text-gray-500"}
          style={metaStyle}
        >
          {meta.join("  ·  ")}
        </div>
      ) : null}
      {address ? (
        <div
          className={compact ? "mt-0.5 text-[#64748B]" : "mt-0.5 text-gray-500"}
          style={metaStyle}
        >
          {address}
        </div>
      ) : null}
    </div>
  );
}
