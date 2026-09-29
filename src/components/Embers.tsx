// Drifting sparks behind the page. Values are computed from the index so server and client render the same.
export function Embers() {
  const sparks = Array.from({ length: 22 }, (_, i) => {
    const noise = (n: number) => ((i * 9301 + n * 49297) % 233280) / 233280;
    const size = 2 + noise(1) * 4;
    return (
      <i
        key={i}
        style={
          {
            left: `${(noise(2) * 100).toFixed(1)}%`,
            width: `${size.toFixed(1)}px`,
            height: `${size.toFixed(1)}px`,
            animationDuration: `${(9 + noise(3) * 12).toFixed(1)}s`,
            animationDelay: `${(-noise(4) * 18).toFixed(1)}s`,
            '--dx': `${(noise(5) * 80 - 40).toFixed(0)}px`,
          } as React.CSSProperties
        }
      />
    );
  });
  return (
    <div className="embers" aria-hidden="true">
      {sparks}
    </div>
  );
}
