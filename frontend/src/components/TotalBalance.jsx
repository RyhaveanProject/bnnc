import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";

export default function TotalBalance() {
  const { user } = useAuth();
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTotal(0);
      setLoading(false);
      return;
    }

    const fetchTotal = async () => {
      try {
        const { data } = await api.get("/balance/total");
        setTotal(data.total_usdt || 0);
        setLoading(false);
      } catch (e) {
        console.error("Failed to fetch total balance:", e);
        setLoading(false);
      }
    };

    // Initial fetch
    fetchTotal();

    // Refresh every 10 seconds
    const interval = setInterval(fetchTotal, 10000);

    return () => clearInterval(interval);
  }, [user]);

  if (!user) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        background: "rgba(240, 185, 11, 0.1)",
        border: "1px solid rgba(240, 185, 11, 0.3)",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
      }}
      data-testid="total-balance"
    >
      <span className="text-dim" style={{ fontSize: 11 }}>
        BALANCE
      </span>
      <span style={{ color: "var(--color-accent)" }}>
        {loading ? "..." : `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      </span>
      <span style={{ fontSize: 11, opacity: 0.7 }}>USDT</span>
    </div>
  );
}
