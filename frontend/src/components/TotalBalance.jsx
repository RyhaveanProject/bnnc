import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";

// Helper function to format balance with thousand separator and 2 decimals.
// Always renders the FULL amount so users can see exactly how much they have.
function formatBalance(num) {
  const n = Number(num) || 0;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
      className="total-balance-container"
      data-testid="total-balance"
    >
      <span className="balance-label">
        BALANCE
      </span>
      <span className="balance-amount">
        {loading ? "..." : `$${formatBalance(total)}`}
      </span>
      <span className="balance-currency">USDT</span>
    </div>
  );
}
