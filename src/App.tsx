import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as XLSX from "@e965/xlsx";
import { supabase } from "./supabase";
import "./App.css";
import "./floors.css";

type Flat = {
  id: string;
  number: string;
  resident: string;
  phone: string;
  expected: number;
};
type Collection = {
  id: string;
  receipt: string;
  flat: string;
  resident: string;
  amount: number;
  date: string;
  donationType: string;
  mode: string;
  status: "ACTIVE" | "VOIDED";
  notes?: string;
};
type Expense = {
  id: string;
  number: string;
  date: string;
  categoryId: string;
  category: string;
  description: string;
  paidTo: string;
  amount: number;
  mode: string;
  status: "ACTIVE" | "VOIDED";
  notes?: string;
  attachmentPath?: string | null;
};
type SortState = { key: string; direction: "asc" | "desc" };
type TableHeader = { label: string; sortKey?: string };
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
const date = (d: string) => d.split("-").reverse().join("-");
const isImageAttachment = (path?: string | null) =>
  /\.(jpe?g|png|webp)(?:$|\?)/i.test(path || "");
const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
const searchRow = (row: Record<string, unknown>, query: string) => {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return [
    ...Object.values(row),
    "date" in row && typeof row.date === "string" ? date(row.date) : "",
    "amount" in row && typeof row.amount === "number" ? money(row.amount) : "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(term);
};
const sortRows = <T extends Record<string, unknown>>(
  rows: T[],
  sort: SortState | null,
) => {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    const result =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left ?? "").localeCompare(String(right ?? ""), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    return sort.direction === "asc" ? result : -result;
  });
};
const today = (() => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
})();
const donationTypes = ["Donation", "Annaprasadam", "Pooja", "Homam"];
const cats = [
  "Decoration",
  "Ganesh Idol",
  "Pooja Materials",
  "Flowers",
  "Food",
  "Sound System",
  "Cultural Program",
  "Electricity",
  "Cleaning",
  "Prasadam",
  "Groceries",
  "Cook",
  "Sweets",
  "Pujari",
  "Miscellaneous",
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);
  if (!authReady)
    return (
      <div className="login">
        <p>Loading secure festival workspace…</p>
      </div>
    );
  return session ? <FundManager session={session} /> : <Login />;
}
function FundManager({ session }: { session: Session }) {
  const [page, setPage] = useState("Dashboard"),
    [opening, setOpening] = useState(0),
    [search, setSearch] = useState(""),
    [collectionSearch, setCollectionSearch] = useState(""),
    [expenseSearch, setExpenseSearch] = useState(""),
    [collectionSort, setCollectionSort] = useState<SortState | null>(null),
    [expenseSort, setExpenseSort] = useState<SortState | null>(null),
    [selectedFloor, setSelectedFloor] = useState(1),
    [modal, setModal] = useState(""),
    [receipt, setReceipt] = useState<Collection | null>(null),
    [selectedExpense, setSelectedExpense] = useState<Expense | null>(null),
    [editingExpense, setEditingExpense] = useState<Expense | null>(null),
    [expenseAttachmentUrl, setExpenseAttachmentUrl] = useState<string | null>(
      null,
    ),
    [cellEdit, setCellEdit] = useState<{
      id: string;
      field: "flat_number" | "resident_name" | "phone";
      value: string;
    } | null>(null),
    [flats, setFlats] = useState<Flat[]>([]),
    [collections, setCollections] = useState<Collection[]>([]),
    [expenses, setExpenses] = useState<Expense[]>([]),
    [festival, setFestival] = useState<any>(null),
    [categories, setCategories] = useState<{ id: string; name: string }[]>([]),
    [role, setRole] = useState("VIEWER"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: f, error: fe } = await supabase
      .from("festivals")
      .select("*")
      .eq("status", "ACTIVE")
      .limit(1)
      .single();
    if (fe || !f) {
      setError("Could not load the active festival. Please check the setup.");
      setLoading(false);
      return;
    }
    setFestival(f);
    setOpening(Number(f.opening_balance));
    const [flatRes, colRes, expRes, catRes, profileRes] = await Promise.all([
      supabase
        .from("flats")
        .select("*")
        .eq("active", true)
        .order("flat_number"),
      supabase
        .from("fund_collections")
        .select("*, flats(flat_number,resident_name)")
        .eq("festival_id", f.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("expenses")
        .select("*, expense_categories(name)")
        .eq("festival_id", f.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("expense_categories")
        .select("*")
        .eq("festival_id", f.id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .single(),
    ]);
    if (flatRes.error || colRes.error || expRes.error || catRes.error) {
      setError(
        "Could not load financial records. Please refresh or check your permissions.",
      );
    } else {
      setFlats(
        (flatRes.data ?? []).map((x: any) => ({
          id: x.id,
          number: x.flat_number,
          resident: x.resident_name || "Resident not added",
          phone: x.phone || "",
          expected: Number(x.expected_contribution),
        })),
      );
      setCollections(
        (colRes.data ?? []).map((x: any) => ({
          id: x.id,
          receipt: x.receipt_number,
          flat: x.flats?.flat_number || "—",
          resident: x.flats?.resident_name || "Resident not added",
          amount: Number(x.amount),
          date: x.payment_date,
          donationType: x.donation_type || "Donation",
          mode: x.payment_mode,
          status: x.status,
          notes: x.notes,
        })),
      );
      setExpenses(
        (expRes.data ?? []).map((x: any) => ({
          id: x.id,
          number: x.expense_number,
          date: x.expense_date,
          categoryId: x.category_id,
          category: x.expense_categories?.name || "Uncategorized",
          description: x.description,
          paidTo: x.paid_to || "—",
          amount: Number(x.amount),
          mode: x.payment_mode,
          status: x.status,
          notes: x.notes || "",
          attachmentPath: x.attachment_path,
        })),
      );
      setCategories(catRes.data ?? []);
      setRole(profileRes.data?.role || "VIEWER");
    }
    setLoading(false);
  }, [session.user.id]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return load();
    });
    return () => {
      active = false;
    };
  }, [load]);
  const income = collections
      .filter((x) => x.status === "ACTIVE")
      .reduce((s, x) => s + x.amount, 0),
    expense = expenses
      .filter((x) => x.status === "ACTIVE")
      .reduce((s, x) => s + x.amount, 0),
    balance = opening + income - expense;
  const visibleCollections = sortRows(
    collections
      .filter((collection) => collection.status === "ACTIVE")
      .filter((collection) => searchRow(collection, collectionSearch)),
    collectionSort,
  );
  const visibleExpenses = sortRows(
    expenses.filter((item) => searchRow(item, expenseSearch)),
    expenseSort,
  );
  const toggleSort = (
    setSort: React.Dispatch<React.SetStateAction<SortState | null>>,
    key: string,
  ) => {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  };
  const flatStatus = (n: string) => {
    const amount = collections
        .filter((c) => c.status === "ACTIVE" && c.flat === n)
        .reduce((s, c) => s + c.amount, 0),
      expected = flats.find((f) => f.number === n)?.expected || 0;
    return {
      amount,
      status:
        amount === 0 ? "PENDING" : amount >= expected ? "PAID" : "PARTIAL",
    };
  };
  const displayFlatNumber = (flatNumber: string) => {
    if (!flatNumber.startsWith("A-")) return flatNumber;
    const index = flats.findIndex((f) => f.number === flatNumber);
    if (index < 0) return flatNumber.replace(/^A-/, "");
    if (index < 11) return `1${String(index + 1).padStart(2, "0")}`;
    if (index === 11) return "113";
    if (index === 12) return "114";
    const offset = index - 13,
      floor = 2 + Math.floor(offset / 18),
      unit = 1 + (offset % 18);
    return `${floor}${String(unit).padStart(2, "0")}`;
  };
  const floorOf = (flatNumber: string) =>
    Math.floor(Number(displayFlatNumber(flatNumber)) / 100);
  const counts = flats.reduce(
    (a, f) => {
      a[flatStatus(f.number).status]++;
      return a;
    },
    { PAID: 0, PARTIAL: 0, PENDING: 0 } as Record<string, number>,
  );
  const exportWorkbook = () => {
    const collectionsSheet = collections.map((item) => ({
      "Receipt No.": item.receipt,
      Date: date(item.date),
      "Flat No.": displayFlatNumber(item.flat),
      "Resident Name": item.resident,
      "Donation Type": item.donationType,
      Amount: item.amount,
      "Payment Mode": item.mode,
      Status: item.status,
      Notes: item.notes || "",
    }));
    const expensesSheet = expenses.map((item) => ({
      "Expense No.": item.number,
      Date: date(item.date),
      Category: item.category,
      Description: item.description,
      "Paid To": item.paidTo,
      Amount: item.amount,
      "Payment Mode": item.mode,
      Status: item.status,
    }));
    const summarySheet = [
      { Item: "Festival", Value: festival?.name || "" },
      { Item: "Year", Value: festival?.year || "" },
      { Item: "Generated on", Value: date(today) },
      { Item: "Opening Balance", Value: opening },
      { Item: "Total Donations Received", Value: income },
      { Item: "Total Expenditure", Value: expense },
      { Item: "Current Balance", Value: balance },
      { Item: "Total Flats", Value: flats.length },
      { Item: "Paid Flats", Value: counts.PAID },
      { Item: "Partial Flats", Value: counts.PARTIAL },
      { Item: "Pending Flats", Value: counts.PENDING },
      { Item: "Outstanding Contributions", Value: Math.max(0, flats.reduce((sum, flat) => sum + flat.expected, 0) - income) },
    ];
    const workbook = XLSX.utils.book_new();
    const addSheet = (name: string, data: Record<string, unknown>[]) => {
      const sheet = XLSX.utils.json_to_sheet(data);
      sheet["!cols"] = Object.keys(data[0] || {}).map((heading) => ({ wch: Math.max(14, heading.length + 2) }));
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };
    addSheet("Donations", collectionsSheet);
    addSheet("Daily Expenditure", expensesSheet);
    addSheet("Summary", summarySheet);
    XLSX.writeFile(workbook, `ganesh-festival-${festival?.year || "report"}-export.xlsx`);
  };
  const exportPdf = async () => {
    const reportWindow = window.open("", "_blank");
    if (!reportWindow)
      return alert("Allow pop-ups for this site to export the PDF report.");

    reportWindow.document.write(
      "<!doctype html><title>Preparing festival statement…</title><p>Preparing PDF report…</p>",
    );
    const activeCollections = collections
      .filter((item) => item.status === "ACTIVE")
      .sort((a, b) =>
        displayFlatNumber(a.flat).localeCompare(displayFlatNumber(b.flat), undefined, {
          numeric: true,
        }),
      );
    const activeExpenses = expenses
      .filter((item) => item.status === "ACTIVE")
      .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
    const imageExpenses = activeExpenses.filter(
      (item) => item.attachmentPath && isImageAttachment(item.attachmentPath),
    );
    const attachmentUrls = await Promise.all(
      imageExpenses.map(async (item) => {
        const { data } = await supabase.storage
          .from("expense-bills")
          .createSignedUrl(item.attachmentPath!, 60 * 15);
        return [item.id, data?.signedUrl || ""] as const;
      }),
    );
    const billUrlByExpense = new Map(attachmentUrls);
    const donationRows = activeCollections
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.receipt)}</td>
          <td>${escapeHtml(date(item.date))}</td>
          <td>${escapeHtml(displayFlatNumber(item.flat))}</td>
          <td>${escapeHtml(item.resident)}</td>
          <td>${escapeHtml(item.donationType)}</td>
          <td class="amount">${escapeHtml(money(item.amount))}</td>
          <td>${escapeHtml(item.mode)}</td>
        </tr>`,
      )
      .join("");
    const expenseRows = activeExpenses
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.number)}</td>
          <td>${escapeHtml(date(item.date))}</td>
          <td>${escapeHtml(item.category)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(item.paidTo)}</td>
          <td class="amount">${escapeHtml(money(item.amount))}</td>
          <td>${escapeHtml(item.mode)}</td>
          <td>${
            item.attachmentPath
              ? isImageAttachment(item.attachmentPath)
                ? "Image bill attached"
                : "PDF bill attached"
              : "—"
          }</td>
        </tr>`,
      )
      .join("");
    const billImages = imageExpenses
      .map((item) => {
        const url = billUrlByExpense.get(item.id);
        return url
          ? `<figure>
              <img src="${escapeHtml(url)}" alt="Bill for ${escapeHtml(item.number)}" />
              <figcaption>${escapeHtml(item.number)} · ${escapeHtml(item.description)} · ${escapeHtml(money(item.amount))}</figcaption>
            </figure>`
          : `<p class="missing-bill">${escapeHtml(item.number)}: bill image could not be loaded.</p>`;
      })
      .join("");
    const pdfBills = activeExpenses.filter(
      (item) => item.attachmentPath && !isImageAttachment(item.attachmentPath),
    );

    reportWindow.addEventListener(
      "load",
      () => {
        reportWindow.focus();
        reportWindow.print();
      },
      { once: true },
    );
    reportWindow.document.open();
    reportWindow.document.write(`<!doctype html>
      <html lang="en"><head><meta charset="UTF-8" />
      <title>${escapeHtml(festival?.name || "Ganesh Festival")} — Financial Statement</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; }
        body { color: #1f2d27; font: 11px Arial, sans-serif; margin: 0; }
        h1 { font-size: 21px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 25px 0 9px; }
        .subtitle { color: #5f6f66; margin: 0; } .generated { color: #5f6f66; font-size: 10px; margin-top: 4px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
        .summary div { background: #f7f1ee; border: 1px solid #eadbd4; border-radius: 5px; padding: 10px; }
        .summary span { color: #6b584e; display: block; font-size: 10px; } .summary b { display: block; font-size: 16px; margin-top: 5px; }
        table { border-collapse: collapse; page-break-inside: auto; width: 100%; }
        .donations { table-layout: fixed; }
        .donations .receipt { width: 11%; } .donations .date { width: 9%; } .donations .flat { width: 5%; }
        .donations .resident { width: 39%; } .donations .type { width: 11%; } .donations .amount-col { width: 13%; } .donations .mode { width: 12%; }
        tr { page-break-inside: avoid; page-break-after: auto; } th { background: #7b2d26; color: #fff; font-size: 9px; font-weight: 800; letter-spacing: .05em; text-align: left; text-transform: uppercase; }
        th, td { border: 1px solid #dce3de; padding: 6px; vertical-align: top; } .donations td { overflow-wrap: anywhere; } td.amount { text-align: right; white-space: nowrap; }
        figure { break-inside: avoid; border: 1px solid #dce3de; margin: 0 0 14px; padding: 9px; }
        figure img { display: block; max-height: 165mm; max-width: 100%; object-fit: contain; width: auto; }
        figcaption { color: #4e6056; font-weight: bold; margin-top: 7px; } .missing-bill { color: #8d3328; }
        .note { color: #5f6f66; font-size: 10px; } @media print { .note { display: none; } }
        footer { border-top: 1px solid #dce3de; color: #4e6056; font-size: 10px; font-weight: bold; margin-top: 22px; padding-top: 8px; text-align: center; }
      </style></head><body>
      <h1>SLN Urbana - Ganesh Festival 2026 — Financial Statement</h1>
      <p class="subtitle">Festival year ${escapeHtml(festival?.year || "")}</p>
      <p class="generated">Generated on ${escapeHtml(date(today))}. Figures and tables include active records only.</p>
      <section class="summary">
        <div><span>Opening balance</span><b>${escapeHtml(money(opening))}</b></div>
        <div><span>Donations received</span><b>${escapeHtml(money(income))}</b></div>
        <div><span>Total expenses</span><b>${escapeHtml(money(expense))}</b></div>
        <div><span>Closing balance</span><b>${escapeHtml(money(balance))}</b></div>
      </section>
      <h2>Donations (Flat Number: ascending)</h2>
      <table class="donations"><colgroup><col class="receipt" /><col class="date" /><col class="flat" /><col class="resident" /><col class="type" /><col class="amount-col" /><col class="mode" /></colgroup><thead><tr><th>Receipt No.</th><th>Date</th><th>Flat</th><th>Resident</th><th>Type</th><th>Amount</th><th>Mode</th></tr></thead>
      <tbody>${donationRows || '<tr><td colspan="7">No active donations recorded.</td></tr>'}</tbody></table>
      <h2>Expenses (Date: ascending)</h2>
      <table><thead><tr><th>Expense No.</th><th>Date</th><th>Category</th><th>Description</th><th>Paid to</th><th>Amount</th><th>Mode</th><th>Bill</th></tr></thead>
      <tbody>${expenseRows || '<tr><td colspan="8">No active expenses recorded.</td></tr>'}</tbody></table>
      <h2>Expense bill images</h2>
      ${billImages || '<p class="note">No image bills have been uploaded.</p>'}
      ${pdfBills.length ? `<p class="note">PDF bill attachments: ${escapeHtml(pdfBills.map((item) => item.number).join(", "))}. Open them from the expense table when needed.</p>` : ""}
      <p class="note">Choose “Save as PDF” in the print dialog to download this statement.</p>
      <footer>SLN URBANA OWNERS WELFARE ASSOCIATION - ALWAL</footer>
      </body></html>`);
    reportWindow.document.close();
  };
  const saveCollection = async (fd: FormData) => {
    let flat = String(fd.get("flat")),
      amount = Number(fd.get("amount")),
      donationType = String(fd.get("donationType")),
      f = flats.find((x) => x.number === flat);
    if (!festival || festival.status === "CLOSED")
      return alert("This festival is closed to new donations.");
    if (!f || !amount || amount < 1)
      return alert("Select a flat and enter an amount greater than zero.");
    if (!donationTypes.includes(donationType))
      return alert("Select a donation type.");
    if (
      collections.some(
        (collection) =>
          collection.flat === flat &&
          collection.donationType === donationType &&
          collection.status === "ACTIVE",
      )
    )
      return alert(
        `An active ${donationType} entry already exists for flat ${displayFlatNumber(flat)}.`,
      );
    if (saving || !confirm("Create this donation and receipt?")) return;
    setSaving(true);
    const { data, error: dbError } = await supabase
      .from("fund_collections")
      .insert({
        festival_id: festival.id,
        flat_id: f.id,
        amount,
        donation_type: donationType,
        payment_date: String(fd.get("date")),
        payment_mode: String(fd.get("mode")),
        notes: String(fd.get("notes")) || null,
        created_by: session.user.id,
      })
      .select("*, flats(flat_number,resident_name)")
      .single();
    setSaving(false);
    if (dbError?.message.includes("already exists"))
      return alert(
        `An active ${donationType} entry already exists for flat ${displayFlatNumber(flat)}.`,
      );
    if (dbError?.message.includes("donation_type"))
      return alert(
        "Donation Type setup is pending. Apply the latest Supabase migration, then try again.",
      );
    if (dbError || !data)
      return alert("Donation could not be saved. Please try again.");
    const c: Collection = {
      id: data.id,
      receipt: data.receipt_number,
      flat: data.flats?.flat_number || f.number,
      resident: data.flats?.resident_name || f.resident,
      amount: Number(data.amount),
      date: data.payment_date,
      donationType: data.donation_type || donationType,
      mode: data.payment_mode,
      status: data.status,
      notes: data.notes,
    };
    setCollections((x) => [c, ...x]);
    setReceipt(c);
    setModal("receipt");
  };
  const closeExpenseModal = () => {
    setModal("");
    setEditingExpense(null);
    setSelectedExpense(null);
    setExpenseAttachmentUrl(null);
  };
  const saveExpense = async (fd: FormData) => {
    const amount = Number(fd.get("amount"));
    const categoryId = String(fd.get("category"));
    const description = String(fd.get("description")).trim();
    const category = categories.find((x) => x.id === categoryId);
    const billEntry = fd.get("bill");
    const bill = billEntry instanceof File && billEntry.size > 0 ? billEntry : null;
    const allowedBillTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!festival || (!editingExpense && festival.status === "CLOSED"))
      return alert("This festival is closed to new expenses.");
    if (editingExpense?.status && editingExpense.status !== "ACTIVE")
      return alert("Voided expenses cannot be edited.");
    if (!amount || amount < 1 || !category || !description)
      return alert("Fill in the required fields and use an amount greater than zero.");
    if (bill && (!allowedBillTypes.includes(bill.type) || bill.size > 10 * 1024 * 1024))
      return alert("Attach a PDF, JPG, PNG, or WebP bill no larger than 10 MB.");
    if (saving || !confirm(editingExpense ? "Update this expense?" : "Record this expense?"))
      return;

    const safeBillName = bill
      ? bill.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "bill"
      : "";
    const attachmentPath = bill
      ? `${festival.id}/${crypto.randomUUID()}-${safeBillName}`
      : editingExpense?.attachmentPath || null;
    const values = {
      expense_date: String(fd.get("date")),
      category_id: category.id,
      description,
      paid_to: String(fd.get("paidTo")).trim() || null,
      amount,
      payment_mode: String(fd.get("mode")),
      notes: String(fd.get("notes")).trim() || null,
      attachment_path: attachmentPath,
    };

    setSaving(true);
    const result = editingExpense
      ? await supabase.from("expenses").update(values).eq("id", editingExpense.id).select("id").single()
      : await supabase
          .from("expenses")
          .insert({ festival_id: festival.id, ...values, created_by: session.user.id })
          .select("id")
          .single();
    if (result.error || !result.data) {
      setSaving(false);
      return alert("Expense could not be saved. Please try again.");
    }

    let attachmentError = "";
    if (bill && attachmentPath) {
      const { error: uploadError } = await supabase.storage
        .from("expense-bills")
        .upload(attachmentPath, bill, { contentType: bill.type });
      if (uploadError) {
        attachmentError = " The expense was saved, but the bill could not be uploaded.";
        await supabase
          .from("expenses")
          .update({ attachment_path: editingExpense?.attachmentPath || null })
          .eq("id", result.data.id);
      } else if (
        editingExpense?.attachmentPath &&
        editingExpense.attachmentPath !== attachmentPath
      ) {
        await supabase.storage.from("expense-bills").remove([editingExpense.attachmentPath]);
      }
    }
    setSaving(false);
    await load();
    closeExpenseModal();
    if (attachmentError) alert(attachmentError);
  };
  const viewExpense = async (item: Expense) => {
    setSelectedExpense(item);
    setExpenseAttachmentUrl(null);
    setModal("expenseView");
    if (!item.attachmentPath) return;
    const { data, error: urlError } = await supabase.storage
      .from("expense-bills")
      .createSignedUrl(item.attachmentPath, 60 * 15);
    if (urlError || !data?.signedUrl)
      return alert("The attached bill could not be opened.");
    setExpenseAttachmentUrl(data.signedUrl);
  };
  const editExpense = (item: Expense) => {
    if (item.status !== "ACTIVE") return alert("Voided expenses cannot be edited.");
    setEditingExpense(item);
    setModal("expense");
  };
  const voidItem = async (kind: "c" | "e", id: string) => {
    if (role !== "ADMIN")
      return alert("Only administrators may void a financial record.");
    const reason = prompt("Reason for voiding this record?");
    if (
      !reason?.trim() ||
      !confirm("Void this record? It will remain in the audit history.")
    )
      return;
    const table = kind === "c" ? "fund_collections" : "expenses";
    const { error: dbError } = await supabase
      .from(table)
      .update({ status: "VOIDED", void_reason: reason })
      .eq("id", id);
    if (dbError) return alert("The record could not be voided.");
    load();
  };
  const saveCell = async () => {
    if (!cellEdit) return;
    const { id, field } = cellEdit,
      value = cellEdit.value.trim();
    if (field === "flat_number" && !value)
      return alert("Flat number is required.");
    setSaving(true);
    const { error: dbError } = await supabase
      .from("flats")
      .update({ [field]: value || null })
      .eq("id", id);
    setSaving(false);
    if (dbError)
      return alert(
        field === "flat_number"
          ? "That flat number could not be saved. It may already exist."
          : "The flat detail could not be saved.",
      );
    setFlats((x) =>
      x.map((f) => {
        if (f.id !== id) return f;
        if (field === "flat_number") return { ...f, number: value };
        if (field === "resident_name")
          return { ...f, resident: value || "Resident not added" };
        return { ...f, phone: value };
      }),
    );
    setCellEdit(null);
  };
  const nav = [
    "Dashboard",
    "Flats",
    "Donations",
    "Expenses",
    "Reports",
    "Settings",
  ];
  if (loading)
    return (
      <div className="login">
        <p>Loading festival records…</p>
      </div>
    );
  if (error)
    return (
      <div className="login">
        <h2>Unable to open festival records</h2>
        <p>{error}</p>
        <button className="primary" onClick={load}>
          Try again
        </button>
      </div>
    );
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <i>ॐ</i>
          <div>
            Ganesh Fund<small>Festival Manager</small>
          </div>
        </div>
        <nav>
          {nav.map((x) => (
            <button
              key={x}
              className={page === x ? "selected" : ""}
              onClick={() => setPage(x)}
            >
              {x}
            </button>
          ))}
        </nav>
        <div className="account">
          {role}
          <br />
          <button className="signout" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </aside>
      <main>
        {page === "Dashboard" && (
          <div className="associationTitle">
            SLN URBANA OWNERS WELFARE ASSOCIATION
          </div>
        )}
        <header>
          <div>
            <p>
              {festival?.name} · <b>{festival?.status}</b>
            </p>
            <h1>{page}</h1>
          </div>
          <div>
            <button className="muted">
              {today.split("-").reverse().join("-")}
            </button>
          </div>
        </header>
        {page === "Dashboard" && (
          <Dashboard
            {...{
              opening,
              income,
              expense,
              balance,
              counts,
              collections,
              expenses,
              setModal,
              setPage,
              role,
            }}
          />
        )}
        {page === "Flats" && (
          <section>
            <div className="sectionTitle">
              <div>
                <h2>Flat directory</h2>
                <p>
                  Click a flat number, resident, or phone cell to edit it.
                  Financial columns are calculated automatically.
                </p>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search flat or resident"
              />
            </div>
            <div className="flatLayout">
              <div className="floorMenu">
                <small>SELECT FLOOR</small>
                {[1, 2, 3, 4, 5, 6].map((floor) => (
                  <button
                    className={selectedFloor === floor ? "selectedFloor" : ""}
                    key={floor}
                    onClick={() => setSelectedFloor(floor)}
                  >
                    <b>Floor {floor}</b>
                    <span>{floor === 1 ? "13 flats" : "18 flats"}</span>
                  </button>
                ))}
              </div>
              <div className="floorContent">
                <div className="floorTitle">
                  <div>
                    <h3>Floor {selectedFloor}</h3>
                    <span>
                      {selectedFloor === 1
                        ? "Flats 101–111, 113 and 114"
                        : "Flats " +
                          selectedFloor +
                          "01–" +
                          selectedFloor +
                          "18"}
                    </span>
                  </div>
                  <b>
                    {
                      flats.filter((f) => floorOf(f.number) === selectedFloor)
                        .length
                    }{" "}
                    homes
                  </b>
                </div>
                <Table
                  headers={[
                    "Flat Number",
                    "Resident",
                    "Total Collected",
                    "Outstanding",
                    "Payment Status",
                  ]}
                >
                  <>
                    {flats
                      .filter((f) => floorOf(f.number) === selectedFloor)
                      .filter((f) =>
                        (displayFlatNumber(f.number) + f.resident)
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((f) => {
                        let v = flatStatus(f.number),
                          isNumber =
                            cellEdit?.id === f.id &&
                            cellEdit.field === "flat_number",
                          isResident =
                            cellEdit?.id === f.id &&
                            cellEdit.field === "resident_name";
                        return (
                          <tr key={f.id}>
                            <td>
                              <InlineCell
                                editable={role === "ADMIN"}
                                value={
                                  isNumber
                                    ? (cellEdit?.value ?? '')
                                    : displayFlatNumber(f.number)
                                }
                                placeholder="Flat number"
                                active={isNumber}
                                onStart={() =>
                                  setCellEdit({
                                    id: f.id,
                                    field: "flat_number",
                                    value: displayFlatNumber(f.number),
                                  })
                                }
                                onChange={(value: string) =>
                                  setCellEdit((x) => (x ? { ...x, value } : x))
                                }
                                onSave={saveCell}
                                onCancel={() => setCellEdit(null)}
                              />
                            </td>
                            <td>
                              <InlineCell
                                editable={role === "ADMIN"}
                                value={isResident ? (cellEdit?.value ?? '') : f.resident}
                                placeholder="Add resident name"
                                active={isResident}
                                onStart={() =>
                                  setCellEdit({
                                    id: f.id,
                                    field: "resident_name",
                                    value:
                                      f.resident === "Resident not added"
                                        ? ""
                                        : f.resident,
                                  })
                                }
                                onChange={(value: string) =>
                                  setCellEdit((x) => (x ? { ...x, value } : x))
                                }
                                onSave={saveCell}
                                onCancel={() => setCellEdit(null)}
                              />
                            </td>
                            <td>{money(v.amount)}</td>
                            <td>{money(Math.max(0, f.expected - v.amount))}</td>
                            <td>
                              <Badge s={v.status} />
                            </td>
                          </tr>
                        );
                      })}
                  </>
                </Table>
              </div>
            </div>
          </section>
        )}
        {page === "Donations" && (
          <section>
            <Top
              title="Donation history"
              description="View every active donation received for the festival."
              action={role !== "VIEWER" ? "+ Add Donation" : ""}
              onClick={() => setModal("collection")}
            />
            <Filters
              value={collectionSearch}
              onChange={setCollectionSearch}
              placeholder="Search donations"
            />
            <Table
              headers={[
                { label: "Receipt No.", sortKey: "receipt" },
                { label: "Date", sortKey: "date" },
                { label: "Flat", sortKey: "flat" },
                { label: "Resident", sortKey: "resident" },
                { label: "Donation Type", sortKey: "donationType" },
                { label: "Amount", sortKey: "amount" },
                { label: "Mode", sortKey: "mode" },
                { label: "Status", sortKey: "status" },
                { label: "Actions" },
              ]}
              sort={collectionSort}
              onSort={(key) => toggleSort(setCollectionSort, key)}
            >
              <>
                {visibleCollections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.receipt}</b>
                    </td>
                    <td>{date(c.date)}</td>
                    <td>{c.flat}</td>
                    <td>{c.resident}</td>
                    <td>{c.donationType}</td>
                    <td>{money(c.amount)}</td>
                    <td>{c.mode}</td>
                    <td>
                      <Badge s={c.status} />
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={() => {
                          setReceipt(c);
                          setModal("receipt");
                        }}
                      >
                        Receipt
                      </button>
                      {c.status === "ACTIVE" && role === "ADMIN" && (
                        <button
                          className="link danger"
                          onClick={() => voidItem("c", c.id)}
                        >
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </>
            </Table>
          </section>
        )}
        {page === "Expenses" && (
          <section>
            <Top
              title="Expense history"
              description="Every expense stays available for transparent auditing."
              action={role === "ADMIN" ? "+ Add Expense" : ""}
              onClick={() => {
                setEditingExpense(null);
                setModal("expense");
              }}
            />
            <Filters
              value={expenseSearch}
              onChange={setExpenseSearch}
              placeholder="Search expenses"
            />
            <Table
              headers={[
                { label: "Expense No.", sortKey: "number" },
                { label: "Date", sortKey: "date" },
                { label: "Category", sortKey: "category" },
                { label: "Description", sortKey: "description" },
                { label: "Paid To", sortKey: "paidTo" },
                { label: "Amount", sortKey: "amount" },
                { label: "Mode", sortKey: "mode" },
                { label: "Status", sortKey: "status" },
                { label: "Actions" },
              ]}
              sort={expenseSort}
              onSort={(key) => toggleSort(setExpenseSort, key)}
            >
              <>
                {visibleExpenses.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <b>{e.number}</b>
                    </td>
                    <td>{date(e.date)}</td>
                    <td>{e.category}</td>
                    <td>{e.description}</td>
                    <td>{e.paidTo}</td>
                    <td>{money(e.amount)}</td>
                    <td>{e.mode}</td>
                    <td>
                      <Badge s={e.status} />
                    </td>
                    <td>
                      <button className="link" onClick={() => void viewExpense(e)}>
                        View
                      </button>
                      {e.status === "ACTIVE" && role === "ADMIN" && (
                        <button className="link" onClick={() => editExpense(e)}>
                          Edit
                        </button>
                      )}
                      {e.status === "ACTIVE" && role === "ADMIN" && (
                        <button
                          className="link danger"
                          onClick={() => voidItem("e", e.id)}
                        >
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </>
            </Table>
          </section>
        )}
        {page === "Reports" && (
          <Reports
            {...{
              opening,
              income,
              expense,
              balance,
              counts,
              collections,
              expenses,
            }}
          />
        )}
        {page === "Settings" && (
          <section>
            <Top
              title="Festival settings"
              description="Financial totals are always calculated from records."
              action={role === "ADMIN" ? "Edit settings" : ""}
              onClick={() => setModal("settings")}
            />
            <div className="settings">
              <Setting label="Festival name" value={festival?.name} />
              <Setting label="Year" value={String(festival?.year)} />
              <Setting label="Opening balance" value={money(opening)} />
              <Setting
                label="Expected contribution / flat"
                value={money(Number(festival?.expected_contribution || 0))}
              />
              <Setting label="Status" value={festival?.status} />
            </div>
            <div className="exportCard">
              <div>
                <h2>Export financial records</h2>
                <p>
                  Download an Excel workbook or a print-ready PDF statement
                  with bills.
                </p>
              </div>
              <div className="exportActions">
                <button className="primary" onClick={exportWorkbook}>
                  Export Excel workbook
                </button>
                <button className="muted" onClick={() => void exportPdf()}>
                  Export PDF statement
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
      {modal === "collection" && (
        <CollectionForm
          flats={flats}
          close={() => setModal("")}
          save={saveCollection}
          saving={saving}
        />
      )}{" "}
      {modal === "expense" && (
        <ExpenseForm
          close={closeExpenseModal}
          save={saveExpense}
          categories={categories}
          saving={saving}
          expense={editingExpense}
        />
      )}{" "}
      {modal === "expenseView" && selectedExpense && (
        <ExpenseDetails
          expense={selectedExpense}
          attachmentUrl={expenseAttachmentUrl}
          close={closeExpenseModal}
        />
      )}{" "}
      {modal === "settings" && (
        <Settings
          value={opening}
          set={setOpening}
          close={() => setModal("")}
          festivalId={festival.id}
          reload={load}
        />
      )}{" "}
      {modal === "receipt" && receipt && (
        <Receipt c={receipt} close={() => setModal("")} />
      )}
    </div>
  );
}
function Card({ t, v, green }: { t: string; v: string; green?: boolean }) {
  return (
    <article className={"card " + (green ? "green" : "")}>
      <p>{t}</p>
      <h2>{v}</h2>
    </article>
  );
}
function Badge({ s }: { s: string }) {
  return <span className={"badge " + s.toLowerCase()}>{s}</span>;
}
function Dashboard(p: any) {
  return (
    <section>
      <div className="cards">
        <Card t="Opening balance" v={money(p.opening)} />
        <Card t="Donations received" v={money(p.income)} />
        <Card t="Total expenditure" v={money(p.expense)} />
        <Card t="Current balance" v={money(p.balance)} green />
      </div>
      <div className="grid">
        <article className="panel">
          <div className="row">
            <div>
              <h2>Donation progress</h2>
              <p>Expected ₹1,03,000</p>
            </div>
            <b className="orange">{Math.round(p.income / 1030)}%</b>
          </div>
          <div className="progress">
            <i style={{ width: `${Math.min(100, p.income / 1030)}%` }} />
          </div>
          <div className="statuses">
            <span>
              Paid <b>{p.counts.PAID}</b>
            </span>
            <span>
              Partial <b>{p.counts.PARTIAL}</b>
            </span>
            <span>
              Pending <b>{p.counts.PENDING}</b>
            </span>
          </div>
        </article>
        <article className="panel quick">
          <h2>Quick actions</h2>
          {p.role !== "VIEWER" && (
            <button onClick={() => p.setModal("collection")}>
              + Add festival donation
            </button>
          )}
          {p.role === "ADMIN" && (
            <button onClick={() => p.setModal("expense")}>
              + Add festival expense
            </button>
          )}
          <button onClick={() => p.setPage("Reports")}>
            View financial reports →
          </button>
        </article>
      </div>
      <div className="grid">
        <Recent title="Recent donations" items={p.collections} />
        <Recent title="Recent expenses" items={p.expenses} />
      </div>
    </section>
  );
}
function Recent({ title, items }: any) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      {items.slice(0, 4).map((x: any) => (
        <div className="recent" key={x.id}>
          <span>
            <b>{x.flat || x.category}</b>
            <small>
              {x.receipt || x.number} · {date(x.date)}
            </small>
          </span>
          <b>{money(x.amount)}</b>
        </div>
      ))}
    </article>
  );
}
function Top({ title, description, action, onClick }: any) {
  return (
    <div className="sectionTitle">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action && (
        <button className="primary" onClick={onClick}>
          {action}
        </button>
      )}
    </div>
  );
}
function Filters({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="filters">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}
function Table({
  headers,
  children,
  sort,
  onSort,
}: {
  headers: (string | TableHeader)[];
  children: any;
  sort?: SortState | null;
  onSort?: (key: string) => void;
}) {
  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            {headers.map((header) => {
              const item =
                typeof header === "string" ? { label: header } : header;
              const direction =
                sort?.key === item.sortKey
                  ? sort?.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined;
              return (
                <th key={item.label} aria-sort={direction}>
                  {item.sortKey && onSort ? (
                    <button
                      className="sortButton"
                      onClick={() => onSort(item.sortKey!)}
                    >
                      {item.label}
                      <span aria-hidden="true">
                        {direction === "ascending"
                          ? " ▲"
                          : direction === "descending"
                            ? " ▼"
                            : " ↕"}
                      </span>
                    </button>
                  ) : (
                    item.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Reports(p: any) {
  const rows = [
    {
      date: "2026-09-01",
      ref: "OPENING",
      d: "Opening Balance",
      in: p.opening,
      out: 0,
    },
    ...p.collections
      .filter((x: any) => x.status === "ACTIVE")
      .map((x: any) => ({
        date: x.date,
        ref: x.receipt,
        d: `Festival Contribution · ${x.flat}`,
        in: x.amount,
        out: 0,
      })),
    ...p.expenses
      .filter((x: any) => x.status === "ACTIVE")
      .map((x: any) => ({
        date: x.date,
        ref: x.number,
        d: `${x.category} · ${x.description}`,
        in: 0,
        out: x.amount,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const rowsWithBalance = rows.map((row, index) => ({
    ...row,
    balance: rows
      .slice(0, index + 1)
      .reduce((sum, entry) => sum + entry.in - entry.out, 0),
  }));
  return (
    <section>
      <Top
        title="Financial reports"
        description="Live figures calculated from active transaction data."
        action="Print statement"
        onClick={() => print()}
      />
      <div className="cards">
        <Card t="Opening balance" v={money(p.opening)} />
        <Card t="Total income" v={money(p.income)} />
        <Card t="Total expense" v={money(p.expense)} />
        <Card t="Closing balance" v={money(p.balance)} green />
      </div>
      <div className="grid">
        <article className="panel">
          <h2>Donation report</h2>
          <Line a="Expected donations" b="₹1,03,000" />
          <Line a="Outstanding donations" b={money(103000 - p.income)} />
          <Line
            a="Paid / Partial / Pending"
            b={`${p.counts.PAID} / ${p.counts.PARTIAL} / ${p.counts.PENDING}`}
          />
        </article>
        <article className="panel">
          <h2>Expense report</h2>
          {cats
            .filter((c) => p.expenses.some((e: any) => e.category === c))
            .map((c) => (
              <Line
                key={c}
                a={c}
                b={money(
                  p.expenses
                    .filter(
                      (e: any) => e.category === c && e.status === "ACTIVE",
                    )
                    .reduce((s: number, e: any) => s + e.amount, 0),
                )}
              />
            ))}
        </article>
      </div>
      <article className="panel cash">
        <h2>Cashbook</h2>
        <Table
          headers={[
            "Date",
            "Reference",
            "Description",
            "Income",
            "Expense",
            "Running Balance",
          ]}
        >
          <>
            {rowsWithBalance.map((x, i) => {
              return (
                <tr key={i}>
                  <td>{date(x.date)}</td>
                  <td>
                    <b>{x.ref}</b>
                  </td>
                  <td>{x.d}</td>
                  <td>{x.in ? money(x.in) : "—"}</td>
                  <td>{x.out ? money(x.out) : "—"}</td>
                  <td>
                    <b>{money(x.balance)}</b>
                  </td>
                </tr>
              );
            })}
          </>
        </Table>
      </article>
    </section>
  );
}
function Line({ a, b }: { a: string; b: string }) {
  return (
    <div className="line">
      <span>{a}</span>
      <b>{b}</b>
    </div>
  );
}
function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
function Modal({ title, close, children }: any) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="modalhead">
          <h2>{title}</h2>
          <button onClick={close}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function CollectionForm({ flats, close, save, saving }: any) {
  return (
    <Modal title="Add festival donation" close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save(new FormData(event.currentTarget));
        }}
      >
        <label>
          Flat
          <select name="flat" required>
            <option value="">Select flat</option>
            {flats.map((f: any) => (
              <option value={f.number} key={f.id}>
                {f.number} · {f.resident}
              </option>
            ))}
          </select>
        </label>
        <label>
          Donation type
          <select name="donationType" defaultValue="Donation" required>
            {donationTypes.map((type) => (
              <option value={type} key={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <div className="formgrid">
          <label>
            Amount (₹)
            <input
              name="amount"
              type="number"
              min="1"
              required
              placeholder="1000"
            />
          </label>
          <label>
            Payment date
            <input
              name="date"
              type="date"
              max={today}
              defaultValue={today}
              required
            />
          </label>
        </div>
        <label>
          Payment mode
          <select name="mode">
            <option>UPI</option>
            <option>CASH</option>
            <option>BANK_TRANSFER</option>
            <option>OTHER</option>
          </select>
        </label>
        <label>
          Notes
          <textarea name="notes" placeholder="Optional note" />
        </label>
        <Actions
          close={close}
          text={saving ? "Saving…" : "Confirm & create receipt"}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}
function ExpenseForm({ close, save, categories, saving, expense }: any) {
  const editing = Boolean(expense);
  return (
    <Modal title={editing ? "Edit festival expense" : "Add festival expense"} close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save(new FormData(event.currentTarget));
        }}
      >
        <div className="formgrid">
          <label>
            Date
            <input
              name="date"
              type="date"
              max={today}
              defaultValue={expense?.date || today}
              required
            />
          </label>
          <label>
            Category
            <select name="category" defaultValue={expense?.categoryId || ""} required>
              <option value="">Select category</option>
              {expense && !categories.some((x: any) => x.id === expense.categoryId) && (
                <option value={expense.categoryId}>{expense.category}</option>
              )}
              {categories.map((x: any) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <input
            name="description"
            required
            defaultValue={expense?.description || ""}
            placeholder="What was purchased?"
          />
        </label>
        <div className="formgrid">
          <label>
            Amount (INR)
            <input name="amount" type="number" min="1" defaultValue={expense?.amount || ""} required />
          </label>
          <label>
            Paid to
            <input
              name="paidTo"
              defaultValue={expense?.paidTo === "—" ? "" : expense?.paidTo || ""}
              placeholder="Vendor or person"
            />
          </label>
        </div>
        <label>
          Payment mode
          <select name="mode" defaultValue={expense?.mode || "UPI"}>
            <option>UPI</option>
            <option>CASH</option>
            <option>BANK_TRANSFER</option>
            <option>OTHER</option>
          </select>
        </label>
        <label>
          Notes
          <textarea name="notes" defaultValue={expense?.notes || ""} placeholder="Optional note" />
        </label>
        <label>
          Bill attachment (PDF, JPG, PNG, or WebP; max 10 MB)
          <input name="bill" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
          {expense?.attachmentPath && (
            <small className="fieldHelp">A bill is already attached. Choose a new file to replace it.</small>
          )}
        </label>
        <Actions
          close={close}
          text={saving ? "Saving..." : editing ? "Update expense" : "Confirm expense"}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}
function ExpenseDetails({ expense, attachmentUrl, close }: any) {
  const isImage = /\.(jpe?g|png|webp)(?:$|\?)/i.test(expense.attachmentPath || "");
  return (
    <Modal title="Expense details" close={close}>
      <div className="expenseDetails">
        <Line a="Expense no." b={expense.number} />
        <Line a="Date" b={date(expense.date)} />
        <Line a="Category" b={expense.category} />
        <Line a="Description" b={expense.description} />
        <Line a="Paid to" b={expense.paidTo} />
        <Line a="Amount" b={money(expense.amount)} />
        <Line a="Payment mode" b={expense.mode} />
        <Line a="Status" b={expense.status} />
        {expense.notes && <Line a="Notes" b={expense.notes} />}
        <h3>Bill attachment</h3>
        {!expense.attachmentPath && <p className="emptyAttachment">No bill was attached.</p>}
        {expense.attachmentPath && !attachmentUrl && (
          <p className="emptyAttachment">Loading attached bill...</p>
        )}
        {attachmentUrl && (
          <>
            {isImage ? (
              <img className="billPreview" src={attachmentUrl} alt={`Bill for ${expense.number}`} />
            ) : (
              <iframe className="billPreview" src={attachmentUrl} title={`Bill for ${expense.number}`} />
            )}
            <a className="attachmentLink" href={attachmentUrl} target="_blank" rel="noreferrer">
              Open bill in a new tab
            </a>
          </>
        )}
      </div>
      <div className="actions">
        <button type="button" className="muted" onClick={close}>Close</button>
      </div>
    </Modal>
  );
}
function Actions({
  close,
  text,
  disabled = false,
}: {
  close: () => void;
  text: string;
  disabled?: boolean;
}) {
  return (
    <div className="actions">
      <button type="button" className="muted" onClick={close}>
        Cancel
      </button>
      <button disabled={disabled} className="primary">
        {text}
      </button>
    </div>
  );
}
function Settings({ value, set, close, festivalId, reload }: any) {
  const [v, setV] = useState(value),
    [saving, setSaving] = useState(false);
  const save = async () => {
    if (!confirm("Save opening balance?")) return;
    setSaving(true);
    const { error } = await supabase
      .from("festivals")
      .update({ opening_balance: v })
      .eq("id", festivalId);
    setSaving(false);
    if (error) return alert("Settings could not be saved.");
    set(v);
    close();
    reload();
  };
  return (
    <Modal title="Festival settings" close={close}>
      <p className="notice">
        Changing the opening balance affects the calculated closing balance.
        Existing transactions are never changed.
      </p>
      <label>
        Opening balance (₹)
        <input
          type="number"
          min="0"
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
        />
      </label>
      <div className="actions">
        <button className="muted" onClick={close}>
          Cancel
        </button>
        <button className="primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}
function InlineCell({
  value,
  placeholder,
  editable,
  active,
  onStart,
  onChange,
  onSave,
  onCancel,
}: any) {
  if (!editable) return <span>{value || "—"}</span>;
  if (active)
    return (
      <input
        className="inlineInput"
        autoFocus
        value={value === undefined ? "" : value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
      />
    );
  return (
    <button
      className={
        "inlineCell " +
        (!value || value === "Resident not added" ? "empty" : "")
      }
      onClick={onStart}
    >
      {!value || value === "Resident not added" ? placeholder : value}
    </button>
  );
}
function Receipt({ c, close }: any) {
  return (
    <Modal title="Donation receipt" close={close}>
      <ReceiptContent c={c} />
      <div className="receiptPrintCopy">
        <ReceiptContent c={c} />
      </div>
      <div className="actions noPrint">
        <button className="muted" onClick={close}>
          Close
        </button>
        <button className="primary" onClick={() => print()}>
          Print receipt
        </button>
      </div>
    </Modal>
  );
}
function ReceiptContent({ c }: { c: Collection }) {
  return (
    <div className="receipt">
        <div className="receiptbrand">
          <svg
            className="ganeshaLogo"
            viewBox="0 0 64 64"
            role="img"
            aria-label="Ganesha"
          >
            <path d="M32 8 38 16 32 20 26 16Z" />
            <path d="M27 22c-7-5-14-1-14 7 0 7 5 11 12 9" />
            <path d="M37 22c7-5 14-1 14 7 0 7-5 11-12 9" />
            <path d="M25 24c2-5 12-5 14 0 3 7-1 11-7 11s-10-4-7-11Z" />
            <path d="M32 30v17c0 5-4 8-8 5-2-2-1-6 2-6" />
            <path d="M28 39c2 2 6 2 8 0" />
            <circle cx="28" cy="28" r="1.2" fill="currentColor" />
            <circle cx="36" cy="28" r="1.2" fill="currentColor" />
          </svg>
          <b>SLN GANESH FESTIVAL 2026</b>
        </div>
        <h3>DONATION RECEIPT</h3>
        <div className="receiptline">
          <span>
            Receipt no.<b>{c.receipt}</b>
          </span>
          <span>
            Date<b>{date(c.date)}</b>
          </span>
        </div>
        <Line a="Flat number" b={c.flat} />
        <Line a="Resident" b={c.resident} />
        <Line a="Donation type" b={c.donationType} />
        <div className="amount">
          <small>Amount received</small>
          <b>{money(c.amount)}</b>
          <span>
            {c.amount === 1000
              ? "One Thousand Rupees Only"
              : `${money(c.amount)} Rupees Only`}
          </span>
        </div>
        <Line a="Payment mode" b={c.mode} />
        {c.notes && <Line a="Notes" b={c.notes} />}
        <p className="thanks">Thank You for Your Contribution</p>
        <footer>Ganesh Festival Committee</footer>
    </div>
  );
}
function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) setMessage("Sign-in failed. Check your email and password.");
  };
  return (
    <div className="login">
      <div className="loginCard">
        <div className="loginOm">ॐ</div>
        <h1>Ganesh Fund</h1>
        <p>SLN Urbana Festival Manager</p>
        <p className="loginNotice">
          Private portal for authorised Ganesh Festival Committee members.
          We never ask for UPI PINs, OTPs, card details, or bank passwords.
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {message && <p className="loginError">{message}</p>}
          <button disabled={busy} className="primary">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
