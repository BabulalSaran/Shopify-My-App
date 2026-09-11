import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getProductsForBulk {
        shop {
          name
          currencyCode
        }
        products(first: 50, sortKey: TITLE) {
          edges {
            node {
              id
              title
              status
              totalInventory
              variants(first: 10) {
                edges {
                  node {
                    id
                    price
                    compareAtPrice
                  }
                }
              }
              tags
            }
          }
        }
      }
    `
  );

  const data = await response.json();

  return {
    shop: data.data?.shop || null,
    products: data.data?.products?.edges?.map((edge) => edge.node) || [],
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // BULK DISCOUNT / PRICE UPDATE
  if (intent === "bulk_discount") {
    const percentage = parseFloat(formData.get("percentage") || "0");
    const direction = formData.get("direction"); // "decrease" (discount) or "increase" (markup)
    const productIds = JSON.parse(formData.get("productIds") || "[]");

    if (productIds.length === 0) {
      return { success: false, error: "No products selected!" };
    }

    let updatedCount = 0;

    for (const prod of productIds) {
      const currentPrice = parseFloat(prod.price || "0");
      let newPrice = currentPrice;

      if (direction === "decrease") {
        newPrice = (currentPrice * (1 - percentage / 100)).toFixed(2);
      } else {
        newPrice = (currentPrice * (1 + percentage / 100)).toFixed(2);
      }

      if (parseFloat(newPrice) < 0) newPrice = "0.01";

      await admin.graphql(
        `#graphql
          mutation bulkUpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants {
                id
                price
              }
            }
          }
        `,
        {
          variables: {
            productId: prod.productId,
            variants: [{ id: prod.variantId, price: newPrice.toString() }],
          },
        }
      );
      updatedCount++;
    }

    return {
      success: true,
      message: `Successfully updated prices for ${updatedCount} products (${direction === "decrease" ? `-${percentage}% Discount` : `+${percentage}% Markup`})!`,
    };
  }

  // BULK ADD TAGS
  if (intent === "bulk_tag") {
    const newTag = formData.get("tag")?.trim();
    const productIds = JSON.parse(formData.get("productIds") || "[]");

    if (!newTag) return { success: false, error: "Tag cannot be empty!" };
    if (productIds.length === 0) return { success: false, error: "No products selected!" };

    for (const p of productIds) {
      // Get existing tags and append
      const existingTags = p.tags || [];
      if (!existingTags.includes(newTag)) {
        const updatedTags = [...existingTags, newTag];
        await admin.graphql(
          `#graphql
            mutation updateProductTags($input: ProductUpdateInput!) {
              productUpdate(product: $input) {
                product {
                  id
                  tags
                }
              }
            }
          `,
          {
            variables: {
              input: {
                id: p.productId,
                tags: updatedTags,
              },
            },
          }
        );
      }
    }

    return {
      success: true,
      message: `Tag "${newTag}" added to ${productIds.length} products!`,
    };
  }

  // BULK STATUS UPDATE
  if (intent === "bulk_status") {
    const newStatus = formData.get("status"); // "ACTIVE" or "DRAFT"
    const productIds = JSON.parse(formData.get("productIds") || "[]");

    for (const p of productIds) {
      await admin.graphql(
        `#graphql
          mutation setBulkStatus($input: ProductUpdateInput!) {
            productUpdate(product: $input) {
              product {
                id
                status
              }
            }
          }
        `,
        {
          variables: {
            input: {
              id: p.productId,
              status: newStatus,
            },
          },
        }
      );
    }

    return {
      success: true,
      message: `${productIds.length} products set to ${newStatus}!`,
    };
  }

  return { success: false, error: "Unknown action" };
};

export default function BulkPage() {
  const { shop, products } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [discountPercent, setDiscountPercent] = useState("10");
  const [direction, setDirection] = useState("decrease");
  const [customTag, setCustomTag] = useState("SummerSale");

  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
      setSelectedProductIds([]);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allSelected = products.map((p) => ({
        productId: p.id,
        variantId: p.variants?.edges?.[0]?.node?.id,
        price: p.variants?.edges?.[0]?.node?.price || "0",
        tags: p.tags,
      }));
      setSelectedProductIds(allSelected);
    } else {
      setSelectedProductIds([]);
    }
  };

  const handleToggleSelect = (p) => {
    const variant = p.variants?.edges?.[0]?.node;
    const exists = selectedProductIds.some((item) => item.productId === p.id);
    if (exists) {
      setSelectedProductIds(selectedProductIds.filter((item) => item.productId !== p.id));
    } else {
      setSelectedProductIds([
        ...selectedProductIds,
        {
          productId: p.id,
          variantId: variant?.id,
          price: variant?.price || "0",
          tags: p.tags,
        },
      ]);
    }
  };

  const handleApplyDiscount = () => {
    if (selectedProductIds.length === 0) {
      shopify.toast.show("Please select at least 1 product", { isError: true });
      return;
    }
    fetcher.submit(
      {
        intent: "bulk_discount",
        percentage: discountPercent,
        direction,
        productIds: JSON.stringify(selectedProductIds),
      },
      { method: "POST" }
    );
  };

  const handleApplyTag = () => {
    if (selectedProductIds.length === 0) {
      shopify.toast.show("Please select at least 1 product", { isError: true });
      return;
    }
    fetcher.submit(
      {
        intent: "bulk_tag",
        tag: customTag,
        productIds: JSON.stringify(selectedProductIds),
      },
      { method: "POST" }
    );
  };

  const handleBulkStatus = (newStatus) => {
    if (selectedProductIds.length === 0) {
      shopify.toast.show("Please select at least 1 product", { isError: true });
      return;
    }
    fetcher.submit(
      {
        intent: "bulk_status",
        status: newStatus,
        productIds: JSON.stringify(selectedProductIds),
      },
      { method: "POST" }
    );
  };

  return (
    <s-page heading="⚡ Bulk Operations &amp; Smart Pricing Studio">
      <s-section heading="Batch Action Controls">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
            background: "#f9fafb",
            padding: "20px",
            borderRadius: "12px",
            border: "1px solid #e1e3e5",
          }}
        >
          {/* Tool 1: Bulk Discount & Markup */}
          <div
            style={{
              background: "#fff",
              padding: "16px",
              borderRadius: "10px",
              border: "1px solid #e1e3e5",
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", color: "#202223" }}>🏷️ Bulk Price Adjuster</h4>
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #c9cccf",
                  background: "#fff",
                }}
              >
                <option value="decrease">Discount (-%)</option>
                <option value="increase">Markup (+%)</option>
              </select>

              <input
                type="number"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                style={{
                  width: "70px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #c9cccf",
                }}
              />
              <span style={{ alignSelf: "center", fontWeight: "bold" }}>%</span>
            </div>
            <button
              onClick={handleApplyDiscount}
              disabled={isLoading || selectedProductIds.length === 0}
              style={{
                width: "100%",
                padding: "10px",
                background: "#008060",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: "600",
                cursor: selectedProductIds.length === 0 ? "not-allowed" : "pointer",
                opacity: selectedProductIds.length === 0 ? 0.6 : 1,
              }}
            >
              {isLoading
                ? "Processing..."
                : `Apply to ${selectedProductIds.length} Selected`}
            </button>
          </div>

          {/* Tool 2: Bulk Tagging */}
          <div
            style={{
              background: "#fff",
              padding: "16px",
              borderRadius: "10px",
              border: "1px solid #e1e3e5",
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", color: "#202223" }}>🔖 Bulk Promo Tagging</h4>
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                placeholder="e.g. FlashSale, Deal"
                style={{
                  flex: "1",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #c9cccf",
                }}
              />
            </div>
            <button
              onClick={handleApplyTag}
              disabled={isLoading || selectedProductIds.length === 0}
              style={{
                width: "100%",
                padding: "10px",
                background: "#5c6ac4",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: "600",
                cursor: selectedProductIds.length === 0 ? "not-allowed" : "pointer",
                opacity: selectedProductIds.length === 0 ? 0.6 : 1,
              }}
            >
              {isLoading ? "Tagging..." : `Add Tag to ${selectedProductIds.length} Products`}
            </button>
          </div>

          {/* Tool 3: Bulk Status Switch */}
          <div
            style={{
              background: "#fff",
              padding: "16px",
              borderRadius: "10px",
              border: "1px solid #e1e3e5",
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", color: "#202223" }}>🔄 Bulk Status Changer</h4>
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button
                onClick={() => handleBulkStatus("ACTIVE")}
                disabled={isLoading || selectedProductIds.length === 0}
                style={{
                  flex: "1",
                  padding: "10px",
                  background: "#108043",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: selectedProductIds.length === 0 ? "not-allowed" : "pointer",
                  opacity: selectedProductIds.length === 0 ? 0.6 : 1,
                }}
              >
                Set Active
              </button>
              <button
                onClick={() => handleBulkStatus("DRAFT")}
                disabled={isLoading || selectedProductIds.length === 0}
                style={{
                  flex: "1",
                  padding: "10px",
                  background: "#8c9196",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: "600",
                  cursor: selectedProductIds.length === 0 ? "not-allowed" : "pointer",
                  opacity: selectedProductIds.length === 0 ? 0.6 : 1,
                }}
              >
                Set Draft
              </button>
            </div>
          </div>
        </div>
      </s-section>

      {/* Selectable Products Table */}
      <s-section heading={`Select Products (${selectedProductIds.length} of ${products.length} selected)`}>
        <div style={{ overflowX: "auto", background: "#fff", borderRadius: "10px", border: "1px solid #e1e3e5" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f7f7f8", borderBottom: "2px solid #e1e3e5" }}>
                <th style={{ padding: "12px 16px", width: "40px" }}>
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedProductIds.length === products.length && products.length > 0}
                  />
                </th>
                <th style={{ padding: "12px 16px" }}>Product Title</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px" }}>Current Price ({shop?.currencyCode || "USD"})</th>
                <th style={{ padding: "12px 16px" }}>Tags</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isSelected = selectedProductIds.some((item) => item.productId === p.id);
                const firstVariant = p.variants?.edges?.[0]?.node;

                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: "1px solid #f1f2f3",
                      background: isSelected ? "#f1f8f5" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(p)}
                      />
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: "600" }}>{p.title}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "10px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          background: p.status === "ACTIVE" ? "#cbf4c9" : "#ffea8a",
                          color: p.status === "ACTIVE" ? "#0e6231" : "#594400",
                        }}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: "bold" }}>
                      ${firstVariant?.price || "0.00"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        {p.tags?.map((t, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: "#e4e5e7",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "11px",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
