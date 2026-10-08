import { EtDate } from "../../shared/calendar/ethiopian";
import { ETHIOPIAN_MONTHS } from "../../shared/calendar/ethiopian";
import { METHOD_LABEL, STATUS_LABEL, TX_STATUS_LABEL } from "../../shared/labels";
import { Button, EtDateInput, Field, Select, useLookups, useMeta } from "../ui";

export interface Filters {
  search?: string; year?: number | ""; month?: number | ""; departmentId?: number | ""; categoryId?: number | ""; memberTypeId?: number | "";
  status?: string; method?: string; txStatus?: string; active?: string; dateFrom?: EtDate | null; dateTo?: EtDate | null; dateBasis?: "paid" | "period";
}
export type Show = Partial<Record<"year" | "month" | "dept" | "category" | "type" | "status" | "txStatus" | "method" | "date" | "search" | "active", boolean>> & { yearRequired?: boolean; dateBasisChoice?: boolean };

const num = (v: string): number | "" => (v === "" ? "" : Number(v));

export function FilterPanel({ f, set, show, onReset }: { f: Filters; set: (p: Partial<Filters>) => void; show: Show; onReset?: () => void }) {
  const { meta } = useMeta();
  const { data: lk } = useLookups();
  if (!meta) return null;
  const years: number[] = []; for (let y = meta.startYear; y <= meta.currentPeriod.year + 1; y++) years.push(y);
  const lookupOpts = (l?: { id: number; name: string; is_active: boolean }[]) => (l ?? []).map((x) => ({ value: x.id, label: x.name + (x.is_active ? "" : " (ታግዷል)") }));
  return (
    <div className="panel mb">
      <div className="filters">
        {show.search !== false && <Field label="ፍለጋ" className="wide"><input className="input" placeholder="ስም፣ የአባል መለያ ወይም ስልክ ቁጥር" value={f.search ?? ""} onChange={(e) => set({ search: e.target.value })} /></Field>}
        {show.year && <Field label="ዓመት (ዓ.ም.)"><Select all={show.yearRequired ? null : "ሁሉም"} value={f.year ?? ""} onChange={(v) => set({ year: num(v) })} options={years.map((y) => ({ value: y, label: String(y) }))} /></Field>}
        {show.month && <Field label="ወር"><Select value={f.month ?? ""} onChange={(v) => set({ month: num(v) })} options={ETHIOPIAN_MONTHS.map((m, i) => ({ value: i + 1, label: m }))} /></Field>}
        {show.dept && <Field label="ክፍል"><Select value={f.departmentId ?? ""} onChange={(v) => set({ departmentId: num(v) })} options={lookupOpts(lk?.departments)} /></Field>}
        {show.category && <Field label="የክፍያ ምድብ"><Select value={f.categoryId ?? ""} onChange={(v) => set({ categoryId: num(v) })} options={lookupOpts(lk?.categories)} /></Field>}
        {show.type && <Field label="የአባልነት አይነት"><Select value={f.memberTypeId ?? ""} onChange={(v) => set({ memberTypeId: num(v) })} options={lookupOpts(lk?.memberTypes)} /></Field>}
        {show.status && <Field label="ሁኔታ"><Select all="ሁሉም" value={f.status ?? ""} onChange={(v) => set({ status: v })} options={(["PAID", "UNPAID", "PENDING", "REJECTED"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} /></Field>}
        {show.txStatus && <Field label="ሁኔታ"><Select value={f.txStatus ?? ""} onChange={(v) => set({ txStatus: v })} options={(["PENDING", "VERIFIED", "REJECTED", "VOIDED"] as const).map((s) => ({ value: s, label: TX_STATUS_LABEL[s] }))} /></Field>}
        {show.method && <Field label="የክፍያ ዘዴ"><Select value={f.method ?? ""} onChange={(v) => set({ method: v })} options={Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }))} /></Field>}
        {show.active && <Field label="የአባል ሁኔታ"><Select all="ሁሉም" value={f.active ?? ""} onChange={(v) => set({ active: v })} options={[{ value: "1", label: "ንቁ" }, { value: "0", label: "የታገዱ" }]} /></Field>}
      </div>
      {show.date && (
        <div className="filters mt-s">
          <Field label="ከቀን"><EtDateInput clearable value={f.dateFrom ?? null} onChange={(d) => set({ dateFrom: d })} startYear={meta.startYear} endYear={meta.currentPeriod.year + 1} /></Field>
          <Field label="እስከ ቀን"><EtDateInput clearable value={f.dateTo ?? null} onChange={(d) => set({ dateTo: d })} startYear={meta.startYear} endYear={meta.currentPeriod.year + 1} /></Field>
          {show.dateBasisChoice && <Field label="የቀን ክልሉ የሚመለከተው"><Select all={null} value={f.dateBasis ?? "paid"} onChange={(v) => set({ dateBasis: v as any })} options={[{ value: "paid", label: "የክፍያ ቀንን" }, { value: "period", label: "የክፍያ ወርን" }]} /></Field>}
        </div>
      )}
      {onReset && <div className="mt-s"><Button variant="ghost" size="small" onClick={onReset}>ማጣሪያዎቹን አጽዳ</Button></div>}
    </div>
  );
}
