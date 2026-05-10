
Action: file_editor create /app/frontend/src/components/Sparkline.jsx --file-text "import React from \"react\";
import { LineChart, Line, ResponsiveContainer, YAxis } from \"recharts\";

export default function Sparkline({ data = [], up = true, height = 40 }) {
  const points = (data || []).map((v, i) => ({ x: i, y: Number(v) }));
  const color = up ? \"#10B981\" : \"#EF4444\";
  if (points.length < 2) return <div style={{ height }} />;
  return (
    <div style={{ height, width: \"100%\" }}>
      <ResponsiveContainer width=\"100%\" height=\"100%\">
        <LineChart data={points} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
          <YAxis hide domain={[\"dataMin\", \"dataMax\"]} />
          <Line type=\"monotone\" dataKey=\"y\" stroke={color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
"
Observation: Create successful: /app/frontend/src//
