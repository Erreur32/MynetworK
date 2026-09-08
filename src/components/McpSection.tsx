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
  Copy,
  Check,
  Settings2,
} from "lucide-react";
import { Section, SettingRow } from "../pages/SettingsPage";
import { api } from "../api/client";
import { Toggle } from "./ui/Toggle";

interface McpStatus {
  enabled: boolean;
  runtimeEnabled: boolean;
  configured: boolean;
  endpoint: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  hostIp: string | null;
  dashboardPort: string;
  activeSessions: number;
}

type McpMainTab = "general" | "setup";
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

const MAIN_TABS: McpMainTab[] = ["general", "setup"];
const MAIN_TAB_LABEL_KEYS: Record<McpMainTab, string> = {
  general: "tabGeneral",
  setup: "tabSetup",
};

const CLIENT_TABS: ClientTab[] = ["claude-code", "claude-desktop", "other"];
const CLIENT_TAB_LABEL_KEYS: Record<ClientTab, string> = {
  "claude-code": "clientClaudeCode",
  "claude-desktop": "clientClaudeDesktop",
  other: "clientOther",
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
              {MAIN_TABS.map((tab) => (
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
                  {tab === "setup" && <Settings2 size={13} />}
                  {t(`admin.mcp.${MAIN_TAB_LABEL_KEYS[tab]}`)}
                </button>
              ))}
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
              </div>
            )}

            {mainTab === "setup" && (
              <div className="space-y-6">
                <div className="space-y-3">
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
                    code="docker exec -it -u node mynetwork npm run mcp:token"
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

                <div className="space-y-3">
                  <div>
                    <h5 className="text-sm font-medium text-theme-primary">
                      {t("admin.mcp.step2Title")}
                    </h5>
                    <p className="text-xs text-theme-secondary mt-0.5">
                      {t("admin.mcp.step2Intro")}
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
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
};
