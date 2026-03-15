/**
 * Summary KPIs + charts controller.
 * Features:
 * - Period range with quick presets
 * - Comparison mode vs previous equal-length period
 * - KPI drilldown modal
 * - Existing product pies + 30-day line chart
 */
(() => {
  "use strict";

  const API_URL = "api/sales_minimal.php";
  const CACHE_KEY = "summarySalesMinimal:v2";
  const PIE_TOP_ITEMS = 6;
  const DARK_PALETTE = [
    "#3b82f6",
    "#0ea5e9",
    "#14b8a6",
    "#22c55e",
    "#84cc16",
    "#f59e0b",
    "#f97316",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#ec4899",
    "#64748b",
    "#475569",
    "#2563eb",
    "#0f766e",
    "#1d4ed8",
    "#0891b2",
    "#0ea5e9",
  ];

  const $ = (id) => document.getElementById(id);
  const fmtMoney = (n) =>
    `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
      Math.round(Number(n) || 0)
    )} Ks`;
  const fmtShort = (ymd) => {
    if (!ymd) return "-";
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const ymd = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const fromYmd = (value) => {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const lastNDates = (n = 30) => {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i -= 1) {
      out.push(addDays(today, -i));
    }
    return out;
  };

  const pickColors = (n) => {
    const count = Math.max(1, n);
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(DARK_PALETTE[i % DARK_PALETTE.length]);
    return out;
  };

  const shortLabel = (value, max = 28) => {
    const s = String(value ?? "");
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  };

  let rows = [];
  let currentRange = null; // { from, to }
  let compareEnabled = false;

  /** Returns a normalized `{from,to}` date range in `YYYY-MM-DD` order. */
  function normalizeRange(from, to) {
    if (!from || !to) return null;
    const f = fromYmd(from);
    const t = fromYmd(to);
    if (!f || !t) return null;
    if (f <= t) return { from: ymd(f), to: ymd(t) };
    return { from: ymd(t), to: ymd(f) };
  }

  /** Maps a preset key to a concrete date range ending today. */
  function periodFromPreset(preset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (preset) {
      case "today":
        return { from: ymd(today), to: ymd(today) };
      case "30d":
        return { from: ymd(addDays(today, -29)), to: ymd(today) };
      case "this_month": {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: ymd(first), to: ymd(today) };
      }
      case "last_month": {
        const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const last = new Date(today.getFullYear(), today.getMonth(), 0);
        return { from: ymd(first), to: ymd(last) };
      }
      case "7d":
      default:
        return { from: ymd(addDays(today, -6)), to: ymd(today) };
    }
  }

  /** Filters sales rows whose `purchased_date` is inside the selected range. */
  function rowsInRange(allRows, range) {
    if (!range) return [];
    return allRows.filter((r) => {
      const d = String(r.purchased_date || "");
      return d >= range.from && d <= range.to;
    });
  }

  /** Builds the immediately previous range with the same day span. */
  function previousRange(range) {
    const from = fromYmd(range.from);
    const to = fromYmd(range.to);
    if (!from || !to) return null;
    const spanDays = Math.round((to - from) / 86_400_000) + 1;
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(spanDays - 1));
    return { from: ymd(prevFrom), to: ymd(prevTo) };
  }

  /** Aggregates core KPIs for a row set. */
  function computeMetrics(dataRows) {
    let sales = 0;
    let profit = 0;
    let orders = 0;
    for (const r of dataRows) {
      sales += Number(r.price) || 0;
      profit += Number(r.profit) || 0;
      orders += 1;
    }
    const avgProfit = orders > 0 ? profit / orders : 0;
    return { sales, profit, orders, avgProfit };
  }

  /** Computes percent change between current and previous values. */
  function pctChange(current, prev) {
    const c = Number(current) || 0;
    const p = Number(prev) || 0;
    if (p === 0) return c === 0 ? 0 : 100;
    return ((c - p) / Math.abs(p)) * 100;
  }

  /** Renders KPI comparison text and trend color on one KPI card. */
  function setCompare(card, current, prev) {
    const el = card.querySelector(".kpi-compare");
    if (!el) return;

    if (!compareEnabled) {
      el.textContent = "";
      el.classList.remove("up", "down");
      return;
    }

    const pct = pctChange(current, prev);
    const sign = pct >= 0 ? "+" : "";
    el.textContent = `${sign}${pct.toFixed(1)}% vs previous period`;
    el.classList.toggle("up", pct >= 0);
    el.classList.toggle("down", pct < 0);
  }

  /** Paints KPI cards for the current range and optional comparison period. */
  function renderKPIs(filteredRows) {
    const metrics = computeMetrics(filteredRows);
    const prevRows = rowsInRange(rows, previousRange(currentRange));
    const prevMetrics = computeMetrics(prevRows);

    document.querySelectorAll(".kpi-card").forEach((card) => {
      const key = card.dataset.kpi;
      const valueEl = card.querySelector(".kpi-value");
      if (!valueEl) return;

      if (key === "period_sales") {
        valueEl.textContent = fmtMoney(metrics.sales);
        setCompare(card, metrics.sales, prevMetrics.sales);
      } else if (key === "period_profits") {
        valueEl.textContent = fmtMoney(metrics.profit);
        setCompare(card, metrics.profit, prevMetrics.profit);
      } else if (key === "period_orders") {
        valueEl.textContent = String(metrics.orders);
        setCompare(card, metrics.orders, prevMetrics.orders);
      } else if (key === "avg_profit_order") {
        valueEl.textContent = fmtMoney(metrics.avgProfit);
        setCompare(card, metrics.avgProfit, prevMetrics.avgProfit);
      }
    });
  }

  /** Destroys an existing Chart.js instance attached to a canvas. */
  function destroyChartOn(canvas) {
    if (canvas && canvas._chart) {
      canvas._chart.destroy();
      canvas._chart = null;
    }
  }

  /** Creates a doughnut chart with shared style options. */
  function buildPie(canvas, title, labels, values, formatter) {
    if (!canvas) return;
    destroyChartOn(canvas);

    const colors = pickColors(labels.length);
    const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0);
    const legendPos = window.matchMedia("(max-width: 1200px)").matches ? "bottom" : "right";
    canvas._chart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderColor: "rgba(15,23,42,0.8)",
            borderWidth: 2,
            hoverBorderWidth: 2,
            hoverOffset: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        layout: { padding: { left: 8, right: 8, top: 10, bottom: 8 } },
        plugins: {
          title: {
            display: true,
            text: title,
            position: "top",
            color: "#cbd5e1",
            font: { size: 14, weight: "600" },
            padding: { top: 2, bottom: 8 },
          },
          legend: {
            position: legendPos,
            labels: {
              color: "#94a3b8",
              padding: 14,
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: "circle",
              font: { size: 12, weight: "500" },
            },
          },
          tooltip: {
            backgroundColor: "rgba(15,23,42,.95)",
            titleColor: "#e2e8f0",
            bodyColor: "#cbd5e1",
            borderColor: "rgba(148,163,184,.3)",
            borderWidth: 1,
            callbacks: {
              label: (ctx) => {
                const raw = Number(ctx.raw || 0);
                const pct = total > 0 ? (raw / total) * 100 : 0;
                return ` ${ctx.label ?? ""}: ${formatter(raw)} (${pct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    });
  }

  function topEntries(map, metricKey) {
    const sorted = Array.from(map.entries())
      .map(([label, metrics]) => ({ label, value: Number(metrics[metricKey]) || 0 }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    if (!sorted.length) return { labels: ["No data"], values: [1] };

    const head = sorted.slice(0, PIE_TOP_ITEMS);
    const tail = sorted.slice(PIE_TOP_ITEMS);
    const tailTotal = tail.reduce((sum, item) => sum + item.value, 0);
    if (tailTotal > 0) {
      head.push({ label: "Others", value: tailTotal });
    }

    return {
      labels: head.map((item) => shortLabel(item.label)),
      values: head.map((item) => item.value),
    };
  }

  /** Builds per-product pie charts for sales, profit, and order counts. */
  function renderPeriodPies(filteredRows) {
    const agg = new Map();
    for (const r of filteredRows) {
      const key = r.sale_product || "(Unknown)";
      if (!agg.has(key)) agg.set(key, { sales: 0, profit: 0, count: 0 });
      const v = agg.get(key);
      v.sales += Number(r.price) || 0;
      v.profit += Number(r.profit) || 0;
      v.count += 1;
    }

    const salesSet = topEntries(agg, "sales");
    const profitSet = topEntries(agg, "profit");
    const countSet = topEntries(agg, "count");

    const periodLabel = currentRange
      ? `${fmtShort(currentRange.from)} - ${fmtShort(currentRange.to)}`
      : "Selected Period";

    buildPie(
      $("chartDailySales"),
      `Sales by Product (${periodLabel})`,
      salesSet.labels,
      salesSet.values,
      (v) => fmtMoney(v)
    );
    buildPie(
      $("chartDailyProfit"),
      `Profit by Product (${periodLabel})`,
      profitSet.labels,
      profitSet.values,
      (v) => fmtMoney(v)
    );
    buildPie(
      $("chartDailyCount"),
      `Orders by Product (${periodLabel})`,
      countSet.labels,
      countSet.values,
      (v) => String(v)
    );
  }

  /** Renders 30-day daily sales/profit trend lines. */
  function renderLine30(allRows) {
    const canvas = $("salesProfitLine");
    if (!canvas) return;
    destroyChartOn(canvas);

    const days = lastNDates(30);
    const daily = new Map(days.map((d) => [ymd(d), { sales: 0, profit: 0 }]));

    for (const row of allRows) {
      const key = String(row.purchased_date || "");
      if (!daily.has(key)) continue;
      const bucket = daily.get(key);
      bucket.sales += Number(row.price) || 0;
      bucket.profit += Number(row.profit) || 0;
    }

    const labels = days.map((d) =>
      d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    );
    const sales = days.map((d) => daily.get(ymd(d)).sales);
    const profits = days.map((d) => daily.get(ymd(d)).profit);

    canvas._chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Sales (Ks)",
            data: sales,
            borderColor: "#60a5fa",
            backgroundColor: "rgba(96,165,250,.15)",
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
          {
            label: "Profit (Ks)",
            data: profits,
            borderColor: "#34d399",
            backgroundColor: "rgba(52,211,153,.15)",
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          title: {
            display: true,
            text: "Daily Sales & Profit (Last 30 Days)",
            color: "#fff",
            font: { size: 16, weight: "bold" },
          },
          legend: {
            position: "bottom",
            labels: { color: "#fff", usePointStyle: true, boxWidth: 8 },
          },
        },
        scales: {
          x: { ticks: { color: "#fff", maxTicksLimit: 15 }, grid: { color: "rgba(255,255,255,.10)" } },
          y: { ticks: { color: "#fff" }, grid: { color: "rgba(255,255,255,.10)" } },
        },
      },
    });
  }

  /** Opens the KPI drilldown modal and renders its table rows. */
  function openDrilldown(title, dataRows) {
    const modal = $("kpiDrilldownModal");
    const titleEl = $("kpiDrilldownTitle");
    const body = $("kpi_drilldown_body");
    if (!modal || !titleEl || !body) return;

    titleEl.textContent = title;
    body.innerHTML = "";

    if (!dataRows.length) {
      body.innerHTML = `<tr><td colspan="6" class="era-muted">No data in selected period.</td></tr>`;
    } else {
      dataRows
        .slice()
        .sort((a, b) => String(b.purchased_date).localeCompare(String(a.purchased_date)))
        .forEach((r, i) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${r.sale_product ?? "-"}</td>
            <td>${r.customer ?? "-"}</td>
            <td>${fmtShort(r.purchased_date)}</td>
            <td style="text-align:right;">${fmtMoney(r.price)}</td>
            <td style="text-align:right;">${fmtMoney(r.profit)}</td>
          `;
          body.appendChild(tr);
        });
    }

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  /** Closes the KPI drilldown modal. */
  function closeDrilldown() {
    const modal = $("kpiDrilldownModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  /** Applies current date controls, re-renders all KPI widgets, and emits range event. */
  function applyRangeAndRender() {
    const fromInput = $("summary_from_date");
    const toInput = $("summary_to_date");
    if (!fromInput || !toInput) return;

    const normalized = normalizeRange(fromInput.value, toInput.value);
    if (!normalized) return;
    currentRange = normalized;
    fromInput.value = normalized.from;
    toInput.value = normalized.to;

    const filteredRows = rowsInRange(rows, currentRange);
    renderKPIs(filteredRows);
    renderPeriodPies(filteredRows);
    renderLine30(rows);

    // Expose selected period to other summary modules (risk/forecast tables).
    document.dispatchEvent(
      new CustomEvent("summary:period-range", { detail: { range: currentRange } })
    );
  }

  /** Wires range preset, custom date, apply, and compare controls. */
  function initControls() {
    const preset = $("summary_preset");
    const fromInput = $("summary_from_date");
    const toInput = $("summary_to_date");
    const applyBtn = $("summary_apply_range");
    const compareToggle = $("summary_compare_toggle");

    if (!preset || !fromInput || !toInput || !applyBtn || !compareToggle) return;
    // Force disabled default on first load (also prevents browser form-state restore).
    compareToggle.checked = false;
    compareEnabled = false;

    const setRangeByPreset = (presetValue) => {
      const range = periodFromPreset(presetValue);
      fromInput.value = range.from;
      toInput.value = range.to;
      currentRange = range;
    };

    setRangeByPreset(preset.value);

    preset.addEventListener("change", () => {
      if (preset.value !== "custom") {
        setRangeByPreset(preset.value);
        applyRangeAndRender();
      }
    });

    const syncCustomPreset = () => {
      preset.value = "custom";
    };

    fromInput.addEventListener("change", syncCustomPreset);
    toInput.addEventListener("change", syncCustomPreset);
    applyBtn.addEventListener("click", applyRangeAndRender);

    compareToggle.addEventListener("change", () => {
      compareEnabled = !!compareToggle.checked;
      applyRangeAndRender();
    });
  }

  /** Registers KPI-card click handling and modal close interactions. */
  function initDrilldown() {
    const closeBtn = $("kpiDrilldownClose");
    const modal = $("kpiDrilldownModal");
    if (closeBtn) closeBtn.addEventListener("click", closeDrilldown);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeDrilldown();
      });
    }

    document.querySelectorAll(".kpi-card").forEach((card) => {
      card.style.cursor = "pointer";
      card.addEventListener("click", () => {
        const key = card.dataset.kpi;
        const inRangeRows = rowsInRange(rows, currentRange);
        if (key === "period_sales") {
          openDrilldown("Period Sales Drilldown", inRangeRows);
        } else if (key === "period_profits") {
          openDrilldown("Period Profits Drilldown", inRangeRows);
        } else if (key === "period_orders") {
          openDrilldown("Period Orders Drilldown", inRangeRows);
        } else if (key === "avg_profit_order") {
          openDrilldown("Average Profit / Order Drilldown", inRangeRows);
        }
      });
    });
  }

  function readCachePacket() {
    if (window.__salesMinimalCache && Array.isArray(window.__salesMinimalCache.data)) {
      return window.__salesMinimalCache;
    }
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return { data: null, etag: null };
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.data)) {
        window.__salesMinimalCache = parsed;
        return parsed;
      }
    } catch {}
    return { data: null, etag: null };
  }

  function writeCachePacket(data, etag = null) {
    const packet = { data, etag, ts: Date.now() };
    window.__salesMinimalCache = packet;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(packet));
  }

  async function fetchRowsFromApi(etag = null) {
    const headers = { Accept: "application/json" };
    if (etag) headers["If-None-Match"] = etag;
    const res = await fetch(API_URL, { headers });
    if (res.status === 304) {
      return { notModified: true, data: null, etag };
    }
    const json = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !json?.success || !Array.isArray(json?.data)) {
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    return { notModified: false, data: json.data, etag: res.headers.get("ETag") };
  }

  /** Fetches summary rows from API and validates response contract. */
  async function fetchRows() {
    const packet = readCachePacket();
    if (packet.data) {
      fetchRowsFromApi(packet.etag)
        .then((result) => {
          if (result.notModified) return;
          writeCachePacket(result.data, result.etag || null);
        })
        .catch((err) => console.error("Summary chart background refresh failed:", err));
      return packet.data;
    }

    const result = await fetchRowsFromApi(null);
    const rowsData = result.data || [];
    writeCachePacket(rowsData, result.etag || null);
    return rowsData;
  }

  /** Bootstraps controls, drilldown handlers, data load, and first render. */
  async function init() {
    try {
      initControls();
      initDrilldown();

      rows = await fetchRows();
      applyRangeAndRender();
    } catch (err) {
      console.error("Summary load failed:", err);
      document
        .querySelectorAll(".kpi-value")
        .forEach((el) => (el.textContent = el.closest(".kpi-card")?.dataset?.kpi === "period_orders" ? "0" : "0 Ks"));
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
