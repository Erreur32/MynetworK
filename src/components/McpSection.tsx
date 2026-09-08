/**
 * MCP Section Component
 *
 * Read-only status display for the MCP (Model Context Protocol) server.
 * Token generation/rotation is CLI-only (`npm run mcp:token`) since this
 * admin panel is internet-exposed while the MCP endpoint must stay LAN-only.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cable,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Terminal,
} from "lucide-react";
import { Section, SettingRow } from "../pages/SettingsPage";
import { api } from "../api/client";

interface McpStatus {
  enabled: boolean;
  configured: boolean;
  endpoint: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export const McpSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("fr") ? "fr-FR" : "en-GB";
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<McpStatus>("/api/mcp/status");
      if (response.success && response.result) {
        setStatus(response.result);
      } else {
        setError(t("admin.mcp.loadError"));
      }
    } catch {
      setError(t("admin.mcp.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString(dateLocale) : t("admin.mcp.never");

  return (
    <div className="space-y-6">
      <Section title={t("admin.mcp.title")} icon={Cable} iconColor="cyan">
        {isLoading && (
          <div className="flex items-center gap-2 text-theme-secondary py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t("common.loading")}</span>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex items-center gap-2 text-amber-400 py-4">
            <AlertCircle size={16} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!isLoading && !error && status && (
          <div>
            <p className="text-sm text-theme-secondary mb-4">
              {t("admin.mcp.description")}
            </p>

            <SettingRow label={t("admin.mcp.status")}>
              {status.enabled ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                  <CheckCircle size={12} />
                  {t("admin.mcp.enabled")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-500/15 border border-gray-500/30 text-gray-400 text-xs font-medium">
                  <XCircle size={12} />
                  {t("admin.mcp.disabled")}
                </span>
              )}
            </SettingRow>

            <SettingRow label={t("admin.mcp.tokenStatus")}>
              {status.configured ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                  <CheckCircle size={12} />
                  {t("admin.mcp.tokenConfigured")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium">
                  <AlertCircle size={12} />
                  {t("admin.mcp.tokenNotConfigured")}
                </span>
              )}
            </SettingRow>

            <SettingRow label={t("admin.mcp.endpoint")}>
              <code className="text-xs text-theme-secondary bg-theme-secondary px-2 py-1 rounded">
                {status.endpoint}
              </code>
            </SettingRow>

            <SettingRow label={t("admin.mcp.createdAt")}>
              <span className="text-sm text-theme-secondary">
                {formatDate(status.createdAt)}
              </span>
            </SettingRow>

            <SettingRow label={t("admin.mcp.lastUsedAt")}>
              <span className="text-sm text-theme-secondary">
                {formatDate(status.lastUsedAt)}
              </span>
            </SettingRow>

            <div className="mt-4 p-3 bg-theme-secondary rounded-lg border border-theme flex items-start gap-2">
              <Terminal
                size={16}
                className="text-cyan-400 mt-0.5 flex-shrink-0"
              />
              <p className="text-xs text-theme-secondary">
                {t("admin.mcp.cliHint")}
              </p>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
};
