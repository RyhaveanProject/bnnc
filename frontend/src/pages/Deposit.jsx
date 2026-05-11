
Action: file_editor create /app/frontend/src/pages/Deposit.jsx --file-text "import React, { useEffect, useState } from \"react\";
import { api, fmt } from \"@/lib/api\";
import { toast } from \"sonner\";
import { Copy, Check, Wallet } from \"lucide-react\";
import { QRCodeSVG } from \"qrcode.react\";

const COINS = [
  { code: \"USDT\", name: \"Tether\", network: \"TRC20\" },
  { code: \"BTC\", name: \"Bitcoin\", network: \"Bitcoin\" },
  { code: \"ETH\", name: \"Ethereum\", network: \"ERC20\" },
  { code: \"TRX\", name: \"TRON\", network: \"TRC20\" },
  { code: \"BNB\", name: \"BNB\", network: \"BEP20\" },
];

export default function Deposit() {
  const [selected, setSelected] = useState(\"USDT\");
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState(\"\");
  const [txHash, setTxHash] = useState(\"\");
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.wallet(selected).then(setWallet).catch(() => setWallet(null));
  }, [selected]);

  useEffect(() => {
    api.depositHistory().then(d => setHistory(d.items || [])).catch(() => {});
  }, []);

  const copy = async () => {
    if (!wallet?.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success(\"Address copied\");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return toast.error(\"Enter a valid amount\");
    setSubmitting(true);
    try {
      await api.createDeposit({ currency: selected, amount: Number(amount), tx_hash: txHash });
      toast.success(\"Deposit submitted. Awaiting confirmation.\");
      setAmount(\"\"); setTxHash(\"\");
      const d = await api.depositHistory();
      setHistory(d.items || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || \"Failed to submit\");
    } finally { setSubmitting(false); }
  };

  return (
    <div className=\"max-w-[1440px] mx-auto px-6 sm:px-8 py-8 lg:py-10\">
      <div className=\"mb-6\">
        <div className=\"label-eyebrow mb-1\">Funds</div>
        <h1 className=\"font-display text-3xl font-semibold flex items-center gap-2\">
          <Wallet className=\"w-6 h-6 text-[#007AFF]\" /> Deposit crypto
        </h1>
      </div>

      <div className=\"grid lg:grid-cols-12 gap-6\">
        {/* Step 1: select coin */}
        <div className=\"lg:col-span-4 card-flat p-6\">
          <div className=\"label-eyebrow mb-4\">1 · Select asset</div>
          <div className=\"space-y-2\">
            {COINS.map((c) => (
              <button key={c.code} onClick={() => setSelected(c.code)} data-testid={`coin-${c.code}`}
                className={`w-full text-left px-4 py-3 rounded-sm border transition-colors flex items-center justify-between ${
                  selected === c.code ? \"border-[#007AFF] bg-[#1A233A]\" : \"border-[#1E293B] hover:bg-[#1A233A]\"
                }`}>
                <div>
                  <div className=\"font-medium text-sm\">{c.code}</div>
                  <div className=\"text-xs text-slate-500\">{c.name}</div>
                </div>
                <span className=\"text-xs font-mono text-slate-400\">{c.network}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: wallet address */}
        <div className=\"lg:col-span-4 card-flat p-6\">
          <div className=\"label-eyebrow mb-4\">2 · Send to address</div>
          {wallet ? (
            <>
              <div className=\"flex justify-center my-4 bg-white p-3 rounded-sm\" data-testid=\"deposit-qr\">
                <QRCodeSVG value={wallet.address} size={148} bgColor=\"#FFFFFF\" fgColor=\"#0B0F19\" />
              </div>
              <div className=\"label-eyebrow mb-2\">Network</div>
              <div className=\"font-mono text-sm mb-4 text-slate-300\">{wallet.network}</div>
              <div className=\"label-eyebrow mb-2\">Wallet address</div>
              <div className=\"relative\">
                <div className=\"font-mono text-xs bg-[#0B0F19] border border-[#1E293B] p-3 pr-12 break-all rounded-sm\" data-testid=\"deposit-address\">
                  {wallet.address}
                </div>
                <button onClick={copy} className=\"absolute top-2 right-2 p-2 hover:bg-[#1A233A] rounded-sm\" data-testid=\"copy-address-btn\">
                  {copied ? <Check className=\"w-4 h-4 text-up\" /> : <Copy className=\"w-4 h-4 text-slate-400\" />}
                </button>
              </div>
              <p className=\"mt-4 text-xs text-slate-500 leading-relaxed\">
                Only send {selected} on the {wallet.network} network to this address. Sending other assets or wrong network may result in permanent loss.
              </p>
            </>
          ) : (
            <div className=\"text-sm text-slate-500\">Loading…</div>
          )}
        </div>

        {/* Step 3: confirm */}
        <div className=\"lg:col-span-4 card-flat p-6\">
          <div className=\"label-eyebrow mb-4\">3 · Confirm deposit</div>
          <form onSubmit={submit} className=\"space-y-4\">
            <div>
              <label className=\"label-eyebrow block mb-2\">Amount ({selected})</label>
              <input type=\"number\" step=\"any\" value={amount} onChange={e => setAmount(e.target.value)} className=\"input-dark font-mono\" placeholder=\"0.00\" data-testid=\"deposit-amount\" />
            </div>
            <div>
              <label className=\"label-eyebrow block mb-2\">Transaction hash (optional)</label>
              <input type=\"text\" value={txHash} onChange={e => setTxHash(e.target.value)} className=\"input-dark font-mono\" placeholder=\"0x…\" data-testid=\"deposit-txhash\" />
            </div>
            <button disabled={submitting} className=\"btn-primary w-full\" data-testid=\"deposit-submit\">
              {submitting ? \"Submitting…\" : \"Submit deposit\"}
            </button>
            <p className=\"text-xs text-slate-500 leading-relaxed\">
              Notification is sent to operations. Funds are credited after on-chain confirmations.
            </p>
          </form>
        </div>
      </div>

      {/* History */}
      <div className=\"mt-10\">
        <div className=\"label-eyebrow mb-3\">Recent deposits</div>
        <div className=\"card-flat overflow-x-auto\">
          <table className=\"w-full text-sm\" data-testid=\"deposit-history-table\">
            <thead>
              <tr className=\"text-slate-500 text-xs uppercase tracking-wider\">
                <th className=\"text-left p-4 font-medium\">Date</th>
                <th className=\"text-left p-4 font-medium\">Asset</th>
                <th className=\"text-right p-4 font-medium\">Amount</th>
                <th className=\"text-left p-4 font-medium\">Network</th>
                <th className=\"text-left p-4 font-medium\">Tx</th>
                <th className=\"text-right p-4 font-medium\">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan=\"6\" className=\"p-8 text-center text-slate-500 text-sm\">No deposits yet</td></tr>
              ) : history.map((h) => (
                <tr key={h.id} className=\"border-t border-[#1E293B] hover:bg-[#1A233A]\">
                  <td className=\"p-4 text-slate-400 font-mono text-xs\">{h.created_at?.slice(0, 19).replace(\"T\", \" \")}</td>
                  <td className=\"p-4 font-medium\">{h.currency}</td>
                  <td className=\"p-4 text-right font-mono\">{h.amount}</td>
                  <td className=\"p-4 font-mono text-slate-400\">{h.network}</td>
                  <td className=\"p-4 font-mono text-xs text-slate-500 truncate max-w-[200px]\">{h.tx_hash || \"—\"}</td>
                  <td className=\"p-4 text-right\">
                    <StatusBadge status={h.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: \"bg-[#1A233A] text-[#F59E0B] border-[#F59E0B]/30\",
    approved: \"bg-up-soft text-up border-[#10B981]/30\",
    rejected: \"bg-down-soft text-down border-[#EF4444]/30\",
  };
  return (
    <span className={`text-xs uppercase tracking-wider font-medium px-2.5 py-1 border rounded-sm ${map[status] || \"\"}`}>
      {status}
    </span>
  );
}
"
Observation: Create successful: /app/frontend/src/pages/
