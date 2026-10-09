/**
 * REST API Tokens Section
 *
 * Read-only bearer tokens for external LAN services (e.g. MyServices) to read
 * the network inventory without a user login. Separate from MCP tokens: an
 * API token only works on the GET allowlist below, never on /api/mcp.
 * Generic labels (status, dates, buttons) are shared with the MCP section.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Plus, Trash2, Loader2, CheckCircle, ShieldCheck } from "lucide-react";
import { Section } from "../pages/SettingsPage";
import { api } from "../api/client";
import { CodeBlock } from "./McpSection";

interface ApiTokenSummary {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
}

// Mirrors API_TOKEN_ALLOWED_ROUTES in server/middleware/apiTokenAuth.ts
const ALLOWED_ROUTES = [
  "/api/network-scan/history",
  "/api/network-scan/:ip",
  "/api/lan/devices",
  "/api/dhcp/leases",
  "/api/wifi/stations",
  "/api/topology",
  "/api/plugins/unifi/clients",
  "/api/plugins/unifi/devices",
];

const DURATIONS: { days: number | null; labelKey: string }[] = [
  { days: 30, labelKey: "durationOption30" },
  { days: 90, labelKey: "durationOption90" },
  { days: 365, labelKey: "durationOption365" },
  { days: null, labelKey: "durationOptionUnlimited" },
];

const STATUS_STYLES: Record<ApiTokenSummary["status"], string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  expired: "bg-amber-500/15 text-amber-400",
  revoked: "bg-gray-500/15 text-gray-400",
};

const STATUS_LABEL_KEYS: Record<ApiTokenSummary["status"], string> = {
  active: "statusActive",
  expired: "statusExpired",
  revoked: "statusRevoked",
};

export const ApiTokensSection: React.FC = () => {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [durationIndex, setDurationIndex] = useState(3);
  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);

  const loadTokens = async () => {
    setError(null);
    try {
      const response = await api.get<ApiTokenSummary[]>("/api/api-tokens");
      if (response.success && response.result) setTokens(response.result);
      else setError(t("admin.mcp.tokensLoadError"));
    } catch {
      setError(t("admin.mcp.tokensLoadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t("admin.mcp.nameRequired"));
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const response = await api.post<ApiTokenSummary & { token: string }>("/api/api-tokens", {
        name: name.trim(),
        expiresInDays: DURATIONS[durationIndex].days,
        accessLevel: "read_only",
      });
      if (response.success && response.result) {
        setCreated({ name: response.result.name, token: response.result.token });
        setName("");
        await loadTokens();
      } else {
        setError(t("admin.mcp.createError"));
      }
    } catch {
      setError(t("admin.mcp.createError"));
    } finally {
      setIsCreating(false);
    }
  };

  // Active tokens are revoked (soft, kept for audit); revoked/expired ones are purged
  const handleRemove = async (token: ApiTokenSummary) => {
    const isActive = token.status === "active";
    const confirmKey = isActive ? "admin.mcp.revokeConfirm" : "admin.mcp.purgeConfirm";
    if (!window.confirm(t(confirmKey, { name: token.name }))) return;

    setBusyId(token.id);
    setError(null);
    try {
      const url = isActive ? `/api/api-tokens/${token.id}` : `/api/api-tokens/${token.id}/purge`;
      const response = await api.delete<{ id: number }>(url);
      if (response.success) await loadTokens();
      else setError(t(isActive ? "admin.mcp.revokeError" : "admin.mcp.purgeError"));
    } catch {
      setError(t(isActive ? "admin.mcp.revokeError" : "admin.mcp.purgeError"));
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString() : t("admin.mcp.never");

  return (
    <div className="space-y-6">
      <Section title={t("admin.apiTokens.title")} icon={KeyRound} iconColor="teal">
        <div className="space-y-4">
          <p className="text-xs text-theme-secondary">{t("admin.apiTokens.description")}</p>

          <div className="p-3 bg-theme-secondary border border-theme rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-theme-primary">
              <ShieldCheck size={14} className="text-teal-400" />
              {t("admin.apiTokens.rulesTitle")}
            </div>
            <ul className="text-xs text-theme-secondary list-disc pl-5 space-y-0.5">
              <li>{t("admin.apiTokens.ruleReadOnly")}</li>
              <li>{t("admin.apiTokens.ruleNetwork")}</li>
              <li>{t("admin.apiTokens.ruleSecrets")}</li>
            </ul>
            <p className="text-xs font-medium text-theme-primary pt-1">{t("admin.apiTokens.routesTitle")}</p>
            <ul className="text-xs font-mono text-theme-secondary space-y-0.5">
              {ALLOWED_ROUTES.map((route) => (
                <li key={route}>GET {route}</li>
              ))}
            </ul>
            <p className="text-[11px] text-theme-secondary">{t("admin.apiTokens.docsHint")}</p>
          </div>

          {created && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-emerald-400">
                  {t("admin.mcp.tokenCreatedWarning", { name: created.name })}
                </p>
              </div>
              <CodeBlock code={created.token} />
              <CodeBlock
                label={t("admin.apiTokens.curlExample")}
                code={`curl -H "Authorization: Bearer ${created.token}" ${globalThis.location.origin}/api/network-scan/history`}
              />
              <button
                type="button"
                onClick={() => setCreated(null)}
                className="text-xs font-medium text-theme-secondary hover:text-theme-primary underline"
              >
                {t("admin.mcp.doneButton")}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[180px]">
              <label htmlFor="api-token-name" className="text-xs font-medium text-theme-secondary block mb-1">
                {t("admin.mcp.formNameLabel")}
              </label>
              <input
                id="api-token-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("admin.apiTokens.namePlaceholder")}
                maxLength={100}
                className="w-full px-2.5 py-1.5 rounded-lg bg-theme-primary border border-theme text-sm text-theme-primary"
              />
            </div>
            <div>
              <label htmlFor="api-token-duration" className="text-xs font-medium text-theme-secondary block mb-1">
                {t("admin.mcp.formDurationLabel")}
              </label>
              <select
                id="api-token-duration"
                value={durationIndex}
                onChange={(e) => setDurationIndex(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-lg bg-theme-primary border border-theme text-sm text-theme-primary"
              >
                {DURATIONS.map((d, i) => (
                  <option key={d.labelKey} value={i}>
                    {t(`admin.mcp.${d.labelKey}`)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {isCreating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={13} />}
              {t("admin.apiTokens.createButton")}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {loading && (
            <div className="flex items-center gap-2 text-theme-secondary py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t("common.loading")}</span>
            </div>
          )}

          {!loading && tokens.length === 0 && (
            <p className="text-xs text-theme-secondary py-2">{t("admin.apiTokens.noTokens")}</p>
          )}

          {!loading && tokens.length > 0 && (
            <ul className="space-y-2">
              {tokens.map((tok) => (
                <li
                  key={tok.id}
                  className="flex items-center justify-between gap-3 p-2.5 bg-theme-secondary border border-theme rounded-lg"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-theme-primary truncate">{tok.name}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_STYLES[tok.status]}`}>
                        {t(`admin.mcp.${STATUS_LABEL_KEYS[tok.status]}`)}
                      </span>
                    </div>
                    <p className="text-[11px] text-theme-secondary mt-0.5">
                      {t("admin.mcp.createdAt")}: {formatDate(tok.createdAt)}
                      {" · "}
                      {t("admin.mcp.lastUsedAt")}: {formatDate(tok.lastUsedAt)}
                      {" · "}
                      {t("admin.mcp.expiresAt")}: {tok.expiresAt ? formatDate(tok.expiresAt) : t("admin.mcp.durationOptionUnlimited")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(tok)}
                    disabled={busyId === tok.id}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                  >
                    {busyId === tok.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    {t(tok.status === "active" ? "admin.mcp.revokeButton" : "admin.mcp.purgeButton")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
};
