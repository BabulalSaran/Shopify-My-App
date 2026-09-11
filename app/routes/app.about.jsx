import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getShopInfo {
        shop {
          name
          email
          myshopifyDomain
          currencyCode
          plan {
            displayName
          }
        }
      }
    `
  );

  const data = await response.json();

  return {
    shop: data.data?.shop || null,
  };
};

export default function AboutPage() {
  const { shop } = useLoaderData();

  return (
    <s-page heading="📖 Shopify App Anatomy &amp; Master Developer Guide">
      <s-section heading="🏗️ Shopify App Architecture (How Everything Works)">
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "14px", lineHeight: "1.6" }}>
          
          {/* Card 1: 3-Pillar Architecture */}
          <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", borderLeft: "4px solid #008060" }}>
            <h3 style={{ margin: "0 0 8px 0", color: "#008060" }}>1. The 3 Core Pillars of Shopify Apps</h3>
            <p>Shopify Apps teen mukhya bhaagon par kaam karti hain:</p>
            <ul>
              <li>
                <b>1. Loader (`export const loader`):</b> Page load hone se pehle server par execute hota hai. Ye Shopify GraphQL API se store data (products, orders, customers) secure way me fetch karta hai.
              </li>
              <li>
                <b>2. Action (`export const action`):</b> User ke interactions (form submit, price edit, delete) ko server par handle karta hai aur Shopify Admin GraphQL Mutations ko trigger karta hai.
              </li>
              <li>
                <b>3. Frontend React + Polaris / App Bridge:</b> UI render karta hai aur seamless user experience deta hai.
              </li>
            </ul>
          </div>

          {/* Card 2: App Modules */}
          <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", borderLeft: "4px solid #5c6ac4" }}>
            <h3 style={{ margin: "0 0 8px 0", color: "#5c6ac4" }}>2. Complete App Feature Suite Available in this App</h3>
            <ul>
              <li>
                <b>📦 Products &amp; Dashboard:</b> Real-time KPI stats, low-stock notifications, inline price editor, status toggle, aur product creator.
              </li>
              <li>
                <b>⚡ Bulk Operations Studio:</b> Single click me 10%, 20% discount ya markup lagana, promo tags add karna, aur bulk activate/draft karna.
              </li>
              <li>
                <b>🎨 Storefront Banner Studio:</b> Live interactive simulator (Desktop &amp; Mobile) ke sath storefront banner design karna.
              </li>
              <li>
                <b>🧪 Live GraphQL Query Playground:</b> Real-time me GraphQL queries run karke store ka response dekhna.
              </li>
            </ul>
          </div>

          {/* Card 3: Shopify Concepts Reference */}
          <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", borderLeft: "4px solid #f59e0b" }}>
            <h3 style={{ margin: "0 0 8px 0", color: "#b45309" }}>3. Shopify Key Terminology for Developers</h3>
            <ul>
              <li><b>Access Scopes:</b> Permissions (jaise <code>write_products</code>, <code>write_themes</code>) jo <code>shopify.app.toml</code> me configure hoti hain.</li>
              <li><b>Webhooks:</b> Shopify ke events (jaise order create, app uninstall) par aapke server ko asynchronous HTTP notifications bhejna.</li>
              <li><b>Metafields &amp; Metaobjects:</b> Products aur Store me custom fields aur structured data store karne ke liye.</li>
              <li><b>Theme App Extensions:</b> Customer-facing store frontend par widgets aur banners inject karne ka official tarika.</li>
            </ul>
          </div>

        </div>
      </s-section>

      <s-section slot="aside" heading="Connected Store">
        <s-paragraph>
          <s-text><b>Store Name:</b> {shop?.name}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text><b>Domain:</b> {shop?.myshopifyDomain}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text><b>Plan:</b> {shop?.plan?.displayName || "Partner Development"}</s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
