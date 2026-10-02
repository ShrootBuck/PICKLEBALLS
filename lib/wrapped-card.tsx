import { ImageResponse } from "next/og";
import type { getWrapped } from "@/lib/wrapped";

// The export uses a fixed palette so the downloaded card is consistent across themes.
const ink = "#143c32";
const paper = "#e4f0cf";
export function wrappedCard(recap: Awaited<ReturnType<typeof getWrapped>>) {
  const shortName =
    recap.circleName.length > 48
      ? `${recap.circleName.slice(0, 45)}...`
      : recap.circleName;
  const highlight = recap.finishedGoals[0]?.title ?? recap.milestones[0]?.title;
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: 76,
        background: paper,
        color: ink,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 25,
          letterSpacing: 4,
        }}
      >
        <span>PICKLEBALLS</span>
        <span>WRAPPED</span>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 34,
          marginTop: 62,
          overflow: "hidden",
          maxHeight: 100,
        }}
      >
        {shortName}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 76,
          fontWeight: 700,
          lineHeight: 1.05,
          marginTop: 25,
          maxWidth: 800,
        }}
      >
        Look what you made happen.
      </div>
      <div
        style={{
          display: "flex",
          fontSize: recap.totalVerified > 9999 ? 180 : 240,
          fontWeight: 700,
          letterSpacing: -12,
          lineHeight: 1.15,
          marginTop: 40,
        }}
      >
        {recap.totalVerified.toLocaleString("en-US")}
      </div>
      <div style={{ display: "flex", fontSize: 46 }}>
        {recap.totalVerified === 1 ? "promise kept." : "promises kept."}
      </div>
      <div
        style={{
          display: "flex",
          gap: 50,
          borderTop: `2px solid ${ink}`,
          marginTop: 60,
          paddingTop: 36,
        }}
      >
        {[
          [recap.milestones.length, "milestones"],
          [recap.checkIns, "check-ins"],
          [recap.reviews, "peer reviews"],
        ].map(([number, label]) => (
          <div
            key={label}
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              gap: 8,
            }}
          >
            <span style={{ fontSize: 58, fontWeight: 700 }}>{number}</span>
            <span style={{ fontSize: 25 }}>{label}</span>
          </div>
        ))}
      </div>
      {highlight && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 40,
            gap: 12,
          }}
        >
          <span style={{ fontSize: 22, letterSpacing: 2 }}>
            ONE STEP WORTH CELEBRATING
          </span>
          <span style={{ fontSize: 32 }}>
            {highlight.length > 90 ? `${highlight.slice(0, 87)}...` : highlight}
          </span>
        </div>
      )}
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          paddingTop: 25,
          justifyContent: "space-between",
          fontSize: 23,
        }}
      >
        <span>{recap.week.label}</span>
        <span>One week. Real progress.</span>
      </div>
    </div>,
    {
      width: 1080,
      height: 1350,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="pickleballs-wrapped-${recap.week.startKey}.png"`,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
