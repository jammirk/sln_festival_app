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
  mode: string;
  status: "ACTIVE" | "VOIDED";
  notes?: string;
};
type Expense = {
  id: string;
  number: string;
  date: string;
  category: string;
  description: string;
  paidTo: string;
  amount: number;
  mode: string;
  status: "ACTIVE" | "VOIDED";
};
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
const date = (d: string) => d.split("-").reverse().join("-");
const today = "2026-09-11";
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
    [selectedFloor, setSelectedFloor] = useState(1),
    [modal, setModal] = useState(""),
    [receipt, setReceipt] = useState<Collection | null>(null),
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
          category: x.expense_categories?.name || "Uncategorized",
          description: x.description,
          paidTo: x.paid_to || "—",
          amount: Number(x.amount),
          mode: x.payment_mode,
          status: x.status,
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
      { Item: "Total Funds Collected", Value: income },
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
    addSheet("Funds Collections", collectionsSheet);
    addSheet("Daily Expenditure", expensesSheet);
    addSheet("Summary", summarySheet);
    XLSX.writeFile(workbook, `ganesh-festival-${festival?.year || "report"}-export.xlsx`);
  };
  const saveCollection = async (fd: FormData) => {
    let flat = String(fd.get("flat")),
      amount = Number(fd.get("amount")),
      f = flats.find((x) => x.number === flat);
    if (!festival || festival.status === "CLOSED")
      return alert("This festival is closed to new collections.");
    if (!f || !amount || amount < 1)
      return alert("Select a flat and enter an amount greater than zero.");
    if (saving || !confirm("Create this collection and receipt?")) return;
    setSaving(true);
    const { data, error: dbError } = await supabase
      .from("fund_collections")
      .insert({
        festival_id: festival.id,
        flat_id: f.id,
        amount,
        payment_date: String(fd.get("date")),
        payment_mode: String(fd.get("mode")),
        notes: String(fd.get("notes")) || null,
        created_by: session.user.id,
      })
      .select("*, flats(flat_number,resident_name)")
      .single();
    setSaving(false);
    if (dbError || !data)
      return alert("Collection could not be saved. Please try again.");
    const c: Collection = {
      id: data.id,
      receipt: data.receipt_number,
      flat: data.flats?.flat_number || f.number,
      resident: data.flats?.resident_name || f.resident,
      amount: Number(data.amount),
      date: data.payment_date,
      mode: data.payment_mode,
      status: data.status,
      notes: data.notes,
    };
    setCollections((x) => [c, ...x]);
    setReceipt(c);
    setModal("receipt");
  };
  const saveExpense = async (fd: FormData) => {
    let amount = Number(fd.get("amount")),
      categoryId = String(fd.get("category")),
      description = String(fd.get("description")),
      category = categories.find((x) => x.id === categoryId);
    if (!festival || festival.status === "CLOSED")
      return alert("This festival is closed to new expenses.");
    if (!amount || amount < 1 || !category || !description)
      return alert(
        "Fill in the required fields and use an amount greater than zero.",
      );
    if (saving || !confirm("Record this expense?")) return;
    setSaving(true);
    const { data, error: dbError } = await supabase
      .from("expenses")
      .insert({
        festival_id: festival.id,
        expense_date: String(fd.get("date")),
        category_id: category.id,
        description,
        paid_to: String(fd.get("paidTo")) || null,
        amount,
        payment_mode: String(fd.get("mode")),
        notes: null,
        created_by: session.user.id,
      })
      .select("*, expense_categories(name)")
      .single();
    setSaving(false);
    if (dbError || !data)
      return alert("Expense could not be saved. Please try again.");
    setExpenses((x) => [
      {
        id: data.id,
        number: data.expense_number,
        date: data.expense_date,
        category: data.expense_categories?.name || category.name,
        description: data.description,
        paidTo: data.paid_to || "—",
        amount: Number(data.amount),
        mode: data.payment_mode,
        status: data.status,
      },
      ...x,
    ]);
    setModal("");
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
    "Collections",
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
        {page === "Collections" && (
          <section>
            <Top
              title="Collection history"
              description="Voided records remain visible for a complete audit trail."
              action={role !== "VIEWER" ? "+ Collect Fund" : ""}
              onClick={() => setModal("collection")}
            />
            <Filters />
            <Table
              headers={[
                "Receipt No.",
                "Date",
                "Flat",
                "Resident",
                "Amount",
                "Mode",
                "Status",
                "Actions",
              ]}
            >
              <>
                {collections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.receipt}</b>
                    </td>
                    <td>{date(c.date)}</td>
                    <td>{c.flat}</td>
                    <td>{c.resident}</td>
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
              onClick={() => setModal("expense")}
            />
            <Filters />
            <Table
              headers={[
                "Expense No.",
                "Date",
                "Category",
                "Description",
                "Paid To",
                "Amount",
                "Mode",
                "Status",
                "Actions",
              ]}
            >
              <>
                {expenses.map((e) => (
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
                  Download an Excel workbook with Funds Collections, Daily
                  Expenditure, and Summary worksheets.
                </p>
              </div>
              <button className="primary" onClick={exportWorkbook}>
                Export Excel workbook
              </button>
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
          close={() => setModal("")}
          save={saveExpense}
          categories={categories}
          saving={saving}
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
        <Card t="Funds collected" v={money(p.income)} />
        <Card t="Total expenditure" v={money(p.expense)} />
        <Card t="Current balance" v={money(p.balance)} green />
      </div>
      <div className="grid">
        <article className="panel">
          <div className="row">
            <div>
              <h2>Collection progress</h2>
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
              + Collect festival fund
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
        <Recent title="Recent collections" items={p.collections} />
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
function Filters() {
  return (
    <div className="filters">
      <input placeholder="Search transactions" />
      <select>
        <option>All payment modes</option>
        <option>UPI</option>
        <option>CASH</option>
      </select>
      <select>
        <option>All statuses</option>
        <option>ACTIVE</option>
        <option>VOIDED</option>
      </select>
    </div>
  );
}
function Table({ headers, children }: { headers: string[]; children: any }) {
  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            {headers.map((x) => (
              <th key={x}>{x}</th>
            ))}
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
          <h2>Collection report</h2>
          <Line a="Expected collection" b="₹1,03,000" />
          <Line a="Outstanding collection" b={money(103000 - p.income)} />
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
    <Modal title="Collect festival fund" close={close}>
      <form action={save}>
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
function ExpenseForm({ close, save, categories, saving }: any) {
  return (
    <Modal title="Add festival expense" close={close}>
      <form action={save}>
        <div className="formgrid">
          <label>
            Date
            <input name="date" type="date" defaultValue={today} required />
          </label>
          <label>
            Category
            <select name="category" required>
              <option value="">Select category</option>
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
            placeholder="What was purchased?"
          />
        </label>
        <div className="formgrid">
          <label>
            Amount (₹)
            <input name="amount" type="number" min="1" required />
          </label>
          <label>
            Paid to
            <input name="paidTo" placeholder="Vendor or person" />
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
        <Actions
          close={close}
          text={saving ? "Saving…" : "Confirm expense"}
          disabled={saving}
        />
      </form>
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
    <Modal title="Collection receipt" close={close}>
      <div className="receipt">
        <div className="receiptbrand">
          ॐ<small>GANESH FESTIVAL</small>
          <b>Ganesh Festival 2026</b>
        </div>
        <h3>FUND COLLECTION RECEIPT</h3>
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
        <p>Festival Manager</p>
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
