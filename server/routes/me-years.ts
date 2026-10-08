import { Router } from "express";
import { query } from "../db";
import { memberOnly } from "../lib/auth";
import { currentPeriod } from "../../shared/calendar/payment-period";
import { ensureYearGenerated } from "../services/obligations";
import { wrap } from "./util";

export const meYearsApi = Router();

/** Every monthly bill of the logged-in member across ALL Ethiopian years (so unpaid bills of past years stay payable). */
meYearsApi.get("/years", memberOnly, wrap(async (req, res) => {
  await ensureYearGenerated();
  const { rows } = await query(
    `select o.id, o.ethiopian_year, o.ethiopian_month, o.amount, o.status,
            t.reference_no, t.method, t.paid_at,
            (select rt.reject_reason from payment_transaction_items ri join payment_transactions rt on rt.id = ri.transaction_id
              where ri.obligation_id = o.id and rt.status = 'REJECTED' order by rt.id desc limit 1) as reject_reason
       from payment_obligations o
       left join payment_transaction_items ti on ti.obligation_id = o.id and ti.is_active
       left join payment_transactions t on t.id = ti.transaction_id
      where o.member_id = $1 order by o.ethiopian_year, o.ethiopian_month`, [req.user!.memberId]);
  res.json({ current: currentPeriod(), rows });
}));