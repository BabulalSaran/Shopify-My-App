import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function BannerStudio() {
  const shopify = useAppBridge();

  const [message, setMessage] = useState("🔥 FLASH SALE: 20% OFF on all items! Use code: SAVE20");
  const [btnText, setBtnText] = useState("Shop Collection →");
  const [bgColor, setBgColor] = useState("#111827");
  const [textColor, setTextColor] = useState("#ffffff");
  const [accentColor, setAccentColor] = useState("#10b981");
  const [isGradient, setIsGradient] = useState(true);
  const [gradientColor2, setGradientColor2] = useState("#1e1b4b");
  const [showTimer, setShowTimer] = useState(true);
  const [showCloseBtn, setShowCloseBtn] = useState(true);
  const [previewDevice, setPreviewDevice] = useState("desktop"); // "desktop" | "mobile"

  const handleSave = () => {
    shopify.toast.show("Banner settings saved successfully! Ready for Theme App Extension.");
  };

  const bannerBackground = isGradient
    ? `linear-gradient(90deg, ${bgColor} 0%, ${gradientColor2} 100%)`
    : bgColor;

  return (
    <s-page heading="🎨 Storefront Banner &amp; Promotion Studio">
      <s-button slot="primary-action" onClick={handleSave}>
        💾 Save Banner Config
      </s-button>

      {/* Live Storefront Interactive Preview */}
      <s-section heading="🖥️ Live Storefront Preview (Interactive Simulator)">
        <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
          <button
            onClick={() => setPreviewDevice("desktop")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: previewDevice === "desktop" ? "2px solid #008060" : "1px solid #c9cccf",
              background: previewDevice === "desktop" ? "#f1f8f5" : "#fff",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            💻 Desktop Preview
          </button>
          <button
            onClick={() => setPreviewDevice("mobile")}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              border: previewDevice === "mobile" ? "2px solid #008060" : "1px solid #c9cccf",
              background: previewDevice === "mobile" ? "#f1f8f5" : "#fff",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            📱 Mobile Preview
          </button>
        </div>

        {/* Mock Storefront Window */}
        <div
          style={{
            maxWidth: previewDevice === "mobile" ? "380px" : "100%",
            margin: previewDevice === "mobile" ? "0 auto" : "0",
            borderRadius: "12px",
            border: "2px solid #e1e3e5",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            overflow: "hidden",
            background: "#ffffff",
            transition: "all 0.3s ease",
          }}
        >
          {/* Browser Header Bar */}
          <div style={{ background: "#f3f4f6", padding: "8px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444" }}></span>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f59e0b" }}></span>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#10b981" }}></span>
            <span style={{ fontSize: "11px", color: "#6b7280", marginLeft: "10px" }}>https://your-shopify-store.myshopify.com</span>
          </div>

          {/* THE BANNER WIDGET */}
          <div
            style={{
              background: bannerBackground,
              color: textColor,
              padding: previewDevice === "mobile" ? "12px 14px" : "12px 24px",
              display: "flex",
              flexDirection: previewDevice === "mobile" ? "column" : "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              fontSize: "14px",
              fontWeight: "500",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", textAlign: "center" }}>
              <span>{message}</span>
              {showTimer && (
                <span
                  style={{
                    background: "rgba(255, 255, 255, 0.15)",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    fontFamily: "monospace",
                    letterSpacing: "1px",
                  }}
                >
                  ⏳ 04:32:18
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {btnText && (
                <button
                  style={{
                    background: accentColor,
                    color: "#ffffff",
                    border: "none",
                    padding: "6px 14px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
                  }}
                >
                  {btnText}
                </button>
              )}
              {showCloseBtn && (
                <span style={{ cursor: "pointer", opacity: 0.7, fontSize: "16px" }}>✕</span>
              )}
            </div>
          </div>

          {/* Mock Storefront Body */}
          <div style={{ padding: "30px 20px", textAlign: "center", background: "#fafafa" }}>
            <h3 style={{ margin: "0 0 6px 0", color: "#1f2937" }}>Your Storefront Header &amp; Hero</h3>
            <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>
              The banner renders dynamically above your navigation or announcement bar.
            </p>
          </div>
        </div>
      </s-section>

      {/* Customization Settings Form */}
      <s-section heading="🛠️ Banner Customization Settings">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
          {/* Content Settings */}
          <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e1e3e5" }}>
            <h4 style={{ margin: "0 0 14px 0", color: "#202223" }}>📝 Text &amp; Call To Action</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                  Banner Announcement Message
                </label>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #c9cccf" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                  Button CTA Text
                </label>
                <input
                  type="text"
                  value={btnText}
                  onChange={(e) => setBtnText(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #c9cccf" }}
                />
              </div>
            </div>
          </div>

          {/* Color & Style Settings */}
          <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e1e3e5" }}>
            <h4 style={{ margin: "0 0 14px 0", color: "#202223" }}>🎨 Colors &amp; Appearance</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="checkbox"
                  id="gradCheck"
                  checked={isGradient}
                  onChange={(e) => setIsGradient(e.target.checked)}
                />
                <label htmlFor="gradCheck" style={{ fontSize: "13px", fontWeight: "600" }}>
                  Enable Modern Gradient
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#6d7175", marginBottom: "4px" }}>
                    Primary Color
                  </label>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    style={{ width: "100%", height: "36px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                  />
                </div>
                {isGradient && (
                  <div>
                    <label style={{ display: "block", fontSize: "12px", color: "#6d7175", marginBottom: "4px" }}>
                      Secondary Gradient
                    </label>
                    <input
                      type="color"
                      value={gradientColor2}
                      onChange={(e) => setGradientColor2(e.target.value)}
                      style={{ width: "100%", height: "36px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#6d7175", marginBottom: "4px" }}>
                    Text Color
                  </label>
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    style={{ width: "100%", height: "36px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", color: "#6d7175", marginBottom: "4px" }}>
                    Button Accent
                  </label>
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{ width: "100%", height: "36px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Feature Toggles */}
          <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e1e3e5" }}>
            <h4 style={{ margin: "0 0 14px 0", color: "#202223" }}>⚡ Interactive Features</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                <input
                  type="checkbox"
                  checked={showTimer}
                  onChange={(e) => setShowTimer(e.target.checked)}
                />
                Show Urgency Countdown Timer
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                <input
                  type="checkbox"
                  checked={showCloseBtn}
                  onChange={(e) => setShowCloseBtn(e.target.checked)}
                />
                Show Dismiss / Close Button
              </label>
            </div>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
