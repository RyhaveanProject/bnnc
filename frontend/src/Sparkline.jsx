
Action: file_editor create /app/frontend/src/ --file-text "import React from \"react\";

export default function Sparkline({ data, up = true, width = 90, height = 32 }) {
  if (!data || data.length < 2) return <svg width={width} height={height} className=\"sparkline\" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(\" \");
  const color = up ? \"#0ecb81\" : \"#f6465d\";
  return (
    <svg className=\"sparkline\" width={width} height={height}>
      <polyline points={points} fill=\"none\" stroke={color} strokeWidth=\"1.5\" />
    </svg>
  );
}
"
Observation: Create successful: /app/frontend/src/Sparkline.jsx
