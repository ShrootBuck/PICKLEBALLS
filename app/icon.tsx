import { ImageResponse } from "next/og";

// Route segment config
export const contentType = "image/png";
export const size = {
  width: 512,
  height: 512,
};

export default function Icon() {
  // Plain favicon. No PWA, no maskable variant.
  const isMaskable = false;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#23412e",
        borderRadius: isMaskable ? 0 : 96,
        padding: isMaskable ? 64 : 0,
      }}
    >
      <div
        style={{
          width: 380,
          height: 380,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#d7ff4d",
          borderRadius: 999,
          border: "16px solid #f6f7f2",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          position: "relative",
        }}
      >
        {/* inner highlight */}
        <div
          style={{
            position: "absolute",
            top: 28,
            left: 48,
            width: 120,
            height: 60,
            background: "rgba(255,255,255,0.55)",
            borderRadius: 999,
            transform: "rotate(-18deg)",
          }}
        />
        <div
          style={{
            fontSize: 190,
            lineHeight: 1,
            transform: "rotate(-8deg)",
            display: "flex",
          }}
        >
          🎾
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  );
}
