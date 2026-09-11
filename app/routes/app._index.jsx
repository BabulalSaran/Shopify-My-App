import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// 1. LOADER: Server par real-time store data fetch karta hai
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getProductsAndShop {
        shop {
          name
          email
          currencyCode
          myshopifyDomain
          plan {
            displayName
          }
        }
        products(first: 30, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              handle
              status
              totalInventory
              featuredImage {
                url
                altText
              }
              variants(first: 5) {
                edges {
                  node {
                    id
                    price
                    compareAtPrice
                    inventoryQuantity
                  }
                }
              }
              tags
              createdAt
              updatedAt
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

// 2. ACTION: Server-side mutations handle karta hai
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // CREATE PRODUCT
  if (intent === "create_product") {
    const title = formData.get("title") || "New Product";
    const price = formData.get("price") || "29.99";
    const comparePrice = formData.get("comparePrice") || "";
    const description = formData.get("description") || "Product created with custom app";
    const status = formData.get("status") || "ACTIVE";
    const tags = formData.get("tags")
      ? formData.get("tags").split(",").map((t) => t.trim()).filter(Boolean)
      : ["Featured"];

    const response = await admin.graphql(
      `#graphql
        mutation createCustomProduct($input: ProductCreateInput!) {
          productCreate(product: $input) {
            product {
              id
              title
              status
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          input: {
            title,
            descriptionHtml: `<p>${description}</p>`,
            status,
            tags,
          },
        },
      }
    );

    const result = await response.json();
    const createdProduct = result.data?.productCreate?.product;
    const errors = result.data?.productCreate?.userErrors;

    if (errors && errors.length > 0) {
      return { success: false, error: errors[0].message, intent };
    }

    if (createdProduct?.variants?.edges?.[0]?.node?.id) {
      const variantId = createdProduct.variants.edges[0].node.id;
      const variantInput = { id: variantId, price: price.toString() };
      if (comparePrice) {
        variantInput.compareAtPrice = comparePrice.toString();
      }

      await admin.graphql(
        `#graphql
          mutation updatePrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
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
            productId: createdProduct.id,
            variants: [variantInput],
          },
        }
      );
    }

    return {
      success: true,
      message: `Product "${title}" created successfully!`,
      intent,
      product: createdProduct,
    };
  }

  // QUICK PRICE UPDATE
  if (intent === "update_price") {
    const productId = formData.get("productId");
    const variantId = formData.get("variantId");
    const newPrice = formData.get("newPrice");

    const response = await admin.graphql(
      `#graphql
        mutation updateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants {
              id
              price
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          productId,
          variants: [{ id: variantId, price: newPrice.toString() }],
        },
      }
    );

    const result = await response.json();
    const errors = result.data?.productVariantsBulkUpdate?.userErrors;
    if (errors && errors.length > 0) {
      return { success: false, error: errors[0].message, intent };
    }

    return { success: true, message: `Price updated to $${newPrice}!`, intent };
  }

  // STATUS TOGGLE (ACTIVE <-> DRAFT)
  if (intent === "toggle_status") {
    const productId = formData.get("productId");
    const currentStatus = formData.get("currentStatus");
    const newStatus = currentStatus === "ACTIVE" ? "DRAFT" : "ACTIVE";

    const response = await admin.graphql(
      `#graphql
        mutation updateProductStatus($input: ProductUpdateInput!) {
          productUpdate(product: $input) {
            product {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          input: {
            id: productId,
            status: newStatus,
          },
        },
      }
    );

    const result = await response.json();
    const errors = result.data?.productUpdate?.userErrors;
    if (errors && errors.length > 0) {
      return { success: false, error: errors[0].message, intent };
    }

    return { success: true, message: `Status changed to ${newStatus}!`, intent };
  }

  // DELETE PRODUCT
  if (intent === "delete_product") {
    const productId = formData.get("productId");

    const response = await admin.graphql(
      `#graphql
        mutation deleteSingleProduct($input: ProductDeleteInput!) {
          productDelete(input: $input) {
            deletedProductId
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          input: {
            id: productId,
          },
        },
      }
    );

    const result = await response.json();
    return { success: true, message: "Product deleted from store!", intent };
  }

  return { success: false, error: "Action not recognized", intent };
};

export default function Index() {
  const { shop, products } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [activeView, setActiveView] = useState("dashboard"); // "dashboard" | "create"
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [stockFilter, setStockFilter] = useState("ALL"); // ALL | LOW | OUT | IN
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [tempPrice, setTempPrice] = useState("");

  // Product Creator Form state
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("39.99");
  const [comparePrice, setComparePrice] = useState("49.99");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [tags, setTags] = useState("Trending, BestSeller, Summer");

  const isLoading = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
      if (fetcher.data.intent === "create_product") {
        setTitle("");
        setDescription("");
        setActiveView("dashboard");
      }
      setEditingPriceId(null);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  // Analytics Metrics Calculation
  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.status === "ACTIVE").length;
  const draftProducts = products.filter((p) => p.status === "DRAFT").length;
  const totalStock = products.reduce((acc, p) => acc + (p.totalInventory || 0), 0);
  const lowStockProducts = products.filter(
    (p) => (p.totalInventory || 0) > 0 && (p.totalInventory || 0) <= 5
  );
  const outOfStockProducts = products.filter((p) => (p.totalInventory || 0) <= 0);

  // Filtered List
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;

    let matchesStock = true;
    const inv = p.totalInventory || 0;
    if (stockFilter === "LOW") matchesStock = inv > 0 && inv <= 5;
    if (stockFilter === "OUT") matchesStock = inv <= 0;
    if (stockFilter === "IN") matchesStock = inv > 5;

    return matchesSearch && matchesStatus && matchesStock;
  });

  const handleQuickPriceUpdate = (productId, variantId, newPriceVal) => {
    if (!newPriceVal || isNaN(Number(newPriceVal))) {
      shopify.toast.show("Please enter a valid numeric price", { isError: true });
      return;
    }
    fetcher.submit(
      {
        intent: "update_price",
        productId,
        variantId,
        newPrice: newPriceVal,
      },
      { method: "POST" }
    );
  };

  const handleToggleStatus = (productId, currentStatus) => {
    fetcher.submit(
      {
        intent: "toggle_status",
        productId,
        currentStatus,
      },
      { method: "POST" }
    );
  };

  const handleDelete = (productId, prodTitle) => {
    if (confirm(`Are you sure you want to permanently delete "${prodTitle}"?`)) {
      fetcher.submit(
        {
          intent: "delete_product",
          productId,
        },
        { method: "POST" }
      );
    }
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      shopify.toast.show("Product title is required", { isError: true });
      return;
    }
    fetcher.submit(
      {
        intent: "create_product",
        title,
        price,
        comparePrice,
        description,
        status,
        tags,
      },
      { method: "POST" }
    );
  };

  return (
    <s-page heading="Shopify Command Center & Products Manager">
      <s-button
        slot="primary-action"
        onClick={() => setActiveView(activeView === "create" ? "dashboard" : "create")}
      >
        {activeView === "create" ? "← Back to Dashboard" : "+ Create Dynamic Product"}
      </s-button>

      {/* KPI Stats Overview Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "14px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #f7f9fa 100%)",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #e1e3e5",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ color: "#5c5f62", fontSize: "12px", fontWeight: "700", textTransform: "uppercase" }}>
            Total Products
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#202223", marginTop: "4px" }}>
            {totalProducts}
          </div>
          <div style={{ fontSize: "12px", color: "#8c9196" }}>Live Store Catalog</div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, #f1f8f5 0%, #e3f5ec 100%)",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #b7ebcf",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ color: "#0e6231", fontSize: "12px", fontWeight: "700", textTransform: "uppercase" }}>
            Active (Live)
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#0e6231", marginTop: "4px" }}>
            {activeProducts}
          </div>
          <div style={{ fontSize: "12px", color: "#108043" }}>Purchasable by Customers</div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, #fffbf0 0%, #fff4d5 100%)",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #ffe18b",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ color: "#7a5c00", fontSize: "12px", fontWeight: "700", textTransform: "uppercase" }}>
            Draft (Hidden)
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#7a5c00", marginTop: "4px" }}>
            {draftProducts}
          </div>
          <div style={{ fontSize: "12px", color: "#8a6d0b" }}>Work in Progress</div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, #f6f8fa 0%, #eef1f5 100%)",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #d0d7de",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ color: "#57606a", fontSize: "12px", fontWeight: "700", textTransform: "uppercase" }}>
            Total Inventory
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#24292f", marginTop: "4px" }}>
            {totalStock}
          </div>
          <div style={{ fontSize: "12px", color: "#57606a" }}>Total Available Units</div>
        </div>

        <div
          style={{
            background:
              lowStockProducts.length > 0
                ? "linear-gradient(135deg, #fff5f5 0%, #ffe3e3 100%)"
                : "#ffffff",
            padding: "16px",
            borderRadius: "12px",
            border: lowStockProducts.length > 0 ? "1px solid #ffb8b8" : "1px solid #e1e3e5",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
          }}
        >
          <div
            style={{
              color: lowStockProducts.length > 0 ? "#cf1322" : "#5c5f62",
              fontSize: "12px",
              fontWeight: "700",
              textTransform: "uppercase",
            }}
          >
            Low Stock Alert
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: "800",
              color: lowStockProducts.length > 0 ? "#cf1322" : "#202223",
              marginTop: "4px",
            }}
          >
            {lowStockProducts.length}
          </div>
          <div style={{ fontSize: "12px", color: "#8c9196" }}>≤ 5 items in stock</div>
        </div>
      </div>

      {activeView === "dashboard" ? (
        <>
          {/* Action Bar & Filters */}
          <s-section heading="Real-time Inventory & Product Catalog">
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "16px",
                alignItems: "center",
                background: "#f7f7f8",
                padding: "12px",
                borderRadius: "10px",
              }}
            >
              <input
                type="text"
                placeholder="🔍 Search products by title or tag..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  flex: "1",
                  minWidth: "220px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #c9cccf",
                  fontSize: "14px",
                  background: "#fff",
                }}
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #c9cccf",
                  fontSize: "14px",
                  backgroundColor: "#fff",
                }}
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active (Live)</option>
                <option value="DRAFT">Draft (Hidden)</option>
              </select>

              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #c9cccf",
                  fontSize: "14px",
                  backgroundColor: "#fff",
                }}
              >
                <option value="ALL">All Stock Levels</option>
                <option value="LOW">⚠️ Low Stock (≤ 5)</option>
                <option value="OUT">❌ Out of Stock (0)</option>
                <option value="IN">✅ In Stock (&gt; 5)</option>
              </select>
            </div>

            {/* Products Table */}
            {filteredProducts.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "50px 20px",
                  background: "#ffffff",
                  borderRadius: "12px",
                  border: "1px dashed #c9cccf",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>📦</div>
                <h3 style={{ margin: "0 0 6px 0", color: "#202223" }}>No matching products found</h3>
                <p style={{ color: "#6d7175", marginBottom: "16px" }}>
                  Try changing your search keywords or filter options.
                </p>
                <s-button onClick={() => setActiveView("create")}>+ Create a New Product</s-button>
              </div>
            ) : (
              <div
                style={{
                  overflowX: "auto",
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #e1e3e5",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    textAlign: "left",
                    fontSize: "14px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "#fafbfc",
                        borderBottom: "2px solid #e1e3e5",
                        color: "#4a4f55",
                      }}
                    >
                      <th style={{ padding: "14px 16px" }}>Product &amp; Title</th>
                      <th style={{ padding: "14px 16px" }}>Status</th>
                      <th style={{ padding: "14px 16px" }}>Inventory</th>
                      <th style={{ padding: "14px 16px" }}>Price ({shop?.currencyCode || "USD"})</th>
                      <th style={{ padding: "14px 16px" }}>Tags</th>
                      <th style={{ padding: "14px 16px", textAlign: "right" }}>Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const firstVariant = p.variants?.edges?.[0]?.node;
                      const isEditingPrice = editingPriceId === p.id;
                      const inv = p.totalInventory || 0;

                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: "1px solid #f1f2f3",
                            transition: "background 0.15s ease",
                          }}
                        >
                          {/* Image & Title */}
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              {p.featuredImage?.url ? (
                                <img
                                  src={p.featuredImage.url}
                                  alt={p.title}
                                  style={{
                                    width: "48px",
                                    height: "48px",
                                    objectFit: "cover",
                                    borderRadius: "8px",
                                    border: "1px solid #e1e3e5",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: "48px",
                                    height: "48px",
                                    borderRadius: "8px",
                                    background: "#e4e5e7",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "22px",
                                  }}
                                >
                                  🛍️
                                </div>
                              )}
                              <div>
                                <div style={{ fontWeight: "600", color: "#202223" }}>{p.title}</div>
                                <div style={{ fontSize: "12px", color: "#8c9196" }}>
                                  ID: {p.id.split("/").pop()}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                fontWeight: "700",
                                background: p.status === "ACTIVE" ? "#cbf4c9" : "#ffea8a",
                                color: p.status === "ACTIVE" ? "#0e6231" : "#594400",
                              }}
                            >
                              {p.status === "ACTIVE" ? "● Active" : "○ Draft"}
                            </span>
                          </td>

                          {/* Inventory Level */}
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                fontWeight: "600",
                                color: inv === 0 ? "#d82c0d" : inv <= 5 ? "#b98900" : "#202223",
                              }}
                            >
                              {inv === 0 ? "❌ Out of stock" : inv <= 5 ? `⚠️ ${inv} left` : `📦 ${inv} in stock`}
                            </span>
                          </td>

                          {/* Price & Inline Edit */}
                          <td style={{ padding: "12px 16px" }}>
                            {isEditingPrice ? (
                              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={tempPrice}
                                  onChange={(e) => setTempPrice(e.target.value)}
                                  style={{
                                    width: "80px",
                                    padding: "6px 8px",
                                    borderRadius: "6px",
                                    border: "2px solid #008060",
                                    fontSize: "13px",
                                  }}
                                />
                                <button
                                  onClick={() =>
                                    handleQuickPriceUpdate(p.id, firstVariant?.id, tempPrice)
                                  }
                                  disabled={isLoading}
                                  style={{
                                    padding: "6px 10px",
                                    background: "#008060",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontWeight: "600",
                                    fontSize: "12px",
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingPriceId(null)}
                                  style={{
                                    padding: "6px 8px",
                                    background: "#f1f2f3",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontWeight: "700", fontSize: "15px", color: "#202223" }}>
                                  ${firstVariant?.price || "0.00"}
                                </span>
                                {firstVariant?.compareAtPrice && (
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      color: "#8c9196",
                                      textDecoration: "line-through",
                                    }}
                                  >
                                    ${firstVariant.compareAtPrice}
                                  </span>
                                )}
                                {firstVariant?.id && (
                                  <button
                                    onClick={() => {
                                      setEditingPriceId(p.id);
                                      setTempPrice(firstVariant.price || "");
                                    }}
                                    title="Edit Price"
                                    style={{
                                      background: "#f1f8f5",
                                      border: "1px solid #b7ebcf",
                                      borderRadius: "6px",
                                      padding: "3px 7px",
                                      cursor: "pointer",
                                      fontSize: "12px",
                                      color: "#008060",
                                    }}
                                  >
                                    ✏️ Edit
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Tags */}
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              {p.tags?.length > 0 ? (
                                p.tags.slice(0, 3).map((tag, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      background: "#f1f2f3",
                                      padding: "3px 8px",
                                      borderRadius: "6px",
                                      fontSize: "11px",
                                      fontWeight: "500",
                                      color: "#454f5b",
                                    }}
                                  >
                                    #{tag}
                                  </span>
                                ))
                              ) : (
                                <span style={{ color: "#a0a4a8", fontSize: "12px" }}>No tags</span>
                              )}
                              {p.tags?.length > 3 && (
                                <span style={{ fontSize: "11px", color: "#6d7175" }}>
                                  +{p.tags.length - 3}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                              <button
                                onClick={() => handleToggleStatus(p.id, p.status)}
                                disabled={isLoading}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: "6px",
                                  border: "1px solid #c9cccf",
                                  background: "#ffffff",
                                  fontSize: "12px",
                                  fontWeight: "500",
                                  cursor: "pointer",
                                }}
                              >
                                {p.status === "ACTIVE" ? "Set Draft" : "Activate"}
                              </button>

                              <button
                                onClick={() => {
                                  shopify.intents.invoke?.("edit:shopify/Product", {
                                    value: p.id,
                                  });
                                }}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  border: "1px solid #c9cccf",
                                  background: "#f6f6f7",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                }}
                                title="Open in Shopify Admin"
                              >
                                ↗ Admin
                              </button>

                              <button
                                onClick={() => handleDelete(p.id, p.title)}
                                disabled={isLoading}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  border: "1px solid #ffd2d2",
                                  background: "#fff5f5",
                                  color: "#d82c0d",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                }}
                                title="Delete Product"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </s-section>
        </>
      ) : (
        /* CREATE PRODUCT FORM VIEW */
        <s-section heading="✨ Create New Custom Product with Real-time Attributes">
          <form
            onSubmit={handleCreateSubmit}
            style={{
              maxWidth: "680px",
              background: "#fff",
              padding: "24px",
              borderRadius: "12px",
              border: "1px solid #e1e3e5",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
            }}
          >
            <div>
              <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "14px" }}>
                Product Title *
              </label>
              <input
                type="text"
                placeholder="e.g. Ultra-Comfort Wireless Earbuds"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #c9cccf",
                  fontSize: "14px",
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "14px" }}>
                  Selling Price ({shop?.currencyCode || "USD"}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="39.99"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "14px" }}>
                  Original / Compare-At Price (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="49.99"
                  value={comparePrice}
                  onChange={(e) => setComparePrice(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "14px" }}>
                  Product Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    background: "#fff",
                  }}
                >
                  <option value="ACTIVE">Active (Live in storefront immediately)</option>
                  <option value="DRAFT">Draft (Save as draft in admin)</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "14px" }}>
                  Tags (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="Electronics, BestSeller, Deal"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "14px" }}>
                Product Description
              </label>
              <textarea
                rows={3}
                placeholder="Write compelling product description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #c9cccf",
                  fontSize: "14px",
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "10px" }}>
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  padding: "12px 24px",
                  background: "#008060",
                  color: "#ffffff",
                  fontWeight: "bold",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  boxShadow: "0 2px 4px rgba(0,128,96,0.2)",
                }}
              >
                {isLoading ? "Publishing to Shopify..." : "🚀 Publish Product in Store"}
              </button>
              <button
                type="button"
                onClick={() => setActiveView("dashboard")}
                style={{
                  padding: "12px 20px",
                  background: "#f1f2f3",
                  color: "#333",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </s-section>
      )}

      {/* Aside Store Info */}
      <s-section slot="aside" heading="Connected Store Details">
        <s-paragraph>
          <s-text><b>Store:</b> {shop?.name || "Shopify Store"}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text><b>Domain:</b> {shop?.myshopifyDomain || "N/A"}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text><b>Currency:</b> {shop?.currencyCode || "USD"}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text><b>Plan:</b> {shop?.plan?.displayName || "Partner Development"}</s-text>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Quick Links">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/bulk">⚡ Run Bulk Operations</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/banner">🎨 Customize Storefront Banner</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/settings">⚙️ API Inspector &amp; Settings</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/about">📖 Architecture Guide</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
