import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getStoreConfig {
        shop {
          name
          email
          myshopifyDomain
          currencyCode
          timezoneOffsetMinutes
          plan {
            displayName
            partnerDevelopment
          }
        }
        app {
          apiKey
          installation {
            accessScopes {
              handle
            }
          }
        }
      }
    `
  );

  const data = await response.json();

  return {
    shop: data.data?.shop || null,
    app: data.data?.app || null,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const query = formData.get("query");

  try {
    const response = await admin.graphql(query);
    const data = await response.json();
    return { success: true, result: data };
  } catch (error) {
    return { success: false, error: error.message || "Failed to execute GraphQL query" };
  }
};

const SAMPLE_QUERIES = {
  shopDetails: `# Query 1: Fetch Shop & Plan Details
query {
  shop {
    name
    email
    myshopifyDomain
    currencyCode
    plan {
      displayName
    }
  }
}`,
  productsList: `# Query 2: Fetch Products & First Variant Price
query {
  products(first: 5) {
    edges {
      node {
        id
        title
        status
        totalInventory
        variants(first: 1) {
          edges {
            node {
              price
            }
          }
        }
      }
    }
  }
}`,
  ordersList: `# Query 3: Check Recent Orders
query {
  orders(first: 5) {
    edges {
      node {
        id
        name
        createdAt
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
}`,
};

export default function SettingsPage() {
  const { shop, app } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [customQuery, setCustomQuery] = useState(SAMPLE_QUERIES.productsList);
  const isExecuting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("GraphQL Query Executed Successfully!");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleRunQuery = () => {
    fetcher.submit({ query: customQuery }, { method: "POST" });
  };

  const scopes = app?.installation?.accessScopes || [
    { handle: "write_products" },
    { handle: "write_themes" },
  ];

  return (
    <s-page heading="⚙️ App Settings &amp; GraphQL API Inspector">
      {/* Overview Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e1e3e5" }}>
          <h4 style={{ margin: "0 0 10px 0", color: "#202223" }}>🏪 Store Status</h4>
          <div style={{ fontSize: "13px", color: "#454f5b", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div><b>Name:</b> {shop?.name}</div>
            <div><b>Domain:</b> {shop?.myshopifyDomain}</div>
            <div><b>Currency:</b> {shop?.currencyCode}</div>
            <div><b>Plan:</b> {shop?.plan?.displayName || "Partner Dev"}</div>
          </div>
        </div>

        <div style={{ background: "#fff", padding: "18px", borderRadius: "10px", border: "1px solid #e1e3e5" }}>
          <h4 style={{ margin: "0 0 10px 0", color: "#202223" }}>🔐 Installed Scopes (Permissions)</h4>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
            {scopes.map((s, idx) => (
              <span
                key={idx}
                style={{
                  background: "#e8f5e9",
                  color: "#2e7d32",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: "600",
                  fontFamily: "monospace",
                }}
              >
                ✓ {s.handle}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Live GraphQL Playground */}
      <s-section heading="🧪 Live Admin GraphQL API Tester (Interactive Playground)">
        <s-paragraph>
          Learn and test Shopify Admin GraphQL queries directly against your live store:
        </s-paragraph>

        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          <button
            onClick={() => setCustomQuery(SAMPLE_QUERIES.productsList)}
            style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #c9cccf", background: "#fff", cursor: "pointer", fontSize: "13px" }}
          >
            📦 Products Query
          </button>
          <button
            onClick={() => setCustomQuery(SAMPLE_QUERIES.shopDetails)}
            style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #c9cccf", background: "#fff", cursor: "pointer", fontSize: "13px" }}
          >
            🏪 Shop Details Query
          </button>
          <button
            onClick={() => setCustomQuery(SAMPLE_QUERIES.ordersList)}
            style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #c9cccf", background: "#fff", cursor: "pointer", fontSize: "13px" }}
          >
            🛍️ Orders Query
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Query Editor */}
          <div>
            <label style={{ display: "block", fontWeight: "600", fontSize: "13px", marginBottom: "6px" }}>
              GraphQL Query
            </label>
            <textarea
              rows={12}
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #c9cccf",
                fontFamily: "monospace",
                fontSize: "13px",
                background: "#1e1e2e",
                color: "#cdd6f4",
                lineHeight: "1.4",
              }}
            />
            <button
              onClick={handleRunQuery}
              disabled={isExecuting}
              style={{
                marginTop: "10px",
                padding: "10px 20px",
                background: "#008060",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {isExecuting ? "Executing Query..." : "▶ Run Live GraphQL Query"}
            </button>
          </div>

          {/* Response JSON Viewer */}
          <div>
            <label style={{ display: "block", fontWeight: "600", fontSize: "13px", marginBottom: "6px" }}>
              Live Store JSON Response
            </label>
            <div
              style={{
                height: "250px",
                overflowY: "auto",
                background: "#181825",
                color: "#a6e3a1",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #313244",
                fontFamily: "monospace",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {fetcher.data ? (
                JSON.stringify(fetcher.data, null, 2)
              ) : (
                <span style={{ color: "#6c7086" }}>
                  Click &apos;Run Live GraphQL Query&apos; to view real JSON output from your store...
                </span>
              )}
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
