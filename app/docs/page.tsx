"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

/**
 * Swagger UI поверх рукописной спецификации public/api-docs/openapi.json.
 * Страница публичная (открыта в middleware), чтобы документацию можно было
 * показать команде и интеграторам без входа в приложение.
 */
export default function DocsPage() {
  return (
    <div className="min-h-screen" style={{ background: "#05050a" }}>
      <SwaggerUI url="/api-docs/openapi.json" />
    </div>
  );
}
