/**
 * MCP Section Component
 *
 * Status, token management, client setup instructions and exposed-tools
 * catalog for the MCP (Model Context Protocol) server, split across four
 * tabs: Overview, Tokens, Connect and Capabilities.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cable,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Settings2,
  Plus,
  Trash2,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Section, SettingRow } from "../pages/SettingsPage";
import { api } from "../api/client";
import { Toggle } from "./ui/Toggle";

interface McpSessionSummary {
  tokenId: number | null;
  tokenName: string | null;
  ip: string;
  userAgent: string;
  connectedAt: string;
  lastActivity: string;
}

interface McpStatus {
  enabled: boolean;
  runtimeEnabled: boolean;
  configured: boolean;
  endpoint: string;
  hostIp: string | null;
  dashboardPort: string;
  activeSessions: number;
  sessions: McpSessionSummary[];
}

type McpTokenAccessLevel = "full" | "read_only";
type McpTokenCategoryStatus = "full" | "none" | "partial";

interface McpTokenSummary {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  accessLevel: McpTokenAccessLevel;
  status: "active" | "expired" | "revoked";
  categories: Record<string, McpTokenCategoryStatus>;
}

interface McpTool {
  name: string;
  category: string;
  title: string;
  description: string;
  readOnly: boolean;
}

interface McpTokenToolPermission extends McpTool {
  enabled: boolean;
  isOverride: boolean;
}

type DurationPreset = "30" | "90" | "365" | "unlimited" | "custom";

type McpMainTab = "general" | "tokens" | "setup";
type ClientTab = "claude-code" | "claude-desktop" | "other";

const CodeBlock: React.FC<{ label?: string; code: string }> = ({
  label,
  code,
}) => {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const handleCopy = async () => {
    try {
      // navigator.clipboard needs a secure context (HTTPS or localhost):
      // undefined/throws when the admin panel is reached over plain HTTP on
      // a LAN IP, which this app's own LAN-only design makes a common case.
      if (!navigator.clipboard) throw new Error("clipboard API unavailable");
      await navigator.clipboard.writeText(code);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        setCopyState("failed");
        setTimeout(() => setCopyState("idle"), 2500);
        return;
      }
    }
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  return (
    <div className="space-y-1">
      {label && (
        <span className="text-xs font-medium text-theme-secondary">
          {label}
        </span>
      )}
      <div className="relative group">
        <pre className="text-xs bg-theme-secondary border border-theme rounded-lg p-3 pr-10 overflow-x-auto">
          <code>{code}</code>
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          title={
            copyState === "copied"
              ? t("admin.mcp.copied")
              : copyState === "failed"
                ? t("admin.mcp.copyFailed")
                : t("admin.mcp.copy")
          }
          className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-theme-tertiary transition-colors"
        >
          {copyState === "copied" ? (
            <Check size={14} className="text-emerald-400" />
          ) : copyState === "failed" ? (
            <AlertCircle size={14} className="text-red-400" />
          ) : (
            <Copy size={14} className="text-theme-secondary" />
          )}
        </button>
        {copyState === "copied" && (
          <span className="absolute top-2 right-9 text-[10px] text-emerald-400 bg-theme-secondary px-1.5 py-0.5 rounded">
            {t("admin.mcp.copied")}
          </span>
        )}
        {copyState === "failed" && (
          <span className="absolute top-2 right-9 text-[10px] text-red-400 bg-theme-secondary px-1.5 py-0.5 rounded">
            {t("admin.mcp.copyFailed")}
          </span>
        )}
      </div>
    </div>
  );
};

const MAIN_TABS: McpMainTab[] = ["general", "tokens", "setup"];
const MAIN_TAB_LABEL_KEYS: Record<McpMainTab, string> = {
  general: "tabGeneral",
  tokens: "tabTokens",
  setup: "tabSetup",
};
const MAIN_TAB_ICONS: Record<McpMainTab, React.ElementType> = {
  general: Cable,
  tokens: KeyRound,
  setup: Settings2,
};

const CLIENT_TABS: ClientTab[] = ["claude-code", "claude-desktop", "other"];
const CLIENT_TAB_LABEL_KEYS: Record<ClientTab, string> = {
  "claude-code": "clientClaudeCode",
  "claude-desktop": "clientClaudeDesktop",
  other: "clientOther",
};

const DURATION_PRESETS: DurationPreset[] = ["30", "90", "365", "unlimited", "custom"];
const DURATION_LABEL_KEYS: Record<DurationPreset, string> = {
  "30": "durationOption30",
  "90": "durationOption90",
  "365": "durationOption365",
  unlimited: "durationOptionUnlimited",
  custom: "durationOptionCustom",
};

const STATUS_LABEL_KEYS: Record<McpTokenSummary["status"], string> = {
  active: "statusActive",
  expired: "statusExpired",
  revoked: "statusRevoked",
};

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  freebox: "capabilitiesCategoryFreebox",
  unifi: "capabilitiesCategoryUnifi",
  scan: "capabilitiesCategoryScan",
};

const CATEGORY_STATUS_LABEL_KEYS: Record<McpTokenCategoryStatus, string> = {
  full: "categoryToggleAll",
  partial: "categoryTogglePartial",
  none: "categoryToggleNone",
};

const ACCESS_LEVELS: McpTokenAccessLevel[] = ["full", "read_only"];
const ACCESS_LEVEL_LABEL_KEYS: Record<McpTokenAccessLevel, string> = {
  full: "accessLevelFull",
  read_only: "accessLevelReadOnly",
};

export const McpSection: React.FC<{
  activeSubTab?: string;
  onSubTabChange?: (sub: string) => void;
}> = ({ activeSubTab, onSubTabChange }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("fr") ? "fr-FR" : "en-GB";
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientTab, setClientTab] = useState<ClientTab>("claude-code");
  const [isToggling, setIsToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [tokens, setTokens] = useState<McpTokenSummary[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [purgingId, setPurgingId] = useState<number | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenDuration, setNewTokenDuration] = useState<DurationPreset>("90");
  const [newTokenCustomDays, setNewTokenCustomDays] = useState("30");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreatedToken, setJustCreatedToken] = useState<{
    name: string;
    token: string;
  } | null>(null);
  const [accessLevelSavingId, setAccessLevelSavingId] = useState<number | null>(null);
  const [accessLevelError, setAccessLevelError] = useState<string | null>(null);

  const [expandedTokenId, setExpandedTokenId] = useState<number | null>(null);
  const [tokenPermissions, setTokenPermissions] = useState<McpTokenToolPermission[]>([]);
  const [tokenPermissionsLoading, setTokenPermissionsLoading] = useState(false);
  const [tokenPermissionsError, setTokenPermissionsError] = useState<string | null>(null);
  const [savingToolName, setSavingToolName] = useState<string | null>(null);

  const mainTab: McpMainTab = (MAIN_TABS as string[]).includes(
    activeSubTab || "",
  )
    ? (activeSubTab as McpMainTab)
    : "general";
  const setMainTab = (tab: McpMainTab) => {
    if (onSubTabChange) onSubTabChange(tab);
  };

  useEffect(() => {
    loadStatus();
    loadTokens();

    // Active sessions (client connect/disconnect) can change without any
    // action in this tab, so poll instead of relying on a manual refresh.
    const interval = setInterval(() => loadStatus({ silent: true }), 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (expandedTokenId === null) {
      setTokenPermissions([]);
      return;
    }
    loadTokenPermissions(expandedTokenId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedTokenId]);

  const loadTokenPermissions = async (tokenId: number) => {
    setTokenPermissionsLoading(true);
    setTokenPermissionsError(null);
    try {
      const response = await api.get<McpTokenToolPermission[]>(
        `/api/mcp/tokens/${tokenId}/tools`,
      );
      if (response.success && response.result) {
        setTokenPermissions(response.result);
      } else {
        setTokenPermissionsError(t("admin.mcp.capabilitiesLoadError"));
      }
    } catch {
      setTokenPermissionsError(t("admin.mcp.capabilitiesLoadError"));
    } finally {
      setTokenPermissionsLoading(false);
    }
  };

  const loadTokens = async () => {
    setTokensLoading(true);
    setTokensError(null);
    try {
      const response = await api.get<McpTokenSummary[]>("/api/mcp/tokens");
      if (response.success && response.result) {
        setTokens(response.result);
      } else {
        setTokensError(t("admin.mcp.tokensLoadError"));
      }
    } catch {
      setTokensError(t("admin.mcp.tokensLoadError"));
    } finally {
      setTokensLoading(false);
    }
  };

  const durationToDays = (preset: DurationPreset): number | null => {
    if (preset === "unlimited") return null;
    if (preset === "custom") {
      const parsed = parseInt(newTokenCustomDays, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return parseInt(preset, 10);
  };

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) {
      setCreateError(t("admin.mcp.nameRequired"));
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const response = await api.post<McpTokenSummary & { token: string }>(
        "/api/mcp/tokens",
        {
          name: newTokenName.trim(),
          expiresInDays: durationToDays(newTokenDuration),
          accessLevel: "full",
        },
      );
      if (response.success && response.result) {
        setJustCreatedToken({
          name: response.result.name,
          token: response.result.token,
        });
        setShowCreateForm(false);
        setNewTokenName("");
        setNewTokenDuration("90");
        setExpandedTokenId(response.result.id);
        await Promise.all([loadTokens(), loadStatus()]);
      } else {
        setCreateError(t("admin.mcp.createError"));
      }
    } catch {
      setCreateError(t("admin.mcp.createError"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeToken = async (tokenToRevoke: McpTokenSummary) => {
    if (!window.confirm(t("admin.mcp.revokeConfirm", { name: tokenToRevoke.name }))) {
      return;
    }
    setRevokingId(tokenToRevoke.id);
    setTokensError(null);
    try {
      const response = await api.delete<{ id: number }>(
        `/api/mcp/tokens/${tokenToRevoke.id}`,
      );
      if (response.success) {
        await Promise.all([loadTokens(), loadStatus()]);
      } else {
        setTokensError(t("admin.mcp.revokeError"));
      }
    } catch {
      setTokensError(t("admin.mcp.revokeError"));
    } finally {
      setRevokingId(null);
    }
  };

  const handlePurgeToken = async (tokenToPurge: McpTokenSummary) => {
    if (!window.confirm(t("admin.mcp.purgeConfirm", { name: tokenToPurge.name }))) {
      return;
    }
    setPurgingId(tokenToPurge.id);
    setTokensError(null);
    try {
      const response = await api.delete<{ id: number }>(
        `/api/mcp/tokens/${tokenToPurge.id}/purge`,
      );
      if (response.success) {
        await loadTokens();
      } else {
        setTokensError(t("admin.mcp.purgeError"));
      }
    } catch {
      setTokensError(t("admin.mcp.purgeError"));
    } finally {
      setPurgingId(null);
    }
  };

  const handleChangeAccessLevel = async (
    tokenToUpdate: McpTokenSummary,
    accessLevel: McpTokenAccessLevel,
  ) => {
    if (accessLevel === tokenToUpdate.accessLevel) return;
    setAccessLevelSavingId(tokenToUpdate.id);
    setAccessLevelError(null);
    try {
      const response = await api.patch<{ id: number; accessLevel: McpTokenAccessLevel }>(
        `/api/mcp/tokens/${tokenToUpdate.id}/access-level`,
        { accessLevel },
      );
      if (response.success) {
        await loadTokens();
        if (expandedTokenId === tokenToUpdate.id) await loadTokenPermissions(tokenToUpdate.id);
      } else {
        setAccessLevelError(t("admin.mcp.accessLevelError"));
      }
    } catch {
      setAccessLevelError(t("admin.mcp.accessLevelError"));
    } finally {
      setAccessLevelSavingId(null);
    }
  };

  const handleToggleTool = async (tool: McpTokenToolPermission, enabled: boolean) => {
    if (expandedTokenId === null) return;
    setSavingToolName(tool.name);
    setTokenPermissionsError(null);
    try {
      const response = await api.put(`/api/mcp/tokens/${expandedTokenId}/tools/${tool.name}`, {
        enabled,
      });
      if (response.success) {
        setTokenPermissions((prev) =>
          prev.map((t) => (t.name === tool.name ? { ...t, enabled, isOverride: true } : t)),
        );
        loadTokens();
      } else {
        setTokenPermissionsError(t("admin.mcp.toolOverrideError"));
      }
    } catch {
      setTokenPermissionsError(t("admin.mcp.toolOverrideError"));
    } finally {
      setSavingToolName(null);
    }
  };

  const handleResetTool = async (tool: McpTokenToolPermission) => {
    if (expandedTokenId === null) return;
    setSavingToolName(tool.name);
    setTokenPermissionsError(null);
    try {
      const response = await api.delete(`/api/mcp/tokens/${expandedTokenId}/tools/${tool.name}`);
      if (response.success) {
        await loadTokenPermissions(expandedTokenId);
        loadTokens();
      } else {
        setTokenPermissionsError(t("admin.mcp.toolOverrideError"));
      }
    } catch {
      setTokenPermissionsError(t("admin.mcp.toolOverrideError"));
    } finally {
      setSavingToolName(null);
    }
  };

  const handleToggleCategory = async (categoryTools: McpTokenToolPermission[]) => {
    if (expandedTokenId === null) return;
    const allEnabled = categoryTools.every((tool) => tool.enabled);
    const nextEnabled = !allEnabled;
    const toolsToUpdate = categoryTools.filter((tool) => tool.enabled !== nextEnabled);
    if (toolsToUpdate.length === 0) return;

    setSavingToolName(`category:${categoryTools[0]?.category ?? ""}`);
    setTokenPermissionsError(null);
    try {
      const results = await Promise.all(
        toolsToUpdate.map((tool) =>
          api.put(`/api/mcp/tokens/${expandedTokenId}/tools/${tool.name}`, {
            enabled: nextEnabled,
          }),
        ),
      );
      if (results.every((r) => r.success)) {
        const updatedNames = new Set(toolsToUpdate.map((tool) => tool.name));
        setTokenPermissions((prev) =>
          prev.map((t) =>
            updatedNames.has(t.name) ? { ...t, enabled: nextEnabled, isOverride: true } : t,
          ),
        );
        loadTokens();
      } else {
        setTokenPermissionsError(t("admin.mcp.toolOverrideError"));
      }
    } catch {
      setTokenPermissionsError(t("admin.mcp.toolOverrideError"));
    } finally {
      setSavingToolName(null);
    }
  };

  const loadStatus = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<McpStatus>("/api/mcp/status");
      if (response.success && response.result) {
        setStatus(response.result);
      } else if (!options?.silent) {
        setError(t("admin.mcp.loadError"));
      }
    } catch {
      if (!options?.silent) setError(t("admin.mcp.loadError"));
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  };

  const handleToggleRuntime = async (nextEnabled: boolean) => {
    if (!status) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      const response = await api.post<{ runtimeEnabled: boolean }>(
        "/api/mcp/status",
        { enabled: nextEnabled },
      );
      if (response.success && response.result) {
        setStatus({ ...status, runtimeEnabled: response.result.runtimeEnabled });
      } else {
        setToggleError(t("admin.mcp.toggleError"));
      }
    } catch {
      setToggleError(t("admin.mcp.toggleError"));
    } finally {
      setIsToggling(false);
    }
  };

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString(dateLocale) : t("admin.mcp.never");

  const lanHost = status?.hostIp
    ? `${status.hostIp}:${status.dashboardPort}`
    : "<LAN-IP>:<PORT>";

  const activeTokenCount = tokens.filter((tok) => tok.status === "active").length;
  const expiredTokenCount = tokens.filter((tok) => tok.status === "expired").length;
  const revokedTokenCount = tokens.filter((tok) => tok.status === "revoked").length;

  const tokenPermissionsByCategory = tokenPermissions.reduce<
    Record<string, McpTokenToolPermission[]>
  >((acc, tool) => {
    (acc[tool.category] ??= []).push(tool);
    return acc;
  }, {});
  const activeTokens = tokens.filter((tok) => tok.status === "active");

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

            <div className="flex gap-1.5 flex-wrap mb-4 pb-4 border-b border-theme">
              {MAIN_TABS.map((tab) => {
                const TabIcon = MAIN_TAB_ICONS[tab];
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMainTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                      mainTab === tab
                        ? "bg-cyan-600/30 text-cyan-300 border-cyan-600/50"
                        : "bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary"
                    }`}
                  >
                    <TabIcon size={13} />
                    {t(`admin.mcp.${MAIN_TAB_LABEL_KEYS[tab]}`)}
                  </button>
                );
              })}
            </div>

            {mainTab === "general" && (
              <div>
                <SettingRow label={t("admin.mcp.runtimeToggleLabel")}>
                  <Toggle
                    checked={status.runtimeEnabled}
                    onChange={handleToggleRuntime}
                    disabled={isToggling || !status.enabled}
                  />
                </SettingRow>
                {toggleError && (
                  <p className="text-xs text-red-400 mb-3">{toggleError}</p>
                )}
                {!status.runtimeEnabled && (
                  <div className="flex items-start gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-400">
                      {t("admin.mcp.runtimeDisabledWarning")}
                    </p>
                  </div>
                )}
                {status.runtimeEnabled && !status.configured && (
                  <div className="flex items-start gap-2 p-3 mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-400">
                      {t("admin.mcp.enabledNoTokenWarning")}
                    </p>
                  </div>
                )}

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

                <SettingRow label={t("admin.mcp.endpoint")}>
                  <code className="text-xs text-theme-secondary bg-theme-secondary px-2 py-1 rounded">
                    {status.endpoint}
                  </code>
                </SettingRow>

                <SettingRow label={t("admin.mcp.activeSessions")}>
                  <span className="inline-flex items-center gap-1.5 text-sm text-theme-secondary">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        status.activeSessions > 0
                          ? "bg-emerald-400"
                          : "bg-gray-500"
                      }`}
                    />
                    {status.activeSessions === 0
                      ? t("admin.mcp.activeSessionsNone")
                      : status.activeSessions === 1
                        ? t("admin.mcp.activeSessionsOne")
                        : t("admin.mcp.activeSessionsMany", {
                            count: status.activeSessions,
                          })}
                  </span>
                </SettingRow>

                {status.sessions.length > 0 && (
                  <div className="mb-4 border border-theme rounded-lg divide-y divide-theme overflow-hidden">
                    {status.sessions.map((session, index) => (
                      <div
                        key={`${session.ip}-${session.connectedAt}-${index}`}
                        className="flex flex-col gap-1 p-3 bg-theme-secondary text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-medium text-theme-primary">
                            <KeyRound size={12} className="text-cyan-400" />
                            {session.tokenName ??
                              t("admin.mcp.sessionUnknownToken")}
                          </span>
                          <code className="text-theme-secondary bg-theme-tertiary px-1.5 py-0.5 rounded">
                            {session.ip}
                          </code>
                        </div>
                        <div className="text-theme-secondary truncate" title={session.userAgent}>
                          {session.userAgent}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-theme-secondary">
                          <span>
                            {t("admin.mcp.sessionConnectedAt")}{" "}
                            {formatDate(session.connectedAt)}
                          </span>
                          <span>
                            {t("admin.mcp.sessionLastActivity")}{" "}
                            {formatDate(session.lastActivity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setMainTab("tokens")}
                  className="w-full flex items-center justify-between gap-3 mt-4 p-3 bg-theme-secondary border border-theme rounded-lg hover:bg-theme-tertiary transition-colors text-left"
                >
                  <span className="flex items-center gap-2 text-sm text-theme-primary">
                    <KeyRound size={15} className="text-cyan-400" />
                    {tokensLoading
                      ? t("common.loading")
                      : t("admin.mcp.tokensQuickSummary", {
                          active: activeTokenCount,
                          total: tokens.length,
                        })}
                  </span>
                  <ArrowRight size={14} className="text-theme-secondary flex-shrink-0" />
                </button>

                <div className="flex items-start gap-2 p-3 mt-6 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                  <ShieldCheck size={16} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-theme-primary mb-1">
                      {t("admin.mcp.securityInfoTitle")}
                    </p>
                    <p className="text-xs text-theme-secondary">
                      {t("admin.mcp.securityInfoBody")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {mainTab === "tokens" && (
              <div>
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-theme-secondary">
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {t("admin.mcp.tokensStatsActive", { count: activeTokenCount })}
                    </span>
                    <span>{"·"}</span>
                    <span className="inline-flex items-center gap-1 text-amber-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {t("admin.mcp.tokensStatsExpired", { count: expiredTokenCount })}
                    </span>
                    <span>{"·"}</span>
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                      {t("admin.mcp.tokensStatsRevoked", { count: revokedTokenCount })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm((v) => !v);
                      setCreateError(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-cyan-600/50 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 transition-colors flex items-center gap-1.5"
                  >
                    <Plus size={13} />
                    {t("admin.mcp.newTokenButton")}
                  </button>
                </div>

                {justCreatedToken && (
                  <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-emerald-400">
                        {t("admin.mcp.tokenCreatedWarning", { name: justCreatedToken.name })}
                      </p>
                    </div>
                    <CodeBlock code={justCreatedToken.token} />
                    <button
                      type="button"
                      onClick={() => setJustCreatedToken(null)}
                      className="text-xs font-medium text-theme-secondary hover:text-theme-primary underline"
                    >
                      {t("admin.mcp.doneButton")}
                    </button>
                  </div>
                )}

                {showCreateForm && (
                  <div className="mb-4 p-3 bg-theme-secondary border border-theme rounded-lg space-y-3">
                    <div>
                      <label className="text-xs font-medium text-theme-secondary block mb-1">
                        {t("admin.mcp.formNameLabel")}
                      </label>
                      <input
                        type="text"
                        value={newTokenName}
                        onChange={(e) => setNewTokenName(e.target.value)}
                        placeholder={t("admin.mcp.formNamePlaceholder")}
                        maxLength={100}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-theme-primary border border-theme text-sm text-theme-primary"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-theme-secondary block mb-1">
                        {t("admin.mcp.formDurationLabel")}
                      </label>
                      <div className="flex gap-1.5 flex-wrap">
                        {DURATION_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setNewTokenDuration(preset)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                              newTokenDuration === preset
                                ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-400"
                                : "bg-theme-primary border-theme text-theme-secondary hover:bg-theme-tertiary"
                            }`}
                          >
                            {t(`admin.mcp.${DURATION_LABEL_KEYS[preset]}`)}
                          </button>
                        ))}
                      </div>
                      {newTokenDuration === "custom" && (
                        <input
                          type="number"
                          min={1}
                          max={3650}
                          value={newTokenCustomDays}
                          onChange={(e) => setNewTokenCustomDays(e.target.value)}
                          className="mt-2 w-28 px-2.5 py-1.5 rounded-lg bg-theme-primary border border-theme text-sm text-theme-primary"
                        />
                      )}
                    </div>
                    <p className="text-[11px] text-theme-secondary">
                      {t("admin.mcp.formAccessLevelHint")}
                    </p>
                    {createError && <p className="text-xs text-red-400">{createError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCreateToken}
                        disabled={isCreating}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                      >
                        {isCreating && <Loader2 size={12} className="animate-spin" />}
                        {t("admin.mcp.createButton")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-theme-secondary hover:text-theme-primary"
                      >
                        {t("admin.mcp.cancelButton")}
                      </button>
                    </div>
                  </div>
                )}

                {tokensLoading && (
                  <div className="flex items-center gap-2 text-theme-secondary py-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">{t("common.loading")}</span>
                  </div>
                )}

                {!tokensLoading && tokensError && (
                  <p className="text-xs text-amber-400 py-2">{tokensError}</p>
                )}

                {!tokensLoading && !tokensError && tokens.length === 0 && (
                  <p className="text-xs text-theme-secondary py-2">{t("admin.mcp.noTokensYet")}</p>
                )}

                {accessLevelError && (
                  <p className="text-xs text-red-400 py-1">{accessLevelError}</p>
                )}

                {!tokensLoading && !tokensError && tokens.length > 0 && (
                  <div className="space-y-2">
                    {tokens.map((tok) => {
                      const isExpanded = expandedTokenId === tok.id;
                      return (
                        <div
                          key={tok.id}
                          className="bg-theme-secondary border border-theme rounded-lg overflow-hidden"
                        >
                          <div
                            role={tok.status === "active" ? "button" : undefined}
                            tabIndex={tok.status === "active" ? 0 : undefined}
                            onClick={
                              tok.status === "active"
                                ? () => setExpandedTokenId(isExpanded ? null : tok.id)
                                : undefined
                            }
                            onKeyDown={
                              tok.status === "active"
                                ? (e) => {
                                    if (e.key !== "Enter" && e.key !== " ") return;
                                    e.preventDefault();
                                    setExpandedTokenId(isExpanded ? null : tok.id);
                                  }
                                : undefined
                            }
                            className={`flex items-center justify-between gap-3 p-2.5 transition-colors ${
                              tok.status === "active" ? "cursor-pointer hover:bg-theme-tertiary" : ""
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {tok.status === "active" &&
                                  (isExpanded ? (
                                    <ChevronDown
                                      size={14}
                                      className="text-theme-secondary flex-shrink-0"
                                    />
                                  ) : (
                                    <ChevronRight
                                      size={14}
                                      className="text-theme-secondary flex-shrink-0"
                                    />
                                  ))}
                                <span className="text-sm font-medium text-theme-primary truncate">
                                  {tok.name}
                                </span>
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                    tok.status === "active"
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : tok.status === "expired"
                                        ? "bg-amber-500/15 text-amber-400"
                                        : "bg-gray-500/15 text-gray-400"
                                  }`}
                                >
                                  {t(`admin.mcp.${STATUS_LABEL_KEYS[tok.status]}`)}
                                </span>
                                {tok.status === "active" ? (
                                  <select
                                    value={tok.accessLevel}
                                    disabled={accessLevelSavingId === tok.id}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      handleChangeAccessLevel(
                                        tok,
                                        e.target.value as McpTokenAccessLevel,
                                      )
                                    }
                                    className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 border bg-theme-primary disabled:opacity-50 ${
                                      tok.accessLevel === "read_only"
                                        ? "text-emerald-400 border-emerald-500/30"
                                        : "text-amber-400 border-amber-500/30"
                                    }`}
                                  >
                                    {ACCESS_LEVELS.map((level) => (
                                      <option key={level} value={level}>
                                        {t(`admin.mcp.${ACCESS_LEVEL_LABEL_KEYS[level]}`)}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-500/15 text-gray-400">
                                    {t(`admin.mcp.${ACCESS_LEVEL_LABEL_KEYS[tok.accessLevel]}`)}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-theme-secondary mt-0.5">
                                {t("admin.mcp.createdAt")}:{" "}
                                <strong className="font-semibold text-theme-primary">
                                  {formatDate(tok.createdAt)}
                                </strong>
                                {" · "}
                                {t("admin.mcp.lastUsedAt")}:{" "}
                                <strong className="font-semibold text-theme-primary">
                                  {formatDate(tok.lastUsedAt)}
                                </strong>
                                {" · "}
                                {t("admin.mcp.expiresAt")}:{" "}
                                <strong className="font-semibold text-theme-primary">
                                  {formatDate(tok.expiresAt)}
                                </strong>
                              </p>
                              {Object.keys(tok.categories).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {Object.entries(tok.categories).map(([category, catStatus]) => (
                                    <span
                                      key={category}
                                      title={t(
                                        `admin.mcp.${CATEGORY_STATUS_LABEL_KEYS[catStatus]}`,
                                      )}
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                                        catStatus === "full"
                                          ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-400"
                                          : catStatus === "partial"
                                            ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                                            : "bg-theme-primary border-theme text-theme-secondary"
                                      }`}
                                    >
                                      {t(
                                        `admin.mcp.${CATEGORY_LABEL_KEYS[category] ?? "capabilitiesCategoryOther"}`,
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {tok.status === "active" ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRevokeToken(tok);
                                }}
                                disabled={revokingId === tok.id}
                                title={t("admin.mcp.revokeButton")}
                                className="flex-shrink-0 p-2 rounded-lg text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                              >
                                {revokingId === tok.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePurgeToken(tok);
                                }}
                                disabled={purgingId === tok.id}
                                title={t("admin.mcp.purgeButton")}
                                className="flex-shrink-0 p-2 rounded-lg text-theme-secondary hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50 transition-colors"
                              >
                                {purgingId === tok.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            )}
                          </div>

                          {isExpanded && (
                            <div className="border-t border-theme p-3">
                              {tokenPermissionsLoading && (
                                <div className="flex items-center gap-2 text-theme-secondary py-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-sm">{t("common.loading")}</span>
                                </div>
                              )}

                              {!tokenPermissionsLoading && tokenPermissionsError && (
                                <p className="text-xs text-amber-400 py-2">
                                  {tokenPermissionsError}
                                </p>
                              )}

                              {!tokenPermissionsLoading &&
                                !tokenPermissionsError &&
                                tokenPermissions.length > 0 && (
                                  <div className="space-y-4">
                                    {Object.entries(tokenPermissionsByCategory).map(
                                      ([category, categoryTools]) => {
                                        const allEnabled = categoryTools.every(
                                          (tool) => tool.enabled,
                                        );
                                        const someEnabled = categoryTools.some(
                                          (tool) => tool.enabled,
                                        );
                                        const categorySaving =
                                          savingToolName === `category:${category}`;
                                        return (
                                          <div key={category}>
                                            <div className="flex items-center justify-between mb-2">
                                              <h5 className="text-xs font-semibold text-theme-primary uppercase tracking-wide">
                                                {t(
                                                  `admin.mcp.${CATEGORY_LABEL_KEYS[category] ?? "capabilitiesCategoryOther"}`,
                                                )}{" "}
                                                <span className="text-theme-secondary font-normal normal-case">
                                                  ({categoryTools.length})
                                                </span>
                                              </h5>
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-theme-secondary">
                                                  {someEnabled && !allEnabled
                                                    ? t("admin.mcp.categoryTogglePartial")
                                                    : allEnabled
                                                      ? t("admin.mcp.categoryToggleAll")
                                                      : t("admin.mcp.categoryToggleNone")}
                                                </span>
                                                <Toggle
                                                  checked={allEnabled}
                                                  onChange={() =>
                                                    handleToggleCategory(categoryTools)
                                                  }
                                                  disabled={categorySaving}
                                                  size="sm"
                                                />
                                              </div>
                                            </div>
                                            <div className="space-y-1.5">
                                              {categoryTools.map((tool) => (
                                                <div
                                                  key={tool.name}
                                                  className="flex items-start justify-between gap-3 p-2 bg-theme-primary border border-theme rounded-lg"
                                                >
                                                  <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                      <span className="text-sm text-theme-primary">
                                                        {tool.title}
                                                      </span>
                                                      <code className="text-[10px] text-theme-secondary bg-theme-secondary px-1.5 py-0.5 rounded">
                                                        {tool.name}
                                                      </code>
                                                      {tool.readOnly && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
                                                          {t("admin.mcp.capabilitiesReadOnly")}
                                                        </span>
                                                      )}
                                                      {tool.isOverride && (
                                                        <button
                                                          type="button"
                                                          onClick={() => handleResetTool(tool)}
                                                          disabled={
                                                            savingToolName === tool.name
                                                          }
                                                          title={t(
                                                            "admin.mcp.toolResetOverride",
                                                          )}
                                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
                                                        >
                                                          <RotateCcw size={10} />
                                                          {t("admin.mcp.toolOverrideBadge")}
                                                        </button>
                                                      )}
                                                    </div>
                                                    {tool.description && (
                                                      <p className="text-xs text-theme-secondary mt-0.5">
                                                        {tool.description}
                                                      </p>
                                                    )}
                                                  </div>
                                                  <Toggle
                                                    checked={tool.enabled}
                                                    onChange={(enabled) =>
                                                      handleToggleTool(tool, enabled)
                                                    }
                                                    disabled={savingToolName === tool.name}
                                                    size="sm"
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {mainTab === "setup" && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div>
                    <h5 className="text-sm font-medium text-theme-primary">
                      {t("admin.mcp.connectTitle")}
                    </h5>
                    <p className="text-xs text-theme-secondary mt-0.5">
                      {t("admin.mcp.connectIntro")}
                    </p>
                    {!status.hostIp && (
                      <p className="text-xs text-amber-400 mt-1">
                        {t("admin.mcp.hostIpHint")}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {CLIENT_TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setClientTab(tab)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          clientTab === tab
                            ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-400"
                            : "bg-theme-secondary border-theme text-theme-secondary hover:bg-theme-tertiary"
                        }`}
                      >
                        {t(`admin.mcp.${CLIENT_TAB_LABEL_KEYS[tab]}`)}
                      </button>
                    ))}
                  </div>

                  {clientTab === "claude-code" && (
                    <div className="space-y-3">
                      <CodeBlock
                        label={t("admin.mcp.claudeCodeCliLabel")}
                        code={`claude mcp add --transport http mynetwork http://${lanHost}/api/mcp \\\n  --header "Authorization: Bearer <token>"`}
                      />
                      <p className="text-xs text-theme-secondary">
                        {t("admin.mcp.claudeCodeConfigNote")}
                      </p>
                      <CodeBlock
                        label={t("admin.mcp.claudeCodeConfigLabel")}
                        code={`{\n  "mcpServers": {\n    "mynetwork": {\n      "type": "http",\n      "url": "http://${lanHost}/api/mcp",\n      "headers": { "Authorization": "Bearer <token>" }\n    }\n  }\n}`}
                      />
                    </div>
                  )}

                  {clientTab === "claude-desktop" && (
                    <div className="space-y-3">
                      <p className="text-xs text-theme-secondary">
                        {t("admin.mcp.claudeDesktopNote")}
                      </p>
                      <CodeBlock
                        label="claude_desktop_config.json"
                        code={`{\n  "mcpServers": {\n    "mynetwork": {\n      "command": "npx",\n      "args": [\n        "mcp-remote@latest",\n        "http://${lanHost}/api/mcp",\n        "--header",\n        "Authorization: Bearer <token>"\n      ]\n    }\n  }\n}`}
                      />
                    </div>
                  )}

                  {clientTab === "other" && (
                    <div className="space-y-3">
                      <p className="text-xs text-theme-secondary">
                        {t("admin.mcp.otherNote")}
                      </p>
                      <CodeBlock
                        code={`URL:     http://${lanHost}/api/mcp\nHeader:  Authorization: Bearer <token>`}
                      />
                    </div>
                  )}

                  <p className="text-xs text-theme-secondary">
                    {t("admin.mcp.getTokenHint")}{" "}
                    <button
                      type="button"
                      onClick={() => setMainTab("tokens")}
                      className="text-cyan-400 hover:text-cyan-300 underline font-medium"
                    >
                      {t("admin.mcp.tabTokens")}
                    </button>
                    .
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-theme">
                  <div>
                    <h5 className="text-sm font-medium text-theme-primary">
                      {t("admin.mcp.step1Title")}
                    </h5>
                    <p className="text-xs text-theme-secondary mt-0.5">
                      {t("admin.mcp.step1Intro")}
                    </p>
                  </div>
                  <CodeBlock
                    label={t("admin.mcp.dockerLabel")}
                    code="docker exec -it -u node mynetwork node_modules/.bin/tsx scripts/mcp-token.ts"
                  />
                  {status.configured ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle size={12} />
                      {t("admin.mcp.tokenAlreadySetHint")}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-400 flex items-center gap-1.5">
                      <AlertCircle size={12} />
                      {t("admin.mcp.tokenNotSetHint")}
                    </p>
                  )}
                  <p className="text-xs text-theme-secondary">
                    {t("admin.mcp.dockerNote")}{" "}
                    <strong className="font-semibold text-theme-primary">
                      {t("admin.mcp.dockerNoteRotate")}
                    </strong>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
};
